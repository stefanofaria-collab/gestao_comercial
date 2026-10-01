import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import { browserDailyCache } from "@/lib/browser-daily-cache";
import type { FutureDueDashboardResponse, FutureDueExportFilters, FutureDueExportOptions, FutureDueExportResponse, FutureDueMetaResponse } from "@/types/vencimentos-futuros";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Erro ${response.status} ao consultar a API.`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") {
        message = body.detail;
      } else if (body && Array.isArray(body.detail)) {
        const first = body.detail[0];
        const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : null;
        const reason = typeof first?.msg === "string" ? first.msg : null;
        if (field && reason) message = `Não foi possível validar o campo ${field}: ${reason}`;
      }
    } catch {
      // mantém mensagem padrão
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
      throw new Error(`A API demorou mais de ${Math.round(timeoutMs / 1000)} segundos para responder.`);
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

export function fetchFutureDueMeta(): Promise<FutureDueMetaResponse> {
  return fetchWithTimeout<FutureDueMetaResponse>(`${API_URL}/api/vencimentos-futuros/meta`, 25000);
}

export function fetchFutureDueDashboard(
  ano: number,
  mes: number,
  filters: GlobalFilters,
): Promise<FutureDueDashboardResponse> {
  const params = buildParams(ano, mes, filters);
  const url = `${API_URL}/api/vencimentos-futuros?${params.toString()}`;
  return browserDailyCache(`vencimentos:${url}`, () => fetchWithTimeout<FutureDueDashboardResponse>(url, 45000));
}


export function fetchFutureDueExportOptions(): Promise<FutureDueExportOptions> {
  return fetchWithTimeout<FutureDueExportOptions>(`${API_URL}/api/vencimentos-futuros/exportar/opcoes`, 30000);
}

export function fetchFutureDueExport(filters: FutureDueExportFilters): Promise<FutureDueExportResponse> {
  const params = new URLSearchParams({
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
    data_inicio: filters.data_inicio,
    data_fim: filters.data_fim,
    plano: filters.plano,
    duracao: filters.duracao,
    valor_minimo: String(filters.valor_minimo || 0),
    tempo_cliente_unidade: filters.tempo_cliente_unidade,
    somente_ultrapassou_media: String(filters.somente_ultrapassou_media),
  });

  // Campos opcionais não podem ser enviados como string vazia, pois o FastAPI
  // tenta convertê-los para número e responde 422. Quando o usuário deixa um
  // dos limites em branco, simplesmente não enviamos esse parâmetro.
  if (filters.tempo_cliente_minimo !== null) {
    params.set("tempo_cliente_minimo", String(filters.tempo_cliente_minimo));
  }

  if (filters.tempo_cliente_maximo !== null) {
    params.set("tempo_cliente_maximo", String(filters.tempo_cliente_maximo));
  }

  return fetchWithTimeout<FutureDueExportResponse>(`${API_URL}/api/vencimentos-futuros/exportar?${params.toString()}`, 120000);
}
