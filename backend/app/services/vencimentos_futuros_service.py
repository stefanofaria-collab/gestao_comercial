from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from sqlalchemy import bindparam, text

try:
    from app.constants import EXCLUDED_COMPANY_IDS
except Exception:  # pragma: no cover - fallback para bases antigas
    EXCLUDED_COMPANY_IDS = (
        1, 24, 43, 2054, 123242, 216321, 346439, 388198, 196044, 10744,
        11807, 166104, 200440, 177551, 209512, 261147, 463295, 458966,
        403472, 226637, 414735, 361435, 376050, 367178, 263918, 447481,
        48142, 438358, 239292, 376338, 479723, 480921, 481136, 479405,
        482279, 124451, 174166, 184848, 186733, 248366, 444241, 462938,
        473336, 476148, 480590, 485458, 487138, 487525, 193364, 267891,
        369137, 484832, 3897, 209986, 334995, 423464, 379294, 278505,
        363585, 202297, 487136, 495757, 74618, 448705, 492276, 493057,
        493495, 495367, 495470, 500211, 500213, 500508, 500582, 502764,
        497959, 510928, 514140, 187078, 521671, 224287, 205324, 517101,
    )

from app.database import source_engine
from app.services.global_filter_context import period_bounds as global_period_bounds
from app.services.payment_metrics_service import get_payment_metrics

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

VENCIMENTOS_EXCLUDED_COMPANY_IDS = tuple(dict.fromkeys(EXCLUDED_COMPANY_IDS))

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

