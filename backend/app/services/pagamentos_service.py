from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from sqlalchemy import bindparam, text

from app.database import source_engine

try:
    from app.constants import EXCLUDED_COMPANY_IDS
except Exception:  # pragma: no cover
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
        497959, 510928, 514140, 187078, 521671, 224287,
    )

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

PAYMENTS_EXCLUDED_COMPANY_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371, 517101)))

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

EVENTS_SQL = text(
    f"""
WITH planos AS (
    SELECT
        ep.id,
        ep.empresa_id,
        REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
        ep.duracao,
        ep.pago_em,
        CASE
            WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
            ELSE ep.valor
        END AS valor,
        ep.data_vencimento,
        LEAD(ep.pago_em) OVER (
            PARTITION BY ep.empresa_id
            ORDER BY ep.pago_em, ep.id
        ) AS pgto_renovacao,
        LEAD(
            CASE
                WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
                ELSE ep.valor
            END
        ) OVER (
            PARTITION BY ep.empresa_id
            ORDER BY ep.pago_em, ep.id
        ) AS valor_renovacao,
        LEAD(REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '')) OVER (
            PARTITION BY ep.empresa_id
            ORDER BY ep.pago_em, ep.id
        ) AS plano_renovacao,
        COUNT(*) OVER (
            PARTITION BY ep.empresa_id
        ) AS qtd_pagamentos
    FROM empresas_planos ep
    LEFT JOIN empresas e ON ep.empresa_id = e.id
    WHERE
        ep.plano_id <> 1
        AND ep.pago_em IS NOT NULL
        AND ep.nota_fiscal_servico_id IS NOT NULL
        AND ep.cadastrado_em >= '2024-01-01'
        AND ep.nome_plano NOT LIKE '% (+) recursos%'
        AND ep.nome_plano NOT LIKE '% + recursos%'
        AND e.id NOT IN :excluidos
        {DIMENSION_FILTER_SQL}
),
calculo_pagamentos AS (
    SELECT
        *,
        DATEDIFF(pgto_renovacao, data_vencimento) AS dias_pgto,
        CASE
            WHEN DATEDIFF(pgto_renovacao, data_vencimento) >= 60 THEN 1
            ELSE 0
        END AS reativacao
    FROM planos
    WHERE
        qtd_pagamentos > 1
        AND pgto_renovacao IS NOT NULL
        AND pgto_renovacao >= '2024-01-01'
),
resultado AS (
    SELECT
        *,
        CASE
            WHEN reativacao = 1 THEN NULL
            ELSE dias_pgto
        END AS dias_pgto_real,
        CASE
            WHEN reativacao = 1 THEN 'reativacao'
            WHEN dias_pgto < 0 THEN 'antecipado'
            WHEN dias_pgto = 0 THEN 'no_vencimento'
            WHEN dias_pgto BETWEEN 1 AND 3 THEN 'prorrogacao'
            ELSE 'atrasado'
        END AS faixa_pagamento
    FROM calculo_pagamentos
)
SELECT
    empresa_id,
    pgto_renovacao,
    COALESCE(NULLIF(plano_renovacao, ''), nome_plano, 'Não informado') AS plano,
    ROUND(COALESCE(valor_renovacao, valor, 0), 2) AS faturamento,
    faixa_pagamento,
    dias_pgto_real
FROM resultado
ORDER BY pgto_renovacao, empresa_id
"""
).bindparams(bindparam("excluidos", expanding=True))

MONTH_LABELS = (
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
)

CATEGORY_META = (
    (
        "antecipado",
        "Antes do vencimento",
        "Pagamentos de renovação realizados antes da data de vencimento.",
    ),
    (
        "no_vencimento",
        "No dia do vencimento",
        "Pagamentos de renovação realizados exatamente na data de vencimento.",
    ),
    (
        "prorrogacao",
        "Durante a prorrogação",
        "Pagamentos realizados de 1 a 3 dias depois do vencimento, quando o acesso ainda está em prorrogação.",
    ),
    (
        "atrasado",
        "Atrasados",
        "Pagamentos feitos acima de 3 dias depois do vencimento e antes de completar 60 dias.",
    ),
    (
        "reativacao",
        "Reativações",
        "Pagamentos feitos depois de pelo menos 60 dias de atraso. Nesse caso o cliente já havia entrado em churn e voltou.",
    ),
)


def _validate(empresa: str, origem: str, pagador: str) -> None:
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _new_bucket() -> dict[str, Any]:
    return {
        "pagamentos_total": 0,
        "clientes_total": set(),
        "faturamento_total": 0.0,
        "dias_reais": [],
        "categorias": {
            key: {
                "pagamentos": 0,
                "clientes": set(),
                "faturamento": 0.0,
            }
            for key, _, _ in CATEGORY_META
        },
    }


