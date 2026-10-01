import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { PaymentsDashboardResponse } from "@/types/pagamentos";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function fetchPaymentsDashboard(filters: GlobalFilters): Promise<PaymentsDashboardResponse> {
  const params = new URLSearchParams({
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
  });

  const url = `${API_URL}/api/pagamentos?${params.toString()}`;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 120000);

  try {
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A primeira carga diária de Pagamentos ainda está sendo preparada. Tente novamente em alguns instantes.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
