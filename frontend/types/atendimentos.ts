export type AtendimentosCards = {
  atendimentos: number;
  clientes_unicos: number;
  percentual_base: number | null;
  clientes_ativos: number | null;
  positivas: number;
  negativas: number;
};

export type AtendimentoHistorico = {
  mes: string;
  atendimentos: number;
  clientes_unicos: number;
  usuarios_unicos: number;
  positivas: number;
  negativas: number;
  clientes_ativos: number | null;
  percentual_base: number | null;
};

export type AtendimentoPlanoHistorico = {
  mes: string;
  plano: string;
  clientes_unicos: number;
};

export type AtendimentoCicloVidaHistorico = {
  mes: string;
  ate_30_dias_contratacao: number;
  ate_30_dias_antes_churn: number;
};

export type AtendimentoSexo = {
  sexo: string;
  usuarios: number;
  idade_media: number | null;
};

export type AtendimentoMotivoDemografia = {
  motivo: string;
  sexo: string;
  atendimentos: number;
  usuarios_unicos: number;
  idade_media: number | null;
};

export type AtendimentoMotivoTotal = {
  motivo: string;
  atendimentos: number;
};

export type AtendimentoMotivoHistorico = {
  mes: string;
  motivo: string;
  sexo: string;
  atendimentos: number;
  usuarios_unicos: number;
  idade_media: number | null;
};

export type AtendimentoSyncStatus = {
  executando: boolean;
  ultima_data: string | null;
  data_alvo: string;
  atualizado: boolean;
  contexto_pendente?: boolean;
  ultimo_inicio: string | null;
  ultimo_fim: string | null;
  ultimo_erro: string | null;
};

export type AtendimentoCacheInfo = {
  fallback: boolean;
  source_date: string | null;
  updated_at: string | null;
  refreshing: boolean;
  requested_params?: Record<string, unknown>;
  source_params?: Record<string, unknown>;
};

export type AtendimentosDashboardResponse = {
  periodo: {
    ano: number;
    mes: number;
    inicio: string;
    fim: string;
  };
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
  };
  cards: AtendimentosCards;
  historico: AtendimentoHistorico[];
  planos_historico: AtendimentoPlanoHistorico[];
  ciclo_vida_historico: AtendimentoCicloVidaHistorico[];
  demografia: {
    sexo: AtendimentoSexo[];
    idade_media: number | null;
    motivos: AtendimentoMotivoDemografia[];
  };
  motivos_geral: AtendimentoMotivoTotal[];
  motivos_historico: AtendimentoMotivoHistorico[];
  dados: {
    primeira_data: string | null;
    ultima_data: string | null;
    total_registros: number;
  };
  sincronizacao: AtendimentoSyncStatus;
  _cache_info?: AtendimentoCacheInfo;
};

export type AtendimentosMetaResponse = {
  ano_inicio: number;
  anos: number[];
  ano_padrao: number;
  mes_padrao: number;
  ultima_data: string;
  sincronizacao: AtendimentoSyncStatus;
};
