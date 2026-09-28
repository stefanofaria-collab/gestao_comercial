"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
};

type GlobalFiltersContextValue = {
  filters: GlobalFilters;
  setEmpresa: (value: CompanyFilter) => void;
  setOrigem: (value: OriginFilter) => void;
  setPagador: (value: PayerFilter) => void;
  setViewMode: (value: ViewMode) => void;
  resetFilters: () => void;
};

const DEFAULT_FILTERS: GlobalFilters = {
  empresa: "todos",
  origem: "todos",
  pagador: "todos",
  viewMode: "financeiro",
};

const STORAGE_KEY = "gestao-comercial-global-filters";

const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

export function GlobalFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<GlobalFilters>;
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
        viewMode:
          parsed.viewMode === "quantitativo" ? "quantitativo" : "financeiro",
      });
    } catch {
      // Se houver qualquer valor antigo inválido, mantém os filtros padrão.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // O dashboard continua funcionando mesmo se o navegador bloquear storage.
    }
  }, [filters]);

  const value = useMemo<GlobalFiltersContextValue>(
    () => ({
      filters,
      setEmpresa: (empresa) => setFilters((current) => ({ ...current, empresa })),
      setOrigem: (origem) => setFilters((current) => ({ ...current, origem })),
      setPagador: (pagador) => setFilters((current) => ({ ...current, pagador })),
      setViewMode: (viewMode) => setFilters((current) => ({ ...current, viewMode })),
      resetFilters: () => setFilters(DEFAULT_FILTERS),
    }),
    [filters],
  );

  return (
    <GlobalFiltersContext.Provider value={value}>
      {children}
    </GlobalFiltersContext.Provider>
  );
}

export function useGlobalFilters() {
  const context = useContext(GlobalFiltersContext);

  if (!context) {
    throw new Error("useGlobalFilters precisa estar dentro de GlobalFiltersProvider.");
  }

  return context;
}
