import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { ChurnDashboardResponse, ChurnRenewalHistoryResponse } from "@/types/churn";

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

async function fetchWithTimeout<T>(url: string, timeoutMs = 45000): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`A consulta demorou mais de ${Math.round(timeoutMs / 1000)} segundos. Confira o terminal do backend.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function buildBaseParams(ano: number, mes: number, filters: GlobalFilters) {
  return new URLSearchParams({
    ano: String(ano),
    mes: String(mes),
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });
}

export function fetchChurnDashboard(
  ano: number,
  mes: number,
  filters: GlobalFilters,
): Promise<ChurnDashboardResponse> {
  const params = buildBaseParams(ano, mes, filters);
  return fetchWithTimeout<ChurnDashboardResponse>(`${API_URL}/api/churn?${params.toString()}`, 45000);
}

export function fetchChurnRenewalHistory(
  ano: number,
  mes: number,
  dimensao: "plano" | "duracao",
  valor: string,
  filters: GlobalFilters,
): Promise<ChurnRenewalHistoryResponse> {
  const params = buildBaseParams(ano, mes, filters);
  params.set("dimensao", dimensao);
  params.set("valor", valor);
  return fetchWithTimeout<ChurnRenewalHistoryResponse>(
    `${API_URL}/api/churn/renovacoes-historico?${params.toString()}`,
    45000,
  );
}
