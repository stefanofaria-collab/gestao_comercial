export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];


export function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}


export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}


export function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}


export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}


export function percentDelta(
  current: number,
  previous?: number | null,
): number | null {
  if (
    previous === undefined ||
    previous === null ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}
