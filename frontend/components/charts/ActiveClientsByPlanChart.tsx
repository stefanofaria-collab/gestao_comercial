"use client";

import ReactECharts
  from "echarts-for-react";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ActiveClientsHistoryResponse,
  CompanyFilter,
  DurationFilter,
  OriginFilter,
} from "@/types/dashboard";


import {
  fetchActiveClientsHistory,
} from "@/lib/api";


type Props = {
  data: ActiveClientsHistoryResponse;
  globalCompany: CompanyFilter;
  globalDuration: DurationFilter;
};


type PeriodRange =
  | 6
  | 12
  | 24
  | "todos";


type RankingMode =
  | "mes"
  | "ano";


type DetailTab =
  | "duracoes"
  | "evolucao";


type MonthKey = {
  key: string;
  ano: number;
  mes: number;
  label: string;
};


type RowValue = {
  inicio: number;
  fim: number;
  variacao: number;
  variacaoPercentual: number | null;
};


type RowResult = {
  label: string;
  kind:
    | "total"
    | "plan"
    | "duration";
  values: RowValue[];
};


type RankingRow = {
  plano: string;
  inicio: number;
  fim: number;
  variacao: number;
  variacaoPercentual: number | null;
};


type DurationDetailRow = {
  duracao: string;
  duracaoLabel: string;
  inicio: number;
  fim: number;
  variacao: number;
  variacaoPercentual: number | null;
};


const DURATION_NAMES:
  Record<string, string> = {
    M:
      "Mensal",

    T:
      "Trimestral",

    S:
      "Semestral",

    A:
      "Anual",
  };


function formatInteger(
  value: number,
): string {
  return value.toLocaleString(
    "pt-BR",
  );
}


function formatSignedInteger(
  value: number,
): string {
  if (
    value > 0
  ) {
    return `+${formatInteger(
      value,
    )}`;
  }

  return formatInteger(
    value,
  );
}


function formatPercent(
  value: number,
): string {
  return `${value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  )}%`;
}


function formatSignedPercent(
  value: number,
): string {
  if (
    value > 0
  ) {
    return `+${formatPercent(
      value,
    )}`;
  }

  return formatPercent(
    value,
  );
}


function companyNameFromFilter(
  company: CompanyFilter,
): string | null {
  if (
    company === "gestaoclick"
  ) {
    return "GestãoClick";
  }

  if (
    company === "clicknotas"
  ) {
    return "ClickNotas";
  }

  return null;
}


function monthKey(
  ano: number,
  mes: number,
): string {
  return `${ano}-${String(
    mes,
  ).padStart(
    2,
    "0",
  )}`;
}


function nextMonthKey(
  ano: number,
  mes: number,
): string {
  if (
    mes === 12
  ) {
    return monthKey(
      ano + 1,
      1,
    );
  }

  return monthKey(
    ano,
    mes + 1,
  );
}


function monthNumericKey(
  ano: number,
  mes: number,
): number {
  return (
    ano * 100
    +
    mes
  );
}


function deltaClass(
  value: number,
  strong = false,
): string {
  if (
    value < 0
  ) {
    return strong
      ? "bg-rose-100 text-rose-900"
      : "bg-rose-50 text-rose-800";
  }

  if (
    value > 0
  ) {
    return strong
      ? "bg-emerald-100 text-emerald-900"
      : "bg-emerald-50 text-emerald-800";
  }

  return strong
    ? "bg-slate-100 text-slate-700"
    : "bg-white text-slate-600";
}


