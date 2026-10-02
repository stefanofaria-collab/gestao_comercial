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

export type ChurnScoreModelMeta = {
  status: "treinado" | "nao_treinado";
  version: string;
  message?: string;
  trained_at?: string;
  model_name?: string;
  threshold?: number;
  validation_results?: Record<string, ChurnScoreMetricSet>;
  test_metrics?: ChurnScoreMetricSet;
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

export type ChurnScoreClient = {
  empresa_id: number;
  cliente: string;
  intranet_url: string;
  modalidade: string;
  origem: string;
  pagador: string;
  nome_plano: string;
  duracao: string;
  data_vencimento: string | null;
  dias_ate_vencimento: number;
  valor: number;
  tempo_vida_meses: number;
  pagamentos_anteriores: number;
  atraso_ultima_renovacao: number | null;
  ultimo_acesso: string | null;
  ultimo_acesso_vencimento: number | null;
  dias_sem_acesso: number | null;
  probabilidade_ml: number;
  ajuste_acesso: number;
  score: number;
  faixa_risco: "Muito alto" | "Alto" | "Moderado" | "Baixo";
  sinais: string[];
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
  clientes: ChurnScoreClient[];
  clientes_retornados: number;
  regra_score: string;
};
