from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from math import sqrt
from typing import Any

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine, supabase_engine
from app.services.global_filter_context import period_bounds as global_period_bounds
from app.services.ativos_atrasados_service import get_active_client_count_for_month
from app.services.zendesk_sync_service import get_sync_status

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

# Mesma lista da consulta "Churn e atrasados" enviada pelo usuário.
CHURN_EXCLUDED_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371)))

SOURCE_DIMENSION_FILTER = """
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
        :filtro_plano_global = 'todos'
        OR REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = :filtro_plano_global
    )
    AND (
        :filtro_duracao_global = 'todos'
        OR ep.duracao = :filtro_duracao_global
    )
"""

CURRENT_CHURN_COMPANIES_SQL = text(
    f"""
    SELECT DISTINCT ep.empresa_id
    FROM empresas_planos ep
    JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        ep.plano_id <> 1
        AND ep.atual = 1
        AND ep.pago_em IS NOT NULL
        AND ep.nota_fiscal_servico_id IS NOT NULL
        AND ep.data_vencimento >= '2024-01-01'
        AND ep.data_vencimento < CURRENT_DATE()
        AND DATEDIFF(CURRENT_DATE(), ep.data_vencimento) >= 60
        AND e.id NOT IN :excluidos
        {SOURCE_DIMENSION_FILTER}
    ORDER BY ep.empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))

ATTENDANCE_COMPANY_IDS_SQL = text(
    """
    SELECT DISTINCT empresa_id
    FROM public.atendimentos_zendesk
    WHERE
        empresa_id IS NOT NULL
        AND data >= DATE '2024-01-01'
        AND data < :fim
    """
)

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

CLIENT_STATS_SQL = text(
    f"""
    SELECT
        z.empresa_id,
        COALESCE(NULLIF(MAX(TRIM(z.cliente)), ''), 'Cliente #' || z.empresa_id::text) AS cliente,
        COUNT(*) AS atendimentos,
        COUNT(*) FILTER (WHERE z.avaliacao = 'Positiva') AS positivas,
        COUNT(*) FILTER (WHERE z.avaliacao = 'Negativa') AS negativas,
        COUNT(*) FILTER (WHERE z.avaliacao IN ('Positiva', 'Negativa')) AS avaliacoes,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM z.duracao_humano)), 0)::numeric, 1) AS duracao_total_segundos,
        ROUND(AVG(EXTRACT(EPOCH FROM z.duracao_humano))::numeric, 1) AS duracao_media_segundos
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.empresa_id IS NOT NULL
        {DIMENSION_FILTER}
    GROUP BY z.empresa_id
    """
)

CLIENT_MOTIVES_SQL = text(
    f"""
    SELECT
        z.empresa_id,
        COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado') AS motivo,
        COUNT(*) AS atendimentos,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM z.duracao_humano)), 0)::numeric, 1) AS duracao_total_segundos
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.empresa_id IN :empresa_ids
        {DIMENSION_FILTER}
    GROUP BY z.empresa_id, 2
    ORDER BY z.empresa_id, atendimentos DESC, motivo
    """
).bindparams(bindparam("empresa_ids", expanding=True))

TIME_BY_SEX_SQL = text(
    f"""
    SELECT
        COALESCE(NULLIF(TRIM(z.sexo), ''), 'Não informado') AS sexo,
        COUNT(*) AS atendimentos,
        COUNT(z.duracao_humano) AS atendimentos_com_duracao,
        ROUND(AVG(EXTRACT(EPOCH FROM z.duracao_humano))::numeric, 1) AS duracao_media_segundos
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        {DIMENSION_FILTER}
    GROUP BY 1
    ORDER BY atendimentos DESC, sexo
    """
)

TIME_BY_AGE_SQL = text(
    f"""
    WITH base AS (
        SELECT
            CASE
                WHEN z.idade BETWEEN 16 AND 20 THEN '16-20'
                WHEN z.idade BETWEEN 21 AND 25 THEN '21-25'
                WHEN z.idade BETWEEN 26 AND 30 THEN '26-30'
                WHEN z.idade BETWEEN 31 AND 35 THEN '31-35'
                WHEN z.idade BETWEEN 36 AND 40 THEN '36-40'
                WHEN z.idade BETWEEN 41 AND 45 THEN '40-45'
                WHEN z.idade BETWEEN 46 AND 50 THEN '46-50'
                WHEN z.idade > 50 THEN '50+'
                ELSE NULL
            END AS faixa_etaria,
            z.duracao_humano
        FROM public.atendimentos_zendesk z
        LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
        WHERE
            z.data >= :inicio
            AND z.data < :fim
            {DIMENSION_FILTER}
    )
    SELECT
        faixa_etaria,
        COUNT(*) AS atendimentos,
        COUNT(duracao_humano) AS atendimentos_com_duracao,
        ROUND(AVG(EXTRACT(EPOCH FROM duracao_humano))::numeric, 1) AS duracao_media_segundos
    FROM base
    WHERE faixa_etaria IS NOT NULL
    GROUP BY faixa_etaria
    ORDER BY CASE faixa_etaria
        WHEN '16-20' THEN 1
        WHEN '21-25' THEN 2
        WHEN '26-30' THEN 3
        WHEN '31-35' THEN 4
        WHEN '36-40' THEN 5
        WHEN '40-45' THEN 6
        WHEN '46-50' THEN 7
        WHEN '50+' THEN 8
        ELSE 9
    END
    """
)

AGENT_TIME_SQL = text(
    f"""
    SELECT
        LOWER(TRIM(z.email_atendente)) AS email_atendente,
        COALESCE(NULLIF(MAX(TRIM(z.atendente)), ''), LOWER(TRIM(z.email_atendente))) AS atendente,
        COUNT(*) AS atendimentos,
        COUNT(z.duracao_humano) AS atendimentos_com_duracao,
        ROUND(AVG(EXTRACT(EPOCH FROM z.duracao_humano))::numeric, 1) AS duracao_media_segundos,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM z.duracao_humano)), 0)::numeric, 1) AS duracao_total_segundos
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.email_atendente IS NOT NULL
        AND TRIM(z.email_atendente) <> ''
        {DIMENSION_FILTER}
    GROUP BY LOWER(TRIM(z.email_atendente))
    ORDER BY duracao_media_segundos DESC NULLS LAST, atendimentos DESC
    """
)

CHURN_SUMMARY_SQL = text(
    """
    WITH por_cliente AS (
        SELECT
            z.empresa_id,
            COUNT(*) AS atendimentos,
            COUNT(DISTINCT COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado')) AS motivos_distintos,
            COUNT(DISTINCT LOWER(TRIM(z.email_atendente))) FILTER (
                WHERE z.email_atendente IS NOT NULL AND TRIM(z.email_atendente) <> ''
            ) AS atendentes_distintos,
            AVG(EXTRACT(EPOCH FROM z.duracao_humano)) AS duracao_media_segundos,
            SUM(EXTRACT(EPOCH FROM z.duracao_humano)) AS duracao_total_segundos
        FROM public.atendimentos_zendesk z
        WHERE
            z.data >= :inicio
            AND z.data < :fim
            AND z.empresa_id IN :churn_empresa_ids
        GROUP BY z.empresa_id
    )
    SELECT
        COUNT(*) AS clientes_churnados_com_atendimento,
        COALESCE(SUM(atendimentos), 0) AS atendimentos,
        ROUND(AVG(atendimentos)::numeric, 2) AS atendimentos_medios_por_cliente,
        ROUND(AVG(duracao_media_segundos)::numeric, 1) AS duracao_media_segundos,
        ROUND(AVG(motivos_distintos)::numeric, 2) AS motivos_medios_por_cliente,
        ROUND(AVG(atendentes_distintos)::numeric, 2) AS atendentes_medios_por_cliente,
        ROUND(CORR(atendimentos::double precision, duracao_total_segundos::double precision)::numeric, 4) AS corr_atendimentos_duracao_total,
        ROUND(CORR(atendimentos::double precision, duracao_media_segundos::double precision)::numeric, 4) AS corr_atendimentos_duracao_media
    FROM por_cliente
    """
).bindparams(bindparam("churn_empresa_ids", expanding=True))

CHURN_MOTIVE_SQL = text(
    """
    SELECT
        COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado') AS motivo,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT z.empresa_id) AS clientes,
        ROUND(AVG(EXTRACT(EPOCH FROM z.duracao_humano))::numeric, 1) AS duracao_media_segundos
    FROM public.atendimentos_zendesk z
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.empresa_id IN :churn_empresa_ids
    GROUP BY 1
    ORDER BY clientes DESC, atendimentos DESC
    LIMIT 15
    """
).bindparams(bindparam("churn_empresa_ids", expanding=True))

CHURN_AGENT_SQL = text(
    """
    SELECT
        LOWER(TRIM(z.email_atendente)) AS email_atendente,
        COALESCE(NULLIF(MAX(TRIM(z.atendente)), ''), LOWER(TRIM(z.email_atendente))) AS atendente,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT z.empresa_id) AS clientes,
        ROUND(AVG(EXTRACT(EPOCH FROM z.duracao_humano))::numeric, 1) AS duracao_media_segundos
    FROM public.atendimentos_zendesk z
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.empresa_id IN :churn_empresa_ids
        AND z.email_atendente IS NOT NULL
        AND TRIM(z.email_atendente) <> ''
    GROUP BY LOWER(TRIM(z.email_atendente))
    ORDER BY clientes DESC, atendimentos DESC
    LIMIT 15
    """
).bindparams(bindparam("churn_empresa_ids", expanding=True))


CHURN_AGENT_CORRELATION_SQL = text(
    """
    WITH por_atendente AS (
        SELECT
            LOWER(TRIM(z.email_atendente)) AS email_atendente,
            COUNT(*)::double precision AS atendimentos,
            AVG(EXTRACT(EPOCH FROM z.duracao_humano))::double precision AS duracao_media_segundos
        FROM public.atendimentos_zendesk z
        WHERE
            z.data >= :inicio
            AND z.data < :fim
            AND z.empresa_id IN :churn_empresa_ids
            AND z.email_atendente IS NOT NULL
            AND TRIM(z.email_atendente) <> ''
            AND z.duracao_humano IS NOT NULL
        GROUP BY LOWER(TRIM(z.email_atendente))
    )
    SELECT
        ROUND(CORR(atendimentos, duracao_media_segundos)::numeric, 4) AS correlacao
    FROM por_atendente
    """
).bindparams(bindparam("churn_empresa_ids", expanding=True))

CHURN_MOTIVE_ASSOCIATION_SQL = text(
    f"""
    SELECT
        COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado') AS motivo,
        CASE WHEN z.empresa_id IN :churn_empresa_ids THEN TRUE ELSE FALSE END AS churnou,
        COUNT(*) AS atendimentos
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.empresa_id IS NOT NULL
        {DIMENSION_FILTER}
    GROUP BY 1, 2
    ORDER BY 1, 2
    """
).bindparams(bindparam("churn_empresa_ids", expanding=True))

CHURN_CLIENTS_SQL = text(
    """
    SELECT
        z.empresa_id,
        COALESCE(NULLIF(MAX(TRIM(z.cliente)), ''), 'Cliente #' || z.empresa_id::text) AS cliente,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT COALESCE(NULLIF(TRIM(z.motivo), ''), 'Não identificado')) AS motivos_distintos,
        COUNT(DISTINCT LOWER(TRIM(z.email_atendente))) FILTER (
            WHERE z.email_atendente IS NOT NULL AND TRIM(z.email_atendente) <> ''
        ) AS atendentes_distintos,
        ROUND(AVG(EXTRACT(EPOCH FROM z.duracao_humano))::numeric, 1) AS duracao_media_segundos,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM z.duracao_humano)), 0)::numeric, 1) AS duracao_total_segundos
    FROM public.atendimentos_zendesk z
    WHERE
        z.data >= :inicio
        AND z.data < :fim
        AND z.empresa_id IN :churn_empresa_ids
    GROUP BY z.empresa_id
    ORDER BY atendimentos DESC, duracao_total_segundos DESC
    LIMIT 20
    """
).bindparams(bindparam("churn_empresa_ids", expanding=True))

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
    WHERE data < CURRENT_DATE
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
    return global_period_bounds(year, month, current_mode="none")

def _iso_month(value: Any) -> str:
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%Y-%m")
    return str(value)[:7]


def _intranet_url(company_id: int) -> str:
    return f"https://intranet.clickdigital.com.br/clientes/visualizar/{company_id}?aba=5"


def _cramers_v(rows: list[dict]) -> float | None:
    """Associação entre churn (sim/não) e motivo, ambos categóricos."""
    if not rows:
        return None

    motives = sorted({str(row.get("motivo") or "Não identificado") for row in rows})
    statuses = sorted({bool(row.get("churnou")) for row in rows})
    if len(motives) < 2 or len(statuses) < 2:
        return None

    counts: dict[tuple[bool, str], float] = {}
    row_totals = {status: 0.0 for status in statuses}
    col_totals = {motive: 0.0 for motive in motives}
    total = 0.0

    for row in rows:
        status = bool(row.get("churnou"))
        motive = str(row.get("motivo") or "Não identificado")
        value = float(row.get("atendimentos") or 0)
        counts[(status, motive)] = counts.get((status, motive), 0.0) + value
        row_totals[status] = row_totals.get(status, 0.0) + value
        col_totals[motive] = col_totals.get(motive, 0.0) + value
        total += value

    if total <= 0:
        return None

    chi_square = 0.0
    for status in statuses:
        for motive in motives:
            expected = (row_totals[status] * col_totals[motive]) / total
            if expected <= 0:
                continue
            observed = counts.get((status, motive), 0.0)
            chi_square += ((observed - expected) ** 2) / expected

    denominator_factor = min(len(statuses) - 1, len(motives) - 1)
    if denominator_factor <= 0:
        return None

    value = sqrt(chi_square / (total * denominator_factor))
    return round(min(max(value, 0.0), 1.0), 4)


def _float_or_none(value: Any) -> float | None:
    return float(value) if value is not None else None


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
            item_year = int(item.get("ano"))
            item_month = int(item.get("mes"))
        except (TypeError, ValueError):
            continue
        if 1 <= item_month <= 12:
            result[f"{item_year:04d}-{item_month:02d}"] = int(item.get("clientes_ativos") or 0)
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


def _serialize_client(row: dict) -> dict:
    company_id = int(row["empresa_id"])
    return {
        "empresa_id": company_id,
        "cliente": str(row.get("cliente") or f"Cliente #{company_id}"),
        "intranet_url": _intranet_url(company_id),
        "atendimentos": int(row.get("atendimentos") or 0),
        "positivas": int(row.get("positivas") or 0),
        "negativas": int(row.get("negativas") or 0),
        "avaliacoes": int(row.get("avaliacoes") or 0),
        "duracao_total_segundos": float(row.get("duracao_total_segundos") or 0),
        "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
        "motivos": [],
    }


def _attach_client_motives(clients: list[dict], motive_rows: list[dict]) -> None:
    grouped: dict[int, list[dict]] = defaultdict(list)
    for row in motive_rows:
        grouped[int(row["empresa_id"])].append(
            {
                "motivo": str(row.get("motivo") or "Não identificado"),
                "atendimentos": int(row.get("atendimentos") or 0),
                "duracao_total_segundos": float(row.get("duracao_total_segundos") or 0),
            }
        )
    for client in clients:
        client["motivos"] = grouped.get(int(client["empresa_id"]), [])


def _top_clients(client_rows: list[dict], motive_rows: list[dict]) -> dict:
    clients = [_serialize_client(row) for row in client_rows]
    by_attendances = sorted(clients, key=lambda row: (-row["atendimentos"], row["cliente"]))[:10]
    by_duration = sorted(clients, key=lambda row: (-row["duracao_total_segundos"], -row["atendimentos"], row["cliente"]))[:10]
    by_ratings = sorted(
        [row for row in clients if row["avaliacoes"] > 0],
        key=lambda row: (-row["avaliacoes"], -row["atendimentos"], row["cliente"]),
    )[:10]
    by_positive = sorted(
        [row for row in clients if row["positivas"] > 0],
        key=lambda row: (-row["positivas"], -row["avaliacoes"], row["cliente"]),
    )[:10]
    by_negative = sorted(
        [row for row in clients if row["negativas"] > 0],
        key=lambda row: (-row["negativas"], -row["avaliacoes"], row["cliente"]),
    )[:10]

    unique: dict[int, dict] = {}
    for group in (by_attendances, by_duration, by_ratings, by_positive, by_negative):
        for client in group:
            unique[int(client["empresa_id"])] = client
    _attach_client_motives(list(unique.values()), motive_rows)

    return {
        "mais_atendimentos": by_attendances,
        "maior_tempo_total": by_duration,
        "mais_avaliaram": by_ratings,
        "mais_positivas": by_positive,
        "mais_negativas": by_negative,
    }


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

    # Nunca usamos o dia atual. Isso também protege a tela caso algum registro do
    # próprio dia tenha sido gravado acidentalmente antes da limpeza incremental.
    selected_end = min(end, today)
    if selected_end < start:
        selected_end = start

    params_common = {
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "data_final": query_end,
    }
    params_selected = {**params_common, "inicio": start, "fim": selected_end}

    with supabase_engine.connect() as connection:
        monthly_raw = [dict(row) for row in connection.execute(MONTHLY_SQL, params_common).mappings().all()]
        plan_rows = [dict(row) for row in connection.execute(PLAN_MONTHLY_SQL, params_common).mappings().all()]
        lifecycle_rows = [dict(row) for row in connection.execute(LIFECYCLE_MONTHLY_SQL, params_common).mappings().all()]
        cards = dict(connection.execute(CARDS_SQL, params_selected).mappings().first() or {})
        demographics = [dict(row) for row in connection.execute(DEMOGRAPHY_SQL, params_selected).mappings().all()]
        motive_rows = [dict(row) for row in connection.execute(MOTIVE_DEMOGRAPHY_SQL, params_selected).mappings().all()]
        motive_totals = [dict(row) for row in connection.execute(MOTIVE_TOTAL_SQL, params_selected).mappings().all()]
        motive_history_rows = [dict(row) for row in connection.execute(MOTIVE_HISTORY_SQL, params_common).mappings().all()]
        client_rows = [dict(row) for row in connection.execute(CLIENT_STATS_SQL, params_selected).mappings().all()]
        time_by_sex_rows = [dict(row) for row in connection.execute(TIME_BY_SEX_SQL, params_selected).mappings().all()]
        time_by_age_rows = [dict(row) for row in connection.execute(TIME_BY_AGE_SQL, params_selected).mappings().all()]
        agent_rows = [dict(row) for row in connection.execute(AGENT_TIME_SQL, params_selected).mappings().all()]
        meta = dict(connection.execute(LATEST_DATE_SQL).mappings().first() or {})

        candidate_ids: set[int] = set()
        ranking_specs = (
            ("atendimentos",),
            ("duracao_total_segundos", "atendimentos"),
            ("avaliacoes", "atendimentos"),
            ("positivas", "avaliacoes"),
            ("negativas", "avaliacoes"),
        )
        for fields in ranking_specs:
            ranked_rows = sorted(
                client_rows,
                key=lambda row: tuple(-float(row.get(field) or 0) for field in fields),
            )[:10]
            candidate_ids.update(int(row["empresa_id"]) for row in ranked_rows if row.get("empresa_id") is not None)

        client_ids = sorted(candidate_ids)
        if client_ids:
            motive_params = {**params_selected, "empresa_ids": client_ids}
            client_motive_rows = [
                dict(row)
                for row in connection.execute(CLIENT_MOTIVES_SQL, motive_params).mappings().all()
            ]
        else:
            client_motive_rows = []

    # 1) Identifica TODOS os clientes atualmente com 60+ dias de atraso usando
    # exatamente a base da consulta "Churn e atrasados".
    source_params = {
        "excluidos": CHURN_EXCLUDED_IDS,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }
    try:
        with source_engine.connect() as connection:
            churn_source_ids = {
                int(row["empresa_id"])
                for row in connection.execute(CURRENT_CHURN_COMPANIES_SQL, source_params).mappings().all()
                if row.get("empresa_id") is not None
            }
    except Exception:
        # O painel principal de Atendimentos é lido do Supabase. Uma falha no
        # banco de origem afeta apenas esta análise complementar de churn.
        churn_source_ids = set()

    # 2) Cruza essa lista com TODOS os empresa_id existentes no histórico de
    # atendimentos, e não apenas com os clientes do mês selecionado na tela.
    # A análise de churn usa todo o histórico disponível desde 01/01/2024 até
    # ontem. O seletor de mês continua valendo apenas para as demais análises.
    churn_attendance_start = date(2024, 1, 1)
    churn_attendance_end = today  # exclusivo: o dia atual nunca entra

    with supabase_engine.connect() as connection:
        attendance_company_ids = {
            int(row["empresa_id"])
            for row in connection.execute(
                ATTENDANCE_COMPANY_IDS_SQL,
                {"fim": churn_attendance_end},
            ).mappings().all()
            if row.get("empresa_id") is not None
        }

    churn_company_ids = sorted(churn_source_ids.intersection(attendance_company_ids))
    params_churn = {
        "inicio": churn_attendance_start,
        "fim": churn_attendance_end,
        "churn_empresa_ids": churn_company_ids or [-1],
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }

    with supabase_engine.connect() as connection:
        churn_summary = dict(connection.execute(CHURN_SUMMARY_SQL, params_churn).mappings().first() or {})
        churn_motives = [dict(row) for row in connection.execute(CHURN_MOTIVE_SQL, params_churn).mappings().all()]
        churn_agents = [dict(row) for row in connection.execute(CHURN_AGENT_SQL, params_churn).mappings().all()]
        churn_clients = [dict(row) for row in connection.execute(CHURN_CLIENTS_SQL, params_churn).mappings().all()]
        churn_agent_corr = dict(connection.execute(CHURN_AGENT_CORRELATION_SQL, params_churn).mappings().first() or {})
        churn_motive_assoc_rows = [
            dict(row)
            for row in connection.execute(CHURN_MOTIVE_ASSOCIATION_SQL, params_churn).mappings().all()
        ]

    churn_motive_association = _cramers_v(churn_motive_assoc_rows)

    active_history = _active_history(empresa, origem, pagador)
    month_key = f"{year:04d}-{month:02d}"
    selected_ref = date(year, month, 1)
    current_ref = today.replace(day=1)
    if selected_ref <= current_ref and (month_key not in active_history or selected_ref == current_ref):
        try:
            # Para o mês atual sempre recalculamos a fotografia do dia 1. Assim a
            # página de Atendimentos não depende de um snapshot antigo da virada.
            active_history[month_key] = get_active_client_count_for_month(
                year,
                month,
                empresa=empresa,
                origem=origem,
                pagador=pagador,
            )
        except Exception:
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
            "idade_media": _float_or_none(row.get("idade_media")),
        }
        for row in demographics
    ]
    weighted_age_num = sum((row["idade_media"] or 0) * row["usuarios"] for row in sex if row["idade_media"] is not None)
    weighted_age_den = sum(row["usuarios"] for row in sex if row["idade_media"] is not None)

    motives = [
        {
            "motivo": str(row.get("motivo") or "Não identificado"),
            "sexo": str(row.get("sexo") or "Não informado"),
            "atendimentos": int(row.get("atendimentos") or 0),
            "usuarios_unicos": int(row.get("usuarios_unicos") or 0),
            "idade_media": _float_or_none(row.get("idade_media")),
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
            "idade_media": _float_or_none(row.get("idade_media")),
        }
        for row in motive_history_rows
    ]

    top_clients = _top_clients(client_rows, client_motive_rows)

    time_by_sex = [
        {
            "sexo": str(row.get("sexo") or "Não informado"),
            "atendimentos": int(row.get("atendimentos") or 0),
            "atendimentos_com_duracao": int(row.get("atendimentos_com_duracao") or 0),
            "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
        }
        for row in time_by_sex_rows
    ]
    time_by_age = [
        {
            "faixa_etaria": str(row.get("faixa_etaria")),
            "atendimentos": int(row.get("atendimentos") or 0),
            "atendimentos_com_duracao": int(row.get("atendimentos_com_duracao") or 0),
            "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
        }
        for row in time_by_age_rows
    ]
    agents = [
        {
            "email_atendente": str(row.get("email_atendente") or ""),
            "atendente": str(row.get("atendente") or row.get("email_atendente") or "Não identificado"),
            "atendimentos": int(row.get("atendimentos") or 0),
            "atendimentos_com_duracao": int(row.get("atendimentos_com_duracao") or 0),
            "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
            "duracao_total_segundos": float(row.get("duracao_total_segundos") or 0),
        }
        for row in agent_rows
    ]

    churn = {
        "periodo_atendimentos": {
            "inicio": churn_attendance_start.isoformat(),
            "fim": (churn_attendance_end - timedelta(days=1)).isoformat(),
        },
        "resumo": {
            "clientes_churn_periodo": len(churn_source_ids),
            "clientes_churnados_com_atendimento": int(churn_summary.get("clientes_churnados_com_atendimento") or 0),
            "atendimentos": int(churn_summary.get("atendimentos") or 0),
            "atendimentos_medios_por_cliente": _float_or_none(churn_summary.get("atendimentos_medios_por_cliente")),
            "duracao_media_segundos": _float_or_none(churn_summary.get("duracao_media_segundos")),
            "motivos_medios_por_cliente": _float_or_none(churn_summary.get("motivos_medios_por_cliente")),
            "atendentes_medios_por_cliente": _float_or_none(churn_summary.get("atendentes_medios_por_cliente")),
            "corr_atendimentos_duracao_total": _float_or_none(churn_summary.get("corr_atendimentos_duracao_total")),
            "corr_atendimentos_duracao_media": _float_or_none(churn_summary.get("corr_atendimentos_duracao_media")),
            "corr_atendimentos_duracao_media_atendente": _float_or_none(churn_agent_corr.get("correlacao")),
            "associacao_churn_motivo": churn_motive_association,
        },
        "motivos": [
            {
                "motivo": str(row.get("motivo") or "Não identificado"),
                "atendimentos": int(row.get("atendimentos") or 0),
                "clientes": int(row.get("clientes") or 0),
                "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
            }
            for row in churn_motives
        ],
        "atendentes": [
            {
                "email_atendente": str(row.get("email_atendente") or ""),
                "atendente": str(row.get("atendente") or row.get("email_atendente") or "Não identificado"),
                "atendimentos": int(row.get("atendimentos") or 0),
                "clientes": int(row.get("clientes") or 0),
                "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
            }
            for row in churn_agents
        ],
        "clientes": [
            {
                "empresa_id": int(row["empresa_id"]),
                "cliente": str(row.get("cliente") or f"Cliente #{row['empresa_id']}"),
                "intranet_url": _intranet_url(int(row["empresa_id"])),
                "atendimentos": int(row.get("atendimentos") or 0),
                "motivos_distintos": int(row.get("motivos_distintos") or 0),
                "atendentes_distintos": int(row.get("atendentes_distintos") or 0),
                "duracao_media_segundos": _float_or_none(row.get("duracao_media_segundos")),
                "duracao_total_segundos": float(row.get("duracao_total_segundos") or 0),
            }
            for row in churn_clients
        ],
    }

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
        "periodo": {"ano": year, "mes": month, "inicio": start.isoformat(), "fim": selected_end.isoformat()},
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
        "clientes_rankings": top_clients,
        "tempo_atendimento": {
            "por_sexo": time_by_sex,
            "por_faixa_etaria": time_by_age,
            "por_atendente": agents,
        },
        "churn_atendimentos": churn,
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
        last_date = date.today() - timedelta(days=1)
    return {
        "ano_inicio": 2024,
        "anos": list(range(2024, date.today().year + 1)),
        "ano_padrao": last_date.year,
        "mes_padrao": last_date.month,
        "ultima_data": last_date.isoformat(),
        "sincronizacao": get_sync_status(),
    }
