import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import { browserDailyCache } from "@/lib/browser-daily-cache";
import type { ActiveOverdueDashboardResponse } from "@/types/ativos-atrasados";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function fetchActiveOverdueDashboard(filters: GlobalFilters): Promise<ActiveOverdueDashboardResponse> {
  const params = new URLSearchParams({
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 120000);
  try {
    const url = `${API_URL}/api/ativos-atrasados?${params.toString()}`;
    return await browserDailyCache(`ativos-atrasados:${url}`, async () => {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
      let detail = `Erro ${response.status} ao consultar a API.`;
      try {
        const body = await response.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {}
        throw new Error(detail);
      }
      return response.json();
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A primeira carga diária ainda está sendo preparada. Tente novamente em alguns instantes.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
