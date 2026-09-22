"use client";

import {
  AlertTriangle,
  BadgeDollarSign,
  CircleDollarSign,
  RefreshCw,
  TrendingDown,
  Users,
  WalletCards,
} from "lucide-react";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import DetailedTable
  from "@/components/DetailedTable";

import FilterBar
  from "@/components/FilterBar";

import IndicatorCard
  from "@/components/IndicatorCard";

import KpiCard
  from "@/components/KpiCard";

import ActiveClientsByPlanChart
  from "@/components/charts/ActiveClientsByPlanChart";

import ActiveClientsHistoryChart
  from "@/components/charts/ActiveClientsHistoryChart";

import ChurnByPlanChart
  from "@/components/charts/ChurnByPlanChart";

import ChurnClientsHistoryChart
  from "@/components/charts/ChurnClientsHistoryChart";

import ChurnRatesHistoryChart
  from "@/components/charts/ChurnRatesHistoryChart";

import ChurnRevenueHistoryChart
  from "@/components/charts/ChurnRevenueHistoryChart";

import PlanPerformanceChart
  from "@/components/charts/PlanPerformanceChart";

import RenewalHistoryChart
  from "@/components/charts/RenewalHistoryChart";

import RevenueHistoryChart
  from "@/components/charts/RevenueHistoryChart";

import {
  fetchActiveClientsHistory,
  fetchChurnHistory,
  fetchDashboard,
  fetchHistory,
  fetchMeta,
} from "@/lib/api";

import {
  MONTHS,
  formatCurrency,
  formatCurrencyCompact,
  formatInteger,
  formatPercent,
  percentDelta,
} from "@/lib/format";

import type {
  ActiveClientsHistoryResponse,
  ChurnHistoryResponse,
  CompanyFilter,
  DashboardBlock,
  DashboardResponse,
  DurationFilter,
  HistoryResponse,
  MetaResponse,
  OriginFilter,
  PlanFilter,
} from "@/types/dashboard";


