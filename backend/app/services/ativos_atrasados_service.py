from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine, supabase_engine
from app.services.payment_metrics_service import get_payment_metrics

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

EXCLUDED_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371, 517101)))

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
"""

MONTHS = ("Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez")
DURATION_LABELS = {"M": "Mensal", "T": "Trimestral", "S": "Semestral", "A": "Anual"}

CURRENT_OVERDUE_SQL = text(
    f"""
    WITH loja_contato AS (
        SELECT empresa_id, MAX(celular) AS celular
        FROM lojas
        GROUP BY empresa_id
    ),
    ranked AS (
        SELECT
            e.id AS empresa_id,
            e.ativou_em,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            CASE
                WHEN e.modalidade = 'ERP' THEN 'GestãoClick'
                WHEN e.modalidade IN ('NFE', 'FIS') THEN 'ClickNotas'
                ELSE 'Outros'
            END AS empresa,
            CASE WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick' ELSE 'Parceiro' END AS origem,
            CASE
                WHEN e.tipo_cobranca = 'E' THEN 'Cliente'
                WHEN e.tipo_cobranca = 'P' THEN 'Parceiro'
                ELSE 'Não informado'
            END AS pagador,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            ep.duracao,
            ep.data_vencimento,
            CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor,
            ep.nome_usuario,
            ep.telefone,
            lc.celular,
            ep.email,
            DATEDIFF(CURRENT_DATE(), ep.data_vencimento) AS dias_vencido,
            ROW_NUMBER() OVER (
                PARTITION BY e.id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON e.id = ep.empresa_id
        LEFT JOIN loja_contato lc ON lc.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.data_vencimento < CURRENT_DATE()
            AND ep.data_vencimento >= DATE_SUB(CURRENT_DATE(), INTERVAL 59 DAY)
            AND e.id NOT IN :excluidos
            {DIMENSION_FILTER_SQL}
    )
    SELECT *
    FROM ranked
    WHERE ordem = 1
    ORDER BY dias_vencido, valor DESC, empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))


def _validate(empresa: str, origem: str, pagador: str) -> None:
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _duration_label(value: str | None) -> str:
    return DURATION_LABELS.get(str(value or ""), str(value or "Não informado"))


def _months_between(start: date | None, end: date) -> float:
    if start is None:
        return 0.0
    return round(max((end - start).days, 0) / 30.4375, 1)


def _tenure_label(months: float) -> str:
    if months < 12:
        value = max(int(round(months)), 0)
        return "1 mês" if value == 1 else f"{value} meses"
    years = round(months / 12, 1)
    return f"{str(years).replace('.', ',')} anos"


def _intranet_url(company_id: int) -> str:
    return f"https://intranet.clickdigital.com.br/clientes/visualizar/{company_id}?aba=5"


def _serialize_current(row: dict, metrics: dict[int, dict], today: date) -> dict:
    company_id = int(row["empresa_id"])
    activation = row.get("ativou_em")
    due = row.get("data_vencimento")
    if isinstance(activation, datetime):
        activation = activation.date()
    if isinstance(due, datetime):
        due = due.date()

    metric = metrics.get(company_id, {})
    real_average = metric.get("media_dias_pagamento_real")
    considered_average = max(float(real_average or 0), 0.0)
    overdue_days = int(row.get("dias_vencido") or 0)
    tenure_months = _months_between(activation, today)

    return {
        "empresa_id": company_id,
        "cliente": f"Cliente #{company_id}",
        "intranet_url": _intranet_url(company_id),
        "empresa": str(row.get("empresa") or "Não informado"),
        "origem": str(row.get("origem") or "Não informado"),
        "pagador": str(row.get("pagador") or "Não informado"),
        "modalidade": str(row.get("modalidade") or ""),
        "empresa_indicacao_id": int(row.get("empresa_indicacao_id") or 0),
        "tipo_cobranca": str(row.get("tipo_cobranca") or ""),
        "ativou_em": activation.isoformat() if activation else None,
        "nome_plano": str(row.get("nome_plano") or "Não informado"),
        "duracao": str(row.get("duracao") or ""),
        "duracao_label": _duration_label(row.get("duracao")),
        "data_vencimento": due.isoformat() if due else None,
        "valor": round(float(row.get("valor") or 0), 2),
        "dias_vencido": overdue_days,
        "media_dias_pagamento_real": float(real_average) if real_average is not None else None,
        "media_dias_considerada": round(considered_average, 2),
        "dentro_media_atraso": overdue_days > 0 and overdue_days <= considered_average,
        "ultrapassou_media_atraso": overdue_days > considered_average,
        "tempo_cliente_meses": tenure_months,
        "tempo_cliente_label": _tenure_label(tenure_months),
        "qtd_pagamentos": int(metric.get("qtd_pagamentos") or 0),
        "renovacoes": int(metric.get("renovacoes_realizadas") or 0),
        "reativacoes": int(metric.get("reativacoes") or 0),
        "ltv": round(float(metric.get("ltv") or 0), 2),
        "ticket_medio_historico": round(float(metric.get("ticket_medio") or 0), 2),
        "nome_usuario": row.get("nome_usuario"),
        "telefone": row.get("telefone"),
        "celular": row.get("celular"),
        "email": row.get("email"),
    }




