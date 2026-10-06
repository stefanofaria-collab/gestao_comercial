from __future__ import annotations

from calendar import month_name
from datetime import date, datetime
from typing import Any

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine, supabase_engine
from app.services.dashboard_cache_service import get_snapshot
from app.services.upgrade_downgrade_service import get_upgrade_downgrade_dashboard


EXCLUDED_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 517101, 380371)))
VALID_COMPANY = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER = {"todos", "cliente", "parceiro"}
VALID_DURATION = {"todos", "M", "T", "S", "A"}

VALUE_EXPR = """
CASE
    WHEN COALESCE(ep.plano_agregado, 0) > COALESCE(ep.valor, 0) THEN COALESCE(ep.plano_agregado, 0)
    ELSE COALESCE(ep.valor, 0)
END
"""
PLAN_EXPR = "REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '')"

SOURCE_FILTER = f"""
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
    AND (:plano = 'todos' OR {PLAN_EXPR} = :plano)
    AND (:duracao = 'todos' OR ep.duracao = :duracao)
"""

FATURAMENTO_SQL = text(
    f"""
    SELECT
        DATE_FORMAT(ep.pago_em, '%Y-%m-01') AS mes,
        COUNT(*) AS quantidade,
        ROUND(COALESCE(SUM({VALUE_EXPR}), 0), 2) AS valor
    FROM empresas_planos ep
    JOIN empresas e ON e.id = ep.empresa_id
    WHERE
        ep.plano_id <> 1
        AND ep.pago_em >= :inicio
        AND ep.pago_em < :fim
        AND ep.pago_em IS NOT NULL
        AND ep.status_pagamento = 1
        AND ep.nota_fiscal_servico_id IS NOT NULL
        AND ep.valor > 5
        AND ep.nome_plano NOT LIKE '%recursos%'
        AND e.id NOT IN :excluidos
        {SOURCE_FILTER}
    GROUP BY DATE_FORMAT(ep.pago_em, '%Y-%m-01')
    ORDER BY mes
    """
).bindparams(bindparam("excluidos", expanding=True))

CHURN_SQL = text(
    f"""
    SELECT
        DATE_FORMAT(DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY), '%Y-%m-01') AS mes,
        COUNT(DISTINCT ep.empresa_id) AS quantidade,
        ROUND(COALESCE(SUM({VALUE_EXPR}), 0), 2) AS valor
    FROM empresas_planos ep
    JOIN empresas e ON e.id = ep.empresa_id
    WHERE
        ep.plano_id <> 1
        AND ep.atual = 1
        AND ep.pago_em IS NOT NULL
        AND ep.nota_fiscal_servico_id IS NOT NULL
        AND ep.status_pagamento = 1
        AND ep.valor > 5
        AND ep.nome_plano NOT LIKE '%recursos%'
        AND DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY) >= :inicio
        AND DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY) < :fim
        AND e.id NOT IN :excluidos
        {SOURCE_FILTER}
    GROUP BY DATE_FORMAT(DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY), '%Y-%m-01')
    ORDER BY mes
    """
).bindparams(bindparam("excluidos", expanding=True))

