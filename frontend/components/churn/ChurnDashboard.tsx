"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  CircleHelp,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  MousePointerClick,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchChurnDashboard, fetchChurnRenewalHistory } from "@/lib/churn-api";
import type {
  ChurnBucket,
  ChurnClient,
  ChurnDashboardResponse,
  ChurnDimension,
  ChurnPlan,
  ChurnRenewalAverage,
  ChurnRenewalHistoryResponse,
  ChurnUtmRanking,
} from "@/types/churn";

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

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatMoney(value: number) {
  return currency.format(value || 0);
}

function formatInteger(value: number) {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatPercent(value: number) {
  return `${percent.format(value || 0)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatTenure(months: number) {
  if (months < 12) return `${percent.format(months)} meses`;
  return `${percent.format(months / 12)} anos`;
}

function tenureBucketLabel(months: number) {
  if (months <= 3) return "Até 3 meses";
  if (months <= 6) return "4 a 6 meses";
  if (months <= 12) return "7 a 12 meses";
  if (months <= 24) return "1 a 2 anos";
  if (months <= 36) return "2 a 3 anos";
  if (months <= 60) return "3 a 5 anos";
  return "Mais de 5 anos";
}

function exactTenureLabel(months: number) {
  if (months <= 12) {
    if (months <= 0) return "Menos de 1 mês";
    return months === 1 ? "1 mês" : `${Math.round(months)} meses`;
  }
  const completedYears = Math.floor(months / 12);
  return completedYears === 1 ? "1 ano" : `${completedYears} anos`;
}

function exactTenureOrder(months: number) {
  if (months <= 12) return Math.max(0, Math.round(months));
  return Math.floor(months / 12) * 12;
}

function HelpTip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Explicação"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
      >
        <CircleHelp size={14} />
      </button>
      <div className="pointer-events-none invisible absolute right-0 top-8 z-30 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
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

function LoadingBlock() {
  return (
    <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw size={24} className="mx-auto animate-spin text-blue-600" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Carregando a análise de churn...</p>
        <p className="mt-1 text-xs text-slate-400">Buscando somente clientes com 60 dias ou mais de atraso.</p>
      </div>
    </div>
  );
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Não foi possível carregar o churn</p>
          <p className="mt-2 text-sm leading-6">{message}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-rose-100"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, subtitle, helpText }: { title: string; value: string; subtitle: string; helpText: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <HelpTip text={helpText} />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">{subtitle}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle, helpText, clickable = false }: { title: string; subtitle?: string; helpText: string; clickable?: boolean }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        {clickable && <ClickHint />}
        <HelpTip text={helpText} />
      </div>
      {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
    </div>
  );
}

function BarList({
  items,
  value,
  formatValue,
  onClick,
}: {
  items: { key: string; label: string; item: unknown }[];
  value: (item: unknown) => number;
  formatValue: (value: number) => string;
  onClick?: (item: unknown) => void;
}) {
  const max = Math.max(...items.map((row) => value(row.item)), 1);
  return (
    <div className="space-y-3">
      {items.map((row) => {
        const current = value(row.item);
        const clickable = Boolean(onClick);
        const content = (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-semibold text-slate-800">
                {row.label}
                {clickable && <MousePointerClick size={13} className="text-blue-600" />}
              </span>
              <span className="font-semibold text-slate-950">{formatValue(current)}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, (current / max) * 100)}%` }} />
            </div>
          </>
        );
        if (onClick) {
          return (
            <button
              type="button"
              key={row.key}
              onClick={() => onClick(row.item)}
              className="w-full rounded-xl px-2 py-2 text-left transition hover:bg-slate-50"
            >
              {content}
            </button>
          );
        }
        return <div key={row.key} className="px-2 py-2">{content}</div>;
      })}
    </div>
  );
}

function DimensionCard({ title, items, financial }: { title: string; items: ChurnDimension[]; financial: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionTitle
        title={title}
        helpText={financial ? "Mostra quanto LTV está ligado aos clientes perdidos em cada grupo." : "Mostra quantos clientes perdidos existem em cada grupo."}
      />
      <BarList
        items={items.map((item) => ({ key: item.label, label: item.label, item }))}
        value={(raw) => financial ? (raw as ChurnDimension).ltv_total : (raw as ChurnDimension).clientes}
        formatValue={(number) => financial ? formatMoney(number) : formatInteger(number)}
      />
    </div>
  );
}


