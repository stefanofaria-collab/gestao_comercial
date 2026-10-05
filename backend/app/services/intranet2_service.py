from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine, supabase_engine
from app.repositories.perfil_supabase_repository import get_business_profile as get_business_profile_from_db
from app.services.dashboard_cache_service import get_snapshot
from app.services.payment_metrics_service import get_payment_metric, get_payment_metrics


INTRANET_EXCLUDED_COMPANY_IDS = tuple(
    dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 517101))
)

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}
VALID_ACTIVE_FILTERS = {"todos", "sim", "nao"}
VALID_TENURE_UNITS = {"mes", "ano"}


BASE_FILTER_SQL = """
    ep.plano_id <> 1
    AND ep.data_vencimento >= '2024-01-01'
    AND ep.atual = 1
    AND ep.nota_fiscal_servico_id IS NOT NULL
    AND e.id NOT IN :excluidos
    AND (:razao_social = '' OR LOWER(COALESCE(ep.razao_social, '')) LIKE CONCAT('%', LOWER(:razao_social), '%'))
    AND (:email = '' OR LOWER(COALESCE(ep.email, '')) LIKE CONCAT('%', LOWER(:email), '%'))
    AND (
        :telefone = ''
        OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(ep.telefone, ''), '(', ''), ')', ''), '-', ''), ' ', ''), '+', '')
           LIKE CONCAT('%', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(:telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', ''), '%')
        OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lc.celular, ''), '(', ''), ')', ''), '-', ''), ' ', ''), '+', '')
           LIKE CONCAT('%', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(:telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', ''), '%')
    )
    AND (:estado = '' OR COALESCE(ep.estado, '') = :estado)
    AND (:cidade = '' OR LOWER(COALESCE(ep.nome_cidade, '')) = LOWER(:cidade))
    AND (:ultimo_acesso_de IS NULL OR e.ultimo_acesso >= :ultimo_acesso_de)
    AND (:ultimo_acesso_ate IS NULL OR e.ultimo_acesso < DATE_ADD(:ultimo_acesso_ate, INTERVAL 1 DAY))
    AND (:sem_acesso_min IS NULL OR (e.ultimo_acesso IS NOT NULL AND DATEDIFF(CURDATE(), e.ultimo_acesso) >= :sem_acesso_min))
    AND (:sem_acesso_max IS NULL OR (e.ultimo_acesso IS NOT NULL AND DATEDIFF(CURDATE(), e.ultimo_acesso) <= :sem_acesso_max))
    AND (:vencimento_de IS NULL OR ep.data_vencimento >= :vencimento_de)
    AND (:vencimento_ate IS NULL OR ep.data_vencimento < DATE_ADD(:vencimento_ate, INTERVAL 1 DAY))
    AND (:pagamento_de IS NULL OR ep.pago_em >= :pagamento_de)
    AND (:pagamento_ate IS NULL OR ep.pago_em < DATE_ADD(:pagamento_ate, INTERVAL 1 DAY))
    AND (:plano = '' OR REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = :plano)
    AND (:duracao = '' OR ep.duracao = :duracao)
    AND (
        :empresa = 'todos'
        OR (:empresa = 'gestaoclick' AND e.modalidade = 'ERP')
        OR (:empresa = 'clicknotas' AND e.modalidade IN ('NFE', 'FIS'))
    )
    AND (
        :origem = 'todos'
        OR (:origem = 'gestaoclick' AND e.empresa_indicacao_id = 1)
        OR (:origem = 'parceiro' AND e.empresa_indicacao_id <> 1)
    )
    AND (
        :pagador = 'todos'
        OR (:pagador = 'cliente' AND e.tipo_cobranca = 'E')
        OR (:pagador = 'parceiro' AND e.tipo_cobranca = 'P')
    )
    AND (
        :somente_ativos = 'todos'
        OR (:somente_ativos = 'sim' AND ep.data_vencimento >= CURDATE() AND ep.pago_em IS NOT NULL)
        OR (:somente_ativos = 'nao' AND (ep.data_vencimento < CURDATE() OR ep.pago_em IS NULL))
    )
    AND (
        :valor_minimo <= 0
        OR (CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END) >= :valor_minimo
    )
    AND (
        :tempo_cliente_min_meses IS NULL
        OR GREATEST(TIMESTAMPDIFF(MONTH, e.ativou_em, ep.data_vencimento), 0) >= :tempo_cliente_min_meses
    )
    AND (
        :tempo_cliente_max_meses IS NULL
        OR GREATEST(TIMESTAMPDIFF(MONTH, e.ativou_em, ep.data_vencimento), 0) <= :tempo_cliente_max_meses
    )
"""


