import type {
  Intranet2ClientDetail,
  Intranet2ExportResponse,
  Intranet2Filters,
  Intranet2Options,
  Intranet2SearchResponse,
} from "@/types/intranet2";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Erro ${response.status} ao consultar a API.`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") message = body.detail;
    } catch {
      // Mantém a mensagem padrão.
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchWithTimeout<T>(url: string, timeoutMs = 120000): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`A consulta demorou mais de ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function buildParams(filters: Intranet2Filters) {
  const params = new URLSearchParams({
    razao_social: filters.razao_social,
    email: filters.email,
    telefone: filters.telefone,
    estado: filters.estado,
    cidade: filters.cidade,
    plano: filters.plano,
    duracao: filters.duracao,
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
    somente_ativos: filters.somente_ativos,
    valor_minimo: String(filters.valor_minimo || 0),
    tempo_cliente_unidade: filters.tempo_cliente_unidade,
    somente_ultrapassou_media: String(filters.somente_ultrapassou_media),
  });

  const optionalStrings: Array<[string, string]> = [
    ["ultimo_acesso_de", filters.ultimo_acesso_de],
    ["ultimo_acesso_ate", filters.ultimo_acesso_ate],
    ["vencimento_de", filters.vencimento_de],
    ["vencimento_ate", filters.vencimento_ate],
    ["pagamento_de", filters.pagamento_de],
    ["pagamento_ate", filters.pagamento_ate],
  ];
  optionalStrings.forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const optionalNumbers: Array<[string, number | null]> = [
    ["sem_acesso_min", filters.sem_acesso_min],
    ["sem_acesso_max", filters.sem_acesso_max],
    ["vencido_min", filters.vencido_min],
    ["vencido_max", filters.vencido_max],
    ["vencem_em_min", filters.vencem_em_min],
    ["vencem_em_max", filters.vencem_em_max],
    ["tempo_cliente_minimo", filters.tempo_cliente_minimo],
    ["tempo_cliente_maximo", filters.tempo_cliente_maximo],
  ];
  optionalNumbers.forEach(([key, value]) => {
    if (value !== null) params.set(key, String(value));
  });

  return params;
}

export function fetchIntranet2Options(): Promise<Intranet2Options> {
  return fetchWithTimeout<Intranet2Options>(`${API_URL}/api/intranet-2/opcoes`, 60000);
}

export function fetchIntranet2Search(
  filters: Intranet2Filters,
  page = 1,
  limit = 20,
): Promise<Intranet2SearchResponse> {
  const params = buildParams(filters);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return fetchWithTimeout<Intranet2SearchResponse>(`${API_URL}/api/intranet-2/buscar?${params.toString()}`, 180000);
}

export function fetchIntranet2Export(filters: Intranet2Filters): Promise<Intranet2ExportResponse> {
  const params = buildParams(filters);
  return fetchWithTimeout<Intranet2ExportResponse>(`${API_URL}/api/intranet-2/exportar?${params.toString()}`, 300000);
}

export function fetchIntranet2ClientDetail(empresaId: number): Promise<Intranet2ClientDetail> {
  return fetchWithTimeout<Intranet2ClientDetail>(`${API_URL}/api/intranet-2/cliente/${empresaId}`, 180000);
}
