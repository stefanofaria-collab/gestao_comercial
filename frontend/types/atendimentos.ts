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

export type AtendimentoClienteMotivo = {
  motivo: string;
  atendimentos: number;
  duracao_total_segundos: number;
};

export type AtendimentoClienteRanking = {
  empresa_id: number;
  cliente: string;
  intranet_url: string;
  atendimentos: number;
  positivas: number;
  negativas: number;
  avaliacoes: number;
  duracao_total_segundos: number;
  duracao_media_segundos: number | null;
  motivos: AtendimentoClienteMotivo[];
};

export type AtendimentoTempoSexo = {
  sexo: string;
  atendimentos: number;
  atendimentos_com_duracao: number;
  duracao_media_segundos: number | null;
};

export type AtendimentoTempoFaixaEtaria = {
  faixa_etaria: string;
  atendimentos: number;
  atendimentos_com_duracao: number;
  duracao_media_segundos: number | null;
};

export type AtendimentoTempoAtendente = {
  email_atendente: string;
  atendente: string;
  atendimentos: number;
  atendimentos_com_duracao: number;
  duracao_media_segundos: number | null;
  duracao_total_segundos: number;
};

export type AtendimentoChurnResumo = {
  clientes_churn_periodo: number;
  clientes_churnados_com_atendimento: number;
  atendimentos: number;
  atendimentos_medios_por_cliente: number | null;
  duracao_media_segundos: number | null;
  motivos_medios_por_cliente: number | null;
  atendentes_medios_por_cliente: number | null;
  corr_atendimentos_duracao_total: number | null;
  corr_atendimentos_duracao_media: number | null;
  corr_atendimentos_duracao_media_atendente: number | null;
  associacao_churn_motivo: number | null;
};

export type AtendimentoChurnMotivo = {
  motivo: string;
  atendimentos: number;
  clientes: number;
  duracao_media_segundos: number | null;
};

export type AtendimentoChurnAtendente = {
  email_atendente: string;
  atendente: string;
  atendimentos: number;
  clientes: number;
  duracao_media_segundos: number | null;
};

export type AtendimentoChurnCliente = {
  empresa_id: number;
  cliente: string;
  intranet_url: string;
  atendimentos: number;
  motivos_distintos: number;
  atendentes_distintos: number;
  duracao_media_segundos: number | null;
  duracao_total_segundos: number;
};

export type AtendimentoChurnExportRow = {
  data_atendimento: string;
  plano: string;
  duracao: string;
  valor: number;
  motivo: string;
  email_cliente: string;
  email_atendente: string;
  avaliacao: string;
  duracao_humano_segundos: number | null;
};

export type AtendimentoChurnExportResponse = {
  total: number;
  periodo?: { inicio: string; fim: string };
  rows: AtendimentoChurnExportRow[];
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
  clientes_rankings: {
    mais_atendimentos: AtendimentoClienteRanking[];
    maior_tempo_total: AtendimentoClienteRanking[];
    mais_avaliaram: AtendimentoClienteRanking[];
    mais_positivas: AtendimentoClienteRanking[];
    mais_negativas: AtendimentoClienteRanking[];
  };
  tempo_atendimento: {
    por_sexo: AtendimentoTempoSexo[];
    por_faixa_etaria: AtendimentoTempoFaixaEtaria[];
    por_atendente: AtendimentoTempoAtendente[];
  };
  churn_atendimentos: {
    periodo_atendimentos: {
      inicio: string;
      fim: string;
    };
    resumo: AtendimentoChurnResumo;
    motivos: AtendimentoChurnMotivo[];
    atendentes: AtendimentoChurnAtendente[];
    clientes: AtendimentoChurnCliente[];
  };
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
