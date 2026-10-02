from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text

from app.database import supabase_engine
from app.services.ativos_atrasados_service import get_active_client_count_for_month
from app.services.zendesk_sync_service import get_sync_status

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

DIMENSION_FILTER = """
    AND (
        :empresa = 'todos'
        OR (:empresa = 'gestaoclick' AND c.empresa = 'GestãoClick')
        OR (:empresa = 'clicknotas' AND c.empresa = 'ClickNotas')
    )
    AND (
        :origem = 'todos'
        OR (:origem = 'gestaoclick' AND c.origem = 'GestãoClick')
        OR (:origem = 'parceiro' AND c.origem = 'Parceiro')
    )
    AND (
        :pagador = 'todos'
        OR (:pagador = 'cliente' AND c.pagador = 'Cliente')
        OR (:pagador = 'parceiro' AND c.pagador = 'Parceiro')
    )
"""

MONTHLY_SQL = text(
    f"""
    SELECT
        DATE_TRUNC('month', z.data)::date AS mes,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT z.empresa_id) FILTER (WHERE z.empresa_id IS NOT NULL) AS clientes_unicos,
        COUNT(DISTINCT z.empresa_id) FILTER (
            WHERE z.empresa_id IS NOT NULL AND c.data_vencimento >= z.data
        ) AS clientes_ativos_contato,
        COUNT(DISTINCT LOWER(z.email_cliente)) FILTER (
            WHERE z.email_cliente IS NOT NULL AND TRIM(z.email_cliente) <> ''
        ) AS usuarios_unicos,
        COUNT(*) FILTER (WHERE z.avaliacao = 'Positiva') AS positivas,
        COUNT(*) FILTER (WHERE z.avaliacao = 'Negativa') AS negativas
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= DATE '2024-01-01'
        AND z.data <= :data_final
        {DIMENSION_FILTER}
    GROUP BY 1
    ORDER BY 1
    """
)

PLAN_MONTHLY_SQL = text(
    f"""
    SELECT
        DATE_TRUNC('month', z.data)::date AS mes,
        COALESCE(NULLIF(c.plano, ''), 'Não identificado') AS plano,
        COUNT(DISTINCT z.empresa_id) FILTER (WHERE z.empresa_id IS NOT NULL) AS clientes_unicos
    FROM public.atendimentos_zendesk z
    JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= DATE '2024-01-01'
        AND z.data <= :data_final
        {DIMENSION_FILTER}
        AND c.data_vencimento >= z.data
    GROUP BY 1, 2
    ORDER BY 1, 3 DESC
    """
)

LIFECYCLE_MONTHLY_SQL = text(
    f"""
    SELECT
        DATE_TRUNC('month', z.data)::date AS mes,
        COUNT(DISTINCT z.empresa_id) FILTER (
            WHERE c.contato_ate_30_dias_contratacao = true AND z.empresa_id IS NOT NULL
        ) AS ate_30_dias_contratacao,
        COUNT(DISTINCT z.empresa_id) FILTER (
            WHERE c.contato_ate_30_dias_antes_churn = true AND z.empresa_id IS NOT NULL
        ) AS ate_30_dias_antes_churn
    FROM public.atendimentos_zendesk z
    JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= DATE '2024-01-01'
        AND z.data <= :data_final
        {DIMENSION_FILTER}
    GROUP BY 1
    ORDER BY 1
    """
)

CARDS_SQL = text(
    f"""
    SELECT
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT z.empresa_id) FILTER (WHERE z.empresa_id IS NOT NULL) AS clientes_unicos,
        COUNT(DISTINCT z.empresa_id) FILTER (
            WHERE z.empresa_id IS NOT NULL AND c.data_vencimento >= z.data
        ) AS clientes_ativos_contato,
        COUNT(*) FILTER (WHERE z.avaliacao = 'Positiva') AS positivas,
        COUNT(*) FILTER (WHERE z.avaliacao = 'Negativa') AS negativas
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        {DIMENSION_FILTER}
    """
)