PORTFOLIO_SQL = text(
    f"""
    WITH atuais AS (
        SELECT
            ep.*,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS rn
        FROM empresas_planos ep
        JOIN empresas e ON e.id = ep.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.valor > 5
            AND ep.nome_plano NOT LIKE '%recursos%'
            AND e.id NOT IN :excluidos
            {SOURCE_FILTER}
    )
    SELECT
        SUM(CASE WHEN a.data_vencimento >= CURDATE() THEN 1 ELSE 0 END) AS ativos_quantidade,
        ROUND(COALESCE(SUM(CASE WHEN a.data_vencimento >= CURDATE() THEN
            CASE WHEN COALESCE(a.plano_agregado, 0) > COALESCE(a.valor, 0) THEN COALESCE(a.plano_agregado, 0) ELSE COALESCE(a.valor, 0) END
            ELSE 0 END), 0), 2) AS ativos_valor,
        SUM(CASE WHEN a.data_vencimento < CURDATE() AND DATEDIFF(CURDATE(), a.data_vencimento) BETWEEN 1 AND 59 THEN 1 ELSE 0 END) AS atrasados_quantidade,
        ROUND(COALESCE(SUM(CASE WHEN a.data_vencimento < CURDATE() AND DATEDIFF(CURDATE(), a.data_vencimento) BETWEEN 1 AND 59 THEN
            CASE WHEN COALESCE(a.plano_agregado, 0) > COALESCE(a.valor, 0) THEN COALESCE(a.plano_agregado, 0) ELSE COALESCE(a.valor, 0) END
            ELSE 0 END), 0), 2) AS atrasados_valor,
        SUM(CASE WHEN a.data_vencimento >= CURDATE() AND a.data_vencimento < DATE_ADD(CURDATE(), INTERVAL 31 DAY) THEN 1 ELSE 0 END) AS vencimentos_30_quantidade,
        ROUND(COALESCE(SUM(CASE WHEN a.data_vencimento >= CURDATE() AND a.data_vencimento < DATE_ADD(CURDATE(), INTERVAL 31 DAY) THEN
            CASE WHEN COALESCE(a.plano_agregado, 0) > COALESCE(a.valor, 0) THEN COALESCE(a.plano_agregado, 0) ELSE COALESCE(a.valor, 0) END
            ELSE 0 END), 0), 2) AS vencimentos_30_valor
    FROM atuais a
    WHERE a.rn = 1
    """
).bindparams(bindparam("excluidos", expanding=True))

ATTENDANCE_SQL = text(
    """
    SELECT
        TO_CHAR(DATE_TRUNC('month', z.data), 'YYYY-MM-01') AS mes,
        COUNT(*) AS atendimentos,
        COUNT(DISTINCT z.empresa_id) FILTER (WHERE z.empresa_id IS NOT NULL) AS clientes
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE
        z.data >= :inicio
        AND z.data < :fim
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
        AND (:plano = 'todos' OR c.plano = :plano)
        AND (:duracao = 'todos' OR c.duracao = :duracao)
    GROUP BY DATE_TRUNC('month', z.data)
    ORDER BY DATE_TRUNC('month', z.data)
    """
)


def _next_month(year: int, month: int) -> date:
    if month == 12:
        return date(year + 1, 1, 1)
    return date(year, month + 1, 1)


def _validate(empresa: str, origem: str, pagador: str, duracao: str) -> None:
    if empresa not in VALID_COMPANY:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")
    if duracao not in VALID_DURATION:
        raise ValueError("Filtro de duração inválido.")


def _months(year: int, months: list[int]) -> list[int]:
    clean = sorted({int(value) for value in months if 1 <= int(value) <= 12})
    if not clean:
        raise ValueError("Informe ao menos um mês.")
    if year < 2024:
        raise ValueError("O histórico começa em 2024.")
    return clean


def _as_float(value: Any) -> float:
    return round(float(value or 0), 2)


def _as_int(value: Any) -> int:
    return int(value or 0)