SEARCH_SQL = text(
    f"""
    WITH loja_contato AS (
        SELECT empresa_id, MAX(celular) AS celular
        FROM lojas
        GROUP BY empresa_id
    ),
    base AS (
        SELECT
            e.id AS empresa_id,
            ep.id AS plano_registro_id,
            ep.cpf_cnpj,
            ep.razao_social,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            CASE WHEN e.modalidade = 'ERP' THEN 'GestãoClick' ELSE 'ClickNotas' END AS empresa,
            CASE WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick' ELSE 'Parceiro' END AS origem,
            CASE
                WHEN e.tipo_cobranca = 'E' THEN 'Cliente'
                WHEN e.tipo_cobranca = 'P' THEN 'Parceiro'
                ELSE 'Não informado'
            END AS pagador,
            ep.estado,
            ep.nome_cidade,
            e.ativou_em,
            e.ultimo_acesso,
            CASE
                WHEN e.ultimo_acesso IS NULL THEN NULL
                ELSE GREATEST(DATEDIFF(CURDATE(), e.ultimo_acesso), 0)
            END AS dias_sem_acesso,
            TIMESTAMPDIFF(DAY, ep.data_vencimento, e.ultimo_acesso) AS ultimo_acesso_vencimento,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            ep.duracao,
            CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor,
            ep.data_vencimento,
            ep.pago_em,
            DATEDIFF(CURDATE(), ep.data_vencimento) AS dias_vencido,
            GREATEST(TIMESTAMPDIFF(MONTH, e.ativou_em, ep.data_vencimento), 0) AS tempo_vida,
            ep.nome_usuario,
            ep.telefone,
            lc.celular,
            ep.email,
            CASE WHEN ep.data_vencimento >= CURDATE() AND ep.pago_em IS NOT NULL THEN 1 ELSE 0 END AS ativo,
            ROW_NUMBER() OVER (
                PARTITION BY e.id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        LEFT JOIN loja_contato lc ON e.id = lc.empresa_id
        WHERE {BASE_FILTER_SQL}
    )
    SELECT *
    FROM base
    WHERE ordem = 1
    ORDER BY data_vencimento ASC, empresa_id ASC
    """
).bindparams(bindparam("excluidos", expanding=True))


OPTIONS_SQL = text(
    """
    WITH loja_contato AS (
        SELECT empresa_id, MAX(celular) AS celular
        FROM lojas
        GROUP BY empresa_id
    )
    SELECT DISTINCT
        COALESCE(ep.estado, '') AS estado,
        COALESCE(ep.nome_cidade, '') AS cidade,
        REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
        COALESCE(ep.duracao, '') AS duracao
    FROM empresas_planos ep
    JOIN empresas e ON ep.empresa_id = e.id
    LEFT JOIN loja_contato lc ON e.id = lc.empresa_id
    WHERE
        ep.plano_id <> 1
        AND ep.atual = 1
        AND ep.data_vencimento >= '2024-01-01'
        AND ep.nota_fiscal_servico_id IS NOT NULL
        AND e.id NOT IN :excluidos
    ORDER BY estado, cidade, nome_plano, duracao
    """
).bindparams(bindparam("excluidos", expanding=True))


