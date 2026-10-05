"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Gauge,
  Headset,
  SearchCheck,
  Menu,
  X,
  RotateCcw,
  SlidersHorizontal,
  TrendingDown,
  UsersRound,
} from "lucide-react";
import {
  GlobalFiltersProvider,
  useGlobalFilters,
  type CompanyFilter,
  type OriginFilter,
  type PayerFilter,
  type ViewMode,
} from "@/contexts/GlobalFiltersContext";

const navigation = [
  { href: "/faturamento", label: "Faturamento", icon: BadgeDollarSign },
  { href: "/churn", label: "Churn", icon: TrendingDown },
  { href: "/churn-score", label: "Churn Score", icon: Gauge },
  { href: "/ativos-atrasados", label: "Ativos e Atrasados", icon: UsersRound },
  { href: "/indicadores", label: "Indicadores", icon: BarChart3 },
  { href: "/perfil", label: "Perfil", icon: CircleUserRound },
  { href: "/atendimentos", label: "Atendimentos", icon: Headset },
  // Página de análise do comportamento de pagamento das renovações.
  { href: "/pagamentos", label: "Pagamentos", icon: CreditCard },
  { href: "/vencimentos-futuros", label: "Vencimentos Futuros", icon: CalendarClock },
  { href: "/intranet-2", label: "Intranet 2.0", icon: SearchCheck },
];

const ShellNestingContext = createContext(false);

function ModeSwitch({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
      <div className="grid grid-cols-2 gap-1 sm:flex">
        <button
          type="button"
          onClick={() => onChange("financeiro")}
          className={`min-w-0 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            value === "financeiro" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
          }`}
        >
          Financeiro
        </button>
        <button
          type="button"
          onClick={() => onChange("quantitativo")}
          className={`min-w-0 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            value === "quantitativo" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
          }`}
        >
          Quantitativo
        </button>
      </div>
    </div>
  );
}

function GlobalFilterBar() {
  const { filters, setEmpresa, setOrigem, setPagador, setViewMode, resetFilters } = useGlobalFilters();
  const hasFilters =
    filters.empresa !== "todos" ||
    filters.origem !== "todos" ||
    filters.pagador !== "todos" ||
    filters.viewMode !== "financeiro";

  return (
    <div className="sticky top-16 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:top-0">
      <div className="mx-auto flex max-w-[1680px] min-w-0 flex-col gap-3 px-3 py-3 sm:px-5 lg:px-8 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-slate-700">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <SlidersHorizontal size={17} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Filtros globais</p>
            <p className="text-sm font-semibold text-slate-800">
              Empresa, origem, responsável pelo pagamento e visualização
            </p>
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:items-end">
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Empresa
            <select
              value={filters.empresa}
              onChange={(event) => setEmpresa(event.target.value as CompanyFilter)}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2 xl:min-w-[150px]"
            >
              <option value="todos">Todas</option>
              <option value="gestaoclick">GestãoClick</option>
              <option value="clicknotas">ClickNotas</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Origem
            <select
              value={filters.origem}
              onChange={(event) => setOrigem(event.target.value as OriginFilter)}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2 xl:min-w-[150px]"
            >
              <option value="todos">Todas</option>
              <option value="gestaoclick">GestãoClick</option>
              <option value="parceiro">Parceiro</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Responsável pelo pagamento
            <select
              value={filters.pagador}
              onChange={(event) => setPagador(event.target.value as PayerFilter)}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2 xl:min-w-[220px]"
            >
              <option value="todos">Todos</option>
              <option value="cliente">Cliente</option>
              <option value="parceiro">Parceiro</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Ver o dashboard como
            <ModeSwitch value={filters.viewMode} onChange={setViewMode} />
          </label>

          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasFilters}
            className="grid h-10 w-full place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 sm:w-10 xl:mb-[1px]"
            title="Limpar filtros"
            aria-label="Limpar filtros"
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("gestao-comercial-sidebar-collapsed") === "1");
    } catch {
      // Mantém o menu aberto.
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Em produção o Next já faz prefetch dos links visíveis, mas deixamos o
    // comportamento explícito para que as páginas do menu fiquem prontas
    // enquanto o usuário lê a tela atual.
    navigation.forEach((item) => router.prefetch(item.href));
  }, [router]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("gestao-comercial-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Não interrompe a navegação.
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">ClickDigital</p>
          <p className="truncate text-base font-semibold text-slate-900">Gestão Comercial</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] border-r border-slate-800 bg-slate-950 text-white shadow-xl transition-all duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 ${collapsed ? "lg:w-[76px]" : "lg:w-[260px]"}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center justify-between border-b border-white/10 px-4">
            <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ClickDigital</p>
              <p className="truncate text-lg font-semibold">Gestão Comercial</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white lg:grid"
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex h-12 items-center rounded-xl px-3 transition ${
                    active
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  } ${collapsed ? "lg:justify-center" : "gap-3"}`}
                >
                  <Icon size={20} className="shrink-0" />
                  <span className={`truncate text-sm font-medium ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className={`min-h-screen min-w-0 overflow-x-hidden transition-[margin] duration-300 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[260px]"}`}>
        {!pathname.startsWith("/intranet-2") && <GlobalFilterBar />}
        {children}
      </main>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const alreadyInsideShell = useContext(ShellNestingContext);

  if (alreadyInsideShell) {
    return <>{children}</>;
  }

  return (
    <ShellNestingContext.Provider value={true}>
      <GlobalFiltersProvider>
        <Shell>{children}</Shell>
      </GlobalFiltersProvider>
    </ShellNestingContext.Provider>
  );
}
