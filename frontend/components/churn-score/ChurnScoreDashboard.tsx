"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleHelp,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingUp,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import { useGlobalFilters, type GlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  fetchChurnScoreClients,
  fetchChurnScoreContactList,
  fetchChurnScoreDashboard,
  fetchChurnScoreMeta,
  trainChurnScore,
} from "@/lib/churn-score-api";
import type {
  ChurnRiskFilter,
  ChurnScoreClient,
  ChurnScoreContactFilters,
  ChurnScoreContactListResponse,
  ChurnScoreDashboardResponse,
  ChurnScoreDistribution,
  ChurnScoreMetricSet,
  ChurnScoreModelMeta,
} from "@/types/churn-score";

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function durationLabel(value: string | null | undefined) {
  if (value === "M") return "Mensal";
  if (value === "T") return "Trimestral";
  if (value === "S") return "Semestral";
  if (value === "A") return "Anual";
  return value || "Não informado";
}

function riskClass(label: string) {
  if (label === "Muito alto") return "bg-red-100 text-red-700 ring-red-200";
  if (label === "Alto") return "bg-orange-100 text-orange-700 ring-orange-200";
  if (label === "Moderado") return "bg-amber-100 text-amber-700 ring-amber-200";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200";
}

function riskFilterLabel(value: ChurnRiskFilter) {
  if (value === "alto_ou_maior") return "Alto e muito alto";
  if (value === "muito_alto") return "Muito alto";
  if (value === "alto") return "Alto";
  if (value === "moderado") return "Moderado";
  if (value === "baixo") return "Baixo";
  return "Todos";
}

function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
        aria-label="Explicar este bloco"
        title="O que significa?"
      >
        <CircleHelp size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-[300px] rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle, help }: { title: string; subtitle: string; help: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <HelpHint text={help} />
    </div>
  );
}