def _month_points() -> list[date]:
    today = date.today()
    points: list[date] = []
    year, month = 2024, 1
    while (year, month) <= (today.year, today.month):
        points.append(date(year, month, 1))
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1
    return points


def _monthly_points_sql(points: list[date]) -> tuple[str, dict]:
    parts: list[str] = []
    params: dict = {}
    for index, point in enumerate(points):
        name = f"ref_{index}"
        parts.append(f"SELECT CAST(:{name} AS DATE) AS ref_date")
        params[name] = point
    return "\nUNION ALL\n".join(parts), params


def _history_summary_sql(points_sql: str):
    return text(
        f"""
        WITH monthly_points AS (
            {points_sql}
        ),
        ranked AS (
            SELECT
                mp.ref_date,
                e.id AS empresa_id,
                ep.data_vencimento,
                ROW_NUMBER() OVER (
                    PARTITION BY mp.ref_date, e.id
                    ORDER BY ep.pago_em DESC, ep.id DESC
                ) AS ordem
            FROM monthly_points mp
            JOIN empresas e ON e.ativou_em < mp.ref_date
            JOIN empresas_planos ep ON ep.empresa_id = e.id
            WHERE
                ep.plano_id <> 1
                AND ep.pago_em IS NOT NULL
                AND ep.pago_em < mp.ref_date
                AND ep.nota_fiscal_servico_id IS NOT NULL
                AND e.id NOT IN :excluidos
                {DIMENSION_FILTER_SQL}
        )
        SELECT
            ref_date,
            SUM(CASE WHEN data_vencimento >= ref_date THEN 1 ELSE 0 END) AS clientes_ativos,
            SUM(CASE WHEN DATEDIFF(ref_date, data_vencimento) BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS atrasados_1_30
        FROM ranked
        WHERE ordem = 1
        GROUP BY ref_date
        ORDER BY ref_date
        """
    ).bindparams(bindparam("excluidos", expanding=True))


def _history_overdue_sql(points_sql: str):
    return text(
        f"""
        WITH monthly_points AS (
            {points_sql}
        ),
        ranked AS (
            SELECT
                mp.ref_date,
                e.id AS empresa_id,
                ep.data_vencimento,
                ROW_NUMBER() OVER (
                    PARTITION BY mp.ref_date, e.id
                    ORDER BY ep.pago_em DESC, ep.id DESC
                ) AS ordem
            FROM monthly_points mp
            JOIN empresas e ON e.ativou_em < mp.ref_date
            JOIN empresas_planos ep ON ep.empresa_id = e.id
            WHERE
                ep.plano_id <> 1
                AND ep.pago_em IS NOT NULL
                AND ep.pago_em < mp.ref_date
                AND ep.nota_fiscal_servico_id IS NOT NULL
                AND e.id NOT IN :excluidos
                {DIMENSION_FILTER_SQL}
        )
        SELECT
            ref_date,
            empresa_id,
            DATEDIFF(ref_date, data_vencimento) AS dias_vencido
        FROM ranked
        WHERE
            ordem = 1
            AND DATEDIFF(ref_date, data_vencimento) BETWEEN 1 AND 30
        ORDER BY ref_date, empresa_id
        """
    ).bindparams(bindparam("excluidos", expanding=True))


