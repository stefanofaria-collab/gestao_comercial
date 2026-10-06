import type { GlobalFilters } from "@/contexts/GlobalFiltersContext";
import type { UpgradeDowngradeResponse } from "@/types/upgrade-downgrade";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function fetchUpgradeDowngrade(filters: GlobalFilters): Promise<UpgradeDowngradeResponse> {
  const months = filters.anoCompleto
    ? Array.from({ length: 12 }, (_, index) => index + 1)
    : filters.meses;

  const params = new URLSearchParams({
    ano: String(filters.ano),
    meses: months.join(","),
    empresa: filters.empresa,
    origem: filters.origem,
    pagador: filters.pagador,
    plano: filters.plano,
    duracao: filters.duracao,
  });

  const response = await fetch(`${API_URL}/api/upgrade-downgrade?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Erro ${response.status} ao consultar Upgrade e Downgrade.`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // mantém mensagem padrão
    }
    throw new Error(message);
  }
  return response.json();
}