function UtmRankingCard({ ranking, financial }: { ranking: ChurnUtmRanking; financial: boolean }) {
  const ordered = [...(ranking.itens ?? [])]
    .sort((a, b) => financial
      ? (b.valor_perdido - a.valor_perdido) || (b.clientes - a.clientes)
      : (b.clientes - a.clientes) || (b.valor_perdido - a.valor_perdido))
    .slice(0, 10);
  const maxValue = Math.max(
    ...ordered.map((item) => financial ? item.valor_perdido : item.clientes),
    1,
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{ranking.prioridade}</span>
            <h3 className="font-semibold text-slate-950">{ranking.label}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">Cobertura: {formatPercent(ranking.cobertura_clientes)} dos clientes em churn.</p>
        </div>
        <HelpTip text={financial ? "Ordena os valores desta UTM pelo valor mensal perdido no churn. A quantidade de clientes aparece como apoio." : "Ordena os valores desta UTM pela quantidade de clientes que entraram em churn. O valor mensal perdido aparece como apoio."} />
      </div>

      {ordered.length ? (
        <div className="space-y-3">
          {ordered.map((item, index) => {
            const current = financial ? item.valor_perdido : item.clientes;
            return (
              <div key={`${ranking.field}-${item.label}`} className="rounded-xl border border-slate-100 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800" title={item.label}>{index + 1}. {item.label}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatInteger(item.clientes)} clientes · {formatMoney(item.valor_perdido)}/mês</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-950">{financial ? formatMoney(item.valor_perdido) : formatInteger(item.clientes)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, (current / maxValue) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">Sem informações preenchidas para esta UTM no período.</div>
      )}
    </div>
  );
}

type SortKey =
  | "cliente"
  | "empresa"
  | "origem"
  | "pagador"
  | "nome_plano"
  | "duracao_label"
  | "churn_em"
  | "dias_vencido"
  | "meses_cliente"
  | "renovacoes"
  | "ltv";

type SortDirection = "asc" | "desc";

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortKey;
  activeColumn: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeColumn === column;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1.5 font-semibold transition hover:text-slate-950 ${align === "right" ? "ml-auto" : ""}`}
        title="Clique para ordenar esta coluna"
      >
        {label}
        <Icon size={13} className={active ? "text-blue-600" : "text-slate-300"} />
      </button>
    </th>
  );
}

function intranetUrl(empresaId: number) {
  return `https://intranet.clickdigital.com.br/clientes/visualizar/${empresaId}?aba=5`;
}

const CHURN_EXPORT_COLUMNS = [
  "ID", "Cliente", "Empresa", "Origem", "Pagador", "Plano", "Duração",
  "Vencimento", "Data do churn", "Tempo (meses)", "Renovações", "LTV", "Intranet",
];

function churnClientRows(clients: ChurnClient[]) {
  return clients.map((client) => [
    client.empresa_id,
    client.cliente,
    client.empresa,
    client.origem,
    client.pagador,
    client.nome_plano,
    client.duracao_label,
    client.data_vencimento ?? "",
    client.churn_em ?? "",
    client.meses_cliente,
    client.renovacoes,
    client.ltv,
    intranetUrl(client.empresa_id),
  ]);
}

function downloadChurnCsv(clients: ChurnClient[], filename: string) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = churnClientRows(clients);
  const content = `\uFEFF${CHURN_EXPORT_COLUMNS.map(escape).join(";")}\r\n${lines.map((row) => row.map(escape).join(";")).join("\r\n")}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadChurnXlsx(clients: ChurnClient[], filename: string) {
  const XLSX = await import("xlsx");
  const payload = churnClientRows(clients).map((row) => Object.fromEntries(CHURN_EXPORT_COLUMNS.map((column, index) => [column, row[index]])));
  const worksheet = XLSX.utils.json_to_sheet(payload);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
  XLSX.writeFile(workbook, filename);
}

async function copyChurnSheets(clients: ChurnClient[]) {
  const rows = churnClientRows(clients).map((row) => row.map((value) => String(value ?? "").replaceAll("\t", " ").replaceAll("\n", " ")).join("\t"));
  await navigator.clipboard.writeText([CHURN_EXPORT_COLUMNS.join("\t"), ...rows].join("\n"));
  window.open("https://sheets.new", "_blank", "noopener,noreferrer");
}

function Modal({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Detalhamento</p>
            <h3 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}

export default function ChurnDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const { filters } = useGlobalFilters();
  const financial = filters.viewMode === "financeiro";
  const empresaFilter = filters.empresa;
  const origemFilter = filters.origem;
  const pagadorFilter = filters.pagador;

  const [year, setYear] = useState(filters.ano);
  const [month, setMonth] = useState(filters.anoCompleto ? 0 : (filters.meses[0] ?? currentMonth));
  const [data, setData] = useState<ChurnDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<ChurnPlan | null>(null);
  const [selectedPlanDuration, setSelectedPlanDuration] = useState<string>("todos");
  const [selectedClient, setSelectedClient] = useState<ChurnClient | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("ltv");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedTenureBucket, setSelectedTenureBucket] = useState<ChurnBucket | null>(null);
  const [selectedExactTenure, setSelectedExactTenure] = useState<string | null>(null);
  const [selectedRenewalAverage, setSelectedRenewalAverage] = useState<{ dimension: "plano" | "duracao"; item: ChurnRenewalAverage } | null>(null);
  const [renewalHistory, setRenewalHistory] = useState<ChurnRenewalHistoryResponse | null>(null);
  const [renewalHistoryLoading, setRenewalHistoryLoading] = useState(false);
  const [renewalHistoryError, setRenewalHistoryError] = useState<string | null>(null);

  const years = useMemo(() => Array.from({ length: currentYear - 2024 + 1 }, (_, index) => 2024 + index), [currentYear]);
  const periodLabel = filters.anoCompleto ? `Ano completo de ${filters.ano}` : filters.meses.length > 1 ? `${MONTHS[(filters.meses[0] ?? 1) - 1]} a ${MONTHS[(filters.meses[filters.meses.length - 1] ?? 1) - 1]} de ${filters.ano}` : `${MONTHS[(filters.meses[0] ?? month) - 1]} de ${filters.ano}`;

  function handleSort(column: SortKey) {
    setPage(1);
    if (sortKey === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDirection("desc");
  }

  useEffect(() => {
    if (year === currentYear && month > currentMonth) {
      setMonth(currentMonth);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setPage(1);

    fetchChurnDashboard(year, month, filters)
      .then((response) => active && setData(response))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Erro ao carregar o churn."))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [year, month, currentYear, currentMonth, empresaFilter, origemFilter, pagadorFilter, reloadKey]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!data) return [];
    if (!term) return data.clientes;
    return data.clientes.filter((client) =>
      `${client.cliente} ${client.empresa_id} ${client.nome_plano} ${client.empresa} ${client.origem} ${client.pagador}`.toLowerCase().includes(term),
    );
  }, [data, search]);

  const sortedClients = useMemo(() => {
    const rows = [...filteredClients];
    rows.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];

      let comparison = 0;
      if (typeof left === "number" && typeof right === "number") {
        comparison = left - right;
      } else {
        comparison = String(left ?? "").localeCompare(String(right ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return rows;
  }, [filteredClients, sortKey, sortDirection]);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(sortedClients.length / pageSize));
  const visibleClients = sortedClients.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selectedPlanClients = useMemo(() => {
    if (!data || !selectedPlan) return [];
    return data.clientes.filter((client) =>
      client.nome_plano === selectedPlan.nome_plano &&
      (selectedPlanDuration === "todos" || client.duracao === selectedPlanDuration),
    );
  }, [data, selectedPlan, selectedPlanDuration]);

  const selectedPlanDurations = useMemo(() => {
    if (!data || !selectedPlan) return [];
    const grouped = new Map<string, { duracao: string; label: string; clientes: number; ltv: number; valor: number }>();
    for (const client of data.clientes) {
      if (client.nome_plano !== selectedPlan.nome_plano) continue;
      const current = grouped.get(client.duracao) ?? { duracao: client.duracao, label: client.duracao_label, clientes: 0, ltv: 0, valor: 0 };
      current.clientes += 1;
      current.ltv += client.ltv;
      current.valor += client.valor_perdido;
      grouped.set(client.duracao, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.clientes - a.clientes || b.ltv - a.ltv);
  }, [data, selectedPlan]);

  useEffect(() => {
    setSelectedPlanDuration("todos");
  }, [selectedPlan]);

  const tenureDetail = useMemo(() => {
    if (!data || !selectedTenureBucket) return [];
    const grouped = new Map<string, { label: string; order: number; clientes: number; ltv: number; valor_perdido: number }>();

    for (const client of data.clientes) {
      if (tenureBucketLabel(client.meses_cliente) !== selectedTenureBucket.label) continue;
      const label = exactTenureLabel(client.meses_cliente);
      const order = exactTenureOrder(client.meses_cliente);
      const current = grouped.get(label) ?? { label, order, clientes: 0, ltv: 0, valor_perdido: 0 };
      current.clientes += 1;
      current.ltv += client.ltv;
      current.valor_perdido += client.valor_perdido;
      grouped.set(label, current);
    }

    return Array.from(grouped.values()).sort((a, b) => a.order - b.order);
  }, [data, selectedTenureBucket]);

  const exactTenureClients = useMemo(() => {
    if (!data || !selectedTenureBucket || !selectedExactTenure) return [];
    return data.clientes.filter((client) =>
      tenureBucketLabel(client.meses_cliente) === selectedTenureBucket.label &&
      exactTenureLabel(client.meses_cliente) === selectedExactTenure,
    );
  }, [data, selectedTenureBucket, selectedExactTenure]);

  useEffect(() => {
    if (!selectedRenewalAverage) {
      setRenewalHistory(null);
      setRenewalHistoryError(null);
      return;
    }

    let active = true;
    setRenewalHistoryLoading(true);
    setRenewalHistoryError(null);
    setRenewalHistory(null);

    fetchChurnRenewalHistory(
      year,
      month,
      selectedRenewalAverage.dimension,
      selectedRenewalAverage.item.value,
      filters,
    )
      .then((response) => active && setRenewalHistory(response))
      .catch((reason) => active && setRenewalHistoryError(reason instanceof Error ? reason.message : "Erro ao carregar a evolução."))
      .finally(() => active && setRenewalHistoryLoading(false));

    return () => { active = false; };
  }, [selectedRenewalAverage, year, month, empresaFilter, origemFilter, pagadorFilter]);

  const renewalHistoryOption = useMemo(() => {
    if (!renewalHistory) return null;
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ axisValue: string; data: number; dataIndex: number }>) => {
          const first = params?.[0];
          if (!first) return "";
          const point = renewalHistory.pontos[first.dataIndex];
          return `${first.axisValue}<br/><strong>${percent.format(first.data)} renovações em média</strong><br/>${formatInteger(point?.clientes ?? 0)} cliente(s) em churn`;
        },
      },
      grid: { left: 20, right: 20, top: 25, bottom: 25, containLabel: true },
      xAxis: { type: "category", data: renewalHistory.pontos.map((point) => point.label), boundaryGap: false },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { formatter: (value: number) => percent.format(value) },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      series: [
        {
          name: "Renovações médias",
          type: "line",
          smooth: true,
          symbolSize: 8,
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.08 },
          data: renewalHistory.pontos.map((point) => point.renovacoes_media),
        },
      ],
    };
  }, [renewalHistory]);

  if (loading) {
    return <div className="p-5 lg:p-8"><div className="mx-auto max-w-[1680px]"><LoadingBlock /></div></div>;
  }

  if (error || !data) {
    return <div className="p-5 lg:p-8"><div className="mx-auto max-w-[1680px]"><ErrorBlock message={error ?? "Dados indisponíveis."} retry={() => setReloadKey((value) => value + 1)} /></div></div>;
  }

  return (
    <div className="p-5 lg:p-8">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Churn</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
              Esta página mostra quem saiu, quais planos mais perderam clientes, quanto tempo essas pessoas ficaram conosco, quantas vezes renovaram e qual foi o LTV antes do churn.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Período selecionado: {periodLabel}</p>
          </div>

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
        </div>

        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="flex items-start gap-2">
            <HelpTip text="Nesta página consideramos churn somente quando o plano atual do cliente está vencido há 60 dias ou mais. Clientes com 1 a 59 dias de atraso ficam fora desta análise." />
            <div><p><strong>Regra usada:</strong> {data.regra_churn}</p><p className="mt-1 text-xs font-semibold text-blue-700">Atrasos de 1 a 59 dias não entram nos números desta página.</p></div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Kpi title="Clientes perdidos" value={formatInteger(data.resumo.clientes_perdidos)} subtitle="Quantidade de clientes que completaram a regra de churn no período." helpText="Conta somente clientes cujo plano atual chegou a 60 dias ou mais de atraso. Quem está com menos de 60 dias de atraso não aparece nesta página." />
          <Kpi title="Valor mensal que saiu da carteira" value={formatMoney(data.resumo.valor_perdido)} subtitle="Soma do valor do último plano desses clientes." helpText="É a soma do valor dos planos que estavam com os clientes quando eles saíram. Ajuda a entender quanto de receita recorrente estava ligado a esses clientes." />
          <Kpi title="Tempo médio como cliente" value={formatTenure(data.resumo.tempo_medio_meses)} subtitle={`Mediana: ${formatTenure(data.resumo.tempo_mediano_meses)}.`} helpText="Mostra quanto tempo, em média, os clientes perdidos ficaram conosco entre a data de ativação e a data de vencimento do último plano. A mediana mostra o ponto do meio e sofre menos com clientes muito antigos." />
          <Kpi title="Renovações antes de sair" value={percent.format(data.resumo.renovacoes_media)} subtitle={`Mediana: ${percent.format(data.resumo.renovacoes_mediana)} renovações.`} helpText="Mostra quantas vezes, em média, esses clientes renovaram o plano antes de sair. A primeira compra não conta como renovação." />
          <Kpi title="LTV médio dos clientes perdidos" value={formatMoney(data.resumo.ltv_medio)} subtitle={`LTV total: ${formatMoney(data.resumo.ltv_total)}.`} helpText="LTV é a soma do histórico de pagamentos de planos desse cliente. Aqui mostramos a média de LTV entre os clientes que entraram no recorte de churn." />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              title={financial ? "Em quais planos ficou mais LTV dos clientes perdidos" : "Quais planos mais perderam clientes"}
              subtitle={financial ? "No modo financeiro, comparamos o LTV total dos clientes perdidos em cada plano." : "No modo quantitativo, comparamos a quantidade de clientes perdidos em cada plano."}
              helpText={financial ? "Cada barra mostra quanto de LTV acumulado pertence aos clientes que saíram daquele plano." : "Cada barra mostra quantos clientes daquele plano entraram em churn no período."}
              clickable
            />
            <BarList
              items={data.por_plano.map((item) => ({ key: item.nome_plano, label: item.nome_plano, item }))}
              value={(raw) => financial ? (raw as ChurnPlan).ltv_total : (raw as ChurnPlan).clientes}
              formatValue={(value) => financial ? formatMoney(value) : formatInteger(value)}
              onClick={(raw) => setSelectedPlan(raw as ChurnPlan)}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              title="Quanto tempo os clientes ficaram antes de sair"
              subtitle="Agrupamos os clientes por tempo de permanência. Clique em uma faixa para ver o detalhe exato."
              helpText="Este gráfico responde se estamos perdendo mais clientes novos ou antigos. Clique em uma faixa para abrir o número exato de clientes em cada mês ou ano dentro dela."
              clickable
            />
            <BarList
              items={data.tempo_faixas.map((item) => ({ key: item.label, label: item.label, item }))}
              value={(raw) => (raw as ChurnBucket).clientes}
              formatValue={formatInteger}
              onClick={(raw) => { setSelectedTenureBucket(raw as ChurnBucket); setSelectedExactTenure(null); }}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle title="Quantas vezes os clientes renovaram antes de sair" subtitle="Mostra em qual ciclo de renovação o churn aconteceu." helpText="A barra '0 renovações' mostra clientes que saíram antes de renovar uma única vez. '1 renovação' mostra quem renovou uma vez e depois saiu, e assim por diante." />
            <BarList items={data.renovacoes_faixas.map((item) => ({ key: item.label, label: item.label, item }))} value={(raw) => (raw as ChurnBucket).clientes} formatValue={formatInteger} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              title={financial ? "Quanto de LTV estava em cada faixa" : "Quantos clientes havia em cada faixa de LTV"}
              subtitle="Separamos os clientes perdidos por quanto eles deixaram em pagamentos antes de sair."
              helpText={financial ? "No modo financeiro, a barra soma o LTV de todos os clientes que pertencem àquela faixa." : "No modo quantitativo, a barra conta quantos clientes perdidos pertencem àquela faixa de LTV."}
            />
            <BarList
              items={data.ltv_faixas.map((item) => ({ key: item.label, label: item.label, item }))}
              value={(raw) => financial ? (raw as ChurnBucket).ltv_total : (raw as ChurnBucket).clientes}
              formatValue={(value) => financial ? formatMoney(value) : formatInteger(value)}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              title="Média de renovações antes de sair, por plano"
              subtitle="Mostra quantas vezes, em média, os clientes de cada plano renovaram antes do churn."
              helpText="Cada barra mostra a média de renovações dos clientes que saíram daquele plano. Clique em uma linha para ver como essa média mudou nos últimos 12 meses."
              clickable
            />
            <BarList
              items={(data.renovacoes_medias?.por_plano ?? []).map((item) => ({ key: item.value, label: item.label, item }))}
              value={(raw) => (raw as ChurnRenewalAverage).renovacoes_media}
              formatValue={(value) => `${percent.format(value)} renovações`}
              onClick={(raw) => setSelectedRenewalAverage({ dimension: "plano", item: raw as ChurnRenewalAverage })}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              title="Média de renovações antes de sair, por duração"
              subtitle="Compara clientes mensais, trimestrais, semestrais e anuais."
              helpText="Cada barra mostra a média de renovações antes do churn para uma duração de plano. Clique em uma linha para ver a evolução dessa média nos últimos 12 meses."
              clickable
            />
            <BarList
              items={(data.renovacoes_medias?.por_duracao ?? []).map((item) => ({ key: item.value, label: item.label, item }))}
              value={(raw) => (raw as ChurnRenewalAverage).renovacoes_media}
              formatValue={(value) => `${percent.format(value)} renovações`}
              onClick={(raw) => setSelectedRenewalAverage({ dimension: "duracao", item: raw as ChurnRenewalAverage })}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <DimensionCard title={financial ? "LTV dos clientes perdidos por empresa" : "Clientes perdidos por empresa"} items={data.dimensoes.por_empresa} financial={financial} />
          <DimensionCard title={financial ? "LTV dos clientes perdidos por origem" : "Clientes perdidos por origem"} items={data.dimensoes.por_origem} financial={financial} />
          <DimensionCard title={financial ? "LTV dos clientes perdidos por responsável pelo pagamento" : "Clientes perdidos por responsável pelo pagamento"} items={data.dimensoes.por_pagador} financial={financial} />
        </div>



        {(data.utms ?? []).length > 0 ? (
          <div className="mt-6">
            <SectionTitle
              title="Ranking do churn por UTM"
              subtitle="Priorizamos Source, Medium e Campaign para entender de onde vieram os clientes que mais saíram. Content e Term aparecem depois como detalhamento."
              helpText="Este ranking considera somente clientes em churn no período selecionado. No modo Financeiro, ordenamos pelo valor mensal que saiu da carteira. No modo Quantitativo, pela quantidade de clientes. A cobertura mostra quanto daquele campo UTM está realmente preenchido."
            />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {[...(data.utms ?? [])]
                .sort((a, b) => a.prioridade - b.prioridade)
                .map((ranking) => <UtmRankingCard key={ranking.field} ranking={ranking} financial={financial} />)}
            </div>
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-950">Quem são os clientes que estamos perdendo</h2>
                <ClickHint />
                <HelpTip text="Esta tabela mostra cada cliente que entrou em churn no período. Clique em uma linha para ver os detalhes daquele cliente." />
              </div>
              <p className="mt-1 text-xs text-slate-500">Clique em um cliente para abrir o histórico resumido de tempo, renovações e LTV.</p>
            </div>
            <label className="relative block w-full max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Buscar cliente, plano ou origem..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortableHeader label="Cliente" column="cliente" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Empresa" column="empresa" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Origem" column="origem" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Pagador" column="pagador" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Plano" column="nome_plano" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Duração" column="duracao_label" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Completou 60 dias" column="churn_em" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Dias vencido" column="dias_vencido" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                  <SortableHeader label="Tempo conosco" column="meses_cliente" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                  <SortableHeader label="Renovações" column="renovacoes" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                  <SortableHeader label="LTV" column="ltv" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleClients.map((client) => (
                  <tr key={`${client.empresa_id}-${client.churn_em}`} onClick={() => setSelectedClient(client)} className="cursor-pointer transition hover:bg-blue-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900"><span className="inline-flex items-center gap-2">{client.cliente}<MousePointerClick size={13} className="text-blue-600" /></span></td>
                    <td className="px-4 py-3">{client.empresa}</td>
                    <td className="px-4 py-3">{client.origem}</td>
                    <td className="px-4 py-3">{client.pagador}</td>
                    <td className="px-4 py-3 font-medium">{client.nome_plano}</td>
                    <td className="px-4 py-3">{client.duracao_label}</td>
                    <td className="px-4 py-3">{formatDate(client.churn_em)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatInteger(client.dias_vencido)}</td>
                    <td className="px-4 py-3 text-right">{formatTenure(client.meses_cliente)}</td>
                    <td className="px-4 py-3 text-right">{formatInteger(client.renovacoes)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(client.ltv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-slate-500">Mostrando {visibleClients.length} de {filteredClients.length} cliente(s).</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40">Anterior</button>
              <span className="text-slate-500">Página {page} de {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40">Próxima</button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={Boolean(selectedPlan)} title={selectedPlan?.nome_plano ?? ""} subtitle="Detalhamento dos clientes perdidos neste plano." onClose={() => setSelectedPlan(null)}>
        {selectedPlan && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Kpi title="Clientes perdidos" value={formatInteger(selectedPlan.clientes)} subtitle={`${formatPercent(selectedPlan.percentual_clientes)} de todos os clientes perdidos.`} helpText="Quantidade de clientes deste plano que entraram em churn no período." />
              <Kpi title="LTV total perdido" value={formatMoney(selectedPlan.ltv_total)} subtitle={`LTV médio: ${formatMoney(selectedPlan.ltv_medio)}.`} helpText="Soma de todo o LTV acumulado pelos clientes perdidos deste plano." />
              <Kpi title="Tempo médio conosco" value={formatTenure(selectedPlan.tempo_medio_meses)} subtitle="Tempo médio até o churn." helpText="Quanto tempo, em média, os clientes deste plano ficaram conosco antes de sair." />
              <Kpi title="Renovações médias" value={percent.format(selectedPlan.renovacoes_media)} subtitle="Renovações antes do churn." helpText="Quantas vezes, em média, os clientes deste plano renovaram antes de sair." />
            </div>
            <div className="space-y-4">
              <SectionTitle title="Durações deste plano" subtitle="Escolha uma duração para refinar a lista de clientes." helpText="Os botões mostram quantos clientes saíram em cada duração. Ao escolher uma duração, a lista e as exportações abaixo passam a considerar somente esse grupo." />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button type="button" onClick={() => setSelectedPlanDuration("todos")} className={`rounded-2xl border p-4 text-left transition ${selectedPlanDuration === "todos" ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Todas</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{formatInteger(selectedPlan?.clientes ?? 0)}</p>
                  <p className="mt-1 text-xs text-slate-500">cliente(s)</p>
                </button>
                {selectedPlanDurations.map((item) => (
                  <button key={item.duracao} type="button" onClick={() => setSelectedPlanDuration(item.duracao)} className={`rounded-2xl border p-4 text-left transition ${selectedPlanDuration === item.duracao ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-950">{formatInteger(item.clientes)}</p>
                    <p className="mt-1 text-xs text-slate-500">LTV {formatMoney(item.ltv)}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SectionTitle title="Clientes perdidos deste plano" subtitle={`${formatInteger(selectedPlanClients.length)} cliente(s) no recorte atual.`} helpText="Lista dos clientes que entraram em churn usando este plano. Você pode filtrar pelas durações acima e exportar somente o recorte escolhido." />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => downloadChurnCsv(selectedPlanClients, "churn_plano.csv")} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><Download size={14} /> CSV</button>
                  <button type="button" onClick={() => void downloadChurnXlsx(selectedPlanClients, "churn_plano.xlsx")} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><FileSpreadsheet size={14} /> XLSX</button>
                  <button type="button" onClick={() => void copyChurnSheets(selectedPlanClients)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><ClipboardCopy size={14} /> Google Sheets</button>
                </div>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Duração</th><th className="px-4 py-3 text-right">Tempo</th><th className="px-4 py-3 text-right">Renovações</th><th className="px-4 py-3 text-right">LTV</th><th className="px-4 py-3 text-right">Intranet</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPlanClients.map((client) => (
                      <tr key={`${client.empresa_id}-${client.churn_em}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold">{client.cliente}</td><td className="px-4 py-3">{client.duracao_label}</td><td className="px-4 py-3 text-right">{formatTenure(client.meses_cliente)}</td><td className="px-4 py-3 text-right">{client.renovacoes}</td><td className="px-4 py-3 text-right font-semibold">{formatMoney(client.ltv)}</td><td className="px-4 py-3 text-right"><a href={intranetUrl(client.empresa_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">Abrir cliente no intranet <ExternalLink size={12} /></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(selectedTenureBucket)}
        title={selectedTenureBucket ? `Detalhe de permanência: ${selectedTenureBucket.label}` : ""}
        subtitle="Veja exatamente quantos clientes foram perdidos em cada mês ou ano dentro desta faixa."
        onClose={() => { setSelectedTenureBucket(null); setSelectedExactTenure(null); }}
      >
        {selectedTenureBucket && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Kpi
                title="Clientes nesta faixa"
                value={formatInteger(selectedTenureBucket.clientes)}
                subtitle="Total de clientes perdidos dentro da faixa escolhida."
                helpText="Este número soma todos os clientes que pertencem à faixa de tempo que você clicou."
              />
              <Kpi
                title="LTV total desta faixa"
                value={formatMoney(selectedTenureBucket.ltv_total)}
                subtitle="Soma do LTV dos clientes desta faixa."
                helpText="Mostra quanto esses clientes deixaram em pagamentos de planos ao longo do relacionamento."
              />
              <Kpi
                title="Divisões encontradas"
                value={formatInteger(tenureDetail.length)}
                subtitle="Meses ou anos diferentes dentro da faixa."
                helpText="Mostra em quantos pontos diferentes a faixa foi dividida. Faixas curtas usam meses; faixas maiores usam anos completos."
              />
            </div>

            <div>
              <SectionTitle
                title="Quantos clientes saíram em cada tempo exato"
                subtitle="Para períodos de até 12 meses mostramos mês a mês. Depois disso, mostramos anos completos."
                helpText="Exemplo: se você abriu a faixa de 2 a 3 anos, verá quantos clientes saíram depois de 2 anos completos e quantos saíram depois de 3 anos completos."
              />
              <div className="space-y-3">
                {tenureDetail.map((item) => {
                  const maxClients = Math.max(...tenureDetail.map((row) => row.clientes), 1);
                  return (
                    <button key={item.label} type="button" onClick={() => setSelectedExactTenure(item.label)} className={`w-full rounded-2xl border p-4 text-left transition hover:bg-slate-50 ${selectedExactTenure === item.label ? "border-blue-300 bg-blue-50/50" : "border-slate-200"}`}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="inline-flex items-center gap-2 font-semibold text-slate-900">{item.label} <MousePointerClick size={14} className="text-blue-600" /></p>
                          <p className="mt-1 text-xs text-slate-500">LTV: {formatMoney(item.ltv)} · valor do último plano: {formatMoney(item.valor_perdido)} · clique para listar os clientes</p>
                        </div>
                        <p className="text-lg font-bold text-slate-950">{formatInteger(item.clientes)} cliente(s)</p>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, (item.clientes / maxClients) * 100)}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedExactTenure && (
                <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-950">Clientes com permanência de {selectedExactTenure}</h4>
                      <p className="mt-1 text-xs text-slate-500">{formatInteger(exactTenureClients.length)} cliente(s) encontrados neste ponto exato.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => {
                        const header = ["ID","Cliente","Empresa","Origem","Pagador","Plano","Duração","Churn","Tempo (meses)","Renovações","LTV","Intranet"];
                        const lines = exactTenureClients.map((client) => [client.empresa_id, client.cliente, client.empresa, client.origem, client.pagador, client.nome_plano, client.duracao_label, client.churn_em ?? "", client.meses_cliente, client.renovacoes, client.ltv, intranetUrl(client.empresa_id)]);
                        const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"','""')}"`;
                        const csv = `\uFEFF${header.map(escape).join(";")}\r\n${lines.map((row) => row.map(escape).join(";")).join("\r\n")}`;
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = "churn_permanencia.csv"; a.click(); URL.revokeObjectURL(url);
                      }} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><Download size={14} /> CSV</button>
                      <button type="button" onClick={async () => {
                        const XLSX = await import("xlsx");
                        const payload = exactTenureClients.map((client) => ({ ID: client.empresa_id, Cliente: client.cliente, Empresa: client.empresa, Origem: client.origem, Pagador: client.pagador, Plano: client.nome_plano, Duração: client.duracao_label, Churn: client.churn_em, "Tempo (meses)": client.meses_cliente, Renovações: client.renovacoes, LTV: client.ltv, Intranet: intranetUrl(client.empresa_id) }));
                        const ws = XLSX.utils.json_to_sheet(payload); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Clientes"); XLSX.writeFile(wb, "churn_permanencia.xlsx");
                      }} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><FileSpreadsheet size={14} /> XLSX</button>
                      <button type="button" onClick={async () => {
                        const header = ["ID","Cliente","Empresa","Origem","Pagador","Plano","Duração","Churn","Tempo (meses)","Renovações","LTV","Intranet"].join("\t");
                        const body = exactTenureClients.map((client) => [client.empresa_id, client.cliente, client.empresa, client.origem, client.pagador, client.nome_plano, client.duracao_label, client.churn_em ?? "", client.meses_cliente, client.renovacoes, client.ltv, intranetUrl(client.empresa_id)].join("\t"));
                        await navigator.clipboard.writeText([header, ...body].join("\n")); window.open("https://sheets.new", "_blank", "noopener,noreferrer");
                      }} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><ClipboardCopy size={14} /> Google Sheets</button>
                    </div>
                  </div>
                  <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-[1000px] text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Plano</th><th className="px-3 py-2 text-left">Churn</th><th className="px-3 py-2 text-right">Renovações</th><th className="px-3 py-2 text-right">LTV</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {exactTenureClients.map((client) => <tr key={client.empresa_id}><td className="px-3 py-2"><a href={intranetUrl(client.empresa_id)} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">{client.cliente}</a></td><td className="px-3 py-2">{client.nome_plano} · {client.duracao_label}</td><td className="px-3 py-2">{formatDate(client.churn_em)}</td><td className="px-3 py-2 text-right">{formatInteger(client.renovacoes)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(client.ltv)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(selectedRenewalAverage)}
        title={selectedRenewalAverage ? `Evolução das renovações: ${selectedRenewalAverage.item.label}` : ""}
        subtitle="Média de renovações dos clientes que entraram em churn em cada um dos últimos 12 meses."
        onClose={() => setSelectedRenewalAverage(null)}
      >
        {renewalHistoryLoading && <LoadingBlock />}
        {renewalHistoryError && <ErrorBlock message={renewalHistoryError} retry={() => setSelectedRenewalAverage((current) => current ? { ...current } : current)} />}
        {renewalHistory && renewalHistoryOption && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle
                title="Como a média de renovações mudou nos últimos 12 meses"
                subtitle="Cada ponto representa os clientes que entraram em churn naquele mês."
                helpText="Se a linha sobe, os clientes que saíram naquele mês tinham renovado mais vezes antes de sair. Se a linha desce, eles saíram com menos ciclos de renovação."
              />
              <ReactECharts option={renewalHistoryOption} style={{ height: 360 }} />
            </div>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {renewalHistory.pontos.map((point) => (
                <div key={point.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">{point.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{percent.format(point.renovacoes_media)}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatInteger(point.clientes)} cliente(s) em churn</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selectedClient)} title={selectedClient?.cliente ?? ""} subtitle="Resumo do cliente usando as regras das consultas de churn, tempo de vida e LTV." onClose={() => setSelectedClient(null)}>
        {selectedClient && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-950">Abrir este cliente na intranet</p>
                <p className="mt-1 text-xs text-blue-700">O botão abre a ficha do cliente em uma nova aba usando o ID {selectedClient.empresa_id}.</p>
              </div>
              <a href={intranetUrl(selectedClient.empresa_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Abrir cliente no intranet <ExternalLink size={16} /></a>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Kpi title="Plano ao sair" value={selectedClient.nome_plano} subtitle={selectedClient.duracao_label} helpText="É o plano que o cliente tinha no ciclo que terminou em churn." />
              <Kpi title="Tempo como cliente" value={formatTenure(selectedClient.meses_cliente)} subtitle={`${formatInteger(selectedClient.dias_cliente)} dias aproximadamente.`} helpText="Tempo entre a ativação do cliente e a data de vencimento do último plano, seguindo a mesma lógica da consulta de Customer Lifetime." />
              <Kpi title="Renovações" value={formatInteger(selectedClient.renovacoes)} subtitle="Antes do churn." helpText="Número de renovações pagas antes de o cliente sair. A primeira compra não é contada como renovação." />
              <Kpi title="LTV realizado" value={formatMoney(selectedClient.ltv)} subtitle="Histórico de pagamentos de planos." helpText="Soma dos pagamentos de planos encontrados no histórico desse cliente, seguindo a consulta de LTV enviada para o projeto." />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Kpi title="Empresa" value={selectedClient.empresa} subtitle="Produto principal do cliente." helpText="GestãoClick representa modalidade ERP. ClickNotas representa modalidades NFE ou FIS." />
              <Kpi title="Origem" value={selectedClient.origem} subtitle="Como o cliente chegou até nós." helpText="GestãoClick significa indicação interna. Parceiro significa que a empresa veio por um parceiro." />
              <Kpi title="Quem pagava" value={selectedClient.pagador} subtitle="Responsável pelo pagamento." helpText="Mostra se o próprio cliente pagava o plano ou se o parceiro era o responsável pelo pagamento." />
              <Kpi title="Quando completou 60 dias" value={formatDate(selectedClient.churn_em)} subtitle={`Vencimento: ${formatDate(selectedClient.data_vencimento)}.`} helpText="É a data em que o plano completou 60 dias de atraso: data de vencimento + 60 dias." />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Kpi title="Dias vencido" value={formatInteger(selectedClient.dias_vencido)} subtitle="Sempre 60 dias ou mais nesta página." helpText="Mostra quantos dias se passaram entre o vencimento do plano e a data de referência usada para o mês analisado." />
              <Kpi title="Pagamentos encontrados" value={formatInteger(selectedClient.qtd_pagamentos)} subtitle="Inclui a primeira contratação." helpText="Conta os pagamentos de planos encontrados no histórico do cliente que possuem data de pagamento e nota fiscal." />
              <Kpi title="Ticket médio histórico" value={formatMoney(selectedClient.ticket_medio)} subtitle="Média dos pagamentos usados no LTV." helpText="É o valor médio dos pagamentos que entram no cálculo de LTV desse cliente." />
              <Kpi title="Receita média por mês de vida" value={formatMoney(selectedClient.receita_media_mensal)} subtitle="LTV dividido pelo tempo de vida em meses." helpText="Pega o LTV e divide pelo número de meses entre a ativação do cliente e o vencimento do último plano." />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