PAYMENT_EVENTS_SQL = text(
    """
    WITH pagamentos AS (
        SELECT
            ep.id,
            ep.empresa_id,
            ep.pago_em,
            ep.data_vencimento,
            LEAD(ep.pago_em) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS prox_pago_em
        FROM empresas_planos ep
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.nome_plano NOT LIKE '% (+) recursos%'
            AND ep.nome_plano NOT LIKE '% + recursos%'
            AND ep.empresa_id IN :empresa_ids
    )
    SELECT
        empresa_id,
        prox_pago_em,
        CASE
            WHEN prox_pago_em IS NULL THEN NULL
            WHEN DATEDIFF(prox_pago_em, data_vencimento) >= 60 THEN NULL
            ELSE DATEDIFF(prox_pago_em, data_vencimento)
        END AS dias_pgto_real
    FROM pagamentos
    WHERE prox_pago_em IS NOT NULL
    ORDER BY empresa_id, prox_pago_em
    """
).bindparams(bindparam("empresa_ids", expanding=True))


def _payment_events(company_ids: set[int]) -> dict[int, list[tuple[date, float]]]:
    events: dict[int, list[tuple[date, float]]] = defaultdict(list)
    ids = sorted(company_ids)
    if not ids:
        return events

    chunk_size = 1200
    with source_engine.connect() as connection:
        for index in range(0, len(ids), chunk_size):
            chunk = ids[index:index + chunk_size]
            rows = connection.execute(PAYMENT_EVENTS_SQL, {"empresa_ids": chunk}).mappings().all()
            for row in rows:
                value = row.get("dias_pgto_real")
                paid = row.get("prox_pago_em")
                if value is None or paid is None:
                    continue
                if isinstance(paid, datetime):
                    paid = paid.date()
                events[int(row["empresa_id"])].append((paid, float(value)))
    return events


def _full_history_from_source(empresa: str, origem: str, pagador: str) -> list[dict]:
    all_points = _month_points()
    summary_rows: list[dict] = []
    overdue_rows: list[dict] = []

    # Quando o pagador está em "todos", a contagem de clientes ativos já existe
    # no Supabase em indicadores_mensais. Assim evitamos repetir no backup a
    # consulta mais pesada de histórico de ativos e consultamos a origem somente
    # para os clientes vencidos necessários às linhas de atraso.
    use_supabase_active_history = pagador == "todos"
    active_history = _active_history_from_supabase(empresa, origem) if use_supabase_active_history else []

    # Dividimos por ano para manter cada consulta ao backup pequena.
    years = sorted({point.year for point in all_points})
    for year in years:
        year_points = [point for point in all_points if point.year == year]
        points_sql, point_params = _monthly_points_sql(year_points)
        params = {
            **point_params,
            "excluidos": EXCLUDED_IDS,
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
        }
        with source_engine.connect() as connection:
            if not use_supabase_active_history:
                summary_rows.extend(
                    dict(row)
                    for row in connection.execute(_history_summary_sql(points_sql), params).mappings().all()
                )
            overdue_rows.extend(
                dict(row)
                for row in connection.execute(_history_overdue_sql(points_sql), params).mappings().all()
            )

    company_ids = {int(row["empresa_id"]) for row in overdue_rows}
    events = _payment_events(company_ids)

    overdue_30_by_ref: dict[str, int] = defaultdict(int)
    within_average: dict[str, int] = defaultdict(int)

    # Prefixos acumulados por cliente permitem calcular a média conhecida em cada
    # mês sem reconsultar o MySQL para cada ponto histórico.
    for row in overdue_rows:
        ref = row["ref_date"]
        if isinstance(ref, datetime):
            ref = ref.date()
        ref_key = ref.isoformat()
        overdue_30_by_ref[ref_key] += 1

        delay = int(row.get("dias_vencido") or 0)
        history = events.get(int(row["empresa_id"]), [])
        valid = [value for paid_at, value in history if paid_at < ref]
        average = max((sum(valid) / len(valid)) if valid else 0.0, 0.0)
        if delay <= average:
            within_average[ref_key] += 1

    result: list[dict] = []
    previous: int | None = None

    if use_supabase_active_history:
        for row in active_history:
            ref = date(int(row["ano"]), int(row["mes"]), 1)
            key = ref.isoformat()
            active = int(row.get("clientes_ativos") or 0)
            overdue_30 = int(overdue_30_by_ref.get(key, 0))
            average_count = int(within_average.get(key, 0))
            result.append(
                {
                    "ano": ref.year,
                    "mes": ref.month,
                    "label": f"{MONTHS[ref.month - 1]}/{str(ref.year)[-2:]}",
                    "clientes_ativos": active,
                    "saldo_clientes": None if previous is None else active - previous,
                    "ativos_mais_30": active + overdue_30,
                    "ativos_mais_media": active + average_count,
                    "atrasados_1_30": overdue_30,
                    "dentro_media": average_count,
                }
            )
            previous = active
        return result

    summary_rows.sort(key=lambda row: row["ref_date"])
    for row in summary_rows:
        ref = row["ref_date"]
        if isinstance(ref, datetime):
            ref = ref.date()
        key = ref.isoformat()
        active = int(row.get("clientes_ativos") or 0)
        overdue_30 = int(row.get("atrasados_1_30") or 0)
        average_count = int(within_average.get(key, 0))
        result.append(
            {
                "ano": ref.year,
                "mes": ref.month,
                "label": f"{MONTHS[ref.month - 1]}/{str(ref.year)[-2:]}",
                "clientes_ativos": active,
                "saldo_clientes": None if previous is None else active - previous,
                "ativos_mais_30": active + overdue_30,
                "ativos_mais_media": active + average_count,
                "atrasados_1_30": overdue_30,
                "dentro_media": average_count,
            }
        )
        previous = active
    return result