DEMOGRAPHY_SQL = text(
    f"""
    WITH usuarios AS (
        SELECT DISTINCT ON (LOWER(z.email_cliente))
            LOWER(z.email_cliente) AS email,
            COALESCE(NULLIF(TRIM(z.sexo), ''), 'Não informado') AS sexo,
            z.idade
        FROM public.atendimentos_zendesk z
        LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
        WHERE
            z.data >= :inicio
            AND z.data < :fim
            AND z.email_cliente IS NOT NULL
            AND TRIM(z.email_cliente) <> ''
            {DIMENSION_FILTER}
        ORDER BY LOWER(z.email_cliente), z.data DESC, z.id DESC
    )
    SELECT
        sexo,
        COUNT(*) AS usuarios,
        ROUND(AVG(idade)::numeric, 1) AS idade_media
    FROM usuarios
    GROUP BY sexo
    ORDER BY usuarios DESC, sexo
    """
)

MOTIVE_DEMOGRAPHY_SQL = text(
    f"""
    WITH base AS (
        SELECT
            COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado') AS motivo,
            COALESCE(NULLIF(TRIM(z.sexo), ''), 'Não informado') AS sexo,
            z.idade,
            LOWER(z.email_cliente) AS email
        FROM public.atendimentos_zendesk z
        LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
        WHERE
            z.data >= :inicio
            AND z.data < :fim
            {DIMENSION_FILTER}
    ),
    top_motivos AS (
        SELECT motivo
        FROM base
        GROUP BY motivo
        ORDER BY COUNT(*) DESC
        LIMIT 12
    )
    SELECT
        b.motivo,
        b.sexo,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT b.email) FILTER (WHERE b.email IS NOT NULL AND b.email <> '') AS usuarios_unicos,
        ROUND(AVG(b.idade)::numeric, 1) AS idade_media
    FROM base b
    JOIN top_motivos t ON t.motivo = b.motivo
    GROUP BY b.motivo, b.sexo
    ORDER BY b.motivo, atendimentos DESC
    """
)

MOTIVE_TOTAL_SQL = text(
    f"""
    SELECT
        COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado') AS motivo,
        COUNT(*) AS atendimentos
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        {DIMENSION_FILTER}
    GROUP BY 1
    ORDER BY atendimentos DESC, motivo
    """
)

MOTIVE_HISTORY_SQL = text(
    f"""
    SELECT
        DATE_TRUNC('month', z.data)::date AS mes,
        COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado') AS motivo,
        COALESCE(NULLIF(TRIM(z.sexo), ''), 'Não informado') AS sexo,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT LOWER(z.email_cliente)) FILTER (
            WHERE z.email_cliente IS NOT NULL AND TRIM(z.email_cliente) <> ''
        ) AS usuarios_unicos,
        ROUND(AVG(z.idade)::numeric, 1) AS idade_media
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= DATE '2024-01-01'
        AND z.data <= :data_final
        {DIMENSION_FILTER}
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
    """
)

ACTIVE_SNAPSHOT_SQL = text(
    """
    SELECT payload
    FROM public.dashboard_daily_cache
    WHERE page = 'ativos_atrasados.dashboard'
      AND params @> CAST(:stable_params AS jsonb)
      AND payload IS NOT NULL
    ORDER BY source_date DESC, updated_at DESC
    LIMIT 1
    """
)

LATEST_DATE_SQL = text(
    """
    SELECT MIN(data) AS primeira_data, MAX(data) AS ultima_data, COUNT(*) AS total
    FROM public.atendimentos_zendesk
    """
)


def _validate(empresa: str, origem: str, pagador: str) -> None:
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    if not 1 <= month <= 12:
        raise ValueError("Mês inválido.")
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def _iso_month(value: Any) -> str:
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%Y-%m")
    return str(value)[:7]


