"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarClock,
  CircleHelp,
  CreditCard,
  Gauge,
  Headset,
  RefreshCw,
  TrendingDown,
  UsersRound,
} from "lucide-react";

import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchIndicadores } from "@/lib/indicadores-api";
import type { IndicadoresMes, IndicadoresResponse } from "@/types/indicadores";

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function integer(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function signedInteger(value: number) {
  const current = Number(value || 0);
  return `${current > 0 ? "+" : ""}${integer(current)}`;
}

function signedMoney(value: number) {
  const current = Number(value || 0);
  return `${current > 0 ? "+" : ""}${money(current)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
        <div className="absolute right-0 top-9 z-30 w-[300px] rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  href,
  help,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  href: string;
  help: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-slate-600">{title}</p>
        <div className="flex shrink-0 items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <Icon size={18} />
          </div>
          <HelpHint text={help} />
        </div>
      </div>
      <p className="mt-2 whitespace-nowrap text-[clamp(1.20rem,1.45vw,1.55rem)] font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 min-h-[40px] text-xs leading-5 text-slate-500">{subtitle}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
        Ver detalhes <ArrowRight size={13} />
      </Link>
    </div>
  );
}

function periodLabel(data: IndicadoresResponse | null) {
  if (!data) return "";
  if (data.periodo.ano_completo) return `Ano completo de ${data.periodo.ano}`;
  const months = data.periodo.meses;
  if (months.length === 1) return `${MONTHS[(months[0] ?? 1) - 1]}/${data.periodo.ano}`;
  return `${MONTHS[(months[0] ?? 1) - 1]} a ${MONTHS[(months[months.length - 1] ?? 1) - 1]}/${data.periodo.ano}`;
}

function MonthlyTable({ rows, financial }: { rows: IndicadoresMes[]; financial: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Evolução mensal</h2>
          <p className="mt-1 text-sm text-slate-500">Um resumo do comportamento mês a mês dentro do período selecionado.</p>
        </div>
        <HelpHint text="Compara faturamento, churn, saldo de upgrades e downgrades e volume de atendimentos por mês. A visualização financeira mostra valores em reais; a quantitativa mostra volumes." />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Mês</th>
              <th className="px-4 py-3">Faturamento</th>
              <th className="px-4 py-3">Churn</th>
              <th className="px-4 py-3">Saldo Upgrade / Downgrade</th>
              <th className="px-4 py-3">Atendimentos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.mes} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-900">{MONTHS[(row.numero_mes || 1) - 1]}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {financial ? money(row.faturamento_valor) : integer(row.faturamento_quantidade)}
                </td>
                <td className="px-4 py-3">
                  {financial ? money(row.churn_valor) : integer(row.churn_quantidade)}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {financial ? signedMoney(row.saldo_upgrade_downgrade_financeiro) : signedInteger(row.saldo_upgrade_downgrade)}
                </td>
                <td className="px-4 py-3">{integer(row.atendimentos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IndicadoresDashboard() {
  const { filters } = useGlobalFilters();
  const [data, setData] = useState<IndicadoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchIndicadores(filters)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar os indicadores.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters]);

  const financial = filters.viewMode === "financeiro";
  const summary = data?.resumo;
  const lastUpdate = useMemo(() => formatDateTime(data?._cache_info?.updated_at), [data]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Indicadores</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Visão executiva dos principais números do negócio em um único lugar.
            </p>
            {data && <p className="mt-1 text-xs text-slate-400">Período selecionado: {periodLabel(data)}</p>}
          </div>
          {lastUpdate && <p className="text-xs italic text-slate-400">Última atualização: {lastUpdate}</p>}
        </div>

        {loading && !data && (
          <div className="grid min-h-[280px] place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="text-center text-sm text-slate-500">
              <RefreshCw size={22} className="mx-auto mb-3 animate-spin text-blue-600" />
              Carregando resumo executivo...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            <strong>Não foi possível carregar os indicadores.</strong>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {summary && (
          <>
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-950">Visão geral</h2>
                <HelpHint text="Reúne os números mais importantes das principais páginas do sistema. Alguns indicadores mostram a posição atual da carteira e outros respeitam o período selecionado." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <MetricCard
                  title="Faturamento"
                  value={financial ? money(summary.faturamento_valor) : integer(summary.faturamento_quantidade)}
                  subtitle={financial ? "Valor recebido no período selecionado." : "Quantidade de pagamentos no período selecionado."}
                  href="/faturamento"
                  help="Mostra o faturamento do período selecionado, respeitando empresa, origem, responsável pelo pagamento, plano e duração."
                  icon={BadgeDollarSign}
                />
                <MetricCard
                  title="Clientes ativos hoje"
                  value={financial ? money(summary.ativos_valor) : integer(summary.ativos_quantidade)}
                  subtitle={financial ? "Valor dos planos atualmente vigentes." : "Quantidade de clientes com plano vigente hoje."}
                  href="/ativos-atrasados"
                  help="É uma fotografia da carteira atual. No modo financeiro soma o valor dos planos vigentes; no quantitativo mostra a quantidade de clientes."
                  icon={UsersRound}
                />
                <MetricCard
                  title="Atrasados de 1 a 59 dias"
                  value={financial ? money(summary.atrasados_valor) : integer(summary.atrasados_quantidade)}
                  subtitle="Clientes vencidos que ainda não entraram na regra de churn."
                  href="/ativos-atrasados"
                  help="Mostra os clientes atualmente vencidos entre 1 e 59 dias. A partir de 60 dias eles passam a entrar na análise de churn."
                  icon={CreditCard}
                />
                <MetricCard
                  title="Churn"
                  value={financial ? money(summary.churn_valor) : integer(summary.churn_quantidade)}
                  subtitle={financial ? "Valor mensal que saiu da carteira no período." : "Clientes que completaram a regra de churn no período."}
                  href="/churn"
                  help="Resume os clientes que completaram a regra de churn dentro do período selecionado."
                  icon={TrendingDown}
                />
                <MetricCard
                  title="Carteira em alto risco"
                  value={financial ? money(summary.alto_risco_valor) : integer(summary.alto_risco_quantidade)}
                  subtitle="Clientes classificados como Alto ou Muito alto no Churn Score."
                  href="/churn-score"
                  help="Soma os clientes classificados pelo Churn Score como Alto ou Muito alto. No modo financeiro mostra o valor dos planos desses clientes."
                  icon={Gauge}
                />
                <MetricCard
                  title="Vencem nos próximos 30 dias"
                  value={financial ? money(summary.vencimentos_30_valor) : integer(summary.vencimentos_30_quantidade)}
                  subtitle="Próximos vencimentos da carteira atual."
                  href="/vencimentos-futuros"
                  help="Mostra os planos atuais com vencimento entre hoje e os próximos 30 dias."
                  icon={CalendarClock}
                />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-950">Movimentação e atendimento</h2>
                <HelpHint text="Resume as alterações de plano e duração e o volume de contatos com o suporte no período selecionado." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Upgrades"
                  value={financial ? money(summary.upgrades_financeiro) : integer(summary.upgrades)}
                  subtitle={financial ? "Aumento de receita gerado pelas alterações." : "Quantidade de alterações classificadas como upgrade."}
                  href="/upgrade-downgrade"
                  help="Mostra as alterações em que houve avanço de plano ou duração."
                  icon={ArrowUpRight}
                />
                <MetricCard
                  title="Downgrades"
                  value={financial ? money(summary.downgrades_financeiro) : integer(summary.downgrades)}
                  subtitle={financial ? "Redução de receita causada pelas alterações." : "Quantidade de alterações classificadas como downgrade."}
                  href="/upgrade-downgrade"
                  help="Mostra as alterações em que houve redução de plano ou duração."
                  icon={ArrowDownRight}
                />
                <MetricCard
                  title="Saldo das alterações"
                  value={financial ? signedMoney(summary.saldo_upgrade_downgrade_financeiro) : signedInteger(summary.saldo_upgrade_downgrade)}
                  subtitle="Resultado líquido de upgrades menos downgrades."
                  href="/upgrade-downgrade"
                  help="É o saldo entre upgrades e downgrades no período. Positivo indica ganho líquido; negativo indica perda líquida."
                  icon={ArrowUpRight}
                />
                <MetricCard
                  title="Atendimentos"
                  value={integer(summary.atendimentos)}
                  subtitle={`${integer(summary.clientes_atendidos)} clientes únicos somados mês a mês.`}
                  href="/atendimentos"
                  help="Quantidade de atendimentos registrados no período selecionado."
                  icon={Headset}
                />
              </div>
            </div>

            <MonthlyTable rows={data.mensal} financial={financial} />
          </>
        )}
      </div>
    </div>
  );
}
