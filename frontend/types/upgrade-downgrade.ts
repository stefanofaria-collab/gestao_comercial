export type UpgradeDowngradeHistoryPoint = {
  mes: string;
  ano: number;
  numero_mes: number;
  total: number;
  upgrades: number;
  downgrades: number;
  saldo: number;
  total_financeiro: number;
  upgrades_financeiro: number;
  downgrades_financeiro: number;
  saldo_financeiro: number;
};

export type UpgradeDowngradeDePara = {
  de: string;
  para: string;
  movimento: "Upgrade" | "Downgrade" | "Sem alteração";
  quantidade: number;
  saldo_quantidade: number;
  saldo_financeiro: number;
};

export type UpgradeDowngradeResponse = {
  periodo: {
    ano: number;
    meses: number[];
    inicio: string;
    fim: string;
    ano_completo: boolean;
  };
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
    plano: string;
    duracao: string;
  };
  resumo: {
    total_alteracoes: number;
    upgrades: number;
    downgrades: number;
    saldo: number;
    mistos: number;
    total_financeiro: number;
    upgrades_financeiro: number;
    downgrades_financeiro: number;
    saldo_financeiro: number;
  };
  historico: UpgradeDowngradeHistoryPoint[];
  de_para_planos: UpgradeDowngradeDePara[];
  de_para_duracoes: UpgradeDowngradeDePara[];
  _cache_info?: {
    fallback?: boolean;
    refreshing?: boolean;
    source_date?: string | null;
    updated_at?: string | null;
  };
};
