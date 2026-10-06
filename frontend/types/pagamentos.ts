export type PaymentCategoryKey =
  | "antecipado"
  | "no_vencimento"
  | "prorrogacao"
  | "atrasado"
  | "reativacao"
  | "media_dias";

export type PaymentCard = {
  key: PaymentCategoryKey;
  label: string;
  explicacao: string;
  percentual?: number;
  media_dias?: number | null;
  pagamentos: number;
  clientes: number;
  faturamento: number;
};

export type PaymentSummary = {
  pagamentos_total: number;
  clientes_total: number;
  faturamento_total: number;
  media_dias_pagamento: number | null;
  cards: PaymentCard[];
};

export type PaymentMonthly = PaymentSummary & {
  ano: number;
  mes: number;
  label: string;
};

export type PaymentYearly = PaymentSummary & {
  ano: number;
};

export type PaymentPlanMonthly = PaymentMonthly & {
  plano: string;
};

export type PaymentsDashboardResponse = {
  data_referencia: string;
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
  };
  periodo_padrao: {
    ano: number;
    mes: number;
  };
  anos: number[];
  meses: { value: number; label: string }[];
  planos: string[];
  periodo_selecionado?: PaymentSummary & { ano: number; meses: number[]; label: string };
  planos_periodo_selecionado?: Array<PaymentSummary & { plano: string }>;
  historico_mensal: PaymentMonthly[];
  historico_anual: PaymentYearly[];
  historico_planos: PaymentPlanMonthly[];
};
