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
  razao_social: string | null;
  nome_usuario: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  ativou_em: string | null;
  data_vencimento: string | null;
  churn_em: string | null;
  ultimo_pagamento: string | null;
  recencia_dias: number;
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

export type ChurnRfmSegment = {
  segmento: string;
  clientes: number;
  percentual_clientes: number;
  valor_perdido: number;
  ltv_total: number;
  score_medio: number;
};

export type ChurnRfmClient = {
  empresa_id: number;
  cliente: string;
  plano: string;
  recencia_dias: number;
  pagamentos: number;
  ltv: number;
  valor_perdido: number;
  r: number;
  f: number;
  m: number;
  score: number;
  segmento: string;
};

export type ChurnParetoClient = {
  empresa_id: number;
  cliente: string;
  plano: string;
  valor_perdido: number;
  ltv: number;
  percentual_acumulado: number;
};

export type ChurnCohortMonth = {
  mes: number;
  retidos: number | null;
  percentual: number | null;
  aplicavel: boolean;
  observavel: boolean;
};

export type ChurnCohortRow = {
  coorte: string;
  base_clientes: number;
  meses: ChurnCohortMonth[];
};

export type ChurnCohortDuration = {
  duracao: "M" | "T" | "S" | "A";
  label: string;
  intervalo_meses: number;
  coortes: ChurnCohortRow[];
};

export type ChurnTenureAnalysis = {
  label: string;
  ordem: number;
  clientes: number;
  percentual_clientes: number;
  valor_perdido: number;
  ltv_total: number;
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
  analises: {
    coorte_por_duracao: ChurnCohortDuration[];
  };
  clientes: ChurnClient[];
};
