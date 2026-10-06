"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  CircleHelp,
  RefreshCw,
  Scale,
} from "lucide-react";

import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchUpgradeDowngrade } from "@/lib/upgrade-downgrade-api";
import type {
  UpgradeDowngradeDePara,
  UpgradeDowngradeHistoryPoint,
  UpgradeDowngradeResponse,
} from "@/types/upgrade-downgrade";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatInteger(value: number) {
  return integer.format(Number(value || 0));
}

function formatMoney(value: number) {
  return currency.format(Number(value || 0));
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="grid h-6 w-6 cursor-help place-items-center rounded-full border border-slate-200 text-slate-400 transition group-hover:bg-slate-50 group-hover:text-slate-700">
        <CircleHelp size={14} />
      </span>
      <span className="pointer-events-none invisible absolute right-0 top-8 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-600 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function SectionTitle({ title, subtitle, help }: { title: string; subtitle: string; help: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <HelpTip text={help} />
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
  icon: typeof ArrowUpDown;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function monthLabel(value: string) {
  const [, month] = value.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1].slice(0, 3)}/${value.slice(2, 4)}`;
}

function LineCard({
  title,
  subtitle,
  help,
  rows,
  field,
  viewMode,
}: {
  title: string;
  subtitle: string;
  help: string;
  rows: UpgradeDowngradeHistoryPoint[];
  field: "upgrades" | "downgrades" | "saldo" | "total";
  viewMode: "financeiro" | "quantitativo";
}) {
  const financialField = {
    upgrades: "upgrades_financeiro",
    downgrades: "downgrades_financeiro",
    saldo: "saldo_financeiro",
    total: "total_financeiro",
  }[field] as "upgrades_financeiro" | "downgrades_financeiro" | "saldo_financeiro" | "total_financeiro";

  const option = useMemo(() => ({
    animationDuration: 300,
    tooltip: {
      trigger: "axis",
      formatter: (params: Array<{ axisValue: string; value: number }>) => {
        const item = params?.[0];
        if (!item) return "";
        const value = Number(item.value || 0);
        return `<strong>${item.axisValue}</strong><br/>${viewMode === "financeiro" ? formatMoney(value) : formatInteger(value)}`;
      },
    },
    grid: { left: 54, right: 20, top: 24, bottom: 52 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: rows.map((row) => monthLabel(row.mes)),
      axisLabel: { color: "#64748b", fontSize: 10, interval: "auto" },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#64748b",
        fontSize: 11,
        formatter: (value: number) => viewMode === "financeiro"
          ? `R$ ${integer.format(value)}`
          : integer.format(value),
      },
      splitLine: { lineStyle: { color: "#e2e8f0" } },
    },
    series: [{
      type: "line",
      smooth: 0.2,
      symbol: "circle",
      symbolSize: 6,
      data: rows.map((row) => viewMode === "financeiro" ? row[financialField] : row[field]),
      lineStyle: { width: 3 },
      areaStyle: { opacity: 0.05 },
    }],
  }), [field, financialField, rows, viewMode]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionTitle title={title} subtitle={subtitle} help={help} />
      <ReactECharts option={option} style={{ height: 300 }} opts={{ renderer: "canvas" }} />
    </div>
  );
}

function DeParaTable({
  title,
  subtitle,
  help,
  rows,
}: {
  title: string;
  subtitle: string;
  help: string;
  rows: UpgradeDowngradeDePara[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5 pb-3">
        <SectionTitle title={title} subtitle={subtitle} help={help} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[780px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">De</th>
              <th className="px-5 py-3">Para</th>
              <th className="px-5 py-3">Movimento</th>
              <th className="px-5 py-3 text-right">Quantidade</th>
              <th className="px-5 py-3 text-right">Saldo de movimentos</th>
              <th className="px-5 py-3 text-right">Impacto financeiro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.de}-${row.para}-${row.movimento}`} className="border-t border-slate-100">
                <td className="px-5 py-3 font-semibold text-slate-800">{row.de}</td>
                <td className="px-5 py-3 font-semibold text-slate-800">{row.para}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.movimento === "Upgrade" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {row.movimento}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatInteger(row.quantidade)}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">{row.saldo_quantidade > 0 ? "+" : ""}{formatInteger(row.saldo_quantidade)}</td>
                <td className={`px-5 py-3 text-right font-semibold ${row.saldo_financeiro >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {formatMoney(row.saldo_financeiro)}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">Nenhuma mudança encontrada no período selecionado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function UpgradeDowngradeDashboard() {
  const { filters } = useGlobalFilters();
  const [data, setData] = useState<UpgradeDowngradeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchUpgradeDowngrade(filters)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Erro inesperado ao carregar Upgrade e Downgrade.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [
    filters.ano,
    filters.anoCompleto,
    filters.meses,
    filters.empresa,
    filters.origem,
    filters.pagador,
    filters.plano,
    filters.duracao,
    reloadKey,
  ]);

  const periodLabel = useMemo(() => {
    if (filters.anoCompleto) return `Ano completo de ${filters.ano}`;
    const months = [...filters.meses].sort((a, b) => a - b);
    if (months.length === 1) return `${MONTHS[(months[0] || 1) - 1]} de ${filters.ano}`;
    return `${MONTHS[(months[0] || 1) - 1]} a ${MONTHS[(months[months.length - 1] || 1) - 1]} de ${filters.ano}`;
  }, [filters.ano, filters.anoCompleto, filters.meses]);

  return (
    <div className="p-5 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Upgrade e Downgrade</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            Acompanhe quantos clientes subiram ou reduziram plano e duração, além do caminho mais comum de cada mudança.
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400">Período selecionado: {periodLabel}</p>
        </div>

        {loading && !data ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="text-center">
              <RefreshCw className="mx-auto animate-spin text-blue-600" size={28} />
              <p className="mt-3 text-sm font-semibold text-slate-700">Carregando alterações de planos...</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
            <p className="font-bold">Não foi possível carregar Upgrade e Downgrade.</p>
            <p className="mt-1">{error}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold">Tentar novamente</button>
          </div>
        ) : null}

        {data && !loading ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Kpi
                title="Total de planos alterados"
                value={filters.viewMode === "financeiro" ? formatMoney(data.resumo.total_financeiro) : formatInteger(data.resumo.total_alteracoes)}
                subtitle={filters.viewMode === "financeiro"
                  ? "Valor total movimentado nas alterações de plano ou duração."
                  : "Quantidade de renovações em que o plano ou a duração mudou."}
                icon={ArrowUpDown}
              />
              <Kpi
                title="Upgrades"
                value={filters.viewMode === "financeiro" ? formatMoney(data.resumo.upgrades_financeiro) : formatInteger(data.resumo.upgrades)}
                subtitle={filters.viewMode === "financeiro"
                  ? "Valor acrescido à carteira pelas alterações no período."
                  : "Mudanças em que o cliente avançou de plano ou duração."}
                icon={ArrowUpRight}
              />
              <Kpi
                title="Downgrades"
                value={filters.viewMode === "financeiro" ? formatMoney(data.resumo.downgrades_financeiro) : formatInteger(data.resumo.downgrades)}
                subtitle={filters.viewMode === "financeiro"
                  ? "Valor reduzido da carteira pelas alterações no período."
                  : "Mudanças em que o cliente reduziu plano ou duração."}
                icon={ArrowDownRight}
              />
              <Kpi
                title="Saldo das alterações"
                value={filters.viewMode === "financeiro"
                  ? formatMoney(data.resumo.saldo_financeiro)
                  : `${data.resumo.saldo > 0 ? "+" : ""}${formatInteger(data.resumo.saldo)}`}
                subtitle={filters.viewMode === "financeiro"
                  ? "Valor de upgrades menos o valor perdido em downgrades."
                  : "Upgrades menos downgrades no período selecionado."}
                icon={Scale}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <LineCard
                title="Evolução dos upgrades"
                subtitle={filters.viewMode === "financeiro" ? "Valor mensal acrescido à carteira desde janeiro de 2024." : "Quantidade mensal desde janeiro de 2024."}
                help={filters.viewMode === "financeiro" ? "Mostra quanto as alterações aumentaram o valor da carteira em cada mês." : "Mostra quantos movimentos classificados como upgrade ocorreram em cada mês."}
                rows={data.historico}
                field="upgrades"
                viewMode={filters.viewMode}
              />
              <LineCard
                title="Evolução dos downgrades"
                subtitle={filters.viewMode === "financeiro" ? "Valor mensal reduzido da carteira desde janeiro de 2024." : "Quantidade mensal desde janeiro de 2024."}
                help={filters.viewMode === "financeiro" ? "Mostra quanto as alterações reduziram o valor da carteira em cada mês." : "Mostra quantos movimentos classificados como downgrade ocorreram em cada mês."}
                rows={data.historico}
                field="downgrades"
                viewMode={filters.viewMode}
              />
              <LineCard
                title="Saldo mensal das alterações"
                subtitle={filters.viewMode === "financeiro" ? "Valor ganho menos valor perdido em cada mês." : "Upgrades menos downgrades em cada mês."}
                help={filters.viewMode === "financeiro" ? "Quando o saldo fica positivo, as alterações aumentaram o valor da carteira; quando fica negativo, reduziram." : "Quando o valor fica positivo, houve mais upgrades que downgrades. Quando fica negativo, houve mais downgrades."}
                rows={data.historico}
                field="saldo"
                viewMode={filters.viewMode}
              />
              <LineCard
                title="Total de alterações por mês"
                subtitle={filters.viewMode === "financeiro" ? "Valor total movimentado nas alterações desde janeiro de 2024." : "Todos os movimentos de plano ou duração desde janeiro de 2024."}
                help={filters.viewMode === "financeiro" ? "Soma o valor movimentado para cima e para baixo em cada mês." : "Conta qualquer renovação em que o plano ou a duração tenha mudado em relação ao registro anterior do cliente."}
                rows={data.historico}
                field="total"
                viewMode={filters.viewMode}
              />
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
              <DeParaTable
                title="De → Para dos planos"
                subtitle="Veja de qual plano o cliente saiu e para qual plano foi."
                help="Cada linha agrupa uma combinação de plano anterior e plano novo. Quantidade mostra quantas vezes a mudança aconteceu. O impacto financeiro soma a diferença de valor desses clientes."
                rows={data.de_para_planos}
              />
              <DeParaTable
                title="De → Para das durações"
                subtitle="Veja de qual duração o cliente saiu e para qual duração foi."
                help="Cada linha agrupa uma mudança de duração, por exemplo Mensal → Anual. O saldo de movimentos fica positivo nos upgrades e negativo nos downgrades."
                rows={data.de_para_duracoes}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
