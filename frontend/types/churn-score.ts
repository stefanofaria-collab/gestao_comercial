export type ChurnScoreMetricSet = {
  roc_auc: number | null;
  pr_auc: number;
  brier: number;
  log_loss: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  lift_10: number;
  captura_churn_10: number;
  threshold: number;
};

export type ChurnScoreDistributionBand = {
  faixa: string;
  min: number;
  max: number;
  clientes: number;
  churns: number;
  renovacoes: number;
  taxa_churn: number | null;
  lift_vs_base: number | null;
  captura_churn: number;
  score_medio: number | null;
};

export type ChurnScoreDistribution = {
  taxa_churn_teste: number;
  clientes_teste: number;
  churns_teste: number;
  ordenacao_monotonica: boolean;
  faixas: ChurnScoreDistributionBand[];
  observacao: string;
};

export type ChurnScoreModelMeta = {
  status: "treinado" | "nao_treinado";
  version: string;
  message?: string;
  trained_at?: string;
  model_name?: string;
  threshold?: number;
  validation_results?: Record<string, ChurnScoreMetricSet>;
  test_metrics?: ChurnScoreMetricSet;
  score_distribution?: ChurnScoreDistribution;
  feature_importance?: Array<{ feature: string; importance: number }>;
  periods?: Record<
    string,
    { inicio: string; fim: string; linhas: number; churns: number; taxa_churn: number }
  >;
  dataset?: {
    linhas: number;
    churns: number;
    renovacoes: number;
    taxa_churn: number;
  };
  notes?: string[];
};

export type ChurnRiskFilter = "todos" | "alto_ou_maior" | "muito_alto" | "alto" | "moderado" | "baixo";

export type ChurnScoreClient = {
  empresa_id: number;
  cliente: string;
  intranet_url: string;
  modalidade: string;
  origem: string;
  pagador: string;
  nome_usuario: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  nome_plano: string;
  duracao: string;
  data_vencimento: string | null;
  dias_ate_vencimento: number;
  valor: number;
  tempo_vida_meses: number;
  pagamentos_anteriores: number;
  atraso_ultima_renovacao: number | null;
  media_dias_pagamento: number | null;
  ultrapassou_media_atraso: boolean;
  ultimo_acesso: string | null;
  ultimo_acesso_vencimento: number | null;
  dias_sem_acesso: number | null;
  probabilidade_ml: number;
  ajuste_acesso: number;
  score: number;
  faixa_risco: "Muito alto" | "Alto" | "Moderado" | "Baixo";
  sinais: string[];
};

export type ChurnScoreRiskGroup = {
  label: string;
  clientes: number;
  clientes_alto_risco: number;
  valor_total: number;
  valor_risco: number;
  score_medio: number;
};

export type ChurnScoreCacheInfo = {
  updated_at: string | null;
  source_date: string | null;
  refreshing: boolean;
  preparing: boolean;
  max_age_minutes: number;
};

export type ChurnScoreClientsResponse = {
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
  rows: ChurnScoreClient[];
  planos: string[];
  duracoes: Array<{ value: string; label: string }>;
  data_minima: string | null;
  data_maxima: string | null;
  ultima_atualizacao: string | null;
};

export type ChurnScoreContactFilters = {
  empresa: "todos" | "gestaoclick" | "clicknotas";
  origem: "todos" | "gestaoclick" | "parceiro";
  pagador: "todos" | "cliente" | "parceiro";
  risco: ChurnRiskFilter;
  plano: string;
  duracao: string;
  data_inicio: string;
  data_fim: string;
  valor_minimo: number;
  tempo_cliente_minimo: number | null;
  tempo_cliente_maximo: number | null;
  tempo_cliente_unidade: "mes" | "ano";
  somente_ultrapassou_media: boolean;
};

export type ChurnScoreContactListResponse = {
  risco: ChurnRiskFilter;
  total: number;
  rows: ChurnScoreClient[];
  planos: string[];
  duracoes: Array<{ value: string; label: string }>;
  data_minima: string | null;
  data_maxima: string | null;
  ultima_atualizacao: string | null;
};

export type ChurnScoreDashboardResponse = {
  model: ChurnScoreModelMeta;
  filtros: { empresa: string; origem: string; pagador: string };
  resumo: {
    clientes: number;
    score_medio: number;
    alto_risco: number;
    muito_alto_risco: number;
    valor_total: number;
    valor_ponderado_risco: number;
  };
  faixas: Array<{ label: string; min: number; max: number; clientes: number; valor: number }>;
  risco_por_plano: ChurnScoreRiskGroup[];
  risco_por_duracao: ChurnScoreRiskGroup[];
  clientes: ChurnScoreClient[];
  clientes_retornados: number;
  regra_score: string;
  _cache_info?: ChurnScoreCacheInfo;
};
