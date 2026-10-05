export type Intranet2Filters = {
  razao_social: string;
  email: string;
  telefone: string;
  estado: string;
  cidade: string;
  ultimo_acesso_de: string;
  ultimo_acesso_ate: string;
  sem_acesso_min: number | null;
  sem_acesso_max: number | null;
  vencimento_de: string;
  vencimento_ate: string;
  pagamento_de: string;
  pagamento_ate: string;
  plano: string;
  duracao: string;
  empresa: "todos" | "gestaoclick" | "clicknotas";
  origem: "todos" | "gestaoclick" | "parceiro";
  pagador: "todos" | "cliente" | "parceiro";
  somente_ativos: "todos" | "sim" | "nao";
  valor_minimo: number;
  tempo_cliente_minimo: number | null;
  tempo_cliente_maximo: number | null;
  tempo_cliente_unidade: "mes" | "ano";
  somente_ultrapassou_media: boolean;
};

export type Intranet2Options = {
  estados: string[];
  localidades: Array<{ estado: string; cidade: string }>;
  planos: string[];
  duracoes: Array<{ value: string; label: string }>;
};

export type Intranet2Row = {
  empresa_id: number;
  plano_registro_id: number;
  cpf_cnpj: string | null;
  razao_social: string | null;
  empresa: string;
  origem: string;
  pagador: string;
  modalidade: string | null;
  empresa_indicacao_id: number | null;
  tipo_cobranca: string | null;
  estado: string | null;
  cidade: string | null;
  ativou_em: string | null;
  ultimo_acesso: string | null;
  dias_sem_acesso: number | null;
  ultimo_acesso_vencimento: number | null;
  nome_plano: string;
  duracao: string;
  valor: number;
  data_vencimento: string | null;
  pago_em: string | null;
  dias_vencido: number;
  tempo_vida: number;
  nome_usuario: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  ativo: boolean;
  churn_score: number | null;
  nivel_risco: string | null;
  intranet_url: string;
};

export type Intranet2SearchResponse = {
  filtros: Record<string, unknown>;
  page: number;
  limit: number;
  total: number;
  total_paginas: number;
  rows: Intranet2Row[];
};

export type Intranet2ExportResponse = {
  filtros: Record<string, unknown>;
  total: number;
  rows: Intranet2Row[];
};

export type Intranet2ClientDetail = {
  resumo: Record<string, unknown>;
  empresa: Record<string, unknown>;
  plano_atual: Record<string, unknown> | null;
  lojas: Array<Record<string, unknown>>;
  perfil_empresa: Record<string, unknown> | null;
  metricas_pagamento: Record<string, unknown>;
  planos: Array<Record<string, unknown>>;
  pagamentos: Array<Record<string, unknown>>;
  atrasos: Array<Record<string, unknown>>;
  notas_fiscais: Array<Record<string, unknown>>;
  questionarios: Array<Record<string, unknown>>;
  atendimentos: Array<Record<string, unknown>>;
  atendimentos_contexto: Array<Record<string, unknown>>;
  churn_score: Record<string, unknown> | null;
};
