from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine

PAYMENT_METRICS_EXCLUDED_COMPANY_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371, 517101)))

PAYMENT_METRICS_SQL = text(
    """
    WITH planos AS (
        SELECT
            ep.id,
            ep.empresa_id,
            ep.pago_em,
            ep.data_vencimento,
            ep.cadastrado_em,
            COUNT(*) OVER (PARTITION BY ep.empresa_id) AS qtd_pagamentos,
            LEAD(ep.pago_em) OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em, ep.id
            ) AS pgto_renovacao
        FROM empresas_planos ep
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.cadastrado_em >= '2024-01-01'
            AND ep.nome_plano NOT LIKE '% (+) recursos%'
            AND ep.nome_plano NOT LIKE '% + recursos%'
            AND ep.empresa_id IN :empresa_ids
            AND ep.empresa_id NOT IN :excluidos
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
        WHERE qtd_pagamentos > 1
          AND pgto_renovacao IS NOT NULL
    ),
    timing AS (
        SELECT
            empresa_id,
            MAX(qtd_pagamentos) AS qtd_pagamentos_timing,
            SUM(reativacao) AS reativacoes,
            ROUND(AVG(CASE WHEN reativacao = 1 THEN NULL ELSE dias_pgto END), 2) AS media_dias_pagamento_real
        FROM calculo_pagamentos
        GROUP BY empresa_id
    ),
    historico_ltv AS (
        SELECT
            ep.empresa_id,
            COUNT(*) AS qtd_pagamentos_ltv,
            ROUND(SUM(CASE WHEN ep.valor > 100000 THEN ep.valor / 100 ELSE ep.valor END), 2) AS ltv,
            ROUND(AVG(CASE WHEN ep.valor > 100000 THEN ep.valor / 100 ELSE ep.valor END), 2) AS ticket_medio
        FROM empresas_planos ep
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.nome_plano NOT LIKE '% (+) recursos%'
            AND ep.nome_plano NOT LIKE '% + recursos%'
            AND ep.empresa_id IN :empresa_ids
            AND ep.empresa_id NOT IN :excluidos
        GROUP BY ep.empresa_id
    )
    SELECT
        h.empresa_id,
        h.qtd_pagamentos_ltv AS qtd_pagamentos,
        GREATEST(h.qtd_pagamentos_ltv - 1, 0) AS renovacoes_realizadas,
        COALESCE(t.reativacoes, 0) AS reativacoes,
        t.media_dias_pagamento_real AS media_dias_pagamento_real,
        h.ltv,
        h.ticket_medio
    FROM historico_ltv h
    LEFT JOIN timing t ON t.empresa_id = h.empresa_id
    """
).bindparams(
    bindparam("empresa_ids", expanding=True),
    bindparam("excluidos", expanding=True),
)


def get_payment_metrics(company_ids: Iterable[int]) -> dict[int, dict]:
    ids = sorted({int(value) for value in company_ids if value is not None})
    if not ids:
        return {}

    result: dict[int, dict] = {}
    chunk_size = 1500

    with source_engine.connect() as connection:
        for index in range(0, len(ids), chunk_size):
            chunk = ids[index:index + chunk_size]
            rows = connection.execute(
                PAYMENT_METRICS_SQL,
                {
                    "empresa_ids": chunk,
                    "excluidos": PAYMENT_METRICS_EXCLUDED_COMPANY_IDS,
                },
            ).mappings().all()
            for row in rows:
                company_id = int(row["empresa_id"])
                result[company_id] = {
                    "qtd_pagamentos": int(row.get("qtd_pagamentos") or 0),
                    "renovacoes_realizadas": int(row.get("renovacoes_realizadas") or 0),
                    "reativacoes": int(row.get("reativacoes") or 0),
                    "media_dias_pagamento_real": (
                        float(row["media_dias_pagamento_real"])
                        if row.get("media_dias_pagamento_real") is not None
                        else None
                    ),
                    "ltv": float(row.get("ltv") or 0),
                    "ticket_medio": float(row.get("ticket_medio") or 0),
                }

    return result


def get_payment_metric(company_id: int) -> dict:
    return get_payment_metrics([company_id]).get(
        int(company_id),
        {
            "qtd_pagamentos": 0,
            "renovacoes_realizadas": 0,
            "reativacoes": 0,
            "media_dias_pagamento_real": None,
            "ltv": 0.0,
            "ticket_medio": 0.0,
        },
    )
