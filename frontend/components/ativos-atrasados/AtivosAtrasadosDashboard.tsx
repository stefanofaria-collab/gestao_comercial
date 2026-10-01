"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
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
import { fetchActiveOverdueDashboard } from "@/lib/ativos-atrasados-api";
import type {
  ActiveOverdueCard,
  ActiveOverdueClient,
  ActiveOverdueDashboardResponse,
  ActiveOverduePlan,
} from "@/types/ativos-atrasados";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatMoney(value: number) {
  return money.format(value || 0);
}

function formatInteger(value: number) {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function tooltipNumberValue(value: unknown) {
  if (Array.isArray(value)) {
    return Number(value[value.length - 1] ?? 0);
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return Number((value as { value?: unknown }).value ?? 0);
  }
  return Number(value ?? 0);
}

function integerAxisTooltip(params: unknown) {
  const rows = Array.isArray(params) ? params : [params];
  if (!rows.length) return "";

  const first = rows[0] as { axisValueLabel?: string; name?: string };
  const title = first.axisValueLabel ?? first.name ?? "";
  const body = rows.map((raw) => {
    const row = raw as { marker?: string; seriesName?: string; value?: unknown; data?: unknown };
    const value = tooltipNumberValue(row.value ?? row.data);
    return `${row.marker ?? ""}${row.seriesName ?? ""}<span style="float:right;margin-left:24px;font-weight:700">${formatInteger(value)}</span>`;
  }).join("<br/>");

  return `${title}<br/>${body}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function HelpTip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex">
      <button type="button" aria-label="Explicação" className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700">
        <CircleHelp size={14} />
      </button>
      <div className="pointer-events-none invisible absolute right-0 top-8 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        {text}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle, helpText, clickable = false }: { title: string; subtitle?: string; helpText: string; clickable?: boolean }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        {clickable ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            <MousePointerClick size={12} /> Clique para detalhar
          </span>
        ) : null}
        <HelpTip text={helpText} />
      </div>
      {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw className="mx-auto animate-spin text-blue-600" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Preparando Ativos e Atrasados...</p>
        <p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">Buscando o snapshot salvo no banco do projeto. As próximas visitas desta sessão são reaproveitadas no navegador.</p>
      </div>
    </div>
  );
}

function categoryMatch(client: ActiveOverdueClient, category: string) {
  if (category === "prorrogacao") return client.dias_vencido >= 1 && client.dias_vencido <= 3;
  if (category === "dentro_media") return client.dentro_media_atraso;
  if (category === "ate_30") return client.dias_vencido >= 1 && client.dias_vencido <= 30;
  if (category === "ate_45") return client.dias_vencido >= 1 && client.dias_vencido <= 45;
  if (category === "ate_60") return client.dias_vencido >= 1 && client.dias_vencido <= 59;
  return false;
}

const EXPORT_COLUMNS: Array<{ key: keyof ActiveOverdueClient; label: string }> = [
  { key: "empresa_id", label: "ID" },
  { key: "cliente", label: "Cliente" },
  { key: "empresa", label: "Empresa" },
  { key: "origem", label: "Origem" },
  { key: "pagador", label: "Responsável pelo pagamento" },
  { key: "ativou_em", label: "Data da contratação" },
  { key: "nome_plano", label: "Plano" },
  { key: "duracao_label", label: "Duração" },
  { key: "data_vencimento", label: "Data de vencimento" },
  { key: "valor", label: "Valor" },
  { key: "dias_vencido", label: "Dias vencido" },
  { key: "media_dias_pagamento_real", label: "Atraso real médio" },
  { key: "tempo_cliente_meses", label: "Tempo como cliente (meses)" },
  { key: "renovacoes", label: "Renovações" },
  { key: "reativacoes", label: "Reativações" },
  { key: "ltv", label: "LTV" },
  { key: "ticket_medio_historico", label: "Ticket médio histórico" },
  { key: "nome_usuario", label: "Nome do usuário" },
  { key: "telefone", label: "Telefone" },
  { key: "celular", label: "Celular" },
  { key: "email", label: "E-mail" },
  { key: "intranet_url", label: "Intranet" },
];

function rawCell(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
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

function ClientModal({
  title,
  source,
  onClose,
}: {
  title: string;
  source: ActiveOverdueClient[];
  onClose: () => void;
}) {
  const [empresa, setEmpresa] = useState("");
  const [origem, setOrigem] = useState("");
  const [pagador, setPagador] = useState("");
  const [plano, setPlano] = useState("");
  const [duracao, setDuracao] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [valorMinimo, setValorMinimo] = useState("");
  const [tempoMinimo, setTempoMinimo] = useState("");
  const [tempoMaximo, setTempoMaximo] = useState("");
  const [tempoUnidade, setTempoUnidade] = useState<"mes" | "ano">("mes");
  const [somenteUltrapassou, setSomenteUltrapassou] = useState(false);
  const [search, setSearch] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const plans = useMemo(() => Array.from(new Set(source.map((row) => row.nome_plano))).sort(), [source]);
  const durations = useMemo(() => Array.from(new Map(source.map((row) => [row.duracao, row.duracao_label])).entries()), [source]);

  const rows = useMemo(() => {
    const multiplier = tempoUnidade === "ano" ? 12 : 1;
    const minMonths = tempoMinimo ? Number(tempoMinimo) * multiplier : null;
    const maxMonths = tempoMaximo ? Number(tempoMaximo) * multiplier : null;
    const minValue = valorMinimo ? Number(valorMinimo) : null;
    const term = search.trim().toLowerCase();

    return source.filter((row) => {
      if (empresa && row.empresa !== empresa) return false;
      if (origem && row.origem !== origem) return false;
      if (pagador && row.pagador !== pagador) return false;
      if (plano && row.nome_plano !== plano) return false;
      if (duracao && row.duracao !== duracao) return false;
      if (dataInicio && (row.data_vencimento ?? "") < dataInicio) return false;
      if (dataFim && (row.data_vencimento ?? "") > dataFim) return false;
      if (minValue !== null && row.valor < minValue) return false;
      if (minMonths !== null && row.tempo_cliente_meses < minMonths) return false;
      if (maxMonths !== null && row.tempo_cliente_meses > maxMonths) return false;
      if (somenteUltrapassou && !row.ultrapassou_media_atraso) return false;
      if (term && !`${row.cliente} ${row.empresa_id} ${row.nome_plano} ${row.email ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [source, empresa, origem, pagador, plano, duracao, dataInicio, dataFim, valorMinimo, tempoMinimo, tempoMaximo, tempoUnidade, somenteUltrapassou, search]);

  const summary = useMemo(() => {
    const totalValue = rows.reduce((sum, row) => sum + row.valor, 0);
    const overdueAverage = rows.length ? rows.reduce((sum, row) => sum + row.dias_vencido, 0) / rows.length : 0;
    const realValues = rows
      .map((row) => row.media_dias_pagamento_real)
      .filter((value): value is number => value !== null);
    const realAverage = realValues.length ? realValues.reduce((sum, value) => sum + value, 0) / realValues.length : null;
    return { totalValue, overdueAverage, realAverage };
  }, [rows]);

  function csv() {
    const escape = (value: unknown) => `"${rawCell(value).replaceAll('"', '""')}"`;
    const header = EXPORT_COLUMNS.map((col) => escape(col.label)).join(";");
    const body = rows.map((row) => EXPORT_COLUMNS.map((col) => escape(row[col.key])).join(";")).join("\r\n");
    downloadBlob(`\uFEFF${header}\r\n${body}`, "text/csv;charset=utf-8", "ativos_atrasados.csv");
  }

  async function xlsx() {
    const XLSX = await import("xlsx");
    const payload = rows.map((row) => Object.fromEntries(EXPORT_COLUMNS.map((col) => [col.label, row[col.key] ?? ""])));
    const worksheet = XLSX.utils.json_to_sheet(payload);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
    XLSX.writeFile(workbook, "ativos_atrasados.xlsx");
  }

  async function sheets() {
    const popup = window.open("https://sheets.new", "_blank", "noopener,noreferrer");
    const header = EXPORT_COLUMNS.map((col) => col.label).join("\t");
    const body = rows.map((row) => EXPORT_COLUMNS.map((col) => rawCell(row[col.key]).replaceAll("\t", " ").replaceAll("\n", " ")).join("\t"));
    await navigator.clipboard.writeText([header, ...body].join("\n"));
    setCopyMessage(`${formatInteger(rows.length)} linhas copiadas. Cole com Ctrl+V no Google Sheets.${popup ? "" : " O navegador bloqueou a nova aba."}`);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-[1500px] overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Clientes</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">Filtre, consulte e exporte todas as linhas deste recorte.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
        </div>

        <div className="space-y-5 p-6 lg:p-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Clientes no recorte</p><p className="mt-1 text-2xl font-bold text-slate-950">{formatInteger(rows.length)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Valor dos planos</p><p className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(summary.totalValue)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Atraso médio atual</p><p className="mt-1 text-2xl font-bold text-slate-950">{summary.overdueAverage.toFixed(1).replace(".", ",")} dias</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Atraso real médio histórico</p><p className="mt-1 text-2xl font-bold text-slate-950">{summary.realAverage === null ? "Sem histórico" : `${summary.realAverage.toFixed(1).replace(".", ",")} dias`}</p></div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, ID, plano ou e-mail..." className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todas as empresas</option><option>GestãoClick</option><option>ClickNotas</option></select>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todas as origens</option><option>GestãoClick</option><option>Parceiro</option></select>
            <select value={pagador} onChange={(e) => setPagador(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todos os pagadores</option><option>Cliente</option><option>Parceiro</option></select>
            <select value={plano} onChange={(e) => setPlano(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todos os planos</option>{plans.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={duracao} onChange={(e) => setDuracao(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todas as durações</option>{durations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Vencimento de<input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Vencimento até<input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Valor acima de<input type="number" min="0" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} placeholder="0,00" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Tempo mínimo<input type="number" min="0" value={tempoMinimo} onChange={(e) => setTempoMinimo(e.target.value)} placeholder="Opcional" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Tempo máximo<input type="number" min="0" value={tempoMaximo} onChange={(e) => setTempoMaximo(e.target.value)} placeholder="Opcional" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">Unidade<select value={tempoUnidade} onChange={(e) => setTempoUnidade(e.target.value as "mes" | "ano")} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="mes">Meses</option><option value="ano">Anos</option></select></label>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={somenteUltrapassou} onChange={(e) => setSomenteUltrapassou(e.target.checked)} />
            Somente clientes que ultrapassaram a média real de atraso
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-semibold text-slate-600">{formatInteger(rows.length)} cliente(s)</span>
            <button type="button" onClick={csv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"><Download size={15} /> CSV</button>
            <button type="button" onClick={xlsx} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"><FileSpreadsheet size={15} /> XLSX</button>
            <button type="button" onClick={sheets} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><ClipboardCopy size={15} /> Copiar para Google Sheets</button>
          </div>
          {copyMessage ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{copyMessage}</div> : null}

          <div className="overflow-auto rounded-2xl border border-slate-200" style={{ maxHeight: 560 }}>
            <table className="min-w-[1500px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left">Cliente</th><th className="px-3 py-3 text-left">Plano</th><th className="px-3 py-3 text-left">Vencimento</th><th className="px-3 py-3 text-right">Dias</th><th className="px-3 py-3 text-right">Valor</th><th className="px-3 py-3 text-left">Atraso real médio</th><th className="px-3 py-3 text-left">Tempo como cliente</th><th className="px-3 py-3 text-right">Renovações</th><th className="px-3 py-3 text-right">Reativações</th><th className="px-3 py-3 text-right">LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.empresa_id}>
                    <td className="px-3 py-3"><div className="font-semibold text-slate-900">{row.cliente}</div><a href={row.intranet_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Abrir no intranet <ExternalLink size={11} /></a></td>
                    <td className="px-3 py-3">{row.nome_plano} · {row.duracao_label}</td>
                    <td className="px-3 py-3">{formatDate(row.data_vencimento)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{row.dias_vencido}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatMoney(row.valor)}</td>
                    <td className="px-3 py-3">{row.media_dias_pagamento_real === null ? "Sem histórico" : `${row.media_dias_pagamento_real.toFixed(1).replace(".", ",")} dia(s)`}</td>
                    <td className="px-3 py-3">{row.tempo_cliente_label}</td>
                    <td className="px-3 py-3 text-right">{row.renovacoes}</td>
                    <td className="px-3 py-3 text-right">{row.reativacoes}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatMoney(row.ltv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ item, financial, onClick }: { item: ActiveOverdueCard; financial: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-600">{item.label}</p><MousePointerClick size={16} className="text-blue-600" /></div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{financial ? formatMoney(item.valor_total) : formatInteger(item.clientes)}</p>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{financial ? `${formatInteger(item.clientes)} cliente(s)` : formatMoney(item.valor_total)}</p>
      <p className="mt-2 text-[11px] leading-4 text-slate-400">{item.description}</p>
    </button>
  );
}

function PlanDrilldownModal({
  categoryLabel,
  plan,
  clients,
  onClose,
}: {
  categoryLabel: string;
  plan: ActiveOverduePlan;
  clients: ActiveOverdueClient[];
  onClose: () => void;
}) {
  const [selectedDuration, setSelectedDuration] = useState<string | null>(null);
  const selectedClients = selectedDuration ? clients.filter((row) => row.nome_plano === plan.plano && row.duracao === selectedDuration) : [];

  if (selectedDuration) {
    const label = plan.duracoes.find((item) => item.duracao === selectedDuration)?.duracao_label ?? selectedDuration;
    return <ClientModal title={`${categoryLabel} · ${plan.plano} · ${label}`} source={selectedClients} onClose={() => setSelectedDuration(null)} />;
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-3xl rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Detalhamento por duração</p><h3 className="mt-1 text-2xl font-bold">{plan.plano}</h3><p className="mt-1 text-sm text-slate-500">{categoryLabel}</p></div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2"><X size={20} /></button>
        </div>
        <div className="space-y-5 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Valor neste plano</p><p className="mt-2 text-2xl font-bold">{formatMoney(plan.valor_total)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Clientes neste plano</p><p className="mt-2 text-2xl font-bold text-slate-950">{formatInteger(plan.clientes)}</p></div>
          </div>
          {plan.duracoes.map((item) => {
            const maxValue = Math.max(...plan.duracoes.map((duration) => duration.valor_total), 1);
            return (
              <button key={item.duracao} type="button" onClick={() => setSelectedDuration(item.duracao)} className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="inline-flex items-center gap-2 font-semibold text-slate-900">{item.duracao_label} <MousePointerClick size={14} className="text-blue-600" /></p><p className="mt-1 text-xs text-slate-500">Clique para listar e exportar os clientes desta duração.</p></div>
                  <div className="text-right"><p className="font-bold">{formatMoney(item.valor_total)}</p><p className="text-xs text-slate-500">{formatInteger(item.clientes)} cliente(s)</p></div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(3, (item.valor_total / maxValue) * 100)}%` }} /></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AtivosAtrasadosDashboard() {
  const { filters } = useGlobalFilters();
  const financial = filters.viewMode === "financeiro";
  const [data, setData] = useState<ActiveOverdueDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [clientModal, setClientModal] = useState<{ title: string; clients: ActiveOverdueClient[] } | null>(null);
  const [planModal, setPlanModal] = useState<{ categoryLabel: string; plan: ActiveOverduePlan; clients: ActiveOverdueClient[] } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchActiveOverdueDashboard(filters)
      .then((response) => active && setData(response))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Erro ao carregar a página."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [filters.empresa, filters.origem, filters.pagador, reloadKey]);

  const activeOption = useMemo(() => {
    if (!data) return null;
    return {
      tooltip: { trigger: "axis", formatter: integerAxisTooltip },
      grid: { left: 20, right: 25, top: 30, bottom: 35, containLabel: true },
      xAxis: { type: "category", data: data.historico_ativos.map((row) => row.label), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) }, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [{ name: "Clientes ativos", type: "line", smooth: true, symbolSize: 7, lineStyle: { width: 3 }, areaStyle: { opacity: 0.06 }, data: data.historico_ativos.map((row) => row.clientes_ativos) }],
    };
  }, [data]);

  const balanceOption = useMemo(() => {
    if (!data) return null;
    return {
      tooltip: { trigger: "axis", formatter: integerAxisTooltip },
      grid: { left: 20, right: 20, top: 25, bottom: 35, containLabel: true },
      xAxis: { type: "category", data: data.historico_ativos.map((row) => row.label) },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) }, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [{
        name: "Saldo",
        type: "bar",
        barMaxWidth: 30,
        data: data.historico_ativos.map((row) => {
          const value = row.saldo_clientes ?? 0;
          return { value, itemStyle: { color: value >= 0 ? "#10b981" : "#f43f5e" } };
        }),
        markLine: { silent: true, symbol: "none", lineStyle: { color: "#94a3b8", type: "dashed" }, data: [{ yAxis: 0 }] },
      }],
    };
  }, [data]);

  const threeLineOption = useMemo(() => {
    if (!data) return null;
    return {
      tooltip: { trigger: "axis", formatter: integerAxisTooltip },
      legend: { data: ["Ativos", "Ativos + atraso até 30 dias", "Ativos + dentro da média"], top: 0 },
      grid: { left: 20, right: 20, top: 50, bottom: 35, containLabel: true },
      xAxis: { type: "category", data: data.historico_tres_linhas.map((row) => row.label), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) }, splitLine: { lineStyle: { color: "#e2e8f0" } } },
      series: [
        { name: "Ativos", type: "line", smooth: true, symbolSize: 6, lineStyle: { width: 3 }, data: data.historico_tres_linhas.map((row) => row.clientes_ativos) },
        { name: "Ativos + atraso até 30 dias", type: "line", smooth: true, symbolSize: 6, lineStyle: { width: 3 }, data: data.historico_tres_linhas.map((row) => row.ativos_mais_30 ?? row.clientes_ativos) },
        { name: "Ativos + dentro da média", type: "line", smooth: true, symbolSize: 6, lineStyle: { width: 3 }, data: data.historico_tres_linhas.map((row) => row.ativos_mais_media ?? row.clientes_ativos) },
      ],
    };
  }, [data]);

  if (loading) return <div className="p-6 lg:p-8"><div className="mx-auto max-w-[1680px]"><LoadingBlock /></div></div>;
  if (error || !data) {
    return (
      <div className="p-6 lg:p-8"><div className="mx-auto max-w-[1680px] rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex gap-3"><AlertTriangle size={20} /><div><p className="font-semibold">Não foi possível carregar Ativos e Atrasados</p><p className="mt-2 text-sm">{error ?? "Dados indisponíveis."}</p><button type="button" onClick={() => setReloadKey((v) => v + 1)} className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold">Tentar novamente</button></div></div>
      </div></div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Ativos e Atrasados</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">Acompanhe o tamanho da base ativa, o saldo mensal e os clientes que ainda estão atrasados antes de completar a regra de churn.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">Dados de referência: {formatDate(data.data_referencia)}</div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <strong>Regras:</strong> o cliente tem 3 dias de prorrogação. Para entender o atraso normal de cada cliente, usamos o <strong>atraso real</strong>: a média dos pagamentos das renovações comuns. Períodos de 60 dias ou mais são tratados como reativação e não entram nessa média. Quem costuma pagar antes do vencimento ou ainda não possui histórico recebe média 0. Ao completar 60 dias de atraso, o cliente deixa esta página e entra em churn.
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle title="Como evoluiu a quantidade de clientes ativos" subtitle="Contagem sempre feita no dia 1 de cada mês." helpText="Cada ponto mostra quantos clientes estavam ativos no primeiro dia daquele mês. Isso evita comparar dias diferentes e deixa a evolução justa." />
          {activeOption && <ReactECharts option={activeOption} style={{ height: 360 }} />}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle title="Saldo mensal de clientes" subtitle="Ativos do mês atual menos ativos do mês anterior." helpText="Se o número for positivo, terminamos o começo do mês com mais clientes que no mês anterior. Se for negativo, começamos o mês com menos clientes." />
            {balanceOption && <ReactECharts option={balanceOption} style={{ height: 330 }} />}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle title={`Comparação de ${data.yoy.mes_label} com anos anteriores`} helpText="Comparamos a quantidade de ativos no mesmo mês do ano atual com o mesmo mês de 2025 e 2024." />
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs uppercase tracking-[0.15em] text-slate-400">{data.yoy.mes_label}/{data.yoy.ano_atual}</p><p className="mt-2 text-3xl font-bold">{formatInteger(data.yoy.clientes_ativos_atual)}</p><p className="mt-1 text-xs text-slate-400">clientes ativos</p></div>
              {data.yoy.comparacoes.map((item) => (
                <div key={item.ano} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between"><span className="font-semibold">{data.yoy.mes_label}/{item.ano}</span><span>{formatInteger(item.clientes_ativos)}</span></div>
                  <p className={`mt-2 text-sm font-semibold ${item.diferenca >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{item.diferenca >= 0 ? "+" : ""}{formatInteger(item.diferenca)} {item.percentual === null ? "" : `(${item.percentual >= 0 ? "+" : ""}${percent.format(item.percentual)}%)`}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle title="Base ativa considerando diferentes níveis de atraso" subtitle="Três formas de enxergar quantos clientes ainda podem ser considerados dentro da carteira." helpText="A primeira linha conta somente quem está em dia. A segunda também inclui quem tem até 30 dias de atraso. A terceira inclui apenas os atrasados que ainda estão dentro do atraso que normalmente apresentam." />
          {threeLineOption && <ReactECharts option={threeLineOption} style={{ height: 390 }} />}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {data.cards.map((item) => (
            <Card
              key={item.key}
              item={item}
              financial={financial}
              onClick={() => setClientModal({ title: item.label, clients: data.clientes_atrasados.filter((row) => categoryMatch(row, item.key)) })}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {data.cards.map((card) => {
            const plans = data.planos_por_card[card.key] ?? [];
            const chartData = plans.slice(0, 10);
            const option = {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
              grid: { left: 15, right: 25, top: 10, bottom: 25, containLabel: true },
              xAxis: { type: "value", axisLabel: { formatter: (value: number) => financial ? formatMoney(value) : formatInteger(value) }, splitLine: { lineStyle: { color: "#e2e8f0" } } },
              yAxis: { type: "category", inverse: true, data: chartData.map((item) => item.plano) },
              series: [{ type: "bar", data: chartData.map((item) => financial ? item.valor_total : item.clientes), barMaxWidth: 28 }],
            };
            return (
              <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle title={`Planos — ${card.label}`} subtitle="Clique no plano para ver as durações e depois os clientes." helpText="Este gráfico divide o grupo do card por plano. Depois você pode entrar na duração e chegar até a lista completa de clientes." clickable />
                <ReactECharts
                  option={option}
                  style={{ height: 330 }}
                  onEvents={{ click: (params: { name: string }) => {
                    const plan = plans.find((item) => item.plano === params.name);
                    if (plan) setPlanModal({ categoryLabel: card.label, plan, clients: data.clientes_atrasados.filter((row) => categoryMatch(row, card.key)) });
                  } }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {clientModal ? <ClientModal title={clientModal.title} source={clientModal.clients} onClose={() => setClientModal(null)} /> : null}
      {planModal ? <PlanDrilldownModal categoryLabel={planModal.categoryLabel} plan={planModal.plan} clients={planModal.clients} onClose={() => setPlanModal(null)} /> : null}
    </div>
  );
}
