from __future__ import annotations

import math
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    log_loss,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine


MODEL_VERSION = "3.26.0"
TRAINING_START_DATE = date(2024, 1, 1)
CHURN_DAYS = 60
MIN_TRAINING_ROWS = 300
MAX_RETURNED_CLIENTS = 500

BACKEND_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_DIR / "modelos"
MODEL_PATH = MODEL_DIR / "churn_score.joblib"

TRAINING_LOCK = threading.Lock()

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

CHURN_SCORE_EXCLUDED_COMPANY_IDS = tuple(
    dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 517101, 380371))
)

VALUE_EXPR = """
CASE
    WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
    ELSE ep.valor
END
"""

PLAN_EXPR = "REPLACE(REPLACE(ep.nome_plano, ' + recursos', ''), ' (+) recursos', '')"

BASE_PLAN_FILTER = """
    ep.plano_id <> 1
    AND ep.pago_em IS NOT NULL
    AND ep.status_pagamento = 1
    AND ep.nota_fiscal_servico_id IS NOT NULL
    AND ep.valor > 5
    AND ep.nome_plano NOT LIKE '%recursos%'
    AND e.modalidade IN ('ERP', 'NFE', 'FIS')
    AND e.id NOT IN :excluidos
"""

TRAINING_SQL = text(
    f"""
    WITH planos AS (
        SELECT
            ep.id AS plano_registro_id,
            ep.empresa_id,
            e.ativou_em,
            e.modalidade,
            CASE WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick' ELSE 'Parceiro' END AS origem,
            CASE
                WHEN e.tipo_cobranca = 'E' THEN 'Cliente'
                WHEN e.tipo_cobranca = 'P' THEN 'Parceiro'
                ELSE 'Não informado'
            END AS pagador,
            {PLAN_EXPR} AS nome_plano,
            ep.duracao,
            ep.pago_em,
            ep.data_vencimento,
            {VALUE_EXPR} AS valor,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS ciclo,
            LAG(ep.data_vencimento) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS vencimento_anterior,
            LAG({VALUE_EXPR}) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS valor_anterior,
            LAG({PLAN_EXPR}) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS plano_anterior,
            LAG(ep.duracao) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS duracao_anterior,
            LEAD(ep.pago_em) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS proximo_pagamento
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            {BASE_PLAN_FILTER}
    )
    SELECT
        plano_registro_id,
        empresa_id,
        modalidade,
        origem,
        pagador,
        nome_plano,
        duracao,
        data_vencimento,
        valor,
        GREATEST(TIMESTAMPDIFF(MONTH, ativou_em, data_vencimento), 0) AS tempo_vida_meses,
        GREATEST(ciclo - 1, 0) AS pagamentos_anteriores,
        CASE
            WHEN vencimento_anterior IS NULL THEN NULL
            ELSE TIMESTAMPDIFF(DAY, vencimento_anterior, pago_em)
        END AS atraso_ultima_renovacao,
        CASE
            WHEN valor_anterior IS NULL OR valor_anterior = 0 THEN 0
            ELSE (valor - valor_anterior) / ABS(valor_anterior)
        END AS variacao_valor_pct,
        GREATEST(TIMESTAMPDIFF(DAY, pago_em, data_vencimento), 0) AS dias_ciclo,
        CASE WHEN ciclo = 1 THEN 1 ELSE 0 END AS primeira_renovacao,
        CASE
            WHEN plano_anterior IS NULL OR plano_anterior = nome_plano THEN 0
            ELSE 1
        END AS mudou_plano,
        CASE
            WHEN duracao_anterior IS NULL OR duracao_anterior = duracao THEN 0
            ELSE 1
        END AS mudou_duracao,
        COALESCE(plano_anterior, 'Sem histórico') AS plano_anterior,
        COALESCE(duracao_anterior, 'Sem histórico') AS duracao_anterior,
        CASE
            WHEN proximo_pagamento IS NULL THEN 1
            WHEN TIMESTAMPDIFF(DAY, data_vencimento, proximo_pagamento) >= {CHURN_DAYS} THEN 1
            ELSE 0
        END AS target_churn
    FROM planos
    WHERE
        data_vencimento >= :data_inicio
        AND data_vencimento <= DATE_SUB(CURDATE(), INTERVAL {CHURN_DAYS} DAY)
    ORDER BY data_vencimento, empresa_id, plano_registro_id
    """
).bindparams(bindparam("excluidos", expanding=True))

