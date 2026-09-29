export type PersonTypeSummary = {
  tipo: "PJ" | "PF" | "Não identificado";
  ativos: number;
  valor_ativos: number;
  ticket_ativo_medio: number;
  churns: number;
  valor_ultimo_plano_churn: number;
  ltv_total_churn: number;
  ltv_medio_churn: number;
  tempo_medio_churn_meses: number;
  renovacoes_media_churn: number;
};

export type ProfilePlanCross = {
  plano: string;
  ativos_pf: number;
  ativos_pj: number;
  ativos_outros: number;
  ativos_total: number;
  valor_ativos: number;
  churn_pf: number;
  churn_pj: number;
  churn_outros: number;
  churn_total: number;
  ltv_churn: number;
  valor_churn: number;
};

export type DocumentQuality = {
  total: number;
  cadastro_pf: number;
  cadastro_pj: number;
  cadastro_nao_identificado: number;
  cnpj_igual_cadastro_nota: number;
  cnpj_diferente_cadastro_nota: number;
  cadastro_pf_com_cnpj_na_nota: number;
  sem_cnpj_consultavel: number;
};

export type ProfileDashboardResponse = {
  periodo_churn: {
    ano: number;
    mes: number;
    data_inicio: string;
    data_fim: string;
    data_referencia: string;
    parcial: boolean;
    ano_completo: boolean;
  };
  data_base_ativa: string;
  filtros: {
    empresa: string;
    origem: string;
    pagador: string;
  };
  resumo: {
    clientes_ativos: number;
    valor_base_ativa: number;
    clientes_churn: number;
    ltv_total_churn: number;
    ltv_medio_churn: number;
  };
  por_tipo_pessoa: PersonTypeSummary[];
  por_plano: ProfilePlanCross[];
  qualidade_documentos: {
    ativos: DocumentQuality;
    churn: DocumentQuality;
  };
};

export type ProfileClient = {
  empresa_id: number;
  cliente: string;
  status_base: "Ativo" | "Churn";
  empresa: string;
  origem: string;
  pagador: string;
  modalidade?: string;
  nome_plano: string;
  duracao: string;
  duracao_label: string;
  ativou_em: string | null;
  data_vencimento: string | null;
  valor: number;
  tipo_pessoa: "PJ" | "PF" | "Não identificado";
  tipo_documento_nota: "PJ" | "PF" | "Não identificado";
  documento_cadastro: string | null;
  documento_nota: string | null;
  cnpj_cadastro: string | null;
  cnpj_nota: string | null;
  cnpjs_diferentes: boolean;
  tem_cnpj_consultavel: boolean;
  churn_em?: string | null;
  dias_vencido?: number;
  meses_cliente?: number;
  renovacoes?: number;
  ltv?: number;
  ticket_medio?: number;
  valor_perdido?: number;
};

export type ProfileClientListResponse = {
  grupo: "ativos" | "churn";
  page: number;
  limit: number;
  total: number;
  total_paginas: number;
  clientes: ProfileClient[];
};

export type CompanyProfile = {
  fonte: string;
  aviso_fonte: string;
  cnpj: string | null;
  cnpj_limpo: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  matriz_filial: string | null;
  data_abertura: string | null;
  cnae_principal: {
    codigo: string | null;
    descricao: string | null;
  };
  setor: string | null;
  segmento: string | null;
  grupo_cnae: string | null;
  classe_cnae: string | null;
  porte: string | null;
  natureza_juridica: string | null;
  regime_tributario: string | null;
  simples_nacional: boolean | string | null;
  mei: boolean | string | null;
  capital_social: number;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  endereco: string | null;
  email: string | null;
  telefone: string | null;
  cnaes_secundarios: { codigo: string; descricao: string | null }[];
  socios: { nome: string | null; qualificacao: string | null }[];
};

export type ProfileBusinessCoverage = {
  clientes_com_cnpj: number;
  clientes_enriquecidos: number;
  percentual: number;
  cnpjs_unicos: number;
  cnpjs_unicos_enriquecidos: number;
};

export type ProfileBusinessBreakdownItem = {
  label: string;
  quantidade: number;
};

export type ProfileBusinessBreakdown = {
  planos: ProfileBusinessBreakdownItem[];
  duracoes: ProfileBusinessBreakdownItem[];
};

export type ProfileBusinessCompareItem = {
  label: string;
  ativos: number;
  churn: number;
  ativos_detalhes: ProfileBusinessBreakdown;
  churn_detalhes: ProfileBusinessBreakdown;
};

export type ProfileBusinessTopItem = {
  label: string;
  quantidade: number;
  detalhes: ProfileBusinessBreakdown;
};

export type ProfileBusinessAnalyticsResponse = {
  fonte_cnpj: "cadastro" | "nota";
  sincronizacao_global: {
    empresas_mapeadas: number;
    empresas_com_cnpj: number;
    cnpjs_unicos: number;
    cnpjs_enriquecidos: number;
    cnpjs_com_erro: number;
    cnpjs_pendentes: number;
    percentual: number;
  };
  cobertura: {
    ativos: ProfileBusinessCoverage;
    churn: ProfileBusinessCoverage;
    banco_cnpjs: number;
  };
  regime_tributario: ProfileBusinessCompareItem[];
  porte: ProfileBusinessCompareItem[];
  top_setores_ativos: ProfileBusinessTopItem[];
  top_setores_churn: ProfileBusinessTopItem[];
  top_segmentos_ativos: ProfileBusinessTopItem[];
  top_segmentos_churn: ProfileBusinessTopItem[];
  atualizacao?: {
    tentados: number;
    sucesso: number;
    falhas: number;
    pendentes_antes: number;
    pendentes_depois_estimado: number;
    erros: string[];
  };
};


export type ProfileClientMetrics = {
  empresa_id: number;
  ultimo_vencimento: string | null;
  ativou_em: string | null;
  tempo_cliente_dias: number;
  tempo_cliente_meses: number;
  ltv: number;
  ticket_medio: number;
  qtd_pagamentos: number;
  renovacoes: number;
  reativacoes: number;
  media_dias_pagamento_real: number | null;
};

export type ProfileFilterOptions = {
  regimes_tributarios: string[];
  portes: string[];
  setores: string[];
  segmentos: string[];
  planos: string[];
  duracoes: { value: string; label: string }[];
};

export type ProfileClientFilters = {
  regime_tributario: string;
  porte: string;
  setor: string;
  segmento: string;
  plano: string;
  duracao: string;
};
