from sqlalchemy import bindparam, text


# ============================================================
# FILTROS DE EMPRESA E ORIGEM
# ============================================================
#
# EMPRESA
#
# gestaoclick:
#     e.modalidade = 'ERP'
#
# clicknotas:
#     e.modalidade IN ('NFE', 'FIS')
#
# todos:
#     ERP + NFE + FIS
#
#
# ORIGEM
#
# gestaoclick:
#     e.empresa_indicacao_id = 1
#
# parceiro:
#     e.empresa_indicacao_id <> 1
#
# todos:
#     soma das duas origens
#
# ============================================================

FILTRO_EMPRESA_ORIGEM = """
    AND (
        (
            :origem = 'gestaoclick'
            AND e.empresa_indicacao_id = 1
        )

        OR

        (
            :origem = 'parceiro'
            AND e.empresa_indicacao_id <> 1
        )

        OR

        (
            :origem = 'todos'
            AND e.empresa_indicacao_id IS NOT NULL
        )
    )

    AND (
        (
            :empresa = 'gestaoclick'
            AND e.modalidade = 'ERP'
        )

        OR

        (
            :empresa = 'clicknotas'
            AND e.modalidade IN (
                'NFE',
                'FIS'
            )
        )

        OR

        (
            :empresa = 'todos'
            AND e.modalidade IN (
                'ERP',
                'NFE',
                'FIS'
            )
        )
    )
"""


# ============================================================
# CLIENTES ATIVOS
# ============================================================

CLIENTES_ATIVOS_SQL = text(
    f"""
    WITH clientes_ativos AS (
        SELECT
            ep.empresa_id,

            REPLACE(
                REPLACE(
                    ep.nome_plano,
                    ' (+) recursos',
                    ''
                ),
                ' + recursos',
                ''
            ) AS nome_plano,

            ep.duracao,

            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em DESC
            ) AS ordem

        FROM
            empresas_planos ep

            JOIN empresas e
                ON ep.empresa_id = e.id

        WHERE
            ep.plano_id <> 1

            AND e.ativou_em < :data_inicio

            AND ep.pago_em < :data_inicio

            AND ep.data_vencimento >= :data_inicio

            AND ep.nota_fiscal_servico_id IS NOT NULL

            {FILTRO_EMPRESA_ORIGEM}

            AND e.id NOT IN :excluidos
    )

    SELECT
        nome_plano,
        duracao,
        COUNT(*) AS clientes_ativos

    FROM
        clientes_ativos

    WHERE
        ordem = 1

    GROUP BY
        nome_plano,
        duracao
    """
).bindparams(
    bindparam(
        "excluidos",
        expanding=True,
    )
)


# ============================================================
# VENCIMENTOS
# ============================================================

VENCIMENTOS_SQL = text(
    f"""
    WITH clientes_ativos AS (
        SELECT
            ep.empresa_id,

            REPLACE(
                REPLACE(
                    ep.nome_plano,
                    ' (+) recursos',
                    ''
                ),
                ' + recursos',
                ''
            ) AS nome_plano,

            ep.duracao,

            ep.data_vencimento,

            CASE
                WHEN ep.plano_agregado > ep.valor
                    THEN ep.plano_agregado

                ELSE ep.valor
            END AS valor,

            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em DESC
            ) AS ordem

        FROM
            empresas_planos ep

            JOIN empresas e
                ON ep.empresa_id = e.id

        WHERE
            ep.plano_id <> 1

            AND e.ativou_em < :data_inicio

            AND ep.pago_em < :data_inicio

            AND ep.data_vencimento >= :data_inicio

            AND ep.nota_fiscal_servico_id IS NOT NULL

            {FILTRO_EMPRESA_ORIGEM}

            AND ep.empresa_id NOT IN :excluidos
    )

    SELECT
        nome_plano,

        duracao,

        COUNT(*) AS vencimentos,

        ROUND(
            SUM(valor),
            2
        ) AS receita_vencendo

    FROM
        clientes_ativos

    WHERE
        ordem = 1

        AND data_vencimento < :data_fim

    GROUP BY
        nome_plano,
        duracao
    """
).bindparams(
    bindparam(
        "excluidos",
        expanding=True,
    )
)


# ============================================================
# RENOVAÇÕES
# ============================================================

RENOVACOES_SQL = text(
    f"""
    WITH clientes_ativos AS (
        SELECT
            ep.empresa_id,

            REPLACE(
                REPLACE(
                    ep.nome_plano,
                    ' (+) recursos',
                    ''
                ),
                ' + recursos',
                ''
            ) AS nome_plano,

            ep.duracao,

            ep.data_vencimento,

            ROW_NUMBER() OVER (
                PARTITION BY ep.empresa_id
                ORDER BY ep.pago_em DESC
            ) AS ordem

        FROM
            empresas_planos ep

            JOIN empresas e
                ON ep.empresa_id = e.id

        WHERE
            ep.plano_id <> 1

            AND e.ativou_em < :data_inicio

            AND ep.pago_em < :data_inicio

            AND ep.data_vencimento >= :data_inicio

            AND ep.nota_fiscal_servico_id IS NOT NULL

            {FILTRO_EMPRESA_ORIGEM}

            AND e.id NOT IN :excluidos
    ),

    vencimentos AS (
        SELECT
            ca.empresa_id,

            ca.nome_plano,

            ca.duracao

        FROM
            clientes_ativos ca

        WHERE
            ca.ordem = 1

            AND ca.data_vencimento < :data_fim
    ),

    renovacoes AS (
        SELECT
            v.empresa_id,

            v.nome_plano,

            v.duracao,

            ep.valor,

            ROW_NUMBER() OVER (
                PARTITION BY v.empresa_id
                ORDER BY ep.pago_em
            ) AS ordem

        FROM
            vencimentos v

            JOIN empresas_planos ep
                ON v.empresa_id = ep.empresa_id

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
        nome_plano,

        duracao,

        COUNT(*) AS renovacoes,

        ROUND(
            SUM(valor),
            2
        ) AS receita_renovada

    FROM
        renovacoes

    WHERE
        ordem = 1

    GROUP BY
        nome_plano,
        duracao
    """
).bindparams(
    bindparam(
        "excluidos",
        expanding=True,
    )
)


# ============================================================
# CHURN
# ============================================================

CHURN_SQL = text(
    f"""
    WITH churn AS (
        SELECT
            ep.empresa_id,

            REPLACE(
                REPLACE(
                    ep.nome_plano,
                    ' (+) recursos',
                    ''
                ),
                ' + recursos',
                ''
            ) AS nome_plano,

            ep.duracao,

            ep.data_vencimento,

            CASE
                WHEN ep.plano_agregado > ep.valor
                    THEN ep.plano_agregado

                ELSE ep.valor
            END AS valor

        FROM
            empresas_planos ep

            JOIN empresas e
                ON ep.empresa_id = e.id

        WHERE
            ep.plano_id <> 1

            AND ep.atual = 1

            AND ep.nota_fiscal_servico_id IS NOT NULL

            AND ep.data_vencimento >= :data_inicio

            AND ep.data_vencimento < :data_fim

            {FILTRO_EMPRESA_ORIGEM}

            AND e.id NOT IN :excluidos
    )

    SELECT
        nome_plano,

        duracao,

        COUNT(*) AS churn_clientes,

        ROUND(
            SUM(valor),
            2
        ) AS churn_receita

    FROM
        churn

    GROUP BY
        nome_plano,
        duracao
    """
).bindparams(
    bindparam(
        "excluidos",
        expanding=True,
    )
)