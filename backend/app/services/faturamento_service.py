from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from calendar import monthrange

from sqlalchemy import bindparam, text

from app.database import source_engine, supabase_engine
from app.services.global_filter_context import current_duration, current_plan, period_bounds as global_period_bounds, previous_period_bounds as global_previous_period_bounds


EMPRESAS_EXCLUIDAS = (
    1, 24, 43, 2054, 123242, 216321, 346439, 388198, 196044, 10744,
    11807, 166104, 200440, 177551, 209512, 261147, 463295, 458966,
    403472, 226637, 414735, 361435, 376050, 367178, 263918, 447481,
    48142, 438358, 239292, 376338, 479723, 480921, 481136, 479405,
    482279, 124451, 174166, 184848, 186733, 248366, 444241, 462938,
    473336, 476148, 480590, 485458, 487138, 487525, 193364, 267891,
    369137, 484832, 3897, 209986, 334995, 423464, 379294, 278505,
    363585, 202297, 487136, 495757, 74618, 448705, 492276, 493057,
    493495, 495367, 495470, 500211, 500213, 500508, 500582, 502764,
    497959, 510928, 514140, 187078, 521671, 224287,
)

DIMENSION_FILTER_SQL = """
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

GENERAL_TOTAL_SQL = text(
    """
    SELECT
        ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor,
        COUNT(*) AS quantidade_notas
    FROM notas_fiscais_servicos nfs
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_inicio
        AND nfs.data_emissao < :data_fim
    """
)

FILTERED_TOTAL_SQL = text(
    f"""
    SELECT
        ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor,
        COUNT(*) AS quantidade_notas
    FROM notas_fiscais_servicos nfs
    JOIN empresas_planos ep ON nfs.plano_id = ep.id
    JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_inicio
        AND nfs.data_emissao < :data_fim
        AND e.id NOT IN :excluidos
        {DIMENSION_FILTER_SQL}
    """
).bindparams(bindparam("excluidos", expanding=True))


RECENT_NFS_ROWS_SQL = text(
    """
    SELECT
        nfs.id,
        nfs.data_emissao,
        nfs.valor_total,
        nfs.plano_id,
        nfs.loja_id,
        nfs.situacao,
        ep.empresa_id AS cliente_empresa_id,
        ep.nome_plano,
        ep.duracao,
        e.modalidade,
        e.empresa_indicacao_id,
        e.tipo_cobranca,
        e.ativou_em
    FROM notas_fiscais_servicos nfs
    LEFT JOIN empresas_planos ep ON ep.id = nfs.plano_id
    LEFT JOIN empresas e ON e.id = ep.empresa_id
    WHERE
        nfs.empresa_id = 1
        AND nfs.id < :cursor
    ORDER BY nfs.id DESC
    LIMIT 5000
    """
)

CACHED_HISTORY_SQL = text(
    """
    SELECT payload
    FROM public.dashboard_daily_cache
    WHERE page = 'faturamento.historico'
      AND params->>'empresa' = :empresa
      AND params->>'origem' = :origem
      AND params->>'pagador' = :pagador
      AND payload IS NOT NULL
    ORDER BY source_date DESC, updated_at DESC
    LIMIT 1
    """
)

PLAN_COMPARE_SQL = text(
    f"""
    SELECT
        CASE
            WHEN e.modalidade = 'ERP' THEN 'GestãoClick'
            WHEN e.modalidade IN ('NFE', 'FIS') THEN 'ClickNotas'
            ELSE 'Outros'
        END AS empresa,
        CASE
            WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick'
            ELSE 'Parceiro'
        END AS origem,
        CASE
            WHEN e.tipo_cobranca = 'E' THEN 'Cliente'
            WHEN e.tipo_cobranca = 'P' THEN 'Parceiro'
            ELSE 'Não informado'
        END AS pagador,
        REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
        ep.duracao,
        ROUND(COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_inicio
             AND nfs.data_emissao < :data_fim
            THEN nfs.valor_total ELSE 0 END), 0), 2) AS atual,
        ROUND(COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_anterior_inicio
             AND nfs.data_emissao < :data_anterior_fim
            THEN nfs.valor_total ELSE 0 END), 0), 2) AS anterior,
        COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_inicio
             AND nfs.data_emissao < :data_fim
            THEN 1 ELSE 0 END), 0) AS quantidade_atual,
        COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_anterior_inicio
             AND nfs.data_emissao < :data_anterior_fim
            THEN 1 ELSE 0 END), 0) AS quantidade_anterior
    FROM notas_fiscais_servicos nfs
    JOIN empresas_planos ep ON nfs.plano_id = ep.id
    JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_anterior_inicio
        AND nfs.data_emissao < :data_fim
        AND e.id NOT IN :excluidos
        {DIMENSION_FILTER_SQL}
    GROUP BY empresa, origem, pagador, nome_plano, ep.duracao
    HAVING atual <> 0 OR anterior <> 0
    ORDER BY atual DESC
    """
).bindparams(bindparam("excluidos", expanding=True))

PLAN_DETAIL_DURATION_SQL = text(
    f"""
    SELECT
        ep.duracao,
        ROUND(COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_inicio
             AND nfs.data_emissao < :data_fim
            THEN nfs.valor_total ELSE 0 END), 0), 2) AS atual,
        ROUND(COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_anterior_inicio
             AND nfs.data_emissao < :data_anterior_fim
            THEN nfs.valor_total ELSE 0 END), 0), 2) AS anterior,
        COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_inicio
             AND nfs.data_emissao < :data_fim
            THEN 1 ELSE 0 END), 0) AS quantidade_atual,
        COALESCE(SUM(CASE
            WHEN nfs.data_emissao >= :data_anterior_inicio
             AND nfs.data_emissao < :data_anterior_fim
            THEN 1 ELSE 0 END), 0) AS quantidade_anterior
    FROM notas_fiscais_servicos nfs
    JOIN empresas_planos ep ON nfs.plano_id = ep.id
    JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_anterior_inicio
        AND nfs.data_emissao < :data_fim
        AND e.id NOT IN :excluidos
        AND REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = :plano
        {DIMENSION_FILTER_SQL}
    GROUP BY ep.duracao
    """
).bindparams(bindparam("excluidos", expanding=True))

PLAN_12M_HISTORY_SQL = text(
    f"""
    SELECT
        YEAR(nfs.data_emissao) AS ano,
        MONTH(nfs.data_emissao) AS mes,
        ep.duracao,
        ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor,
        COUNT(*) AS quantidade_notas
    FROM notas_fiscais_servicos nfs
    JOIN empresas_planos ep ON nfs.plano_id = ep.id
    JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_inicio
        AND nfs.data_emissao < :data_fim
        AND e.id NOT IN :excluidos
        AND REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = :plano
        {DIMENSION_FILTER_SQL}
    GROUP BY YEAR(nfs.data_emissao), MONTH(nfs.data_emissao), ep.duracao
    ORDER BY ano, mes
    """
).bindparams(bindparam("excluidos", expanding=True))

HISTORY_GENERAL_SQL = text(
    """
    SELECT
        YEAR(nfs.data_emissao) AS ano,
        MONTH(nfs.data_emissao) AS mes,
        ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS faturamento_geral,
        COUNT(*) AS quantidade_notas
    FROM notas_fiscais_servicos nfs
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_inicio
        AND nfs.data_emissao < :data_fim
    GROUP BY YEAR(nfs.data_emissao), MONTH(nfs.data_emissao)
    ORDER BY ano, mes
    """
)

HISTORY_FILTERED_SQL = text(
    f"""
    SELECT
        YEAR(nfs.data_emissao) AS ano,
        MONTH(nfs.data_emissao) AS mes,
        ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS faturamento_geral,
        COUNT(*) AS quantidade_notas
    FROM notas_fiscais_servicos nfs
    JOIN empresas_planos ep ON nfs.plano_id = ep.id
    JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        nfs.empresa_id = 1
        AND nfs.situacao < 4
        AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
        AND nfs.data_emissao >= :data_inicio
        AND nfs.data_emissao < :data_fim
        AND e.id NOT IN :excluidos
        {DIMENSION_FILTER_SQL}
    GROUP BY YEAR(nfs.data_emissao), MONTH(nfs.data_emissao)
    ORDER BY ano, mes
    """
).bindparams(bindparam("excluidos", expanding=True))

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}
VALID_COMPARE_MODES = {"mes_completo", "mesmo_periodo_atual"}


def _as_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _month_start(year: int, month: int) -> date:
    if month == 0:
        return date(year, 1, 1)
    return date(year, month, 1)


def _next_month(year: int, month: int) -> date:
    if month == 0:
        return date(year + 1, 1, 1)
    if month == 12:
        return date(year + 1, 1, 1)
    return date(year, month + 1, 1)


def _period_bounds(year: int, month: int) -> tuple[date, date]:
    return global_period_bounds(year, month, current_mode="today_exclusive")

def _previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 0:
        return year - 1, 0
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _previous_period_bounds(year: int, month: int, current_end: date) -> tuple[int, int, date, date]:
    return global_previous_period_bounds(year, month, current_end)

def _variation(current: float, previous: float) -> tuple[float, float | None]:
    delta = current - previous
    if previous == 0:
        return delta, None
    return delta, (delta / previous) * 100


def _duration_label(value: str | None) -> str:
    return {
        "M": "Mensal",
        "T": "Trimestral",
        "S": "Semestral",
        "A": "Anual",
    }.get(value or "", value or "Não informado")


def _validate(year: int, month: int, empresa: str, origem: str, pagador: str) -> None:
    today = date.today()
    if year < 2024:
        raise ValueError("O histórico de faturamento começa em 2024.")
    if month < 0 or month > 12:
        raise ValueError("Mês inválido.")
    if year > today.year or (year == today.year and month != 0 and month > today.month):
        raise ValueError("Não é possível consultar um período futuro.")
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _validate_compare_mode(mode: str) -> None:
    if mode not in VALID_COMPARE_MODES:
        raise ValueError("Modo de comparação inválido.")


def _filters_active(empresa: str, origem: str, pagador: str) -> bool:
    return (
        empresa != "todos"
        or origem != "todos"
        or pagador != "todos"
        or current_plan() != "todos"
        or current_duration() != "todos"
    )


def _period_params(year: int, month: int, empresa: str, origem: str, pagador: str) -> dict:
    current_start, current_end = _period_bounds(year, month)
    previous_year, previous_month, previous_start, previous_end = _previous_period_bounds(year, month, current_end)
    return {
        "data_inicio": current_start,
        "data_fim": current_end,
        "data_anterior_inicio": previous_start,
        "data_anterior_fim": previous_end,
        "ano_inicio": min(previous_start.year, current_start.year),
        "ano_fim": (current_end - timedelta(days=1)).year,
        "ano_anterior": previous_year,
        "mes_anterior": previous_month,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": EMPRESAS_EXCLUIDAS,
    }


def _single_row(result) -> dict:
    row = result.first()
    return dict(row._mapping) if row else {}


def _aggregate_dimension(rows: list[dict], field: str) -> list[dict]:
    grouped: defaultdict[str, dict] = defaultdict(lambda: {"valor": 0.0, "quantidade": 0})
    for row in rows:
        label = str(row.get(field) or "Não informado")
        grouped[label]["valor"] += _as_float(row.get("atual"))
        grouped[label]["quantidade"] += int(row.get("quantidade_atual") or 0)

    total_valor = sum(item["valor"] for item in grouped.values())
    total_quantidade = sum(item["quantidade"] for item in grouped.values())

    return [
        {
            "label": label,
            "valor": values["valor"],
            "percentual": (values["valor"] / total_valor * 100) if total_valor else 0.0,
            "quantidade": values["quantidade"],
            "percentual_quantidade": (values["quantidade"] / total_quantidade * 100) if total_quantidade else 0.0,
        }
        for label, values in sorted(grouped.items(), key=lambda item: item[1]["valor"], reverse=True)
    ]


def _safe_replace_year(target: date, year: int) -> date:
    last_day = monthrange(year, target.month)[1]
    return date(year, target.month, min(target.day, last_day))


def _selected_period_end(year: int, month: int, compare_mode: str) -> date:
    start, period_end = _period_bounds(year, month)
    today = date.today()
    if month == 0:
        return period_end
    if compare_mode == "mesmo_periodo_atual" and (year, month) == (today.year, today.month):
        return min(period_end, today + timedelta(days=1))
    return period_end


def _comparison_context(year: int, month: int, compare_mode: str) -> dict:
    _validate_compare_mode(compare_mode)
    start, _ = _period_bounds(year, month)
    end = _selected_period_end(year, month, compare_mode)
    previous_year, previous_month, previous_start, previous_end = _previous_period_bounds(year, month, end)

    previous_years: list[int] = []
    if year - 1 >= 2024:
        previous_years.append(year - 1)
    if year - 2 >= 2024:
        previous_years.append(year - 2)

    same_period_ranges = []
    for target_year in previous_years:
        if month == 0:
            target_start = date(target_year, 1, 1)
            target_end = _safe_replace_year(end, target_year) if year == date.today().year else date(target_year + 1, 1, 1)
        else:
            target_start = date(target_year, month, 1)
            elapsed_days = (end - start).days
            target_end = min(_next_month(target_year, month), target_start + timedelta(days=elapsed_days))
        same_period_ranges.append({
            "ano": target_year,
            "data_inicio": target_start,
            "data_fim": target_end,
        })

    current_ytd_start = date(year, 1, 1)
    ytd_ranges = []
    for target_year in previous_years:
        if month == 0:
            target_end = _safe_replace_year(end, target_year) if year == date.today().year else date(target_year + 1, 1, 1)
        else:
            target_end = _safe_replace_year(end, target_year)
        ytd_ranges.append({
            "ano": target_year,
            "data_inicio": date(target_year, 1, 1),
            "data_fim": target_end,
        })

    return {
        "periodo_atual": {"data_inicio": start, "data_fim": end},
        "mes_anterior": {"data_inicio": previous_start, "data_fim": previous_end, "ano": previous_year, "mes": previous_month},
        "mesmo_mes_anos_anteriores": same_period_ranges,
        "acumulado_ano_atual": {"ano": year, "data_inicio": current_ytd_start, "data_fim": end},
        "acumulado_anos_anteriores": ytd_ranges,
        "modo": compare_mode,
    }




def _row_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value:
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return None
    return None


def _normalized_plan_name(value) -> str:
    return str(value or "Não informado").replace(" (+) recursos", "").replace(" + recursos", "").strip()


def _dimension_labels(row: dict) -> tuple[str, str, str]:
    modalidade = str(row.get("modalidade") or "")
    empresa = "GestãoClick" if modalidade == "ERP" else ("ClickNotas" if modalidade in {"NFE", "FIS"} else "Outros")
    origem = "GestãoClick" if int(row.get("empresa_indicacao_id") or 0) == 1 else "Parceiro"
    tipo = str(row.get("tipo_cobranca") or "")
    pagador = "Cliente" if tipo == "E" else ("Parceiro" if tipo == "P" else "Não informado")
    return empresa, origem, pagador


def _row_matches_dimensions(row: dict, empresa: str, origem: str, pagador: str) -> bool:
    company_id = row.get("cliente_empresa_id")
    if company_id is None or int(company_id) in EMPRESAS_EXCLUIDAS:
        return False
    label_empresa, label_origem, label_pagador = _dimension_labels(row)
    if empresa == "gestaoclick" and label_empresa != "GestãoClick":
        return False
    if empresa == "clicknotas" and label_empresa != "ClickNotas":
        return False
    if origem == "gestaoclick" and label_origem != "GestãoClick":
        return False
    if origem == "parceiro" and label_origem != "Parceiro":
        return False
    if pagador == "cliente" and label_pagador != "Cliente":
        return False
    if pagador == "parceiro" and label_pagador != "Parceiro":
        return False
    selected_plan = current_plan()
    selected_duration = current_duration()
    if selected_plan != "todos" and _normalized_plan_name(row.get("nome_plano")) != selected_plan:
        return False
    if selected_duration != "todos" and str(row.get("duracao") or "") != selected_duration:
        return False
    return True


@lru_cache(maxsize=32)
def _scan_recent_invoice_rows(start_iso: str, end_iso: str, day_key: str) -> tuple[dict, ...]:
    """Lê o período recente pela chave primária, evitando varrer NFS por data."""
    start = date.fromisoformat(start_iso)
    end = date.fromisoformat(end_iso)
    cursor = 9223372036854775807
    collected: list[dict] = []
    older_batches = 0

    with source_engine.connect() as connection:
        for _ in range(80):
            rows = [
                dict(row)
                for row in connection.execute(RECENT_NFS_ROWS_SQL, {"cursor": cursor}).mappings().all()
            ]
            if not rows:
                break
            cursor = min(int(row["id"]) for row in rows)
            dates = [_row_date(row.get("data_emissao")) for row in rows]
            valid_dates = [value for value in dates if value is not None]

            for row in rows:
                emitted = _row_date(row.get("data_emissao"))
                if emitted and start <= emitted < end:
                    collected.append(row)

            if valid_dates and max(valid_dates) < start:
                older_batches += 1
            else:
                older_batches = 0

            if older_batches >= 2:
                break
        else:
            raise RuntimeError("Não foi possível delimitar o período recente de faturamento pelo identificador das notas.")

    return tuple(collected)


def _fast_current_month_pair(
    year: int,
    month: int,
    empresa: str,
    origem: str,
    pagador: str,
    day_key: str,
) -> dict:
    today = date.fromisoformat(day_key)
    if year != today.year or month != today.month:
        raise ValueError("A leitura rápida só é usada no mês corrente.")

    params = _period_params(year, month, empresa, origem, pagador)
    current_start = params["data_inicio"]
    current_end = params["data_fim"]
    previous_start = params["data_anterior_inicio"]
    previous_end = params["data_anterior_fim"]
    rows = _scan_recent_invoice_rows(previous_start.isoformat(), current_end.isoformat(), day_key)
    filters_active = _filters_active(empresa, origem, pagador)

    totals = {
        "current": {"valor": 0.0, "quantidade_notas": 0},
        "previous": {"valor": 0.0, "quantidade_notas": 0},
    }
    components = {
        key: {
            "current": {"valor": 0.0, "quantidade_notas": 0},
            "previous": {"valor": 0.0, "quantidade_notas": 0},
        }
        for key in ["novos_clientes", "renovacoes", "recursos", "servicos", "certclick"]
    }
    plans: dict[tuple, dict] = {}

    for row in rows:
        situacao = row.get("situacao")
        if situacao is None or int(situacao) >= 4:
            continue
        emitted = _row_date(row.get("data_emissao"))
        if emitted is None:
            continue
        if current_start <= emitted < current_end:
            bucket = "current"
            period_start = current_start
        elif previous_start <= emitted < previous_end:
            bucket = "previous"
            period_start = previous_start
        else:
            continue

        business_match = _row_matches_dimensions(row, empresa, origem, pagador)
        valid_total = business_match if filters_active else True
        amount = _as_float(row.get("valor_total"))

        if valid_total:
            totals[bucket]["valor"] += amount
            totals[bucket]["quantidade_notas"] += 1

        if business_match:
            label_empresa, label_origem, label_pagador = _dimension_labels(row)
            plan_name = _normalized_plan_name(row.get("nome_plano"))
            duration = str(row.get("duracao") or "")
            plan_key = (label_empresa, label_origem, label_pagador, plan_name, duration)
            item = plans.setdefault(
                plan_key,
                {
                    "empresa": label_empresa,
                    "origem": label_origem,
                    "pagador": label_pagador,
                    "nome_plano": plan_name,
                    "duracao": duration,
                    "atual": 0.0,
                    "anterior": 0.0,
                    "quantidade_atual": 0,
                    "quantidade_anterior": 0,
                },
            )
            if bucket == "current":
                item["atual"] += amount
                item["quantidade_atual"] += 1
            else:
                item["anterior"] += amount
                item["quantidade_anterior"] += 1

            raw_plan = str(row.get("nome_plano") or "")
            is_resource = "recursos" in raw_plan.lower()
            loja_id = int(row.get("loja_id") or 0)
            activation = _row_date(row.get("ativou_em"))

            if is_resource:
                components["recursos"][bucket]["valor"] += amount
                components["recursos"][bucket]["quantidade_notas"] += 1
            elif loja_id == 114 and activation == emitted:
                components["novos_clientes"][bucket]["valor"] += amount
                components["novos_clientes"][bucket]["quantidade_notas"] += 1
            elif loja_id == 114 and activation is not None and activation < period_start:
                components["renovacoes"][bucket]["valor"] += amount
                components["renovacoes"][bucket]["quantidade_notas"] += 1

        if not filters_active:
            loja_id = int(row.get("loja_id") or 0)
            if row.get("plano_id") is None and loja_id == 114:
                components["servicos"][bucket]["valor"] += amount
                components["servicos"][bucket]["quantidade_notas"] += 1
            if loja_id == 304927:
                components["certclick"][bucket]["valor"] += amount
                components["certclick"][bucket]["quantidade_notas"] += 1

    for bucket in ("current", "previous"):
        total = totals[bucket]
        total["valor"] = round(float(total["valor"]), 2)
        total["ticket_medio"] = total["valor"] / total["quantidade_notas"] if total["quantidade_notas"] else 0.0
        for key in components:
            metric = components[key][bucket]
            metric["valor"] = round(float(metric["valor"]), 2)
            metric["ticket_medio"] = metric["valor"] / metric["quantidade_notas"] if metric["quantidade_notas"] else 0.0

    plan_rows = []
    for item in plans.values():
        item["atual"] = round(float(item["atual"]), 2)
        item["anterior"] = round(float(item["anterior"]), 2)
        if item["atual"] or item["anterior"]:
            plan_rows.append(item)
    plan_rows.sort(key=lambda row: float(row["atual"]), reverse=True)

    return {
        "totals": totals,
        "components": components,
        "plan_rows": plan_rows,
        "periodo": {
            "current_start": current_start.isoformat(),
            "current_end": current_end.isoformat(),
            "previous_start": previous_start.isoformat(),
            "previous_end": previous_end.isoformat(),
        },
    }


def _is_current_month(year: int, month: int) -> bool:
    today = date.today()
    return year == today.year and month == today.month


def _cached_history_points(empresa: str, origem: str, pagador: str) -> list[dict]:
    try:
        with supabase_engine.connect() as connection:
            row = connection.execute(
                CACHED_HISTORY_SQL,
                {"empresa": empresa, "origem": origem, "pagador": pagador},
            ).mappings().first()
    except Exception:
        return []
    payload = (row or {}).get("payload") or {}
    return [dict(item) for item in (payload.get("pontos") or [])]

def _total_sql(filters_active: bool):
    return FILTERED_TOTAL_SQL if filters_active else GENERAL_TOTAL_SQL


def _base_params(start: date, end: date, empresa: str, origem: str, pagador: str) -> dict:
    # data_emissao_ano existe na base oficial e é muito mais barata para o
    # otimizador usar como primeiro corte do que varrer toda a tabela apenas
    # por data_emissao. O filtro de data continua sendo a regra definitiva.
    last_inclusive = end - timedelta(days=1)
    return {
        "data_inicio": start,
        "data_fim": end,
        "ano_inicio": start.year,
        "ano_fim": last_inclusive.year,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": EMPRESAS_EXCLUIDAS,
    }


def _fetch_total_metrics(connection, start: date, end: date, empresa: str, origem: str, pagador: str) -> dict:
    params = _base_params(start, end, empresa, origem, pagador)
    sql = _total_sql(_filters_active(empresa, origem, pagador))
    row = _single_row(connection.execute(sql, params))
    total = _as_float(row.get("valor"))
    count = int(row.get("quantidade_notas") or 0)
    ticket = total / count if count else 0.0
    return {"valor": total, "quantidade_notas": count, "ticket_medio": ticket}


def _component_query(component: str, filters_active: bool):
    if component == "recursos":
        return text(
            f"""
            SELECT ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor, COUNT(*) AS quantidade_notas
            FROM notas_fiscais_servicos nfs
            JOIN empresas_planos ep ON nfs.plano_id = ep.id
            JOIN empresas e ON ep.empresa_id = e.id
            WHERE nfs.empresa_id = 1
              AND nfs.situacao < 4
              AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
              AND nfs.data_emissao >= :data_inicio
              AND nfs.data_emissao < :data_fim
              AND e.id NOT IN :excluidos
              AND ep.nome_plano LIKE '%recursos%'
              {DIMENSION_FILTER_SQL}
            """
        ).bindparams(bindparam("excluidos", expanding=True))
    if component == "novos_clientes":
        return text(
            f"""
            SELECT ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor, COUNT(*) AS quantidade_notas
            FROM notas_fiscais_servicos nfs
            JOIN empresas_planos ep ON nfs.plano_id = ep.id
            JOIN empresas e ON ep.empresa_id = e.id
            WHERE nfs.empresa_id = 1
              AND nfs.situacao < 4
              AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
              AND nfs.data_emissao >= :data_inicio
              AND nfs.data_emissao < :data_fim
              AND e.id NOT IN :excluidos
              AND nfs.loja_id = 114
              AND ep.nome_plano NOT LIKE '%recursos%'
              AND DATE(e.ativou_em) = DATE(nfs.data_emissao)
              {DIMENSION_FILTER_SQL}
            """
        ).bindparams(bindparam("excluidos", expanding=True))
    if component == "renovacoes":
        return text(
            f"""
            SELECT ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor, COUNT(*) AS quantidade_notas
            FROM notas_fiscais_servicos nfs
            JOIN empresas_planos ep ON nfs.plano_id = ep.id
            JOIN empresas e ON ep.empresa_id = e.id
            WHERE nfs.empresa_id = 1
              AND nfs.situacao < 4
              AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
              AND nfs.data_emissao >= :data_inicio
              AND nfs.data_emissao < :data_fim
              AND e.id NOT IN :excluidos
              AND nfs.loja_id = 114
              AND ep.nome_plano NOT LIKE '%recursos%'
              AND e.ativou_em < :data_inicio
              {DIMENSION_FILTER_SQL}
            """
        ).bindparams(bindparam("excluidos", expanding=True))
    if component == "servicos":
        if filters_active:
            return None
        return text(
            """
            SELECT ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor, COUNT(*) AS quantidade_notas
            FROM notas_fiscais_servicos nfs
            WHERE nfs.empresa_id = 1
              AND nfs.situacao < 4
              AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
              AND nfs.data_emissao >= :data_inicio
              AND nfs.data_emissao < :data_fim
              AND nfs.plano_id IS NULL
              AND nfs.loja_id = 114
            """
        )
    if component == "certclick":
        if filters_active:
            return None
        return text(
            """
            SELECT ROUND(COALESCE(SUM(nfs.valor_total), 0), 2) AS valor, COUNT(*) AS quantidade_notas
            FROM notas_fiscais_servicos nfs
            WHERE nfs.empresa_id = 1
              AND nfs.situacao < 4
              AND nfs.data_emissao_ano BETWEEN :ano_inicio AND :ano_fim
              AND nfs.data_emissao >= :data_inicio
              AND nfs.data_emissao < :data_fim
              AND nfs.loja_id = 304927
            """
        )
    raise ValueError("Componente inválido.")


def _fetch_component_metrics(connection, component: str, start: date, end: date, empresa: str, origem: str, pagador: str) -> dict:
    filters_active = _filters_active(empresa, origem, pagador)
    sql = _component_query(component, filters_active)
    if sql is None:
        return {"valor": 0.0, "quantidade_notas": 0, "ticket_medio": 0.0}
    params = _base_params(start, end, empresa, origem, pagador)
    row = _single_row(connection.execute(sql, params))
    total = _as_float(row.get("valor"))
    count = int(row.get("quantidade_notas") or 0)
    ticket = total / count if count else 0.0
    return {"valor": total, "quantidade_notas": count, "ticket_medio": ticket}


def _comparison_record(label: str, current: float, previous: float, extra: dict | None = None) -> dict:
    delta, delta_pct = _variation(current, previous)
    payload = {
        "label": label,
        "atual": current,
        "comparado": previous,
        "variacao_valor": delta,
        "variacao_percentual": delta_pct,
    }
    if extra:
        payload.update(extra)
    return payload


def _build_component_comparison(connection, component: str, year: int, month: int, empresa: str, origem: str, pagador: str, compare_mode: str) -> dict:
    context = _comparison_context(year, month, compare_mode)
    current = _fetch_component_metrics(connection, component, context["periodo_atual"]["data_inicio"], context["periodo_atual"]["data_fim"], empresa, origem, pagador)
    previous_month = _fetch_component_metrics(connection, component, context["mes_anterior"]["data_inicio"], context["mes_anterior"]["data_fim"], empresa, origem, pagador)
    current_ytd = _fetch_component_metrics(connection, component, context["acumulado_ano_atual"]["data_inicio"], context["acumulado_ano_atual"]["data_fim"], empresa, origem, pagador)

    same_month = []
    for ref in context["mesmo_mes_anos_anteriores"]:
        metrics = _fetch_component_metrics(connection, component, ref["data_inicio"], ref["data_fim"], empresa, origem, pagador)
        label = f"Ano atual x {ref['ano']}" if month == 0 else f"Mês atual x {ref['ano']}"
        same_month.append(_comparison_record(label, current["valor"], metrics["valor"], {"ano": ref["ano"]}))

    ytd = []
    for ref in context["acumulado_anos_anteriores"]:
        metrics = _fetch_component_metrics(connection, component, ref["data_inicio"], ref["data_fim"], empresa, origem, pagador)
        ytd.append(_comparison_record(f"Acumulado do ano x {ref['ano']}", current_ytd["valor"], metrics["valor"], {"ano": ref["ano"]}))

    return {
        "modo_comparacao": compare_mode,
        "periodo_atual": {
            "ano": year,
            "mes": month,
            "data_inicio": context["periodo_atual"]["data_inicio"].isoformat(),
            "data_fim": context["periodo_atual"]["data_fim"].isoformat(),
        },
        "resumo": current,
        "variacoes": {
            "mes_anterior": _comparison_record("Ano anterior" if month == 0 else "Mês anterior", current["valor"], previous_month["valor"], {"ano": context['mes_anterior']['ano'], "mes": context['mes_anterior']['mes']}),
            "acumulado_ano": ytd,
            "mesmo_mes": same_month,
        },
    }


def _build_plan_detail(connection, plan_name: str, year: int, month: int, empresa: str, origem: str, pagador: str, compare_mode: str) -> dict:
    context = _comparison_context(year, month, compare_mode)
    plan_rows = [dict(row._mapping) for row in connection.execute(
        PLAN_DETAIL_DURATION_SQL,
        {
            "data_inicio": context["periodo_atual"]["data_inicio"],
            "data_fim": context["periodo_atual"]["data_fim"],
            "data_anterior_inicio": context["mes_anterior"]["data_inicio"],
            "data_anterior_fim": context["mes_anterior"]["data_fim"],
            "ano_inicio": min(
                context["mes_anterior"]["data_inicio"].year,
                context["periodo_atual"]["data_inicio"].year,
            ),
            "ano_fim": (context["periodo_atual"]["data_fim"] - timedelta(days=1)).year,
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "excluidos": EMPRESAS_EXCLUIDAS,
            "plano": plan_name,
        },
    )]

    by_duration = []
    total_current = 0.0
    total_previous = 0.0
    total_current_count = 0
    total_previous_count = 0
    for row in plan_rows:
        current = _as_float(row.get("atual"))
        previous = _as_float(row.get("anterior"))
        current_count = int(row.get("quantidade_atual") or 0)
        previous_count = int(row.get("quantidade_anterior") or 0)
        total_current += current
        total_previous += previous
        total_current_count += current_count
        total_previous_count += previous_count
        delta, delta_pct = _variation(current, previous)
        count_delta, count_pct = _variation(current_count, previous_count)
        by_duration.append({
            "duracao": str(row.get("duracao") or ""),
            "duracao_label": _duration_label(row.get("duracao")),
            "atual": current,
            "anterior": previous,
            "variacao_valor": delta,
            "variacao_percentual": delta_pct,
            "quantidade": current_count,
            "quantidade_anterior": previous_count,
            "variacao_quantidade": count_delta,
            "variacao_quantidade_percentual": count_pct,
        })

    previous_month_delta, previous_month_pct = _variation(total_current, total_previous)
    previous_month_count_delta, previous_month_count_pct = _variation(total_current_count, total_previous_count)

    effective_month = month if month != 0 else (date.today().month if year == date.today().year else 12)
    history_start = _month_start(year, effective_month)
    # recua 11 meses
    start_year = history_start.year
    start_month = history_start.month
    for _ in range(11):
        start_year, start_month = _previous_month(start_year, start_month)
    history_rows = [dict(row._mapping) for row in connection.execute(
        PLAN_12M_HISTORY_SQL,
        {
            "data_inicio": _month_start(start_year, start_month),
            "data_fim": _period_bounds(year, effective_month)[1],
            "ano_inicio": start_year,
            "ano_fim": (_period_bounds(year, effective_month)[1] - timedelta(days=1)).year,
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "excluidos": EMPRESAS_EXCLUIDAS,
            "plano": plan_name,
        },
    )]

    monthly_map: dict[tuple[int, int], dict] = {}
    for row in history_rows:
        key = (int(row["ano"]), int(row["mes"]))
        if key not in monthly_map:
            monthly_map[key] = {
                "ano": key[0],
                "mes": key[1],
                "label": f"{key[1]:02d}/{key[0]}",
                "Mensal": 0.0,
                "Trimestral": 0.0,
                "Semestral": 0.0,
                "Anual": 0.0,
                "total": 0.0,
                "quantidade_notas": 0,
            }
        label = _duration_label(row.get("duracao"))
        value = _as_float(row.get("valor"))
        monthly_map[key][label] = value
        monthly_map[key]["total"] += value
        monthly_map[key]["quantidade_notas"] += int(row.get("quantidade_notas") or 0)

    ordered_history = [monthly_map[key] for key in sorted(monthly_map.keys())]

    # comparativos adicionais do plano
    def plan_total_between(start: date, end: date) -> float:
        rows = [dict(row._mapping) for row in connection.execute(
            PLAN_DETAIL_DURATION_SQL,
            {
                "data_inicio": start,
                "data_fim": end,
                "data_anterior_inicio": start,
                "data_anterior_fim": start,
                "ano_inicio": start.year,
                "ano_fim": (end - timedelta(days=1)).year,
                "empresa": empresa,
                "origem": origem,
                "pagador": pagador,
                "excluidos": EMPRESAS_EXCLUIDAS,
                "plano": plan_name,
            },
        )]
        return sum(_as_float(row.get("atual")) for row in rows)

    same_month = []
    for ref in context["mesmo_mes_anos_anteriores"]:
        compared = plan_total_between(ref["data_inicio"], ref["data_fim"])
        delta, delta_pct = _variation(total_current, compared)
        same_month.append({
            "label": f"Ano atual x {ref['ano']}" if month == 0 else f"Mês atual x {ref['ano']}",
            "ano": ref["ano"],
            "atual": total_current,
            "comparado": compared,
            "variacao_valor": delta,
            "variacao_percentual": delta_pct,
        })

    current_ytd_total = plan_total_between(context["acumulado_ano_atual"]["data_inicio"], context["acumulado_ano_atual"]["data_fim"])
    ytd = []
    for ref in context["acumulado_anos_anteriores"]:
        compared = plan_total_between(ref["data_inicio"], ref["data_fim"])
        delta, delta_pct = _variation(current_ytd_total, compared)
        ytd.append({
            "label": f"Acumulado do ano x {ref['ano']}",
            "ano": ref["ano"],
            "atual": current_ytd_total,
            "comparado": compared,
            "variacao_valor": delta,
            "variacao_percentual": delta_pct,
        })

    return {
        "plano": plan_name,
        "modo_comparacao": compare_mode,
        "periodo": {
            "ano": year,
            "mes": month,
            "data_inicio": context["periodo_atual"]["data_inicio"].isoformat(),
            "data_fim": context["periodo_atual"]["data_fim"].isoformat(),
        },
        "resumo": {
            "atual": total_current,
            "anterior": total_previous,
            "variacao_valor": previous_month_delta,
            "variacao_percentual": previous_month_pct,
            "quantidade": total_current_count,
            "quantidade_anterior": total_previous_count,
            "variacao_quantidade": previous_month_count_delta,
            "variacao_quantidade_percentual": previous_month_count_pct,
        },
        "por_duracao": by_duration,
        "historico_12_meses": ordered_history,
        "variacoes": {
            "mes_anterior": {
                "label": "Ano anterior" if month == 0 else "Mês anterior",
                "atual": total_current,
                "comparado": total_previous,
                "variacao_valor": previous_month_delta,
                "variacao_percentual": previous_month_pct,
            },
            "acumulado_ano": ytd,
            "mesmo_mes": same_month,
        },
    }


def get_faturamento_total(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    params = _period_params(year, month, empresa, origem, pagador)
    previous_year = params["ano_anterior"]
    previous_month = params["mes_anterior"]
    today = date.today()

    if _is_current_month(year, month):
        fast = _fast_current_month_pair(year, month, empresa, origem, pagador, date.today().isoformat())
        current_metrics = dict(fast["totals"]["current"])
        previous_metrics = dict(fast["totals"]["previous"])
    else:
        with source_engine.connect() as connection:
            current_metrics = _fetch_total_metrics(connection, params["data_inicio"], params["data_fim"], empresa, origem, pagador)
            previous_metrics = _fetch_total_metrics(connection, params["data_anterior_inicio"], params["data_anterior_fim"], empresa, origem, pagador)

    current = current_metrics["valor"]
    previous = previous_metrics["valor"]

    if year == 2024 and month in (0, 1):
        previous = 0.0
        previous_available = False
    else:
        previous_available = True

    delta, delta_pct = _variation(current, previous)
    notes_delta, notes_pct = _variation(current_metrics["quantidade_notas"], previous_metrics["quantidade_notas"])
    ticket_delta, ticket_pct = _variation(current_metrics["ticket_medio"], previous_metrics["ticket_medio"])

    return {
        "periodo": {
            "ano": year,
            "mes": month,
            "data_inicio": params["data_inicio"].isoformat(),
            "data_fim": params["data_fim"].isoformat(),
            "parcial": year == today.year and (month == 0 or month == today.month),
            "ano_completo": month == 0,
        },
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "ativos": _filters_active(empresa, origem, pagador),
        },
        "faturamento_geral": current,
        "quantidade_notas": current_metrics["quantidade_notas"],
        "ticket_medio": current_metrics["ticket_medio"],
        "mes_anterior": {
            "ano": previous_year,
            "mes": previous_month,
            "faturamento_geral": previous,
            "quantidade_notas": previous_metrics["quantidade_notas"],
            "ticket_medio": previous_metrics["ticket_medio"],
        } if previous_available else None,
        "variacao_mes_anterior_valor": delta,
        "variacao_mes_anterior_percentual": delta_pct if previous_available else None,
        "variacao_notas_valor": notes_delta,
        "variacao_notas_percentual": notes_pct if previous_available else None,
        "variacao_ticket_valor": ticket_delta,
        "variacao_ticket_percentual": ticket_pct if previous_available else None,
    }


def get_faturamento_detalhes(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    params = _period_params(year, month, empresa, origem, pagador)
    filters_active = _filters_active(empresa, origem, pagador)
    total_data = get_faturamento_total(year, month, empresa, origem, pagador)

    if _is_current_month(year, month):
        fast = _fast_current_month_pair(year, month, empresa, origem, pagador, date.today().isoformat())
        plan_rows = [dict(row) for row in fast["plan_rows"]]
        component_metrics = {
            key: (dict(value["current"]), dict(value["previous"]))
            for key, value in fast["components"].items()
        }
    else:
        with source_engine.connect() as connection:
            plan_rows = [dict(row._mapping) for row in connection.execute(PLAN_COMPARE_SQL, params)]
            component_metrics = {}
            for key in ["novos_clientes", "renovacoes", "recursos", "servicos", "certclick"]:
                current_metrics = _fetch_component_metrics(connection, key, params["data_inicio"], params["data_fim"], empresa, origem, pagador)
                previous_metrics = _fetch_component_metrics(connection, key, params["data_anterior_inicio"], params["data_anterior_fim"], empresa, origem, pagador)
                component_metrics[key] = (current_metrics, previous_metrics)

    current_total = total_data["faturamento_geral"]
    previous_total = total_data["mes_anterior"]["faturamento_geral"] if total_data["mes_anterior"] else 0.0

    labels = {
        "novos_clientes": "Novos clientes",
        "renovacoes": "Renovações",
        "recursos": "Recursos adicionais",
        "servicos": "Serviços prestados",
        "certclick": "CertClick",
    }
    composition = []
    classified_current = 0.0
    classified_previous = 0.0
    for key in ["novos_clientes", "renovacoes", "recursos", "servicos", "certclick"]:
        current = component_metrics[key][0]["valor"]
        previous = component_metrics[key][1]["valor"]
        current_count = component_metrics[key][0]["quantidade_notas"]
        previous_count = component_metrics[key][1]["quantidade_notas"]
        classified_current += current
        classified_previous += previous
        delta, delta_pct = _variation(current, previous)
        count_delta, count_pct = _variation(current_count, previous_count)
        composition.append({
            "chave": key,
            "label": labels[key],
            "valor": current,
            "percentual": (current / current_total * 100) if current_total else 0.0,
            "valor_anterior": previous,
            "variacao_valor": delta,
            "variacao_percentual": delta_pct,
            "quantidade": current_count,
            "quantidade_anterior": previous_count,
            "variacao_quantidade": count_delta,
            "variacao_quantidade_percentual": count_pct,
        })

    others_current = current_total - classified_current
    others_previous = previous_total - classified_previous
    current_total_count = total_data["quantidade_notas"]
    previous_total_count = total_data["mes_anterior"]["quantidade_notas"] if total_data["mes_anterior"] else 0
    classified_current_count = sum(int(item[0]["quantidade_notas"]) for item in component_metrics.values())
    classified_previous_count = sum(int(item[1]["quantidade_notas"]) for item in component_metrics.values())
    others_current_count = current_total_count - classified_current_count
    others_previous_count = previous_total_count - classified_previous_count
    delta, delta_pct = _variation(others_current, others_previous)
    count_delta, count_pct = _variation(others_current_count, others_previous_count)
    composition.append({
        "chave": "outros",
        "label": "Outros / não classificados",
        "valor": others_current,
        "percentual": (others_current / current_total * 100) if current_total else 0.0,
        "valor_anterior": others_previous,
        "variacao_valor": delta,
        "variacao_percentual": delta_pct,
        "quantidade": others_current_count,
        "quantidade_anterior": others_previous_count,
        "variacao_quantidade": count_delta,
        "variacao_quantidade_percentual": count_pct,
    })

    plans = []
    ranking_map: dict[str, dict] = {}
    for row in plan_rows:
        current = _as_float(row.get("atual"))
        previous = _as_float(row.get("anterior"))
        delta, delta_pct = _variation(current, previous)
        plan_name = str(row.get("nome_plano") or "Não informado")
        current_count = int(row.get("quantidade_atual") or 0)
        previous_count = int(row.get("quantidade_anterior") or 0)
        count_delta, count_pct = _variation(current_count, previous_count)
        plans.append({
            "empresa": str(row.get("empresa") or "Não informado"),
            "origem": str(row.get("origem") or "Não informado"),
            "pagador": str(row.get("pagador") or "Não informado"),
            "nome_plano": plan_name,
            "duracao": str(row.get("duracao") or ""),
            "duracao_label": _duration_label(row.get("duracao")),
            "valor": current,
            "valor_anterior": previous,
            "variacao_valor": delta,
            "variacao_percentual": delta_pct,
            "quantidade": current_count,
            "quantidade_anterior": previous_count,
            "variacao_quantidade": count_delta,
            "variacao_quantidade_percentual": count_pct,
        })
        bucket = ranking_map.setdefault(plan_name, {"nome_plano": plan_name, "valor": 0.0, "valor_anterior": 0.0, "quantidade": 0, "quantidade_anterior": 0})
        bucket["valor"] += current
        bucket["valor_anterior"] += previous
        bucket["quantidade"] += current_count
        bucket["quantidade_anterior"] += previous_count

    ranking = []
    for item in ranking_map.values():
        delta, delta_pct = _variation(item["valor"], item["valor_anterior"])
        count_delta, count_pct = _variation(item["quantidade"], item["quantidade_anterior"])
        ranking.append({
            "nome_plano": item["nome_plano"],
            "valor": item["valor"],
            "valor_anterior": item["valor_anterior"],
            "variacao_valor": delta,
            "variacao_percentual": delta_pct,
            "quantidade": item["quantidade"],
            "quantidade_anterior": item["quantidade_anterior"],
            "variacao_quantidade": count_delta,
            "variacao_quantidade_percentual": count_pct,
        })
    ranking.sort(key=lambda item: abs(item["variacao_valor"]), reverse=True)

    plan_total = sum(item["valor"] for item in plans)
    por_empresa = _aggregate_dimension(plan_rows, "empresa")
    if not filters_active:
        service_value = component_metrics["servicos"][0]["valor"]
        cert_value = component_metrics["certclick"][0]["valor"]
        combined_total = sum(item["valor"] for item in por_empresa) + service_value + cert_value
        if service_value:
            por_empresa.append({"label": "Serviços prestados", "valor": service_value, "percentual": 0.0, "quantidade": component_metrics["servicos"][0]["quantidade_notas"], "percentual_quantidade": 0.0})
        if cert_value:
            por_empresa.append({"label": "CertClick", "valor": cert_value, "percentual": 0.0, "quantidade": component_metrics["certclick"][0]["quantidade_notas"], "percentual_quantidade": 0.0})
        combined_quantidade = sum(int(item.get("quantidade") or 0) for item in por_empresa)
        for item in por_empresa:
            item["percentual"] = (item["valor"] / combined_total * 100) if combined_total else 0.0
            item["percentual_quantidade"] = (int(item.get("quantidade") or 0) / combined_quantidade * 100) if combined_quantidade else 0.0

    return {
        "resumo": {
            "faturamento_geral": current_total,
            "faturamento_planos": plan_total,
            "novos_clientes": component_metrics["novos_clientes"][0]["valor"],
            "renovacoes": component_metrics["renovacoes"][0]["valor"],
            "recursos": component_metrics["recursos"][0]["valor"],
            "servicos": component_metrics["servicos"][0]["valor"],
            "certclick": component_metrics["certclick"][0]["valor"],
            "outros": others_current,
            "total_classificado": classified_current,
        },
        "composicao": composition,
        "origens": {
            "por_empresa": por_empresa,
            "por_origem": _aggregate_dimension(plan_rows, "origem"),
            "por_pagador": _aggregate_dimension(plan_rows, "pagador"),
        },
        "por_plano": plans,
        "ranking_planos": ranking,
    }


def get_faturamento_historico(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    filters_active = _filters_active(empresa, origem, pagador)

    if _is_current_month(year, month):
        points = _cached_history_points(empresa, origem, pagador)
        fast = _fast_current_month_pair(year, month, empresa, origem, pagador, date.today().isoformat())
        current = fast["totals"]["current"]
        points = [
            item for item in points
            if not (int(item.get("ano") or 0) == year and int(item.get("mes") or 0) == month)
        ]
        points.append(
            {
                "ano": year,
                "mes": month,
                "label": f"{month:02d}/{year}",
                "faturamento_geral": float(current["valor"]),
                "quantidade_notas": int(current["quantidade_notas"]),
            }
        )
        points.sort(key=lambda item: (int(item.get("ano") or 0), int(item.get("mes") or 0)))
        return {
            "ano_inicio": 2024,
            "ano_fim": year,
            "filtros": {
                "empresa": empresa,
                "origem": origem,
                "pagador": pagador,
                "ativos": filters_active,
            },
            "pontos": points,
        }

    history_start = date(2024, 1, 1)
    history_end = _period_bounds(year, month)[1]
    params = {
        "data_inicio": history_start,
        "data_fim": history_end,
        "ano_inicio": history_start.year,
        "ano_fim": (history_end - timedelta(days=1)).year,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": EMPRESAS_EXCLUIDAS,
    }
    sql = HISTORY_FILTERED_SQL if filters_active else HISTORY_GENERAL_SQL

    with source_engine.connect() as connection:
        rows = [dict(row._mapping) for row in connection.execute(sql, params)]

    return {
        "ano_inicio": 2024,
        "ano_fim": year,
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "ativos": filters_active,
        },
        "pontos": [
            {
                "ano": int(row["ano"]),
                "mes": int(row["mes"]),
                "label": f"{int(row['mes']):02d}/{int(row['ano'])}",
                "faturamento_geral": _as_float(row.get("faturamento_geral")),
                "quantidade_notas": int(row.get("quantidade_notas") or 0),
            }
            for row in rows
        ],
    }


def get_faturamento_componente(
    year: int,
    month: int,
    componente: str,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    compare_mode: str = "mes_completo",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    _validate_compare_mode(compare_mode)
    if componente not in {"novos_clientes", "renovacoes", "recursos", "servicos", "certclick", "outros"}:
        raise ValueError("Componente inválido.")

    with source_engine.connect() as connection:
        if componente == "outros":
            total_cmp = _build_component_comparison(connection, "novos_clientes", year, month, empresa, origem, pagador, compare_mode)
            ren_cmp = _build_component_comparison(connection, "renovacoes", year, month, empresa, origem, pagador, compare_mode)
            rec_cmp = _build_component_comparison(connection, "recursos", year, month, empresa, origem, pagador, compare_mode)
            ser_cmp = _build_component_comparison(connection, "servicos", year, month, empresa, origem, pagador, compare_mode)
            cer_cmp = _build_component_comparison(connection, "certclick", year, month, empresa, origem, pagador, compare_mode)
            total_metrics = _fetch_total_metrics(connection, _comparison_context(year, month, compare_mode)["periodo_atual"]["data_inicio"], _comparison_context(year, month, compare_mode)["periodo_atual"]["data_fim"], empresa, origem, pagador)
            subtotal = sum(c["resumo"]["valor"] for c in [total_cmp, ren_cmp, rec_cmp, ser_cmp, cer_cmp])
            # here total_cmp variable is actually novos clientes
            current_value = total_metrics["valor"] - subtotal
            # previous month
            prev_total = _fetch_total_metrics(connection, _comparison_context(year, month, compare_mode)["mes_anterior"]["data_inicio"], _comparison_context(year, month, compare_mode)["mes_anterior"]["data_fim"], empresa, origem, pagador)
            prev_subtotal = sum(c["variacoes"]["mes_anterior"]["comparado"] for c in [total_cmp, ren_cmp, rec_cmp, ser_cmp, cer_cmp])
            previous_value = prev_total["valor"] - prev_subtotal
            delta, delta_pct = _variation(current_value, previous_value)
            # same month / ytd comparisons based on totals minus subtotals for each comparison set
            result = {
                "modo_comparacao": compare_mode,
                "periodo_atual": total_cmp["periodo_atual"],
                "resumo": {"valor": current_value, "quantidade_notas": 0, "ticket_medio": 0.0},
                "variacoes": {
                    "mes_anterior": {
                        "label": "Ano anterior" if month == 0 else "Mês anterior",
                        "atual": current_value,
                        "comparado": previous_value,
                        "variacao_valor": delta,
                        "variacao_percentual": delta_pct,
                    },
                    "acumulado_ano": [],
                    "mesmo_mes": [],
                },
            }
            for idx, item in enumerate(total_cmp["variacoes"]["acumulado_ano"]):
                compared_total = _fetch_total_metrics(connection, date(item["ano"], 1, 1), _comparison_context(year, month, compare_mode)["acumulado_anos_anteriores"][idx]["data_fim"], empresa, origem, pagador)["valor"]
                subtotal_comp = sum(c["variacoes"]["acumulado_ano"][idx]["comparado"] for c in [total_cmp, ren_cmp, rec_cmp, ser_cmp, cer_cmp])
                compared_value = compared_total - subtotal_comp
                current_ytd = _fetch_total_metrics(connection, _comparison_context(year, month, compare_mode)["acumulado_ano_atual"]["data_inicio"], _comparison_context(year, month, compare_mode)["acumulado_ano_atual"]["data_fim"], empresa, origem, pagador)["valor"] - sum(c["variacoes"]["acumulado_ano"][idx]["atual"] for c in [total_cmp, ren_cmp, rec_cmp, ser_cmp, cer_cmp]) + sum(c["variacoes"]["acumulado_ano"][0]["atual"] for c in [total_cmp, ren_cmp, rec_cmp, ser_cmp, cer_cmp])
                d, p = _variation(current_ytd, compared_value)
                result["variacoes"]["acumulado_ano"].append({"label": item["label"], "ano": item["ano"], "atual": current_ytd, "comparado": compared_value, "variacao_valor": d, "variacao_percentual": p})
            for idx, item in enumerate(total_cmp["variacoes"]["mesmo_mes"]):
                compared_total = _fetch_total_metrics(connection, _comparison_context(year, month, compare_mode)["mesmo_mes_anos_anteriores"][idx]["data_inicio"], _comparison_context(year, month, compare_mode)["mesmo_mes_anos_anteriores"][idx]["data_fim"], empresa, origem, pagador)["valor"]
                subtotal_comp = sum(c["variacoes"]["mesmo_mes"][idx]["comparado"] for c in [total_cmp, ren_cmp, rec_cmp, ser_cmp, cer_cmp])
                compared_value = compared_total - subtotal_comp
                d, p = _variation(current_value, compared_value)
                result["variacoes"]["mesmo_mes"].append({"label": item["label"], "ano": item["ano"], "atual": current_value, "comparado": compared_value, "variacao_valor": d, "variacao_percentual": p})
            return result
        return _build_component_comparison(connection, componente, year, month, empresa, origem, pagador, compare_mode)


def get_faturamento_plano_detalhe(
    year: int,
    month: int,
    plano: str,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    compare_mode: str = "mes_completo",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    _validate_compare_mode(compare_mode)
    if not plano.strip():
        raise ValueError("Plano inválido.")
    with source_engine.connect() as connection:
        return _build_plan_detail(connection, plano.strip(), year, month, empresa, origem, pagador, compare_mode)


# Compatibilidade com a rota anterior. O frontend novo usa /total e /detalhes.
def get_faturamento(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    total = get_faturamento_total(year, month, empresa, origem, pagador)
    details = get_faturamento_detalhes(year, month, empresa, origem, pagador)
    return {
        "periodo": total["periodo"],
        "filtros": total["filtros"],
        "mes_anterior": total["mes_anterior"],
        "resumo": {
            **details["resumo"],
            "variacao_mes_anterior_valor": total["variacao_mes_anterior_valor"],
            "variacao_mes_anterior_percentual": total["variacao_mes_anterior_percentual"],
        },
        "composicao": details["composicao"],
        "origens": details["origens"],
        "por_plano": details["por_plano"],
        "ranking_planos": details["ranking_planos"],
    }
