import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { ChurnScoreDashboardResponse, ChurnScoreModelMeta } from "@/types/churn-score";

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

async function fetchWithTimeout<T>(url: string, options: RequestInit = {}, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`A operação demorou mais de ${Math.round(timeoutMs / 1000)} segundos. Confira o terminal do backend.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function fetchChurnScoreMeta(): Promise<ChurnScoreModelMeta> {
  return fetchWithTimeout<ChurnScoreModelMeta>(`${API_URL}/api/churn-score/meta`, {}, 30000);
}

export function trainChurnScore(): Promise<ChurnScoreModelMeta> {
  return fetchWithTimeout<ChurnScoreModelMeta>(
    `${API_URL}/api/churn-score/treinar`,
    { method: "POST" },
    900000,
  );
}

export function fetchChurnScoreDashboard(filters: GlobalFilters): Promise<ChurnScoreDashboardResponse> {
  const params = new URLSearchParams({
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });
  return fetchWithTimeout<ChurnScoreDashboardResponse>(
    `${API_URL}/api/churn-score?${params.toString()}`,
    {},
    120000,
  );
}
