import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { AtendimentosDashboardResponse, AtendimentosMetaResponse, AtendimentoSyncStatus } from "@/types/atendimentos";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Erro ${response.status} ao consultar a API.`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") message = body.detail;
    } catch {
      // mantém a mensagem padrão
    }
    throw new Error(message);
  }
  return response.json();
}

async function getJson<T>(url: string, timeoutMs = 45000): Promise<T> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A consulta demorou mais do que o esperado.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function fetchAtendimentosMeta(): Promise<AtendimentosMetaResponse> {
  return getJson<AtendimentosMetaResponse>(`${API_URL}/api/atendimentos/meta`, 20000);
}

export function fetchAtendimentosDashboard(
  ano: number,
  mes: number,
  filters: GlobalFilters,
  _force = false,
): Promise<AtendimentosDashboardResponse> {
  const params = new URLSearchParams({
    ano: String(ano),
    mes: String(mes),
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });

  // O backend já possui snapshot diário no Supabase. Não mantemos uma segunda
  // cópia diária no navegador para não prender a tela a um valor antigo depois
  // de uma correção/sincronização executada no mesmo dia.
  return getJson<AtendimentosDashboardResponse>(`${API_URL}/api/atendimentos?${params.toString()}`, 90000);
}

export function fetchAtendimentosStatus(): Promise<AtendimentoSyncStatus> {
  return getJson<AtendimentoSyncStatus>(`${API_URL}/api/atendimentos/status`, 15000);
}
