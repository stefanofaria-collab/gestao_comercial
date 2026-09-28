import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type {
  RevenueComponentDetailResponse,
  RevenueDetailsResponse,
  RevenueHistoryResponse,
  RevenuePlanDetailResponse,
  RevenueTotalResponse,
} from "@/types/faturamento";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type CompareMode = "mes_completo" | "mesmo_periodo_atual";

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

async function fetchWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `A API não respondeu em ${Math.round(timeoutMs / 1000)} segundos. ` +
          "O dashboard parou de esperar para não ficar travado. Verifique o terminal do backend.",
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function buildParams(ano: number, mes: number, filters: GlobalFilters) {
  return new URLSearchParams({
    ano: String(ano),
    mes: String(mes),
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });
}

export function fetchFaturamentoTotal(
  ano: number,
  mes: number,
  filters: GlobalFilters,
): Promise<RevenueTotalResponse> {
  const params = buildParams(ano, mes, filters);
  return fetchWithTimeout<RevenueTotalResponse>(
    `${API_URL}/api/faturamento/total?${params.toString()}`,
    15000,
  );
}

export function fetchFaturamentoDetalhes(
  ano: number,
  mes: number,
  filters: GlobalFilters,
): Promise<RevenueDetailsResponse> {
  const params = buildParams(ano, mes, filters);
  return fetchWithTimeout<RevenueDetailsResponse>(
    `${API_URL}/api/faturamento/detalhes?${params.toString()}`,
    45000,
  );
}

export function fetchFaturamentoHistorico(
  ano: number,
  mes: number,
  filters: GlobalFilters,
): Promise<RevenueHistoryResponse> {
  const params = buildParams(ano, mes, filters);
  return fetchWithTimeout<RevenueHistoryResponse>(
    `${API_URL}/api/faturamento/historico?${params.toString()}`,
    45000,
  );
}

export function fetchFaturamentoComponente(
  ano: number,
  mes: number,
  componente: string,
  filters: GlobalFilters,
  compareMode: CompareMode,
): Promise<RevenueComponentDetailResponse> {
  const params = buildParams(ano, mes, filters);
  params.set("componente", componente);
  params.set("compare_mode", compareMode);
  return fetchWithTimeout<RevenueComponentDetailResponse>(
    `${API_URL}/api/faturamento/componente?${params.toString()}`,
    45000,
  );
}

export function fetchFaturamentoPlanoDetalhe(
  ano: number,
  mes: number,
  plano: string,
  filters: GlobalFilters,
  compareMode: CompareMode,
): Promise<RevenuePlanDetailResponse> {
  const params = buildParams(ano, mes, filters);
  params.set("plano", plano);
  params.set("compare_mode", compareMode);
  return fetchWithTimeout<RevenuePlanDetailResponse>(
    `${API_URL}/api/faturamento/plano-detalhe?${params.toString()}`,
    45000,
  );
}
