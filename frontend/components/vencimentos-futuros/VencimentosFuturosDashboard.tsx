"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CircleHelp,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  MousePointerClick,
  RefreshCw,
  X,
} from "lucide-react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchFutureDueDashboard, fetchFutureDueExport, fetchFutureDueExportOptions, fetchFutureDueMeta } from "@/lib/vencimentos-futuros-api";
import type {
  FutureDueCalendarItem,
  FutureDueClient,
  FutureDueDashboardResponse,
  FutureDueExportFilters,
  FutureDueExportOptions,
  FutureDueExportResponse,
  FutureDueExportRow,
  FutureDueMetaResponse,
  FutureDuePlan,
} from "@/types/vencimentos-futuros";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const DAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
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
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("pt-BR");
const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatMoney(value: number) {
  return currency.format(value || 0);
}

function formatInteger(value: number) {
  return integer.format(Math.round(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatCompactMoney(value: number) {
  return compactCurrency.format(value || 0);
}

function paymentAverageLabel(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Sem renovação normal para calcular a média";
  if (value < 0) return `${Math.abs(value).toFixed(1).replace(".", ",")} dias antes do vencimento`;
  if (value > 0) return `${value.toFixed(1).replace(".", ",")} dias depois do vencimento`;
  return "No vencimento";
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
      Visão interativa
    </span>
  );
}

function SectionTitle({ title, subtitle, helpText, interactive = false }: { title: string; subtitle?: string; helpText: string; interactive?: boolean }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        {interactive && <ClickHint />}
        <HelpTip text={helpText} />
      </div>
      {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
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

function LoadingBlock() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw size={24} className="mx-auto animate-spin text-blue-600" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Carregando vencimentos futuros...</p>
        <p className="mt-1 text-xs text-slate-400">Montando o calendário, os resumos e os rankings do período.</p>
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
          <p className="font-semibold">Não foi possível carregar os vencimentos futuros</p>
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

function PlanChart({ items }: { items: FutureDuePlan[] }) {
  const data = useMemo(() => {
    const top = items.slice(0, 8).map((item) => ({ name: item.label, value: item.valor_total }));
    const others = items.slice(8).reduce((sum, item) => sum + item.valor_total, 0);
    if (others > 0) top.push({ name: "Outros", value: others });
    return top;
  }, [items]);

  const option = useMemo(() => ({
    tooltip: {
      trigger: "item",
      valueFormatter: (value: number) => formatMoney(value),
    },
    legend: {
      bottom: 0,
      left: "center",
      textStyle: { fontSize: 11, color: "#475569" },
    },
    series: [
      {
        type: "pie",
        radius: ["50%", "72%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: ({ percent }: { percent: number }) => `${percent.toFixed(1).replace(".", ",")}%`,
          fontSize: 11,
        },
        labelLine: { show: true },
        data,
      },
    ],
  }), [data]);

  return <ReactECharts option={option} style={{ height: 360 }} />;
}

function buildMonthMatrix(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const totalDays = lastDay.getDate();
  const startWeekDay = firstDay.getDay();
  const cells: Array<number | null> = [];

  for (let index = 0; index < startWeekDay; index += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function heatColor(item: FutureDueCalendarItem | undefined, maxValue: number) {
  if (!item) return "bg-slate-50";
  const intensity = maxValue > 0 ? Math.max(0.15, item.total_valor / maxValue) : 0.15;

  if (item.is_churn) {
    return { backgroundColor: `rgba(239, 68, 68, ${Math.min(0.9, intensity)})` };
  }
  if (item.is_past) {
    return { backgroundColor: `rgba(251, 146, 60, ${Math.min(0.7, intensity)})` };
  }
  return { backgroundColor: `rgba(59, 130, 246, ${Math.min(0.8, intensity)})` };
}

function MonthHeatmap({ year, month, items, today, churnDate }: { year: number; month: number; items: FutureDueCalendarItem[]; today: string; churnDate: string }) {
  const matrix = useMemo(() => buildMonthMatrix(year, month), [year, month]);
  const byDay = useMemo(() => new Map(items.map((item) => [item.day, item])), [items]);
  const maxValue = useMemo(() => items.reduce((max, item) => Math.max(max, item.total_valor), 0), [items]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{MONTHS[month - 1]} de {year}</h3>
          <p className="text-xs text-slate-500">
            Azul = ainda vai vencer. Laranja = já venceu. Vermelho = entrou em churn (60 dias ou mais).
          </p>
        </div>
        <div className="text-right text-[11px] leading-5 text-slate-400">
          <p>Hoje: {formatDate(today)}</p>
          <p>Faixa de churn: desde {formatDate(churnDate)}</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold text-slate-400">
        {DAYS.map((day) => (
          <div key={day} className="py-1">{day}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {matrix.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="min-h-[72px] rounded-xl bg-slate-50" />;
          }

          const item = byDay.get(day);
          const color = heatColor(item, maxValue);

          return (
            <div
              key={`${year}-${month}-${day}`}
              className={`min-h-[72px] rounded-xl border border-slate-100 p-2 ${item ? "text-slate-950" : "text-slate-400"}`}
              style={typeof color === "string" ? undefined : color}
              title={item ? `${formatDate(item.date)} · ${formatMoney(item.total_valor)} · ${formatInteger(item.total_clientes)} cliente(s)` : `${day}/${String(month).padStart(2, "0")}/${year} sem vencimentos`}
            >
              <div className="text-xs font-semibold">{day}</div>
              {item ? (
                <>
                  <div className="mt-1 text-[11px] font-semibold leading-4">{formatCompactMoney(item.total_valor)}</div>
                  <div className="mt-1 text-[10px] leading-4">{formatInteger(item.total_clientes)} cliente(s)</div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableCard({ title, subtitle, helpText, children }: { title: string; subtitle: string; helpText: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionTitle title={title} subtitle={subtitle} helpText={helpText} />
      {children}
    </div>
  );
}

function EmptyTable({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{text}</div>;
}

function ClientRankingTable({
  items,
  emptyText,
  showPaymentAverage = true,
}: {
  items: FutureDueClient[];
  emptyText: string;
  showPaymentAverage?: boolean;
}) {
  if (items.length === 0) return <EmptyTable text={emptyText} />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.08em] text-slate-400">
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3">Plano</th>
            <th className="px-3 py-3">Tempo</th>
            <th className="px-3 py-3">Vence em</th>
            <th className="px-3 py-3 text-right">Valor</th>
            {showPaymentAverage ? <th className="px-3 py-3">Pagamento médio real</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.empresa_id}-${item.data_vencimento}-${item.nome_plano}`} className="border-b border-slate-100 align-top last:border-0">
              <td className="px-3 py-3">
                <div className="font-semibold text-slate-900">{item.cliente}</div>
                <div className="text-xs text-slate-500">{item.empresa} · {item.origem}</div>
                <a
                  href={item.intranet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  Abrir no intranet <ExternalLink size={12} />
                </a>
              </td>
              <td className="px-3 py-3 text-slate-600">{item.nome_plano} · {item.duracao_label}</td>
              <td className="px-3 py-3 text-slate-600">{item.tempo_casa_label}</td>
              <td className="px-3 py-3 text-slate-600">{formatDate(item.data_vencimento)}</td>
              <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(item.valor)}</td>
              {showPaymentAverage ? (
                <td className="px-3 py-3 text-xs leading-5 text-slate-600">{paymentAverageLabel(item.media_dias_pagamento)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


const EXPORT_COLUMNS: Array<{ key: keyof FutureDueExportRow; label: string }> = [
  { key: "id", label: "ID" },
  { key: "ativou_em", label: "Data da contratação" },
  { key: "modalidade", label: "Modalidade" },
  { key: "empresa_indicacao_id", label: "Empresa indicação ID" },
  { key: "tipo_cobranca", label: "Tipo cobrança" },
  { key: "nome_plano", label: "Plano" },
  { key: "duracao", label: "Duração" },
  { key: "data_vencimento", label: "Data de vencimento" },
  { key: "valor", label: "Valor" },
  { key: "nome_usuario", label: "Nome do usuário" },
  { key: "telefone", label: "Telefone" },
  { key: "celular", label: "Celular" },
  { key: "email", label: "E-mail" },
  { key: "empresa", label: "Empresa" },
  { key: "origem", label: "Origem" },
  { key: "pagador", label: "Responsável pelo pagamento" },
  { key: "tempo_cliente_meses", label: "Tempo como cliente (meses)" },
  { key: "qtd_pagamentos", label: "Pagamentos encontrados" },
  { key: "renovacoes", label: "Renovações" },
  { key: "reativacoes", label: "Reativações" },
  { key: "media_dias_pagamento_real", label: "Média real de dias de pagamento" },
  { key: "ltv", label: "LTV" },
  { key: "ticket_medio_historico", label: "Ticket médio histórico" },
  { key: "intranet_url", label: "Intranet" },
];

function dayBefore(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function exportCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function csvEscape(value: unknown) {
  const text = exportCell(value).replaceAll('"', '""');
  return `"${text}"`;
}

function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ExportModal({
  initialFilters,
  onClose,
}: {
  initialFilters: FutureDueExportFilters;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<FutureDueExportFilters>(initialFilters);
  const [options, setOptions] = useState<FutureDueExportOptions | null>(null);
  const [result, setResult] = useState<FutureDueExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    fetchFutureDueExportOptions().then(setOptions).catch(() => setOptions(null));
  }, []);

  async function generateTable() {
    setLoading(true);
    setError(null);
    setCopyMessage("");
    try {
      const response = await fetchFutureDueExport(filters);
      setResult(response);
      setTablePage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar a tabela.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!result) return;
    const header = EXPORT_COLUMNS.map((column) => csvEscape(column.label)).join(";");
    const body = result.rows.map((row) => EXPORT_COLUMNS.map((column) => csvEscape(row[column.key])).join(";")).join("\r\n");
    downloadBlob(`\uFEFF${header}\r\n${body}`, "text/csv;charset=utf-8", "vencimentos_futuros.csv");
  }

  async function downloadXlsx() {
    if (!result) return;
    const XLSX = await import("xlsx");
    const rows = result.rows.map((row) => Object.fromEntries(EXPORT_COLUMNS.map((column) => [column.label, row[column.key] ?? ""])));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = EXPORT_COLUMNS.map((column) => ({ wch: Math.max(12, Math.min(32, column.label.length + 4)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vencimentos");
    XLSX.writeFile(workbook, "vencimentos_futuros.xlsx");
  }

  async function copyToGoogleSheets() {
    if (!result) return;
    const sheetWindow = window.open("https://sheets.new", "_blank", "noopener,noreferrer");
    const header = EXPORT_COLUMNS.map((column) => column.label).join("\t");
    const rows = result.rows.map((row) => EXPORT_COLUMNS.map((column) => exportCell(row[column.key]).replaceAll("\t", " ").replaceAll("\n", " ")).join("\t"));
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      setCopyMessage(`${formatInteger(result.total)} linhas copiadas. Cole com Ctrl+V na planilha do Google Sheets.`);
      if (!sheetWindow) {
        setCopyMessage(`${formatInteger(result.total)} linhas copiadas. O navegador bloqueou a nova aba; abra o Google Sheets e cole com Ctrl+V.`);
      }
    } catch {
      setCopyMessage("O navegador não permitiu copiar para a área de transferência. Use CSV ou XLSX, ou autorize o acesso à área de transferência e tente novamente.");
    }
  }

  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil((result?.rows.length ?? 0) / pageSize));
  const visibleRows = result?.rows.slice((tablePage - 1) * pageSize, tablePage * pageSize) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-[1500px] overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Exportação</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">Exportar vencimentos futuros</h3>
            <p className="mt-1 text-sm text-slate-500">Defina o recorte, gere a tabela e depois baixe em CSV/XLSX ou copie tudo para o Google Sheets.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
        </div>

        <div className="space-y-6 p-6 lg:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Empresa
              <select value={filters.empresa} onChange={(event) => setFilters((current) => ({ ...current, empresa: event.target.value as FutureDueExportFilters["empresa"] }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="todos">Todas</option><option value="gestaoclick">GestãoClick</option><option value="clicknotas">ClickNotas</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Origem
              <select value={filters.origem} onChange={(event) => setFilters((current) => ({ ...current, origem: event.target.value as FutureDueExportFilters["origem"] }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="todos">Todas</option><option value="gestaoclick">GestãoClick</option><option value="parceiro">Parceiro</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Responsável pelo pagamento
              <select value={filters.pagador} onChange={(event) => setFilters((current) => ({ ...current, pagador: event.target.value as FutureDueExportFilters["pagador"] }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="todos">Todos</option><option value="cliente">Cliente</option><option value="parceiro">Parceiro</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Plano
              <input list="export-planos" value={filters.plano} onChange={(event) => setFilters((current) => ({ ...current, plano: event.target.value }))} placeholder="Todos os planos" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
              <datalist id="export-planos">{(options?.planos ?? []).map((item) => <option key={item} value={item} />)}</datalist>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Vencimento de
              <input type="date" value={filters.data_inicio} onChange={(event) => setFilters((current) => ({ ...current, data_inicio: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Vencimento até
              <input type="date" value={filters.data_fim} onChange={(event) => setFilters((current) => ({ ...current, data_fim: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Duração
              <select value={filters.duracao} onChange={(event) => setFilters((current) => ({ ...current, duracao: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="">Todas</option>{(options?.duracoes ?? []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Valor acima de
              <input type="number" min="0" step="0.01" value={filters.valor_minimo || ""} onChange={(event) => setFilters((current) => ({ ...current, valor_minimo: Number(event.target.value || 0) }))} placeholder="0,00" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <div className="grid gap-1 text-xs font-semibold text-slate-500 md:col-span-2">
              Tempo como cliente
              <div className="grid grid-cols-[1fr_150px] gap-2">
                <input type="number" min="0" step="0.1" value={filters.tempo_cliente_valor || ""} onChange={(event) => setFilters((current) => ({ ...current, tempo_cliente_valor: Number(event.target.value || 0) }))} placeholder="0" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                <select value={filters.tempo_cliente_unidade} onChange={(event) => setFilters((current) => ({ ...current, tempo_cliente_unidade: event.target.value as "mes" | "ano" }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <option value="mes">Meses</option><option value="ano">Anos</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={generateTable} disabled={loading || !filters.data_inicio || !filters.data_fim} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Gerando tabela..." : "Gerar tabela"}
            </button>
            {result && <span className="text-sm text-slate-500">{formatInteger(result.total)} registros encontrados.</span>}
          </div>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {result && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={16} />CSV</button>
                <button type="button" onClick={downloadXlsx} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={16} />XLSX</button>
                <button type="button" onClick={copyToGoogleSheets} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><ClipboardCopy size={16} />Copiar tudo para Google Sheets</button>
              </div>
              {copyMessage && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{copyMessage}</div>}

              <div className="overflow-auto rounded-2xl border border-slate-200" style={{ maxHeight: 520 }}>
                <table className="min-w-[2600px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>{EXPORT_COLUMNS.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 text-left">{column.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row, index) => (
                      <tr key={`${row.id}-${row.data_vencimento}-${index}`}>
                        {EXPORT_COLUMNS.map((column) => {
                          const value = row[column.key];
                          const formatted = column.key === "valor" || column.key === "ltv" || column.key === "ticket_medio_historico"
                            ? formatMoney(Number(value || 0))
                            : column.key === "ativou_em" || column.key === "data_vencimento"
                              ? formatDate(value ? String(value) : null)
                              : exportCell(value);
                          return <td key={column.key} className="whitespace-nowrap px-3 py-3 text-slate-700">{formatted || "—"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                <span>Página {tablePage} de {totalPages} · a exportação sempre contém todas as {formatInteger(result.total)} linhas.</span>
                <div className="flex gap-2">
                  <button type="button" disabled={tablePage <= 1} onClick={() => setTablePage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={tablePage >= totalPages} onClick={() => setTablePage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VencimentosFuturosDashboard() {
  const { filters } = useGlobalFilters();
  const [meta, setMeta] = useState<FutureDueMetaResponse | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FutureDueDashboardResponse | null>(null);
  const [showExport, setShowExport] = useState(false);

  const load = async (targetYear: number, targetMonth: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchFutureDueDashboard(targetYear, targetMonth, filters);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetchFutureDueMeta();
        if (!active) return;
        setMeta(response);
        setYear(response.ano_atual);
        setMonth(response.mes_atual);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar metadados.");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (year === null || month === null) return;
    void load(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, filters.empresa, filters.origem, filters.pagador]);

  const calendars = useMemo(() => {
    if (!data) return [] as Array<{ month: number; year: number; items: FutureDueCalendarItem[] }>;
    const map = new Map<number, FutureDueCalendarItem[]>();
    for (let index = 1; index <= 12; index += 1) map.set(index, []);
    data.calendario.forEach((item) => {
      const existing = map.get(item.month) ?? [];
      existing.push(item);
      map.set(item.month, existing);
    });

    if (data.periodo.ano_completo) {
      return MONTHS.map((_, index) => ({ month: index + 1, year: data.periodo.ano, items: map.get(index + 1) ?? [] }));
    }

    return [{ month: data.periodo.mes, year: data.periodo.ano, items: map.get(data.periodo.mes) ?? [] }];
  }, [data]);

  const retry = () => {
    if (year !== null && month !== null) {
      void load(year, month);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Vencimentos Futuros</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Esta página mostra o calendário de vencimentos, o valor que está para vencer, os planos que mais vencem e os clientes que merecem mais atenção.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setShowExport(true)}
              className="inline-flex h-[66px] items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <Download size={17} />
              Exportar dados
            </button>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">
                <CalendarDays size={18} />
              </div>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Mês
                <select
                  value={month ?? 0}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className="min-w-[170px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2"
                >
                  {(meta?.meses ?? []).map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Ano
                <select
                  value={year ?? new Date().getFullYear()}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="min-w-[110px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2"
                >
                  {(meta?.anos ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          <p>
            <strong>Como ler o calendário:</strong> azul mostra o que ainda vai vencer, laranja mostra o que já venceu e vermelho mostra o que já passou da faixa de 60 dias e, por isso, já está no território de churn.
          </p>
        </div>

        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} retry={retry} /> : data ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Kpi
                title="Valor que vence no período"
                value={formatMoney(data.resumo.valor_total)}
                subtitle="Soma do valor atual de todos os clientes cujo vencimento cai dentro do recorte escolhido."
                helpText="Este número mostra quanto dinheiro está previsto para vencer no período. Pense nele como o tamanho da carteira que precisa ser renovada agora."
              />
              <Kpi
                title="Clientes com vencimento"
                value={formatInteger(data.resumo.clientes)}
                subtitle="Quantidade de clientes que aparecem no calendário e nas listas desta página."
                helpText="Este card mostra quantos clientes têm vencimento no período escolhido. Cada cliente aparece uma vez com o seu plano atual."
              />
              <Kpi
                title="Ticket médio do vencimento"
                value={formatMoney(data.resumo.ticket_medio)}
                subtitle="Valor médio por cliente dentro do recorte selecionado."
                helpText="Aqui você vê o valor médio por cliente. É como pegar todo o dinheiro do período e dividir pelo número de clientes que vão vencer."
              />
              <Kpi
                title="Já em churn"
                value={formatInteger(data.resumo.clientes_em_churn)}
                subtitle={`${formatMoney(data.resumo.valor_em_churn)} já passou da faixa de 60 dias.`}
                helpText="Este card mostra quantos clientes já ultrapassaram 60 dias desde o vencimento. Eles aparecem em vermelho no calendário porque já estão na área de churn."
              />
              <Kpi
                title="Na primeira renovação"
                value={formatInteger(data.resumo.clientes_primeira_renovacao)}
                subtitle="Clientes que ainda não renovaram nenhuma vez e estão chegando no primeiro ciclo de renovação."
                helpText="Este número mostra quantos clientes estão enfrentando a primeira renovação. É útil para acompanhar novos contratos que ainda não criaram histórico de recorrência."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  title={data.periodo.ano_completo ? "Calendário de vencimentos do ano" : "Calendário de vencimentos do mês"}
                  subtitle={data.periodo.ano_completo ? "Cada mini calendário mostra quanto vence em cada dia de cada mês do ano." : "Cada quadrado mostra o total que vence naquele dia."}
                  helpText="Este calendário funciona como um mapa de calor. Quanto mais forte a cor, maior o valor que vence naquele dia. Azul é futuro, laranja é atraso e vermelho é churn (60 dias ou mais)."
                  interactive
                />
                <div className={`grid gap-4 ${data.periodo.ano_completo ? "lg:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1"}`}>
                  {calendars.map((calendar) => (
                    <MonthHeatmap
                      key={`${calendar.year}-${calendar.month}`}
                      year={calendar.year}
                      month={calendar.month}
                      items={calendar.items}
                      today={data.periodo.data_hoje}
                      churnDate={data.periodo.data_churn}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  title="Vencimentos por plano"
                  subtitle="Comparação do valor que vence em cada plano e duração."
                  helpText="Este gráfico ajuda a ver quais planos concentram mais dinheiro prestes a vencer. Assim fica fácil descobrir onde está o maior risco e também a maior oportunidade de renovação."
                />
                <PlanChart items={data.por_plano} />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <TableCard
                title="10 maiores clientes que vencem no período"
                subtitle="Clientes com os planos de maior valor dentro do recorte selecionado."
                helpText="Aqui você vê os dez clientes com maior valor de plano que vencem no período. A lista é ordenada do plano mais caro para o mais barato."
              >
                <ClientRankingTable
                  items={data.top_maiores_clientes}
                  emptyText="Nenhum cliente encontrado no período."
                />
              </TableCard>

              <TableCard
                title="10 clientes mais antigos que vencem no período"
                subtitle="Clientes com maior tempo de casa entre os vencimentos do recorte."
                helpText="Esta lista mostra os clientes mais antigos que estão para vencer. O pagamento médio usa somente renovações normais; intervalos de 60 dias ou mais são reativações e ficam fora da média."
              >
                <ClientRankingTable
                  items={data.top_clientes_antigos}
                  emptyText="Nenhum cliente encontrado no período."
                />
              </TableCard>

              <TableCard
                title="10 maiores clientes na primeira renovação"
                subtitle="Clientes que ainda não renovaram nenhuma vez e têm maior valor a vencer."
                helpText="Aqui estão os clientes mais valiosos que estão chegando à primeira renovação. Como ainda não renovaram antes, eles pedem uma atenção especial da equipe."
              >
                <ClientRankingTable
                  items={data.top_primeira_renovacao}
                  emptyText="Nenhum cliente de primeira renovação encontrado no período."
                  showPaymentAverage={false}
                />
              </TableCard>

              <TableCard
                title="10 maiores clientes mensais na primeira renovação"
                subtitle="Clientes de plano mensal que ainda não renovaram nenhuma vez, ordenados pelo maior valor."
                helpText="Esta lista foca apenas clientes de plano mensal que estão chegando à primeira renovação. Ela ajuda a priorizar os maiores contratos mensais antes do primeiro vencimento de renovação."
              >
                <ClientRankingTable
                  items={data.top_primeira_renovacao_mensal}
                  emptyText="Nenhum cliente mensal de primeira renovação encontrado no período."
                  showPaymentAverage={false}
                />
              </TableCard>
            </div>
          </div>
        ) : null}
      </div>

      {showExport && data && (
        <ExportModal
          initialFilters={{
            empresa: filters.empresa,
            origem: filters.origem,
            pagador: filters.pagador,
            data_inicio: data.periodo.data_inicio,
            data_fim: dayBefore(data.periodo.data_fim),
            plano: "",
            duracao: "",
            valor_minimo: 0,
            tempo_cliente_valor: 0,
            tempo_cliente_unidade: "mes",
          }}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
