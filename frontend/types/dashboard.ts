export type CompanyFilter =
  | "todos"
  | "gestaoclick"
  | "clicknotas";


export type OriginFilter =
  | "todos"
  | "gestaoclick"
  | "parceiro";


export type DurationFilter =
  | "todos"
  | "M"
  | "T"
  | "S"
  | "A";


export type PlanFilter =
  string;


export type DashboardBlock = {
  clientes_ativos: number;
  renovacoes_previstas: number;
  receita_vencendo: number;
  renovacoes_clientes: number;
  renovacoes_receita: number;
  churn_clientes: number;
  churn_receita: number;

  percentual_renovacoes_clientes_ativos: number;
  ticket_medio_vencimentos: number;
  ticket_medio_renovado: number;
  taxa_renovacao_clientes: number;
  taxa_renovacao_receita: number;
  ticket_medio_perdido: number;
  percentual_churn_clientes_ativos: number;
  percentual_churn_vencimentos: number;
  percentual_churn_receita_vencendo: number;
};


export type DashboardDetail =
  DashboardBlock & {
    nome_plano: string;
    duracao: string;
    duracao_label: string;
  };


export type DashboardPlan =
  DashboardBlock & {
    nome_plano: string;
  };


export type DashboardDuration =
  DashboardBlock & {
    duracao: string;
    duracao_label: string;
  };


export type DashboardResponse = {
  periodo: {
    ano: number;
    mes: number;
    data_inicio: string;
    data_fim: string;
    parcial: boolean;
  };

  resumo: DashboardBlock;

  por_plano: DashboardPlan[];

  por_duracao: DashboardDuration[];

  detalhe: DashboardDetail[];

  mes_anterior:
    | null
    | {
        ano: number;
        mes: number;
        resumo: DashboardBlock;
      };
};


export type HistoryPoint = {
  ano: number;
  mes: number;
  label: string;
  parcial: boolean;
  resumo: DashboardBlock;
};


export type HistoryResponse = {
  ano_inicio: number;
  ano_fim: number;
  pontos: HistoryPoint[];
};


export type ActiveClientsPoint = {
  ano: number;
  mes: number;
  label: string;
  clientes_ativos: number;
  variacao_clientes: number | null;
  variacao_percentual: number | null;
};


export type ActiveClientsSegmentPoint = {
  ano: number;
  mes: number;
  label: string;
  segmento: string;
  clientes_ativos: number;
  variacao_clientes: number | null;
  variacao_percentual: number | null;
};


export type ActiveClientsPlanDurationPoint = {
  ano: number;
  mes: number;
  label: string;
  empresa: string;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  clientes_ativos: number;
};


export type DurationOption = {
  value: Exclude<
    DurationFilter,
    "todos"
  >;
  label: string;
};


export type ActiveClientsHistoryResponse = {
  ano_inicio: number;
  ano_fim: number;
  pontos: ActiveClientsPoint[];
  segmentos: string[];
  pontos_segmentos: ActiveClientsSegmentPoint[];
  empresas: string[];
  planos: string[];
  duracoes: DurationOption[];
  pontos_planos_duracoes: ActiveClientsPlanDurationPoint[];
};


export type ChurnPoint = {
  ano: number;
  mes: number;
  label: string;
  churn_clientes: number;
  churn_receita: number;
  percentual_churn_clientes_ativos: number;
  percentual_churn_vencimentos: number;
  percentual_churn_receita_vencendo: number;
};


export type ChurnPlanPoint = {
  ano: number;
  mes: number;
  label: string;
  nome_plano: string;
  churn_clientes: number;
};


export type ChurnHistoryResponse = {
  ano_inicio: number;
  ano_fim: number;
  pontos: ChurnPoint[];
  planos: string[];
  pontos_planos: ChurnPlanPoint[];
};


export type MetaResponse = {
  anos: number[];
  ultimo_ano: number;
  ultimo_mes: number;
  mes_atual_parcial: boolean;
  planos: string[];
  duracoes: DurationOption[];
};
