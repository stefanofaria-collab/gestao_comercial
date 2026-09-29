import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type {
  CompanyProfile,
  ProfileBusinessAnalyticsResponse,
  ProfileClientFilters,
  ProfileClientListResponse,
  ProfileClientMetrics,
  ProfileDashboardResponse,
  ProfileFilterOptions,
} from "@/types/perfil";

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

async function fetchWithTimeout<T>(
  url: string,
  timeoutMs = 45000,
  method = "GET",
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      method,
    });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw error;
      }
      throw new Error(`A API não respondeu em ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

function params(ano: number, mes: number, filters: GlobalFilters) {
  return new URLSearchParams({
    ano: String(ano),
    mes: String(mes),
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });
}

export function fetchProfileDashboard(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  signal?: AbortSignal,
): Promise<ProfileDashboardResponse> {
  const query = params(ano, mes, filters);
  return fetchWithTimeout<ProfileDashboardResponse>(
    `${API_URL}/api/perfil?${query.toString()}`,
    45000,
    "GET",
    signal,
  );
}

export function fetchProfileClients(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  grupo: "ativos" | "churn",
  busca: string,
  pagina: number,
  limite = 50,
  signal?: AbortSignal,
  clientFilters?: ProfileClientFilters,
  fonteCnpj: "cadastro" | "nota" = "cadastro",
): Promise<ProfileClientListResponse> {
  const query = params(ano, mes, filters);
  query.set("grupo", grupo);
  query.set("busca", busca);
  query.set("pagina", String(pagina));
  query.set("limite", String(limite));
  query.set("fonte_cnpj", fonteCnpj);
  if (clientFilters) {
    query.set("regime_tributario", clientFilters.regime_tributario);
    query.set("porte", clientFilters.porte);
    query.set("setor", clientFilters.setor);
    query.set("segmento", clientFilters.segmento);
    query.set("plano", clientFilters.plano);
    query.set("duracao", clientFilters.duracao);
  }
  return fetchWithTimeout<ProfileClientListResponse>(
    `${API_URL}/api/perfil/clientes?${query.toString()}`,
    45000,
    "GET",
    signal,
  );
}

export function fetchProfileFilterOptions(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  signal?: AbortSignal,
): Promise<ProfileFilterOptions> {
  const query = params(ano, mes, filters);
  return fetchWithTimeout<ProfileFilterOptions>(
    `${API_URL}/api/perfil/filtros?${query.toString()}`,
    30000,
    "GET",
    signal,
  );
}

export function fetchProfileClientMetrics(
  empresaId: number,
  statusBase: "Ativo" | "Churn",
  signal?: AbortSignal,
): Promise<ProfileClientMetrics> {
  const query = new URLSearchParams({ status_base: statusBase });
  return fetchWithTimeout<ProfileClientMetrics>(
    `${API_URL}/api/perfil/cliente/${empresaId}/metricas?${query.toString()}`,
    25000,
    "GET",
    signal,
  );
}


export function fetchCnpjProfile(cnpj: string, signal?: AbortSignal): Promise<CompanyProfile> {
  // O endpoint abaixo é somente leitura do Supabase. O navegador nunca consulta
  // BrasilAPI/CNPJ.ws diretamente.
  return fetchWithTimeout<CompanyProfile>(
    `${API_URL}/api/perfil/cnpj/${encodeURIComponent(cnpj)}`,
    25000,
    "GET",
    signal,
  );
}

export function fetchProfileBusinessAnalytics(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  fonteCnpj: "cadastro" | "nota",
  signal?: AbortSignal,
): Promise<ProfileBusinessAnalyticsResponse> {
  const query = params(ano, mes, filters);
  query.set("fonte_cnpj", fonteCnpj);
  return fetchWithTimeout<ProfileBusinessAnalyticsResponse>(
    `${API_URL}/api/perfil/empresarial?${query.toString()}`,
    45000,
    "GET",
    signal,
  );
}

export function enrichProfileBusinessAnalytics(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  fonteCnpj: "cadastro" | "nota",
  _limite = 15,
  signal?: AbortSignal,
): Promise<ProfileBusinessAnalyticsResponse> {
  // Compatibilidade com o nome antigo. O botão NÃO chama API externa: ele
  // apenas relê os registros que já estão no Supabase.
  return fetchProfileBusinessAnalytics(ano, mes, filters, fonteCnpj, signal);
}