export default function Dashboard() {
  const [
    meta,
    setMeta,
  ] = useState<MetaResponse | null>(
    null,
  );

  const [
    dashboard,
    setDashboard,
  ] = useState<DashboardResponse | null>(
    null,
  );

  const [
    history,
    setHistory,
  ] = useState<HistoryResponse | null>(
    null,
  );

  const [
    activeClientsHistory,
    setActiveClientsHistory,
  ] = useState<ActiveClientsHistoryResponse | null>(
    null,
  );

  const [
    churnHistory,
    setChurnHistory,
  ] = useState<ChurnHistoryResponse | null>(
    null,
  );

  const [
    year,
    setYear,
  ] = useState(
    2026,
  );

  const [
    month,
    setMonth,
  ] = useState(
    1,
  );

  const [
    company,
    setCompany,
  ] = useState<CompanyFilter>(
    "todos",
  );

  const [
    origin,
    setOrigin,
  ] = useState<OriginFilter>(
    "todos",
  );

  const [
    plan,
    setPlan,
  ] = useState<PlanFilter>(
    "todos",
  );

  const [
    duration,
    setDuration,
  ] = useState<DurationFilter>(
    "todos",
  );

  const [
    loading,
    setLoading,
  ] = useState(
    true,
  );

  const [
    loadingDashboard,
    setLoadingDashboard,
  ] = useState(
    false,
  );

  const [
    loadingHistory,
    setLoadingHistory,
  ] = useState(
    true,
  );

  const [
    loadingActiveClientsHistory,
    setLoadingActiveClientsHistory,
  ] = useState(
    true,
  );

  const [
    loadingChurnHistory,
    setLoadingChurnHistory,
  ] = useState(
    true,
  );

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    historyError,
    setHistoryError,
  ] = useState<string | null>(
    null,
  );

  const [
    activeClientsHistoryError,
    setActiveClientsHistoryError,
  ] = useState<string | null>(
    null,
  );

  const [
    churnHistoryError,
    setChurnHistoryError,
  ] = useState<string | null>(
    null,
  );


  function previousPeriod(
    selectedYear: number,
    selectedMonth: number,
  ): {
    year: number;
    month: number;
  } | null {
    if (
      selectedYear === 2024
      &&
      selectedMonth === 1
    ) {
      return null;
    }

    if (
      selectedMonth === 1
    ) {
      return {
        year:
          selectedYear - 1,

        month:
          12,
      };
    }

    return {
      year:
        selectedYear,

      month:
        selectedMonth - 1,
    };
  }


  async function loadPreviousComparison(
    selectedYear: number,
    selectedMonth: number,
    selectedCompany: CompanyFilter,
    selectedOrigin: OriginFilter,
    selectedPlan: PlanFilter,
    selectedDuration: DurationFilter,
  ) {
    const previous =
      previousPeriod(
        selectedYear,
        selectedMonth,
      );

    if (!previous) {
      return;
    }

    try {
      const previousDashboard =
        await fetchDashboard(
          previous.year,
          previous.month,
          selectedCompany,
          selectedOrigin,
          selectedPlan,
          selectedDuration,
          false,
        );

      setDashboard(
        (
          currentDashboard,
        ) => {
          if (
            !currentDashboard
          ) {
            return currentDashboard;
          }

          return {
            ...currentDashboard,

            mes_anterior: {
              ano:
                previous.year,

              mes:
                previous.month,

              resumo:
                previousDashboard.resumo,
            },
          };
        },
      );
    } catch (
      comparisonError
    ) {
      console.error(
        "Erro ao carregar comparação:",
        comparisonError,
      );
    }
  }


  async function loadHistory(
    selectedCompany: CompanyFilter,
    selectedOrigin: OriginFilter,
    selectedPlan: PlanFilter,
    selectedDuration: DurationFilter,
  ) {
    try {
      setLoadingHistory(
        true,
      );

      setHistoryError(
        null,
      );

      const historical =
        await fetchHistory(
          selectedCompany,
          selectedOrigin,
          selectedPlan,
          selectedDuration,
        );

      setHistory(
        historical,
      );
    } catch (
      historyFetchError
    ) {
      console.error(
        "Erro ao carregar histórico:",
        historyFetchError,
      );

      setHistoryError(
        historyFetchError
          instanceof Error
          ? historyFetchError.message
          : "Não foi possível carregar o histórico.",
      );
    } finally {
      setLoadingHistory(
        false,
      );
    }
  }


  async function loadActiveClientsHistory(
    selectedCompany: CompanyFilter,
    selectedOrigin: OriginFilter,
    selectedPlan: PlanFilter,
    selectedDuration: DurationFilter,
  ) {
    try {
      setLoadingActiveClientsHistory(
        true,
      );

      setActiveClientsHistoryError(
        null,
      );

      const response =
        await fetchActiveClientsHistory(
          selectedCompany,
          selectedOrigin,
          selectedPlan,
          selectedDuration,
        );

      setActiveClientsHistory(
        response,
      );
    } catch (
      activeHistoryError
    ) {
      console.error(
        "Erro ao carregar histórico de clientes ativos:",
        activeHistoryError,
      );

      setActiveClientsHistoryError(
        activeHistoryError
          instanceof Error
          ? activeHistoryError.message
          : "Não foi possível carregar o histórico de clientes ativos.",
      );
    } finally {
      setLoadingActiveClientsHistory(
        false,
      );
    }
  }


  async function loadChurnHistory(
    selectedCompany: CompanyFilter,
    selectedOrigin: OriginFilter,
    selectedPlan: PlanFilter,
    selectedDuration: DurationFilter,
  ) {
    try {
      setLoadingChurnHistory(
        true,
      );

      setChurnHistoryError(
        null,
      );

      const response =
        await fetchChurnHistory(
          selectedCompany,
          selectedOrigin,
          selectedPlan,
          selectedDuration,
        );

      setChurnHistory(
        response,
      );
    } catch (
      churnFetchError
    ) {
      console.error(
        "Erro ao carregar histórico de churn:",
        churnFetchError,
      );

      setChurnHistoryError(
        churnFetchError
          instanceof Error
          ? churnFetchError.message
          : "Não foi possível carregar o histórico de churn.",
      );
    } finally {
      setLoadingChurnHistory(
        false,
      );
    }
  }


  useEffect(
    () => {
      let active =
        true;

      async function initialize() {
        try {
          setLoading(
            true,
          );

          setError(
            null,
          );

          const metadata =
            await fetchMeta();

          if (
            !active
          ) {
            return;
          }

          const initialYear =
            metadata.ultimo_ano;

          const initialMonth =
            metadata.ultimo_mes;

          setMeta(
            metadata,
          );

          setYear(
            initialYear,
          );

          setMonth(
            initialMonth,
          );

          setCompany(
            "todos",
          );

          setOrigin(
            "todos",
          );

          setPlan(
            "todos",
          );

          setDuration(
            "todos",
          );

          const current =
            await fetchDashboard(
              initialYear,
              initialMonth,
              "todos",
              "todos",
              "todos",
              "todos",
              false,
            );

          if (
            !active
          ) {
            return;
          }

          setDashboard(
            current,
          );

          setLoading(
            false,
          );

          void loadPreviousComparison(
            initialYear,
            initialMonth,
            "todos",
            "todos",
            "todos",
            "todos",
          );

          void loadHistory(
            "todos",
            "todos",
            "todos",
            "todos",
          );

          void loadActiveClientsHistory(
            "todos",
            "todos",
            "todos",
            "todos",
          );

          void loadChurnHistory(
            "todos",
            "todos",
            "todos",
            "todos",
          );
        } catch (
          initialError
        ) {
          if (
            !active
          ) {
            return;
          }

          setError(
            initialError
              instanceof Error
              ? initialError.message
              : "Não foi possível carregar o dashboard.",
          );

          setLoading(
            false,
          );

          setLoadingHistory(
            false,
          );

          setLoadingActiveClientsHistory(
            false,
          );

          setLoadingChurnHistory(
            false,
          );
        }
      }

      void initialize();

      return () => {
        active =
          false;
      };
    },
    [],
  );


  async function applyFilters(
    nextYear: number,
    nextMonth: number,
    nextCompany: CompanyFilter,
    nextOrigin: OriginFilter,
    nextPlan: PlanFilter,
    nextDuration: DurationFilter,
  ) {
    if (
      !meta
    ) {
      return;
    }

    let normalizedMonth =
      nextMonth;

    if (
      nextYear ===
        meta.ultimo_ano
      &&
      normalizedMonth >
        meta.ultimo_mes
    ) {
      normalizedMonth =
        meta.ultimo_mes;
    }

    try {
      setLoadingDashboard(
        true,
      );

      setError(
        null,
      );

      const response =
        await fetchDashboard(
          nextYear,
          normalizedMonth,
          nextCompany,
          nextOrigin,
          nextPlan,
          nextDuration,
          false,
        );

      setYear(
        nextYear,
      );

      setMonth(
        normalizedMonth,
      );

      setCompany(
        nextCompany,
      );

      setOrigin(
        nextOrigin,
      );

      setPlan(
        nextPlan,
      );

      setDuration(
        nextDuration,
      );

      setDashboard(
        response,
      );

      void loadPreviousComparison(
        nextYear,
        normalizedMonth,
        nextCompany,
        nextOrigin,
        nextPlan,
        nextDuration,
      );

      void loadHistory(
        nextCompany,
        nextOrigin,
        nextPlan,
        nextDuration,
      );

      void loadActiveClientsHistory(
        nextCompany,
        nextOrigin,
        nextPlan,
        nextDuration,
      );

      void loadChurnHistory(
        nextCompany,
        nextOrigin,
        nextPlan,
        nextDuration,
      );
    } catch (
      filterError
    ) {
      setError(
        filterError
          instanceof Error
          ? filterError.message
          : "Não foi possível atualizar os filtros.",
      );
    } finally {
      setLoadingDashboard(
        false,
      );
    }
  }


  if (
    loading
  ) {
    return (
      <LoadingScreen />
    );
  }


  if (
    !meta
    ||
    !dashboard
  ) {
    return (
      <ErrorScreen
        message={
          error
          ??
          "Não foi possível carregar os dados."
        }
      />
    );
  }


  const historyPoints =
    history
      ?.pontos
    ?? [];

  const current =
    dashboard.resumo;

  const previous:
    DashboardBlock | undefined =
      dashboard
        .mes_anterior
        ?.resumo;

  const renewalClientPoints =
    previous
      ? (
          current
            .taxa_renovacao_clientes
          -
          previous
            .taxa_renovacao_clientes
        )
      : null;

  const renewalRevenuePoints =
    previous
      ? (
          current
            .taxa_renovacao_receita
          -
          previous
            .taxa_renovacao_receita
        )
      : null;

  const churnPoints =
    previous
      ? (
          current
            .percentual_churn_vencimentos
          -
          previous
            .percentual_churn_vencimentos
        )
      : null;

  const companyLabel =
    company ===
      "gestaoclick"
      ? "GestãoClick"
      : company ===
          "clicknotas"
        ? "ClickNotas"
        : "Todos";

  const originLabel =
    origin ===
      "gestaoclick"
      ? "GestãoClick"
      : origin ===
          "parceiro"
        ? "Parceiro"
        : "Todos";

  const planLabel =
    plan ===
      "todos"
      ? "Todos"
      : plan;

  const durationLabel =
    duration ===
      "todos"
      ? "Todas"
      : meta.duracoes.find(
          (item) =>
            item.value ===
            duration,
        )?.label
        ?? duration;


  return (
    <main className="min-h-screen pb-10">
      <header className="bg-slate-950">
        <div className="mx-auto max-w-[1700px] px-5 py-7 md:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-300">
                  Gestão comercial
                </p>

                {dashboard
                  .periodo
                  .parcial ? (
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                    Mês parcial
                  </span>
                ) : null}
              </div>

              <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
                Gestão de Clientes
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Visão executiva de carteira, vencimentos, renovação,
                receita e churn.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <FilterBadge
                  label="Empresa"
                  value={companyLabel}
                />

                <FilterBadge
                  label="Origem"
                  value={originLabel}
                />

                <FilterBadge
                  label="Plano"
                  value={planLabel}
                />

                <FilterBadge
                  label="Duração"
                  value={durationLabel}
                />
              </div>
            </div>

            <div className="w-full xl:w-[980px]">
              <FilterBar
                meta={meta}
                year={year}
                month={month}
                company={company}
                origin={origin}
                plan={plan}
                duration={duration}
                loading={loadingDashboard}
                onYearChange={(nextYear) => {
                  void applyFilters(
                    nextYear,
                    month,
                    company,
                    origin,
                    plan,
                    duration,
                  );
                }}
                onMonthChange={(nextMonth) => {
                  void applyFilters(
                    year,
                    nextMonth,
                    company,
                    origin,
                    plan,
                    duration,
                  );
                }}
                onCompanyChange={(nextCompany) => {
                  void applyFilters(
                    year,
                    month,
                    nextCompany,
                    origin,
                    plan,
                    duration,
                  );
                }}
                onOriginChange={(nextOrigin) => {
                  void applyFilters(
                    year,
                    month,
                    company,
                    nextOrigin,
                    plan,
                    duration,
                  );
                }}
                onPlanChange={(nextPlan) => {
                  void applyFilters(
                    year,
                    month,
                    company,
                    origin,
                    nextPlan,
                    duration,
                  );
                }}
                onDurationChange={(nextDuration) => {
                  void applyFilters(
                    year,
                    month,
                    company,
                    origin,
                    plan,
                    nextDuration,
                  );
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1700px] space-y-7 px-5 py-7 md:px-8">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : null}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Resumo executivo
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {MONTHS[
                  month - 1
                ]} de {year}

                {dashboard
                  .mes_anterior
                  ? ` · comparação com ${
                      MONTHS[
                        dashboard
                          .mes_anterior
                          .mes - 1
                      ]
                    }/${
                      dashboard
                        .mes_anterior
                        .ano
                    }`
                  : ""}
              </p>
            </div>

            {loadingDashboard ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <RefreshCw
                  className="animate-spin"
                  size={16}
                />

                Atualizando...
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              label="Clientes ativos"
              value={
                formatInteger(
                  current
                    .clientes_ativos,
                )
              }
              delta={
                percentDelta(
                  current
                    .clientes_ativos,
                  previous
                    ?.clientes_ativos,
                )
              }
              subtitle="Snapshot da carteira no primeiro dia do mês."
              icon={
                <Users
                  size={20}
                />
              }
            />

            <KpiCard
              label="Renovações previstas"
              value={
                formatInteger(
                  current
                    .renovacoes_previstas,
                )
              }
              delta={
                percentDelta(
                  current
                    .renovacoes_previstas,
                  previous
                    ?.renovacoes_previstas,
                )
              }
              subtitle={`${formatPercent(
                current
                  .percentual_renovacoes_clientes_ativos,
              )} da carteira ativa`}
              icon={
                <RefreshCw
                  size={20}
                />
              }
            />

            <KpiCard
              label="Receita vencendo"
              value={
                formatCurrencyCompact(
                  current
                    .receita_vencendo,
                )
              }
              delta={
                percentDelta(
                  current
                    .receita_vencendo,
                  previous
                    ?.receita_vencendo,
                )
              }
              subtitle={`Ticket médio ${formatCurrency(
                current
                  .ticket_medio_vencimentos,
              )}`}
              icon={
                <WalletCards
                  size={20}
                />
              }
            />

            <KpiCard
              label="Renovações"
              value={
                formatInteger(
                  current
                    .renovacoes_clientes,
                )
              }
              delta={
                percentDelta(
                  current
                    .renovacoes_clientes,
                  previous
                    ?.renovacoes_clientes,
                )
              }
              subtitle={`${formatPercent(
                current
                  .taxa_renovacao_clientes,
              )} dos vencimentos`}
              icon={
                <RefreshCw
                  size={20}
                />
              }
            />

            <KpiCard
              label="Receita renovada"
              value={
                formatCurrencyCompact(
                  current
                    .renovacoes_receita,
                )
              }
              delta={
                percentDelta(
                  current
                    .renovacoes_receita,
                  previous
                    ?.renovacoes_receita,
                )
              }
              subtitle={`${formatPercent(
                current
                  .taxa_renovacao_receita,
              )} da receita vencendo`}
              icon={
                <BadgeDollarSign
                  size={20}
                />
              }
            />

            <KpiCard
              label="Churn"
              value={
                formatInteger(
                  current
                    .churn_clientes,
                )
              }
              delta={
                percentDelta(
                  current
                    .churn_clientes,
                  previous
                    ?.churn_clientes,
                )
              }
              inverseDelta
              subtitle={`${formatPercent(
                current
                  .percentual_churn_vencimentos,
              )} dos vencimentos`}
              icon={
                <TrendingDown
                  size={20}
                />
              }
            />
          </div>
        </section>

        <section className="space-y-5">
          <ChartCard
            title="Evolução de clientes ativos"
            description="Quatro linhas por padrão: GestãoClick, ClickNotas, GestãoClick Parceiros e ClickNotas Parceiros. Os filtros de plano e duração continuam sendo respeitados."
          >
            {loadingActiveClientsHistory ? (
              <HistoryLoading
                text="Carregando evolução de clientes ativos..."
              />
            ) : activeClientsHistoryError ? (
              <HistoryError
                message={
                  activeClientsHistoryError
                }
              />
            ) : activeClientsHistory ? (
              <ActiveClientsHistoryChart
                data={
                  activeClientsHistory
                }
              />
            ) : (
              <HistoryError
                message="Histórico de clientes ativos não disponível."
              />
            )}
          </ChartCard>

          <ChartCard
            title="Clientes ativos por plano e duração"
            description="Cada linha representa uma combinação de plano e duração, como Bronze (M), Bronze (T), Bronze (S) e Bronze (A). Use os filtros locais de empresa e duração para refinar a visualização."
          >
            {loadingActiveClientsHistory ? (
              <HistoryLoading
                text="Carregando clientes ativos por plano..."
              />
            ) : activeClientsHistoryError ? (
              <HistoryError
                message={
                  activeClientsHistoryError
                }
              />
            ) : activeClientsHistory ? (
              <ActiveClientsByPlanChart
                data={
                  activeClientsHistory
                }
                globalCompany={
                  company
                }
                globalDuration={
                  duration
                }
              />
            ) : (
              <HistoryError
                message="Histórico por plano não disponível."
              />
            )}
          </ChartCard>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-950">
              Indicadores de eficiência
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Conversão, tickets médios e impacto financeiro do churn.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <IndicatorCard
              title="Tx. renovação clientes"
              value={
                formatPercent(
                  current
                    .taxa_renovacao_clientes,
                )
              }
              helper={
                renewalClientPoints ===
                null
                  ? undefined
                  : `${
                      renewalClientPoints >=
                      0
                        ? "+"
                        : ""
                    }${renewalClientPoints.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits:
                          2,

                        maximumFractionDigits:
                          2,
                      },
                    )} p.p. vs. mês anterior`
              }
              emphasize
            />

            <IndicatorCard
              title="Tx. renovação receita"
              value={
                formatPercent(
                  current
                    .taxa_renovacao_receita,
                )
              }
              helper={
                renewalRevenuePoints ===
                null
                  ? undefined
                  : `${
                      renewalRevenuePoints >=
                      0
                        ? "+"
                        : ""
                    }${renewalRevenuePoints.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits:
                          2,

                        maximumFractionDigits:
                          2,
                      },
                    )} p.p. vs. mês anterior`
              }
              emphasize
            />

            <IndicatorCard
              title="Ticket renovado"
              value={
                formatCurrency(
                  current
                    .ticket_medio_renovado,
                )
              }
              helper={`Ticket dos vencimentos: ${formatCurrency(
                current
                  .ticket_medio_vencimentos,
              )}`}
            />

            <IndicatorCard
              title="Churn receita"
              value={
                formatCurrencyCompact(
                  current
                    .churn_receita,
                )
              }
              helper={`${formatPercent(
                current
                  .percentual_churn_receita_vencendo,
              )} da receita vencendo`}
            />

            <IndicatorCard
              title="Ticket perdido"
              value={
                formatCurrency(
                  current
                    .ticket_medio_perdido,
                )
              }
              helper="Receita de churn ÷ clientes em churn"
            />

            <IndicatorCard
              title="% churn dos vencimentos"
              value={
                formatPercent(
                  current
                    .percentual_churn_vencimentos,
                )
              }
              helper={
                churnPoints ===
                null
                  ? `${formatPercent(
                      current
                        .percentual_churn_clientes_ativos,
                    )} da carteira ativa`
                  : `${
                      churnPoints >=
                      0
                        ? "+"
                        : ""
                    }${churnPoints.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits:
                          2,

                        maximumFractionDigits:
                          2,
                      },
                    )} p.p. vs. mês anterior`
              }
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <ChartCard
            title="Evolução da taxa de renovação"
            description="Comparação entre retenção de clientes e retenção de receita."
          >
            {loadingHistory ? (
              <HistoryLoading
                text="Carregando histórico de renovação..."
              />
            ) : historyError ? (
              <HistoryError
                message={
                  historyError
                }
              />
            ) : (
              <RenewalHistoryChart
                points={
                  historyPoints
                }
              />
            )}
          </ChartCard>

          <ChartCard
            title="Receita vencendo × receita renovada"
            description="Histórico mensal de 2024, 2025 e 2026."
          >
            {loadingHistory ? (
              <HistoryLoading
                text="Carregando histórico de receita..."
              />
            ) : historyError ? (
              <HistoryError
                message={
                  historyError
                }
              />
            ) : (
              <RevenueHistoryChart
                points={
                  historyPoints
                }
              />
            )}
          </ChartCard>
        </section>

        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Análise de churn
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Evolução quantitativa, financeira e percentual das perdas da carteira.
            </p>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Evolução do churn de clientes"
              description="Quantidade mensal de clientes que entraram em churn."
            >
              {loadingChurnHistory ? (
                <HistoryLoading
                  text="Carregando churn de clientes..."
                />
              ) : churnHistoryError ? (
                <HistoryError
                  message={
                    churnHistoryError
                  }
                />
              ) : churnHistory ? (
                <ChurnClientsHistoryChart
                  points={
                    churnHistory
                      .pontos
                  }
                />
              ) : (
                <HistoryError
                  message="Histórico de churn não disponível."
                />
              )}
            </ChartCard>

            <ChartCard
              title="Evolução da receita perdida"
              description="Valor mensal de receita associado aos clientes em churn."
            >
              {loadingChurnHistory ? (
                <HistoryLoading
                  text="Carregando receita perdida..."
                />
              ) : churnHistoryError ? (
                <HistoryError
                  message={
                    churnHistoryError
                  }
                />
              ) : churnHistory ? (
                <ChurnRevenueHistoryChart
                  points={
                    churnHistory
                      .pontos
                  }
                />
              ) : (
                <HistoryError
                  message="Histórico de churn não disponível."
                />
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="Evolução das taxas de churn"
            description="Comparação entre % Churn ativos, % Churn vencimentos e % Churn receita."
          >
            {loadingChurnHistory ? (
              <HistoryLoading
                text="Carregando taxas de churn..."
              />
            ) : churnHistoryError ? (
              <HistoryError
                message={
                  churnHistoryError
                }
              />
            ) : churnHistory ? (
              <ChurnRatesHistoryChart
                points={
                  churnHistory
                    .pontos
                }
              />
            ) : (
              <HistoryError
                message="Histórico de churn não disponível."
              />
            )}
          </ChartCard>

          <ChartCard
            title="Churn de clientes por plano"
            description="Evolução quantitativa mensal do churn por plano. Clique nos planos da legenda para analisar séries específicas."
          >
            {loadingChurnHistory ? (
              <HistoryLoading
                text="Carregando churn por plano..."
              />
            ) : churnHistoryError ? (
              <HistoryError
                message={
                  churnHistoryError
                }
              />
            ) : churnHistory ? (
              <ChurnByPlanChart
                data={
                  churnHistory
                }
              />
            ) : (
              <HistoryError
                message="Histórico de churn por plano não disponível."
              />
            )}
          </ChartCard>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <ChartCard
            title="Desempenho por plano"
            description={`Taxa de renovação e churn dos vencimentos em ${
              MONTHS[
                month - 1
              ]
            }/${year}.`}
          >
            <PlanPerformanceChart
              rows={
                dashboard
                  .por_plano
              }
            />
          </ChartCard>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Receita em risco
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Visão financeira do churn do período.
                </p>
              </div>

              <div className="rounded-xl bg-rose-50 p-2 text-rose-700">
                <CircleDollarSign
                  size={22}
                />
              </div>
            </div>

            <div className="mt-8 rounded-2xl bg-slate-950 p-6 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Churn em receita
              </p>

              <p className="mt-2 text-3xl font-black">
                {formatCurrency(
                  current
                    .churn_receita,
                )}
              </p>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-rose-400"
                  style={{
                    width:
                      `${Math.min(
                        current
                          .percentual_churn_receita_vencendo,
                        100,
                      )}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                <span>
                  Receita vencendo
                </span>

                <span>
                  {formatPercent(
                    current
                      .percentual_churn_receita_vencendo,
                  )}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ticket perdido
                </p>

                <p className="mt-2 text-xl font-black text-slate-950">
                  {formatCurrency(
                    current
                      .ticket_medio_perdido,
                  )}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Churn / ativos
                </p>

                <p className="mt-2 text-xl font-black text-slate-950">
                  {formatPercent(
                    current
                      .percentual_churn_clientes_ativos,
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        <DetailedTable
          rows={
            dashboard
              .detalhe
          }
        />
      </div>
    </main>
  );
}


function FilterBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-300">
      {label}: {value}
    </span>
  );
}


function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold text-slate-950">
        {title}
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        {description}
      </p>

      <div className="mt-5">
        {children}
      </div>
    </div>
  );
}


function HistoryLoading({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex h-[350px] items-center justify-center">
      <div className="text-center">
        <RefreshCw
          className="mx-auto animate-spin text-blue-600"
          size={26}
        />

        <p className="mt-3 text-sm font-semibold text-slate-700">
          {text}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          Consultando os dados consolidados no Supabase.
        </p>
      </div>
    </div>
  );
}


function HistoryError({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-[350px] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle
            size={22}
          />
        </div>

        <p className="mt-3 text-sm font-semibold text-slate-700">
          Histórico indisponível
        </p>

        <p className="mt-2 text-xs leading-5 text-slate-500">
          {message}
        </p>
      </div>
    </div>
  );
}


function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="text-center">
        <RefreshCw
          className="mx-auto animate-spin text-blue-300"
          size={32}
        />

        <h1 className="mt-5 text-xl font-bold text-white">
          Carregando Gestão de Clientes
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Consultando os indicadores do período atual.
        </p>
      </div>
    </main>
  );
}


function ErrorScreen({
  message,
}: {
  message: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-8 shadow-card">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-600">
          Erro ao carregar
        </p>

        <h1 className="mt-2 text-2xl font-black text-slate-950">
          Verifique a conexão com o backend
        </h1>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
          {message}
        </p>
      </div>
    </main>
  );
}
