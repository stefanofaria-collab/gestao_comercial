from sqlalchemy import bindparam, text


DIM_EMPRESA = """
CASE
    WHEN e.modalidade = 'ERP' THEN 'GestãoClick'
    WHEN e.modalidade IN ('NFE', 'FIS') THEN 'ClickNotas'
END
"""

DIM_ORIGEM = """
CASE
    WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick'
    ELSE 'Parceiro'
END
"""


CLIENTES_ATIVOS_SOURCE_SQL = text(
    f"""
    WITH clientes_ativos AS (
        SELECT
            ep.empresa_id,
            {DIM_EMPRESA} AS empresa,
            {DIM_ORIGEM} AS origem,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            ep.duracao,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND e.ativou_em < :data_inicio
            AND ep.pago_em < :data_inicio
            AND ep.data_vencimento >= :data_inicio
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND e.modalidade IN ('ERP', 'NFE', 'FIS')
            AND e.empresa_indicacao_id IS NOT NULL
            AND e.id NOT IN :excluidos
    )
    SELECT
        empresa,
        origem,
        nome_plano,
        duracao,
        COUNT(*) AS clientes_ativos
    FROM clientes_ativos
    WHERE ordem = 1
    GROUP BY empresa, origem, nome_plano, duracao
    """
).bindparams(bindparam("excluidos", expanding=True))


VENCIMENTOS_SOURCE_SQL = text(
    f"""
    WITH clientes_ativos AS (
        SELECT
            ep.empresa_id,
            {DIM_EMPRESA} AS empresa,
            {DIM_ORIGEM} AS origem,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            ep.duracao,
            ep.data_vencimento,
            CASE
                WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
                ELSE ep.valor
            END AS valor,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND e.ativou_em < :data_inicio
            AND ep.pago_em < :data_inicio
            AND ep.data_vencimento >= :data_inicio
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND e.modalidade IN ('ERP', 'NFE', 'FIS')
            AND e.empresa_indicacao_id IS NOT NULL
            AND ep.empresa_id NOT IN :excluidos
    )
    SELECT
        empresa,
        origem,
        nome_plano,
        duracao,
        COUNT(*) AS renovacoes_previstas,
        ROUND(SUM(valor), 2) AS receita_vencendo
    FROM clientes_ativos
    WHERE
        ordem = 1
        AND data_vencimento < :data_fim
    GROUP BY empresa, origem, nome_plano, duracao
    """
).bindparams(bindparam("excluidos", expanding=True))


RENOVACOES_SOURCE_SQL = text(
    f"""
    WITH clientes_ativos AS (
        SELECT
            ep.empresa_id,
            {DIM_EMPRESA} AS empresa,
            {DIM_ORIGEM} AS origem,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            ep.duracao,
            ep.data_vencimento,
            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND e.ativou_em < :data_inicio
            AND ep.pago_em < :data_inicio
            AND ep.data_vencimento >= :data_inicio
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND e.modalidade IN ('ERP', 'NFE', 'FIS')
            AND e.empresa_indicacao_id IS NOT NULL
            AND e.id NOT IN :excluidos
    ),
    vencimentos AS (
        SELECT
            empresa_id,
            empresa,
            origem,
            nome_plano,
            duracao
        FROM clientes_ativos
        WHERE
            ordem = 1
            AND data_vencimento < :data_fim
    ),
    renovacoes AS (
        SELECT
            v.empresa_id,
            v.empresa,
            v.origem,
            v.nome_plano,
            v.duracao,
            ep.valor,
            ROW_NUMBER() OVER (
                PARTITION BY v.empresa_id
                ORDER BY ep.pago_em
            ) AS ordem
        FROM vencimentos v
        JOIN empresas_planos ep ON v.empresa_id = ep.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.valor > 5
            AND ep.pago_em >= :data_inicio
            AND ep.pago_em < :data_fim
            AND ep.status_pagamento = 1
            AND ep.nome_plano NOT LIKE '%recursos%'
    )
    SELECT
        empresa,
        origem,
        nome_plano,
        duracao,
        COUNT(*) AS renovacoes_clientes,
        ROUND(SUM(valor), 2) AS renovacoes_receita
    FROM renovacoes
    WHERE ordem = 1
    GROUP BY empresa, origem, nome_plano, duracao
    """
).bindparams(bindparam("excluidos", expanding=True))


CHURN_SOURCE_SQL = text(
    f"""
    WITH churn AS (
        SELECT
            ep.empresa_id,
            {DIM_EMPRESA} AS empresa,
            {DIM_ORIGEM} AS origem,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            ep.duracao,
            CASE
                WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
                ELSE ep.valor
            END AS valor
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.data_vencimento >= :data_inicio
            AND ep.data_vencimento < :data_fim
            AND e.modalidade IN ('ERP', 'NFE', 'FIS')
            AND e.empresa_indicacao_id IS NOT NULL
            AND e.id NOT IN :excluidos
    )
    SELECT
        empresa,
        origem,
        nome_plano,
        duracao,
        COUNT(*) AS churn_clientes,
        ROUND(SUM(valor), 2) AS churn_receita
    FROM churn
    GROUP BY empresa, origem, nome_plano, duracao
    """
).bindparams(bindparam("excluidos", expanding=True))