def _company_db_value(empresa: str) -> str | None:
    if empresa == "gestaoclick":
        return "GestãoClick"
    if empresa == "clicknotas":
        return "ClickNotas"
    return None


def _origin_db_value(origem: str) -> str | None:
    if origem == "gestaoclick":
        return "GestãoClick"
    if origem == "parceiro":
        return "Parceiro"
    return None


def _active_history_from_supabase(empresa: str, origem: str) -> list[dict]:
    clauses = ["ano >= 2024"]
    params: dict = {}

    company = _company_db_value(empresa)
    origin = _origin_db_value(origem)
    if company:
        clauses.append("empresa = :empresa")
        params["empresa"] = company
    if origin:
        clauses.append("origem = :origem")
        params["origem"] = origin

    query = text(
        f"""
        SELECT ano, mes, SUM(clientes_ativos) AS clientes_ativos
        FROM public.indicadores_mensais
        WHERE {' AND '.join(clauses)}
        GROUP BY ano, mes
        ORDER BY ano, mes
        """
    )

    with supabase_engine.connect() as connection:
        rows = connection.execute(query, params).mappings().all()

    result: list[dict] = []
    previous: int | None = None
    for row in rows:
        year = int(row["ano"])
        month = int(row["mes"])
        active = int(row.get("clientes_ativos") or 0)
        result.append(
            {
                "ano": year,
                "mes": month,
                "label": f"{MONTHS[month - 1]}/{str(year)[-2:]}",
                "clientes_ativos": active,
                "saldo_clientes": None if previous is None else active - previous,
            }
        )
        previous = active
    return result


def _category_match(client: dict, category: str) -> bool:
    days = int(client["dias_vencido"])
    if category == "prorrogacao":
        return 1 <= days <= 3
    if category == "dentro_media":
        return bool(client["dentro_media_atraso"])
    if category == "ate_30":
        return 1 <= days <= 30
    if category == "ate_45":
        return 1 <= days <= 45
    if category == "ate_60":
        return 1 <= days <= 59
    return False


CATEGORY_META = [
    ("prorrogacao", "Clientes em prorrogação", "Clientes com 1 a 3 dias de vencimento. Ainda conseguem acessar o sistema."),
    ("dentro_media", "Clientes dentro do prazo de atraso", "Clientes vencidos, mas ainda dentro da média real de atraso do próprio histórico."),
    ("ate_30", "Clientes até 30 dias atrasados", "Clientes com 1 a 30 dias de atraso."),
    ("ate_45", "Clientes até 45 dias de atraso", "Clientes com 1 a 45 dias de atraso."),
    ("ate_60", "Clientes até 60 dias de atraso", "Clientes com 1 a 59 dias de atraso. Ao completar 60 dias, passam a ser churn."),
]