COMPANY_SQL = text("SELECT * FROM empresas WHERE id = :empresa_id")
PLANS_SQL = text(
    """
    SELECT *
    FROM empresas_planos
    WHERE empresa_id = :empresa_id
    ORDER BY COALESCE(pago_em, '1900-01-01'), id
    """
)
STORES_SQL = text(
    """
    SELECT *
    FROM lojas
    WHERE empresa_id = :empresa_id
    ORDER BY id
    """
)
QUESTIONNAIRES_SQL = text(
    """
    SELECT *
    FROM empresas_questionarios
    WHERE empresa_id = :empresa_id
    ORDER BY id
    """
)
SUPPORT_SQL = text(
    """
    SELECT *
    FROM public.atendimentos_zendesk
    WHERE empresa_id = :empresa_id
    ORDER BY data DESC, id DESC
    """
)
SUPPORT_CONTEXT_SQL = text(
    """
    SELECT c.*
    FROM public.atendimentos_zendesk_contexto c
    JOIN public.atendimentos_zendesk z ON z.id = c.atendimento_id
    WHERE z.empresa_id = :empresa_id
    ORDER BY z.data DESC, z.id DESC
    """
)


def _validate_filters(filters: dict[str, Any]) -> None:
    if filters["empresa"] not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if filters["origem"] not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if filters["pagador"] not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")
    if filters["somente_ativos"] not in VALID_ACTIVE_FILTERS:
        raise ValueError("Filtro de clientes ativos inválido.")
    if filters["tempo_cliente_unidade"] not in VALID_TENURE_UNITS:
        raise ValueError("Unidade de tempo como cliente inválida.")


def _date_or_none(value: str | date | datetime | None) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def normalize_filters(**kwargs: Any) -> dict[str, Any]:
    result = {
        "razao_social": str(kwargs.get("razao_social") or "").strip(),
        "email": str(kwargs.get("email") or "").strip(),
        "telefone": str(kwargs.get("telefone") or "").strip(),
        "estado": str(kwargs.get("estado") or "").strip(),
        "cidade": str(kwargs.get("cidade") or "").strip(),
        "ultimo_acesso_de": _date_or_none(kwargs.get("ultimo_acesso_de")),
        "ultimo_acesso_ate": _date_or_none(kwargs.get("ultimo_acesso_ate")),
        "sem_acesso_min": kwargs.get("sem_acesso_min"),
        "sem_acesso_max": kwargs.get("sem_acesso_max"),
        "vencimento_de": _date_or_none(kwargs.get("vencimento_de")),
        "vencimento_ate": _date_or_none(kwargs.get("vencimento_ate")),
        "pagamento_de": _date_or_none(kwargs.get("pagamento_de")),
        "pagamento_ate": _date_or_none(kwargs.get("pagamento_ate")),
        "plano": str(kwargs.get("plano") or "").strip(),
        "duracao": str(kwargs.get("duracao") or "").strip(),
        "empresa": str(kwargs.get("empresa") or "todos").strip(),
        "origem": str(kwargs.get("origem") or "todos").strip(),
        "pagador": str(kwargs.get("pagador") or "todos").strip(),
        "somente_ativos": str(kwargs.get("somente_ativos") or "todos").strip(),
        "valor_minimo": max(float(kwargs.get("valor_minimo") or 0), 0.0),
        "tempo_cliente_minimo": kwargs.get("tempo_cliente_minimo"),
        "tempo_cliente_maximo": kwargs.get("tempo_cliente_maximo"),
        "tempo_cliente_unidade": str(kwargs.get("tempo_cliente_unidade") or "mes").strip(),
        "somente_ultrapassou_media": bool(kwargs.get("somente_ultrapassou_media") or False),
    }

    for key in ("sem_acesso_min", "sem_acesso_max"):
        if result[key] is not None:
            result[key] = max(int(result[key]), 0)

    for key in ("tempo_cliente_minimo", "tempo_cliente_maximo"):
        if result[key] is not None:
            result[key] = max(float(result[key]), 0.0)

    _validate_filters(result)
    multiplier = 12.0 if result["tempo_cliente_unidade"] == "ano" else 1.0
    result["tempo_cliente_min_meses"] = (
        result["tempo_cliente_minimo"] * multiplier
        if result["tempo_cliente_minimo"] is not None
        else None
    )
    result["tempo_cliente_max_meses"] = (
        result["tempo_cliente_maximo"] * multiplier
        if result["tempo_cliente_maximo"] is not None
        else None
    )
    return result


