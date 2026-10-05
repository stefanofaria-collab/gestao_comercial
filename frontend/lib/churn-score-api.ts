import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type {
  ChurnRiskFilter,
  ChurnScoreClientsResponse,
  ChurnScoreContactFilters,
  ChurnScoreContactListResponse,
  ChurnScoreDashboardResponse,
  ChurnScoreModelMeta,
} from "@/types/churn-score";

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

function buildParams(filters: GlobalFilters) {
  return new URLSearchParams({
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });
}

export function fetchChurnScoreMeta(): Promise<ChurnScoreModelMeta> {
  return fetchWithTimeout<ChurnScoreModelMeta>(`${API_URL}/api/churn-score/meta`, {}, 30000);
}

export function trainChurnScore(filters: GlobalFilters): Promise<ChurnScoreModelMeta> {
  const params = buildParams(filters);
  return fetchWithTimeout<ChurnScoreModelMeta>(
    `${API_URL}/api/churn-score/treinar?${params.toString()}`,
    { method: "POST" },
    900000,
  );
}

export function refreshChurnScore(filters: GlobalFilters): Promise<{ status: string; ultima_atualizacao: string | null }> {
  const params = buildParams(filters);
  return fetchWithTimeout<{ status: string; ultima_atualizacao: string | null }>(
    `${API_URL}/api/churn-score/atualizar?${params.toString()}`,
    { method: "POST" },
    30000,
  );
}

export function fetchChurnScoreDashboard(filters: GlobalFilters): Promise<ChurnScoreDashboardResponse> {
  const params = buildParams(filters);
  return fetchWithTimeout<ChurnScoreDashboardResponse>(
    `${API_URL}/api/churn-score?${params.toString()}`,
    {},
    30000,
  );
}

export function fetchChurnScoreClients(
  filters: GlobalFilters,
  options: { risco: ChurnRiskFilter; plano: string; duracao: string; pagina: number; por_pagina?: number },
): Promise<ChurnScoreClientsResponse> {
  const params = buildParams(filters);
  params.set("risco", options.risco);
  params.set("plano", options.plano);
  params.set("duracao", options.duracao);
  params.set("pagina", String(options.pagina));
  params.set("por_pagina", String(options.por_pagina ?? 20));
  return fetchWithTimeout<ChurnScoreClientsResponse>(
    `${API_URL}/api/churn-score/clientes?${params.toString()}`,
    {},
    30000,
  );
}

export function fetchChurnScoreContactList(
  filters: ChurnScoreContactFilters,
): Promise<ChurnScoreContactListResponse> {
  const params = new URLSearchParams({
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
    risco: filters.risco,
    plano: filters.plano,
    duracao: filters.duracao,
    data_inicio: filters.data_inicio,
    data_fim: filters.data_fim,
    valor_minimo: String(filters.valor_minimo || 0),
    tempo_cliente_unidade: filters.tempo_cliente_unidade,
    somente_ultrapassou_media: String(filters.somente_ultrapassou_media),
  });
  if (filters.tempo_cliente_minimo !== null) params.set("tempo_cliente_minimo", String(filters.tempo_cliente_minimo));
  if (filters.tempo_cliente_maximo !== null) params.set("tempo_cliente_maximo", String(filters.tempo_cliente_maximo));

  return fetchWithTimeout<ChurnScoreContactListResponse>(
    `${API_URL}/api/churn-score/lista-contato?${params.toString()}`,
    {},
    30000,
  );
}
