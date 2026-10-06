import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { IndicadoresResponse } from "@/types/indicadores";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function fetchIndicadores(filters: GlobalFilters): Promise<IndicadoresResponse> {
  const months = filters.anoCompleto
    ? Array.from({ length: 12 }, (_, index) => index + 1)
    : filters.meses;

  const params = new URLSearchParams({
    ano: String(filters.ano),
    meses: months.join(","),
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
    plano: filters.plano || "todos",
    duracao: filters.duracao || "todos",
  });

  const response = await fetch(`${API_URL}/api/indicadores?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Erro ${response.status} ao carregar os indicadores.`;
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
