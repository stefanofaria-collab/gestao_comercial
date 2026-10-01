export type FutureDueSummary = {
  valor_total: number;
  clientes: number;
  ticket_medio: number;
  clientes_em_churn: number;
  valor_em_churn: number;
  clientes_primeira_renovacao: number;
};

export type FutureDuePlan = {
  plano: string;
  duracao: string;
  duracao_label: string;
  label: string;
  clientes: number;
  valor_total: number;
  ticket_medio: number;
};

export type FutureDueCalendarItem = {
  date: string;
  day: number;
  month: number;
  year: number;
  month_label: string;
  total_valor: number;
  total_clientes: number;
  is_past: boolean;
  is_today: boolean;
  is_future: boolean;
  is_churn: boolean;
};

export type FutureDueClient = {
  empresa_id: number;
  cliente: string;
  intranet_url: string;
  modalidade: string;
  empresa_indicacao_id: number;
  tipo_cobranca: string;
  empresa: string;
  origem: string;
  pagador: string;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  label_plano: string;
  data_vencimento: string | null;
  valor: number;
  ativou_em: string | null;
  tempo_casa_meses: number;
  tempo_casa_label: string;
  dias_vencido: number;
  em_churn: boolean;
  nome_usuario?: string | null;
  telefone?: string | null;
  celular?: string | null;
  email?: string | null;
  qtd_pagamentos: number;
  renovacoes_realizadas: number;
  reativacoes: number;
  media_dias_pagamento: number | null;
  ltv: number;
  ticket_medio_historico: number;
  primeira_renovacao: boolean;
};

export type FutureDueDashboardResponse = {
  periodo: {
    ano: number;
    mes: number;
    mes_label: string;
    ano_completo: boolean;
    data_inicio: string;
    data_fim: string;
    data_hoje: string;
    data_churn: string;
  };
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
  };
  resumo: FutureDueSummary;
  por_plano: FutureDuePlan[];
  calendario: FutureDueCalendarItem[];
  top_maiores_clientes: FutureDueClient[];
  top_clientes_antigos: FutureDueClient[];
  top_primeira_renovacao: FutureDueClient[];
  top_primeira_renovacao_mensal: FutureDueClient[];
};

export type FutureDueMetaResponse = {
  ano_inicio: number;
  ano_atual: number;
  mes_atual: number;
  anos: number[];
  meses: { value: number; label: string }[];
};


export type FutureDueExportOptions = {
  planos: string[];
  duracoes: { value: string; label: string }[];
};

export type FutureDueExportFilters = {
  empresa: "todos" | "gestaoclick" | "clicknotas";
  origem: "todos" | "gestaoclick" | "parceiro";
  pagador: "todos" | "cliente" | "parceiro";
  data_inicio: string;
  data_fim: string;
  plano: string;
  duracao: string;
  valor_minimo: number;
  tempo_cliente_minimo: number | null;
  tempo_cliente_maximo: number | null;
  tempo_cliente_unidade: "mes" | "ano";
  somente_ultrapassou_media: boolean;
};

export type FutureDueExportRow = {
  id: number;
  ativou_em: string | null;
  modalidade: string;
  empresa_indicacao_id: number;
  tipo_cobranca: string;
  nome_plano: string;
  duracao: string;
  data_vencimento: string | null;
  valor: number;
  nome_usuario: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  empresa: string;
  origem: string;
  pagador: string;
  tempo_cliente_meses: number;
  qtd_pagamentos: number;
  renovacoes: number;
  reativacoes: number;
  media_dias_pagamento_real: number | null;
  ltv: number;
  ticket_medio_historico: number;
  intranet_url: string;
};

export type FutureDueExportResponse = {
  filtros: FutureDueExportFilters;
  total: number;
  rows: FutureDueExportRow[];
};