def _build_cards(clients: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for key, label, description in CATEGORY_META:
        selected = [row for row in clients if _category_match(row, key)]
        rows.append(
            {
                "key": key,
                "label": label,
                "description": description,
                "clientes": len(selected),
                "valor_total": round(sum(float(row["valor"]) for row in selected), 2),
            }
        )
    return rows


def _build_plan_breakdowns(clients: list[dict]) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for category, _, _ in CATEGORY_META:
        selected = [row for row in clients if _category_match(row, category)]
        plans: dict[str, dict] = {}
        for client in selected:
            plan_name = client["nome_plano"]
            plan = plans.setdefault(plan_name, {"plano": plan_name, "clientes": 0, "valor_total": 0.0, "duracoes": {}})
            plan["clientes"] += 1
            plan["valor_total"] += float(client["valor"])
            duration_key = client["duracao"]
            duration = plan["duracoes"].setdefault(
                duration_key,
                {
                    "duracao": duration_key,
                    "duracao_label": client["duracao_label"],
                    "clientes": 0,
                    "valor_total": 0.0,
                    "empresa_ids": [],
                },
            )
            duration["clientes"] += 1
            duration["valor_total"] += float(client["valor"])
            duration["empresa_ids"].append(client["empresa_id"])

        serialized: list[dict] = []
        for plan in plans.values():
            durations = list(plan["duracoes"].values())
            for duration in durations:
                duration["valor_total"] = round(duration["valor_total"], 2)
            durations.sort(key=lambda item: (-item["valor_total"], -item["clientes"], item["duracao_label"]))
            serialized.append(
                {
                    "plano": plan["plano"],
                    "clientes": plan["clientes"],
                    "valor_total": round(plan["valor_total"], 2),
                    "duracoes": durations,
                }
            )
        serialized.sort(key=lambda item: (-item["valor_total"], -item["clientes"], item["plano"]))
        result[category] = serialized
    return result


def _build_yoy(history: list[dict]) -> dict:
    today = date.today()
    month = today.month
    by_year = {int(row["ano"]): int(row["clientes_ativos"]) for row in history if int(row["mes"]) == month}
    current = int(by_year.get(today.year, 0))
    comparisons = []
    for year in (2025, 2024):
        if year in by_year:
            value = int(by_year[year])
            comparisons.append(
                {
                    "ano": year,
                    "clientes_ativos": value,
                    "diferenca": current - value,
                    "percentual": round(((current - value) / value) * 100, 2) if value else None,
                }
            )
    return {
        "mes": month,
        "mes_label": MONTHS[month - 1],
        "ano_atual": today.year,
        "clientes_ativos_atual": current,
        "comparacoes": comparisons,
    }


def get_ativos_atrasados_dashboard(empresa: str = "todos", origem: str = "todos", pagador: str = "todos") -> dict:
    _validate(empresa, origem, pagador)
    today = date.today()

    # O histórico completo é calculado uma vez por dia no primeiro acesso e depois
    # passa a ser lido do snapshot persistido no Supabase.
    history = _full_history_from_source(empresa, origem, pagador)

    params = {"excluidos": EXCLUDED_IDS, "empresa": empresa, "origem": origem, "pagador": pagador}
    with source_engine.connect() as connection:
        current_rows = [dict(row) for row in connection.execute(CURRENT_OVERDUE_SQL, params).mappings().all()]

    metrics = get_payment_metrics(row["empresa_id"] for row in current_rows)
    clients = [_serialize_current(row, metrics, today) for row in current_rows]

    three_lines = [dict(row) for row in history]

    return {
        "data_referencia": today.isoformat(),
        "filtros": {"empresa": empresa, "origem": origem, "pagador": pagador},
        "regra": {
            "prorrogacao_dias": 3,
            "churn_a_partir_dias": 60,
            "media_negativa_considerada": 0,
            "sem_historico_considerado": 0,
            "observacao_historico": "O histórico é atualizado apenas uma vez por dia no primeiro acesso e depois fica salvo no Supabase do projeto.",
        },
        "historico_ativos": history,
        "historico_tres_linhas": three_lines,
        "yoy": _build_yoy(history),
        "cards": _build_cards(clients),
        "planos_por_card": _build_plan_breakdowns(clients),
        "clientes_atrasados": clients,
    }
