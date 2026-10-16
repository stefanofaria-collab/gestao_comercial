CREATE TABLE IF NOT EXISTS public.alertas_planos_vencidos (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    dias INTEGER NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT alertas_planos_vencidos_email_dias_uk UNIQUE (email, dias)
);

CREATE INDEX IF NOT EXISTS idx_alertas_planos_vencidos_email
    ON public.alertas_planos_vencidos (email);

CREATE INDEX IF NOT EXISTS idx_alertas_planos_vencidos_dias
    ON public.alertas_planos_vencidos (dias);
