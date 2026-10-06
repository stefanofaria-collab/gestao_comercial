"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  CircleHelp,
  Layers3,
  MousePointerClick,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  type CompareMode,
  fetchFaturamentoComponente,
  fetchFaturamentoDetalhes,
  fetchFaturamentoHistorico,
  fetchFaturamentoPlanoDetalhe,
  fetchFaturamentoTotal,
} from "@/lib/faturamento-api";
import type {
  RevenueComparisonItem,
  RevenueComponentDetailResponse,
  RevenueCompositionItem,
  RevenueDetailsResponse,
  RevenueDimensionItem,
  RevenueHistoryPoint,
  RevenuePlanDetailResponse,
  RevenuePlanRankingItem,
  RevenueTotalResponse,
} from "@/types/faturamento";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const MONTHS = [
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

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatMoney(value: number) {
  return money.format(value || 0);
}

function formatCompactMoney(value: number) {
  return compactMoney.format(value || 0);
}

function formatPercent(value: number | null) {
  return value === null || Number.isNaN(value) ? "—" : `${percent.format(value)}%`;
}

function formatCount(value: number) {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatValue(value: number, quantitative: boolean, compact = false) {
  if (quantitative) return formatCount(Math.round(value || 0));
  return compact ? formatCompactMoney(value) : formatMoney(value);
}


type CacheNotice = {
  sourceDate?: string | null;
  sourceYear?: number | null;
  sourceMonth?: number | null;
};

function cacheNoticeFromResponse(value: unknown): CacheNotice | null {
  if (!value || typeof value !== "object") return null;
  const info = (value as {
    _cache_info?: {
      fallback?: boolean;
      refreshing?: boolean;
      source_date?: string | null;
      source_params?: { ano?: number; mes?: number };
    };
  })._cache_info;

  if (!info || (!info.fallback && !info.refreshing)) return null;
  return {
    sourceDate: info.source_date ?? null,
    sourceYear: Number(info.source_params?.ano ?? 0) || null,
    sourceMonth: Number(info.source_params?.mes ?? 0) || null,
  };
}

function LoadingBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-[130px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
      <RefreshCw className="mr-2 animate-spin text-blue-600" size={18} />
      {text}
    </div>
  );
}

function ErrorBlock({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6">{message}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-rose-100"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <div className="relative group inline-flex">
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
        aria-label="Explicação"
      >
        <CircleHelp size={14} />
      </button>
      <div className="pointer-events-none invisible absolute right-0 top-8 z-20 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100">
        {text}
      </div>
    </div>
  );
}

function ClickHint() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
      <MousePointerClick size={12} />
      Clique para ver mais
    </span>
  );
}