BASE_VENCIMENTOS_SQL = text(
    f"""
    WITH loja_contato AS (
        SELECT
            empresa_id,
            MAX(celular) AS celular
        FROM lojas
        GROUP BY empresa_id
    ),
    base AS (
        SELECT
            e.id AS empresa_id,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            e.ativou_em,
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
            REPLACE(REPLACE(ep.nome_plano, ' + recursos', ''), ' (+) recursos', '') AS nome_plano,
            ep.duracao,
            ep.data_vencimento,
            CASE
                WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
                ELSE ep.valor
            END AS valor,
            ep.nome_usuario,
            ep.telefone,
            lc.celular,
            ep.email,
            ROW_NUMBER() OVER (
                PARTITION BY e.id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        LEFT JOIN loja_contato lc ON e.id = lc.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.data_vencimento >= :data_inicio
            AND ep.data_vencimento < :data_fim
            AND e.id NOT IN :excluidos
            {DIMENSION_FILTER_SQL}
    )
    SELECT
        empresa_id,
        modalidade,
        empresa_indicacao_id,
        tipo_cobranca,
        ativou_em,
        empresa,
        origem,
        pagador,
        nome_plano,
        duracao,
        data_vencimento,
        ROUND(COALESCE(valor, 0), 2) AS valor,
        nome_usuario,
        telefone,
        celular,
        email
    FROM base
    WHERE ordem = 1
    ORDER BY data_vencimento, valor DESC, empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))


MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
]


def _validate(year: int, month: int, empresa: str, origem: str, pagador: str) -> None:
    today = date.today()

    if year < 2024:
        raise ValueError("A análise de vencimentos futuros começa em 2024.")
    if month < 0 or month > 12:
        raise ValueError("Mês inválido.")
    if year > today.year + 1:
        raise ValueError("Não é possível consultar tão longe no futuro.")
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _period_bounds(year: int, month: int) -> tuple[date, date]:
    return global_period_bounds(year, month, current_mode="none")

def _month_label(month: int) -> str:
    return "Ano completo" if month == 0 else MONTHS[month - 1]


def _duration_label(value: str | None) -> str:
    return {
        "M": "Mensal",
        "T": "Trimestral",
        "S": "Semestral",
        "A": "Anual",
    }.get(value or "", value or "Não informado")


def _format_client_name(company_id: int) -> str:
    return f"Cliente #{company_id}"


def _intranet_url(company_id: int) -> str:
    return f"https://intranet.clickdigital.com.br/clientes/visualizar/{company_id}?aba=5"


def _months_between(start: date | None, end: date | None) -> float:
    if not start or not end:
        return 0.0
    days = max((end - start).days, 0)
    return round(days / 30.4375, 1)


def _tenure_label(months: float) -> str:
    if months < 12:
        rounded = max(int(round(months)), 0)
        if rounded == 1:
            return "1 mês"
        return f"{rounded} meses"
    years = round(months / 12, 1)
    text = str(years).replace('.', ',')
    return f"{text} anos"


def _serialize_row(row: dict, payment_stats: dict[int, dict], today: date) -> dict:
    due_date: date | None = row.get("data_vencimento")
    activated_at: date | None = row.get("ativou_em")
    if isinstance(due_date, datetime):
        due_date = due_date.date()
    if isinstance(activated_at, datetime):
        activated_at = activated_at.date()
    payment = payment_stats.get(int(row["empresa_id"]), {})
    overdue_days = max((today - due_date).days, 0) if due_date else 0
    months_with_company = _months_between(activated_at, due_date or today)
    real_average = payment.get("media_dias_pagamento_real")
    considered_average = max(float(real_average or 0), 0.0)

    return {
        "empresa_id": int(row["empresa_id"]),
        "cliente": _format_client_name(int(row["empresa_id"])),
        "intranet_url": _intranet_url(int(row["empresa_id"])),
        "modalidade": str(row.get("modalidade") or ""),
        "empresa_indicacao_id": int(row.get("empresa_indicacao_id") or 0),
        "tipo_cobranca": str(row.get("tipo_cobranca") or ""),
        "empresa": str(row.get("empresa") or "Não informado"),
        "origem": str(row.get("origem") or "Não informado"),
        "pagador": str(row.get("pagador") or "Não informado"),
        "nome_plano": str(row.get("nome_plano") or "Não informado"),
        "duracao": str(row.get("duracao") or ""),
        "duracao_label": _duration_label(row.get("duracao")),
        "label_plano": f"{str(row.get('nome_plano') or 'Não informado')} · {_duration_label(row.get('duracao'))}",
        "data_vencimento": due_date.isoformat() if due_date else None,
        "valor": float(row.get("valor") or 0),
        "ativou_em": activated_at.isoformat() if activated_at else None,
        "tempo_casa_meses": months_with_company,
        "tempo_casa_label": _tenure_label(months_with_company),
        "dias_vencido": overdue_days,
        "em_churn": overdue_days >= 60,
        "media_dias_considerada": round(considered_average, 2),
        "ultrapassou_media_atraso": overdue_days > considered_average,
        "nome_usuario": row.get("nome_usuario"),
        "telefone": row.get("telefone"),
        "celular": row.get("celular"),
        "email": row.get("email"),
        "qtd_pagamentos": int(payment.get("qtd_pagamentos") or 0),
        "renovacoes_realizadas": int(payment.get("renovacoes_realizadas") or 0),
        "reativacoes": int(payment.get("reativacoes") or 0),
        "media_dias_pagamento": (
            float(payment.get("media_dias_pagamento_real"))
            if payment.get("media_dias_pagamento_real") is not None
            else None
        ),
        "ltv": round(float(payment.get("ltv") or 0), 2),
        "ticket_medio_historico": round(float(payment.get("ticket_medio") or 0), 2),
        "primeira_renovacao": int(payment.get("qtd_pagamentos") or 0) <= 1,
    }


def _aggregate_plan(items: list[dict]) -> list[dict]:
    grouped: dict[tuple[str, str], dict] = {}
    for item in items:
        key = (item["nome_plano"], item["duracao_label"])
        current = grouped.setdefault(
            key,
            {
                "plano": item["nome_plano"],
                "duracao": item["duracao"],
                "duracao_label": item["duracao_label"],
                "label": f"{item['nome_plano']} · {item['duracao_label']}",
                "clientes": 0,
                "valor_total": 0.0,
            },
        )
        current["clientes"] += 1
        current["valor_total"] += float(item["valor"])

    for row in grouped.values():
        row["ticket_medio"] = round(row["valor_total"] / row["clientes"], 2) if row["clientes"] else 0.0

    return sorted(grouped.values(), key=lambda row: (-row["valor_total"], -row["clientes"], row["label"]))


def _aggregate_calendar(items: list[dict], today: date) -> list[dict]:
    grouped: dict[str, dict] = {}
    churn_cutoff = today - timedelta(days=60)

    for item in items:
        if not item["data_vencimento"]:
            continue
        key = item["data_vencimento"]
        current = grouped.setdefault(
            key,
            {
                "date": key,
                "total_valor": 0.0,
                "total_clientes": 0,
            },
        )
        current["total_valor"] += float(item["valor"])
        current["total_clientes"] += 1

    rows = []
    for key, row in grouped.items():
        current_date = datetime.strptime(key, "%Y-%m-%d").date()
        rows.append(
            {
                **row,
                "day": current_date.day,
                "month": current_date.month,
                "year": current_date.year,
                "month_label": MONTHS[current_date.month - 1],
                "is_past": current_date < today,
                "is_today": current_date == today,
                "is_future": current_date > today,
                "is_churn": current_date <= churn_cutoff,
            }
        )

    return sorted(rows, key=lambda item: item["date"])


def get_vencimentos_futuros_dashboard(
    year: int,
    month: int,
    empresa: str,
    origem: str,
    pagador: str,
):
    _validate(year, month, empresa, origem, pagador)

    start_date, end_date = _period_bounds(year, month)
    today = date.today()

    params = {
        "data_inicio": start_date,
        "data_fim": end_date,
        "excluidos": VENCIMENTOS_EXCLUDED_COMPANY_IDS,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }

    with source_engine.connect() as connection:
        result = connection.execute(BASE_VENCIMENTOS_SQL, params)
        base_rows = [dict(item._mapping) for item in result]

    payment_stats = get_payment_metrics(row["empresa_id"] for row in base_rows)
    items = [_serialize_row(row, payment_stats, today) for row in base_rows]

    total_valor = round(sum(float(item["valor"]) for item in items), 2)
    total_clientes = len(items)
    ticket_medio = round(total_valor / total_clientes, 2) if total_clientes else 0.0
    churn_items = [item for item in items if item["em_churn"]]
    primeira_renovacao_items = [item for item in items if item["primeira_renovacao"]]
    plan_rows = _aggregate_plan(items)
    calendar_rows = _aggregate_calendar(items, today)

    top_largest_clients = sorted(
        items,
        key=lambda item: (-item["valor"], item["data_vencimento"] or "9999-12-31", item["empresa_id"]),
    )[:10]

    oldest_clients = sorted(
        items,
        key=lambda item: (
            item["ativou_em"] is None,
            item["ativou_em"] or "9999-12-31",
            -item["valor"],
        ),
    )[:10]

    top_first_renewal = sorted(
        primeira_renovacao_items,
        key=lambda item: (-item["valor"], item["data_vencimento"] or "9999-12-31", item["empresa_id"]),
    )[:10]

    top_first_renewal_monthly = sorted(
        [item for item in primeira_renovacao_items if item.get("duracao") == "M"],
        key=lambda item: (-item["valor"], item["data_vencimento"] or "9999-12-31", item["empresa_id"]),
    )[:10]

    return {
        "periodo": {
            "ano": year,
            "mes": month,
            "mes_label": _month_label(month),
            "ano_completo": month == 0,
            "data_inicio": start_date.isoformat(),
            "data_fim": end_date.isoformat(),
            "data_hoje": today.isoformat(),
            "data_churn": (today - timedelta(days=60)).isoformat(),
        },
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
        },
        "resumo": {
            "valor_total": total_valor,
            "clientes": total_clientes,
            "ticket_medio": ticket_medio,
            "clientes_em_churn": len(churn_items),
            "valor_em_churn": round(sum(float(item["valor"]) for item in churn_items), 2),
            "clientes_primeira_renovacao": len(primeira_renovacao_items),
        },
        "por_plano": plan_rows,
        "calendario": calendar_rows,
        "top_maiores_clientes": top_largest_clients,
        "top_clientes_antigos": oldest_clients,
        "top_primeira_renovacao": top_first_renewal,
        "top_primeira_renovacao_mensal": top_first_renewal_monthly,
    }


def get_vencimentos_futuros_meta() -> dict:
    today = date.today()
    return {
        "ano_inicio": 2024,
        "ano_atual": today.year,
        "mes_atual": today.month,
        "anos": list(range(2024, today.year + 2)),
        "meses": [{"value": 0, "label": "Ano completo"}] + [
            {"value": index + 1, "label": label}
            for index, label in enumerate(MONTHS)
        ],
    }


def get_vencimentos_export_options() -> dict:
    sql = text(
        """
        SELECT DISTINCT
            REPLACE(REPLACE(ep.nome_plano, ' + recursos', ''), ' (+) recursos', '') AS nome_plano
        FROM empresas_planos ep
        JOIN empresas e ON e.id = ep.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND e.id NOT IN :excluidos
        ORDER BY nome_plano
        """
    ).bindparams(bindparam("excluidos", expanding=True))

    with source_engine.connect() as connection:
        planos = [
            str(row[0])
            for row in connection.execute(
                sql,
                {"excluidos": VENCIMENTOS_EXCLUDED_COMPANY_IDS},
            ).all()
            if row[0]
        ]

    return {
        "planos": planos,
        "duracoes": [
            {"value": "M", "label": "Mensal"},
            {"value": "T", "label": "Trimestral"},
            {"value": "S", "label": "Semestral"},
            {"value": "A", "label": "Anual"},
        ],
    }


def get_vencimentos_export_rows(
    data_inicio: date,
    data_fim: date,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    plano: str = "",
    duracao: str = "",
    valor_minimo: float = 0.0,
    tempo_cliente_minimo: float | None = None,
    tempo_cliente_maximo: float | None = None,
    tempo_cliente_unidade: str = "mes",
    somente_ultrapassou_media: bool = False,
) -> dict:
    if data_fim < data_inicio:
        raise ValueError("A data final não pode ser menor que a data inicial.")
    if tempo_cliente_unidade not in {"mes", "ano"}:
        raise ValueError("Unidade de tempo inválida. Use mes ou ano.")
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")

    params = {
        "data_inicio": data_inicio,
        "data_fim": data_fim + timedelta(days=1),
        "excluidos": VENCIMENTOS_EXCLUDED_COMPANY_IDS,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }

    with source_engine.connect() as connection:
        result = connection.execute(BASE_VENCIMENTOS_SQL, params)
        base_rows = [dict(item._mapping) for item in result]

    payment_stats = get_payment_metrics(row["empresa_id"] for row in base_rows)
    today = date.today()
    rows = [_serialize_row(row, payment_stats, today) for row in base_rows]

    plan_term = plano.strip().lower()
    duration_term = duracao.strip().upper()
    multiplier = 12 if tempo_cliente_unidade == "ano" else 1
    minimum_months = None if tempo_cliente_minimo is None else float(tempo_cliente_minimo) * multiplier
    maximum_months = None if tempo_cliente_maximo is None else float(tempo_cliente_maximo) * multiplier

    filtered = []
    for row in rows:
        if plan_term and str(row.get("nome_plano") or "").lower() != plan_term:
            continue
        if duration_term and str(row.get("duracao") or "").upper() != duration_term:
            continue
        if float(row.get("valor") or 0) < float(valor_minimo or 0):
            continue
        tenure = float(row.get("tempo_casa_meses") or 0)
        if minimum_months is not None and tenure < minimum_months:
            continue
        if maximum_months is not None and tenure > maximum_months:
            continue
        if somente_ultrapassou_media and not bool(row.get("ultrapassou_media_atraso")):
            continue
        filtered.append(row)

    export_rows = []
    for row in filtered:
        export_rows.append(
            {
                "id": row["empresa_id"],
                "ativou_em": row["ativou_em"],
                "modalidade": row["modalidade"],
                "empresa_indicacao_id": row["empresa_indicacao_id"],
                "tipo_cobranca": row["tipo_cobranca"],
                "nome_plano": row["nome_plano"],
                "duracao": row["duracao"],
                "data_vencimento": row["data_vencimento"],
                "valor": row["valor"],
                "nome_usuario": row.get("nome_usuario"),
                "telefone": row.get("telefone"),
                "celular": row.get("celular"),
                "email": row.get("email"),
                "empresa": row["empresa"],
                "origem": row["origem"],
                "pagador": row["pagador"],
                "tempo_cliente_meses": row["tempo_casa_meses"],
                "qtd_pagamentos": row["qtd_pagamentos"],
                "renovacoes": row["renovacoes_realizadas"],
                "reativacoes": row["reativacoes"],
                "media_dias_pagamento_real": row["media_dias_pagamento"],
                "ltv": row["ltv"],
                "ticket_medio_historico": row["ticket_medio_historico"],
                "intranet_url": row["intranet_url"],
            }
        )

    return {
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "data_inicio": data_inicio.isoformat(),
            "data_fim": data_fim.isoformat(),
            "plano": plano,
            "duracao": duracao,
            "valor_minimo": float(valor_minimo or 0),
            "tempo_cliente_minimo": tempo_cliente_minimo,
            "tempo_cliente_maximo": tempo_cliente_maximo,
            "tempo_cliente_unidade": tempo_cliente_unidade,
            "somente_ultrapassou_media": somente_ultrapassou_media,
        },
        "total": len(export_rows),
        "rows": export_rows,
    }
