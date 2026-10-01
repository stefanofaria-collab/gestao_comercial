"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleHelp,
  Clock3,
  CreditCard,
  MousePointerClick,
  RefreshCw,
  X,
} from "lucide-react";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchPaymentsDashboard } from "@/lib/pagamentos-api";
import type {
  PaymentCard,
  PaymentCategoryKey,
  PaymentMonthly,
  PaymentPlanMonthly,
  PaymentSummary,
  PaymentsDashboardResponse,
} from "@/types/pagamentos";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const decimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const METRICS: Array<{
  key: PaymentCategoryKey;
  title: string;
  shortTitle: string;
}> = [
  { key: "antecipado", title: "Pagamentos antes do vencimento", shortTitle: "Antes do vencimento" },
  { key: "no_vencimento", title: "Pagamentos no dia do vencimento", shortTitle: "No vencimento" },
  { key: "prorrogacao", title: "Pagamentos durante a prorrogação", shortTitle: "Prorrogação" },
  { key: "atrasado", title: "Pagamentos atrasados", shortTitle: "Atrasados" },
  { key: "reativacao", title: "Pagamentos de reativação", shortTitle: "Reativações" },
  { key: "media_dias", title: "Tempo médio de pagamento", shortTitle: "Tempo médio" },
];

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="grid h-5 w-5 cursor-help place-items-center rounded-full border border-slate-200 text-slate-400 transition group-hover:bg-slate-50 group-hover:text-slate-700">
        <CircleHelp size={12} />
      </span>
      <span className="pointer-events-none invisible absolute right-0 top-7 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-600 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function money(value: number) {
  return brl.format(value || 0);
}

function count(value: number) {
  return integer.format(value || 0);
}

function paymentTime(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Sem histórico";
  if (value < 0) return `${decimal.format(Math.abs(value))} dias antes`;
  if (value > 0) return `${decimal.format(value)} dias depois`;
  return "No vencimento";
}

function emptyCard(key: PaymentCategoryKey): PaymentCard {
  const metric = METRICS.find((item) => item.key === key);
  return {
    key,
    label: metric?.shortTitle ?? key,
    explicacao: "Sem pagamentos encontrados no período.",
    percentual: 0,
    media_dias: null,
    pagamentos: 0,
    clientes: 0,
    faturamento: 0,
  };
}

function emptySummary(): PaymentSummary {
  return {
    pagamentos_total: 0,
    clientes_total: 0,
    faturamento_total: 0,
    media_dias_pagamento: null,
    cards: METRICS.map((metric) => emptyCard(metric.key)),
  };
}

function getCard(summary: PaymentSummary, key: PaymentCategoryKey): PaymentCard {
  return summary.cards.find((card) => card.key === key) ?? emptyCard(key);
}

