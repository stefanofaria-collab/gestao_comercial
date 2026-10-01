"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CircleHelp,
  ExternalLink,
  FileSearch,
  MousePointerClick,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  enrichProfileBusinessAnalytics,
  fetchCnpjProfile,
  fetchProfileBusinessAnalytics,
  fetchProfileClientMetrics,
  fetchProfileClients,
  fetchProfileDashboard,
  fetchProfileFilterOptions,
} from "@/lib/perfil-api";
import type {
  CompanyProfile,
  DocumentQuality,
  ProfileBusinessAnalyticsResponse,
  ProfileBusinessBreakdown,
  ProfileBusinessCompareItem,
  ProfileBusinessTopItem,
  PersonTypeSummary,
  ProfileClient,
  ProfileClientFilters,
  ProfileClientListResponse,
  ProfileClientMetrics,
  ProfileDashboardResponse,
  ProfileFilterOptions,
} from "@/types/perfil";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const MONTHS = [
  "Ano completo",
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
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const number2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMoney(value: number) {
  return money.format(value || 0);
}

function formatInteger(value: number) {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatNumber2(value: number) {
  return number2.format(value || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTenure(months: number) {
  if (!Number.isFinite(months) || months <= 0) return "0 meses";
  if (months < 12) return `${number2.format(months)} meses`;
  return `${number2.format(months / 12)} anos`;
}

function paymentAverageText(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Sem histórico de renovação";
  if (value < 0) return `${number2.format(Math.abs(value))} dias antes do vencimento`;
  if (value > 0) return `${number2.format(value)} dias depois do vencimento`;
  return "Pagamento no vencimento";
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

function LoadingBlock({ text = "Carregando o perfil dos clientes..." }: { text?: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw className="mx-auto animate-spin text-blue-600" size={24} />
        <p className="mt-3 text-sm font-semibold text-slate-700">{text}</p>
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
          <p className="font-semibold">Não foi possível carregar a página</p>
          <p className="mt-2 text-sm leading-6">{message}</p>
          <button type="button" onClick={retry} className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-rose-100">
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle, helpText }: { title: string; subtitle?: string; helpText: string }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <HelpTip text={helpText} />
      </div>
      {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
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

function person(data: ProfileDashboardResponse | null, type: "PF" | "PJ") {
  return data?.por_tipo_pessoa.find((row) => row.tipo === type) ?? null;
}

function PersonCard({ item }: { item: PersonTypeSummary }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{item.tipo === "PJ" ? "Pessoa jurídica" : item.tipo === "PF" ? "Pessoa física" : "Não identificado"}</p>
          <p className="mt-1 text-xl font-bold text-slate-950">Comparação da base</p>
        </div>
        <UsersRound className="text-blue-600" size={22} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Clientes ativos</p>
          <p className="mt-1 text-lg font-bold">{formatInteger(item.ativos)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Clientes em churn</p>
          <p className="mt-1 text-lg font-bold">{formatInteger(item.churns)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Valor atual da base</p>
          <p className="mt-1 font-bold">{formatMoney(item.valor_ativos)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">LTV médio do churn</p>
          <p className="mt-1 font-bold">{formatMoney(item.ltv_medio_churn)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Tempo médio até sair</p>
          <p className="mt-1 font-bold">{decimal.format(item.tempo_medio_churn_meses / 12)} anos</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Renovações antes de sair</p>
          <p className="mt-1 font-bold">{decimal.format(item.renovacoes_media_churn)}</p>
        </div>
      </div>
    </div>
  );
}

function QualityCard({ title, data }: { title: string; data: DocumentQuality }) {
  const rows = [
    ["Cadastro como PJ", data.cadastro_pj],
    ["Cadastro como PF", data.cadastro_pf],
    ["CNPJ igual no cadastro e na nota", data.cnpj_igual_cadastro_nota],
    ["CNPJ diferente no cadastro e na nota", data.cnpj_diferente_cadastro_nota],
    ["Cadastro PF com CNPJ na nota", data.cadastro_pf_com_cnpj_na_nota],
    ["Sem CNPJ para consultar", data.sem_cnpj_consultavel],
  ] as const;
  const max = Math.max(...rows.map((row) => row[1]), 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionTitle
        title={title}
        helpText="Este quadro verifica como os documentos estão preenchidos. Ele ajuda a saber quando o CNPJ do cadastro é igual ao CNPJ usado na nota fiscal e quando são diferentes."
      />
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-600">{label}</span>
              <span className="font-semibold text-slate-900">{formatInteger(value)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, value / max * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function BreakdownBars({
  title,
  items,
}: {
  title: string;
  items: { label: string; quantidade: number }[];
}) {
  const max = Math.max(...items.map((item) => item.quantidade), 1);
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {items.length === 0 && <p className="mt-2 text-sm text-slate-400">Nenhum cliente encontrado nesta divisão.</p>}
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{item.label}</span>
              <span className="font-semibold text-slate-950">{formatInteger(item.quantidade)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, item.quantidade / max * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdownModal({
  title,
  active,
  churn,
  groupLabel,
  onClose,
}: {
  title: string;
  active?: ProfileBusinessBreakdown;
  churn?: ProfileBusinessBreakdown;
  groupLabel?: string;
  onClose: () => void;
}) {
  const singleGroup = Boolean(groupLabel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Planos e durações</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {singleGroup
                ? `Veja quais planos e durações aparecem entre ${groupLabel?.toLowerCase()}.`
                : "Compare quais planos e durações aparecem nos clientes ativos e nos clientes em churn."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>

        {singleGroup ? (
          <div className="grid gap-8 px-6 py-6 md:grid-cols-2 lg:px-8">
            <BreakdownBars title="Planos usados" items={active?.planos ?? []} />
            <BreakdownBars title="Durações usadas" items={active?.duracoes ?? []} />
          </div>
        ) : (
          <div className="space-y-8 px-6 py-6 lg:px-8">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-600" />
                <h4 className="text-lg font-bold text-slate-950">Clientes ativos</h4>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <BreakdownBars title="Planos usados pelos ativos" items={active?.planos ?? []} />
                <BreakdownBars title="Durações usadas pelos ativos" items={active?.duracoes ?? []} />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500" />
                <h4 className="text-lg font-bold text-slate-950">Clientes em churn</h4>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <BreakdownBars title="Planos usados pelos churns" items={churn?.planos ?? []} />
                <BreakdownBars title="Durações usadas pelos churns" items={churn?.duracoes ?? []} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BusinessComparePanel({
  title,
  subtitle,
  helpText,
  items,
}: {
  title: string;
  subtitle: string;
  helpText: string;
  items: ProfileBusinessCompareItem[];
}) {
  const [selected, setSelected] = useState<ProfileBusinessCompareItem | null>(null);
  const max = Math.max(...items.flatMap((item) => [item.ativos, item.churn]), 1);
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <SectionTitle title={title} subtitle={subtitle} helpText={helpText} />
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            <MousePointerClick size={12} />
            Clique para ver planos e durações
          </span>
        </div>
        {items.length === 0 && <p className="text-sm text-slate-400">Ainda não há empresas enriquecidas o suficiente para montar esta análise.</p>}
        <div className="space-y-4">
          {items.map((item) => (
            <button
              type="button"
              key={item.label}
              onClick={() => setSelected(item)}
              className="block w-full rounded-xl p-2 text-left transition hover:bg-blue-50/50"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                {item.label}
                <MousePointerClick size={13} className="text-blue-600" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Ativos</span><span className="font-semibold text-slate-800">{formatInteger(item.ativos)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, item.ativos / max * 100)}%` }} /></div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Churn</span><span className="font-semibold text-slate-800">{formatInteger(item.churn)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(2, item.churn / max * 100)}%` }} /></div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <CategoryBreakdownModal
          title={`${title}: ${selected.label}`}
          active={selected.ativos_detalhes}
          churn={selected.churn_detalhes}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function TopCategoryPanel({
  title,
  subtitle,
  helpText,
  items,
  groupLabel,
}: {
  title: string;
  subtitle: string;
  helpText: string;
  items: ProfileBusinessTopItem[];
  groupLabel: string;
}) {
  const [selected, setSelected] = useState<ProfileBusinessTopItem | null>(null);
  const max = Math.max(...items.map((item) => item.quantidade), 1);
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <SectionTitle title={title} subtitle={subtitle} helpText={helpText} />
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            <MousePointerClick size={12} />
            Clique para ver planos e durações
          </span>
        </div>
        {items.length === 0 && <p className="text-sm text-slate-400">Ainda não há empresas enriquecidas o suficiente para montar este ranking.</p>}
        <div className="space-y-2">
          {items.map((item, index) => (
            <button
              type="button"
              key={`${item.label}-${index}`}
              onClick={() => setSelected(item)}
              className="block w-full rounded-xl p-2 text-left transition hover:bg-blue-50/50"
            >
              <div className="mb-1 flex items-start justify-between gap-4 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                  <span>{index + 1}. {item.label}</span>
                  <MousePointerClick size={13} className="shrink-0 text-blue-600" />
                </span>
                <span className="shrink-0 font-semibold text-slate-950">{formatInteger(item.quantidade)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, item.quantidade / max * 100)}%` }} /></div>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <CategoryBreakdownModal
          title={`${title}: ${selected.label}`}
          active={selected.detalhes}
          groupLabel={groupLabel}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function ClientModal({ client, onClose }: { client: ProfileClient; onClose: () => void }) {
  const cnpjOptions = useMemo(() => {
    const values: { source: string; cnpj: string }[] = [];
    if (client.cnpj_cadastro) values.push({ source: "Cadastro da loja", cnpj: client.cnpj_cadastro });
    if (client.cnpj_nota && client.cnpj_nota !== client.cnpj_cadastro) values.push({ source: "Emissão da nota fiscal", cnpj: client.cnpj_nota });
    return values;
  }, [client]);
  const [selectedCnpj, setSelectedCnpj] = useState(cnpjOptions[0]?.cnpj ?? "");
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ProfileClientMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (!selectedCnpj) {
      setCompany(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setCompany(null);

    fetchCnpjProfile(selectedCnpj, controller.signal)
      .then((response) => active && setCompany(response))
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Erro ao consultar o CNPJ no banco.");
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedCnpj]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setMetricsLoading(true);
    setMetrics(null);

    fetchProfileClientMetrics(client.empresa_id, client.status_base, controller.signal)
      .then((response) => active && setMetrics(response))
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setMetrics(null);
      })
      .finally(() => active && setMetricsLoading(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [client.empresa_id, client.status_base]);

  const intranet = `https://intranet.clickdigital.com.br/clientes/visualizar/${client.empresa_id}?aba=5`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Perfil do cliente</p>
            <h3 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{client.cliente}</h3>
            <p className="mt-1 text-sm text-slate-500">{client.status_base} · {client.empresa} · {client.nome_plano} · {client.duracao_label}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6 lg:px-8">
          <div className="flex flex-wrap gap-3">
            <a href={intranet} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              <ExternalLink size={16} />
              Abrir cliente no intranet
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Tipo no cadastro" value={client.tipo_pessoa} subtitle={client.documento_cadastro ?? "Documento não identificado"} helpText="PF significa pessoa física. PJ significa pessoa jurídica. Esta classificação usa o documento preenchido no cadastro da loja." />
            <Kpi title="Documento usado na nota" value={client.tipo_documento_nota} subtitle={client.documento_nota ?? "Documento não identificado"} helpText="Este é o tipo de documento informado para a emissão da nota fiscal. Ele pode ser diferente do documento do cadastro." />
            <Kpi title="Plano atual / ao sair" value={client.nome_plano} subtitle={client.duracao_label} helpText="Mostra o plano que o cliente possui hoje, se estiver ativo, ou o plano que possuía quando entrou em churn." />
            <Kpi title="Valor do plano" value={formatMoney(client.valor)} subtitle={client.status_base === "Ativo" ? "Valor atual do plano." : "Valor do último plano antes do churn."} helpText="Mostra o valor financeiro associado ao plano usado nesta análise." />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Último vencimento" value={metricsLoading ? "Carregando..." : formatDate(client.status_base === "Churn" ? client.data_vencimento : metrics?.ultimo_vencimento)} subtitle="Data de vencimento do plano mais recente do cliente." helpText="Mostra o vencimento mais recente encontrado para o cliente." />
            <Kpi title="Tempo como cliente" value={metricsLoading ? "Carregando..." : formatTenure(client.status_base === "Churn" ? (client.meses_cliente ?? 0) : (metrics?.tempo_cliente_meses ?? 0))} subtitle={metrics ? `${formatInteger(client.status_base === "Churn" ? Math.round((client.meses_cliente ?? 0) * 30.4375) : metrics.tempo_cliente_dias)} dias aproximadamente.` : ""} helpText="Mostra há quanto tempo o cliente está ou ficou conosco, usando a data de ativação como início." />
            <Kpi title="Renovações" value={metricsLoading ? "Carregando..." : formatInteger(client.status_base === "Churn" ? (client.renovacoes ?? 0) : (metrics?.renovacoes ?? 0))} subtitle="Quantidade de renovações registradas no histórico." helpText="Mostra quantas vezes o cliente voltou a pagar um novo ciclo depois da primeira contratação." />
            <Kpi title="Reativações" value={metricsLoading ? "Carregando..." : formatInteger(metrics?.reativacoes ?? 0)} subtitle="Retornos após 60 dias ou mais sem renovação." helpText="Uma reativação acontece quando o cliente já havia sido considerado churn, por ficar 60 dias ou mais sem renovar, e depois voltou." />
            <Kpi title="LTV" value={metricsLoading ? "Carregando..." : formatMoney(client.status_base === "Churn" ? (client.ltv ?? 0) : (metrics?.ltv ?? 0))} subtitle="Tudo o que o cliente pagou em planos no histórico." helpText="LTV é quanto dinheiro o cliente deixou ao longo de todo o relacionamento conosco." />
            <Kpi title="Ticket médio" value={metricsLoading ? "Carregando..." : formatMoney(client.status_base === "Churn" ? (client.ticket_medio ?? 0) : (metrics?.ticket_medio ?? 0))} subtitle="Valor médio dos pagamentos históricos." helpText="É a média do valor pago em cada contratação ou renovação do cliente." />
            <Kpi title="Atraso real médio" value={metricsLoading ? "Carregando..." : paymentAverageText(metrics?.media_dias_pagamento_real)} subtitle="Reativações não entram nesta média." helpText="Mostra, em média, quantos dias antes ou depois do vencimento o cliente renova. Quando uma volta aconteceu após 60 dias, esse período não é tratado como atraso: é uma reativação e fica fora da média." />
            <Kpi title="Pagamentos encontrados" value={metricsLoading ? "Carregando..." : formatInteger(metrics?.qtd_pagamentos ?? 0)} subtitle="Inclui a primeira contratação e os ciclos seguintes." helpText="É a quantidade total de pagamentos de planos encontrados para este cliente." />
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <SectionTitle
              title="Dados públicos da empresa"
              subtitle="Informações cadastrais disponíveis para o CNPJ selecionado."
              helpText="Ao abrir um cliente, esta área lê os dados empresariais que já estão disponíveis no banco do projeto."
            />

            {cnpjOptions.length > 1 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Qual CNPJ você quer analisar?</p>
                <div className="flex flex-wrap gap-2">
                  {cnpjOptions.map((option) => (
                    <button
                      type="button"
                      key={`${option.source}-${option.cnpj}`}
                      onClick={() => setSelectedCnpj(option.cnpj)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${selectedCnpj === option.cnpj ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}
                    >
                      {option.source}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-amber-700">Os CNPJs do cadastro e da nota fiscal são diferentes. Você pode alternar entre os dois.</p>
              </div>
            )}

            {cnpjOptions.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Não existe um CNPJ consultável para este cliente. Se o cadastro for CPF, não há dados empresariais disponíveis.
              </div>
            )}

            {loading && <LoadingBlock text="Buscando os dados empresariais no banco..." />}
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

            {company && !loading && (
              <div className="space-y-5">
                <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">{company.razao_social || "Razão social não informada"}</p>
                  <p className="mt-1 text-xs">Fonte: {company.fonte}. {company.aviso_fonte}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Kpi title="CNAE principal" value={company.cnae_principal.codigo || "—"} subtitle={company.cnae_principal.descricao || "Descrição não encontrada"} helpText="CNAE é o código oficial que diz qual é a principal atividade econômica da empresa." />
                  <Kpi title="Setor" value={company.setor || "Não identificado"} subtitle="Derivado da classificação oficial do CNAE." helpText="Setor é uma categoria bem ampla da atividade da empresa, como comércio, indústria ou serviços." />
                  <Kpi title="Segmento" value={company.segmento || "Não identificado"} subtitle={company.grupo_cnae || "Classificação do CNAE"} helpText="Segmento deixa a atividade um pouco mais específica dentro do setor. Ele é derivado da hierarquia oficial do CNAE." />
                  <Kpi title="Porte" value={company.porte || "Não informado"} subtitle="Classificação cadastral da empresa." helpText="O porte indica o tamanho cadastral da empresa, por exemplo Microempresa, Empresa de Pequeno Porte ou Demais." />
                  <Kpi title="Regime tributário" value={company.regime_tributario || "Não identificado"} subtitle={`Simples: ${company.simples_nacional === true ? "Sim" : company.simples_nacional === false ? "Não" : "Não informado"} · MEI: ${company.mei === true ? "Sim" : company.mei === false ? "Não" : "Não informado"}`} helpText="Mostra a forma de tributação encontrada nas fontes públicas. Quando a empresa é MEI ou optante do Simples, isso também aparece aqui." />
                  <Kpi title="CNAEs secundários" value={formatInteger(company.cnaes_secundarios.length)} subtitle="Outras atividades econômicas cadastradas." helpText="Além da atividade principal, uma empresa pode ter outras atividades registradas. Este cartão mostra quantos CNAEs secundários foram encontrados." />
                  <Kpi title="Situação cadastral" value={company.situacao_cadastral || "Não informada"} subtitle={company.matriz_filial || "Matriz/filial não informado"} helpText="Mostra a situação do CNPJ na base pública, como ativa, baixada, suspensa ou inapta." />
                  <Kpi title="Capital social" value={formatMoney(company.capital_social)} subtitle={company.natureza_juridica || "Natureza jurídica não informada"} helpText="Capital social é o valor declarado pelos sócios para formar a empresa. Não é faturamento e não é saldo em caixa." />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">Identificação e localização</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4"><dt className="text-slate-400">Nome fantasia</dt><dd className="text-right font-medium">{company.nome_fantasia || "—"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-400">Início das atividades</dt><dd className="text-right font-medium">{formatDate(company.data_abertura)}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-400">Cidade/UF</dt><dd className="text-right font-medium">{[company.municipio, company.uf].filter(Boolean).join(" / ") || "—"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-400">Endereço</dt><dd className="max-w-[65%] text-right font-medium">{company.endereco || "—"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-400">Telefone</dt><dd className="text-right font-medium">{company.telefone || "—"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-400">E-mail</dt><dd className="max-w-[65%] break-all text-right font-medium">{company.email || "—"}</dd></div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">Outras atividades da empresa</p>
                    <div className="mt-3 max-h-52 space-y-2 overflow-y-auto text-sm">
                      {company.cnaes_secundarios.length === 0 && <p className="text-slate-400">Nenhum CNAE secundário retornado.</p>}
                      {company.cnaes_secundarios.map((item) => (
                        <div key={`${item.codigo}-${item.descricao}`} className="rounded-lg bg-slate-50 p-2">
                          <span className="font-semibold">{item.codigo}</span> · {item.descricao || "Sem descrição"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {company.socios.length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">Sócios e administradores retornados pela fonte pública</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {company.socios.map((item, index) => (
                        <div key={`${item.nome}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                          <p className="font-semibold text-slate-800">{item.nome || "Nome não informado"}</p>
                          <p className="mt-1 text-xs text-slate-400">{item.qualificacao || "Qualificação não informada"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PerfilDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const { filters } = useGlobalFilters();
  const financial = filters.viewMode === "financeiro";

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<ProfileDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [group, setGroup] = useState<"ativos" | "churn">("ativos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [clientList, setClientList] = useState<ProfileClientListResponse | null>(null);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ProfileClient | null>(null);
  const [businessData, setBusinessData] = useState<ProfileBusinessAnalyticsResponse | null>(null);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [businessUpdating, setBusinessUpdating] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [cnpjSource, setCnpjSource] = useState<"cadastro" | "nota">("cadastro");
  const [filterOptions, setFilterOptions] = useState<ProfileFilterOptions | null>(null);
  const [clientFilters, setClientFilters] = useState<ProfileClientFilters>({
    regime_tributario: "",
    porte: "",
    setor: "",
    segmento: "",
    plano: "",
    duracao: "",
  });

  const years = useMemo(() => Array.from({ length: currentYear - 2024 + 1 }, (_, index) => 2024 + index), [currentYear]);

  useEffect(() => {
    if (year === currentYear && month > currentMonth) {
      setMonth(currentMonth);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetchProfileDashboard(year, month, filters, controller.signal)
      .then((response) => active && setData(response))
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar o perfil.");
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [year, month, currentYear, currentMonth, filters, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetchProfileFilterOptions(year, month, filters, controller.signal)
      .then((response) => active && setFilterOptions(response))
      .catch(() => active && setFilterOptions(null));
    return () => {
      active = false;
      controller.abort();
    };
  }, [year, month, filters, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const timer = globalThis.setTimeout(() => {
      setClientsLoading(true);
      fetchProfileClients(year, month, filters, group, search, page, 50, controller.signal, clientFilters, cnpjSource)
        .then((response) => active && setClientList(response))
        .catch(() => {
          if (!active || controller.signal.aborted) return;
          setClientList(null);
        })
        .finally(() => active && setClientsLoading(false));
    }, 250);

    return () => {
      active = false;
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [year, month, filters, group, search, page, clientFilters, cnpjSource]);


  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBusinessLoading(true);
    setBusinessError(null);

    fetchProfileBusinessAnalytics(year, month, filters, cnpjSource, controller.signal)
      .then((response) => active && setBusinessData(response))
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        setBusinessError(err instanceof Error ? err.message : "Erro ao carregar os dados empresariais do banco.");
      })
      .finally(() => active && setBusinessLoading(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [year, month, filters, cnpjSource, reloadKey]);

  async function updateBusinessData() {
    if (businessUpdating || businessLoading) return;

    setBusinessUpdating(true);
    setBusinessError(null);
    try {
      const response = await enrichProfileBusinessAnalytics(year, month, filters, cnpjSource, 50);
      setBusinessData(response);
    } catch (err) {
      setBusinessError(err instanceof Error ? err.message : "Erro ao reler os dados empresariais do banco.");
    } finally {
      setBusinessUpdating(false);
    }
  }

  useEffect(() => { setPage(1); }, [group, search, year, month, filters, clientFilters, cnpjSource]);

  const pj = person(data, "PJ");
  const pf = person(data, "PF");

  const comparisonOption = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ axisValue?: string; seriesName?: string; value?: number; marker?: string }>) => {
          const title = params?.[0]?.axisValue ?? "";
          const rows = (params ?? []).map((item) => `${item.marker ?? ""} ${item.seriesName ?? ""}: ${financial ? `R$ ${formatNumber2(Number(item.value ?? 0))}` : formatInteger(Number(item.value ?? 0))}`);
          return [title, ...rows].join("<br/>");
        },
      },
      legend: { top: 0 },
      grid: { left: 20, right: 20, top: 45, bottom: 20, containLabel: true },
      xAxis: { type: "category", data: ["Pessoa jurídica", "Pessoa física"] },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (value: number) => financial ? formatNumber2(value) : formatInteger(value) },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      series: financial
        ? [
            { name: "Valor atual da base", type: "bar", data: [pj?.valor_ativos ?? 0, pf?.valor_ativos ?? 0] },
            { name: "LTV total do churn", type: "bar", data: [pj?.ltv_total_churn ?? 0, pf?.ltv_total_churn ?? 0] },
          ]
        : [
            { name: "Clientes ativos", type: "bar", data: [pj?.ativos ?? 0, pf?.ativos ?? 0] },
            { name: "Clientes em churn", type: "bar", data: [pj?.churns ?? 0, pf?.churns ?? 0] },
          ],
    };
  }, [data, financial, pj, pf]);

  return (
    <div className="p-5 lg:p-8">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Perfil dos clientes</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
              Esta página compara quem continua ativo com quem entrou em churn e usa as informações empresariais disponíveis no banco do projeto.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <CalendarDays size={18} className="text-slate-400" />
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none">
              {MONTHS.map((label, index) => (
                <option key={label} value={index} disabled={year === currentYear && index > currentMonth}>{label}</option>
              ))}
            </select>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none">
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-900">
          <strong>Como ler esta página:</strong> a base ativa é um retrato de hoje. O churn usa o período escolhido acima. Assim conseguimos comparar o perfil de quem está conosco agora com o perfil de quem saiu naquele período.
        </div>

        {loading && <LoadingBlock />}
        {error && <ErrorBlock message={error} retry={() => setReloadKey((value) => value + 1)} />}

        {data && !loading && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Kpi title="Clientes ativos hoje" value={formatInteger(data.resumo.clientes_ativos)} subtitle={`Base ativa em ${formatDate(data.data_base_ativa)}.`} helpText="Conta os clientes que estão ativos hoje, usando a regra da consulta de clientes ativos." />
              <Kpi title="Clientes em churn no período" value={formatInteger(data.resumo.clientes_churn)} subtitle={month === 0 ? `Acumulado de ${year}.` : `${MONTHS[month]} de ${year}.`} helpText="Conta os clientes que completaram a regra de churn no período escolhido." />
              <Kpi title="Valor atual da base ativa" value={formatMoney(data.resumo.valor_base_ativa)} subtitle="Soma do valor dos planos atuais." helpText="Soma o valor dos planos dos clientes que continuam ativos. Não é LTV e não é faturamento mensal recebido." />
              <Kpi title="LTV total dos churns" value={formatMoney(data.resumo.ltv_total_churn)} subtitle="Tudo o que os clientes perdidos pagaram em planos." helpText="LTV é a soma dos pagamentos de planos feitos pelo cliente até sair. Este cartão soma o LTV de todos os churns do período." />
              <Kpi title="LTV médio dos churns" value={formatMoney(data.resumo.ltv_medio_churn)} subtitle="Média por cliente perdido." helpText="Pega o LTV total dos clientes perdidos e divide pela quantidade de clientes em churn." />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {pj && <PersonCard item={pj} />}
              {pf && <PersonCard item={pf} />}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                title={financial ? "Dinheiro da base ativa x LTV dos clientes perdidos" : "Quantidade de ativos x clientes perdidos"}
                subtitle={financial ? "O primeiro valor é o valor atual dos planos ativos. O segundo é o LTV histórico dos clientes que saíram." : "Compara a quantidade de PF e PJ na base ativa com a quantidade que entrou em churn."}
                helpText="Este gráfico coloca PF e PJ lado a lado para mostrar se o perfil de quem está saindo é parecido ou diferente do perfil de quem continua ativo."
              />
              <ReactECharts option={comparisonOption} style={{ height: 340 }} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <QualityCard title="Como os documentos estão preenchidos na base ativa" data={data.qualidade_documentos.ativos} />
              <QualityCard title="Como os documentos estão preenchidos nos churns" data={data.qualidade_documentos.churn} />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <SectionTitle
                  title="Planos: quem está ativo e quem estamos perdendo"
                  subtitle="Separa PF e PJ para mostrar em quais planos o perfil muda mais."
                  helpText="Esta tabela ajuda a entender se um plano tem mais pessoas físicas ou jurídicas na base ativa e qual tipo aparece mais entre os churns."
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Plano</th>
                      <th className="px-4 py-3 text-right">Ativos PJ</th>
                      <th className="px-4 py-3 text-right">Ativos PF</th>
                      <th className="px-4 py-3 text-right">Ativos total</th>
                      <th className="px-4 py-3 text-right">Churn PJ</th>
                      <th className="px-4 py-3 text-right">Churn PF</th>
                      <th className="px-4 py-3 text-right">Churn total</th>
                      <th className="px-4 py-3 text-right">LTV do churn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.por_plano.map((row) => (
                      <tr key={row.plano}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.plano}</td>
                        <td className="px-4 py-3 text-right">{formatInteger(row.ativos_pj)}</td>
                        <td className="px-4 py-3 text-right">{formatInteger(row.ativos_pf)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatInteger(row.ativos_total)}</td>
                        <td className="px-4 py-3 text-right">{formatInteger(row.churn_pj)}</td>
                        <td className="px-4 py-3 text-right">{formatInteger(row.churn_pf)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatInteger(row.churn_total)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.ltv_churn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>


            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <SectionTitle
                    title="Perfil empresarial dos clientes"
                    subtitle="Regime tributário, porte, setores e segmentos dos clientes com informações empresariais disponíveis."
                    helpText="Os gráficos usam as informações empresariais que já estão disponíveis no banco. O botão Atualizar dados do banco relê os registros mais recentes."
                  />
                  {businessData && (
                    <div className="space-y-1 text-xs text-slate-500">
                      <p>
                        Cobertura ativa: <strong>{formatInteger(businessData.cobertura.ativos.clientes_enriquecidos)}</strong> de {formatInteger(businessData.cobertura.ativos.clientes_com_cnpj)} clientes com CNPJ ({number2.format(businessData.cobertura.ativos.percentual)}%).
                        {' '}Cobertura do churn: <strong>{formatInteger(businessData.cobertura.churn.clientes_enriquecidos)}</strong> de {formatInteger(businessData.cobertura.churn.clientes_com_cnpj)} ({number2.format(businessData.cobertura.churn.percentual)}%).
                      </p>
                      <p>
                        Base empresarial: <strong>{formatInteger(businessData.sincronizacao_global.cnpjs_enriquecidos)}</strong> de {formatInteger(businessData.sincronizacao_global.cnpjs_unicos)} CNPJs enriquecidos ({number2.format(businessData.sincronizacao_global.percentual)}%).
                        {' '}Pendentes: <strong>{formatInteger(businessData.sincronizacao_global.cnpjs_pendentes)}</strong>.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    CNPJ usado nas análises
                    <select value={cnpjSource} onChange={(event) => setCnpjSource(event.target.value as "cadastro" | "nota")} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 outline-none">
                      <option value="cadastro">Cadastro da loja</option>
                      <option value="nota">Emissão da nota fiscal</option>
                    </select>
                  </label>
                  <button type="button" onClick={updateBusinessData} disabled={businessUpdating || businessLoading} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {businessUpdating ? "Atualizando dados..." : businessLoading ? "Carregando banco..." : "Atualizar dados do banco"}
                  </button>
                </div>
              </div>
              {businessError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{businessError}</div>}
              {businessData && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">CNPJs disponíveis no banco: {formatInteger(businessData.sincronizacao_global.cnpjs_enriquecidos)} de {formatInteger(businessData.sincronizacao_global.cnpjs_unicos)} CNPJs únicos ({formatNumber2(businessData.sincronizacao_global.percentual)}%).</div>}
            </div>

            {businessLoading && <div className="mt-6"><LoadingBlock text="Carregando o perfil empresarial já enriquecido..." /></div>}

            {businessData && !businessLoading && (
              <>
                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <BusinessComparePanel title="Clientes por regime tributário" subtitle="Compara quantos clientes ativos e churns existem em cada regime encontrado." helpText="Regime tributário é a forma usada pela empresa para pagar impostos, por exemplo Simples Nacional. As barras mostram quantos clientes ativos e quantos churns foram encontrados em cada regime." items={businessData.regime_tributario} />
                  <BusinessComparePanel title="Clientes por porte da empresa" subtitle="Compara o tamanho cadastral das empresas ativas e dos churns." helpText="Porte é o tamanho cadastral da empresa, como Microempresa ou Empresa de Pequeno Porte. Aqui você compara a base ativa com os clientes que saíram." items={businessData.porte} />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <TopCategoryPanel title="10 setores onde temos mais clientes ativos" subtitle="Ranking dos setores com maior quantidade de clientes que continuam conosco." helpText="Setor é uma categoria ampla da atividade econômica da empresa. Este ranking mostra onde está concentrada a nossa base ativa. Clique em uma linha para ver quais planos e durações esses clientes usam." items={businessData.top_setores_ativos} groupLabel="Clientes ativos" />
                  <TopCategoryPanel title="10 setores onde mais perdemos clientes" subtitle="Ranking dos setores com maior quantidade de churns no período escolhido." helpText="Este ranking mostra em quais setores aparecem mais clientes que entraram em churn no período selecionado. Clique em uma linha para ver quais planos e durações esses clientes usavam." items={businessData.top_setores_churn} groupLabel="Clientes em churn" />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <TopCategoryPanel title="10 segmentos onde temos mais clientes ativos" subtitle="Ranking dos segmentos com maior presença na base atual." helpText="Segmento é uma divisão mais específica dentro do setor. Aqui você vê quais segmentos aparecem mais entre os clientes ativos. Clique em uma linha para ver quais planos e durações esses clientes usam." items={businessData.top_segmentos_ativos} groupLabel="Clientes ativos" />
                  <TopCategoryPanel title="10 segmentos onde mais perdemos clientes" subtitle="Ranking dos segmentos com maior quantidade de churns." helpText="Este ranking mostra os segmentos que mais aparecem entre os clientes perdidos no período escolhido. Clique em uma linha para ver quais planos e durações esses clientes usavam." items={businessData.top_segmentos_churn} groupLabel="Clientes em churn" />
                </div>
              </>
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-950">Consultar clientes e dados da empresa</h2>
                    <MousePointerClick className="text-blue-600" size={15} />
                    <HelpTip text="Clique em um cliente para abrir o perfil e visualizar as informações empresariais disponíveis no banco." />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Ao abrir um cliente, o dashboard consulta as informações já gravadas no banco do projeto.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setGroup("ativos")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${group === "ativos" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Base ativa</button>
                  <button type="button" onClick={() => setGroup("churn")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${group === "churn" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>Churn</button>
                </div>
              </div>

              <div className="p-4">
                <div className="relative max-w-xl">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por ID, plano, CNPJ, empresa ou origem..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  {[
                    { key: "regime_tributario", label: "Regime tributário", options: filterOptions?.regimes_tributarios ?? [] },
                    { key: "porte", label: "Porte", options: filterOptions?.portes ?? [] },
                    { key: "setor", label: "Setor", options: filterOptions?.setores ?? [] },
                    { key: "segmento", label: "Segmento", options: filterOptions?.segmentos ?? [] },
                    { key: "plano", label: "Plano", options: filterOptions?.planos ?? [] },
                    { key: "duracao", label: "Duração", options: (filterOptions?.duracoes ?? []).map((item) => item.label) },
                  ].map((field) => {
                    const listId = `perfil-filter-${field.key}`;
                    return (
                      <label key={field.key} className="grid gap-1 text-xs font-semibold text-slate-500">
                        {field.label}
                        <input
                          list={listId}
                          value={clientFilters[field.key as keyof ProfileClientFilters]}
                          onChange={(event) => setClientFilters((current) => ({ ...current, [field.key]: event.target.value }))}
                          placeholder={`Digite para buscar ${field.label.toLowerCase()}...`}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id={listId}>
                          {field.options.map((option) => <option key={option} value={option} />)}
                        </datalist>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">Digite nos filtros e o navegador sugere as opções já disponíveis no banco.</p>
                  <button
                    type="button"
                    onClick={() => setClientFilters({ regime_tributario: "", porte: "", setor: "", segmento: "", plano: "", duracao: "" })}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>

              {clientsLoading && <div className="px-5 pb-5 text-sm text-slate-400">Carregando clientes...</div>}
              {!clientsLoading && clientList && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1150px] text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left">Cliente</th>
                          <th className="px-4 py-3 text-left">PF/PJ</th>
                          <th className="px-4 py-3 text-left">Empresa</th>
                          <th className="px-4 py-3 text-left">Plano</th>
                          <th className="px-4 py-3 text-left">Duração</th>
                          <th className="px-4 py-3 text-left">Documento cadastro</th>
                          <th className="px-4 py-3 text-left">Documento da nota</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientList.clientes.map((client) => (
                          <tr key={`${group}-${client.empresa_id}`} onClick={() => setSelectedClient(client)} className="cursor-pointer transition hover:bg-blue-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-900"><span className="inline-flex items-center gap-2">{client.cliente}<MousePointerClick size={13} className="text-blue-600" /></span></td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${client.tipo_pessoa === "PJ" ? "bg-blue-50 text-blue-700" : client.tipo_pessoa === "PF" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{client.tipo_pessoa}</span></td>
                            <td className="px-4 py-3">{client.empresa}</td>
                            <td className="px-4 py-3 font-medium">{client.nome_plano}</td>
                            <td className="px-4 py-3">{client.duracao_label}</td>
                            <td className="px-4 py-3">{client.documento_cadastro || "—"}</td>
                            <td className="px-4 py-3">{client.documento_nota || "—"}{client.cnpjs_diferentes && <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Diferente</span>}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatMoney(client.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">{formatInteger(clientList.total)} clientes encontrados · página {clientList.page} de {clientList.total_paginas}</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40">Anterior</button>
                      <button type="button" disabled={page >= clientList.total_paginas} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40">Próxima</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {selectedClient && <ClientModal client={selectedClient} onClose={() => setSelectedClient(null)} />}
    </div>
  );
}
