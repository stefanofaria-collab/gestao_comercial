export type ChurnClient = {
  empresa_id: number;
  cliente: string;
  empresa: string;
  origem: string;
  pagador: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  ativou_em: string | null;
  data_vencimento: string | null;
  churn_em: string | null;
  dias_vencido: number;
  dias_cliente: number;
  meses_cliente: number;
  qtd_pagamentos: number;
  renovacoes: number;
  ltv: number;
  ticket_medio: number;
  receita_media_mensal: number;
  valor_perdido: number;
};

export type ChurnPlan = {
  nome_plano: string;
  clientes: number;
  percentual_clientes: number;
  ltv_total: number;
  valor_perdido: number;
  ltv_medio: number;
  tempo_medio_meses: number;
  renovacoes_media: number;
};

export type ChurnBucket = {
  label: string;
  ordem: number;
  clientes: number;
  ltv_total: number;
  percentual_clientes: number;
};

export type ChurnDimension = {
  label: string;
  clientes: number;
  percentual_clientes: number;
  ltv_total: number;
  valor_perdido: number;
};

export type ChurnUtmItem = {
  label: string;
  clientes: number;
  percentual_clientes: number;
  ltv_total: number;
  valor_perdido: number;
};

export type ChurnUtmRanking = {
  field: "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term";
  label: string;
  prioridade: number;
  clientes_informados: number;
  cobertura_clientes: number;
  itens: ChurnUtmItem[];
};

export type ChurnRenewalAverage = {
  value: string;
  label: string;
  clientes: number;
  renovacoes_media: number;
};

export type ChurnRenewalHistoryPoint = {
  ano: number;
  mes: number;
  label: string;
  clientes: number;
  renovacoes_media: number;
};

export type ChurnRenewalHistoryResponse = {
  dimensao: "plano" | "duracao";
  valor: string;
  label: string;
  data_inicio: string;
  data_fim: string;
  pontos: ChurnRenewalHistoryPoint[];
};

export type ChurnDashboardResponse = {
  periodo: {
    ano: number;
    mes: number;
    data_inicio: string;
    data_fim: string;
    data_referencia: string;
    parcial: boolean;
    ano_completo?: boolean;
  };
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
  };
  regra_churn: string;
  resumo: {
    clientes_perdidos: number;
    valor_perdido: number;
    tempo_medio_meses: number;
    tempo_mediano_meses: number;
    renovacoes_media: number;
    renovacoes_mediana: number;
    pagamentos_media: number;
    ltv_medio: number;
    ltv_total: number;
    ticket_medio_pagamentos: number;
  };
  por_plano: ChurnPlan[];
  renovacoes_medias: {
    por_plano: ChurnRenewalAverage[];
    por_duracao: ChurnRenewalAverage[];
  };
  tempo_faixas: ChurnBucket[];
  renovacoes_faixas: ChurnBucket[];
  ltv_faixas: ChurnBucket[];
  dimensoes: {
    por_empresa: ChurnDimension[];
    por_origem: ChurnDimension[];
    por_pagador: ChurnDimension[];
  };
  utms: ChurnUtmRanking[];
  clientes: ChurnClient[];
};
