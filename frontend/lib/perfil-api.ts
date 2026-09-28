import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type {
  CompanyProfile,
  ProfileBusinessAnalyticsResponse,
  ProfileClientListResponse,
  ProfileDashboardResponse,
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

async function fetchWithTimeout<T>(url: string, timeoutMs = 45000, method = "GET"): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, method });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`A API não respondeu em ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
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
): Promise<ProfileDashboardResponse> {
  const query = params(ano, mes, filters);
  return fetchWithTimeout<ProfileDashboardResponse>(`${API_URL}/api/perfil?${query.toString()}`);
}

export function fetchProfileClients(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  grupo: "ativos" | "churn",
  busca: string,
  pagina: number,
  limite = 50,
): Promise<ProfileClientListResponse> {
  const query = params(ano, mes, filters);
  query.set("grupo", grupo);
  query.set("busca", busca);
  query.set("pagina", String(pagina));
  query.set("limite", String(limite));
  return fetchWithTimeout<ProfileClientListResponse>(`${API_URL}/api/perfil/clientes?${query.toString()}`);
}

export function fetchCnpjProfile(cnpj: string): Promise<CompanyProfile> {
  return fetchWithTimeout<CompanyProfile>(`${API_URL}/api/perfil/cnpj/${encodeURIComponent(cnpj)}`, 25000);
}

export function fetchProfileBusinessAnalytics(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  fonteCnpj: "cadastro" | "nota",
): Promise<ProfileBusinessAnalyticsResponse> {
  const query = params(ano, mes, filters);
  query.set("fonte_cnpj", fonteCnpj);
  return fetchWithTimeout<ProfileBusinessAnalyticsResponse>(`${API_URL}/api/perfil/empresarial?${query.toString()}`, 45000);
}

export function enrichProfileBusinessAnalytics(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  fonteCnpj: "cadastro" | "nota",
  _limite = 15,
): Promise<ProfileBusinessAnalyticsResponse> {
  // Compatibilidade com o nome antigo. A aplicação não enriquece mais CNPJs
  // pelo navegador: o botão apenas relê do Supabase os registros que o
  // sincronizador já gravou.
  return fetchProfileBusinessAnalytics(ano, mes, filters, fonteCnpj);
}