def _query_params(filters: dict[str, Any]) -> dict[str, Any]:
    return {
        **filters,
        "excluidos": INTRANET_EXCLUDED_COMPANY_IDS,
    }


def _safe_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    text_value = str(value).strip()
    return text_value or None


def _score_map() -> dict[int, dict[str, Any]]:
    params = {"empresa": "todos", "origem": "todos", "pagador": "todos"}
    for page in ("churn-score.contacts", "churn-score.dashboard"):
        try:
            snapshot = get_snapshot(page, params)
        except Exception:
            snapshot = None
        if not snapshot or not isinstance(snapshot.get("payload"), dict):
            continue
        payload = snapshot["payload"]
        candidates = payload.get("contatos") or payload.get("clientes") or []
        if isinstance(candidates, list) and candidates:
            return {
                int(item["empresa_id"]): dict(item)
                for item in candidates
                if isinstance(item, dict) and item.get("empresa_id") is not None
            }
    return {}


def _serialize_search_row(row: dict[str, Any], scores: dict[int, dict[str, Any]]) -> dict[str, Any]:
    company_id = int(row["empresa_id"])
    score = scores.get(company_id, {})
    return {
        "empresa_id": company_id,
        "plano_registro_id": int(row.get("plano_registro_id") or 0),
        "cpf_cnpj": row.get("cpf_cnpj"),
        "razao_social": row.get("razao_social"),
        "empresa": row.get("empresa") or "Não informado",
        "origem": row.get("origem") or "Não informado",
        "pagador": row.get("pagador") or "Não informado",
        "modalidade": row.get("modalidade"),
        "empresa_indicacao_id": row.get("empresa_indicacao_id"),
        "tipo_cobranca": row.get("tipo_cobranca"),
        "estado": row.get("estado"),
        "cidade": row.get("nome_cidade"),
        "ativou_em": _safe_timestamp(row.get("ativou_em")),
        "ultimo_acesso": _safe_timestamp(row.get("ultimo_acesso")),
        "dias_sem_acesso": int(row["dias_sem_acesso"]) if row.get("dias_sem_acesso") is not None else None,
        "ultimo_acesso_vencimento": int(row["ultimo_acesso_vencimento"]) if row.get("ultimo_acesso_vencimento") is not None else None,
        "nome_plano": row.get("nome_plano") or "Não informado",
        "duracao": row.get("duracao") or "",
        "valor": round(float(row.get("valor") or 0), 2),
        "data_vencimento": _safe_timestamp(row.get("data_vencimento")),
        "pago_em": _safe_timestamp(row.get("pago_em")),
        "dias_vencido": int(row.get("dias_vencido") or 0),
        "tempo_vida": int(row.get("tempo_vida") or 0),
        "nome_usuario": row.get("nome_usuario"),
        "telefone": row.get("telefone"),
        "celular": row.get("celular"),
        "email": row.get("email"),
        "ativo": bool(row.get("ativo")),
        "churn_score": int(score["score"]) if score.get("score") is not None else None,
        "nivel_risco": score.get("faixa_risco"),
        "intranet_url": f"https://intranet.clickdigital.com.br/clientes/visualizar/{company_id}?aba=5",
    }