function Kpi({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function TrustCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function ConfidenceSummary({ metrics, distribution }: { metrics?: ChurnScoreMetricSet; distribution?: ChurnScoreDistribution }) {
  if (!metrics) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title="Confiabilidade do score"
        subtitle="Resumo simples do desempenho do score com base no histórico real."
        help="Este bloco mostra se o score consegue colocar mais casos de cancelamento no topo do ranking. Quanto melhor ele concentra os casos reais nas pontuações mais altas, mais útil ele fica para a equipe priorizar clientes."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrustCard title="Topo do ranking" value={`${metrics.lift_10.toFixed(2).replace(".", ",")}x`} subtitle="Os 10% maiores scores concentram várias vezes mais cancelamentos do que uma escolha aleatória." />
        <TrustCard title="Casos encontrados no topo" value={formatPercent(metrics.captura_churn_10)} subtitle="Percentual dos cancelamentos reais que já aparecem nos 10% maiores scores." />
        <TrustCard title="Acerto dos alertas" value={formatPercent(metrics.precision)} subtitle="Entre os clientes sinalizados, quantos realmente cancelaram no histórico analisado." />
        <TrustCard title="Cancelamentos identificados" value={formatPercent(metrics.recall)} subtitle="Entre todos os cancelamentos reais, quantos o score conseguiu encontrar." />
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
        <strong className="text-slate-800">Leitura rápida:</strong>{" "}
        {distribution?.ordenacao_monotonica
          ? "as faixas mais altas do score concentraram mais cancelamentos no histórico analisado. Isso é um bom sinal de que o ranking está organizado da forma certa."
          : "o score é útil, mas as faixas tiveram pequenas oscilações. Vale acompanhar a tabela logo abaixo para ver onde o risco está se concentrando."}
      </div>
    </div>
  );
}

function ScoreDistribution({ distribution }: { distribution?: ChurnScoreDistribution }) {
  if (!distribution || !distribution.faixas?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title="Como o score se comportou no histórico"
        subtitle="Faixas mais altas devem concentrar mais casos reais de cancelamento."
        help="Esta tabela usa dados históricos que ficaram separados para conferência. Se as faixas mais altas tiverem taxas maiores de cancelamento, isso mostra que o ranking está bem organizado."
      />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Faixa do score</th>
              <th className="px-4 py-3">Clientes</th>
              <th className="px-4 py-3">Cancelamentos reais</th>
              <th className="px-4 py-3">Taxa de cancelamento</th>
              <th className="px-4 py-3">Concentração</th>
              <th className="px-4 py-3">Participação nos cancelamentos</th>
            </tr>
          </thead>
          <tbody>
            {distribution.faixas.map((band) => (
              <tr key={band.faixa} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold text-slate-900">{band.faixa}</td>
                <td className="px-4 py-3">{formatInteger(band.clientes)}</td>
                <td className="px-4 py-3">{formatInteger(band.churns)}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{band.taxa_churn === null ? "Sem clientes" : formatPercent(band.taxa_churn)}</td>
                <td className="px-4 py-3">{band.lift_vs_base === null ? "—" : `${band.lift_vs_base.toFixed(2).replace(".", ",")}x acima da média`}</td>
                <td className="px-4 py-3">{formatPercent(band.captura_churn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        Taxa média de cancelamento no teste: <strong className="text-slate-700">{formatPercent(distribution.taxa_churn_teste)}</strong> · {formatInteger(distribution.clientes_teste)} clientes analisados.
      </div>
    </div>
  );
}

type RiskChartRow = {
  label: string;
  clientes: number;
  clientesAltoRisco: number;
  valorRisco: number;
  scoreMedio: number;
};

function RiskBarChart({
  title,
  subtitle,
  help,
  items,
  quantitative,
}: {
  title: string;
  subtitle: string;
  help: string;
  items: RiskChartRow[];
  quantitative: boolean;
}) {
  const maxValue = Math.max(...items.map((item) => quantitative ? item.clientesAltoRisco : item.valorRisco), 0);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader title={title} subtitle={subtitle} help={help} />
      <div className="space-y-4">
        {items.map((item) => {
          const metric = quantitative ? item.clientesAltoRisco : item.valorRisco;
          const width = maxValue > 0 ? `${Math.max((metric / maxValue) * 100, metric > 0 ? 3 : 0)}%` : "0%";
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">score médio {item.scoreMedio.toFixed(1).replace(".", ",")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{quantitative ? `${formatInteger(item.clientesAltoRisco)} clientes` : formatMoney(item.valorRisco)}</p>
                  <p className="text-xs text-slate-500">{quantitative ? "em risco alto ou muito alto" : "valor em risco"}</p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-900" style={{ width }} />
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-sm text-slate-400">Nenhum dado encontrado.</p>}
      </div>
    </div>
  );
}

function ClientRow({ item, quantitative }: { item: ChurnScoreClient; quantitative: boolean }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-slate-950">{item.score}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${riskClass(item.faixa_risco)}`}>{item.faixa_risco}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <a href={item.intranet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline">
          {item.cliente}<ExternalLink size={13} />
        </a>
        <p className="mt-1 text-xs text-slate-500">{item.origem} · {item.pagador}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold">{item.nome_plano} · {durationLabel(item.duracao)}</p>
        {!quantitative && <p className="mt-1 text-xs text-slate-500">{formatMoney(item.valor)}</p>}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold">{formatDate(item.data_vencimento)}</p>
        <p className="mt-1 text-xs text-slate-500">em {item.dias_ate_vencimento} dias</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p>{formatDateTime(item.ultimo_acesso)}</p>
        <p className="mt-1 text-xs text-slate-500">{item.dias_sem_acesso === null ? "sem registro" : `${item.dias_sem_acesso} dias sem acesso`}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-[360px] flex-wrap gap-1.5">
          {item.sinais.map((signal) => <span key={signal} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{signal}</span>)}
        </div>
      </td>
    </tr>
  );
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[;"\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function exportCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" | ");
  return String(value);
}

function downloadBlob(content: string | BlobPart, mime: string, filename: string) {
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

const CONTACT_COLUMNS: Array<{ key: keyof ChurnScoreClient; label: string }> = [
  { key: "score", label: "Score" },
  { key: "faixa_risco", label: "Nível de risco" },
  { key: "empresa_id", label: "ID do cliente" },
  { key: "nome_usuario", label: "Nome" },
  { key: "telefone", label: "Telefone" },
  { key: "celular", label: "Celular" },
  { key: "email", label: "E-mail" },
  { key: "nome_plano", label: "Plano" },
  { key: "duracao", label: "Duração" },
  { key: "data_vencimento", label: "Vencimento" },
  { key: "ultimo_acesso", label: "Último acesso" },
  { key: "dias_sem_acesso", label: "Dias sem acesso" },
  { key: "sinais", label: "Sinais" },
  { key: "intranet_url", label: "Intranet" },
];

function ContactListModal({
  globalFilters,
  onClose,
}: {
  globalFilters: GlobalFilters;
  onClose: () => void;
}) {
  const initialFilters: ChurnScoreContactFilters = {
    empresa: globalFilters.empresa,
    origem: globalFilters.origem,
    pagador: globalFilters.pagador,
    risco: "alto_ou_maior",
    plano: "",
    duracao: "",
    data_inicio: "",
    data_fim: "",
    valor_minimo: 0,
    tempo_cliente_minimo: null,
    tempo_cliente_maximo: null,
    tempo_cliente_unidade: "mes",
    somente_ultrapassou_media: false,
  };

  const [contactFilters, setContactFilters] = useState<ChurnScoreContactFilters>(initialFilters);
  const [result, setResult] = useState<ChurnScoreContactListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [copyMessage, setCopyMessage] = useState("");

  async function generate(filtersToUse = contactFilters) {
    setLoading(true);
    setError(null);
    setCopyMessage("");
    try {
      const response = await fetchChurnScoreContactList(filtersToUse);
      setResult(response);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar a lista de contato.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void generate(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil((result?.rows.length ?? 0) / pageSize));
  const visibleRows = result?.rows.slice((page - 1) * pageSize, page * pageSize) ?? [];

  function downloadCsv() {
    if (!result) return;
    const header = CONTACT_COLUMNS.map((column) => csvEscape(column.label)).join(";");
    const body = result.rows.map((row) => CONTACT_COLUMNS.map((column) => csvEscape(exportCell(row[column.key]))).join(";")).join("\r\n");
    downloadBlob(`\uFEFF${header}\r\n${body}`, "text/csv;charset=utf-8", "lista_contato_churn_score.csv");
  }

  async function downloadXlsx() {
    if (!result) return;
    const XLSX = await import("xlsx");
    const rows = result.rows.map((row) => Object.fromEntries(CONTACT_COLUMNS.map((column) => [column.label, exportCell(row[column.key])] )));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = CONTACT_COLUMNS.map((column) => ({ wch: Math.max(12, Math.min(34, column.label.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");
    XLSX.writeFile(workbook, "lista_contato_churn_score.xlsx");
  }

  async function copyToGoogleSheets() {
    if (!result) return;
    const sheetWindow = window.open("https://sheets.new", "_blank", "noopener,noreferrer");
    const header = CONTACT_COLUMNS.map((column) => column.label).join("\t");
    const rows = result.rows.map((row) => CONTACT_COLUMNS.map((column) => exportCell(row[column.key]).replaceAll("\t", " ").replaceAll("\n", " ")).join("\t"));
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      setCopyMessage(`${formatInteger(result.total)} linhas copiadas. Cole com Ctrl+V na planilha do Google Sheets.`);
      if (!sheetWindow) setCopyMessage(`${formatInteger(result.total)} linhas copiadas. O navegador bloqueou a nova aba; abra o Google Sheets e cole com Ctrl+V.`);
    } catch {
      setCopyMessage("O navegador não permitiu copiar para a área de transferência. Use CSV ou XLSX.");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-[1500px] overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Lista de contato</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">Gerar lista de contato</h3>
            <p className="mt-1 text-sm text-slate-500">A lista abre automaticamente com clientes em risco alto ou muito alto.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
        </div>

        <div className="space-y-6 p-6 lg:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Empresa
              <select value={contactFilters.empresa} onChange={(event) => setContactFilters((current) => ({ ...current, empresa: event.target.value as ChurnScoreContactFilters["empresa"] }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="todos">Todas</option><option value="gestaoclick">GestãoClick</option><option value="clicknotas">ClickNotas</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Origem
              <select value={contactFilters.origem} onChange={(event) => setContactFilters((current) => ({ ...current, origem: event.target.value as ChurnScoreContactFilters["origem"] }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="todos">Todas</option><option value="gestaoclick">GestãoClick</option><option value="parceiro">Parceiro</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Responsável pelo pagamento
              <select value={contactFilters.pagador} onChange={(event) => setContactFilters((current) => ({ ...current, pagador: event.target.value as ChurnScoreContactFilters["pagador"] }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="todos">Todos</option><option value="cliente">Cliente</option><option value="parceiro">Parceiro</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Nível de risco
              <select value={contactFilters.risco} onChange={(event) => setContactFilters((current) => ({ ...current, risco: event.target.value as ChurnRiskFilter }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="alto_ou_maior">Alto e muito alto</option><option value="muito_alto">Muito alto</option><option value="alto">Alto</option><option value="moderado">Moderado</option><option value="baixo">Baixo</option><option value="todos">Todos</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">Plano
              <input list="churn-contact-planos" value={contactFilters.plano} onChange={(event) => setContactFilters((current) => ({ ...current, plano: event.target.value }))} placeholder="Todos os planos" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
              <datalist id="churn-contact-planos">{(result?.planos ?? []).map((item) => <option key={item} value={item} />)}</datalist>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Vencimento de
              <input type="date" value={contactFilters.data_inicio} min={result?.data_minima ?? undefined} max={result?.data_maxima ?? undefined} onChange={(event) => setContactFilters((current) => ({ ...current, data_inicio: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Vencimento até
              <input type="date" value={contactFilters.data_fim} min={result?.data_minima ?? undefined} max={result?.data_maxima ?? undefined} onChange={(event) => setContactFilters((current) => ({ ...current, data_fim: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Duração
              <select value={contactFilters.duracao} onChange={(event) => setContactFilters((current) => ({ ...current, duracao: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="">Todas</option>{(result?.duracoes ?? []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">Valor acima de
              <input type="number" min="0" step="0.01" value={contactFilters.valor_minimo || ""} onChange={(event) => setContactFilters((current) => ({ ...current, valor_minimo: Number(event.target.value || 0) }))} placeholder="0,00" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <div className="grid gap-1 text-xs font-semibold text-slate-500 xl:col-span-2">
              Tempo como cliente
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_150px]">
                <input type="number" min="0" step="0.1" value={contactFilters.tempo_cliente_minimo ?? ""} onChange={(event) => setContactFilters((current) => ({ ...current, tempo_cliente_minimo: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Mínimo (opcional)" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                <input type="number" min="0" step="0.1" value={contactFilters.tempo_cliente_maximo ?? ""} onChange={(event) => setContactFilters((current) => ({ ...current, tempo_cliente_maximo: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Máximo (opcional)" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                <select value={contactFilters.tempo_cliente_unidade} onChange={(event) => setContactFilters((current) => ({ ...current, tempo_cliente_unidade: event.target.value as "mes" | "ano" }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <option value="mes">Meses</option><option value="ano">Anos</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={contactFilters.somente_ultrapassou_media} onChange={(event) => setContactFilters((current) => ({ ...current, somente_ultrapassou_media: event.target.checked }))} />
              Última renovação acima da média de atraso
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void generate()} disabled={loading} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Gerando lista..." : "Gerar lista"}
            </button>
            {result && <span className="text-sm text-slate-500">{formatInteger(result.total)} clientes encontrados · {riskFilterLabel(result.risco)}</span>}
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
                <table className="min-w-[2200px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>{CONTACT_COLUMNS.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 text-left">{column.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row) => (
                      <tr key={row.empresa_id}>
                        {CONTACT_COLUMNS.map((column) => {
                          const value = row[column.key];
                          const formatted = column.key === "data_vencimento"
                            ? formatDate(value ? String(value) : null)
                            : column.key === "ultimo_acesso"
                              ? formatDateTime(value ? String(value) : null)
                              : column.key === "duracao"
                                ? durationLabel(value ? String(value) : null)
                                : exportCell(value);
                          return <td key={column.key} className="whitespace-nowrap px-3 py-3 text-slate-700">{formatted || "—"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                <span>Página {page} de {totalPages} · a exportação contém todas as {formatInteger(result.total)} linhas.</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChurnScoreDashboard() {
  const { filters } = useGlobalFilters();
  const [meta, setMeta] = useState<ChurnScoreModelMeta | null>(null);
  const [data, setData] = useState<ChurnScoreDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<ChurnRiskFilter>("todos");
  const [planFilter, setPlanFilter] = useState("");
  const [durationFilter, setDurationFilter] = useState("");
  const [priorityRows, setPriorityRows] = useState<ChurnScoreClient[]>([]);
  const [priorityTotal, setPriorityTotal] = useState(0);
  const [priorityPlans, setPriorityPlans] = useState<string[]>([]);
  const [priorityDurations, setPriorityDurations] = useState<Array<{ value: string; label: string }>>([]);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityPage, setPriorityPage] = useState(1);
  const [priorityTotalPages, setPriorityTotalPages] = useState(1);
  const [contactOpen, setContactOpen] = useState(false);

  const quantitative = filters.viewMode === "quantitativo";

  async function loadDashboard(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetchChurnScoreDashboard(filters);
      setData(response);
      setMeta(response.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao carregar o Churn Score.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchChurnScoreMeta();
        if (!active) return;
        setMeta(response);
        if (response.status === "treinado") {
          const dashboard = await fetchChurnScoreDashboard(filters);
          if (!active) return;
          setData(dashboard);
          setMeta(dashboard.model);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro inesperado ao carregar o Churn Score.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (meta?.status !== "treinado") return;
    void loadDashboard();
    setRiskFilter("todos");
    setPlanFilter("");
    setDurationFilter("");
    setPriorityPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.empresa, filters.origem, filters.pagador]);

  useEffect(() => {
    if (!data?._cache_info?.refreshing) return;
    const timer = globalThis.setTimeout(() => { void loadDashboard(true); }, 15000);
    return () => globalThis.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?._cache_info?.refreshing, data?._cache_info?.updated_at]);

  useEffect(() => {
    setPriorityPage(1);
  }, [riskFilter, planFilter, durationFilter]);

  useEffect(() => {
    if (!data || data._cache_info?.preparing) return;
    let active = true;
    setPriorityLoading(true);
    fetchChurnScoreClients(filters, { risco: riskFilter, plano: planFilter, duracao: durationFilter, pagina: priorityPage, por_pagina: 20 })
      .then((response) => {
        if (!active) return;
        setPriorityRows(response.rows);
        setPriorityTotal(response.total);
        setPriorityTotalPages(response.total_paginas);
        setPriorityPlans(response.planos);
        setPriorityDurations(response.duracoes);
      })
      .catch(() => {
        if (!active) return;
        setPriorityRows(data.clientes.slice(0, 20));
        setPriorityTotal(data.clientes_retornados);
        setPriorityTotalPages(Math.max(1, Math.ceil(data.clientes_retornados / 20)));
      })
      .finally(() => active && setPriorityLoading(false));
    return () => { active = false; };
  }, [data, filters.empresa, filters.origem, filters.pagador, riskFilter, planFilter, durationFilter, priorityPage]);

  async function handleTrain() {
    setTraining(true);
    setError(null);
    try {
      const result = await trainChurnScore(filters);
      setMeta(result);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o score.");
    } finally {
      setTraining(false);
    }
  }

  const planosEmRisco = useMemo(() => {
    const rows = (data?.risco_por_plano ?? []).map((item) => ({
      label: item.label,
      clientes: item.clientes,
      clientesAltoRisco: item.clientes_alto_risco ?? item.clientes,
      valorRisco: item.valor_risco,
      scoreMedio: item.score_medio,
    }));
    rows.sort((a, b) => quantitative ? b.clientesAltoRisco - a.clientesAltoRisco : b.valorRisco - a.valorRisco);
    return rows.slice(0, 8);
  }, [data, quantitative]);

  const duracoesEmRisco = useMemo(() => (data?.risco_por_duracao ?? []).map((item) => ({
    label: item.label,
    clientes: item.clientes,
    clientesAltoRisco: item.clientes_alto_risco ?? item.clientes,
    valorRisco: item.valor_risco,
    scoreMedio: item.score_medio,
  })), [data]);

  const ultimaAtualizacao = data?._cache_info?.updated_at
    ? formatDateTime(data._cache_info.updated_at)
    : data?.model.trained_at
      ? formatDateTime(data.model.trained_at)
      : null;

  const highRiskShare = data?.resumo.clientes
    ? data.resumo.alto_risco / data.resumo.clientes
    : 0;

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Churn Score</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Score de 1 a 100 para mostrar quais clientes precisam de atenção primeiro. Quanto maior o score, maior o risco de cancelamento.</p>
            {ultimaAtualizacao && <p className="mt-1 text-xs italic text-slate-400">Última atualização: {ultimaAtualizacao}{data?._cache_info?.refreshing ? " · atualizando em segundo plano" : ""}</p>}
          </div>
          <button type="button" onClick={handleTrain} disabled={training} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={17} className={training ? "animate-spin" : ""} />
            {training ? "Atualizando..." : "Atualizar score"}
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">Carregando Churn Score...</div>}

        {!loading && meta?.status === "nao_treinado" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 text-amber-600" size={20} /><div><h2 className="font-bold text-amber-950">Score ainda não preparado</h2><p className="mt-1 text-sm leading-6 text-amber-800">Clique em <strong>Atualizar score</strong> para preparar a primeira análise.</p></div></div>
          </div>
        )}

        {data && (
          data._cache_info?.preparing ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-900">
              <div className="flex items-start gap-3"><RefreshCw className="mt-0.5 animate-spin" size={18} /><div><p className="font-semibold">Preparando a primeira atualização do Churn Score.</p><p className="mt-1 leading-6">A página já está disponível. Os dados estão sendo atualizados em segundo plano e aparecerão aqui automaticamente assim que o processo terminar.</p></div></div>
            </div>
          ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Kpi title="Clientes avaliados" value={formatInteger(data.resumo.clientes)} subtitle="Clientes dentro dos filtros globais que entraram nesta análise." icon={UsersRound} />
              <Kpi title="Score médio" value={data.resumo.score_medio.toFixed(1).replace(".", ",")} subtitle="Média do risco atual da carteira nesta tela." icon={Target} />
              <Kpi title="Risco alto ou maior" value={formatInteger(data.resumo.alto_risco)} subtitle="Clientes com score igual ou superior a 60." icon={ShieldAlert} />
              <Kpi title="Risco muito alto" value={formatInteger(data.resumo.muito_alto_risco)} subtitle="Clientes com score igual ou superior a 80." icon={TrendingUp} />
              {quantitative
                ? <Kpi title="Carteira em alto risco" value={formatPercent(highRiskShare)} subtitle="Percentual dos clientes avaliados que estão em risco alto ou muito alto." icon={UsersRound} />
                : <Kpi title="Valor em risco" value={formatMoney(data.resumo.valor_ponderado_risco)} subtitle="Soma do valor dos clientes ponderada pelo score de risco." icon={WalletCards} />}
            </div>

            <ConfidenceSummary metrics={data.model.test_metrics} distribution={data.model.score_distribution} />
            <ScoreDistribution distribution={data.model.score_distribution} />

            <div className="grid gap-6 xl:grid-cols-2">
              <RiskBarChart
                title={quantitative ? "Planos com mais clientes em risco" : "Planos com maior valor em risco"}
                subtitle={quantitative ? "Mostra onde está concentrada a maior quantidade de clientes em risco alto ou muito alto." : "Mostra onde está concentrado o maior potencial de perda financeira."}
                help={quantitative ? "Cada barra mostra quantos clientes daquele plano estão em risco alto ou muito alto. Quanto maior a barra, maior a quantidade de clientes que merece atenção." : "Cada barra mostra o valor em risco por plano. Esse valor considera o preço do cliente e o score dele."}
                items={planosEmRisco}
                quantitative={quantitative}
              />
              <RiskBarChart
                title={quantitative ? "Durações com mais clientes em risco" : "Durações com maior valor em risco"}
                subtitle={quantitative ? "Compara a quantidade de clientes em risco entre mensal, trimestral, semestral e anual." : "Compara o risco financeiro entre mensal, trimestral, semestral e anual."}
                help={quantitative ? "Este gráfico conta os clientes com risco alto ou muito alto em cada duração do contrato." : "Este gráfico resume o valor em risco por duração do contrato."}
                items={duracoesEmRisco}
                quantitative={quantitative}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.faixas.map((band) => (
                <div key={band.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${riskClass(band.label)}`}>{band.label}</span>
                  <p className="mt-3 text-2xl font-bold text-slate-950">{formatInteger(band.clientes)}</p>
                  <p className="text-sm text-slate-500">{quantitative ? "clientes" : `clientes · ${formatMoney(band.valor)}`}</p>
                  <p className="mt-2 text-xs text-slate-400">Score {band.min}–{band.max}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <SectionHeader title="Prioridade de retenção" subtitle={`Lista ordenada do maior para o menor score. ${formatInteger(priorityTotal)} clientes encontrados com os filtros atuais.`} help="Use os filtros para selecionar o nível de risco, plano e duração. A lista continua ordenada do maior para o menor score." />
                  <button type="button" onClick={() => setContactOpen(true)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><ListChecks size={17} />Gerar lista de contato</button>
                </div>

                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">Nível de risco
                    <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as ChurnRiskFilter)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
                      <option value="todos">Todos</option><option value="alto_ou_maior">Alto e muito alto</option><option value="muito_alto">Muito alto</option><option value="alto">Alto</option><option value="moderado">Moderado</option><option value="baixo">Baixo</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">Plano
                    <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
                      <option value="">Todos</option>{priorityPlans.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">Duração
                    <select value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
                      <option value="">Todas</option>{priorityDurations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1250px] w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Score</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Último acesso</th><th className="px-4 py-3">Sinais</th></tr></thead>
                  <tbody>
                    {priorityLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Atualizando lista...</td></tr>}
                    {!priorityLoading && priorityRows.map((item) => <ClientRow key={item.empresa_id} item={item} quantitative={quantitative} />)}
                    {!priorityLoading && priorityRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Nenhum cliente encontrado com estes filtros.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
                <span>Página {priorityPage} de {priorityTotalPages} · 20 clientes por página.</span>
                <div className="flex gap-2">
                  <button type="button" disabled={priorityPage <= 1 || priorityLoading} onClick={() => setPriorityPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={priorityPage >= priorityTotalPages || priorityLoading} onClick={() => setPriorityPage((value) => Math.min(priorityTotalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
                </div>
              </div>
            </div>
          </>
          )
        )}
      </div>

      {contactOpen && <ContactListModal globalFilters={filters} onClose={() => setContactOpen(false)} />}
    </div>
  );
}
