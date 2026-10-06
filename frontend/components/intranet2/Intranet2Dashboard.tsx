"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type SetStateAction,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Search,
  X,
} from "lucide-react";

import {
  fetchIntranet2ClientDetail,
  fetchIntranet2Export,
  fetchIntranet2Options,
  fetchIntranet2Search,
} from "@/lib/intranet2-api";
import type {
  Intranet2ClientDetail,
  Intranet2ExportResponse,
  Intranet2Filters,
  Intranet2Options,
  Intranet2Row,
  Intranet2SearchResponse,
} from "@/types/intranet2";

const DEFAULT_FILTERS: Intranet2Filters = {
  razao_social: "",
  email: "",
  telefone: "",
  estado: "",
  cidade: "",
  ultimo_acesso_de: "",
  ultimo_acesso_ate: "",
  sem_acesso_min: null,
  sem_acesso_max: null,
  vencimento_de: "",
  vencimento_ate: "",
  vencido_min: null,
  vencido_max: null,
  vencem_em_min: null,
  vencem_em_max: null,
  pagamento_de: "",
  pagamento_ate: "",
  plano: "",
  duracao: "",
  empresa: "todos",
  origem: "todos",
  pagador: "todos",
  somente_ativos: "todos",
  valor_minimo: 0,
  tempo_cliente_minimo: null,
  tempo_cliente_maximo: null,
  tempo_cliente_unidade: "mes",
  somente_ultrapassou_media: false,
};

const EXPORT_COLUMNS: Array<{ key: keyof Intranet2Row; label: string }> = [
  { key: "empresa_id", label: "Empresa ID" },
  { key: "razao_social", label: "Razão social" },
  { key: "cpf_cnpj", label: "CPF/CNPJ" },
  { key: "empresa", label: "Empresa" },
  { key: "origem", label: "Origem" },
  { key: "pagador", label: "Responsável pelo pagamento" },
  { key: "estado", label: "Estado" },
  { key: "cidade", label: "Cidade" },
  { key: "nome_plano", label: "Plano" },
  { key: "duracao", label: "Duração" },
  { key: "valor", label: "Valor do plano" },
  { key: "data_vencimento", label: "Data de vencimento" },
  { key: "pago_em", label: "Data de pagamento" },
  { key: "ultimo_acesso", label: "Último acesso" },
  { key: "dias_sem_acesso", label: "Dias sem acesso" },
  { key: "ativo", label: "Cliente ativo" },
  { key: "churn_score", label: "Churn Score" },
  { key: "nivel_risco", label: "Nível de risco" },
  { key: "nome_usuario", label: "Nome de contato" },
  { key: "telefone", label: "Telefone" },
  { key: "celular", label: "Celular" },
  { key: "email", label: "E-mail" },
  { key: "intranet_url", label: "Intranet" },
];

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatInteger(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const source = value.slice(0, 10);
  const [year, month, day] = source.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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
  return {
    M: "Mensal",
    T: "Trimestral",
    S: "Semestral",
    A: "Anual",
  }[value || ""] ?? value ?? "—";
}

function humanizeKey(value: string) {
  const known: Record<string, string> = {
    empresa_id: "Empresa ID",
    cpf_cnpj: "CPF/CNPJ",
    cnpj: "CNPJ",
    email: "E-mail",
    uf: "UF",
    ltv: "LTV",
    id: "ID",
  };
  if (known[value]) return known[value];
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function csvEscape(value: unknown) {
  const text = valueToText(value).replaceAll('"', '""');
  return `"${text}"`;
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
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

function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        aria-label="Explicar"
        title="O que significa?"
      >
        <CircleHelp size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-[310px] rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid min-w-0 gap-1 text-xs font-semibold text-slate-500 ${className}`}>
      {label}
      {children}
    </label>
  );
}

function BaseInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2 ${props.className ?? ""}`} />;
}

function BaseSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2 ${props.className ?? ""}`} />;
}

function FiltersGrid({
  filters,
  setFilters,
  options,
}: {
  filters: Intranet2Filters;
  setFilters: Dispatch<SetStateAction<Intranet2Filters>>;
  options: Intranet2Options | null;
}) {
  const cities = useMemo(() => {
    const locations = options?.localidades ?? [];
    const filtered = filters.estado ? locations.filter((item) => item.estado === filters.estado) : locations;
    return Array.from(new Set(filtered.map((item) => item.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [filters.estado, options]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <FilterField label="Razão social">
        <BaseInput value={filters.razao_social} onChange={(event) => setFilters((current) => ({ ...current, razao_social: event.target.value }))} placeholder="Digite parte da razão social" />
      </FilterField>
      <FilterField label="E-mail">
        <BaseInput value={filters.email} onChange={(event) => setFilters((current) => ({ ...current, email: event.target.value }))} placeholder="Digite o e-mail" />
      </FilterField>
      <FilterField label="Telefone">
        <BaseInput value={filters.telefone} onChange={(event) => setFilters((current) => ({ ...current, telefone: event.target.value }))} placeholder="Telefone ou celular" />
      </FilterField>
      <FilterField label="Estado">
        <BaseSelect
          value={filters.estado}
          onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value, cidade: "" }))}
        >
          <option value="">Todos</option>
          {(options?.estados ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </BaseSelect>
      </FilterField>

      <FilterField label="Cidade">
        <BaseInput list="intranet2-cidades" value={filters.cidade} onChange={(event) => setFilters((current) => ({ ...current, cidade: event.target.value }))} placeholder="Todas as cidades" />
        <datalist id="intranet2-cidades">{cities.map((item) => <option key={item} value={item} />)}</datalist>
      </FilterField>
      <FilterField label="Último acesso — De">
        <BaseInput type="date" value={filters.ultimo_acesso_de} onChange={(event) => setFilters((current) => ({ ...current, ultimo_acesso_de: event.target.value }))} />
      </FilterField>
      <FilterField label="Último acesso — Até">
        <BaseInput type="date" value={filters.ultimo_acesso_ate} onChange={(event) => setFilters((current) => ({ ...current, ultimo_acesso_ate: event.target.value }))} />
      </FilterField>
      <div className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
        Sem acesso há
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <BaseInput type="number" min="0" value={filters.sem_acesso_min ?? ""} onChange={(event) => setFilters((current) => ({ ...current, sem_acesso_min: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Mínimo" />
          <BaseInput type="number" min="0" value={filters.sem_acesso_max ?? ""} onChange={(event) => setFilters((current) => ({ ...current, sem_acesso_max: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Máximo" />
        </div>
      </div>

      <FilterField label="Data de vencimento — De">
        <BaseInput type="date" value={filters.vencimento_de} onChange={(event) => setFilters((current) => ({ ...current, vencimento_de: event.target.value }))} />
      </FilterField>
      <FilterField label="Data de vencimento — Até">
        <BaseInput type="date" value={filters.vencimento_ate} onChange={(event) => setFilters((current) => ({ ...current, vencimento_ate: event.target.value }))} />
      </FilterField>
      <div className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
        Vencido há
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <BaseInput type="number" min="0" value={filters.vencido_min ?? ""} onChange={(event) => setFilters((current) => ({ ...current, vencido_min: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Mínimo" />
          <BaseInput type="number" min="0" value={filters.vencido_max ?? ""} onChange={(event) => setFilters((current) => ({ ...current, vencido_max: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Máximo" />
        </div>
      </div>
      <div className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500">
        Vencem em
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <BaseInput type="number" min="0" value={filters.vencem_em_min ?? ""} onChange={(event) => setFilters((current) => ({ ...current, vencem_em_min: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Mínimo" />
          <BaseInput type="number" min="0" value={filters.vencem_em_max ?? ""} onChange={(event) => setFilters((current) => ({ ...current, vencem_em_max: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Máximo" />
        </div>
      </div>
      <FilterField label="Data de pagamento — De">
        <BaseInput type="date" value={filters.pagamento_de} onChange={(event) => setFilters((current) => ({ ...current, pagamento_de: event.target.value }))} />
      </FilterField>
      <FilterField label="Data de pagamento — Até">
        <BaseInput type="date" value={filters.pagamento_ate} onChange={(event) => setFilters((current) => ({ ...current, pagamento_ate: event.target.value }))} />
      </FilterField>

      <FilterField label="Plano">
        <BaseInput list="intranet2-planos" value={filters.plano} onChange={(event) => setFilters((current) => ({ ...current, plano: event.target.value }))} placeholder="Todos os planos" />
        <datalist id="intranet2-planos">{(options?.planos ?? []).map((item) => <option key={item} value={item} />)}</datalist>
      </FilterField>
      <FilterField label="Duração">
        <BaseSelect value={filters.duracao} onChange={(event) => setFilters((current) => ({ ...current, duracao: event.target.value }))}>
          <option value="">Todas</option>
          {(options?.duracoes ?? []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </BaseSelect>
      </FilterField>
      <FilterField label="Empresa">
        <BaseSelect value={filters.empresa} onChange={(event) => setFilters((current) => ({ ...current, empresa: event.target.value as Intranet2Filters["empresa"] }))}>
          <option value="todos">Todas</option>
          <option value="gestaoclick">GestãoClick</option>
          <option value="clicknotas">ClickNotas</option>
        </BaseSelect>
      </FilterField>
      <FilterField label="Origem">
        <BaseSelect value={filters.origem} onChange={(event) => setFilters((current) => ({ ...current, origem: event.target.value as Intranet2Filters["origem"] }))}>
          <option value="todos">Todas</option>
          <option value="gestaoclick">GestãoClick</option>
          <option value="parceiro">Parceiro</option>
        </BaseSelect>
      </FilterField>

      <FilterField label="Responsável pelo pagamento">
        <BaseSelect value={filters.pagador} onChange={(event) => setFilters((current) => ({ ...current, pagador: event.target.value as Intranet2Filters["pagador"] }))}>
          <option value="todos">Todos</option>
          <option value="cliente">Cliente</option>
          <option value="parceiro">Parceiro</option>
        </BaseSelect>
      </FilterField>
      <FilterField label="Somente clientes ativos">
        <BaseSelect value={filters.somente_ativos} onChange={(event) => setFilters((current) => ({ ...current, somente_ativos: event.target.value as Intranet2Filters["somente_ativos"] }))}>
          <option value="todos">Todos</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </BaseSelect>
      </FilterField>
      <FilterField label="Valor do plano acima de">
        <BaseInput type="number" min="0" step="0.01" value={filters.valor_minimo || ""} onChange={(event) => setFilters((current) => ({ ...current, valor_minimo: Number(event.target.value || 0) }))} placeholder="0,00" />
      </FilterField>
      <div className="grid min-w-0 gap-1 text-xs font-semibold text-slate-500 sm:col-span-2 xl:col-span-1">
        Tempo como cliente
        <div className="grid min-w-0 grid-cols-2 gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px]">
          <BaseInput type="number" min="0" step="0.1" value={filters.tempo_cliente_minimo ?? ""} onChange={(event) => setFilters((current) => ({ ...current, tempo_cliente_minimo: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Mín." />
          <BaseInput type="number" min="0" step="0.1" value={filters.tempo_cliente_maximo ?? ""} onChange={(event) => setFilters((current) => ({ ...current, tempo_cliente_maximo: event.target.value === "" ? null : Number(event.target.value) }))} placeholder="Máx." />
          <BaseSelect className="col-span-2 2xl:col-span-1" value={filters.tempo_cliente_unidade} onChange={(event) => setFilters((current) => ({ ...current, tempo_cliente_unidade: event.target.value as "mes" | "ano" }))}>
            <option value="mes">Meses</option>
            <option value="ano">Anos</option>
          </BaseSelect>
        </div>
      </div>

      <label className="flex min-w-0 items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-4">
        <input
          type="checkbox"
          checked={filters.somente_ultrapassou_media}
          onChange={(event) => setFilters((current) => ({ ...current, somente_ultrapassou_media: event.target.checked }))}
        />
        Somente clientes que ultrapassaram a média real de atraso
      </label>
    </div>
  );
}

function SearchResults({
  result,
  loading,
  onPage,
  onDetail,
  onExport,
}: {
  result: Intranet2SearchResponse;
  loading: boolean;
  onPage: (page: number) => void;
  onDetail: (id: number) => void;
  onExport: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Informações encontradas</h2>
            <p className="mt-1 text-sm text-slate-500">{formatInteger(result.total)} clientes encontrados · 20 linhas por página.</p>
          </div>
          <HelpHint text="A tabela mostra o plano atual encontrado para cada empresa. Clique na lupa para abrir o histórico completo e todas as informações disponíveis daquele cliente." />
        </div>
        <button type="button" onClick={onExport} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto">
          <Download size={16} />
          Exportar Informações
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1220px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Empresa ID</th>
              <th className="px-4 py-3">Razão Social</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Duração</th>
              <th className="px-4 py-3">Valor do Plano</th>
              <th className="px-4 py-3">Data de Vencimento</th>
              <th className="px-4 py-3">Churn Score</th>
              <th className="px-4 py-3 text-center">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.empresa_id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-800">{row.empresa_id}</td>
                <td className="px-4 py-3 font-medium text-slate-700">{row.razao_social || "—"}</td>
                <td className="px-4 py-3">{row.nome_plano}</td>
                <td className="px-4 py-3">{durationLabel(row.duracao)}</td>
                <td className="px-4 py-3 font-semibold">{formatMoney(row.valor)}</td>
                <td className="px-4 py-3">{formatDate(row.data_vencimento)}</td>
                <td className="px-4 py-3">
                  {row.churn_score === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-950">{row.churn_score}</span>
                      {row.nivel_risco && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{row.nivel_risco}</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onDetail(row.empresa_id)}
                    className="inline-grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    title="Ver todas as informações do cliente"
                    aria-label={`Ver detalhes do cliente ${row.empresa_id}`}
                  >
                    <Search size={17} />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && result.rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">Nenhum cliente encontrado com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
        <span>Página {result.page} de {result.total_paginas}</span>
        <div className="flex gap-2">
          <button type="button" disabled={loading || result.page <= 1} onClick={() => onPage(result.page - 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">
            <ChevronLeft size={16} />Anterior
          </button>
          <button type="button" disabled={loading || result.page >= result.total_paginas} onClick={() => onPage(result.page + 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">
            Próxima<ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({
  initialFilters,
  options,
  onClose,
}: {
  initialFilters: Intranet2Filters;
  options: Intranet2Options | null;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<Intranet2Filters>(initialFilters);
  const [result, setResult] = useState<Intranet2ExportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [copyMessage, setCopyMessage] = useState("");

  async function generate(currentFilters = filters) {
    setLoading(true);
    setError(null);
    setCopyMessage("");
    try {
      const response = await fetchIntranet2Export(currentFilters);
      setResult(response);
      setTablePage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar as informações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void generate(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadCsv() {
    if (!result) return;
    const header = EXPORT_COLUMNS.map((column) => csvEscape(column.label)).join(";");
    const body = result.rows.map((row) => EXPORT_COLUMNS.map((column) => csvEscape(row[column.key])).join(";")).join("\r\n");
    downloadBlob(`\uFEFF${header}\r\n${body}`, "text/csv;charset=utf-8", "intranet_2.csv");
  }

  async function downloadXlsx() {
    if (!result) return;
    const XLSX = await import("xlsx");
    const rows = result.rows.map((row) => Object.fromEntries(EXPORT_COLUMNS.map((column) => [column.label, row[column.key] ?? ""])));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = EXPORT_COLUMNS.map((column) => ({ wch: Math.max(12, Math.min(32, column.label.length + 4)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Intranet 2.0");
    XLSX.writeFile(workbook, "intranet_2.xlsx");
  }

  async function copyToGoogleSheets() {
    if (!result) return;
    const sheetWindow = window.open("https://sheets.new", "_blank", "noopener,noreferrer");
    const header = EXPORT_COLUMNS.map((column) => column.label).join("\t");
    const rows = result.rows.map((row) => EXPORT_COLUMNS.map((column) => valueToText(row[column.key]).replaceAll("\t", " ").replaceAll("\n", " ")).join("\t"));
    try {
      await navigator.clipboard.writeText([header, ...rows].join("\n"));
      setCopyMessage(`${formatInteger(result.total)} linhas copiadas. Cole com Ctrl+V no Google Sheets.`);
      if (!sheetWindow) setCopyMessage(`${formatInteger(result.total)} linhas copiadas. Abra o Google Sheets e cole com Ctrl+V.`);
    } catch {
      setCopyMessage("O navegador não permitiu copiar. Use CSV ou XLSX.");
    }
  }

  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil((result?.rows.length ?? 0) / pageSize));
  const visibleRows = result?.rows.slice((tablePage - 1) * pageSize, tablePage * pageSize) ?? [];

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-screen w-full min-w-0 overflow-y-auto bg-white shadow-2xl sm:max-h-[94vh] sm:max-w-[1550px] sm:rounded-[2rem]">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Exportação</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">Exportar Informações</h3>
            <p className="mt-1 text-sm text-slate-500">Refine os filtros, gere a tabela e exporte as informações.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
        </div>

        <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
          <FiltersGrid filters={filters} setFilters={setFilters} options={options} />

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button type="button" onClick={() => void generate()} disabled={loading} className="w-full rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
              {loading ? "Gerando tabela..." : "Gerar tabela"}
            </button>
            {result && <span className="text-sm text-slate-500">{formatInteger(result.total)} registros encontrados.</span>}
          </div>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {result && (
            <>
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                <button type="button" onClick={downloadCsv} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"><Download size={16} />CSV</button>
                <button type="button" onClick={() => void downloadXlsx()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"><FileSpreadsheet size={16} />XLSX</button>
                <button type="button" onClick={() => void copyToGoogleSheets()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"><ClipboardCopy size={16} />Copiar tudo para Google Sheets</button>
              </div>
              {copyMessage && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{copyMessage}</div>}

              <div className="overflow-auto rounded-2xl border border-slate-200" style={{ maxHeight: 520 }}>
                <table className="min-w-[2800px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>{EXPORT_COLUMNS.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 text-left">{column.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row) => (
                      <tr key={row.empresa_id}>
                        {EXPORT_COLUMNS.map((column) => {
                          const value = row[column.key];
                          const formatted = column.key === "valor" ? formatMoney(Number(value || 0)) : valueToText(value);
                          return <td key={column.key} className="whitespace-nowrap px-3 py-3 text-slate-700">{formatted}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>Página {tablePage} de {totalPages} · a exportação contém todas as {formatInteger(result.total)} linhas.</span>
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

function KeyValueGrid({ data }: { data: Record<string, unknown> | null | undefined }) {
  const entries = Object.entries(data ?? {});
  if (!entries.length) return <p className="text-sm text-slate-400">Nenhuma informação disponível.</p>;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{humanizeKey(key)}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm font-medium text-slate-800">{valueToText(value)}</pre>
        </div>
      ))}
    </div>
  );
}

function DynamicTable({ rows, emptyText = "Nenhuma informação disponível." }: { rows: Array<Record<string, unknown>>; emptyText?: string }) {
  const columns = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
    }));
    return result;
  }, [rows]);

  if (!rows.length) return <p className="text-sm text-slate-400">{emptyText}</p>;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200" style={{ maxHeight: 520 }}>
      <table className="min-w-max text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-3 text-left">{humanizeKey(column)}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.atendimento_id ?? index)}>
              {columns.map((column) => <td key={column} className="max-w-[420px] whitespace-pre-wrap break-words px-3 py-3 align-top text-slate-700">{valueToText(row[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailModal({ empresaId, onClose }: { empresaId: number; onClose: () => void }) {
  const [data, setData] = useState<Intranet2ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("resumo");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchIntranet2ClientDetail(empresaId)
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Erro ao carregar o cliente."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [empresaId]);

  const tabs = [
    ["resumo", "Resumo"],
    ["empresa", "Dados da empresa"],
    ["contato", "Dados de contato"],
    ["perfil", "Segmento e perfil"],
    ["planos", "Planos e durações"],
    ["pagamentos", "Pagamentos"],
    ["atrasos", "Atrasos"],
    ["atendimentos", "Atendimentos"],
    ["fiscal", "Fiscal"],
    ["outros", "Outros dados"],
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-screen w-full min-w-0 overflow-y-auto bg-white shadow-2xl sm:max-h-[95vh] sm:max-w-[1550px] sm:rounded-[2rem]">
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Cliente completo</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">Empresa #{empresaId}</h3>
              {data && data.resumo.razao_social !== null && data.resumo.razao_social !== undefined && data.resumo.razao_social !== "" && (
                <p className="mt-1 text-sm text-slate-500">{String(data.resumo.razao_social)}</p>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
          </div>

          {data && (
            <div className="overflow-x-auto px-4 pb-4 sm:px-6 lg:px-8">
              <div className="flex min-w-max gap-2">
                {tabs.map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${tab === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
          {loading && <div className="py-14 text-center text-sm text-slate-500">Carregando todas as informações do cliente...</div>}
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {data && tab === "resumo" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {["churn_score", "nivel_risco", "segmento", "setor", "ltv", "renovacoes", "reativacoes", "atendimentos"].map((key) => (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{humanizeKey(key)}</p>
                    <p className="mt-2 text-xl font-bold text-slate-950">{valueToText(data.resumo[key])}</p>
                  </div>
                ))}
              </div>
              <KeyValueGrid data={data.resumo} />
              {Boolean(data.resumo.intranet_url) && (
                <a href={String(data.resumo.intranet_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
                  Abrir intranet atual <ExternalLink size={16} />
                </a>
              )}
            </>
          )}

          {data && tab === "empresa" && (
            <div className="space-y-5">
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Cadastro da empresa</h4><KeyValueGrid data={data.empresa} /></div>
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Plano atual</h4><KeyValueGrid data={data.plano_atual} /></div>
            </div>
          )}

          {data && tab === "contato" && (
            <div className="space-y-5">
              <div>
                <h4 className="mb-3 text-lg font-bold text-slate-900">Contato principal</h4>
                <KeyValueGrid data={data.plano_atual ? {
                  nome_usuario: data.plano_atual.nome_usuario,
                  email: data.plano_atual.email,
                  telefone: data.plano_atual.telefone,
                  razao_social: data.plano_atual.razao_social,
                  estado: data.plano_atual.estado,
                  cidade: data.plano_atual.nome_cidade,
                } : null} />
              </div>
              <div>
                <h4 className="mb-3 text-lg font-bold text-slate-900">Lojas e contatos cadastrados</h4>
                <DynamicTable rows={data.lojas} />
              </div>
            </div>
          )}

          {data && tab === "perfil" && (
            <div className="space-y-5">
              <h4 className="text-lg font-bold text-slate-900">Perfil da empresa</h4>
              <KeyValueGrid data={data.perfil_empresa} />
            </div>
          )}

          {data && tab === "planos" && (
            <div className="space-y-5">
              <h4 className="text-lg font-bold text-slate-900">Todos os planos e durações</h4>
              <DynamicTable rows={data.planos} />
            </div>
          )}

          {data && tab === "pagamentos" && (
            <div className="space-y-5">
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Resumo de pagamentos</h4><KeyValueGrid data={data.metricas_pagamento} /></div>
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Histórico de pagamentos</h4><DynamicTable rows={data.pagamentos} /></div>
            </div>
          )}

          {data && tab === "atrasos" && (
            <div className="space-y-5">
              <h4 className="text-lg font-bold text-slate-900">Histórico de atrasos e reativações</h4>
              <DynamicTable rows={data.atrasos} />
            </div>
          )}

          {data && tab === "atendimentos" && (
            <div className="space-y-6">
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Atendimentos</h4><DynamicTable rows={data.atendimentos} /></div>
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Contexto dos atendimentos</h4><DynamicTable rows={data.atendimentos_contexto} /></div>
            </div>
          )}

          {data && tab === "fiscal" && (
            <div className="space-y-5">
              <h4 className="text-lg font-bold text-slate-900">Notas fiscais encontradas</h4>
              <DynamicTable rows={data.notas_fiscais} />
            </div>
          )}

          {data && tab === "outros" && (
            <div className="space-y-6">
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Questionários</h4><DynamicTable rows={data.questionarios} /></div>
              <div><h4 className="mb-3 text-lg font-bold text-slate-900">Churn Score completo</h4><KeyValueGrid data={data.churn_score} /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Intranet2Dashboard() {
  const [filters, setFilters] = useState<Intranet2Filters>(DEFAULT_FILTERS);
  const [options, setOptions] = useState<Intranet2Options | null>(null);
  const [result, setResult] = useState<Intranet2SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    fetchIntranet2Options().then(setOptions).catch(() => setOptions(null));
  }, []);

  async function runSearch(page = 1) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchIntranet2Search(filters, page, 20);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao filtrar as informações.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0 p-3 sm:p-5 lg:p-8">
      <div className="mx-auto min-w-0 max-w-[1680px] space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Intranet 2.0</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Encontre clientes usando os filtros abaixo e abra uma visão completa de cada empresa.
          </p>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
          <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Filtros</h2>
              <p className="mt-1 text-sm text-slate-500">Preencha somente os campos necessários para a sua busca.</p>
            </div>
            <HelpHint text="Você pode combinar quantos filtros quiser. Campos vazios são ignorados. Em filtros com mínimo e máximo, é possível preencher somente um dos lados." />
          </div>

          <FiltersGrid filters={filters} setFilters={setFilters} options={options} />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => void runSearch(1)} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto">
              <Filter size={16} />{loading ? "Filtrando..." : "Filtrar Informações"}
            </button>
            <button type="button" onClick={() => { setFilters(DEFAULT_FILTERS); setResult(null); setError(null); }} className="w-full rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto">
              Limpar filtros
            </button>
          </div>
        </div>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {result && (
          <SearchResults
            result={result}
            loading={loading}
            onPage={(page) => void runSearch(page)}
            onDetail={setDetailId}
            onExport={() => setExportOpen(true)}
          />
        )}
      </div>

      {exportOpen && <ExportModal initialFilters={filters} options={options} onClose={() => setExportOpen(false)} />}
      {detailId !== null && <DetailModal empresaId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