LIVE_SQL = text(
    f"""
    WITH planos AS (
        SELECT
            ep.id AS plano_registro_id,
            ep.empresa_id,
            ep.atual,
            e.ativou_em,
            e.ultimo_acesso,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            CASE WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick' ELSE 'Parceiro' END AS origem,
            CASE
                WHEN e.tipo_cobranca = 'E' THEN 'Cliente'
                WHEN e.tipo_cobranca = 'P' THEN 'Parceiro'
                ELSE 'Não informado'
            END AS pagador,
            {PLAN_EXPR} AS nome_plano,
            ep.duracao,
            ep.pago_em,
            ep.data_vencimento,
            {VALUE_EXPR} AS valor,
            ep.nome_usuario,
            ep.telefone,
            ep.email,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS ciclo,
            LAG(ep.data_vencimento) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS vencimento_anterior,
            LAG({VALUE_EXPR}) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS valor_anterior,
            LAG({PLAN_EXPR}) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS plano_anterior,
            LAG(ep.duracao) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS duracao_anterior
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            {BASE_PLAN_FILTER}
    ),
    atuais AS (
        SELECT
            p.*,
            ROW_NUMBER() OVER (
                PARTITION BY p.empresa_id
                ORDER BY p.data_vencimento DESC, p.plano_registro_id DESC
            ) AS ordem_atual
        FROM planos p
        WHERE
            p.atual = 1
            AND p.data_vencimento >= CURDATE()
    )
    SELECT
        a.plano_registro_id,
        a.empresa_id,
        a.modalidade,
        a.empresa_indicacao_id,
        a.tipo_cobranca,
        a.origem,
        a.pagador,
        a.nome_plano,
        a.duracao,
        a.data_vencimento,
        a.valor,
        GREATEST(TIMESTAMPDIFF(MONTH, a.ativou_em, a.data_vencimento), 0) AS tempo_vida_meses,
        GREATEST(a.ciclo - 1, 0) AS pagamentos_anteriores,
        CASE
            WHEN a.vencimento_anterior IS NULL THEN NULL
            ELSE TIMESTAMPDIFF(DAY, a.vencimento_anterior, a.pago_em)
        END AS atraso_ultima_renovacao,
        CASE
            WHEN a.valor_anterior IS NULL OR a.valor_anterior = 0 THEN 0
            ELSE (a.valor - a.valor_anterior) / ABS(a.valor_anterior)
        END AS variacao_valor_pct,
        GREATEST(TIMESTAMPDIFF(DAY, a.pago_em, a.data_vencimento), 0) AS dias_ciclo,
        CASE WHEN a.ciclo = 1 THEN 1 ELSE 0 END AS primeira_renovacao,
        CASE
            WHEN a.plano_anterior IS NULL OR a.plano_anterior = a.nome_plano THEN 0
            ELSE 1
        END AS mudou_plano,
        CASE
            WHEN a.duracao_anterior IS NULL OR a.duracao_anterior = a.duracao THEN 0
            ELSE 1
        END AS mudou_duracao,
        COALESCE(a.plano_anterior, 'Sem histórico') AS plano_anterior,
        COALESCE(a.duracao_anterior, 'Sem histórico') AS duracao_anterior,
        a.ultimo_acesso,
        CASE
            WHEN a.ultimo_acesso IS NULL THEN NULL
            ELSE TIMESTAMPDIFF(DAY, a.data_vencimento, a.ultimo_acesso)
        END AS ultimo_acesso_vencimento,
        CASE
            WHEN a.ultimo_acesso IS NULL THEN NULL
            ELSE GREATEST(TIMESTAMPDIFF(DAY, a.ultimo_acesso, NOW()), 0)
        END AS dias_sem_acesso,
        GREATEST(TIMESTAMPDIFF(DAY, CURDATE(), a.data_vencimento), 0) AS dias_ate_vencimento,
        a.nome_usuario,
        a.telefone,
        a.email
    FROM atuais a
    WHERE
        a.ordem_atual = 1
        AND (
            :empresa = 'todos'
            OR (:empresa = 'gestaoclick' AND a.modalidade = 'ERP')
            OR (:empresa = 'clicknotas' AND a.modalidade IN ('NFE', 'FIS'))
        )
        AND (
            :origem = 'todos'
            OR (:origem = 'gestaoclick' AND a.empresa_indicacao_id = 1)
            OR (:origem = 'parceiro' AND a.empresa_indicacao_id <> 1)
        )
        AND (
            :pagador = 'todos'
            OR (:pagador = 'cliente' AND a.tipo_cobranca = 'E')
            OR (:pagador = 'parceiro' AND a.tipo_cobranca = 'P')
        )
    ORDER BY a.data_vencimento, a.empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))

CATEGORICAL_FEATURES = [
    "modalidade",
    "origem",
    "pagador",
    "nome_plano",
    "duracao",
    "plano_anterior",
    "duracao_anterior",
]

NUMERIC_FEATURES = [
    "valor",
    "tempo_vida_meses",
    "pagamentos_anteriores",
    "atraso_ultima_renovacao",
    "variacao_valor_pct",
    "dias_ciclo",
    "primeira_renovacao",
    "mudou_plano",
    "mudou_duracao",
]

MODEL_FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES


def _validate_filters(empresa: str, origem: str, pagador: str) -> None:
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()

    for column in CATEGORICAL_FEATURES:
        if column not in result.columns:
            result[column] = "Não informado"
        result[column] = result[column].fillna("Não informado").astype(str)

    for column in NUMERIC_FEATURES:
        if column not in result.columns:
            result[column] = np.nan
        result[column] = pd.to_numeric(result[column], errors="coerce")

    result["valor"] = result["valor"].clip(lower=0)
    result["tempo_vida_meses"] = result["tempo_vida_meses"].clip(lower=0, upper=240)
    result["pagamentos_anteriores"] = result["pagamentos_anteriores"].clip(lower=0, upper=300)
    result["atraso_ultima_renovacao"] = result["atraso_ultima_renovacao"].clip(lower=-180, upper=365)
    result["variacao_valor_pct"] = result["variacao_valor_pct"].clip(lower=-1, upper=10)
    result["dias_ciclo"] = result["dias_ciclo"].clip(lower=1, upper=730)

    return result[MODEL_FEATURES]


def _make_pipeline(estimator: Any) -> Pipeline:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler(with_mean=False)),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(
                    handle_unknown="ignore",
                    min_frequency=5,
                    sparse_output=True,
                ),
            ),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, NUMERIC_FEATURES),
            ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
        ],
        sparse_threshold=1.0,
    )
    return Pipeline(steps=[("preprocessor", preprocessor), ("model", estimator)])


def _candidate_models() -> dict[str, Pipeline]:
    return {
        "Regressão Logística": _make_pipeline(
            LogisticRegression(
                max_iter=2000,
                class_weight="balanced",
                C=0.7,
                solver="liblinear",
                random_state=42,
            )
        ),
        "Random Forest": _make_pipeline(
            RandomForestClassifier(
                n_estimators=220,
                max_depth=14,
                min_samples_leaf=10,
                class_weight="balanced_subsample",
                n_jobs=-1,
                random_state=42,
            )
        ),
        "Extra Trees": _make_pipeline(
            ExtraTreesClassifier(
                n_estimators=220,
                max_depth=16,
                min_samples_leaf=8,
                class_weight="balanced",
                n_jobs=-1,
                random_state=42,
            )
        ),
    }


def _split_temporal(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    ordered = df.sort_values(["data_vencimento", "empresa_id", "plano_registro_id"]).reset_index(drop=True)
    dates = pd.Series(ordered["data_vencimento"].dropna().unique()).sort_values().tolist()

    if len(dates) < 12:
        raise ValueError("Há poucas datas históricas para uma validação temporal confiável.")

    train_date = dates[max(1, int(len(dates) * 0.70))]
    val_date = dates[max(2, int(len(dates) * 0.85))]

    train = ordered[ordered["data_vencimento"] < train_date].copy()
    validation = ordered[
        (ordered["data_vencimento"] >= train_date) & (ordered["data_vencimento"] < val_date)
    ].copy()
    test = ordered[ordered["data_vencimento"] >= val_date].copy()

    for name, frame in (("treino", train), ("validação", validation), ("teste", test)):
        if frame.empty:
            raise ValueError(f"A divisão temporal gerou um conjunto de {name} vazio.")
        if frame["target_churn"].nunique() < 2:
            raise ValueError(f"O conjunto de {name} precisa conter churn e renovação.")

    return train, validation, test


def _optimal_threshold(y_true: pd.Series, probabilities: np.ndarray) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, probabilities)
    if thresholds.size == 0:
        return 0.5
    p = precision[:-1]
    r = recall[:-1]
    f1 = np.divide(2 * p * r, p + r, out=np.zeros_like(p), where=(p + r) > 0)
    index = int(np.nanargmax(f1)) if f1.size else 0
    return float(np.clip(thresholds[index], 0.05, 0.95))


def _safe_auc(y_true: pd.Series, probabilities: np.ndarray) -> float | None:
    if pd.Series(y_true).nunique() < 2:
        return None
    return float(roc_auc_score(y_true, probabilities))


def _ranking_metrics(y_true: pd.Series, probabilities: np.ndarray, top_fraction: float = 0.10) -> tuple[float, float]:
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probabilities, dtype=float)
    if y.size == 0:
        return 0.0, 0.0
    k = max(1, int(math.ceil(y.size * top_fraction)))
    order = np.argsort(-p)
    top = y[order[:k]]
    base_rate = float(y.mean())
    top_rate = float(top.mean()) if top.size else 0.0
    lift = top_rate / base_rate if base_rate > 0 else 0.0
    capture = float(top.sum() / y.sum()) if y.sum() > 0 else 0.0
    return lift, capture


def _metrics(y_true: pd.Series, probabilities: np.ndarray, threshold: float) -> dict[str, float | None]:
    predicted = (probabilities >= threshold).astype(int)
    lift10, capture10 = _ranking_metrics(y_true, probabilities, 0.10)
    return {
        "roc_auc": round(_safe_auc(y_true, probabilities), 4) if _safe_auc(y_true, probabilities) is not None else None,
        "pr_auc": round(float(average_precision_score(y_true, probabilities)), 4),
        "brier": round(float(brier_score_loss(y_true, probabilities)), 4),
        "log_loss": round(float(log_loss(y_true, probabilities, labels=[0, 1])), 4),
        "accuracy": round(float(accuracy_score(y_true, predicted)), 4),
        "precision": round(float(precision_score(y_true, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, predicted, zero_division=0)), 4),
        "lift_10": round(float(lift10), 4),
        "captura_churn_10": round(float(capture10), 4),
        "threshold": round(float(threshold), 4),
    }


def _selection_key(metrics: dict[str, float | None]) -> tuple[float, float, float]:
    return (
        float(metrics.get("pr_auc") or -1),
        float(metrics.get("roc_auc") or -1),
        -float(metrics.get("brier") if metrics.get("brier") is not None else 999),
    )


def _period_payload(frame: pd.DataFrame) -> dict[str, Any]:
    start = pd.to_datetime(frame["data_vencimento"]).min()
    end = pd.to_datetime(frame["data_vencimento"]).max()
    return {
        "inicio": start.date().isoformat(),
        "fim": end.date().isoformat(),
        "linhas": int(len(frame)),
        "churns": int(frame["target_churn"].sum()),
        "taxa_churn": round(float(frame["target_churn"].mean()), 4),
    }


def _feature_importance(model: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> list[dict[str, Any]]:
    if len(X_test) > 5000:
        sample = X_test.sample(5000, random_state=42)
        y_sample = y_test.loc[sample.index]
    else:
        sample = X_test
        y_sample = y_test

    try:
        result = permutation_importance(
            model,
            sample,
            y_sample,
            scoring="average_precision",
            n_repeats=3,
            random_state=42,
            n_jobs=-1,
        )
    except Exception:
        return []

    rows = [
        {"feature": feature, "importance": float(importance)}
        for feature, importance in zip(MODEL_FEATURES, result.importances_mean)
    ]
    rows.sort(key=lambda item: item["importance"], reverse=True)
    return [
        {"feature": row["feature"], "importance": round(row["importance"], 6)}
        for row in rows[:10]
        if row["importance"] > 0
    ]


def train_churn_score_model() -> dict[str, Any]:
    with TRAINING_LOCK:
        params = {
            "data_inicio": TRAINING_START_DATE,
            "excluidos": CHURN_SCORE_EXCLUDED_COMPANY_IDS,
        }
        with source_engine.connect() as connection:
            df = pd.read_sql_query(TRAINING_SQL, connection, params=params)

        if len(df) < MIN_TRAINING_ROWS:
            raise ValueError(
                f"A base histórica retornou apenas {len(df)} linhas; são necessárias pelo menos {MIN_TRAINING_ROWS}."
            )

        df["data_vencimento"] = pd.to_datetime(df["data_vencimento"], errors="coerce")
        df = df.dropna(subset=["data_vencimento", "target_churn"]).copy()
        df["target_churn"] = pd.to_numeric(df["target_churn"], errors="coerce").fillna(0).astype(int)
        df = df[df["target_churn"].isin([0, 1])].copy()

        if df["target_churn"].nunique() < 2:
            raise ValueError("A base histórica precisa conter exemplos de churn e de renovação.")

        train_df, validation_df, test_df = _split_temporal(df)

        X_train = _prepare_features(train_df)
        y_train = train_df["target_churn"]
        X_validation = _prepare_features(validation_df)
        y_validation = validation_df["target_churn"]
        X_test = _prepare_features(test_df)
        y_test = test_df["target_churn"]

        candidates = _candidate_models()
        validation_results: dict[str, dict[str, float | None]] = {}
        fitted_models: dict[str, Pipeline] = {}
        thresholds: dict[str, float] = {}

        for model_name, candidate in candidates.items():
            fitted = clone(candidate)
            fitted.fit(X_train, y_train)
            probabilities = fitted.predict_proba(X_validation)[:, 1]
            threshold = _optimal_threshold(y_validation, probabilities)
            validation_results[model_name] = _metrics(y_validation, probabilities, threshold)
            fitted_models[model_name] = fitted
            thresholds[model_name] = threshold

        selected_name = max(validation_results, key=lambda name: _selection_key(validation_results[name]))
        selected_model = fitted_models[selected_name]
        selected_threshold = thresholds[selected_name]

        test_probabilities = selected_model.predict_proba(X_test)[:, 1]
        test_metrics = _metrics(y_test, test_probabilities, selected_threshold)
        importances = _feature_importance(selected_model, X_test, y_test)

        train_validation = pd.concat([train_df, validation_df], ignore_index=True)
        X_train_validation = _prepare_features(train_validation)
        y_train_validation = train_validation["target_churn"]
        final_model = clone(candidates[selected_name])
        final_model.fit(X_train_validation, y_train_validation)

        trained_at = datetime.now().astimezone().isoformat(timespec="seconds")
        artifact = {
            "version": MODEL_VERSION,
            "trained_at": trained_at,
            "model_name": selected_name,
            "pipeline": final_model,
            "threshold": float(selected_threshold),
            "features": MODEL_FEATURES,
            "categorical_features": CATEGORICAL_FEATURES,
            "numeric_features": NUMERIC_FEATURES,
            "validation_results": validation_results,
            "test_metrics": test_metrics,
            "feature_importance": importances,
            "periods": {
                "treino": _period_payload(train_df),
                "validacao": _period_payload(validation_df),
                "teste": _period_payload(test_df),
            },
            "dataset": {
                "linhas": int(len(df)),
                "churns": int(df["target_churn"].sum()),
                "renovacoes": int((df["target_churn"] == 0).sum()),
                "taxa_churn": round(float(df["target_churn"].mean()), 4),
            },
            "notes": [
                "Validação temporal: o modelo nunca é testado em períodos anteriores ao treino.",
                "Dias vencidos não é usado como variável preditora.",
                "Último acesso atual não entra no treino histórico para evitar vazamento temporal; ele entra como ajuste comportamental transparente no score final.",
            ],
        }

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(artifact, MODEL_PATH)

        return _metadata_from_artifact(artifact)


def _load_artifact() -> dict[str, Any] | None:
    if not MODEL_PATH.exists():
        return None
    artifact = joblib.load(MODEL_PATH)
    if not isinstance(artifact, dict) or artifact.get("version") != MODEL_VERSION:
        return None
    return artifact


def _metadata_from_artifact(artifact: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "treinado",
        "version": artifact.get("version"),
        "trained_at": artifact.get("trained_at"),
        "model_name": artifact.get("model_name"),
        "threshold": round(float(artifact.get("threshold") or 0.5), 4),
        "validation_results": artifact.get("validation_results") or {},
        "test_metrics": artifact.get("test_metrics") or {},
        "feature_importance": artifact.get("feature_importance") or [],
        "periods": artifact.get("periods") or {},
        "dataset": artifact.get("dataset") or {},
        "notes": artifact.get("notes") or [],
    }


def get_churn_score_meta() -> dict[str, Any]:
    artifact = _load_artifact()
    if artifact is None:
        return {
            "status": "nao_treinado",
            "version": MODEL_VERSION,
            "message": "O modelo ainda não foi treinado nesta máquina.",
        }
    return _metadata_from_artifact(artifact)


def _access_adjustment(row: pd.Series) -> tuple[float, list[str]]:
    adjustment = 0.0
    signals: list[str] = []

    days_without_access = row.get("dias_sem_acesso")
    days_to_due = int(row.get("dias_ate_vencimento") or 0)
    access_vs_due = row.get("ultimo_acesso_vencimento")

    if pd.isna(days_without_access):
        adjustment += 8.0
        signals.append("Sem registro recente de acesso")
    else:
        days_without_access = int(days_without_access)
        if days_without_access >= 60:
            adjustment += 10.0
            signals.append(f"Sem acesso há {days_without_access} dias")
        elif days_without_access >= 30:
            adjustment += 7.0
            signals.append(f"Sem acesso há {days_without_access} dias")
        elif days_without_access >= 14:
            adjustment += 3.0
            signals.append(f"Acesso há {days_without_access} dias")
        elif days_without_access <= 3:
            adjustment -= 2.0
            signals.append("Acesso muito recente")

    if days_to_due <= 30 and not pd.isna(access_vs_due):
        access_vs_due = int(access_vs_due)
        if access_vs_due <= -30:
            adjustment += 4.0
            signals.append("Chega ao vencimento com pouco uso recente")
        elif access_vs_due >= -7:
            adjustment -= 2.0
            signals.append("Uso recente próximo ao vencimento")

    previous_delay = row.get("atraso_ultima_renovacao")
    if not pd.isna(previous_delay):
        previous_delay = int(previous_delay)
        if previous_delay >= 30:
            signals.append(f"Última renovação atrasou {previous_delay} dias")
        elif previous_delay >= 10:
            signals.append(f"Última renovação atrasou {previous_delay} dias")

    if int(row.get("primeira_renovacao") or 0) == 1:
        signals.append("Primeira renovação")

    if not signals:
        signals.append("Sem sinal comportamental forte")

    return adjustment, signals[:4]


def _risk_band(score: int) -> str:
    if score >= 80:
        return "Muito alto"
    if score >= 60:
        return "Alto"
    if score >= 40:
        return "Moderado"
    return "Baixo"


def _serialize_timestamp(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def get_churn_score_dashboard(
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict[str, Any]:
    _validate_filters(empresa, origem, pagador)
    artifact = _load_artifact()
    if artifact is None:
        raise RuntimeError("MODEL_NOT_TRAINED")

    params = {
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": CHURN_SCORE_EXCLUDED_COMPANY_IDS,
    }
    with source_engine.connect() as connection:
        df = pd.read_sql_query(LIVE_SQL, connection, params=params)

    if df.empty:
        return {
            "model": _metadata_from_artifact(artifact),
            "filtros": {"empresa": empresa, "origem": origem, "pagador": pagador},
            "resumo": {
                "clientes": 0,
                "score_medio": 0.0,
                "alto_risco": 0,
                "muito_alto_risco": 0,
                "valor_total": 0.0,
                "valor_ponderado_risco": 0.0,
            },
            "faixas": [],
            "clientes": [],
        }

    X_live = _prepare_features(df)
    probabilities = artifact["pipeline"].predict_proba(X_live)[:, 1]

    clients: list[dict[str, Any]] = []
    for position, (_, row) in enumerate(df.iterrows()):
        ml_score = float(probabilities[position] * 100.0)
        adjustment, signals = _access_adjustment(row)
        final_score = int(np.clip(round(ml_score + adjustment), 1, 100))
        company_id = int(row["empresa_id"])
        value = float(row.get("valor") or 0)
        due_date = row.get("data_vencimento")
        if isinstance(due_date, pd.Timestamp):
            due_date = due_date.date()

        clients.append(
            {
                "empresa_id": company_id,
                "cliente": f"Cliente #{company_id}",
                "intranet_url": f"https://intranet.clickdigital.com.br/clientes/visualizar/{company_id}?aba=5",
                "modalidade": str(row.get("modalidade") or ""),
                "origem": str(row.get("origem") or "Não informado"),
                "pagador": str(row.get("pagador") or "Não informado"),
                "nome_plano": str(row.get("nome_plano") or "Não informado"),
                "duracao": str(row.get("duracao") or ""),
                "data_vencimento": due_date.isoformat() if due_date else None,
                "dias_ate_vencimento": int(row.get("dias_ate_vencimento") or 0),
                "valor": round(value, 2),
                "tempo_vida_meses": int(row.get("tempo_vida_meses") or 0),
                "pagamentos_anteriores": int(row.get("pagamentos_anteriores") or 0),
                "atraso_ultima_renovacao": (
                    int(row.get("atraso_ultima_renovacao"))
                    if not pd.isna(row.get("atraso_ultima_renovacao"))
                    else None
                ),
                "ultimo_acesso": _serialize_timestamp(row.get("ultimo_acesso")),
                "ultimo_acesso_vencimento": (
                    int(row.get("ultimo_acesso_vencimento"))
                    if not pd.isna(row.get("ultimo_acesso_vencimento"))
                    else None
                ),
                "dias_sem_acesso": (
                    int(row.get("dias_sem_acesso"))
                    if not pd.isna(row.get("dias_sem_acesso"))
                    else None
                ),
                "probabilidade_ml": round(ml_score, 1),
                "ajuste_acesso": round(adjustment, 1),
                "score": final_score,
                "faixa_risco": _risk_band(final_score),
                "sinais": signals,
            }
        )

    clients.sort(key=lambda item: (-item["score"], item["data_vencimento"] or "9999-12-31", -item["valor"]))

    bands = [
        ("Muito alto", 80, 100),
        ("Alto", 60, 79),
        ("Moderado", 40, 59),
        ("Baixo", 1, 39),
    ]
    band_payload = []
    for label, low, high in bands:
        filtered = [item for item in clients if low <= item["score"] <= high]
        band_payload.append(
            {
                "label": label,
                "min": low,
                "max": high,
                "clientes": len(filtered),
                "valor": round(sum(item["valor"] for item in filtered), 2),
            }
        )

    total_value = sum(item["valor"] for item in clients)
    weighted_value = sum(item["valor"] * item["score"] / 100.0 for item in clients)
    score_average = float(np.mean([item["score"] for item in clients])) if clients else 0.0

    return {
        "model": _metadata_from_artifact(artifact),
        "filtros": {"empresa": empresa, "origem": origem, "pagador": pagador},
        "resumo": {
            "clientes": len(clients),
            "score_medio": round(score_average, 1),
            "alto_risco": sum(1 for item in clients if item["score"] >= 60),
            "muito_alto_risco": sum(1 for item in clients if item["score"] >= 80),
            "valor_total": round(total_value, 2),
            "valor_ponderado_risco": round(weighted_value, 2),
        },
        "faixas": band_payload,
        "clientes": clients[:MAX_RETURNED_CLIENTS],
        "clientes_retornados": min(len(clients), MAX_RETURNED_CLIENTS),
        "regra_score": (
            "Score final = risco previsto pelo modelo histórico + ajuste comportamental de acesso. "
            "O último acesso não é usado no treino histórico porque não existe snapshot histórico desse campo; "
            "usá-lo diretamente no treino causaria vazamento temporal."
        ),
    }
