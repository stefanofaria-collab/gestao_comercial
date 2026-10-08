"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CircleHelp,
  Download,
  FileSpreadsheet,
  ExternalLink,
  MessageCircleMore,
  MousePointerClick,
  RefreshCw,
  SmilePlus,
  ThumbsDown,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";

import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchAtendimentosChurnExport, fetchAtendimentosDashboard, fetchAtendimentosMeta, fetchAtendimentosStatus } from "@/lib/atendimentos-api";
import type {
  AtendimentoClienteRanking,
  AtendimentoChurnExportResponse,
  AtendimentoChurnExportRow,
  AtendimentoMotivoDemografia,
  AtendimentosDashboardResponse,
  AtendimentosMetaResponse,
} from "@/types/atendimentos";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatInteger(value: number | null | undefined) {
  return integer.format(Math.round(value ?? 0));
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function durationLabel(value: string | null | undefined) {
  return ({ M: "Mensal", T: "Trimestral", S: "Semestral", A: "Anual" } as Record<string, string>)[value || ""] ?? value ?? "—";
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function downloadFile(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${decimal.format(value)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDuration(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shortDuration(value: number) {
  return formatDuration(value);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1].slice(0, 3)}/${String(year).slice(-2)}`;
}

function sexLabel(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "M" || normalized === "MASCULINO") return "Masculino";
  if (normalized === "F" || normalized === "FEMININO") return "Feminino";
  if (!normalized || normalized === "NÃO INFORMADO" || normalized === "NAO INFORMADO") return "Não informado";
  return value;
}

function HelpTip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Explicação"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
      >
        <CircleHelp size={14} />
      </button>
      <div className="pointer-events-none invisible absolute right-0 top-8 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        {text}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle, help }: { title: string; subtitle: string; help: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <HelpTip text={help} />
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  footer,
  help,
  icon,
}: {
  title: string;
  value: string;
  footer: string;
  help: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">{icon}</div>
        <HelpTip text={help} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">{footer}</p>
    </div>
  );
}

function ChurnMetricCard({
  title,
  value,
  help,
  footer,
}: {
  title: string;
  value: string;
  help: string;
  footer?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold leading-5 text-slate-500">{title}</p>
        <HelpTip text={help} />
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      {footer ? <p className="mt-2 text-[11px] leading-4 text-slate-400">{footer}</p> : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  help,
  option,
  height = 360,
  onEvents,
  interactive = false,
  interactiveText = "Clique para detalhar",
}: {
  title: string;
  subtitle: string;
  help: string;
  option: any;
  height?: number;
  onEvents?: Record<string, (params: any) => void>;
  interactive?: boolean;
  interactiveText?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionTitle title={title} subtitle={subtitle} help={help} />
      {interactive ? (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
          <MousePointerClick size={12} /> {interactiveText}
        </div>
      ) : null}
      <ReactECharts option={option} style={{ height }} notMerge lazyUpdate onEvents={onEvents} />
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw className="mx-auto animate-spin text-blue-600" size={24} />
        <p className="mt-3 text-sm font-semibold text-slate-700">Carregando atendimentos...</p>
        <p className="mt-1 text-xs text-slate-400">Lendo as informações já salvas no banco do projeto.</p>
      </div>
    </div>
  );
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <p className="font-semibold">Não foi possível carregar os atendimentos.</p>
      <p className="mt-2 text-sm">{message}</p>
      <button type="button" onClick={retry} className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold">
        Tentar novamente
      </button>
    </div>
  );
}

function motivesBySex(rows: AtendimentoMotivoDemografia[]) {
  const motives = Array.from(new Set(rows.map((row) => row.motivo)));
  const sexes = Array.from(new Set(rows.map((row) => sexLabel(row.sexo))));
  return { motives, sexes };
}

type MotiveMode = "geral" | "sexo" | "idade";

function ClientDetailModal({ client, onClose }: { client: AtendimentoClienteRanking; onClose: () => void }) {
  const motives = client.motivos ?? [];
  const option = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 180, right: 25, top: 15, bottom: 35 },
    xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
    yAxis: { type: "category", inverse: true, data: motives.map((item) => item.motivo) },
    series: [{ name: "Atendimentos", type: "bar", data: motives.map((item) => item.atendimentos), barMaxWidth: 28 }],
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Detalhamento do cliente</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{client.cliente}</h2>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>{formatInteger(client.atendimentos)} atendimento(s)</span>
              <span>Tempo total: {formatDuration(client.duracao_total_segundos)}</span>
              <span>Tempo médio: {formatDuration(client.duracao_media_segundos)}</span>
            </div>
            <a
              href={client.intranet_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              Abrir cliente no intranet <ExternalLink size={14} />
            </a>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          <SectionTitle
            title="Motivos dos atendimentos"
            subtitle="Quantidade de contatos deste cliente por motivo no período selecionado."
            help="Mostra apenas os atendimentos do mesmo período usado nos rankings da página."
          />
          {motives.length ? (
            <ReactECharts option={option} style={{ height: Math.max(340, Math.min(650, motives.length * 38 + 100)) }} notMerge lazyUpdate />
          ) : (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Nenhum motivo identificado para este cliente.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AtendimentosDashboard() {
  const { filters } = useGlobalFilters();
  const [meta, setMeta] = useState<AtendimentosMetaResponse | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<AtendimentosDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMotive, setSelectedMotive] = useState<string | null>(null);
  const [selectedMotiveMode, setSelectedMotiveMode] = useState<MotiveMode>("geral");
  const requestSequence = useRef(0);
  const [selectedClient, setSelectedClient] = useState<AtendimentoClienteRanking | null>(null);
  const [churnExport, setChurnExport] = useState<AtendimentoChurnExportResponse | null>(null);
  const [churnExportLoading, setChurnExportLoading] = useState(false);
  const [churnExportError, setChurnExportError] = useState<string | null>(null);
  const [churnExportPage, setChurnExportPage] = useState(1);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetchAtendimentosMeta();
        if (!active) return;
        setMeta(response);
        setYear(filters.ano);
        setMonth(filters.meses[0] ?? response.mes_padrao);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro inesperado.");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const load = async (targetYear: number, targetMonth: number, silent = false, force = false) => {
    const requestId = ++requestSequence.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetchAtendimentosDashboard(targetYear, targetMonth, filters, force);
      if (requestId !== requestSequence.current) return;
      if (response.periodo.ano !== targetYear || response.periodo.mes !== targetMonth) {
        throw new Error("A API retornou um período diferente do solicitado. Atualize novamente.");
      }
      setData(response);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      if (!silent && requestId === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (year === null || month === null) return;
    void load(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, filters.empresa, filters.origem, filters.pagador]);

  useEffect(() => {
    const cacheRefreshing = Boolean(data?._cache_info?.refreshing || data?._cache_info?.fallback);
    if (!data || (data.sincronizacao.atualizado && !cacheRefreshing)) return;

    const timer = globalThis.setInterval(async () => {
      try {
        const status = await fetchAtendimentosStatus();
        if (status.atualizado && year !== null && month !== null) {
          const response = await fetchAtendimentosDashboard(year, month, filters, true);
          if (response.periodo.ano !== year || response.periodo.mes !== month) return;
          setData(response);
          if (!response._cache_info?.refreshing && !response._cache_info?.fallback) {
            globalThis.clearInterval(timer);
          }
        }
      } catch {
        // Mantém os dados já carregados.
      }
    }, 15000);
    return () => globalThis.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.sincronizacao.atualizado, data?._cache_info?.refreshing, data?._cache_info?.fallback, year, month]);

  useEffect(() => {
    if (!data) return;
    let active = true;
    setChurnExportLoading(true);
    setChurnExportError(null);
    fetchAtendimentosChurnExport(filters)
      .then((response) => {
        if (!active) return;
        setChurnExport(response);
        setChurnExportPage(1);
      })
      .catch((err) => {
        if (!active) return;
        setChurnExportError(err instanceof Error ? err.message : "Erro ao carregar os atendimentos de churn.");
      })
      .finally(() => {
        if (active) setChurnExportLoading(false);
      });
    return () => { active = false; };
  }, [data?.churn_atendimentos.resumo.clientes_churnados_com_atendimento, filters.empresa, filters.origem, filters.pagador]);

  const churnExportColumns: Array<{ key: keyof AtendimentoChurnExportRow; label: string }> = [
    { key: "data_atendimento", label: "Data do atendimento" },
    { key: "plano", label: "Plano" },
    { key: "duracao", label: "Duração" },
    { key: "valor", label: "Valor" },
    { key: "motivo", label: "Motivo do atendimento" },
    { key: "email_cliente", label: "E-mail do cliente" },
    { key: "email_atendente", label: "E-mail do atendente" },
    { key: "avaliacao", label: "Avaliação" },
    { key: "duracao_humano_segundos", label: "Tempo com humano" },
  ];

  function churnCellValue(row: AtendimentoChurnExportRow, key: keyof AtendimentoChurnExportRow): string | number {
    if (key === "data_atendimento") return formatDate(row.data_atendimento);
    if (key === "duracao") return durationLabel(row.duracao);
    if (key === "valor") return row.valor;
    if (key === "duracao_humano_segundos") return formatDuration(row.duracao_humano_segundos);
    return String(row[key] ?? "");
  }

  function downloadChurnCsv() {
    if (!churnExport) return;
    const header = churnExportColumns.map((column) => csvCell(column.label)).join(";");
    const body = churnExport.rows.map((row) =>
      churnExportColumns.map((column) => {
        const value = column.key === "valor" ? formatMoney(row.valor) : churnCellValue(row, column.key);
        return csvCell(value);
      }).join(";")
    ).join("\r\n");
    downloadFile(`\uFEFF${header}\r\n${body}`, "text/csv;charset=utf-8", "atendimentos_clientes_churn.csv");
  }

  async function downloadChurnXlsx() {
    if (!churnExport) return;
    const XLSX = await import("xlsx");
    const rows = churnExport.rows.map((row) => ({
      "Data do atendimento": formatDate(row.data_atendimento),
      Plano: row.plano,
      "Duração": durationLabel(row.duracao),
      Valor: row.valor,
      "Motivo do atendimento": row.motivo,
      "E-mail do cliente": row.email_cliente,
      "E-mail do atendente": row.email_atendente,
      "Avaliação": row.avaliacao,
      "Tempo com humano": formatDuration(row.duracao_humano_segundos),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 32 },
      { wch: 34 }, { wch: 34 }, { wch: 18 }, { wch: 18 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Atendimentos churn");
    XLSX.writeFile(workbook, "atendimentos_clientes_churn.xlsx");
  }

  const historyOption = useMemo(() => {
    const rows = data?.historico ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["Atendimentos", "Clientes únicos", "% da base ativa"] },
      grid: { left: 55, right: 65, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => monthLabel(row.mes)), boundaryGap: false },
      yAxis: [
        { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
        { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)}%` }, splitLine: { show: false } },
      ],
      series: [
        { name: "Atendimentos", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.atendimentos) },
        { name: "Clientes únicos", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.clientes_unicos) },
        { name: "% da base ativa", type: "line", smooth: true, showSymbol: false, yAxisIndex: 1, data: rows.map((row) => row.percentual_base) },
      ],
    };
  }, [data]);

  const planOption = useMemo(() => {
    const rows = data?.planos_historico ?? [];
    const months = Array.from(new Set(rows.map((row) => row.mes))).sort();
    const totals = new Map<string, number>();
    rows.forEach((row) => totals.set(row.plano, (totals.get(row.plano) ?? 0) + row.clientes_unicos));
    const plans = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([plan]) => plan);
    return {
      tooltip: { trigger: "axis" },
      legend: { type: "scroll", top: 0, data: plans },
      grid: { left: 55, right: 25, top: 65, bottom: 45 },
      xAxis: { type: "category", data: months.map(monthLabel), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: plans.map((plan) => ({
        name: plan,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: months.map((monthValue) => rows.find((row) => row.mes === monthValue && row.plano === plan)?.clientes_unicos ?? 0),
      })),
    };
  }, [data]);

  const lifecycleOption = useMemo(() => {
    const rows = data?.ciclo_vida_historico ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["Até 30 dias após contratação", "Até 30 dias antes do churn"] },
      grid: { left: 55, right: 25, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => monthLabel(row.mes)), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: [
        { name: "Até 30 dias após contratação", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.ate_30_dias_contratacao) },
        { name: "Até 30 dias antes do churn", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.ate_30_dias_antes_churn) },
      ],
    };
  }, [data]);

  const usersOption = useMemo(() => {
    const rows = data?.historico ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["Atendimentos", "Usuários únicos por e-mail"] },
      grid: { left: 55, right: 25, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => monthLabel(row.mes)), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: [
        { name: "Atendimentos", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.atendimentos) },
        { name: "Usuários únicos por e-mail", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.usuarios_unicos) },
      ],
    };
  }, [data]);

  const sexOption = useMemo(() => {
    const rows = data?.demografia.sexo ?? [];
    return {
      tooltip: { trigger: "item", formatter: (params: any) => `${params.name}: ${formatInteger(params.value)} usuário(s)` },
      legend: { bottom: 0 },
      series: [{
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        label: { formatter: "{b}\n{d}%" },
        data: rows.map((row) => ({ name: sexLabel(row.sexo), value: row.usuarios })),
      }],
    };
  }, [data]);

  const ageOption = useMemo(() => {
    const rows = (data?.demografia.sexo ?? []).filter((row) => row.idade_media !== null);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 90, right: 35, top: 20, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)} anos` } },
      yAxis: { type: "category", data: rows.map((row) => sexLabel(row.sexo)) },
      series: [{ type: "bar", data: rows.map((row) => row.idade_media) }],
    };
  }, [data]);

  const motiveSexOption = useMemo(() => {
    const rows = data?.demografia.motivos ?? [];
    const { motives, sexes } = motivesBySex(rows);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { type: "scroll", top: 0, data: sexes },
      grid: { left: 150, right: 25, top: 55, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", data: motives },
      series: sexes.map((sex) => ({
        name: sex,
        type: "bar",
        stack: "sexo",
        data: motives.map((motive) => rows.filter((row) => row.motivo === motive && sexLabel(row.sexo) === sex).reduce((sum, row) => sum + row.atendimentos, 0)),
      })),
    };
  }, [data]);

  const motiveAgeOption = useMemo(() => {
    const rows = data?.demografia.motivos ?? [];
    const motives = Array.from(new Set(rows.map((row) => row.motivo)));
    const values = motives.map((motive) => {
      const filtered = rows.filter((row) => row.motivo === motive && row.idade_media !== null);
      const denominator = filtered.reduce((sum, row) => sum + row.usuarios_unicos, 0);
      const numerator = filtered.reduce((sum, row) => sum + (row.idade_media ?? 0) * row.usuarios_unicos, 0);
      return denominator ? Math.round((numerator / denominator) * 10) / 10 : null;
    });
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 150, right: 35, top: 25, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)} anos` } },
      yAxis: { type: "category", data: motives },
      series: [{ type: "bar", data: values }],
    };
  }, [data]);

  const motiveGeneralOption = useMemo(() => {
    const rows = data?.motivos_geral ?? [];
    const sorted = [...rows].sort((a, b) => b.atendimentos - a.atendimentos);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 220, right: 35, top: 20, bottom: 45 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", inverse: true, data: sorted.map((row) => row.motivo) },
      dataZoom: sorted.length > 18 ? [{ type: "inside", yAxisIndex: 0, startValue: 0, endValue: 17 }, { type: "slider", yAxisIndex: 0, right: 4, width: 12 }] : [],
      series: [{ name: "Atendimentos", type: "bar", data: sorted.map((row) => row.atendimentos) }],
    };
  }, [data]);

  const motiveEvolutionOption = useMemo(() => {
    if (!data || !selectedMotive) return {};
    const allMonths = Array.from(new Set(data.motivos_historico.map((row) => row.mes))).sort();
    const rows = data.motivos_historico.filter((row) => row.motivo === selectedMotive);

    if (selectedMotiveMode === "sexo") {
      const sexes = Array.from(new Set(rows.map((row) => sexLabel(row.sexo))));
      return {
        tooltip: { trigger: "axis" },
        legend: { type: "scroll", top: 0, data: sexes },
        grid: { left: 55, right: 25, top: 55, bottom: 45 },
        xAxis: { type: "category", data: allMonths.map(monthLabel), boundaryGap: false },
        yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
        series: sexes.map((sex) => ({
          name: sex,
          type: "line",
          smooth: true,
          showSymbol: false,
          data: allMonths.map((monthValue) => rows
            .filter((row) => row.mes === monthValue && sexLabel(row.sexo) === sex)
            .reduce((sum, row) => sum + row.atendimentos, 0)),
        })),
      };
    }

    if (selectedMotiveMode === "idade") {
      const values = allMonths.map((monthValue) => {
        const monthRows = rows.filter((row) => row.mes === monthValue && row.idade_media !== null);
        const denominator = monthRows.reduce((sum, row) => sum + row.usuarios_unicos, 0);
        const numerator = monthRows.reduce((sum, row) => sum + (row.idade_media ?? 0) * row.usuarios_unicos, 0);
        return denominator ? Math.round((numerator / denominator) * 10) / 10 : null;
      });
      return {
        tooltip: { trigger: "axis", valueFormatter: (value: number | null) => value === null ? "—" : `${decimal.format(value)} anos` },
        grid: { left: 65, right: 25, top: 25, bottom: 45 },
        xAxis: { type: "category", data: allMonths.map(monthLabel), boundaryGap: false },
        yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)} anos` } },
        series: [{ name: "Idade média", type: "line", smooth: true, showSymbol: false, data: values }],
      };
    }

    return {
      tooltip: { trigger: "axis" },
      grid: { left: 55, right: 25, top: 25, bottom: 45 },
      xAxis: { type: "category", data: allMonths.map(monthLabel), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: [{
        name: "Atendimentos",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: allMonths.map((monthValue) => rows.filter((row) => row.mes === monthValue).reduce((sum, row) => sum + row.atendimentos, 0)),
      }],
    };
  }, [data, selectedMotive, selectedMotiveMode]);

  const topContactsOption = useMemo(() => {
    const rows = data?.clientes_rankings.mais_atendimentos ?? [];
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 180, right: 25, top: 15, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", inverse: true, data: rows.map((row) => row.cliente) },
      series: [{ type: "bar", data: rows.map((row) => row.atendimentos), barMaxWidth: 28 }],
    };
  }, [data]);

  const topDurationOption = useMemo(() => {
    const rows = data?.clientes_rankings.maior_tempo_total ?? [];
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: number) => formatDuration(value),
      },
      grid: { left: 180, right: 35, top: 15, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => shortDuration(value) } },
      yAxis: { type: "category", inverse: true, data: rows.map((row) => row.cliente) },
      series: [{ type: "bar", data: rows.map((row) => row.duracao_total_segundos), barMaxWidth: 28 }],
    };
  }, [data]);

  const timeBySexOption = useMemo(() => {
    const rows = data?.tempo_atendimento.por_sexo ?? [];
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: any[]) => {
          const index = Number(params?.[0]?.dataIndex ?? 0);
          const row = rows[index];
          if (!row) return "";
          return `<strong>${sexLabel(row.sexo)}</strong><br/>Tempo médio: ${formatDuration(row.duracao_media_segundos)}<br/>Atendimentos: ${formatInteger(row.atendimentos)}`;
        },
      },
      legend: { top: 0, data: ["Tempo médio", "Atendimentos"] },
      grid: { left: 90, right: 65, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => sexLabel(row.sexo)) },
      yAxis: [
        { type: "value", axisLabel: { formatter: (value: number) => shortDuration(value) } },
        { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) }, splitLine: { show: false } },
      ],
      series: [
        { name: "Tempo médio", type: "bar", data: rows.map((row) => row.duracao_media_segundos), barMaxWidth: 42 },
        { name: "Atendimentos", type: "line", yAxisIndex: 1, data: rows.map((row) => row.atendimentos), smooth: true },
      ],
    };
  }, [data]);

  const timeByAgeOption = useMemo(() => {
    const rows = data?.tempo_atendimento.por_faixa_etaria ?? [];
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: any[]) => {
          const index = Number(params?.[0]?.dataIndex ?? 0);
          const row = rows[index];
          if (!row) return "";
          return `<strong>${row.faixa_etaria}</strong><br/>Tempo médio: ${formatDuration(row.duracao_media_segundos)}<br/>Atendimentos: ${formatInteger(row.atendimentos)}`;
        },
      },
      legend: { top: 0, data: ["Tempo médio", "Atendimentos"] },
      grid: { left: 90, right: 65, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => row.faixa_etaria) },
      yAxis: [
        { type: "value", axisLabel: { formatter: (value: number) => shortDuration(value) } },
        { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) }, splitLine: { show: false } },
      ],
      series: [
        { name: "Tempo médio", type: "bar", data: rows.map((row) => row.duracao_media_segundos), barMaxWidth: 42 },
        { name: "Atendimentos", type: "line", yAxisIndex: 1, data: rows.map((row) => row.atendimentos), smooth: true },
      ],
    };
  }, [data]);

  const rankingOption = (rows: AtendimentoClienteRanking[], field: "avaliacoes" | "positivas" | "negativas") => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 160, right: 25, top: 15, bottom: 35 },
    xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
    yAxis: { type: "category", inverse: true, data: rows.map((row) => row.cliente) },
    series: [{ type: "bar", data: rows.map((row) => row[field]), barMaxWidth: 25 }],
  });

  const agentTimeOption = useMemo(() => {
    const rows = data?.tempo_atendimento.por_atendente ?? [];
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any[]) => {
          const index = Number(params?.[0]?.dataIndex ?? 0);
          const row = rows[index];
          if (!row) return "";
          return `<strong>${row.atendente}</strong><br/>${row.email_atendente}<br/>Tempo médio: ${formatDuration(row.duracao_media_segundos)}<br/>Atendimentos: ${formatInteger(row.atendimentos)}`;
        },
      },
      grid: { left: 190, right: 35, top: 20, bottom: 45 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => shortDuration(value) } },
      yAxis: { type: "category", inverse: true, data: rows.map((row) => row.atendente) },
      series: [{ type: "bar", data: rows.map((row) => row.duracao_media_segundos), barMaxWidth: 26 }],
    };
  }, [data]);

  const churnMotiveOption = useMemo(() => {
    const rows = data?.churn_atendimentos.motivos ?? [];
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any[]) => {
          const index = Number(params?.[0]?.dataIndex ?? 0);
          const row = rows[index];
          if (!row) return "";
          return `<strong>${row.motivo}</strong><br/>Clientes churnados: ${formatInteger(row.clientes)}<br/>Atendimentos: ${formatInteger(row.atendimentos)}<br/>Tempo médio: ${formatDuration(row.duracao_media_segundos)}`;
        },
      },
      grid: { left: 190, right: 25, top: 15, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", inverse: true, data: rows.map((row) => row.motivo) },
      series: [{ name: "Clientes", type: "bar", data: rows.map((row) => row.clientes), barMaxWidth: 28 }],
    };
  }, [data]);

  const churnAgentOption = useMemo(() => {
    const rows = data?.churn_atendimentos.atendentes ?? [];
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any[]) => {
          const index = Number(params?.[0]?.dataIndex ?? 0);
          const row = rows[index];
          if (!row) return "";
          return `<strong>${row.atendente}</strong><br/>${row.email_atendente}<br/>Clientes churnados: ${formatInteger(row.clientes)}<br/>Atendimentos: ${formatInteger(row.atendimentos)}<br/>Tempo médio: ${formatDuration(row.duracao_media_segundos)}`;
        },
      },
      grid: { left: 190, right: 25, top: 15, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", inverse: true, data: rows.map((row) => row.atendente) },
      series: [{ name: "Clientes", type: "bar", data: rows.map((row) => row.clientes), barMaxWidth: 28 }],
    };
  }, [data]);

  const openMotive = (motive: string, mode: MotiveMode) => {
    if (!motive) return;
    setSelectedMotive(motive);
    setSelectedMotiveMode(mode);
  };

  const retry = () => {
    if (year !== null && month !== null) void load(year, month, false, true);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Atendimentos</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
              Entenda quantos clientes procuram o suporte, quando entram em contato e quais padrões aparecem nos atendimentos.
            </p>
          </div>

          <div className="hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500"><CalendarDays size={18} /></div>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Mês
                <select value={month ?? 1} onChange={(event) => setMonth(Number(event.target.value))} className="min-w-[160px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Ano
                <select value={year ?? 2024} onChange={(event) => setYear(Number(event.target.value))} className="min-w-[110px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {(meta?.anos ?? [2024]).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>

        {data && (!data.sincronizacao.atualizado || data.sincronizacao.executando) ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {data.sincronizacao.contexto_pendente
                ? "Os planos e o contexto dos atendimentos estão sendo preparados em segundo plano."
                : "Os atendimentos mais recentes estão sendo atualizados em segundo plano."}
            </p>
            <p className="mt-1 text-xs leading-5">
              Último atendimento disponível: {formatDate(data.dados.ultima_data)}. Data esperada: {formatDate(data.sincronizacao.data_alvo)}.
            </p>
          </div>
        ) : null}

        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} retry={retry} /> : data ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Atendimentos no período" value={formatInteger(data.cards.atendimentos)} footer={filters.anoCompleto ? `Ano completo de ${filters.ano}` : filters.meses.length > 1 ? `${MONTHS[(filters.meses[0] ?? 1) - 1]} a ${MONTHS[(filters.meses[filters.meses.length - 1] ?? 1) - 1]} de ${filters.ano}` : `${MONTHS[(filters.meses[0] ?? data.periodo.mes) - 1]} de ${filters.ano}`} help="Conta cada atendimento registrado no período. O dia atual nunca entra no cálculo." icon={<MessageCircleMore size={20} />} />
              <MetricCard title="Clientes únicos que entraram em contato" value={formatInteger(data.cards.clientes_unicos)} footer="Cada empresa é contada apenas uma vez." help="Mostra quantas empresas diferentes procuraram o suporte." icon={<UsersRound size={20} />} />
              <MetricCard title="Percentual da base ativa que entrou em contato" value={formatPercent(data.cards.percentual_base)} footer={data.cards.clientes_ativos ? `Base ativa usada: ${formatInteger(data.cards.clientes_ativos)} clientes.` : "A base ativa ainda não está disponível para este filtro."} help="Compara os clientes ativos que procuraram suporte com a base ativa no primeiro dia do mês." icon={<UserRoundCheck size={20} />} />
              <MetricCard title="Avaliações positivas" value={formatInteger(data.cards.positivas)} footer="Atendimentos avaliados positivamente." help="Conta somente avaliações positivas." icon={<SmilePlus size={20} />} />
              <MetricCard title="Avaliações negativas" value={formatInteger(data.cards.negativas)} footer="Atendimentos avaliados negativamente." help="Conta somente avaliações negativas." icon={<ThumbsDown size={20} />} />
            </div>

            <ChartCard title="Evolução dos atendimentos e clientes desde 2024" subtitle="Atendimentos, clientes únicos e percentual da base ativa." help="O histórico considera somente dados até o dia anterior." option={historyOption} height={390} />
            <ChartCard title="Clientes únicos atendidos por plano" subtitle="Quantos clientes diferentes de cada plano procuraram o suporte por mês." help="O plano é identificado pelo contrato correspondente ao período do atendimento." option={planOption} height={420} />

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Contato perto da contratação e perto do churn" subtitle="Compara contatos até 30 dias após a contratação e antes do churn." help="A segunda linha considera ciclos identificados como churn." option={lifecycleOption} />
              <ChartCard title="Atendimentos e usuários únicos por e-mail" subtitle="Todas as conversas versus pessoas únicas identificadas por e-mail." help="Cada e-mail aparece uma vez por mês na linha de usuários únicos." option={usersOption} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Sexo dos usuários que entraram em contato" subtitle="Distribuição de usuários únicos no período selecionado." help="Quando o sexo não é identificado com segurança, fica como não informado." option={sexOption} />
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle title="Idade média dos usuários" subtitle={data.demografia.idade_media !== null ? `Média geral do período: ${decimal.format(data.demografia.idade_media)} anos.` : "Ainda não há idade suficiente para calcular a média."} help="A idade é calculada na data do atendimento. Idades abaixo de 16 ou acima de 90 são ignoradas." />
                <ReactECharts option={ageOption} style={{ height: 360 }} notMerge lazyUpdate />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Motivo do atendimento por sexo" subtitle="Principais motivos e distribuição por sexo." help="Mostra associação nos dados; não representa causalidade." option={motiveSexOption} height={470} interactive interactiveText="Clique em um motivo para ver a evolução mensal" onEvents={{ click: (params: any) => openMotive(String(params?.name ?? ""), "sexo") }} />
              <ChartCard title="Idade média por motivo do atendimento" subtitle="Compara a idade média nos principais motivos." help="Usa somente idades consideradas válidas." option={motiveAgeOption} height={470} interactive interactiveText="Clique em um motivo para ver a evolução mensal" onEvents={{ click: (params: any) => openMotive(String(params?.name ?? ""), "idade") }} />
            </div>

            <ChartCard title="Quantidade de atendimentos por motivo" subtitle="Quantos atendimentos foram classificados em cada motivo." help="Clique em uma barra para acompanhar o motivo mês a mês." option={motiveGeneralOption} height={Math.max(430, Math.min(900, (data.motivos_geral?.length ?? 0) * 30 + 120))} interactive interactiveText="Clique em um motivo para ver a evolução mensal" onEvents={{ click: (params: any) => openMotive(String(params?.name ?? ""), "geral") }} />

            <div className="border-t border-slate-200 pt-6">
              <h2 className="text-xl font-bold text-slate-950">Clientes que mais acionam o suporte</h2>
              <p className="mt-1 text-sm text-slate-500">Clique em um cliente para ver os motivos e abrir o cadastro no intranet.</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Top 10 clientes por quantidade de atendimentos" subtitle="Clientes que mais entraram em contato no período." help="Cada atendimento é contado, mesmo quando o cliente abriu mais de um chamado." option={topContactsOption} height={440} interactive interactiveText="Clique no cliente para detalhar" onEvents={{ click: (params: any) => { const row = data.clientes_rankings.mais_atendimentos[Number(params?.dataIndex ?? -1)]; if (row) setSelectedClient(row); } }} />
              <ChartCard title="Top 10 clientes por tempo total de atendimento" subtitle="Soma da coluna duracao_humano no período." help="Todas as análises de tempo usam exclusivamente duracao_humano." option={topDurationOption} height={440} interactive interactiveText="Clique no cliente para detalhar" onEvents={{ click: (params: any) => { const row = data.clientes_rankings.maior_tempo_total[Number(params?.dataIndex ?? -1)]; if (row) setSelectedClient(row); } }} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Tempo médio de atendimento por sexo" subtitle="Barras = tempo médio; linha = total de atendimentos." help="O tempo médio considera somente duracao_humano não nula." option={timeBySexOption} height={390} />
              <ChartCard title="Tempo médio de atendimento por faixa etária" subtitle="16-20, 21-25, 26-30, 31-35, 36-40, 40-45, 46-50 e 50+." help="Barras = tempo médio em duracao_humano; linha = total de atendimentos." option={timeByAgeOption} height={390} />
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h2 className="text-xl font-bold text-slate-950">Rankings de avaliações</h2>
              <p className="mt-1 text-sm text-slate-500">Os rankings são feitos por cliente no período selecionado.</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <ChartCard title="10 clientes que mais avaliaram" subtitle="Positivas + negativas." help="Conta apenas atendimentos que receberam avaliação." option={rankingOption(data.clientes_rankings.mais_avaliaram, "avaliacoes")} height={420} interactive interactiveText="Clique no cliente para detalhar" onEvents={{ click: (params: any) => { const row = data.clientes_rankings.mais_avaliaram[Number(params?.dataIndex ?? -1)]; if (row) setSelectedClient(row); } }} />
              <ChartCard title="10 clientes com mais avaliações positivas" subtitle="Ranking por quantidade de positivas." help="Em empate, usamos o total de avaliações e depois o nome do cliente." option={rankingOption(data.clientes_rankings.mais_positivas, "positivas")} height={420} interactive interactiveText="Clique no cliente para detalhar" onEvents={{ click: (params: any) => { const row = data.clientes_rankings.mais_positivas[Number(params?.dataIndex ?? -1)]; if (row) setSelectedClient(row); } }} />
              <ChartCard title="10 clientes com mais avaliações negativas" subtitle="Ranking por quantidade de negativas." help="Em empate, usamos o total de avaliações e depois o nome do cliente." option={rankingOption(data.clientes_rankings.mais_negativas, "negativas")} height={420} interactive interactiveText="Clique no cliente para detalhar" onEvents={{ click: (params: any) => { const row = data.clientes_rankings.mais_negativas[Number(params?.dataIndex ?? -1)]; if (row) setSelectedClient(row); } }} />
            </div>

            <ChartCard title="Tempo médio entre atribuição e encerramento por atendente" subtitle="Mostra quanto tempo transcorreu entre o atendimento ser atribuído e ser encerrado." help="Este tempo mede o intervalo entre atribuição e encerramento do atendimento. Ele não representa, necessariamente, o tempo em que o atendente ficou trabalhando ativamente no chamado." option={agentTimeOption} height={Math.max(500, Math.min(900, (data.tempo_atendimento.por_atendente?.length ?? 0) * 30 + 140))} />

            <div className="border-t border-slate-200 pt-6">
              <h2 className="text-xl font-bold text-slate-950">Atendimentos dos clientes que churnaram</h2>
              <p className="mt-1 text-sm text-slate-500">Os empresa_id vêm da consulta Churn e atrasados com 60+ dias vencidos. Depois cruzamos com todo o histórico de atendimentos desde 2024 até ontem.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <ChurnMetricCard
                title="Clientes com 60+ dias de atraso"
                value={formatInteger(data.churn_atendimentos.resumo.clientes_churn_periodo)}
                help="Quantidade de empresa_id encontrados na consulta Churn e atrasados com dias_vencido maior ou igual a 60. Este é o universo de clientes considerado como churn nesta análise."
              />
              <ChurnMetricCard
                title="Clientes churnados com atendimento"
                value={formatInteger(data.churn_atendimentos.resumo.clientes_churnados_com_atendimento)}
                footer={`Histórico: ${formatDate(data.churn_atendimentos.periodo_atendimentos.inicio)} a ${formatDate(data.churn_atendimentos.periodo_atendimentos.fim)}`}
                help="Dos clientes com 60+ dias de atraso, mostra quantos possuem pelo menos um atendimento no histórico desde 01/01/2024 até ontem."
              />
              <ChurnMetricCard
                title="Atendimentos desses clientes"
                value={formatInteger(data.churn_atendimentos.resumo.atendimentos)}
                help="Soma de todos os atendimentos encontrados para os empresa_id dos clientes com 60+ dias de atraso, considerando todo o histórico disponível desde 2024 até ontem."
              />
              <ChurnMetricCard
                title="Correlação: atendimentos x tempo total"
                value={data.churn_atendimentos.resumo.corr_atendimentos_duracao_total === null ? "—" : decimal2.format(data.churn_atendimentos.resumo.corr_atendimentos_duracao_total)}
                help="Correlação de Pearson entre a quantidade de atendimentos de cada cliente churnado e o tempo total somado em duracao_humano. Varia de -1 a +1. O sinal mostra a direção; em módulo, abaixo de 0,30 é fraca, de 0,30 a 0,70 é moderada e acima de 0,70 é forte. Correlação não significa causalidade."
              />
              <ChurnMetricCard
                title="Correlação: atendimentos x tempo médio por atendente"
                value={data.churn_atendimentos.resumo.corr_atendimentos_duracao_media_atendente === null ? "—" : decimal2.format(data.churn_atendimentos.resumo.corr_atendimentos_duracao_media_atendente)}
                help="Correlação de Pearson calculada entre atendentes: para cada email_atendente, comparamos o volume de atendimentos de clientes churnados com o tempo médio de duracao_humano. Varia de -1 a +1. Em módulo, abaixo de 0,30 é fraca, de 0,30 a 0,70 é moderada e acima de 0,70 é forte. Correlação não significa causalidade."
              />
              <ChurnMetricCard
                title="Associação: churn x motivo do atendimento"
                value={data.churn_atendimentos.resumo.associacao_churn_motivo === null ? "—" : decimal2.format(data.churn_atendimentos.resumo.associacao_churn_motivo)}
                help="Como motivo é uma variável categórica, usamos V de Cramér em vez de Pearson. O valor vai de 0 a 1: próximo de 0 indica pouca associação entre motivo e churn; quanto mais perto de 1, mais forte a associação. Como referência aproximada: até 0,10 muito fraca, 0,10–0,30 fraca, 0,30–0,50 moderada e acima de 0,50 forte. Associação não significa causalidade."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Motivos entre clientes que churnaram" subtitle="Quantidade de clientes churnados por motivo." help="No tooltip também aparecem atendimentos e duração média de atendimento." option={churnMotiveOption} height={470} />
              <ChartCard title="Atendentes nos contatos de clientes que churnaram" subtitle="Quantidade de clientes churnados atendidos por pessoa." help="A pessoa é diferenciada pelo email_atendente. O gráfico mostra associação, não causalidade." option={churnAgentOption} height={470} />
            </div>

            {data.churn_atendimentos.clientes.length ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5">
                  <SectionTitle title="Clientes churnados com mais atendimentos" subtitle="Detalhamento dos clientes com maior volume de contato no histórico desde 2024." help="A tabela mostra quantidade de atendimentos, variedade de motivos e atendentes e os tempos calculados com duracao_humano." />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3 text-right">Atend.</th><th className="px-4 py-3 text-right">Motivos</th><th className="px-4 py-3 text-right">Atendentes</th><th className="px-4 py-3 text-right">Tempo médio</th><th className="px-4 py-3 text-right">Tempo total</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.churn_atendimentos.clientes.slice(0, 10).map((row) => (
                        <tr key={row.empresa_id}>
                          <td className="px-4 py-3"><div className="font-semibold text-slate-900">{row.cliente}</div><a href={row.intranet_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Abrir no intranet <ExternalLink size={11} /></a></td>
                          <td className="px-4 py-3 text-right">{formatInteger(row.atendimentos)}</td>
                          <td className="px-4 py-3 text-right">{formatInteger(row.motivos_distintos)}</td>
                          <td className="px-4 py-3 text-right">{formatInteger(row.atendentes_distintos)}</td>
                          <td className="px-4 py-3 text-right">{formatDuration(row.duracao_media_segundos)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatDuration(row.duracao_total_segundos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <SectionTitle
                  title="Todos os atendimentos de clientes que churnaram"
                  subtitle="Histórico completo desde 2024 dos clientes atualmente com 60 dias ou mais de atraso."
                  help="Cada linha representa um atendimento. A tabela mostra o plano correspondente ao momento do contato, os e-mails utilizados e a duração do contato humano."
                />
                {churnExport ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={downloadChurnCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Download size={15} /> CSV
                    </button>
                    <button type="button" onClick={() => void downloadChurnXlsx()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                      <FileSpreadsheet size={15} /> XLSX
                    </button>
                  </div>
                ) : null}
              </div>

              {churnExportLoading ? (
                <div className="p-6 text-sm text-slate-500">Carregando atendimentos de churn...</div>
              ) : churnExportError ? (
                <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{churnExportError}</div>
              ) : churnExport && churnExport.rows.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1550px] w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Plano</th>
                          <th className="px-4 py-3">Duração</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                          <th className="px-4 py-3">Motivo</th>
                          <th className="px-4 py-3">E-mail do cliente</th>
                          <th className="px-4 py-3">E-mail do atendente</th>
                          <th className="px-4 py-3">Avaliação</th>
                          <th className="px-4 py-3 text-right">Tempo com humano</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {churnExport.rows.slice((churnExportPage - 1) * 20, churnExportPage * 20).map((row, index) => (
                          <tr key={`${row.data_atendimento}-${row.email_cliente}-${index}`}>
                            <td className="whitespace-nowrap px-4 py-3">{formatDate(row.data_atendimento)}</td>
                            <td className="px-4 py-3">{row.plano || "—"}</td>
                            <td className="px-4 py-3">{durationLabel(row.duracao)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(row.valor)}</td>
                            <td className="px-4 py-3">{row.motivo || "—"}</td>
                            <td className="px-4 py-3">{row.email_cliente || "—"}</td>
                            <td className="px-4 py-3">{row.email_atendente || "—"}</td>
                            <td className="px-4 py-3">{row.avaliacao || "—"}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">{formatDuration(row.duracao_humano_segundos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>{formatInteger(churnExport.total)} atendimento(s) · 20 linhas por página.</span>
                    <div className="flex gap-2">
                      <button type="button" disabled={churnExportPage <= 1} onClick={() => setChurnExportPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
                      <button type="button" disabled={churnExportPage >= Math.max(1, Math.ceil(churnExport.rows.length / 20))} onClick={() => setChurnExportPage((page) => Math.min(Math.max(1, Math.ceil(churnExport.rows.length / 20)), page + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 text-sm text-slate-500">Nenhum atendimento de cliente churnado encontrado.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500">
              Dados disponíveis de <strong>{formatDate(data.dados.primeira_data)}</strong> até <strong>{formatDate(data.dados.ultima_data)}</strong>. O dia atual não entra em nenhuma análise.
            </div>
          </div>
        ) : null}
      </div>

      {selectedMotive ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Evolução mensal desde 2024</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedMotive}</h2>
              </div>
              <button type="button" onClick={() => setSelectedMotive(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="p-6"><ReactECharts option={motiveEvolutionOption} style={{ height: 520 }} notMerge lazyUpdate /></div>
          </div>
        </div>
      ) : null}

      {selectedClient ? <ClientDetailModal client={selectedClient} onClose={() => setSelectedClient(null)} /> : null}
    </div>
  );
}
