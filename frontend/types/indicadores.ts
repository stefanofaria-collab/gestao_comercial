export type IndicadoresResumo = {
  faturamento_valor: number;
  faturamento_quantidade: number;
  ativos_quantidade: number;
  ativos_valor: number;
  atrasados_quantidade: number;
  atrasados_valor: number;
  churn_quantidade: number;
  churn_valor: number;
  alto_risco_quantidade: number;
  alto_risco_valor: number;
  vencimentos_30_quantidade: number;
  vencimentos_30_valor: number;
  atendimentos: number;
  clientes_atendidos: number;
  upgrades: number;
  downgrades: number;
  saldo_upgrade_downgrade: number;
  upgrades_financeiro: number;
  downgrades_financeiro: number;
  saldo_upgrade_downgrade_financeiro: number;
};

export type IndicadoresMes = {
  mes: string;
  numero_mes: number;
  faturamento_valor: number;
  faturamento_quantidade: number;
  churn_valor: number;
  churn_quantidade: number;
  atendimentos: number;
  clientes_atendidos: number;
  upgrades: number;
  downgrades: number;
  saldo_upgrade_downgrade: number;
  upgrades_financeiro: number;
  downgrades_financeiro: number;
  saldo_upgrade_downgrade_financeiro: number;
};

export type IndicadoresResponse = {
  periodo: {
    ano: number;
    meses: number[];
    inicio: string;
    fim: string;
    ano_completo: boolean;
  };
  filtros: Record<string, string>;
  resumo: IndicadoresResumo;
  mensal: IndicadoresMes[];
  churn_score_atualizado_em?: string | null;
  _cache_info?: {
    updated_at?: string | null;
    refreshing?: boolean;
    fallback?: boolean;
  };
};