function Variation({ value, percentage, quantitative = false }: { value: number; percentage: number | null; quantitative?: boolean }) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${
        positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-500"
      }`}
    >
      {positive && <ArrowUpRight size={15} />}
      {negative && <ArrowDownRight size={15} />}
      {quantitative ? formatCount(value) : formatMoney(value)}
      <span className="font-medium text-slate-400">({formatPercent(percentage)})</span>
    </span>
  );
}

function Kpi({
  title,
  value,
  subtitle,
  helpText,
  variation,
}: {
  title: string;
  value: string;
  subtitle: string;
  helpText: string;
  variation?: { value: number; percentage: number | null; type?: "money" | "count" };
}) {
  const variationLabel =
    variation?.type === "count" ? formatCount(variation.value) : variation ? formatMoney(variation.value) : "";
  const positive = (variation?.value ?? 0) > 0;
  const negative = (variation?.value ?? 0) < 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <HelpTip text={helpText} />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <div className="mt-4 border-t border-slate-100 pt-3">
        {variation && (
          <span
            className={`inline-flex items-center gap-1 text-sm font-semibold ${
              positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-500"
            }`}
          >
            {positive && <ArrowUpRight size={15} />}
            {negative && <ArrowDownRight size={15} />}
            {variationLabel}
            <span className="font-medium text-slate-400">({formatPercent(variation.percentage)})</span>
          </span>
        )}
        <p className={`${variation ? "mt-1" : ""} text-xs text-slate-400`}>{subtitle}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  helpText,
  clickable = false,
}: {
  title: string;
  description?: string;
  helpText: string;
  clickable?: boolean;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-950">{title}</h2>
          {clickable && <ClickHint />}
          <HelpTip text={helpText} />
        </div>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

function DimensionPanel({ title, items, quantitative, helpText }: { title: string; items: RevenueDimensionItem[]; quantitative: boolean; helpText: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader title={title} helpText={helpText} />
      <div className="mt-5 space-y-4">
        {items.length === 0 && <p className="text-sm text-slate-400">Sem dados no período.</p>}
        {items.map((item) => {
          const primary = quantitative ? item.quantidade ?? 0 : item.valor;
          const pct = quantitative ? item.percentual_quantidade ?? 0 : item.percentual;
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="font-semibold text-slate-900">
                  {formatValue(primary, quantitative)} <span className="text-xs text-slate-400">{formatPercent(pct)}</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonList({ items, quantitative = false }: { items: RevenueComparisonItem[]; quantitative?: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.label}-${item.ano ?? ""}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-slate-900">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">
                Atual {formatValue(item.atual, quantitative)} · comparado {formatValue(item.comparado, quantitative)}
              </p>
            </div>
            <Variation value={item.variacao_valor} percentage={item.variacao_percentual} quantitative={quantitative} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Modal({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Detalhamento</p>
            <h3 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

function PlanRanking({ items, onSelect, quantitative }: { items?: RevenuePlanRankingItem[]; onSelect: (plan: string) => void; quantitative: boolean }) {
  const safeItems = Array.isArray(items) ? items : [];
  const getVariation = (item: RevenuePlanRankingItem) => quantitative ? item.variacao_quantidade ?? 0 : item.variacao_valor;
  const maxAbs = Math.max(...safeItems.map((item) => Math.abs(getVariation(item))), 1);

  if (safeItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        Nenhum ranking de planos foi retornado pela API para este recorte.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {safeItems.map((item) => {
        const primaryVariation = getVariation(item);
        const primaryPct = quantitative ? item.variacao_quantidade_percentual ?? null : item.variacao_percentual;
        const current = quantitative ? item.quantidade ?? 0 : item.valor;
        const previous = quantitative ? item.quantidade_anterior ?? 0 : item.valor_anterior;
        const positive = primaryVariation > 0;
        const width = Math.max(3, Math.abs(primaryVariation) / maxAbs * 100);
        return (
          <button
            type="button"
            key={item.nome_plano}
            onClick={() => onSelect(item.nome_plano)}
            className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md lg:flex-row lg:items-center"
          >
            <div className="w-full lg:w-44">
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold text-slate-900">{item.nome_plano}</p>
                <MousePointerClick size={14} className="text-blue-600" />
              </div>
              <p className="text-xs text-slate-400">Clique para abrir o detalhe do plano</p>
            </div>
            <div className="flex-1">
              <div className="relative h-9 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full ${positive ? "bg-emerald-400" : primaryVariation < 0 ? "bg-rose-400" : "bg-slate-300"}`}
                  style={{ width: `${width}%` }}
                />
                <div className="absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-slate-950">
                  {primaryVariation > 0 ? "+" : ""}
                  {formatValue(primaryVariation, quantitative)} ({formatPercent(primaryPct)})
                </div>
              </div>
            </div>
            <div className="w-full text-right text-sm lg:w-72">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Anterior → Atual</p>
              <p className="mt-1 font-medium text-slate-700">
                {formatValue(previous, quantitative)} → <span className="text-lg font-bold text-slate-950">{formatValue(current, quantitative)}</span>
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function FaturamentoDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const { filters } = useGlobalFilters();
  const quantitative = filters.viewMode === "quantitativo";

  const [year, setYear] = useState(filters.ano);
  const [month, setMonth] = useState(filters.anoCompleto ? 0 : (filters.meses[0] ?? currentMonth));
  const [compareMode, setCompareMode] = useState<CompareMode>("mes_completo");

  const [total, setTotal] = useState<RevenueTotalResponse | null>(null);
  const [details, setDetails] = useState<RevenueDetailsResponse | null>(null);
  const [history, setHistory] = useState<RevenueHistoryPoint[]>([]);

  const [totalLoading, setTotalLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [totalError, setTotalError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [cacheNotice, setCacheNotice] = useState<CacheNotice | null>(null);

  const [selectedComponent, setSelectedComponent] = useState<{ key: string; label: string } | null>(null);
  const [componentDetail, setComponentDetail] = useState<RevenueComponentDetailResponse | null>(null);
  const [componentLoading, setComponentLoading] = useState(false);
  const [componentError, setComponentError] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planDetail, setPlanDetail] = useState<RevenuePlanDetailResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planTab, setPlanTab] = useState<"duracao" | "historico">("duracao");
  const [planDetailCache, setPlanDetailCache] = useState<Record<string, RevenuePlanDetailResponse>>({});

  const years = useMemo(() => Array.from({ length: currentYear - 2024 + 1 }, (_, index) => 2024 + index), [currentYear]);

  const currentPeriodDays = useMemo(() => {
    if (month === 0) {
      const start = new Date(year, 0, 1);
      const end = year === currentYear ? new Date(currentYear, currentMonth - 1, currentDay) : new Date(year, 11, 31);
      return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    }
    const isCurrent = year === currentYear && month === currentMonth;
    return isCurrent ? currentDay : new Date(year, month, 0).getDate();
  }, [year, month, currentYear, currentMonth, currentDay]);

  const periodLabel = filters.anoCompleto ? `Ano completo/${filters.ano}` : filters.meses.length > 1 ? `${MONTHS[(filters.meses[0] ?? 1) - 1]} a ${MONTHS[(filters.meses[filters.meses.length - 1] ?? 1) - 1]}/${filters.ano}` : `${MONTHS[(filters.meses[0] ?? month) - 1]}/${filters.ano}`;
  const periodWord = filters.anoCompleto ? "ano" : filters.meses.length > 1 ? "período" : "mês";
  const previousPeriodWord = filters.anoCompleto ? "ano anterior" : filters.meses.length > 1 ? "período anterior" : "mês passado";

  const previousMonthInfo = useMemo(() => {
    const prevDate = new Date(year, month - 2, 1);
    const prevMonthDays = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
    return { year: prevDate.getFullYear(), month: prevDate.getMonth() + 1, days: prevMonthDays };
  }, [year, month]);

  const planCacheBase = `${year}-${month}-${filters.empresa}-${filters.origem}-${filters.pagador}-${compareMode}`;
  const getPlanCacheKey = (plan: string) => `${planCacheBase}-${plan}`;

  useEffect(() => {
    if (year === currentYear && month > currentMonth) {
      setMonth(currentMonth);
      return;
    }

    let active = true;
    setTotal(null);
    setDetails(null);
    setHistory([]);
    setTotalLoading(true);
    setDetailsLoading(true);
    setHistoryLoading(true);
    setTotalError(null);
    setDetailsError(null);
    setHistoryError(null);
    setPlanDetailCache({});
    setCacheNotice(null);

    const captureCacheNotice = (response: unknown) => {
      const notice = cacheNoticeFromResponse(response);
      if (notice && active) setCacheNotice(notice);
    };

    fetchFaturamentoTotal(year, month, filters)
      .then((response) => {
        if (!active) return;
        captureCacheNotice(response);
        setTotal(response);
      })
      .catch((error) => active && setTotalError(error instanceof Error ? error.message : "Erro ao carregar o total."))
      .finally(() => active && setTotalLoading(false));

    fetchFaturamentoDetalhes(year, month, filters)
      .then((response) => {
        if (!active) return;
        captureCacheNotice(response);
        setDetails(response);
      })
      .catch((error) => active && setDetailsError(error instanceof Error ? error.message : "Erro ao carregar os detalhes."))
      .finally(() => active && setDetailsLoading(false));

    fetchFaturamentoHistorico(year, month, filters)
      .then((response) => {
        if (!active) return;
        captureCacheNotice(response);
        setHistory(response.pontos);
      })
      .catch((error) => active && setHistoryError(error instanceof Error ? error.message : "Erro ao carregar o histórico."))
      .finally(() => active && setHistoryLoading(false));

    return () => { active = false; };
  }, [year, month, currentYear, currentMonth, filters, reloadKey]);

  const planRankingItems = useMemo<RevenuePlanRankingItem[]>(() => {
    if (details?.ranking_planos && details.ranking_planos.length > 0) {
      return details.ranking_planos;
    }
    const rankingMap = new Map<string, RevenuePlanRankingItem>();
    for (const row of details?.por_plano ?? []) {
      const current = rankingMap.get(row.nome_plano);
      if (!current) {
        rankingMap.set(row.nome_plano, {
          nome_plano: row.nome_plano,
          valor: row.valor,
          valor_anterior: row.valor_anterior,
          variacao_valor: row.variacao_valor,
          variacao_percentual: row.variacao_percentual,
          quantidade: row.quantidade ?? 0,
          quantidade_anterior: row.quantidade_anterior ?? 0,
          variacao_quantidade: row.variacao_quantidade ?? 0,
          variacao_quantidade_percentual: row.variacao_quantidade_percentual ?? null,
        });
      } else {
        current.valor += row.valor;
        current.valor_anterior += row.valor_anterior;
        current.quantidade = (current.quantidade ?? 0) + (row.quantidade ?? 0);
        current.quantidade_anterior = (current.quantidade_anterior ?? 0) + (row.quantidade_anterior ?? 0);
        current.variacao_valor = current.valor - current.valor_anterior;
        current.variacao_percentual = current.valor_anterior ? (current.variacao_valor / current.valor_anterior) * 100 : null;
        current.variacao_quantidade = (current.quantidade ?? 0) - (current.quantidade_anterior ?? 0);
        current.variacao_quantidade_percentual = (current.quantidade_anterior ?? 0) ? ((current.variacao_quantidade ?? 0) / (current.quantidade_anterior ?? 1)) * 100 : null;
      }
    }
    return Array.from(rankingMap.values()).sort((a, b) => Math.abs(b.variacao_valor) - Math.abs(a.variacao_valor));
  }, [details]);

  useEffect(() => {
    if (!details || planRankingItems.length === 0) return;
    const topPlans = planRankingItems.slice(0, 6);
    topPlans.forEach((item) => {
      const key = getPlanCacheKey(item.nome_plano);
      if (planDetailCache[key]) return;
      fetchFaturamentoPlanoDetalhe(year, month, item.nome_plano, filters, compareMode)
        .then((response) => {
          setPlanDetailCache((current) => (current[key] ? current : { ...current, [key]: response }));
        })
        .catch(() => undefined);
    });
  }, [details, planRankingItems, year, month, filters, compareMode, planDetailCache]);

  useEffect(() => {
    if (!selectedComponent) return;
    let active = true;
    setComponentLoading(true);
    setComponentError(null);
    setComponentDetail(null);

    fetchFaturamentoComponente(year, month, selectedComponent.key, filters, compareMode)
      .then((response) => active && setComponentDetail(response))
      .catch((error) => active && setComponentError(error instanceof Error ? error.message : "Erro ao carregar o detalhamento."))
      .finally(() => active && setComponentLoading(false));

    return () => { active = false; };
  }, [selectedComponent, year, month, filters, compareMode]);

  useEffect(() => {
    if (!selectedPlan) return;
    const key = getPlanCacheKey(selectedPlan);
    const cached = planDetailCache[key];
    if (cached) {
      setPlanDetail(cached);
      setPlanLoading(false);
      setPlanError(null);
      return;
    }

    let active = true;
    setPlanLoading(true);
    setPlanError(null);
    setPlanDetail(null);

    fetchFaturamentoPlanoDetalhe(year, month, selectedPlan, filters, compareMode)
      .then((response) => {
        if (!active) return;
        setPlanDetail(response);
        setPlanDetailCache((current) => ({ ...current, [key]: response }));
      })
      .catch((error) => active && setPlanError(error instanceof Error ? error.message : "Erro ao carregar o plano."))
      .finally(() => active && setPlanLoading(false));

    return () => { active = false; };
  }, [selectedPlan, year, month, filters, compareMode, planDetailCache]);

  const getCompositionPrimary = (item: RevenueCompositionItem) => quantitative ? item.quantidade ?? 0 : item.valor;
  const getCompositionPrevious = (item: RevenueCompositionItem) => quantitative ? item.quantidade_anterior ?? 0 : item.valor_anterior;
  const getCompositionVariation = (item: RevenueCompositionItem) => quantitative ? item.variacao_quantidade ?? 0 : item.variacao_valor;
  const getCompositionVariationPct = (item: RevenueCompositionItem) => quantitative ? item.variacao_quantidade_percentual ?? null : item.variacao_percentual;

  const historyOption = useMemo(() => ({
    tooltip: {
      trigger: "axis",
      formatter: (params: Array<{ axisValue?: string; marker?: string; value?: number }>) => {
        const first = params?.[0];
        if (!first) return "";
        return `${first.axisValue ?? ""}<br/>${first.marker ?? ""}${quantitative ? formatCount(Number(first.value ?? 0)) : formatMoney(Number(first.value ?? 0))}`;
      },
    },
    grid: { left: 20, right: 20, top: 25, bottom: 25, containLabel: true },
    xAxis: { type: "category", data: history.map((point) => point.label), boundaryGap: false },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => quantitative ? formatCount(value) : formatCompactMoney(value) },
      splitLine: { lineStyle: { color: "#e2e8f0" } },
    },
    series: [{ type: "line", data: history.map((point) => quantitative ? point.quantidade_notas ?? 0 : point.faturamento_geral), smooth: true, symbolSize: 7, areaStyle: { opacity: 0.08 }, lineStyle: { width: 3 } }],
  }), [history, quantitative]);

  const planHistoryOption = useMemo(() => {
    if (!planDetail) return null;
    const points = planDetail.historico_12_meses;
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ axisValue?: string; marker?: string; seriesName?: string; value?: number }>) => {
          const rows = Array.isArray(params) ? params : [];
          if (!rows.length) return "";
          const title = rows[0]?.axisValue ?? "";
          const body = rows.map((row) => `${row.marker ?? ""}${row.seriesName ?? ""}: ${quantitative ? formatCount(Number(row.value ?? 0)) : formatMoney(Number(row.value ?? 0))}`).join("<br/>");
          return `${title}<br/>${body}`;
        },
      },
      grid: { left: 20, right: 20, top: 25, bottom: 25, containLabel: true },
      xAxis: { type: "category", data: points.map((item) => item.label), boundaryGap: false },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (value: number) => quantitative ? formatCount(value) : formatCompactMoney(value) },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      legend: { top: 0 },
      series: quantitative
        ? [{ name: "Total de notas", type: "line", smooth: true, data: points.map((item) => item.quantidade_notas ?? 0) }]
        : [
            { name: "Mensal", type: "line", smooth: true, data: points.map((item) => item.Mensal) },
            { name: "Trimestral", type: "line", smooth: true, data: points.map((item) => item.Trimestral) },
            { name: "Semestral", type: "line", smooth: true, data: points.map((item) => item.Semestral) },
            { name: "Anual", type: "line", smooth: true, data: points.map((item) => item.Anual) },
          ],
    };
  }, [planDetail, quantitative]);

  const funnelOption = useMemo(() => {
    const items = details?.composicao.filter((item) => getCompositionPrimary(item) > 0) ?? [];
    return {
      tooltip: { trigger: "item", formatter: (params: { name: string; value: number }) => `${params.name}<br/>${formatValue(params.value, quantitative)}` },
      series: [{
        type: "funnel",
        left: "6%",
        top: 20,
        bottom: 20,
        width: "88%",
        gap: 6,
        sort: "descending",
        minSize: "12%",
        label: {
          show: true,
          position: "inside",
          color: "#0f172a",
          fontSize: 15,
          fontWeight: 700,
          formatter: (params: { name: string; value: number }) => `${params.name}\n${formatValue(params.value, quantitative, true)}`,
        },
        labelLine: { show: false },
        itemStyle: { borderColor: "#ffffff", borderWidth: 2, opacity: 0.95 },
        data: items.map((item) => ({ name: item.label, value: getCompositionPrimary(item) })),
      }],
    };
  }, [details, quantitative]);

  const currentLabel = quantitative ? "quantidade" : "valor";

  return (
    <div className="p-5 lg:p-8">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Faturamento</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Aqui você consegue entender de onde veio o resultado do mês e onde ele subiu ou caiu. O modo financeiro mostra dinheiro. O modo quantitativo mostra quantidades.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <CalendarDays size={18} className="text-slate-400" />
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none">
                <option value={0}>Ano completo</option>
                {MONTHS.map((label, index) => (
                  <option key={label} value={index + 1} disabled={year === currentYear && index + 1 > currentMonth}>{label}</option>
                ))}
              </select>
              <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none">
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comparação com anos anteriores</p>
                <HelpTip text="Escolha como os meses antigos devem ser comparados. Em 'mês completo', o sistema pega o mês todo. Em 'mesmo período atual', ele pega só até o mesmo dia do mês atual." />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <select value={compareMode} onChange={(event) => setCompareMode(event.target.value as CompareMode)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 outline-none">
                  <option value="mes_completo">Mês completo</option>
                  <option value="mesmo_periodo_atual">Mesmo período atual</option>
                </select>
                <span className="max-w-[320px] text-xs text-slate-400">Essa regra afeta os comparativos com 2025 e 2024 nos detalhes.</span>
              </div>
            </div>
          </div>
        </div>

        {cacheNotice && (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Os dados do período atual estão sendo atualizados.</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Para não deixar o dashboard indisponível, estamos exibindo o último snapshot disponível
                {cacheNotice.sourceMonth && cacheNotice.sourceYear
                  ? ` (${MONTHS[cacheNotice.sourceMonth - 1]}/${cacheNotice.sourceYear})`
                  : ""}
                {cacheNotice.sourceDate ? `, salvo em ${cacheNotice.sourceDate.split("-").reverse().join("/")}` : ""}.
                A atualização do novo período continua em segundo plano.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Verificar atualização
            </button>
          </div>
        )}

        {totalLoading && <LoadingBlock text="Buscando o resumo principal do mês..." />}
        {totalError && <ErrorBlock title="Não foi possível consultar o resumo principal" message={totalError} retry={() => setReloadKey((value) => value + 1)} />}

        {total && !quantitative && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi title={`Quanto entrou neste ${periodWord}`} value={formatMoney(total.faturamento_geral)} subtitle={total.periodo.parcial ? "O mês ainda está em andamento." : "Total emitido no mês escolhido."} helpText="Este cartão mostra quanto dinheiro entrou no mês escolhido. Pense nele como a soma de todas as notas emitidas nesse período." variation={{ value: total.variacao_mes_anterior_valor, percentage: total.variacao_mes_anterior_percentual }} />
            <Kpi title={`Quanto entrou no ${previousPeriodWord}`} value={formatMoney(total.mes_anterior?.faturamento_geral ?? 0)} subtitle="Serve como base de comparação." helpText="Aqui você vê quanto entrou no mês anterior. Isso ajuda a comparar se o valor deste mês subiu ou caiu." />
            <Kpi title="Quantas notas foram emitidas" value={formatCount(total.quantidade_notas)} subtitle="Quantidade de notas no mês." helpText="Este cartão conta quantas notas foram emitidas no período. Ele não mostra dinheiro, mostra quantidade." variation={{ value: total.variacao_notas_valor, percentage: total.variacao_notas_percentual, type: "count" }} />
            <Kpi title="Valor médio por nota" value={formatMoney(total.ticket_medio)} subtitle="Média de dinheiro por nota emitida." helpText="Aqui você vê o valor médio de cada nota. É como pegar todo o dinheiro do mês e dividir pelo número de notas emitidas." variation={{ value: total.variacao_ticket_valor, percentage: total.variacao_ticket_percentual }} />
          </div>
        )}

        {total && quantitative && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi title={`Quantas notas saíram neste ${periodWord}`} value={formatCount(total.quantidade_notas)} subtitle="Total de notas no mês escolhido." helpText="Este cartão mostra quantas notas foram emitidas no mês. Aqui o foco é quantidade, não dinheiro." variation={{ value: total.variacao_notas_valor, percentage: total.variacao_notas_percentual, type: "count" }} />
            <Kpi title={`Quantas notas saíram no ${previousPeriodWord}`} value={formatCount(total.mes_anterior?.quantidade_notas ?? 0)} subtitle="Base usada para comparar." helpText="Aqui você vê quantas notas saíram no mês anterior para comparar com o mês atual." />
            <Kpi title="Média de notas por dia" value={formatCount(Math.round(total.quantidade_notas / Math.max(1, currentPeriodDays)))} subtitle={`Considerando ${currentPeriodDays} dia(s) neste recorte.`} helpText="Este cartão mostra a média de notas emitidas por dia dentro do período analisado." />
            <Kpi title={`Diferença de notas contra o ${previousPeriodWord}`} value={`${(total.variacao_notas_valor > 0 ? "+" : "")}${formatCount(total.variacao_notas_valor)}`} subtitle="Mostra se a quantidade subiu ou caiu." helpText="Aqui você vê a diferença de quantidade de notas entre o mês atual e o mês anterior. Se estiver positivo, saíram mais notas. Se estiver negativo, saíram menos notas." variation={{ value: total.variacao_notas_valor, percentage: total.variacao_notas_percentual, type: "count" }} />
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            {detailsLoading && <LoadingBlock text="Carregando a composição do resultado do mês..." />}
            {detailsError && <ErrorBlock title="Não foi possível carregar a composição do mês" message={detailsError} retry={() => setReloadKey((value) => value + 1)} />}
            {details && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeader
                  title={quantitative ? "Como a quantidade do mês se divide" : "Como o dinheiro do mês se divide"}
                  description={quantitative ? "Mostra quantas notas há em cada grupo principal." : "Mostra quanto dinheiro existe em cada grupo principal."}
                  helpText={quantitative ? "Este gráfico mostra como a quantidade de notas do mês está dividida entre os grupos principais, como renovações e novos clientes." : "Este gráfico mostra como o dinheiro do mês está dividido entre os grupos principais, como renovações e novos clientes."}
                />
                <ReactECharts option={funnelOption} style={{ height: 380 }} />
              </div>
            )}
          </div>

          <div>
            {details && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeader title={quantitative ? "Em quais partes a quantidade subiu ou caiu" : "Em quais partes o valor subiu ou caiu"} helpText={quantitative ? "Cada linha mostra um grupo do negócio e se a quantidade de notas subiu ou caiu em relação ao mês passado." : "Cada linha mostra um grupo do negócio e se o dinheiro desse grupo subiu ou caiu em relação ao mês passado."} clickable />
                <div className="mt-4 divide-y divide-slate-100">
                  {details.composicao.map((item) => (
                    <button type="button" key={item.chave} onClick={() => setSelectedComponent({ key: item.chave, label: item.label })} className="grid w-full grid-cols-[1fr_auto] gap-4 py-3 text-left transition hover:bg-slate-50">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                          <MousePointerClick size={13} className="text-blue-600" />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Atual {formatValue(getCompositionPrimary(item), quantitative)} · anterior {formatValue(getCompositionPrevious(item), quantitative)}</p>
                      </div>
                      <Variation value={getCompositionVariation(item)} percentage={getCompositionVariationPct(item)} quantitative={quantitative} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {details && (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <DimensionPanel title={quantitative ? "Quantas notas vieram de cada empresa" : "Quanto veio de cada empresa"} items={details.origens.por_empresa} quantitative={quantitative} helpText={quantitative ? "Aqui você vê quantas notas vieram de cada empresa, como GestãoClick, ClickNotas, CertClick e Serviços prestados." : "Aqui você vê quanto dinheiro veio de cada empresa, como GestãoClick, ClickNotas, CertClick e Serviços prestados."} />
            <DimensionPanel title={quantitative ? "Quantas notas vieram de cada origem" : "Quanto veio de cada origem"} items={details.origens.por_origem} quantitative={quantitative} helpText={quantitative ? "Este quadro mostra quantas notas vieram da origem GestãoClick e quantas vieram de Parceiros." : "Este quadro mostra quanto dinheiro veio da origem GestãoClick e quanto veio de Parceiros."} />
            <DimensionPanel title={quantitative ? "Quem pagou mais notas" : "Quem pagou mais"} items={details.origens.por_pagador} quantitative={quantitative} helpText={quantitative ? "Este quadro mostra quantas notas foram pagas pelo cliente e quantas foram pagas pelo parceiro." : "Este quadro mostra quanto dinheiro foi pago pelo cliente e quanto foi pago pelo parceiro."} />
          </div>
        )}

        <div className="mt-6">
          {historyLoading && <LoadingBlock text="Carregando o histórico mês a mês desde 2024..." />}
          {historyError && <ErrorBlock title="Não foi possível carregar o histórico" message={historyError} retry={() => setReloadKey((value) => value + 1)} />}
          {!historyLoading && !historyError && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader title={quantitative ? "Como a quantidade mudou mês a mês" : "Como o valor mudou mês a mês"} helpText={quantitative ? "Este gráfico mostra a quantidade de notas emitidas em cada mês, desde 2024 até o período escolhido." : "Este gráfico mostra o faturamento de cada mês, desde 2024 até o período escolhido."} />
              <ReactECharts option={historyOption} style={{ height: 330 }} />
            </div>
          )}
        </div>

        {details && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
            <SectionHeader title={quantitative ? "Quais planos mais subiram ou caíram em quantidade" : "Quais planos mais subiram ou caíram em valor"} helpText={quantitative ? "Cada linha mostra um plano. Ao clicar, você vê os detalhes de quantidade por duração, histórico e comparações." : "Cada linha mostra um plano. Ao clicar, você vê os detalhes de valor por duração, histórico e comparações."} clickable />
            <PlanRanking items={planRankingItems} onSelect={(plan) => { setSelectedPlan(plan); setPlanTab("duracao"); }} quantitative={quantitative} />
          </div>
        )}
      </div>

      <Modal open={Boolean(selectedComponent)} title={selectedComponent?.label ?? ""} subtitle={`Período: ${periodLabel} · modo: ${month === 0 ? "ano acumulado" : compareMode === "mesmo_periodo_atual" ? "mesmo período atual" : "mês completo"}`} onClose={() => { setSelectedComponent(null); setComponentDetail(null); setComponentError(null); }}>
        {componentLoading && <LoadingBlock text="Carregando comparativos desse grupo..." />}
        {componentError && <ErrorBlock title="Não foi possível carregar o detalhamento" message={componentError} retry={() => setSelectedComponent(selectedComponent ? { ...selectedComponent } : null)} />}
        {componentDetail && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Kpi title={quantitative ? "Quantidade atual" : "Valor atual"} value={quantitative ? formatCount(componentDetail.resumo.quantidade_notas) : formatMoney(componentDetail.resumo.valor)} subtitle={quantitative ? "Quantidade no mês selecionado." : "Valor no mês selecionado."} helpText={quantitative ? "Aqui você vê quantas notas existem neste grupo no mês escolhido." : "Aqui você vê quanto dinheiro existe neste grupo no mês escolhido."} />
              <Kpi title="Notas emitidas" value={formatCount(componentDetail.resumo.quantidade_notas)} subtitle="Quantidade de notas nesse grupo." helpText="Este cartão conta quantas notas fazem parte deste grupo." />
              <Kpi title="Valor médio por nota" value={formatMoney(componentDetail.resumo.ticket_medio)} subtitle="Média de dinheiro por nota desse grupo." helpText="Este cartão mostra o valor médio de cada nota dentro deste grupo." />
            </div>

            <div>
              <h4 className="mb-3 text-lg font-semibold text-slate-950">{month === 0 ? "Comparação em valor com o ano anterior" : "Comparação em valor com o mês passado"}</h4>
              <ComparisonList items={[componentDetail.variacoes.mes_anterior]} />
            </div>

            <div>
              <h4 className="mb-3 text-lg font-semibold text-slate-950">Comparação em valor do ano atual com anos anteriores</h4>
              <ComparisonList items={componentDetail.variacoes.acumulado_ano} />
            </div>

            <div>
              <h4 className="mb-3 text-lg font-semibold text-slate-950">{month === 0 ? "Comparação em valor com os anos anteriores" : "Comparação em valor do mês atual com o mesmo mês de outros anos"}</h4>
              <ComparisonList items={componentDetail.variacoes.mesmo_mes} />
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selectedPlan)} title={selectedPlan ?? ""} subtitle={`Período: ${periodLabel} · modo: ${month === 0 ? "ano acumulado" : compareMode === "mesmo_periodo_atual" ? "mesmo período atual" : "mês completo"}`} onClose={() => { setSelectedPlan(null); setPlanDetail(null); setPlanError(null); }}>
        {planLoading && <LoadingBlock text="Carregando detalhe do plano..." />}
        {planError && <ErrorBlock title="Não foi possível carregar o plano" message={planError} retry={() => setSelectedPlan((current) => current ? `${current}` : current)} />}
        {planDetail && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Kpi title={quantitative ? "Quantidade atual" : "Valor atual"} value={formatValue(quantitative ? planDetail.resumo.quantidade ?? 0 : planDetail.resumo.atual, quantitative)} subtitle={quantitative ? `Quantidade do plano no ${periodWord}.` : `Faturamento do plano no ${periodWord}.`} helpText={quantitative ? "Este cartão mostra a quantidade do plano no mês selecionado." : "Este cartão mostra o valor do plano no mês selecionado."} variation={{ value: quantitative ? planDetail.resumo.variacao_quantidade ?? 0 : planDetail.resumo.variacao_valor, percentage: quantitative ? planDetail.resumo.variacao_quantidade_percentual ?? null : planDetail.resumo.variacao_percentual, type: quantitative ? "count" : "money" }} />
              <Kpi title={quantitative ? `Quantidade no ${previousPeriodWord}` : `Valor no ${previousPeriodWord}`} value={formatValue(quantitative ? planDetail.resumo.quantidade_anterior ?? 0 : planDetail.resumo.anterior, quantitative)} subtitle="Base usada para comparar." helpText="Aqui você vê a base do mês anterior para comparar com o mês atual." />
              <Kpi title="Modo de comparação" value={compareMode === "mesmo_periodo_atual" ? "Mesmo período" : "Mês completo"} subtitle="Afeta os comparativos com 2025 e 2024." helpText="Aqui você vê a regra que está sendo usada para comparar o mês atual com os anos anteriores." />
            </div>

            <div className="border-b border-slate-200">
              <div className="flex gap-6 text-sm font-semibold">
                <button type="button" onClick={() => setPlanTab("duracao")} className={`border-b-2 pb-3 ${planTab === "duracao" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"}`}>Por duração</button>
                <button type="button" onClick={() => setPlanTab("historico")} className={`border-b-2 pb-3 ${planTab === "historico" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"}`}>Evolução 12 meses</button>
              </div>
            </div>

            {planTab === "duracao" && (
              <div className="space-y-6">
                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-950">Como esse plano ficou em cada duração</h4>
                  <div className="space-y-3">
                    {planDetail.por_duracao.map((item) => {
                      const primaryVariation = quantitative ? item.variacao_quantidade ?? 0 : item.variacao_valor;
                      const primaryPct = quantitative ? item.variacao_quantidade_percentual ?? null : item.variacao_percentual;
                      const previous = quantitative ? item.quantidade_anterior ?? 0 : item.anterior;
                      const current = quantitative ? item.quantidade ?? 0 : item.atual;
                      const positive = primaryVariation > 0;
                      const width = Math.max(4, Math.min(100, Math.abs(primaryPct ?? 0) * 3));
                      return (
                        <div key={item.duracao_label} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <div className="w-full lg:w-40">
                              <p className="text-2xl font-bold text-slate-900">{item.duracao_label}</p>
                              <p className="text-xs uppercase tracking-wide text-slate-400">{item.duracao || "—"}</p>
                            </div>
                            <div className="flex-1">
                              <div className="relative h-9 overflow-hidden rounded-full bg-slate-100">
                                <div className={`absolute left-0 top-0 h-full rounded-full ${positive ? "bg-emerald-400" : primaryVariation < 0 ? "bg-rose-400" : "bg-slate-300"}`} style={{ width: `${width}%` }} />
                                <div className="absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-slate-950">
                                  {primaryVariation > 0 ? "+" : ""}{formatValue(primaryVariation, quantitative)} ({formatPercent(primaryPct)})
                                </div>
                              </div>
                            </div>
                            <div className="w-full text-right text-sm lg:w-80">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Anterior → Atual</p>
                              <p className="mt-1 font-medium text-slate-700">
                                {formatValue(previous, quantitative)} → <span className="text-lg font-bold text-slate-950">{formatValue(current, quantitative)}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-950">Comparações do plano em valor</h4>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-700">Em relação ao mês passado</p>
                      <ComparisonList items={[planDetail.variacoes.mes_anterior]} />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-700">Acumulado do ano</p>
                      <ComparisonList items={planDetail.variacoes.acumulado_ano} />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-700">Mesmo mês de anos anteriores</p>
                      <ComparisonList items={planDetail.variacoes.mesmo_mes} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {planTab === "historico" && planHistoryOption && (
              <div>
                <h4 className="mb-3 text-lg font-semibold text-slate-950">Como esse plano se comportou nos últimos 12 meses</h4>
                <ReactECharts option={planHistoryOption} style={{ height: 360 }} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