def _active_history(empresa: str, origem: str, pagador: str) -> dict[str, int]:
    params = json.dumps(
        {"empresa": empresa, "origem": origem, "pagador": pagador},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    with supabase_engine.connect() as connection:
        row = connection.execute(ACTIVE_SNAPSHOT_SQL, {"stable_params": params}).mappings().first()
    if not row or not isinstance(row.get("payload"), dict):
        return {}
    payload = row["payload"]
    history = payload.get("historico_tres_linhas") or payload.get("historico_ativos") or payload.get("historico") or []
    result: dict[str, int] = {}
    for item in history:
        data = str(item.get("data") or "")
        if len(data) >= 7:
            result[data[:7]] = int(item.get("clientes_ativos") or 0)
            continue
        try:
            year = int(item.get("ano"))
            month = int(item.get("mes"))
        except (TypeError, ValueError):
            continue
        if 1 <= month <= 12:
            result[f"{year:04d}-{month:02d}"] = int(item.get("clientes_ativos") or 0)
    return result


def _with_percentages(monthly_rows: list[dict], active_history: dict[str, int]) -> list[dict]:
    result = []
    for row in monthly_rows:
        month = _iso_month(row["mes"])
        active = int(active_history.get(month, 0))
        unique_clients = int(row.get("clientes_unicos") or 0)
        active_contact_clients = int(row.get("clientes_ativos_contato") or 0)
        percentage = round((active_contact_clients / active) * 100, 2) if active else None
        result.append(
            {
                "mes": month,
                "atendimentos": int(row.get("atendimentos") or 0),
                "clientes_unicos": unique_clients,
                "clientes_ativos_contato": active_contact_clients,
                "usuarios_unicos": int(row.get("usuarios_unicos") or 0),
                "positivas": int(row.get("positivas") or 0),
                "negativas": int(row.get("negativas") or 0),
                "clientes_ativos": active or None,
                "percentual_base": percentage,
            }
        )
    return result


def get_atendimentos_dashboard(
    *,
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(empresa, origem, pagador)
    start, end = _month_bounds(year, month)
    today = date.today()
    query_end = today - timedelta(days=1)
    params_common = {
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "data_final": query_end,
    }
    params_selected = {**params_common, "inicio": start, "fim": end}

    with supabase_engine.connect() as connection:
        monthly_raw = [dict(row) for row in connection.execute(MONTHLY_SQL, params_common).mappings().all()]
        plan_rows = [dict(row) for row in connection.execute(PLAN_MONTHLY_SQL, params_common).mappings().all()]
        lifecycle_rows = [dict(row) for row in connection.execute(LIFECYCLE_MONTHLY_SQL, params_common).mappings().all()]
        cards = dict(connection.execute(CARDS_SQL, params_selected).mappings().first() or {})
        demographics = [dict(row) for row in connection.execute(DEMOGRAPHY_SQL, params_selected).mappings().all()]
        motive_rows = [dict(row) for row in connection.execute(MOTIVE_DEMOGRAPHY_SQL, params_selected).mappings().all()]
        motive_totals = [dict(row) for row in connection.execute(MOTIVE_TOTAL_SQL, params_selected).mappings().all()]
        motive_history_rows = [dict(row) for row in connection.execute(MOTIVE_HISTORY_SQL, params_common).mappings().all()]
        meta = dict(connection.execute(LATEST_DATE_SQL).mappings().first() or {})

    active_history = _active_history(empresa, origem, pagador)
    month_key = f"{year:04d}-{month:02d}"
    selected_ref = date(year, month, 1)
    current_ref = date.today().replace(day=1)
    if month_key not in active_history and selected_ref <= current_ref:
        try:
            active_history[month_key] = get_active_client_count_for_month(
                year,
                month,
                empresa=empresa,
                origem=origem,
                pagador=pagador,
            )
        except Exception:
            # A ausência desta fotografia não deve impedir o restante da página.
            pass

    monthly = _with_percentages(monthly_raw, active_history)
    active_selected = int(active_history.get(month_key, 0))
    unique_selected = int(cards.get("clientes_unicos") or 0)
    active_contact_selected = int(cards.get("clientes_ativos_contato") or 0)

    plans = [
        {
            "mes": _iso_month(row["mes"]),
            "plano": str(row.get("plano") or "Não identificado"),
            "clientes_unicos": int(row.get("clientes_unicos") or 0),
        }
        for row in plan_rows
    ]
    lifecycle = [
        {
            "mes": _iso_month(row["mes"]),
            "ate_30_dias_contratacao": int(row.get("ate_30_dias_contratacao") or 0),
            "ate_30_dias_antes_churn": int(row.get("ate_30_dias_antes_churn") or 0),
        }
        for row in lifecycle_rows
    ]

    sex = [
        {
            "sexo": str(row.get("sexo") or "Não informado"),
            "usuarios": int(row.get("usuarios") or 0),
            "idade_media": float(row["idade_media"]) if row.get("idade_media") is not None else None,
        }
        for row in demographics
    ]
    ages = [row["idade_media"] for row in sex if row["idade_media"] is not None]
    weighted_age_num = sum((row["idade_media"] or 0) * row["usuarios"] for row in sex if row["idade_media"] is not None)
    weighted_age_den = sum(row["usuarios"] for row in sex if row["idade_media"] is not None)

    motives = [
        {
            "motivo": str(row.get("motivo") or "Não identificado"),
            "sexo": str(row.get("sexo") or "Não informado"),
            "atendimentos": int(row.get("atendimentos") or 0),
            "usuarios_unicos": int(row.get("usuarios_unicos") or 0),
            "idade_media": float(row["idade_media"]) if row.get("idade_media") is not None else None,
        }
        for row in motive_rows
    ]
    motive_counts = [
        {
            "motivo": str(row.get("motivo") or "Não identificado"),
            "atendimentos": int(row.get("atendimentos") or 0),
        }
        for row in motive_totals
    ]
    motive_history = [
        {
            "mes": _iso_month(row["mes"]),
            "motivo": str(row.get("motivo") or "Não identificado"),
            "sexo": str(row.get("sexo") or "Não informado"),
            "atendimentos": int(row.get("atendimentos") or 0),
            "usuarios_unicos": int(row.get("usuarios_unicos") or 0),
            "idade_media": float(row["idade_media"]) if row.get("idade_media") is not None else None,
        }
        for row in motive_history_rows
    ]

    sync_status = get_sync_status()
    if sync_status.get("contexto_pendente"):
        for item in monthly:
            item["percentual_base"] = None
        plans = []
        lifecycle = []

    first_date = meta.get("primeira_data")
    last_date = meta.get("ultima_data")
    if isinstance(first_date, datetime):
        first_date = first_date.date()
    if isinstance(last_date, datetime):
        last_date = last_date.date()

    return {
        "periodo": {"ano": year, "mes": month, "inicio": start.isoformat(), "fim": end.isoformat()},
        "filtros": {"empresa": empresa, "origem": origem, "pagador": pagador},
        "cards": {
            "atendimentos": int(cards.get("atendimentos") or 0),
            "clientes_unicos": unique_selected,
            "percentual_base": (
                None
                if sync_status.get("contexto_pendente")
                else round((active_contact_selected / active_selected) * 100, 2) if active_selected else None
            ),
            "clientes_ativos": active_selected or None,
            "positivas": int(cards.get("positivas") or 0),
            "negativas": int(cards.get("negativas") or 0),
        },
        "historico": monthly,
        "planos_historico": plans,
        "ciclo_vida_historico": lifecycle,
        "demografia": {
            "sexo": sex,
            "idade_media": round(weighted_age_num / weighted_age_den, 1) if weighted_age_den else None,
            "motivos": motives,
        },
        "motivos_geral": motive_counts,
        "motivos_historico": motive_history,
        "dados": {
            "primeira_data": first_date.isoformat() if isinstance(first_date, date) else None,
            "ultima_data": last_date.isoformat() if isinstance(last_date, date) else None,
            "total_registros": int(meta.get("total") or 0),
        },
        "sincronizacao": sync_status,
    }


def get_atendimentos_meta() -> dict:
    with supabase_engine.connect() as connection:
        meta = dict(connection.execute(LATEST_DATE_SQL).mappings().first() or {})
    last_date = meta.get("ultima_data")
    if isinstance(last_date, datetime):
        last_date = last_date.date()
    if not isinstance(last_date, date):
        last_date = date.today()
    return {
        "ano_inicio": 2024,
        "anos": list(range(2024, date.today().year + 1)),
        "ano_padrao": last_date.year,
        "mes_padrao": last_date.month,
        "ultima_data": last_date.isoformat(),
        "sincronizacao": get_sync_status(),
    }
