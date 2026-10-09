from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from functools import lru_cache
from statistics import mean, median

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine
from app.services.global_filter_context import period_bounds as global_period_bounds


VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}

UTM_DIMENSIONS = [
    ("utm_source", "UTM Source", 1),
    ("utm_medium", "UTM Medium", 2),
    ("utm_campaign", "UTM Campaign", 3),
    ("utm_content", "UTM Content", 4),
    ("utm_term", "UTM Term", 5),
]

# As consultas validadas pelo usuário adicionam também estes IDs às exclusões.
CHURN_EXCLUDED_COMPANY_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371)))

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

# Baseada diretamente nas consultas fornecidas:
# - somente registros atuais (ep.atual = 1)
# - plano pago e com NF
# - vencimento desde 2024
# - somente clientes com 60 dias ou mais de atraso
# - tempo de vida = ativação -> data_vencimento
# - LTV = histórico de pagamentos do cliente
# - valores históricos > 100000 são divididos por 100, conforme a SQL de LTV validada
CHURN_CLIENTS_SQL = text(
    f"""
    WITH clientes_encerrados AS (
        SELECT
            ep.empresa_id,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            e.ativou_em,
            e.utm_source,
            e.utm_medium,
            e.utm_campaign,
            e.utm_term,
            e.utm_content,
            ep.cpf_cnpj,
            ep.razao_social,
            ep.nome_usuario,
            ep.telefone,
            (SELECT MAX(l.celular) FROM lojas l WHERE l.empresa_id = e.id) AS celular,
            ep.email,
            (
                SELECT nfs_doc.dest_cnpj
                FROM notas_fiscais_servicos nfs_doc
                WHERE nfs_doc.plano_id = ep.id
                  AND nfs_doc.situacao < 4
                ORDER BY nfs_doc.data_emissao DESC, nfs_doc.id DESC
                LIMIT 1
            ) AS dest_cnpj,
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
            DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY) AS churn_em,
            DATEDIFF(:data_referencia, ep.data_vencimento) AS dias_vencido,
            TIMESTAMPDIFF(MONTH, e.ativou_em, ep.data_vencimento) AS tempo_vida,
            GREATEST(DATEDIFF(ep.data_vencimento, e.ativou_em), 0) AS dias_cliente,
            CASE
                WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
                ELSE ep.valor
            END AS valor_perdido,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.data_vencimento >= '2024-01-01'
            AND ep.data_vencimento <= DATE_SUB(:data_referencia, INTERVAL 60 DAY)
            AND DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY) >= :data_inicio
            AND DATE_ADD(ep.data_vencimento, INTERVAL 60 DAY) < :data_fim
            AND e.id NOT IN :excluidos
            {DIMENSION_FILTER_SQL}
    ),
    historico_pagamentos AS (
        SELECT
            ep.id,
            ep.empresa_id,
            ep.pago_em,
            CASE
                WHEN ep.valor > 100000 THEN ep.valor / 100
                ELSE ep.valor
            END AS valor
        FROM empresas_planos ep
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
    ),
    metricas AS (
        SELECT
            ce.empresa_id,
            ce.modalidade,
            ce.empresa_indicacao_id,
            ce.tipo_cobranca,
            ce.empresa,
            ce.origem,
            ce.pagador,
            ce.utm_source,
            ce.utm_medium,
            ce.utm_campaign,
            ce.utm_term,
            ce.utm_content,
            ce.ativou_em,
            ce.cpf_cnpj,
            ce.dest_cnpj,
            ce.razao_social,
            ce.nome_usuario,
            ce.telefone,
            ce.celular,
            ce.email,
            ce.nome_plano,
            ce.duracao,
            ce.data_vencimento,
            ce.churn_em,
            ce.dias_vencido,
            ce.tempo_vida,
            ce.dias_cliente,
            ce.valor_perdido,
            COUNT(hp.id) AS qtd_pagamentos,
            ROUND(COALESCE(SUM(hp.valor), 0), 2) AS ltv,
            ROUND(COALESCE(AVG(hp.valor), 0), 2) AS ticket_medio,
            MAX(hp.pago_em) AS ultimo_pagamento
        FROM clientes_encerrados ce
        JOIN historico_pagamentos hp
            ON ce.empresa_id = hp.empresa_id
        WHERE ce.ordem = 1
        GROUP BY
            ce.empresa_id,
            ce.modalidade,
            ce.empresa_indicacao_id,
            ce.tipo_cobranca,
            ce.empresa,
            ce.origem,
            ce.pagador,
            ce.utm_source,
            ce.utm_medium,
            ce.utm_campaign,
            ce.utm_term,
            ce.utm_content,
            ce.ativou_em,
            ce.cpf_cnpj,
            ce.dest_cnpj,
            ce.razao_social,
            ce.nome_usuario,
            ce.telefone,
            ce.celular,
            ce.email,
            ce.nome_plano,
            ce.duracao,
            ce.data_vencimento,
            ce.churn_em,
            ce.dias_vencido,
            ce.tempo_vida,
            ce.dias_cliente,
            ce.valor_perdido
    )
    SELECT
        empresa_id,
        empresa,
        origem,
        pagador,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        ativou_em,
        cpf_cnpj,
        dest_cnpj,
        razao_social,
        nome_usuario,
        telefone,
        celular,
        email,
        nome_plano,
        duracao,
        data_vencimento,
        churn_em,
        dias_vencido,
        tempo_vida,
        dias_cliente,
        ROUND(COALESCE(valor_perdido, 0), 2) AS valor_perdido,
        qtd_pagamentos,
        ultimo_pagamento,
        GREATEST(DATEDIFF(churn_em, ultimo_pagamento), 0) AS recencia_dias,
        GREATEST(qtd_pagamentos - 1, 0) AS renovacoes,
        ltv,
        ticket_medio,
        ROUND(ltv / NULLIF(tempo_vida, 0), 2) AS receita_media_mensal
    FROM metricas
    ORDER BY ltv DESC, empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))


# Coorte por duração e por renovação real.
# M representa o mês de vida da coorte. Só exibimos os meses em que uma
# renovação é esperada para a duração inicial do cliente.
CHURN_COHORT_SQL = text(
    f"""
    WITH ciclos_iniciais_brutos AS (
        SELECT
            e.id AS empresa_id,
            CAST(DATE_FORMAT(e.ativou_em, '%Y-%m-01') AS DATE) AS coorte,
            ep.id,
            ep.pago_em,
            ep.data_vencimento,
            ep.duracao,
            ROW_NUMBER() OVER (
                PARTITION BY e.id
                ORDER BY ep.data_vencimento, ep.pago_em, ep.id
            ) AS ordem_inicial
        FROM empresas e
        JOIN empresas_planos ep ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.data_vencimento IS NOT NULL
            AND e.ativou_em IS NOT NULL
            AND e.ativou_em >= '2024-01-01'
            AND e.ativou_em < :data_fim
            AND e.id NOT IN :excluidos
            AND LOWER(COALESCE(ep.nome_plano, '')) NOT LIKE '%+ recursos%'
            AND ep.duracao IN ('M', 'T', 'S', 'A')
            {DIMENSION_FILTER_SQL}
    ),
    empresas_coorte AS (
        SELECT
            empresa_id,
            coorte,
            duracao,
            CASE
                WHEN duracao = 'M' THEN 1
                WHEN duracao = 'T' THEN 3
                WHEN duracao = 'S' THEN 6
                WHEN duracao = 'A' THEN 12
            END AS intervalo_meses
        FROM ciclos_iniciais_brutos
        WHERE ordem_inicial = 1
    ),
    historico_bruto AS (
        SELECT
            ep.empresa_id,
            ep.id,
            DATE(ep.pago_em) AS pagamento_em,
            DATE(ep.data_vencimento) AS data_vencimento
        FROM empresas_planos ep
        JOIN empresas_coorte ec ON ec.empresa_id = ep.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.data_vencimento IS NOT NULL
            AND DATE(ep.pago_em) <= :data_referencia
            AND LOWER(COALESCE(ep.nome_plano, '')) NOT LIKE '%+ recursos%'
    ),
    -- Um mesmo pagamento pode gerar mais de uma linha. Isso continua sendo
    -- um único evento comercial.
    pagamentos_unicos AS (
        SELECT
            empresa_id,
            pagamento_em,
            MIN(id) AS id,
            MAX(data_vencimento) AS data_vencimento
        FROM historico_bruto
        GROUP BY empresa_id, pagamento_em
    ),
    -- Se o vencimento não avançou, não existiu um novo ciclo.
    ciclos_unicos AS (
        SELECT
            empresa_id,
            data_vencimento,
            MIN(pagamento_em) AS pagamento_em,
            MIN(id) AS id
        FROM pagamentos_unicos
        GROUP BY empresa_id, data_vencimento
    ),
    ciclos_ordenados AS (
        SELECT
            c.*,
            ROW_NUMBER() OVER (
                PARTITION BY c.empresa_id
                ORDER BY c.data_vencimento, c.pagamento_em, c.id
            ) AS ordem_ciclo,
            LAG(c.data_vencimento) OVER (
                PARTITION BY c.empresa_id
                ORDER BY c.data_vencimento, c.pagamento_em, c.id
            ) AS vencimento_anterior
        FROM ciclos_unicos c
    ),
    eventos AS (
        SELECT
            c.*,
            CASE
                WHEN c.ordem_ciclo = 1 THEN 0
                WHEN c.vencimento_anterior IS NULL THEN 1
                WHEN c.data_vencimento <= c.vencimento_anterior THEN 1
                WHEN DATEDIFF(c.pagamento_em, c.vencimento_anterior) >= 60 THEN 1
                ELSE 0
            END AS quebra_churn
        FROM ciclos_ordenados c
    ),
    sequencia AS (
        SELECT
            e.*,
            SUM(e.quebra_churn) OVER (
                PARTITION BY e.empresa_id
                ORDER BY e.ordem_ciclo
                ROWS UNBOUNDED PRECEDING
            ) AS quebras_acumuladas
        FROM eventos e
    ),
    renovacoes AS (
        SELECT
            empresa_id,
            MAX(
                CASE
                    WHEN ordem_ciclo = 1 THEN 0
                    WHEN quebras_acumuladas = 0 THEN ordem_ciclo - 1
                    ELSE 0
                END
            ) AS renovacoes_validas
        FROM sequencia
        GROUP BY empresa_id
    ),
    idades AS (
        SELECT 0 AS idade UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
        UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11
        UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
        UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
        UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23
        UNION ALL SELECT 24
    )
    SELECT
        ec.duracao,
        ec.intervalo_meses,
        ec.coorte,
        i.idade,
        COUNT(DISTINCT ec.empresa_id) AS base_clientes,
        CASE
            WHEN i.idade = 0 THEN COUNT(DISTINCT ec.empresa_id)
            WHEN MOD(i.idade, ec.intervalo_meses) <> 0 THEN NULL
            WHEN DATE_ADD(ec.coorte, INTERVAL i.idade MONTH) > :data_referencia THEN NULL
            ELSE COUNT(DISTINCT CASE
                WHEN COALESCE(r.renovacoes_validas, 0) >= (i.idade / ec.intervalo_meses)
                THEN ec.empresa_id
                ELSE NULL
            END)
        END AS retidos,
        CASE
            WHEN i.idade = 0 OR MOD(i.idade, ec.intervalo_meses) = 0 THEN 1
            ELSE 0
        END AS aplicavel,
        CASE
            WHEN (i.idade = 0 OR MOD(i.idade, ec.intervalo_meses) = 0)
                 AND DATE_ADD(ec.coorte, INTERVAL i.idade MONTH) <= :data_referencia
            THEN 1
            ELSE 0
        END AS observavel
    FROM empresas_coorte ec
    CROSS JOIN idades i
    LEFT JOIN renovacoes r ON r.empresa_id = ec.empresa_id
    GROUP BY ec.duracao, ec.intervalo_meses, ec.coorte, i.idade
    ORDER BY FIELD(ec.duracao, 'M', 'T', 'S', 'A'), ec.coorte, i.idade
    """
).bindparams(bindparam("excluidos", expanding=True))


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    return global_period_bounds(year, month, current_mode="today_inclusive")

def _validate(year: int, month: int, empresa: str, origem: str, pagador: str) -> None:
    today = date.today()
    if year < 2024:
        raise ValueError("A análise de churn começa em 2024.")
    if not 0 <= month <= 12:
        raise ValueError("Mês inválido.")
    if year > today.year or (year == today.year and month != 0 and month > today.month):
        raise ValueError("Não é possível consultar um período futuro.")
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _duration_label(value: str | None) -> str:
    return {
        "M": "Mensal",
        "T": "Trimestral",
        "S": "Semestral",
        "A": "Anual",
    }.get(value or "", value or "Não informado")


def _bucket_tenure(months: float) -> tuple[str, int]:
    if months <= 3:
        return "Até 3 meses", 1
    if months <= 6:
        return "4 a 6 meses", 2
    if months <= 12:
        return "7 a 12 meses", 3
    if months <= 24:
        return "1 a 2 anos", 4
    if months <= 36:
        return "2 a 3 anos", 5
    if months <= 60:
        return "3 a 5 anos", 6
    return "Mais de 5 anos", 7


def _bucket_renewals(renewals: int) -> tuple[str, int]:
    if renewals >= 5:
        return "5 ou mais", 6
    return f"{renewals} renovação" if renewals == 1 else f"{renewals} renovações", renewals + 1


def _bucket_ltv(value: float) -> tuple[str, int]:
    if value <= 500:
        return "Até R$ 500", 1
    if value <= 1000:
        return "R$ 500 a R$ 1 mil", 2
    if value <= 2500:
        return "R$ 1 mil a R$ 2,5 mil", 3
    if value <= 5000:
        return "R$ 2,5 mil a R$ 5 mil", 4
    if value <= 10000:
        return "R$ 5 mil a R$ 10 mil", 5
    return "Acima de R$ 10 mil", 6


def _aggregate_dimension(rows: list[dict], field: str) -> list[dict]:
    grouped: defaultdict[str, dict] = defaultdict(
        lambda: {"clientes": 0, "ltv_total": 0.0, "valor_perdido": 0.0}
    )
    for row in rows:
        label = str(row.get(field) or "Não informado")
        grouped[label]["clientes"] += 1
        grouped[label]["ltv_total"] += float(row.get("ltv") or 0)
        grouped[label]["valor_perdido"] += float(row.get("valor_perdido") or 0)

    total_clients = len(rows)
    return [
        {
            "label": label,
            "clientes": values["clientes"],
            "percentual_clientes": round((values["clientes"] / total_clients * 100), 2) if total_clients else 0.0,
            "ltv_total": round(values["ltv_total"], 2),
            "valor_perdido": round(values["valor_perdido"], 2),
        }
        for label, values in sorted(grouped.items(), key=lambda item: item[1]["clientes"], reverse=True)
    ]



def _aggregate_utm_dimension(rows: list[dict], field: str, label: str, priority: int) -> dict:
    ignored_values = {"", "none", "null", "não informado", "nao informado", "(not set)", "not set"}
    informed_rows = []
    for row in rows:
        raw_value = row.get(field)
        value = str(raw_value or "").strip()
        if not value or value.lower() in ignored_values:
            continue
        informed_rows.append(row)

    grouped: defaultdict[str, dict] = defaultdict(
        lambda: {"clientes": 0, "ltv_total": 0.0, "valor_perdido": 0.0}
    )
    for row in informed_rows:
        value = str(row.get(field) or "").strip()
        grouped[value]["clientes"] += 1
        grouped[value]["ltv_total"] += float(row.get("ltv") or 0)
        grouped[value]["valor_perdido"] += float(row.get("valor_perdido") or 0)

    total_clients = len(rows)
    informed_clients = len(informed_rows)
    items = [
        {
            "label": value,
            "clientes": metrics["clientes"],
            "percentual_clientes": round(metrics["clientes"] / total_clients * 100, 2) if total_clients else 0.0,
            "ltv_total": round(metrics["ltv_total"], 2),
            "valor_perdido": round(metrics["valor_perdido"], 2),
        }
        for value, metrics in grouped.items()
    ]
    items.sort(key=lambda item: (item["valor_perdido"], item["clientes"]), reverse=True)

    return {
        "field": field,
        "label": label,
        "prioridade": priority,
        "clientes_informados": informed_clients,
        "cobertura_clientes": round(informed_clients / total_clients * 100, 2) if total_clients else 0.0,
        "itens": items[:20],
    }



def _rank_score(rows: list[dict], field: str, *, lower_is_better: bool) -> dict[int, int]:
    if not rows:
        return {}
    ordered = sorted(
        rows,
        key=lambda row: float(row.get(field) or 0),
        reverse=not lower_is_better,
    )
    total = len(ordered)
    result: dict[int, int] = {}
    for index, row in enumerate(ordered):
        # Divide a base em cinco blocos aproximadamente iguais.
        score = max(1, 5 - int((index * 5) / max(total, 1)))
        result[int(row["empresa_id"])] = score
    return result


def _rfm_segment(total_score: int) -> str:
    if total_score >= 13:
        return "Alto valor e recorrência"
    if total_score >= 10:
        return "Relacionamento forte"
    if total_score >= 7:
        return "Relacionamento intermediário"
    return "Baixo histórico"


def _build_rfm(rows: list[dict]) -> dict:
    if not rows:
        return {"segmentos": [], "clientes": []}

    r_scores = _rank_score(rows, "recencia_dias", lower_is_better=True)
    f_scores = _rank_score(rows, "qtd_pagamentos", lower_is_better=False)
    m_scores = _rank_score(rows, "ltv", lower_is_better=False)

    scored: list[dict] = []
    grouped: defaultdict[str, dict] = defaultdict(
        lambda: {"clientes": 0, "valor_perdido": 0.0, "ltv_total": 0.0, "score_total": 0.0}
    )
    for row in rows:
        company_id = int(row["empresa_id"])
        r_score = r_scores.get(company_id, 1)
        f_score = f_scores.get(company_id, 1)
        m_score = m_scores.get(company_id, 1)
        total_score = r_score + f_score + m_score
        segment = _rfm_segment(total_score)
        item = {
            "empresa_id": company_id,
            "cliente": row.get("cliente") or f"Cliente #{company_id}",
            "plano": row.get("nome_plano") or "Não informado",
            "recencia_dias": int(row.get("recencia_dias") or 0),
            "pagamentos": int(row.get("qtd_pagamentos") or 0),
            "ltv": round(float(row.get("ltv") or 0), 2),
            "valor_perdido": round(float(row.get("valor_perdido") or 0), 2),
            "r": r_score,
            "f": f_score,
            "m": m_score,
            "score": total_score,
            "segmento": segment,
        }
        scored.append(item)
        group = grouped[segment]
        group["clientes"] += 1
        group["valor_perdido"] += item["valor_perdido"]
        group["ltv_total"] += item["ltv"]
        group["score_total"] += total_score

    segments = []
    total_clients = len(rows)
    for label, values in grouped.items():
        clients = int(values["clientes"])
        segments.append({
            "segmento": label,
            "clientes": clients,
            "percentual_clientes": round(clients / total_clients * 100, 2) if total_clients else 0.0,
            "valor_perdido": round(values["valor_perdido"], 2),
            "ltv_total": round(values["ltv_total"], 2),
            "score_medio": round(values["score_total"] / clients, 1) if clients else 0.0,
        })
    segments.sort(key=lambda item: (item["score_medio"], item["valor_perdido"]), reverse=True)
    scored.sort(key=lambda item: (item["score"], item["ltv"], item["valor_perdido"]), reverse=True)
    return {"segmentos": segments, "clientes": scored[:100]}


def _build_pareto(rows: list[dict]) -> dict:
    ordered = sorted(rows, key=lambda row: (float(row.get("valor_perdido") or 0), float(row.get("ltv") or 0)), reverse=True)
    total_value = sum(float(row.get("valor_perdido") or 0) for row in ordered)
    if not ordered or total_value <= 0:
        return {
            "clientes_ate_80": 0,
            "percentual_base": 0.0,
            "valor_acumulado": 0.0,
            "valor_total": round(total_value, 2),
            "clientes": [],
        }

    accumulated = 0.0
    selected = []
    for row in ordered:
        value = float(row.get("valor_perdido") or 0)
        accumulated += value
        selected.append({
            "empresa_id": int(row["empresa_id"]),
            "cliente": row.get("cliente") or f"Cliente #{int(row['empresa_id'])}",
            "plano": row.get("nome_plano") or "Não informado",
            "valor_perdido": round(value, 2),
            "ltv": round(float(row.get("ltv") or 0), 2),
            "percentual_acumulado": round(accumulated / total_value * 100, 2),
        })
        if accumulated / total_value >= 0.80:
            break

    return {
        "clientes_ate_80": len(selected),
        "percentual_base": round(len(selected) / len(ordered) * 100, 2) if ordered else 0.0,
        "valor_acumulado": round(accumulated, 2),
        "valor_total": round(total_value, 2),
        "clientes": selected,
    }


def _build_tenure_analysis(rows: list[dict]) -> list[dict]:
    grouped: defaultdict[tuple[str, int], dict] = defaultdict(
        lambda: {"clientes": 0, "valor_perdido": 0.0, "ltv_total": 0.0}
    )
    for row in rows:
        key = _bucket_tenure(float(row.get("meses_cliente") or 0))
        grouped[key]["clientes"] += 1
        grouped[key]["valor_perdido"] += float(row.get("valor_perdido") or 0)
        grouped[key]["ltv_total"] += float(row.get("ltv") or 0)
    total = len(rows)
    return [
        {
            "label": key[0],
            "ordem": key[1],
            "clientes": values["clientes"],
            "percentual_clientes": round(values["clientes"] / total * 100, 2) if total else 0.0,
            "valor_perdido": round(values["valor_perdido"], 2),
            "ltv_total": round(values["ltv_total"], 2),
        }
        for key, values in sorted(grouped.items(), key=lambda item: item[0][1])
    ]


def _build_cohort_by_duration(cohort_rows) -> list[dict]:
    duration_meta = {
        "M": ("Mensal", 1),
        "T": ("Trimestral", 3),
        "S": ("Semestral", 6),
        "A": ("Anual", 12),
    }
    grouped: dict[str, dict[str, dict]] = {
        key: {} for key in duration_meta
    }

    for raw in cohort_rows:
        row = dict(raw._mapping) if hasattr(raw, "_mapping") else dict(raw)
        duration = str(row.get("duracao") or "")
        if duration not in duration_meta:
            continue
        cohort = row.get("coorte")
        if not cohort:
            continue
        cohort_key = cohort.isoformat() if hasattr(cohort, "isoformat") else str(cohort)[:10]
        age = int(row.get("idade") or 0)
        base_clients = int(row.get("base_clientes") or 0)
        retained_raw = row.get("retidos")
        retained = int(retained_raw) if retained_raw is not None else None
        applicable = bool(int(row.get("aplicavel") or 0))
        observable = bool(int(row.get("observavel") or 0))
        percentage = (
            round(retained / base_clients * 100, 1)
            if retained is not None and base_clients
            else None
        )

        cohort_bucket = grouped[duration].setdefault(
            cohort_key,
            {"base_clientes": base_clients, "meses": {}},
        )
        cohort_bucket["base_clientes"] = base_clients
        cohort_bucket["meses"][age] = {
            "mes": age,
            "retidos": retained,
            "percentual": percentage,
            "aplicavel": applicable,
            "observavel": observable,
        }

    result: list[dict] = []
    for duration in ("M", "T", "S", "A"):
        label, interval = duration_meta[duration]
        cohorts = []
        for cohort_key, values in sorted(grouped[duration].items()):
            months = []
            for age in range(25):
                default_applicable = age == 0 or age % interval == 0
                months.append(
                    values["meses"].get(
                        age,
                        {
                            "mes": age,
                            "retidos": None,
                            "percentual": None,
                            "aplicavel": default_applicable,
                            "observavel": False,
                        },
                    )
                )
            cohorts.append({
                "coorte": cohort_key,
                "base_clientes": int(values["base_clientes"]),
                "meses": months,
            })
        result.append({
            "duracao": duration,
            "label": label,
            "intervalo_meses": interval,
            "coortes": cohorts,
        })
    return result


def _build_churn_analytics(rows: list[dict], cohort_rows) -> dict:
    # A aba detalhada passa a ter exclusivamente as coortes por duração.
    return {
        "coorte_por_duracao": _build_cohort_by_duration(cohort_rows),
    }


def _rows_to_payload(db_rows) -> list[dict]:
    rows: list[dict] = []
    for raw in db_rows:
        row = dict(raw._mapping)
        months = float(row.get("tempo_vida") or 0)
        days = int(row.get("dias_cliente") or 0)
        rows.append(
            {
                "empresa_id": int(row["empresa_id"]),
                "cliente": f"Cliente #{int(row['empresa_id'])}",
                "empresa": str(row.get("empresa") or "Não informado"),
                "origem": str(row.get("origem") or "Não informado"),
                "pagador": str(row.get("pagador") or "Não informado"),
                "utm_source": str(row.get("utm_source") or "").strip() or None,
                "utm_medium": str(row.get("utm_medium") or "").strip() or None,
                "utm_campaign": str(row.get("utm_campaign") or "").strip() or None,
                "utm_term": str(row.get("utm_term") or "").strip() or None,
                "utm_content": str(row.get("utm_content") or "").strip() or None,
                "cpf_cnpj": str(row.get("cpf_cnpj") or "").strip() or None,
                "dest_cnpj": str(row.get("dest_cnpj") or "").strip() or None,
                "razao_social": str(row.get("razao_social") or "").strip() or None,
                "nome_usuario": str(row.get("nome_usuario") or "").strip() or None,
                "telefone": str(row.get("telefone") or "").strip() or None,
                "celular": str(row.get("celular") or "").strip() or None,
                "email": str(row.get("email") or "").strip() or None,
                "nome_plano": str(row.get("nome_plano") or "Não informado"),
                "duracao": str(row.get("duracao") or ""),
                "duracao_label": _duration_label(row.get("duracao")),
                "ativou_em": row.get("ativou_em").isoformat() if row.get("ativou_em") else None,
                "data_vencimento": row.get("data_vencimento").isoformat() if row.get("data_vencimento") else None,
                "churn_em": row.get("churn_em").isoformat() if row.get("churn_em") else None,
                "ultimo_pagamento": row.get("ultimo_pagamento").isoformat() if row.get("ultimo_pagamento") else None,
                "recencia_dias": int(row.get("recencia_dias") or 0),
                "dias_vencido": int(row.get("dias_vencido") or 0),
                "dias_cliente": days,
                "meses_cliente": months,
                "qtd_pagamentos": int(row.get("qtd_pagamentos") or 0),
                "renovacoes": int(row.get("renovacoes") or 0),
                "ltv": round(float(row.get("ltv") or 0), 2),
                "ticket_medio": round(float(row.get("ticket_medio") or 0), 2),
                "receita_media_mensal": round(float(row.get("receita_media_mensal") or 0), 2),
                "valor_perdido": round(float(row.get("valor_perdido") or 0), 2),
            }
        )
    return rows


def get_churn_dashboard(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    start, end = _month_bounds(year, month)
    reference_date = end - timedelta(days=1)

    params = {
        "data_inicio": start,
        "data_fim": end,
        "data_referencia": reference_date,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": CHURN_EXCLUDED_COMPANY_IDS,
    }

    with source_engine.connect() as connection:
        db_rows = connection.execute(CHURN_CLIENTS_SQL, params).all()
        cohort_rows = connection.execute(CHURN_COHORT_SQL, params).all()

    rows = _rows_to_payload(db_rows)
    analytics = _build_churn_analytics(rows, cohort_rows)

    clients = len(rows)
    total_ltv = round(sum(row["ltv"] for row in rows), 2)
    total_lost_value = round(sum(row["valor_perdido"] for row in rows), 2)
    avg_ltv = round(total_ltv / clients, 2) if clients else 0.0
    avg_tenure = round(mean([row["meses_cliente"] for row in rows]), 1) if clients else 0.0
    median_tenure = round(median([row["meses_cliente"] for row in rows]), 1) if clients else 0.0
    avg_renewals = round(mean([row["renovacoes"] for row in rows]), 1) if clients else 0.0
    median_renewals = round(median([row["renovacoes"] for row in rows]), 1) if clients else 0.0
    avg_payments = round(mean([row["qtd_pagamentos"] for row in rows]), 1) if clients else 0.0
    avg_ticket = round(mean([row["ticket_medio"] for row in rows]), 2) if clients else 0.0

    plan_map: defaultdict[str, dict] = defaultdict(
        lambda: {
            "clientes": 0,
            "ltv_total": 0.0,
            "valor_perdido": 0.0,
            "meses_cliente_total": 0.0,
            "renovacoes_total": 0,
        }
    )
    tenure_map: defaultdict[tuple[str, int], dict] = defaultdict(lambda: {"clientes": 0, "ltv_total": 0.0})
    renewal_map: defaultdict[tuple[str, int], dict] = defaultdict(lambda: {"clientes": 0, "ltv_total": 0.0})
    ltv_map: defaultdict[tuple[str, int], dict] = defaultdict(lambda: {"clientes": 0, "ltv_total": 0.0})

    for row in rows:
        plan = plan_map[row["nome_plano"]]
        plan["clientes"] += 1
        plan["ltv_total"] += row["ltv"]
        plan["valor_perdido"] += row["valor_perdido"]
        plan["meses_cliente_total"] += row["meses_cliente"]
        plan["renovacoes_total"] += row["renovacoes"]

        tenure_key = _bucket_tenure(row["meses_cliente"])
        tenure_map[tenure_key]["clientes"] += 1
        tenure_map[tenure_key]["ltv_total"] += row["ltv"]

        renewal_key = _bucket_renewals(row["renovacoes"])
        renewal_map[renewal_key]["clientes"] += 1
        renewal_map[renewal_key]["ltv_total"] += row["ltv"]

        ltv_key = _bucket_ltv(row["ltv"])
        ltv_map[ltv_key]["clientes"] += 1
        ltv_map[ltv_key]["ltv_total"] += row["ltv"]

    by_plan = []
    for plan_name, values in plan_map.items():
        quantity = values["clientes"]
        by_plan.append(
            {
                "nome_plano": plan_name,
                "clientes": quantity,
                "percentual_clientes": round(quantity / clients * 100, 2) if clients else 0.0,
                "ltv_total": round(values["ltv_total"], 2),
                "valor_perdido": round(values["valor_perdido"], 2),
                "ltv_medio": round(values["ltv_total"] / quantity, 2) if quantity else 0.0,
                "tempo_medio_meses": round(values["meses_cliente_total"] / quantity, 1) if quantity else 0.0,
                "renovacoes_media": round(values["renovacoes_total"] / quantity, 1) if quantity else 0.0,
            }
        )
    by_plan.sort(key=lambda item: item["clientes"], reverse=True)

    duration_map: defaultdict[str, dict] = defaultdict(
        lambda: {"clientes": 0, "renovacoes_total": 0}
    )
    for row in rows:
        duration_map[row["duracao"]]["clientes"] += 1
        duration_map[row["duracao"]]["renovacoes_total"] += row["renovacoes"]

    duration_order = {"M": 1, "T": 2, "S": 3, "A": 4}
    renewals_by_duration = [
        {
            "value": duration,
            "label": _duration_label(duration),
            "clientes": values["clientes"],
            "renovacoes_media": round(values["renovacoes_total"] / values["clientes"], 1) if values["clientes"] else 0.0,
        }
        for duration, values in sorted(duration_map.items(), key=lambda item: duration_order.get(item[0], 99))
    ]

    def serialize_buckets(bucket_map):
        return [
            {
                "label": key[0],
                "ordem": key[1],
                "clientes": values["clientes"],
                "ltv_total": round(values["ltv_total"], 2),
                "percentual_clientes": round(values["clientes"] / clients * 100, 2) if clients else 0.0,
            }
            for key, values in sorted(bucket_map.items(), key=lambda item: item[0][1])
        ]

    today = date.today()
    return {
        "periodo": {
            "ano": year,
            "mes": month,
            "data_inicio": start.isoformat(),
            "data_fim": end.isoformat(),
            "data_referencia": reference_date.isoformat(),
            "parcial": year == today.year and (month == 0 or month == today.month),
            "ano_completo": month == 0,
        },
        "filtros": {"empresa": empresa, "origem": origem, "pagador": pagador},
        "regra_churn": (
            "Somente clientes cujo plano atual está vencido há 60 dias ou mais. "
            "Para organizar o churn por mês, usamos como data de churn a data de vencimento + 60 dias."
        ),
        "resumo": {
            "clientes_perdidos": clients,
            "valor_perdido": total_lost_value,
            "tempo_medio_meses": avg_tenure,
            "tempo_mediano_meses": median_tenure,
            "renovacoes_media": avg_renewals,
            "renovacoes_mediana": median_renewals,
            "pagamentos_media": avg_payments,
            "ltv_medio": avg_ltv,
            "ltv_total": total_ltv,
            "ticket_medio_pagamentos": avg_ticket,
        },
        "por_plano": by_plan,
        "renovacoes_medias": {
            "por_plano": [
                {
                    "value": item["nome_plano"],
                    "label": item["nome_plano"],
                    "clientes": item["clientes"],
                    "renovacoes_media": item["renovacoes_media"],
                }
                for item in by_plan
            ],
            "por_duracao": renewals_by_duration,
        },
        "tempo_faixas": serialize_buckets(tenure_map),
        "renovacoes_faixas": serialize_buckets(renewal_map),
        "ltv_faixas": serialize_buckets(ltv_map),
        "dimensoes": {
            "por_empresa": _aggregate_dimension(rows, "empresa"),
            "por_origem": _aggregate_dimension(rows, "origem"),
            "por_pagador": _aggregate_dimension(rows, "pagador"),
        },
        "utms": [
            _aggregate_utm_dimension(rows, field, label, priority)
            for field, label, priority in UTM_DIMENSIONS
        ],
        "analises": analytics,
        "clientes": rows,
    }


def _previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _twelve_month_start(end: date) -> date:
    anchor = end - timedelta(days=1)
    year = anchor.year
    month = anchor.month
    for _ in range(11):
        year, month = _previous_month(year, month)
    return date(year, month, 1)


def _month_sequence(start: date, end: date) -> list[tuple[int, int]]:
    values: list[tuple[int, int]] = []
    year, month = start.year, start.month
    while date(year, month, 1) < end:
        values.append((year, month))
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1
    return values


def get_churn_renewal_history(
    year: int,
    month: int,
    dimension: str,
    value: str,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    if dimension not in {"plano", "duracao"}:
        raise ValueError("Dimensão inválida. Use plano ou duracao.")
    if not value.strip():
        raise ValueError("Valor da dimensão não informado.")

    _, selected_end = _month_bounds(year, month)
    history_start = _twelve_month_start(selected_end)
    reference_date = selected_end - timedelta(days=1)

    params = {
        "data_inicio": history_start,
        "data_fim": selected_end,
        "data_referencia": reference_date,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": CHURN_EXCLUDED_COMPANY_IDS,
    }

    with source_engine.connect() as connection:
        db_rows = connection.execute(CHURN_CLIENTS_SQL, params).all()

    rows = _rows_to_payload(db_rows)
    if dimension == "plano":
        rows = [row for row in rows if row["nome_plano"] == value]
        label = value
    else:
        rows = [row for row in rows if row["duracao"] == value]
        label = _duration_label(value)

    grouped: defaultdict[tuple[int, int], dict] = defaultdict(
        lambda: {"clientes": 0, "renovacoes_total": 0}
    )
    for row in rows:
        churn_value = row.get("churn_em")
        if not churn_value:
            continue
        churn_date = date.fromisoformat(churn_value)
        key = (churn_date.year, churn_date.month)
        grouped[key]["clientes"] += 1
        grouped[key]["renovacoes_total"] += int(row.get("renovacoes") or 0)

    pontos = []
    for point_year, point_month in _month_sequence(history_start, selected_end):
        values = grouped[(point_year, point_month)]
        clients = values["clientes"]
        average = round(values["renovacoes_total"] / clients, 2) if clients else 0.0
        pontos.append(
            {
                "ano": point_year,
                "mes": point_month,
                "label": f"{point_month:02d}/{point_year}",
                "clientes": clients,
                "renovacoes_media": average,
            }
        )

    return {
        "dimensao": dimension,
        "valor": value,
        "label": label,
        "data_inicio": history_start.isoformat(),
        "data_fim": selected_end.isoformat(),
        "pontos": pontos,
    }
