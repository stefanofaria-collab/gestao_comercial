CREATE INDEX IF NOT EXISTS idx_atendimentos_zendesk_data
  ON public.atendimentos_zendesk (data);

CREATE INDEX IF NOT EXISTS idx_atendimentos_zendesk_empresa_data
  ON public.atendimentos_zendesk (empresa_id, data);

CREATE INDEX IF NOT EXISTS idx_atendimentos_zendesk_email_data
  ON public.atendimentos_zendesk (LOWER(email_cliente), data);

CREATE INDEX IF NOT EXISTS idx_atendimentos_zendesk_motivo
  ON public.atendimentos_zendesk (motivo);

CREATE INDEX IF NOT EXISTS idx_atendimentos_zendesk_avaliacao
  ON public.atendimentos_zendesk (avaliacao);

CREATE INDEX IF NOT EXISTS idx_atendimentos_zendesk_sexo
  ON public.atendimentos_zendesk (sexo);

CREATE TABLE IF NOT EXISTS public.atendimentos_zendesk_contexto (
  atendimento_id BIGINT PRIMARY KEY REFERENCES public.atendimentos_zendesk(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  empresa_id BIGINT,
  empresa TEXT,
  origem TEXT,
  pagador TEXT,
  plano TEXT,
  duracao TEXT,
  ativou_em DATE,
  data_vencimento DATE,
  dias_desde_ativacao INTEGER,
  contato_ate_30_dias_contratacao BOOLEAN NOT NULL DEFAULT FALSE,
  contato_ate_30_dias_antes_churn BOOLEAN NOT NULL DEFAULT FALSE,
  ciclo_churnou BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_contexto_data
  ON public.atendimentos_zendesk_contexto (data);

CREATE INDEX IF NOT EXISTS idx_atendimentos_contexto_empresa_data
  ON public.atendimentos_zendesk_contexto (empresa_id, data);

CREATE INDEX IF NOT EXISTS idx_atendimentos_contexto_plano_data
  ON public.atendimentos_zendesk_contexto (plano, data);

CREATE INDEX IF NOT EXISTS idx_atendimentos_contexto_dimensoes
  ON public.atendimentos_zendesk_contexto (empresa, origem, pagador);

ALTER TABLE public.atendimentos_zendesk_contexto ENABLE ROW LEVEL SECURITY;