def _add_event(bucket: dict[str, Any], event: dict[str, Any]) -> None:
    company_id = int(event["empresa_id"])
    revenue = float(event.get("faturamento") or 0)
    category = str(event.get("faixa_pagamento") or "")
    real_days = event.get("dias_pgto_real")

    bucket["pagamentos_total"] += 1
    bucket["clientes_total"].add(company_id)
    bucket["faturamento_total"] += revenue

    if real_days is not None:
        bucket["dias_reais"].append(float(real_days))

    if category in bucket["categorias"]:
        current = bucket["categorias"][category]
        current["pagamentos"] += 1
        current["clientes"].add(company_id)
        current["faturamento"] += revenue


def _serialize_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    total = int(bucket["pagamentos_total"])
    real_days = bucket["dias_reais"]
    average = round(sum(real_days) / len(real_days), 2) if real_days else None
    cards: list[dict[str, Any]] = []

    for key, label, explanation in CATEGORY_META:
        current = bucket["categorias"][key]
        payments = int(current["pagamentos"])
        cards.append(
            {
                "key": key,
                "label": label,
                "explicacao": explanation,
                "percentual": round((payments / total) * 100, 2) if total else 0.0,
                "pagamentos": payments,
                "clientes": len(current["clientes"]),
                "faturamento": round(float(current["faturamento"]), 2),
            }
        )

    cards.append(
        {
            "key": "media_dias",
            "label": "Tempo médio de pagamento",
            "explicacao": (
                "Média de dias entre vencimento e pagamento nas renovações comuns. "
                "Reativações não entram nessa média. Valor negativo significa pagamento antecipado."
            ),
            "media_dias": average,
            "pagamentos": total,
            "clientes": len(bucket["clientes_total"]),
            "faturamento": round(float(bucket["faturamento_total"]), 2),
        }
    )

    return {
        "pagamentos_total": total,
        "clientes_total": len(bucket["clientes_total"]),
        "faturamento_total": round(float(bucket["faturamento_total"]), 2),
        "media_dias_pagamento": average,
        "cards": cards,
    }


def _payment_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def get_pagamentos_dashboard(
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict[str, Any]:
    _validate(empresa, origem, pagador)
    params = {
        "excluidos": PAYMENTS_EXCLUDED_COMPANY_IDS,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }

    with source_engine.connect() as connection:
        events = [dict(row) for row in connection.execute(EVENTS_SQL, params).mappings().all()]

    monthly: dict[tuple[int, int], dict[str, Any]] = defaultdict(_new_bucket)
    yearly: dict[int, dict[str, Any]] = defaultdict(_new_bucket)
    plan_monthly: dict[tuple[int, int, str], dict[str, Any]] = defaultdict(_new_bucket)

    for event in events:
        paid_at = _payment_date(event["pgto_renovacao"])
        plan = str(event.get("plano") or "Não informado")
        _add_event(monthly[(paid_at.year, paid_at.month)], event)
        _add_event(yearly[paid_at.year], event)
        _add_event(plan_monthly[(paid_at.year, paid_at.month, plan)], event)

    monthly_rows = []
    for (year, month), bucket in sorted(monthly.items()):
        monthly_rows.append(
            {
                "ano": year,
                "mes": month,
                "label": f"{MONTH_LABELS[month - 1]}/{str(year)[-2:]}",
                **_serialize_bucket(bucket),
            }
        )

    yearly_rows = []
    for year, bucket in sorted(yearly.items()):
        yearly_rows.append({"ano": year, **_serialize_bucket(bucket)})

    plan_rows = []
    for (year, month, plan), bucket in sorted(plan_monthly.items()):
        plan_rows.append(
            {
                "plano": plan,
                "ano": year,
                "mes": month,
                "label": f"{MONTH_LABELS[month - 1]}/{str(year)[-2:]}",
                **_serialize_bucket(bucket),
            }
        )

    today = date.today()
    available_years = sorted(set(yearly.keys()) | {today.year})
    plans = sorted({row["plano"] for row in plan_rows}, key=str.casefold)

    return {
        "data_referencia": today.isoformat(),
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
        },
        "periodo_padrao": {
            "ano": today.year,
            "mes": today.month,
        },
        "anos": available_years,
        "meses": [
            {"value": index + 1, "label": label}
            for index, label in enumerate(
                (
                    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
                )
            )
        ],
        "planos": plans,
        "historico_mensal": monthly_rows,
        "historico_anual": yearly_rows,
        "historico_planos": plan_rows,
    }
