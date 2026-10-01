export type ActiveOverdueHistoryPoint = {
  ano: number;
  mes: number;
  label: string;
  clientes_ativos: number;
  saldo_clientes: number | null;
  ativos_mais_30?: number;
  ativos_mais_media?: number;
  atrasados_1_30?: number;
  dentro_media?: number;
};

export type ActiveOverdueClient = {
  empresa_id: number;
  cliente: string;
  intranet_url: string;
  empresa: string;
  origem: string;
  pagador: string;
  modalidade: string;
  empresa_indicacao_id: number;
  tipo_cobranca: string;
  ativou_em: string | null;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  data_vencimento: string | null;
  valor: number;
  dias_vencido: number;
  media_dias_pagamento_real: number | null;
  media_dias_considerada: number;
  dentro_media_atraso: boolean;
  ultrapassou_media_atraso: boolean;
  tempo_cliente_meses: number;
  tempo_cliente_label: string;
  qtd_pagamentos: number;
  renovacoes: number;
  reativacoes: number;
  ltv: number;
  ticket_medio_historico: number;
  nome_usuario?: string | null;
  telefone?: string | null;
  celular?: string | null;
  email?: string | null;
};

export type ActiveOverdueCard = {
  key: string;
  label: string;
  description: string;
  clientes: number;
  valor_total: number;
};

export type ActiveOverdueDuration = {
  duracao: string;
  duracao_label: string;
  clientes: number;
  valor_total: number;
  empresa_ids: number[];
};

export type ActiveOverduePlan = {
  plano: string;
  clientes: number;
  valor_total: number;
  duracoes: ActiveOverdueDuration[];
};

export type ActiveOverdueDashboardResponse = {
  data_referencia: string;
  filtros: { empresa: string; origem: string; pagador: string };
  regra: {
    prorrogacao_dias: number;
    churn_a_partir_dias: number;
    media_negativa_considerada: number;
    sem_historico_considerado: number;
    observacao_historico: string;
  };
  historico_ativos: ActiveOverdueHistoryPoint[];
  historico_tres_linhas: ActiveOverdueHistoryPoint[];
  yoy: {
    mes: number;
    mes_label: string;
    ano_atual: number;
    clientes_ativos_atual: number;
    comparacoes: Array<{
      ano: number;
      clientes_ativos: number;
      diferenca: number;
      percentual: number | null;
    }>;
  };
  cards: ActiveOverdueCard[];
  planos_por_card: Record<string, ActiveOverduePlan[]>;
  clientes_atrasados: ActiveOverdueClient[];
};