def _month_key(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m")
    return str(value)[:7]


def _score_contacts(empresa: str, origem: str, pagador: str) -> tuple[list[dict[str, Any]], Any]:
    params = {"empresa": empresa, "origem": origem, "pagador": pagador}
    snapshot = get_snapshot("churn-score.contacts", params)
    if snapshot and isinstance(snapshot.get("payload"), dict):
        rows = snapshot["payload"].get("contatos")
        if isinstance(rows, list):
            return [dict(row) for row in rows if isinstance(row, dict)], snapshot.get("updated_at")

    base_params = {"empresa": "todos", "origem": "todos", "pagador": "todos"}
    base = get_snapshot("churn-score.contacts", base_params)
    if base and isinstance(base.get("payload"), dict):
        rows = base["payload"].get("contatos")
        if isinstance(rows, list):
            return [dict(row) for row in rows if isinstance(row, dict)], base.get("updated_at")
    return [], None


def _contact_matches(row: dict[str, Any], empresa: str, origem: str, pagador: str, plano: str, duracao: str) -> bool:
    modalidade = str(row.get("modalidade") or "")
    row_origin = str(row.get("origem") or "")
    row_payer = str(row.get("pagador") or "")
    row_plan = str(row.get("nome_plano") or "")
    row_duration = str(row.get("duracao") or "")

    if empresa == "gestaoclick" and modalidade != "ERP":
        return False
    if empresa == "clicknotas" and modalidade not in {"NFE", "FIS"}:
        return False
    if origem == "gestaoclick" and row_origin != "GestãoClick":
        return False
    if origem == "parceiro" and row_origin != "Parceiro":
        return False
    if pagador == "cliente" and row_payer != "Cliente":
        return False
    if pagador == "parceiro" and row_payer != "Parceiro":
        return False
    if plano != "todos" and row_plan != plano:
        return False
    if duracao != "todos" and row_duration != duracao:
        return False
    return True


def get_indicadores_dashboard(
    *,
    ano: int,
    meses: list[int],
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    plano: str = "todos",
    duracao: str = "todos",
) -> dict[str, Any]:
    _validate(empresa, origem, pagador, duracao)
    selected_months = _months(ano, meses)
    inicio = date(ano, selected_months[0], 1)
    fim = _next_month(ano, selected_months[-1])

    params = {
        "inicio": inicio,
        "fim": fim,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "plano": plano,
        "duracao": duracao,
        "excluidos": EXCLUDED_IDS,
    }

    with source_engine.connect() as connection:
        faturamento_rows = [dict(row) for row in connection.execute(FATURAMENTO_SQL, params).mappings().all()]
        churn_rows = [dict(row) for row in connection.execute(CHURN_SQL, params).mappings().all()]
        portfolio = dict(connection.execute(PORTFOLIO_SQL, params).mappings().first() or {})

    with supabase_engine.connect() as connection:
        attendance_rows = [dict(row) for row in connection.execute(ATTENDANCE_SQL, params).mappings().all()]

    try:
        upgrade = get_upgrade_downgrade_dashboard(
            ano=ano,
            meses=selected_months,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
            plano=plano,
            duracao=duracao,
        )
    except Exception:
        upgrade = {
            "resumo": {
                "upgrades": 0,
                "downgrades": 0,
                "saldo": 0,
                "upgrades_financeiro": 0.0,
                "downgrades_financeiro": 0.0,
                "saldo_financeiro": 0.0,
            },
            "historico": [],
        }

    contacts, score_updated_at = _score_contacts(empresa, origem, pagador)
    high_risk = [
        row for row in contacts
        if _contact_matches(row, empresa, origem, pagador, plano, duracao)
        and str(row.get("faixa_risco") or "") in {"Alto", "Muito alto"}
    ]
    high_risk_value = round(sum(float(row.get("valor") or 0) for row in high_risk), 2)

    month_map: dict[str, dict[str, Any]] = {}
    for month in selected_months:
        key = f"{ano:04d}-{month:02d}"
        month_map[key] = {
            "mes": key,
            "numero_mes": month,
            "faturamento_valor": 0.0,
            "faturamento_quantidade": 0,
            "churn_valor": 0.0,
            "churn_quantidade": 0,
            "atendimentos": 0,
            "clientes_atendidos": 0,
            "upgrades": 0,
            "downgrades": 0,
            "saldo_upgrade_downgrade": 0,
            "upgrades_financeiro": 0.0,
            "downgrades_financeiro": 0.0,
            "saldo_upgrade_downgrade_financeiro": 0.0,
        }

    for row in faturamento_rows:
        key = _month_key(row.get("mes"))
        if key in month_map:
            month_map[key]["faturamento_valor"] = _as_float(row.get("valor"))
            month_map[key]["faturamento_quantidade"] = _as_int(row.get("quantidade"))

    for row in churn_rows:
        key = _month_key(row.get("mes"))
        if key in month_map:
            month_map[key]["churn_valor"] = _as_float(row.get("valor"))
            month_map[key]["churn_quantidade"] = _as_int(row.get("quantidade"))

    for row in attendance_rows:
        key = _month_key(row.get("mes"))
        if key in month_map:
            month_map[key]["atendimentos"] = _as_int(row.get("atendimentos"))
            month_map[key]["clientes_atendidos"] = _as_int(row.get("clientes"))

    for row in upgrade.get("historico", []):
        key = str(row.get("mes") or "")[:7]
        if key not in month_map:
            continue
        month_map[key]["upgrades"] = _as_int(row.get("upgrades"))
        month_map[key]["downgrades"] = _as_int(row.get("downgrades"))
        month_map[key]["saldo_upgrade_downgrade"] = _as_int(row.get("saldo"))
        month_map[key]["upgrades_financeiro"] = _as_float(row.get("upgrades_financeiro"))
        month_map[key]["downgrades_financeiro"] = _as_float(row.get("downgrades_financeiro"))
        month_map[key]["saldo_upgrade_downgrade_financeiro"] = _as_float(row.get("saldo_financeiro"))

    faturamento_valor = round(sum(item["faturamento_valor"] for item in month_map.values()), 2)
    faturamento_quantidade = sum(item["faturamento_quantidade"] for item in month_map.values())
    churn_valor = round(sum(item["churn_valor"] for item in month_map.values()), 2)
    churn_quantidade = sum(item["churn_quantidade"] for item in month_map.values())
    atendimentos = sum(item["atendimentos"] for item in month_map.values())
    clientes_atendidos = sum(item["clientes_atendidos"] for item in month_map.values())
    ud_summary = upgrade.get("resumo", {})

    return {
        "periodo": {
            "ano": ano,
            "meses": selected_months,
            "inicio": inicio.isoformat(),
            "fim": (fim.replace(day=1)).isoformat(),
            "ano_completo": selected_months == list(range(1, 13)),
        },
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "plano": plano,
            "duracao": duracao,
        },
        "resumo": {
            "faturamento_valor": faturamento_valor,
            "faturamento_quantidade": faturamento_quantidade,
            "ativos_quantidade": _as_int(portfolio.get("ativos_quantidade")),
            "ativos_valor": _as_float(portfolio.get("ativos_valor")),
            "atrasados_quantidade": _as_int(portfolio.get("atrasados_quantidade")),
            "atrasados_valor": _as_float(portfolio.get("atrasados_valor")),
            "churn_quantidade": churn_quantidade,
            "churn_valor": churn_valor,
            "alto_risco_quantidade": len(high_risk),
            "alto_risco_valor": high_risk_value,
            "vencimentos_30_quantidade": _as_int(portfolio.get("vencimentos_30_quantidade")),
            "vencimentos_30_valor": _as_float(portfolio.get("vencimentos_30_valor")),
            "atendimentos": atendimentos,
            "clientes_atendidos": clientes_atendidos,
            "upgrades": _as_int(ud_summary.get("upgrades")),
            "downgrades": _as_int(ud_summary.get("downgrades")),
            "saldo_upgrade_downgrade": _as_int(ud_summary.get("saldo")),
            "upgrades_financeiro": _as_float(ud_summary.get("upgrades_financeiro")),
            "downgrades_financeiro": _as_float(ud_summary.get("downgrades_financeiro")),
            "saldo_upgrade_downgrade_financeiro": _as_float(ud_summary.get("saldo_financeiro")),
        },
        "mensal": [month_map[key] for key in sorted(month_map)],
        "churn_score_atualizado_em": score_updated_at.isoformat() if hasattr(score_updated_at, "isoformat") else score_updated_at,
    }