def _apply_payment_average_filter(rows: list[dict[str, Any]], filters: dict[str, Any]) -> list[dict[str, Any]]:
    if not filters["somente_ultrapassou_media"]:
        return rows
    company_ids = [int(row["empresa_id"]) for row in rows]
    metrics = get_payment_metrics(company_ids)
    result: list[dict[str, Any]] = []
    for row in rows:
        payment = metrics.get(int(row["empresa_id"]), {})
        average = payment.get("media_dias_pagamento_real")
        if average is None:
            continue
        # A comparação usa os dias vencidos do plano atual quando já venceu.
        current_delay = max(int(row.get("dias_vencido") or 0), 0)
        if current_delay > max(float(average), 0.0):
            result.append(row)
    return result


def search_clients(*, page: int = 1, limit: int = 20, **filter_kwargs: Any) -> dict[str, Any]:
    filters = normalize_filters(**filter_kwargs)
    page = max(int(page), 1)
    limit = max(1, min(int(limit), 200))

    with source_engine.connect() as connection:
        raw_rows = [dict(row) for row in connection.execute(SEARCH_SQL, _query_params(filters)).mappings().all()]

    raw_rows = _apply_payment_average_filter(raw_rows, filters)
    scores = _score_map()
    rows = [_serialize_search_row(row, scores) for row in raw_rows]
    total = len(rows)
    start = (page - 1) * limit
    end = start + limit

    return {
        "filtros": _json_safe({key: value for key, value in filters.items() if not key.endswith("_meses")}),
        "page": page,
        "limit": limit,
        "total": total,
        "total_paginas": max(1, (total + limit - 1) // limit),
        "rows": rows[start:end],
    }


def export_clients(**filter_kwargs: Any) -> dict[str, Any]:
    # A exportação usa os mesmos filtros da busca, sem paginação.
    filters = normalize_filters(**filter_kwargs)
    with source_engine.connect() as connection:
        raw_rows = [dict(row) for row in connection.execute(SEARCH_SQL, _query_params(filters)).mappings().all()]
    raw_rows = _apply_payment_average_filter(raw_rows, filters)
    scores = _score_map()
    rows = [_serialize_search_row(row, scores) for row in raw_rows]
    return {
        "filtros": _json_safe({key: value for key, value in filters.items() if not key.endswith("_meses")}),
        "total": len(rows),
        "rows": rows,
    }


def get_filter_options() -> dict[str, Any]:
    with source_engine.connect() as connection:
        raw_rows = [
            dict(row)
            for row in connection.execute(
                OPTIONS_SQL,
                {"excluidos": INTRANET_EXCLUDED_COMPANY_IDS},
            ).mappings().all()
        ]

    states = sorted({str(row.get("estado") or "").strip() for row in raw_rows if str(row.get("estado") or "").strip()})
    locations = sorted(
        {
            (str(row.get("estado") or "").strip(), str(row.get("cidade") or "").strip())
            for row in raw_rows
            if str(row.get("cidade") or "").strip()
        },
        key=lambda item: (item[0], item[1]),
    )
    plans = sorted({str(row.get("nome_plano") or "").strip() for row in raw_rows if str(row.get("nome_plano") or "").strip()})
    durations = [
        {"value": code, "label": label}
        for code, label in (("M", "Mensal"), ("T", "Trimestral"), ("S", "Semestral"), ("A", "Anual"))
        if any(str(row.get("duracao") or "") == code for row in raw_rows)
    ]
    return {
        "estados": states,
        "localidades": [{"estado": state, "cidade": city} for state, city in locations],
        "planos": plans,
        "duracoes": durations,
    }


def _clean_document(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except Exception:
            return value.hex()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _safe_source_query(sql, params: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        with source_engine.connect() as connection:
            return [dict(row) for row in connection.execute(sql, params).mappings().all()]
    except Exception:
        return []


def _safe_supabase_query(sql, params: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        with supabase_engine.connect() as connection:
            return [dict(row) for row in connection.execute(sql, params).mappings().all()]
    except Exception:
        return []


def _payment_and_delay_history(plans: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    paid_rows = [row for row in plans if row.get("pago_em") is not None]
    paid_rows.sort(key=lambda row: (row.get("pago_em") or datetime.min, int(row.get("id") or 0)))

    payments: list[dict[str, Any]] = []
    delays: list[dict[str, Any]] = []
    previous_due: date | datetime | None = None

    for row in paid_rows:
        paid_at = row.get("pago_em")
        due_at = row.get("data_vencimento")
        value = row.get("plano_agregado") if (row.get("plano_agregado") or 0) > (row.get("valor") or 0) else row.get("valor")
        plan_name = str(row.get("nome_plano") or "").replace(" (+) recursos", "").replace(" + recursos", "")

        delay_days = None
        if previous_due is not None and paid_at is not None:
            prev = previous_due.date() if isinstance(previous_due, datetime) else previous_due
            paid = paid_at.date() if isinstance(paid_at, datetime) else paid_at
            if isinstance(prev, date) and isinstance(paid, date):
                delay_days = (paid - prev).days

        payments.append(
            {
                "plano_id": row.get("id"),
                "plano": plan_name,
                "duracao": row.get("duracao"),
                "valor": float(value or 0),
                "pago_em": _safe_timestamp(paid_at),
                "data_vencimento": _safe_timestamp(due_at),
                "status_pagamento": row.get("status_pagamento"),
                "atual": row.get("atual"),
                "nota_fiscal_servico_id": row.get("nota_fiscal_servico_id"),
            }
        )

        if previous_due is not None:
            delays.append(
                {
                    "plano_id": row.get("id"),
                    "plano": plan_name,
                    "duracao": row.get("duracao"),
                    "vencimento_anterior": _safe_timestamp(previous_due),
                    "pago_em": _safe_timestamp(paid_at),
                    "dias_atraso": delay_days,
                    "classificacao": (
                        "Reativação" if delay_days is not None and delay_days >= 60
                        else "Renovação" if delay_days is not None
                        else "Não calculado"
                    ),
                }
            )

        if due_at is not None:
            previous_due = due_at

    return payments, delays


def get_client_detail(empresa_id: int) -> dict[str, Any]:
    empresa_id = int(empresa_id)
    if empresa_id <= 0:
        raise ValueError("Cliente inválido.")

    company_rows = _safe_source_query(COMPANY_SQL, {"empresa_id": empresa_id})
    if not company_rows:
        raise ValueError("Cliente não encontrado.")
    company = company_rows[0]
    plans = _safe_source_query(PLANS_SQL, {"empresa_id": empresa_id})
    stores = _safe_source_query(STORES_SQL, {"empresa_id": empresa_id})
    questionnaires = _safe_source_query(QUESTIONNAIRES_SQL, {"empresa_id": empresa_id})

    payments, delays = _payment_and_delay_history(plans)
    payment_metrics = get_payment_metric(empresa_id)

    current_plan = None
    if plans:
        ordered = sorted(
            plans,
            key=lambda row: (
                int(row.get("atual") or 0),
                row.get("data_vencimento") or date(1900, 1, 1),
                int(row.get("id") or 0),
            ),
            reverse=True,
        )
        current_plan = ordered[0]

    score = _score_map().get(empresa_id)

    cnpj = None
    for candidate in reversed(plans):
        cleaned = _clean_document(candidate.get("cpf_cnpj"))
        if len(cleaned) == 14:
            cnpj = cleaned
            break
    business_profile = None
    if cnpj:
        try:
            business_profile = get_business_profile_from_db(cnpj)
        except Exception:
            business_profile = None

    plan_ids = [int(row["id"]) for row in plans if row.get("id") is not None]
    invoices: list[dict[str, Any]] = []
    if plan_ids:
        invoice_sql = text(
            "SELECT * FROM notas_fiscais_servicos WHERE plano_id IN :plano_ids ORDER BY data_emissao DESC, id DESC"
        ).bindparams(bindparam("plano_ids", expanding=True))
        invoices = _safe_source_query(invoice_sql, {"plano_ids": plan_ids})

    support = _safe_supabase_query(SUPPORT_SQL, {"empresa_id": empresa_id})
    support_context = _safe_supabase_query(SUPPORT_CONTEXT_SQL, {"empresa_id": empresa_id})

    motive_counts = Counter(
        str(row.get("motivo") or "Não identificado").strip() or "Não identificado"
        for row in support
    )
    latest_support = support[0].get("data") if support else None

    company_name = None
    if current_plan:
        company_name = current_plan.get("razao_social") or current_plan.get("nome_usuario")

    company_label = "GestãoClick" if str(company.get("modalidade") or "") == "ERP" else "ClickNotas"
    origin_label = "GestãoClick" if int(company.get("empresa_indicacao_id") or 0) == 1 else "Parceiro"
    payer_label = {
        "E": "Cliente",
        "P": "Parceiro",
    }.get(str(company.get("tipo_cobranca") or ""), "Não informado")

    current_due = current_plan.get("data_vencimento") if current_plan else None
    if isinstance(current_due, datetime):
        current_due = current_due.date()
    days_overdue = max((date.today() - current_due).days, 0) if isinstance(current_due, date) else 0

    summary = {
        "empresa_id": empresa_id,
        "razao_social": company_name,
        "empresa": company_label,
        "origem": origin_label,
        "pagador": payer_label,
        "segmento": (business_profile or {}).get("segmento") if isinstance(business_profile, dict) else None,
        "setor": (business_profile or {}).get("setor") if isinstance(business_profile, dict) else None,
        "churn_score": score.get("score") if score else None,
        "nivel_risco": score.get("faixa_risco") if score else None,
        "ultimo_acesso": _safe_timestamp(company.get("ultimo_acesso")),
        "plano_atual": str(current_plan.get("nome_plano") or "").replace(" (+) recursos", "").replace(" + recursos", "") if current_plan else None,
        "duracao_atual": current_plan.get("duracao") if current_plan else None,
        "data_vencimento": _safe_timestamp(current_due),
        "dias_vencido": days_overdue,
        "ativo": bool(current_plan and current_plan.get("pago_em") is not None and isinstance(current_due, date) and current_due >= date.today()),
        "ltv": round(float(payment_metrics.get("ltv") or 0), 2),
        "ticket_medio": round(float(payment_metrics.get("ticket_medio") or 0), 2),
        "renovacoes": int(payment_metrics.get("renovacoes_realizadas") or 0),
        "reativacoes": int(payment_metrics.get("reativacoes") or 0),
        "media_dias_pagamento": payment_metrics.get("media_dias_pagamento_real"),
        "atendimentos": len(support),
        "ultimo_atendimento": _safe_timestamp(latest_support),
        "principais_motivos": [
            {"motivo": label, "atendimentos": count}
            for label, count in motive_counts.most_common(10)
        ],
        "intranet_url": f"https://intranet.clickdigital.com.br/clientes/visualizar/{empresa_id}?aba=5",
    }

    return _json_safe(
        {
            "resumo": summary,
            "empresa": company,
            "plano_atual": current_plan,
            "lojas": stores,
            "perfil_empresa": business_profile,
            "metricas_pagamento": payment_metrics,
            "planos": plans,
            "pagamentos": payments,
            "atrasos": delays,
            "notas_fiscais": invoices,
            "questionarios": questionnaires,
            "atendimentos": support,
            "atendimentos_contexto": support_context,
            "churn_score": score,
        }
    )