function CardGrid({ summary, title, subtitle }: { summary: PaymentSummary; title: string; subtitle: string }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {METRICS.map((metric) => {
          const card = getCard(summary, metric.key);
          const averageCard = metric.key === "media_dias";
          return (
            <div key={metric.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-5 text-slate-600">{card.label}</p>
                <HelpTip text={card.explicacao} />
              </div>

              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                {averageCard ? paymentTime(card.media_dias) : `${Math.round(card.percentual ?? 0)}%`}
              </p>

              <div className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                <p><strong className="text-slate-700">Clientes:</strong> {count(card.clientes)}</p>
                <p><strong className="text-slate-700">Faturamento:</strong> {money(card.faturamento)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function metricValue(row: PaymentSummary, key: PaymentCategoryKey): number | null {
  const card = getCard(row, key);
  if (key === "media_dias") return card.media_dias ?? null;
  return card.percentual ?? 0;
}

function MetricLineChart({
  title,
  metric,
  rows,
}: {
  title: string;
  metric: PaymentCategoryKey;
  rows: PaymentMonthly[] | PaymentPlanMonthly[];
}) {
  const option = useMemo(() => {
    const values = rows.map((row) => metricValue(row, metric));
    const isAverage = metric === "media_dias";

    return {
      animationDuration: 350,
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ axisValue: string; value: number | null }>) => {
          const item = params?.[0];
          if (!item) return "";
          const value = item.value;
          const formatted = value === null || value === undefined
            ? "Sem dado"
            : isAverage
              ? paymentTime(Number(value))
              : `${Math.round(Number(value))}%`;
          return `<strong>${item.axisValue}</strong><br/>${formatted}`;
        },
      },
      grid: { left: 52, right: 24, top: 28, bottom: 44 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: rows.map((row) => row.label),
        axisLabel: { color: "#64748b", fontSize: 11, interval: "auto" },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#64748b",
          fontSize: 11,
          formatter: (value: number) => isAverage ? `${integer.format(value)} d` : `${integer.format(value)}%`,
        },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      series: [
        {
          type: "line",
          smooth: 0.25,
          symbol: "circle",
          symbolSize: 6,
          data: values,
          connectNulls: true,
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.06 },
        },
      ],
    };
  }, [metric, rows]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <HelpTip text="O gráfico mostra a evolução mês a mês desde 2024. Passe o mouse sobre uma data para ver o valor daquele mês." />
      </div>
      <ReactECharts option={option} style={{ height: 290 }} />
    </div>
  );
}

function PlanModal({
  plan,
  rows,
  year,
  month,
  monthLabel,
  onClose,
}: {
  plan: string;
  rows: PaymentPlanMonthly[];
  year: number;
  month: number;
  monthLabel: string;
  onClose: () => void;
}) {
  const selected = rows.find((row) => row.ano === year && row.mes === month) ?? ({
    ...emptySummary(),
    plano: plan,
    ano: year,
    mes: month,
    label: `${monthLabel}/${year}`,
  } as PaymentPlanMonthly);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm lg:p-8">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[28px] bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Detalhamento do plano</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{plan}</h2>
            <p className="mt-1 text-sm text-slate-500">{monthLabel} de {year} + evolução desde 2024</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-8 p-6 lg:p-8">
          <CardGrid
            summary={selected}
            title={`Como os clientes do plano ${plan} pagaram`}
            subtitle={`Distribuição das renovações de ${monthLabel.toLowerCase()} de ${year}.`}
          />

          <section>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-950">Evolução do plano desde 2024</h3>
              <p className="mt-1 text-sm text-slate-500">Cada gráfico acompanha uma das formas de pagamento ao longo dos meses.</p>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              {METRICS.map((metric) => (
                <MetricLineChart
                  key={metric.key}
                  title={metric.title}
                  metric={metric.key}
                  rows={rows}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function PagamentosDashboard() {
  const { filters } = useGlobalFilters();
  const [data, setData] = useState<PaymentsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [periodInitialized, setPeriodInitialized] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchPaymentsDashboard(filters)
      .then((response) => {
        if (!active) return;
        setData(response);
        if (!periodInitialized) {
          setYear(response.periodo_padrao.ano);
          setMonth(response.periodo_padrao.mes);
          setPeriodInitialized(true);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro inesperado ao carregar Pagamentos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters.empresa, filters.origem, filters.pagador]);

  const monthly = useMemo(() => {
    if (!data) return null;
    return data.historico_mensal.find((row) => row.ano === year && row.mes === month) ?? null;
  }, [data, year, month]);

  const yearly = useMemo(() => {
    if (!data) return null;
    return data.historico_anual.find((row) => row.ano === year) ?? null;
  }, [data, year]);

  const planRowsInMonth = useMemo(() => {
    if (!data) return [] as PaymentPlanMonthly[];
    return data.historico_planos
      .filter((row) => row.ano === year && row.mes === month)
      .sort((a, b) => b.pagamentos_total - a.pagamentos_total || a.plano.localeCompare(b.plano, "pt-BR"));
  }, [data, year, month]);

  const selectedPlanRows = useMemo(() => {
    if (!data || !selectedPlan) return [] as PaymentPlanMonthly[];
    return data.historico_planos.filter((row) => row.plano === selectedPlan);
  }, [data, selectedPlan]);

  const monthLabel = data?.meses.find((item) => item.value === month)?.label ?? "Mês";

  if (loading && !data) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto flex min-h-[500px] max-w-[1680px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="text-center">
            <RefreshCw size={28} className="mx-auto animate-spin text-blue-600" />
            <p className="mt-4 font-semibold text-slate-800">Carregando comportamento de pagamentos...</p>
            <p className="mt-1 text-sm text-slate-400">Depois da primeira atualização diária, esta página passa a usar o snapshot salvo no banco do projeto.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-[1680px] rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <p className="font-bold">Não foi possível carregar Pagamentos</p>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const monthSummary = monthly ?? emptySummary();
  const yearSummary = yearly ?? emptySummary();

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Pagamentos</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
              Entenda como os clientes pagam as renovações dos planos. O primeiro pagamento de contratação não entra nesta análise.
            </p>
          </div>

          <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">
              <CalendarDays size={18} />
            </div>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Mês
              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="min-w-[160px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2"
              >
                {(data?.meses ?? []).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Ano
              <select
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="min-w-[110px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2"
              >
                {(data?.anos ?? []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-950">
          <strong>Como funciona:</strong> consideramos apenas pagamentos de renovação. Até 3 dias depois do vencimento o cliente ainda está na prorrogação. Entre 4 e 59 dias classificamos como atrasado. A partir de 60 dias classificamos como reativação, porque o cliente já havia entrado em churn e voltou. O tempo médio ignora as reativações para não transformar o período fora da carteira em atraso de pagamento.
        </div>

        <CardGrid
          summary={monthSummary}
          title={`Pagamentos de ${monthLabel} de ${year}`}
          subtitle={`Base: ${count(monthSummary.pagamentos_total)} pagamentos de renovação no mês.`}
        />

        <CardGrid
          summary={yearSummary}
          title={`Acumulado de ${year}`}
          subtitle={`Mesmas regras considerando todos os pagamentos de renovação do ano selecionado.`}
        />

        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Tempo médio de pagamento por plano</h2>
              <p className="mt-1 text-sm text-slate-500">Clique em um plano para ver as seis análises e a evolução mensal daquele plano desde 2024.</p>
            </div>
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
              <MousePointerClick size={12} /> Clique para detalhar
            </span>
          </div>

          {planRowsInMonth.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
              Não há renovações de planos neste período.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {planRowsInMonth.map((row) => (
                <button
                  key={row.plano}
                  type="button"
                  onClick={() => setSelectedPlan(row.plano)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{row.plano}</p>
                      <p className="mt-2 text-xl font-black text-slate-950">{paymentTime(row.media_dias_pagamento)}</p>
                    </div>
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
                      <Clock3 size={17} />
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                    {count(row.pagamentos_total)} pagamentos · {count(row.clientes_total)} clientes
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-950">Evolução do comportamento de pagamento desde 2024</h2>
            <p className="mt-1 text-sm text-slate-500">Um gráfico para cada forma de pagamento, sempre usando somente renovações.</p>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {METRICS.map((metric) => (
              <MetricLineChart
                key={metric.key}
                title={metric.title}
                metric={metric.key}
                rows={data?.historico_mensal ?? []}
              />
            ))}
          </div>
        </section>
      </div>

      {selectedPlan ? (
        <PlanModal
          plan={selectedPlan}
          rows={selectedPlanRows}
          year={year}
          month={month}
          monthLabel={monthLabel}
          onClose={() => setSelectedPlan(null)}
        />
      ) : null}
    </div>
  );
}
