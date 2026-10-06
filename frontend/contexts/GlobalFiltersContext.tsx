"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type CompanyFilter = "todos" | "gestaoclick" | "clicknotas";
export type OriginFilter = "todos" | "gestaoclick" | "parceiro";
export type PayerFilter = "todos" | "cliente" | "parceiro";
export type ViewMode = "financeiro" | "quantitativo";

export type GlobalFilters = {
  empresa: CompanyFilter;
  origem: OriginFilter;
  pagador: PayerFilter;
  viewMode: ViewMode;
  ano: number;
  meses: number[];
  anoCompleto: boolean;
  plano: string;
  duracao: string;
};

type GlobalFiltersContextValue = {
  filters: GlobalFilters;
  setEmpresa: (value: CompanyFilter) => void;
  setOrigem: (value: OriginFilter) => void;
  setPagador: (value: PayerFilter) => void;
  setViewMode: (value: ViewMode) => void;
  setAno: (value: number) => void;
  setMeses: (value: number[]) => void;
  setAnoCompleto: (value: boolean) => void;
  setPlano: (value: string) => void;
  setDuracao: (value: string) => void;
  resetFilters: () => void;
};

const now = new Date();
const DEFAULT_FILTERS: GlobalFilters = {
  empresa: "todos",
  origem: "todos",
  pagador: "todos",
  viewMode: "financeiro",
  ano: now.getFullYear(),
  meses: [now.getMonth() + 1],
  anoCompleto: false,
  plano: "todos",
  duracao: "todos",
};

const STORAGE_KEY = "gestao-comercial-global-filters";
const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

function normalizeMonths(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const months = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12);
  return Array.from(new Set(months)).sort((a, b) => a - b);
}

function effectiveMonths(filters: GlobalFilters): number[] {
  if (filters.anoCompleto) return Array.from({ length: 12 }, (_, index) => index + 1);
  if (filters.meses.length) return filters.meses;
  return [new Date().getMonth() + 1];
}

function shouldApplyPeriod(pathname: string) {
  return [
    "/indicadores",
    "/faturamento",
    "/churn",
    "/perfil",
    "/atendimentos",
    "/pagamentos",
    "/vencimentos-futuros",
    "/upgrade-downgrade",
  ].some((prefix) => pathname.startsWith(prefix));
}

function shouldApplyPlanDuration(pathname: string) {
  return [
    "/indicadores",
    "/faturamento",
    "/churn",
    "/churn-score",
    "/ativos-atrasados",
    "/perfil",
    "/atendimentos",
    "/pagamentos",
    "/vencimentos-futuros",
    "/upgrade-downgrade",
  ].some((prefix) => pathname.startsWith(prefix));
}

export function GlobalFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);
  const filtersRef = useRef<GlobalFilters>(DEFAULT_FILTERS);
  const nativeFetchRef = useRef<typeof window.fetch | null>(null);
  filtersRef.current = filters;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<GlobalFilters>;
      const parsedMonths = normalizeMonths(parsed.meses);
      setFilters({
        empresa:
          parsed.empresa === "gestaoclick" || parsed.empresa === "clicknotas"
            ? parsed.empresa
            : "todos",
        origem:
          parsed.origem === "gestaoclick" || parsed.origem === "parceiro"
            ? parsed.origem
            : "todos",
        pagador:
          parsed.pagador === "cliente" || parsed.pagador === "parceiro"
            ? parsed.pagador
            : "todos",
        viewMode: parsed.viewMode === "quantitativo" ? "quantitativo" : "financeiro",
        ano: Number.isInteger(Number(parsed.ano)) ? Number(parsed.ano) : DEFAULT_FILTERS.ano,
        meses: Boolean(parsed.anoCompleto)
          ? Array.from({ length: 12 }, (_, index) => index + 1)
          : (parsedMonths.length ? parsedMonths : DEFAULT_FILTERS.meses),
        anoCompleto: Boolean(parsed.anoCompleto),
        plano: typeof parsed.plano === "string" && parsed.plano ? parsed.plano : "todos",
        duracao: typeof parsed.duracao === "string" && parsed.duracao ? parsed.duracao : "todos",
      });
    } catch {
      // Mantém o padrão caso exista algum valor antigo inválido.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // O dashboard continua funcionando mesmo se storage estiver bloqueado.
    }
  }, [filters]);

  useEffect(() => {
    if (!nativeFetchRef.current) nativeFetchRef.current = window.fetch.bind(window);
    const nativeFetch = nativeFetchRef.current;

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const raw = input instanceof Request ? input.url : String(input);
        const url = new URL(raw, window.location.origin);
        const pathname = window.location.pathname;
        const isApi = url.pathname.startsWith("/api/") || url.port === "8000";
        const currentFilters = filtersRef.current;

        if (isApi && !url.pathname.startsWith("/api/intranet-2")) {
          if (shouldApplyPeriod(pathname)) {
            const months = effectiveMonths(currentFilters);
            url.searchParams.set("ano_global", String(currentFilters.ano));
            url.searchParams.set("meses", months.join(","));
            if (url.searchParams.has("ano")) url.searchParams.set("ano", String(currentFilters.ano));
            if (url.searchParams.has("mes")) {
              const acceptsFullYear = !url.pathname.startsWith("/api/atendimentos");
              url.searchParams.set("mes", currentFilters.anoCompleto && acceptsFullYear ? "0" : String(months[0] ?? 1));
            }
          }

          if (shouldApplyPlanDuration(pathname)) {
            url.searchParams.set("plano_global", currentFilters.plano);
            url.searchParams.set("duracao_global", currentFilters.duracao);
          }

          const nextInput = input instanceof Request ? new Request(url.toString(), input) : url.toString();
          return nativeFetch(nextInput, init);
        }
      } catch {
        // Se não for possível interpretar a URL, mantém a chamada original.
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      if (nativeFetchRef.current) window.fetch = nativeFetchRef.current;
    };
  }, []);

  const value = useMemo<GlobalFiltersContextValue>(
    () => ({
      filters,
      setEmpresa: (empresa) => setFilters((current) => ({ ...current, empresa })),
      setOrigem: (origem) => setFilters((current) => ({ ...current, origem })),
      setPagador: (pagador) => setFilters((current) => ({ ...current, pagador })),
      setViewMode: (viewMode) => setFilters((current) => ({ ...current, viewMode })),
      setAno: (ano) => setFilters((current) => ({ ...current, ano })),
      setMeses: (meses) => setFilters((current) => ({ ...current, meses: normalizeMonths(meses), anoCompleto: false })),
      setAnoCompleto: (anoCompleto) => setFilters((current) => ({
        ...current,
        anoCompleto,
        meses: anoCompleto ? Array.from({ length: 12 }, (_, index) => index + 1) : current.meses,
      })),
      setPlano: (plano) => setFilters((current) => ({ ...current, plano })),
      setDuracao: (duracao) => setFilters((current) => ({ ...current, duracao })),
      resetFilters: () => setFilters(DEFAULT_FILTERS),
    }),
    [filters],
  );

  return <GlobalFiltersContext.Provider value={value}>{children}</GlobalFiltersContext.Provider>;
}

export function useGlobalFilters() {
  const context = useContext(GlobalFiltersContext);
  if (!context) throw new Error("useGlobalFilters precisa estar dentro de GlobalFiltersProvider.");
  return context;
}
