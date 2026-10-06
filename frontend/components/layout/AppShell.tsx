"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
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
  Settings,
  LogOut,
} from "lucide-react";
import {
  GlobalFiltersProvider,
  useGlobalFilters,
  type CompanyFilter,
  type OriginFilter,
  type PayerFilter,
  type ViewMode,
} from "@/contexts/GlobalFiltersContext";
import { clearStoredSession } from "@/lib/auth-storage";

const navigation = [
  { href: "/indicadores", label: "Indicadores", icon: BarChart3 },
  { href: "/faturamento", label: "Faturamento", icon: BadgeDollarSign },
  { href: "/churn", label: "Churn", icon: TrendingDown },
  { href: "/churn-score", label: "Churn Score", icon: Gauge },
  { href: "/ativos-atrasados", label: "Ativos e Atrasados", icon: UsersRound },
  { href: "/upgrade-downgrade", label: "Upgrade e Downgrade", icon: ArrowUpDown },
  { href: "/perfil", label: "Perfil", icon: CircleUserRound },
  { href: "/atendimentos", label: "Atendimentos", icon: Headset },
  // Página de análise do comportamento de pagamento das renovações.
  { href: "/pagamentos", label: "Pagamentos", icon: CreditCard },
  { href: "/vencimentos-futuros", label: "Vencimentos Futuros", icon: CalendarClock },
  { href: "/intranet-2", label: "Intranet 2.0", icon: SearchCheck },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DURATION_OPTIONS = [
  { value: "M", label: "Mensal" },
  { value: "T", label: "Trimestral" },
  { value: "S", label: "Semestral" },
  { value: "A", label: "Anual" },
];

const STATIC_PLAN_OPTIONS = [
  "Bronze", "Prata", "Ouro", "Platina",
  "Essencial", "Profissional", "Intermediário", "Master",
];

function filterCapabilities(pathname: string) {
  const period = [
    "/indicadores",
    "/faturamento", "/churn", "/perfil", "/atendimentos", "/pagamentos", "/vencimentos-futuros", "/upgrade-downgrade", "/upgrade-downgrade",
  ].some((prefix) => pathname.startsWith(prefix));
  const planDuration = [
    "/indicadores",
    "/faturamento", "/churn", "/churn-score", "/ativos-atrasados", "/perfil",
    "/atendimentos", "/pagamentos", "/vencimentos-futuros", "/upgrade-downgrade",
  ].some((prefix) => pathname.startsWith(prefix));
  return { period, planDuration };
}

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

function MonthMultiSelect({
  year,
  months,
  fullYear,
  allowFuture,
  onMonthsChange,
  onFullYear,
}: {
  year: number;
  months: number[];
  fullYear: boolean;
  allowFuture: boolean;
  onMonthsChange: (months: number[]) => void;
  onFullYear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const current = new Date();
  const currentYear = current.getFullYear();
  const currentMonth = current.getMonth() + 1;

  const label = fullYear
    ? "Ano completo"
    : months.length === 1
      ? MONTHS[(months[0] ?? 1) - 1]
      : months.length > 1
        ? `${MONTHS[(months[0] ?? 1) - 1]} a ${MONTHS[(months[months.length - 1] ?? 1) - 1]}`
        : "Selecione";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2 xl:min-w-[180px]"
      >
        {label}
      </button>
      {open ? (
        <div className="absolute right-0 top-[46px] z-[80] w-[260px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <button
            type="button"
            onClick={() => { onFullYear(); setOpen(false); }}
            className={`mb-2 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${fullYear ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
          >
            Ano completo
          </button>
          <p className="mb-2 text-[11px] leading-4 text-slate-400">Clique em um mês e segure Shift para selecionar um intervalo.</p>
          <select
            multiple
            size={8}
            value={fullYear ? [] : months.map(String)}
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.selectedOptions)
                .map((option) => Number(option.value))
                .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12)
                .sort((a, b) => a - b);
              if (!selected.length) return;
              const first = selected[0];
              const last = selected[selected.length - 1];
              const continuous = Array.from({ length: last - first + 1 }, (_, index) => first + index);
              onMonthsChange(continuous);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white p-1 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTHS.map((month, index) => {
              const value = index + 1;
              const disabled = !allowFuture && year === currentYear && value > currentMonth;
              return <option key={month} value={value} disabled={disabled}>{month}</option>;
            })}
          </select>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Aplicar</button>
        </div>
      ) : null}
    </div>
  );
}

function GlobalFilterBar() {
  const pathname = usePathname();
  const {
    filters,
    setEmpresa,
    setOrigem,
    setPagador,
    setViewMode,
    setAno,
    setMeses,
    setAnoCompleto,
    setPlano,
    setDuracao,
    resetFilters,
  } = useGlobalFilters();
  const [plans, setPlans] = useState<string[]>(STATIC_PLAN_OPTIONS);
  const capabilities = filterCapabilities(pathname);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const allowFuture = pathname.startsWith("/vencimentos-futuros");

  useEffect(() => {
    let active = true;
    fetch("http://127.0.0.1:8000/api/vencimentos-futuros/exportar/opcoes", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        if (!active || !Array.isArray(payload?.planos)) return;
        const values = payload.planos.map((item: unknown) => String(item || "").trim()).filter(Boolean);
        if (values.length) setPlans(values);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!capabilities.period || allowFuture || filters.ano !== currentYear || filters.anoCompleto) return;
    const valid = filters.meses.filter((month) => month <= currentMonth);
    if (!valid.length) setMeses([currentMonth]);
    else if (valid.length !== filters.meses.length) setMeses(valid);
  }, [pathname, capabilities.period, allowFuture, filters.ano, filters.anoCompleto, filters.meses, currentYear, currentMonth, setMeses]);

  const hasFilters =
    filters.empresa !== "todos" ||
    filters.origem !== "todos" ||
    filters.pagador !== "todos" ||
    filters.viewMode !== "financeiro" ||
    filters.ano !== currentYear ||
    filters.anoCompleto ||
    filters.meses.length !== 1 ||
    filters.meses[0] !== currentMonth ||
    filters.plano !== "todos" ||
    filters.duracao !== "todos";

  return (
    <div className="sticky top-16 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:top-0">
      <div className="mx-auto flex max-w-[1680px] min-w-0 flex-col gap-3 px-3 py-3 sm:px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-slate-700">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><SlidersHorizontal size={17} /></div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Filtros globais</p>
            <p className="text-sm font-semibold text-slate-800">Período, empresa, origem, responsável pelo pagamento e demais filtros disponíveis na página</p>
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {capabilities.period ? (
            <>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
                Ano
                <select value={filters.ano} onChange={(event) => setAno(Number(event.target.value))} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2">
                  {Array.from({ length: currentYear - 2024 + 1 }, (_, index) => 2024 + index).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
                Mês
                <MonthMultiSelect
                  year={filters.ano}
                  months={filters.meses}
                  fullYear={filters.anoCompleto}
                  allowFuture={allowFuture}
                  onMonthsChange={(months) => { setAnoCompleto(false); setMeses(months); }}
                  onFullYear={() => setAnoCompleto(true)}
                />
              </label>
            </>
          ) : null}

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Empresa
            <select value={filters.empresa} onChange={(event) => setEmpresa(event.target.value as CompanyFilter)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2">
              <option value="todos">Todas</option><option value="gestaoclick">GestãoClick</option><option value="clicknotas">ClickNotas</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Origem
            <select value={filters.origem} onChange={(event) => setOrigem(event.target.value as OriginFilter)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2">
              <option value="todos">Todas</option><option value="gestaoclick">GestãoClick</option><option value="parceiro">Parceiro</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Responsável pelo pagamento
            <select value={filters.pagador} onChange={(event) => setPagador(event.target.value as PayerFilter)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2">
              <option value="todos">Todos</option><option value="cliente">Cliente</option><option value="parceiro">Parceiro</option>
            </select>
          </label>

          {capabilities.planDuration ? (
            <>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
                Plano
                <select value={filters.plano} onChange={(event) => setPlano(event.target.value)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2">
                  <option value="todos">Todos</option>{plans.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
                Duração
                <select value={filters.duracao} onChange={(event) => setDuracao(event.target.value)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2">
                  <option value="todos">Todas</option>{DURATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </>
          ) : null}

          <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
            Ver o dashboard como
            <ModeSwitch value={filters.viewMode} onChange={setViewMode} />
          </label>

          <div className="flex items-end">
            <button type="button" onClick={resetFilters} disabled={!hasFilters} className="grid h-10 w-full place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 sm:w-10" title="Limpar filtros" aria-label="Limpar filtros"><RotateCcw size={17} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { filters } = useGlobalFilters();
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

  function handleLogout() {
    clearStoredSession();
    setMobileOpen(false);
    router.replace("/login");
    router.refresh();
  }

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
          <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">ClickDados</p>
          <p className="truncate text-base font-semibold text-slate-900">ClickDados</p>
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
              <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ClickDados</p>
              <p className="truncate text-lg font-semibold">ClickDados</p>
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

          <div className="border-t border-white/10 p-3">
            <button
              type="button"
              onClick={handleLogout}
              title={collapsed ? "Sair" : undefined}
              aria-label="Sair do sistema"
              className={`flex h-12 w-full items-center rounded-xl px-3 text-slate-400 transition hover:bg-red-500/10 hover:text-red-300 ${
                collapsed ? "lg:justify-center" : "gap-3"
              }`}
            >
              <LogOut size={20} className="shrink-0" />
              <span className={`truncate text-sm font-medium ${collapsed ? "lg:hidden" : ""}`}>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      <main className={`min-h-screen min-w-0 overflow-x-hidden transition-[margin] duration-300 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[260px]"}`}>
        {!pathname.startsWith("/intranet-2") && <GlobalFilterBar />}
        <div key={`${filters.ano}-${filters.anoCompleto ? "ano" : filters.meses.join("-")}-${filters.empresa}-${filters.origem}-${filters.pagador}-${filters.plano}-${filters.duracao}`}>
          {children}
        </div>
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
