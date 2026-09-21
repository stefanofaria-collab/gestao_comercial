CREATE TABLE IF NOT EXISTS public.indicadores_mensais (
    ano SMALLINT NOT NULL,
    mes SMALLINT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    empresa TEXT NOT NULL,
    origem TEXT NOT NULL,
    nome_plano TEXT NOT NULL,
    duracao VARCHAR(1) NOT NULL,
    clientes_ativos BIGINT NOT NULL DEFAULT 0,
    renovacoes_previstas BIGINT NOT NULL DEFAULT 0,
    receita_vencendo NUMERIC(18, 2) NOT NULL DEFAULT 0,
    renovacoes_clientes BIGINT NOT NULL DEFAULT 0,
    renovacoes_receita NUMERIC(18, 2) NOT NULL DEFAULT 0,
    churn_clientes BIGINT NOT NULL DEFAULT 0,
    churn_receita NUMERIC(18, 2) NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_indicadores_mensais
        PRIMARY KEY (
            ano,
            mes,
            empresa,
            origem,
            nome_plano,
            duracao
        ),

    CONSTRAINT ck_indicadores_mensais_ano
        CHECK (ano BETWEEN 2024 AND 2026),

    CONSTRAINT ck_indicadores_mensais_mes
        CHECK (mes BETWEEN 1 AND 12),

    CONSTRAINT ck_indicadores_mensais_empresa
        CHECK (empresa IN ('GestãoClick', 'ClickNotas')),

    CONSTRAINT ck_indicadores_mensais_origem
        CHECK (origem IN ('GestãoClick', 'Parceiro')),

    CONSTRAINT ck_indicadores_mensais_duracao
        CHECK (duracao IN ('M', 'T', 'S', 'A'))
);

CREATE INDEX IF NOT EXISTS idx_indicadores_mensais_periodo
ON public.indicadores_mensais (ano, mes);

CREATE INDEX IF NOT EXISTS idx_indicadores_mensais_empresa
ON public.indicadores_mensais (empresa, ano, mes);

CREATE INDEX IF NOT EXISTS idx_indicadores_mensais_origem
ON public.indicadores_mensais (origem, ano, mes);

CREATE INDEX IF NOT EXISTS idx_indicadores_mensais_plano
ON public.indicadores_mensais (nome_plano, duracao, ano, mes);

COMMENT ON TABLE public.indicadores_mensais IS
'Indicadores mensais pré-calculados do dashboard Gestão de Clientes.';