export default function ActiveClientsByPlanChart({
  data,
}: Props) {
  const [
    selectedCompany,
    setSelectedCompany,
  ] = useState<CompanyFilter>(
    "todos",
  );

  const [
    selectedOrigin,
    setSelectedOrigin,
  ] = useState<OriginFilter>(
    "todos",
  );

  const [
    selectedDuration,
    setSelectedDuration,
  ] = useState<DurationFilter>(
    "todos",
  );

  const [
    localData,
    setLocalData,
  ] = useState<ActiveClientsHistoryResponse>(
    data,
  );

  const [
    localLoading,
    setLocalLoading,
  ] = useState(
    false,
  );

  const [
    localError,
    setLocalError,
  ] = useState<string | null>(
    null,
  );

  const [
    periodRange,
    setPeriodRange,
  ] = useState<PeriodRange>(
    12,
  );

  const [
    selectedRankingMonth,
    setSelectedRankingMonth,
  ] = useState(
    "",
  );

  const [
    rankingMode,
    setRankingMode,
  ] = useState<RankingMode>(
    "mes",
  );

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState<string | null>(
    null,
  );

  const [
    detailTab,
    setDetailTab,
  ] = useState<DetailTab>(
    "duracoes",
  );


  useEffect(
    () => {
      let active =
        true;

      async function loadLocalData() {
        try {
          setLocalLoading(
            true,
          );

          setLocalError(
            null,
          );

          const response =
            await fetchActiveClientsHistory(
              selectedCompany,
              selectedOrigin,
              "todos",
              "todos",
            );

          if (!active) {
            return;
          }

          setLocalData(
            response,
          );
        } catch (
          error
        ) {
          if (!active) {
            return;
          }

          setLocalError(
            error
              instanceof Error
              ? error.message
              : "Não foi possível atualizar os clientes ativos.",
          );
        } finally {
          if (active) {
            setLocalLoading(
              false,
            );
          }
        }
      }

      void loadLocalData();

      return () => {
        active =
          false;
      };
    },
    [
      selectedCompany,
      selectedOrigin,
    ],
  );


  const monthKeys =
    useMemo<MonthKey[]>(
      () => {
        const unique =
          new Map<
            string,
            MonthKey
          >();

        for (
          const point
          of localData.pontos_planos_duracoes
        ) {
          const key =
            monthKey(
              point.ano,
              point.mes,
            );

          if (
            !unique.has(
              key,
            )
          ) {
            unique.set(
              key,
              {
                key,
                ano:
                  point.ano,

                mes:
                  point.mes,

                label:
                  point.label,
              },
            );
          }
        }

        return Array.from(
          unique.values(),
        ).sort(
          (
            first,
            second,
          ) =>
            monthNumericKey(
              first.ano,
              first.mes,
            )
            -
            monthNumericKey(
              second.ano,
              second.mes,
            ),
        );
      },
      [
        localData.pontos_planos_duracoes,
      ],
    );


  const monthMap =
    useMemo(
      () =>
        new Map(
          monthKeys.map(
            (item) => [
              item.key,
              item,
            ],
          ),
        ),
      [
        monthKeys,
      ],
    );


  const closedMonths =
    useMemo(
      () =>
        monthKeys.filter(
          (item) =>
            monthMap.has(
              nextMonthKey(
                item.ano,
                item.mes,
              ),
            ),
        ),
      [
        monthKeys,
        monthMap,
      ],
    );


  useEffect(
    () => {
      if (
        closedMonths.length ===
        0
      ) {
        setSelectedRankingMonth(
          "",
        );

        return;
      }

      const exists =
        closedMonths.some(
          (month) =>
            month.key ===
            selectedRankingMonth,
        );

      if (
        !exists
      ) {
        setSelectedRankingMonth(
          closedMonths[
            closedMonths.length - 1
          ].key,
        );
      }
    },
    [
      closedMonths,
      selectedRankingMonth,
    ],
  );


  useEffect(
    () => {
      if (
        selectedPlan ===
        null
      ) {
        return;
      }

      function handleKeyDown(
        event: KeyboardEvent,
      ) {
        if (
          event.key ===
          "Escape"
        ) {
          setSelectedPlan(
            null,
          );
        }
      }

      document.addEventListener(
        "keydown",
        handleKeyDown,
      );

      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        "hidden";

      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown,
        );

        document.body.style.overflow =
          previousOverflow;
      };
    },
    [
      selectedPlan,
    ],
  );


  const selectedCompanyName =
    companyNameFromFilter(
      selectedCompany,
    );


  const companyFilteredPoints =
    useMemo(
      () =>
        localData.pontos_planos_duracoes.filter(
          (point) => {
            if (
              selectedCompanyName
              !== null
              &&
              point.empresa !==
                selectedCompanyName
            ) {
              return false;
            }

            return true;
          },
        ),
      [
        localData.pontos_planos_duracoes,
        selectedCompanyName,
      ],
    );


  const filteredPoints =
    useMemo(
      () =>
        companyFilteredPoints.filter(
          (point) => {
            if (
              selectedDuration !==
                "todos"
              &&
              point.duracao !==
                selectedDuration
            ) {
              return false;
            }

            return true;
          },
        ),
      [
        companyFilteredPoints,
        selectedDuration,
      ],
    );


  const buildSnapshots =
    (
      points:
        ActiveClientsHistoryResponse[
          "pontos_planos_duracoes"
        ],
    ) => {
      const result =
        new Map<
          string,
          Map<string, number>
        >();

      for (
        const point
        of points
      ) {
        const seriesKey =
          `${point.nome_plano}|||${point.duracao}`;

        if (
          !result.has(
            seriesKey,
          )
        ) {
          result.set(
            seriesKey,
            new Map(),
          );
        }

        const pointMonthKey =
          monthKey(
            point.ano,
            point.mes,
          );

        const current =
          result
            .get(
              seriesKey,
            )
            ?.get(
              pointMonthKey,
            )
          ?? 0;

        result
          .get(
            seriesKey,
          )
          ?.set(
            pointMonthKey,
            current
            +
            point.clientes_ativos,
          );
      }

      return result;
    };


  const snapshots =
    useMemo(
      () =>
        buildSnapshots(
          filteredPoints,
        ),
      [
        filteredPoints,
      ],
    );


  const allDurationSnapshots =
    useMemo(
      () =>
        buildSnapshots(
          companyFilteredPoints,
        ),
      [
        companyFilteredPoints,
      ],
    );


  const visibleMonths =
    useMemo(
      () => {
        if (
          periodRange ===
          "todos"
        ) {
          return closedMonths;
        }

        return closedMonths.slice(
          -periodRange,
        );
      },
      [
        closedMonths,
        periodRange,
      ],
    );


  const allowedDurations =
    useMemo(
      () => {
        if (
          selectedDuration !==
          "todos"
        ) {
          return [
            selectedDuration,
          ];
        }

        return localData.duracoes.map(
          (item) =>
            item.value,
        );
      },
      [
        localData.duracoes,
        selectedDuration,
      ],
    );


  const rows =
    useMemo<RowResult[]>(
      () => {
        const result:
          RowResult[] = [];

        for (
          const plan
          of localData.planos
        ) {
          const durationRows:
            RowResult[] = [];

          for (
            const duration
            of allowedDurations
          ) {
            const snapshot =
              snapshots.get(
                `${plan}|||${duration}`,
              );

            if (
              !snapshot
            ) {
              continue;
            }

            const values:
              RowValue[] =
                visibleMonths.map(
                  (month) => {
                    const closeKey =
                      nextMonthKey(
                        month.ano,
                        month.mes,
                      );

                    const inicio =
                      snapshot.get(
                        month.key,
                      )
                      ?? 0;

                    const fim =
                      snapshot.get(
                        closeKey,
                      )
                      ?? 0;

                    const variacao =
                      fim
                      -
                      inicio;

                    const variacaoPercentual =
                      inicio ===
                        0
                        ? null
                        : (
                            (
                              variacao
                              /
                              inicio
                            )
                            *
                            100
                          );

                    return {
                      inicio,
                      fim,
                      variacao,
                      variacaoPercentual,
                    };
                  },
                );

            durationRows.push(
              {
                label:
                  `${DURATION_NAMES[
                    duration
                  ] ?? duration} (${duration})`,

                kind:
                  "duration",

                values,
              },
            );
          }

          if (
            durationRows.length ===
            0
          ) {
            continue;
          }

          const totalValues:
            RowValue[] =
              visibleMonths.map(
                (
                  _month,
                  monthIndex,
                ) => {
                  let inicio =
                    0;

                  let fim =
                    0;

                  for (
                    const durationRow
                    of durationRows
                  ) {
                    inicio +=
                      durationRow.values[
                        monthIndex
                      ].inicio;

                    fim +=
                      durationRow.values[
                        monthIndex
                      ].fim;
                  }

                  const variacao =
                    fim
                    -
                    inicio;

                  const variacaoPercentual =
                    inicio ===
                      0
                      ? null
                      : (
                          (
                            variacao
                            /
                            inicio
                          )
                          *
                          100
                        );

                  return {
                    inicio,
                    fim,
                    variacao,
                    variacaoPercentual,
                  };
                },
              );

          result.push(
            {
              label:
                plan,

              kind:
                "plan",

              values:
                totalValues,
            },
          );

          result.push(
            ...durationRows,
          );
        }

        const planRows =
          result.filter(
            (row) =>
              row.kind ===
              "plan",
          );

        if (
          planRows.length ===
          0
        ) {
          return result;
        }

        const grandTotalValues:
          RowValue[] =
            visibleMonths.map(
              (
                _month,
                monthIndex,
              ) => {
                let inicio =
                  0;

                let fim =
                  0;

                for (
                  const planRow
                  of planRows
                ) {
                  inicio +=
                    planRow.values[
                      monthIndex
                    ].inicio;

                  fim +=
                    planRow.values[
                      monthIndex
                    ].fim;
                }

                const variacao =
                  fim
                  -
                  inicio;

                const variacaoPercentual =
                  inicio ===
                    0
                    ? null
                    : (
                        (
                          variacao
                          /
                          inicio
                        )
                        *
                        100
                      );

                return {
                  inicio,
                  fim,
                  variacao,
                  variacaoPercentual,
                };
              },
            );

        return [
          {
            label:
              "TOTAL",

            kind:
              "total",

            values:
              grandTotalValues,
          },

          ...result,
        ];
      },
      [
        allowedDurations,
        localData.planos,
        snapshots,
        visibleMonths,
      ],
    );


  const latestClosedMonth =
    closedMonths.length >
      0
      ? closedMonths[
          closedMonths.length - 1
        ]
      : null;


  const currentYear =
    latestClosedMonth
      ?.ano
    ?? null;


  const currentYearStartMonth =
    useMemo(
      () => {
        if (
          currentYear ===
          null
        ) {
          return null;
        }

        return (
          monthKeys.find(
            (month) =>
              month.ano ===
                currentYear
              &&
              month.mes ===
                1,
          )
          ??
          monthKeys.find(
            (month) =>
              month.ano ===
              currentYear,
          )
          ??
          null
        );
      },
      [
        currentYear,
        monthKeys,
      ],
    );


  const rankingPeriod =
    useMemo(
      () => {
        if (
          rankingMode ===
          "ano"
        ) {
          if (
            !currentYearStartMonth
            ||
            !latestClosedMonth
          ) {
            return null;
          }

          return {
            start:
              currentYearStartMonth,

            endKey:
              nextMonthKey(
                latestClosedMonth.ano,
                latestClosedMonth.mes,
              ),

            label:
              `${currentYearStartMonth.label} → ${latestClosedMonth.label}`,
          };
        }

        if (
          selectedRankingMonth ===
          ""
        ) {
          return null;
        }

        const selectedMonth =
          monthMap.get(
            selectedRankingMonth,
          );

        if (
          !selectedMonth
        ) {
          return null;
        }

        return {
          start:
            selectedMonth,

          endKey:
            nextMonthKey(
              selectedMonth.ano,
              selectedMonth.mes,
            ),

          label:
            selectedMonth.label,
        };
      },
      [
        currentYearStartMonth,
        latestClosedMonth,
        monthMap,
        rankingMode,
        selectedRankingMonth,
      ],
    );


  const ranking =
    useMemo<RankingRow[]>(
      () => {
        if (
          !rankingPeriod
        ) {
          return [];
        }

        const result:
          RankingRow[] = [];

        for (
          const plan
          of localData.planos
        ) {
          let inicio =
            0;

          let fim =
            0;

          let found =
            false;

          for (
            const duration
            of allowedDurations
          ) {
            const snapshot =
              snapshots.get(
                `${plan}|||${duration}`,
              );

            if (
              !snapshot
            ) {
              continue;
            }

            found =
              true;

            inicio +=
              snapshot.get(
                rankingPeriod
                  .start
                  .key,
              )
              ?? 0;

            fim +=
              snapshot.get(
                rankingPeriod
                  .endKey,
              )
              ?? 0;
          }

          if (
            !found
          ) {
            continue;
          }

          const variacao =
            fim
            -
            inicio;

          result.push(
            {
              plano:
                plan,

              inicio,

              fim,

              variacao,

              variacaoPercentual:
                inicio ===
                  0
                  ? null
                  : (
                      (
                        variacao
                        /
                        inicio
                      )
                      *
                      100
                    ),
            },
          );
        }

        return result.sort(
          (
            first,
            second,
          ) =>
            first.variacao
            -
            second.variacao,
        );
      },
      [
        allowedDurations,
        localData.planos,
        rankingPeriod,
        snapshots,
      ],
    );


  const maxRankingAbs =
    useMemo(
      () =>
        Math.max(
          1,
          ...ranking.map(
            (row) =>
              Math.abs(
                row.variacao,
              ),
          ),
        ),
      [
        ranking,
      ],
    );


  const durationDetailRows =
    useMemo<DurationDetailRow[]>(
      () => {
        if (
          selectedPlan ===
            null
          ||
          !rankingPeriod
        ) {
          return [];
        }

        return localData.duracoes.map(
          (duration) => {
            const snapshot =
              allDurationSnapshots.get(
                `${selectedPlan}|||${duration.value}`,
              );

            const inicio =
              snapshot?.get(
                rankingPeriod
                  .start
                  .key,
              )
              ?? 0;

            const fim =
              snapshot?.get(
                rankingPeriod
                  .endKey,
              )
              ?? 0;

            const variacao =
              fim
              -
              inicio;

            const variacaoPercentual =
              inicio ===
                0
                ? null
                : (
                    (
                      variacao
                      /
                      inicio
                    )
                    *
                    100
                  );

            return {
              duracao:
                duration.value,

              duracaoLabel:
                duration.label,

              inicio,

              fim,

              variacao,

              variacaoPercentual,
            };
          },
        );
      },
      [
        allDurationSnapshots,
        localData.duracoes,
        rankingPeriod,
        selectedPlan,
      ],
    );


  const detailMaxAbs =
    useMemo(
      () =>
        Math.max(
          1,
          ...durationDetailRows.map(
            (row) =>
              Math.abs(
                row.variacao,
              ),
          ),
        ),
      [
        durationDetailRows,
      ],
    );


  const last12Months =
    useMemo(
      () =>
        monthKeys.slice(
          -12,
        ),
      [
        monthKeys,
      ],
    );


  const detailLineSeries =
    useMemo(
      () => {
        if (
          selectedPlan ===
          null
        ) {
          return [];
        }

        return localData.duracoes.map(
          (duration) => {
            const snapshot =
              allDurationSnapshots.get(
                `${selectedPlan}|||${duration.value}`,
              );

            return {
              name:
                `${duration.label} (${duration.value})`,

              type:
                "line",

              smooth:
                0.2,

              symbol:
                "circle",

              symbolSize:
                7,

              showSymbol:
                false,

              connectNulls:
                false,

              emphasis: {
                focus:
                  "series",

                lineStyle: {
                  width:
                    4,
                },
              },

              data:
                last12Months.map(
                  (month) =>
                    snapshot?.get(
                      month.key,
                    )
                    ?? null,
                ),
            };
          },
        );
      },
      [
        allDurationSnapshots,
        localData.duracoes,
        last12Months,
        selectedPlan,
      ],
    );


  const companyOptions:
    Array<{
      value: CompanyFilter;
      label: string;
    }> = [
      {
        value:
          "todos",

        label:
          "Todas",
      },

      {
        value:
          "gestaoclick",

        label:
          "GestãoClick",
      },

      {
        value:
          "clicknotas",

        label:
          "ClickNotas",
      },
    ];


  const originOptions:
    Array<{
      value: OriginFilter;
      label: string;
    }> = [
      {
        value:
          "todos",

        label:
          "Todas",
      },

      {
        value:
          "gestaoclick",

        label:
          "GestãoClick",
      },

      {
        value:
          "parceiro",

        label:
          "Parceiro",
      },
    ];


  const durationOptions:
    Array<{
      value: DurationFilter;
      label: string;
    }> = [
      {
        value:
          "todos",

        label:
          "Todas",
      },

      ...localData.duracoes.map(
        (item) => ({
          value:
            item.value,

          label:
            item.label,
        }),
      ),
    ];


  if (
    closedMonths.length ===
    0
  ) {
    return (
      <div className="flex h-[360px] items-center justify-center">
        <p className="text-sm font-semibold text-slate-500">
          Ainda não há meses fechados suficientes para calcular a evolução.
        </p>
      </div>
    );
  }


  return (
    <>
      <div className="space-y-7">
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              Empresa
            </span>

            {companyOptions.map(
              (item) => {
                const active =
                  selectedCompany ===
                  item.value;

                return (
                  <button
                    key={
                      item.value
                    }
                    type="button"
                    disabled={
                      localLoading
                    }
                    onClick={() => {
                      setSelectedCompany(
                        item.value,
                      );
                    }}
                    className={
                      active
                        ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-60"
                    }
                  >
                    {item.label}
                  </button>
                );
              },
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              Origem
            </span>

            {originOptions.map(
              (item) => {
                const active =
                  selectedOrigin ===
                  item.value;

                return (
                  <button
                    key={
                      item.value
                    }
                    type="button"
                    disabled={
                      localLoading
                    }
                    onClick={() => {
                      setSelectedOrigin(
                        item.value,
                      );
                    }}
                    className={
                      active
                        ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-60"
                    }
                  >
                    {item.label}
                  </button>
                );
              },
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              Duração
            </span>

            {durationOptions.map(
              (item) => {
                const active =
                  selectedDuration ===
                  item.value;

                return (
                  <button
                    key={
                      item.value
                    }
                    type="button"
                    onClick={() => {
                      setSelectedDuration(
                        item.value,
                      );
                    }}
                    className={
                      active
                        ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                    }
                  >
                    {item.label}
                  </button>
                );
              },
            )}
          </div>
        </div>

        {localLoading ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700">
            Atualizando clientes ativos para os filtros selecionados...
          </div>
        ) : null}

        {localError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
            {localError}
          </div>
        ) : null}


        <section>
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950">
                Ranking de ganho e perda de clientes
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Clique em um plano para abrir o detalhamento por duração e a evolução dos últimos 12 meses.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                Visão
              </span>

              <button
                type="button"
                onClick={() => {
                  setRankingMode(
                    "mes",
                  );
                }}
                className={
                  rankingMode ===
                  "mes"
                    ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                    : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                }
              >
                Mês
              </button>

              <button
                type="button"
                onClick={() => {
                  setRankingMode(
                    "ano",
                  );
                }}
                className={
                  rankingMode ===
                  "ano"
                    ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                    : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                }
              >
                Ano atual
              </button>

              <label className="ml-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Mês

                <select
                  value={
                    selectedRankingMonth
                  }
                  onChange={(event) => {
                    setSelectedRankingMonth(
                      event.target.value,
                    );

                    setRankingMode(
                      "mes",
                    );
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-slate-400"
                >
                  {closedMonths
                    .slice()
                    .reverse()
                    .map(
                      (month) => (
                        <option
                          key={
                            month.key
                          }
                          value={
                            month.key
                          }
                        >
                          {month.label}
                        </option>
                      ),
                    )}
                </select>
              </label>
            </div>
          </div>

          {rankingMode ===
          "ano" ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600">
              Total do ano atual:{" "}
              <span className="font-black text-slate-950">
                {rankingPeriod
                  ?.label
                  ?? "—"}
              </span>
            </div>
          ) : null}

          <div className="space-y-2">
            {ranking.map(
              (row) => {
                const width =
                  Math.max(
                    2,
                    (
                      Math.abs(
                        row.variacao,
                      )
                      /
                      maxRankingAbs
                    )
                    *
                    100,
                  );

                return (
                  <button
                    key={
                      row.plano
                    }
                    type="button"
                    onClick={() => {
                      setSelectedPlan(
                        row.plano,
                      );

                      setDetailTab(
                        "duracoes",
                      );
                    }}
                    className="grid w-full grid-cols-[120px_minmax(0,1fr)_190px] items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
                    title={`Abrir detalhes do plano ${row.plano}`}
                  >
                    <div className="font-bold text-slate-800">
                      {row.plano}
                    </div>

                    <div className="relative h-7 overflow-hidden rounded-lg bg-slate-100">
                      <div
                        className={
                          row.variacao < 0
                            ? "absolute inset-y-0 left-0 rounded-lg bg-rose-400"
                            : row.variacao > 0
                              ? "absolute inset-y-0 left-0 rounded-lg bg-emerald-400"
                              : "absolute inset-y-0 left-0 rounded-lg bg-slate-300"
                        }
                        style={{
                          width:
                            `${width}%`,
                        }}
                      />

                      <div className="absolute inset-0 flex items-center px-3 text-xs font-black text-slate-900">
                        {formatSignedInteger(
                          row.variacao,
                        )}

                        {row.variacaoPercentual
                          !== null
                          ? ` (${formatSignedPercent(
                              row.variacaoPercentual,
                            )})`
                          : ""}
                      </div>
                    </div>

                    <div className="text-right text-xs font-semibold text-slate-500">
                      {formatInteger(
                        row.inicio,
                      )}
                      {" → "}
                      <span className="text-slate-900">
                        {formatInteger(
                          row.fim,
                        )}
                      </span>
                    </div>
                  </button>
                );
              },
            )}
          </div>
        </section>


        <section>
          <div className="mb-4">
            <div>
              <h3 className="text-base font-black text-slate-950">
                DRE de clientes ativos
              </h3>

              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                A linha TOTAL consolida todos os planos. Abaixo, cada plano é destrinchado por duração.
                O primeiro dia usa o snapshot do próprio mês; o último dia usa o snapshot
                do primeiro dia do mês seguinte, representando o fechamento mensal.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Empresa
                  </span>

                  {companyOptions.map(
                    (item) => {
                      const active =
                        selectedCompany ===
                        item.value;

                      return (
                        <button
                          key={`dre-empresa-${item.value}`}
                          type="button"
                          disabled={
                            localLoading
                          }
                          onClick={() => {
                            setSelectedCompany(
                              item.value,
                            );
                          }}
                          className={
                            active
                              ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                              : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-60"
                          }
                        >
                          {item.label}
                        </button>
                      );
                    },
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Origem
                  </span>

                  {originOptions.map(
                    (item) => {
                      const active =
                        selectedOrigin ===
                        item.value;

                      return (
                        <button
                          key={`dre-origem-${item.value}`}
                          type="button"
                          disabled={
                            localLoading
                          }
                          onClick={() => {
                            setSelectedOrigin(
                              item.value,
                            );
                          }}
                          className={
                            active
                              ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                              : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-60"
                          }
                        >
                          {item.label}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Período
                </span>

                {[
                  {
                    value:
                      6 as PeriodRange,

                    label:
                      "6M",
                  },

                  {
                    value:
                      12 as PeriodRange,

                    label:
                      "12M",
                  },

                  {
                    value:
                      24 as PeriodRange,

                    label:
                      "24M",
                  },

                  {
                    value:
                      "todos" as PeriodRange,

                    label:
                      "Todos",
                  },
                ].map(
                  (item) => {
                    const active =
                      periodRange ===
                      item.value;

                    return (
                      <button
                        key={
                          String(
                            item.value,
                          )
                        }
                        type="button"
                        onClick={() => {
                          setPeriodRange(
                            item.value,
                          );
                        }}
                        className={
                          active
                            ? "rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                            : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                        }
                      >
                        {item.label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-max border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 min-w-[210px] border-r border-slate-700 bg-slate-950 px-4 py-3 text-left text-xs font-black uppercase tracking-wider"
                  >
                    Plano / duração
                  </th>

                  {visibleMonths.map(
                    (month) => (
                      <th
                        key={
                          month.key
                        }
                        colSpan={4}
                        className="border-r border-slate-700 px-3 py-3 text-center text-sm font-black"
                      >
                        {month.label}
                      </th>
                    ),
                  )}
                </tr>

                <tr className="bg-slate-900 text-slate-300">
                  {visibleMonths.map(
                    (month) => (
                      <Fragment
                        key={`${month.key}-subheader`}
                      >
                        <th className="min-w-[92px] border-r border-slate-700 px-3 py-2 text-right font-bold">
                          1º dia
                        </th>

                        <th className="min-w-[92px] border-r border-slate-700 px-3 py-2 text-right font-bold">
                          Último dia
                        </th>

                        <th className="min-w-[82px] border-r border-slate-700 px-3 py-2 text-right font-bold">
                          Δ
                        </th>

                        <th className="min-w-[78px] border-r border-slate-700 px-3 py-2 text-right font-bold">
                          Δ%
                        </th>
                      </Fragment>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {rows.map(
                  (
                    row,
                    rowIndex,
                  ) => {
                    const isTotal =
                      row.kind ===
                      "total";

                    const isPlan =
                      row.kind ===
                      "plan";

                    return (
                      <tr
                        key={`${row.label}-${rowIndex}`}
                        className={
                          isTotal
                            ? "border-y-2 border-slate-950"
                            : isPlan
                              ? "border-t-2 border-slate-300"
                              : "border-t border-slate-100"
                        }
                      >
                        <td
                          className={
                            isTotal
                              ? "sticky left-0 z-20 bg-slate-950 px-4 py-3.5 font-black uppercase tracking-wider text-white"
                              : isPlan
                                ? "sticky left-0 z-20 bg-slate-100 px-4 py-3 font-black text-slate-950"
                                : "sticky left-0 z-20 bg-white px-4 py-2.5 pl-8 font-semibold text-slate-600"
                          }
                        >
                          {isTotal
                            ? "TOTAL"
                            : isPlan
                              ? row.label
                              : `↳ ${row.label}`}
                        </td>

                        {row.values.map(
                          (
                            value,
                            monthIndex,
                          ) => (
                            <Fragment
                              key={`${row.label}-${monthIndex}`}
                            >
                              <td
                                className={
                                  isTotal
                                    ? "border-l border-slate-700 bg-slate-950 px-3 py-3.5 text-right font-black text-white"
                                    : isPlan
                                      ? "border-l border-slate-200 bg-slate-100 px-3 py-3 text-right font-black text-slate-900"
                                      : "border-l border-slate-100 bg-white px-3 py-2.5 text-right font-semibold text-slate-700"
                                }
                              >
                                {formatInteger(
                                  value.inicio,
                                )}
                              </td>

                              <td
                                className={
                                  isTotal
                                    ? "border-l border-slate-700 bg-slate-950 px-3 py-3.5 text-right font-black text-white"
                                    : isPlan
                                      ? "border-l border-slate-200 bg-slate-100 px-3 py-3 text-right font-black text-slate-900"
                                      : "border-l border-slate-100 bg-white px-3 py-2.5 text-right font-semibold text-slate-700"
                                }
                              >
                                {formatInteger(
                                  value.fim,
                                )}
                              </td>

                              <td
                                className={`border-l border-slate-100 px-3 py-2.5 text-right font-black ${deltaClass(
                                  value.variacao,
                                  isTotal
                                  ||
                                  isPlan,
                                )}`}
                              >
                                {formatSignedInteger(
                                  value.variacao,
                                )}
                              </td>

                              <td
                                className={`border-l border-slate-100 px-3 py-2.5 text-right font-black ${deltaClass(
                                  value.variacaoPercentual
                                  ?? 0,
                                  isTotal
                                  ||
                                  isPlan,
                                )}`}
                              >
                                {value.variacaoPercentual ===
                                null
                                  ? "—"
                                  : formatSignedPercent(
                                      value.variacaoPercentual,
                                    )}
                              </td>
                            </Fragment>
                          ),
                        )}
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span>
              <strong className="text-rose-700">
                Vermelho
              </strong>
              {" = perda de clientes"}
            </span>

            <span>
              <strong className="text-emerald-700">
                Verde
              </strong>
              {" = ganho de clientes"}
            </span>

            <span>
              <strong className="text-slate-700">
                Δ
              </strong>
              {" = último dia − primeiro dia"}
            </span>
          </div>
        </section>
      </div>


      {selectedPlan !==
      null ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedPlan(
                null,
              );
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Detalhamento do plano
                </p>

                <h3 className="mt-1 text-2xl font-black text-slate-950">
                  {selectedPlan}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {rankingMode ===
                  "ano"
                    ? `Ano atual · ${rankingPeriod?.label ?? ""}`
                    : `Mês · ${rankingPeriod?.label ?? ""}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(
                    null,
                  );
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="border-b border-slate-200 px-6">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailTab(
                      "duracoes",
                    );
                  }}
                  className={
                    detailTab ===
                    "duracoes"
                      ? "border-b-2 border-slate-950 px-3 py-3 text-sm font-black text-slate-950"
                      : "border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
                  }
                >
                  Por duração
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDetailTab(
                      "evolucao",
                    );
                  }}
                  className={
                    detailTab ===
                    "evolucao"
                      ? "border-b-2 border-slate-950 px-3 py-3 text-sm font-black text-slate-950"
                      : "border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
                  }
                >
                  Evolução 12 meses
                </button>
              </div>
            </div>

            <div className="max-h-[calc(92vh-150px)] overflow-y-auto p-6">
              {detailTab ===
              "duracoes" ? (
                <div>
                  <div className="mb-5">
                    <h4 className="text-base font-black text-slate-950">
                      Oscilação por duração
                    </h4>

                    <p className="mt-1 text-sm text-slate-500">
                      O detalhamento sempre mostra as quatro durações do plano, independentemente do filtro de duração usado no ranking.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {durationDetailRows.map(
                      (row) => {
                        const width =
                          Math.max(
                            2,
                            (
                              Math.abs(
                                row.variacao,
                              )
                              /
                              detailMaxAbs
                            )
                            *
                            100,
                          );

                        return (
                          <div
                            key={
                              row.duracao
                            }
                            className="grid grid-cols-[160px_minmax(0,1fr)_220px] items-center gap-4 rounded-2xl border border-slate-200 p-4"
                          >
                            <div>
                              <p className="font-black text-slate-950">
                                {row.duracaoLabel}
                              </p>

                              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                                {row.duracao}
                              </p>
                            </div>

                            <div className="relative h-9 overflow-hidden rounded-xl bg-slate-100">
                              <div
                                className={
                                  row.variacao <
                                  0
                                    ? "absolute inset-y-0 left-0 rounded-xl bg-rose-400"
                                    : row.variacao >
                                        0
                                      ? "absolute inset-y-0 left-0 rounded-xl bg-emerald-400"
                                      : "absolute inset-y-0 left-0 rounded-xl bg-slate-300"
                                }
                                style={{
                                  width:
                                    `${width}%`,
                                }}
                              />

                              <div className="absolute inset-0 flex items-center px-3 text-sm font-black text-slate-950">
                                {formatSignedInteger(
                                  row.variacao,
                                )}

                                {row.variacaoPercentual
                                  !== null
                                  ? ` (${formatSignedPercent(
                                      row.variacaoPercentual,
                                    )})`
                                  : ""}
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Início → fechamento
                              </p>

                              <p className="mt-1 text-sm font-black text-slate-950">
                                {formatInteger(
                                  row.inicio,
                                )}
                                {" → "}
                                {formatInteger(
                                  row.fim,
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <h4 className="text-base font-black text-slate-950">
                      Clientes ativos por duração
                    </h4>

                    <p className="mt-1 text-sm text-slate-500">
                      Evolução dos snapshots mensais dos últimos 12 meses.
                    </p>
                  </div>

                  <ReactECharts
                    option={{
                      animationDuration:
                        450,

                      tooltip: {
                        trigger:
                          "axis",

                        formatter:
                          (
                            params:
                              any[],
                          ) => {
                            if (
                              !params
                              ||
                              params.length ===
                                0
                            ) {
                              return "";
                            }

                            const lines = [
                              `<strong>${params[0].axisValueLabel}</strong>`,
                            ];

                            for (
                              const item
                              of params
                            ) {
                              if (
                                item.value ===
                                  null
                                ||
                                item.value ===
                                  undefined
                              ) {
                                continue;
                              }

                              lines.push(
                                `${item.marker}${item.seriesName}: <strong>${formatInteger(
                                  Number(
                                    item.value,
                                  ),
                                )}</strong>`,
                              );
                            }

                            return lines.join(
                              "<br/>",
                            );
                          },
                      },

                      legend: {
                        type:
                          "scroll",

                        top:
                          0,

                        textStyle: {
                          color:
                            "#475569",
                        },
                      },

                      grid: {
                        left:
                          16,

                        right:
                          24,

                        top:
                          55,

                        bottom:
                          28,

                        containLabel:
                          true,
                      },

                      xAxis: {
                        type:
                          "category",

                        boundaryGap:
                          false,

                        data:
                          last12Months.map(
                            (month) =>
                              month.label,
                          ),

                        axisLabel: {
                          color:
                            "#64748b",
                        },

                        axisLine: {
                          lineStyle: {
                            color:
                              "#cbd5e1",
                          },
                        },
                      },

                      yAxis: {
                        type:
                          "value",

                        axisLabel: {
                          color:
                            "#64748b",

                          formatter:
                            (
                              value:
                                number,
                            ) =>
                              value.toLocaleString(
                                "pt-BR",
                              ),
                        },

                        splitLine: {
                          lineStyle: {
                            color:
                              "#e2e8f0",
                          },
                        },
                      },

                      series:
                        detailLineSeries,
                    }}
                    style={{
                      height:
                        430,

                      width:
                        "100%",
                    }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
