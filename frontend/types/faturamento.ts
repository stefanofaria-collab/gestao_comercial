export type RevenueTotalResponse = {
  periodo: {
    ano: number;
    mes: number;
    data_inicio: string;
    data_fim: string;
    parcial: boolean;
    ano_completo?: boolean;
  };
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
    ativos: boolean;
  };
  faturamento_geral: number;
  quantidade_notas: number;
  ticket_medio: number;
  mes_anterior: null | {
    ano: number;
    mes: number;
    faturamento_geral: number;
    quantidade_notas: number;
    ticket_medio: number;
  };
  variacao_mes_anterior_valor: number;
  variacao_mes_anterior_percentual: number | null;
  variacao_notas_valor: number;
  variacao_notas_percentual: number | null;
  variacao_ticket_valor: number;
  variacao_ticket_percentual: number | null;
};

export type RevenueCompositionItem = {
  chave: string;
  label: string;
  valor: number;
  percentual: number;
  valor_anterior: number;
  variacao_valor: number;
  variacao_percentual: number | null;
  quantidade?: number;
  quantidade_anterior?: number;
  variacao_quantidade?: number;
  variacao_quantidade_percentual?: number | null;
};

export type RevenueDimensionItem = {
  label: string;
  valor: number;
  percentual: number;
  quantidade?: number;
  percentual_quantidade?: number;
};

export type RevenuePlanItem = {
  empresa: string;
  origem: string;
  pagador: string;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  valor: number;
  valor_anterior: number;
  variacao_valor: number;
  variacao_percentual: number | null;
  quantidade?: number;
  quantidade_anterior?: number;
  variacao_quantidade?: number;
  variacao_quantidade_percentual?: number | null;
};

export type RevenuePlanRankingItem = {
  nome_plano: string;
  valor: number;
  valor_anterior: number;
  variacao_valor: number;
  variacao_percentual: number | null;
  quantidade?: number;
  quantidade_anterior?: number;
  variacao_quantidade?: number;
  variacao_quantidade_percentual?: number | null;
};

export type RevenueDetailsResponse = {
  resumo: {
    faturamento_geral: number;
    faturamento_planos: number;
    novos_clientes: number;
    renovacoes: number;
    recursos: number;
    servicos: number;
    certclick: number;
    outros: number;
    total_classificado: number;
  };
  composicao: RevenueCompositionItem[];
  origens: {
    por_empresa: RevenueDimensionItem[];
    por_origem: RevenueDimensionItem[];
    por_pagador: RevenueDimensionItem[];
  };
  por_plano: RevenuePlanItem[];
  ranking_planos?: RevenuePlanRankingItem[];
};

export type RevenueHistoryPoint = {
  ano: number;
  mes: number;
  label: string;
  faturamento_geral: number;
  quantidade_notas?: number;
};

export type RevenueHistoryResponse = {
  ano_inicio: number;
  ano_fim: number;
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
    ativos: boolean;
  };
  pontos: RevenueHistoryPoint[];
};

export type RevenueComparisonItem = {
  label: string;
  ano?: number;
  mes?: number;
  atual: number;
  comparado: number;
  variacao_valor: number;
  variacao_percentual: number | null;
};

export type RevenueComponentDetailResponse = {
  modo_comparacao: "mes_completo" | "mesmo_periodo_atual";
  periodo_atual: {
    ano: number;
    mes: number;
    data_inicio: string;
    data_fim: string;
  };
  resumo: {
    valor: number;
    quantidade_notas: number;
    ticket_medio: number;
  };
  variacoes: {
    mes_anterior: RevenueComparisonItem;
    acumulado_ano: RevenueComparisonItem[];
    mesmo_mes: RevenueComparisonItem[];
  };
};

export type RevenuePlanDetailDurationItem = {
  duracao: string;
  duracao_label: string;
  atual: number;
  anterior: number;
  variacao_valor: number;
  variacao_percentual: number | null;
  quantidade?: number;
  quantidade_anterior?: number;
  variacao_quantidade?: number;
  variacao_quantidade_percentual?: number | null;
};

export type RevenuePlanHistoryItem = {
  ano: number;
  mes: number;
  label: string;
  Mensal: number;
  Trimestral: number;
  Semestral: number;
  Anual: number;
  total: number;
  quantidade_notas?: number;
};

export type RevenuePlanDetailResponse = {
  plano: string;
  modo_comparacao: "mes_completo" | "mesmo_periodo_atual";
  periodo: {
    ano: number;
    mes: number;
    data_inicio: string;
    data_fim: string;
  };
  resumo: {
    atual: number;
    anterior: number;
    variacao_valor: number;
    variacao_percentual: number | null;
    quantidade?: number;
    quantidade_anterior?: number;
    variacao_quantidade?: number;
    variacao_quantidade_percentual?: number | null;
  };
  por_duracao: RevenuePlanDetailDurationItem[];
  historico_12_meses: RevenuePlanHistoryItem[];
  variacoes: {
    mes_anterior: RevenueComparisonItem;
    acumulado_ano: RevenueComparisonItem[];
    mesmo_mes: RevenueComparisonItem[];
  };
};
