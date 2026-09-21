"use client";

import ReactECharts
  from "echarts-for-react";

import {
  useMemo,
} from "react";

import type {
  ActiveClientsHistoryResponse,
} from "@/types/dashboard";


type Props = {
  data: ActiveClientsHistoryResponse;
};


function formatInteger(
  value: number,
): string {
  return value.toLocaleString(
    "pt-BR",
  );
}


export default function ActiveClientsByPlanChart({
  data,
}: Props) {
  const safePoints =
    Array.isArray(
      data?.pontos,
    )
      ? data.pontos
      : [];

  const safePlanPoints =
    Array.isArray(
      data?.pontos_planos,
    )
      ? data.pontos_planos
      : [];

  const safePlans =
    Array.isArray(
      data?.planos,
    )
      ? data.planos
      : [];


  const {
    labels,
    series,
  } = useMemo(
    () => {
      const labelSet =
        new Set<string>();

      const valuesByPlan =
        new Map<
          string,
          Map<string, number>
        >();


      for (
        const point
        of safePlanPoints
      ) {
        labelSet.add(
          point.label,
        );


        if (
          !valuesByPlan.has(
            point.nome_plano,
          )
        ) {
          valuesByPlan.set(
            point.nome_plano,
            new Map<
              string,
              number
            >(),
          );
        }


        valuesByPlan
          .get(
            point.nome_plano,
          )
          ?.set(
            point.label,
            point.clientes_ativos,
          );
      }


      const orderedLabels =
        safePoints.map(
          (point) =>
            point.label,
        );


      const finalLabels =
        orderedLabels.length > 0
          ? orderedLabels
          : Array.from(
              labelSet,
            );


      const plansFromPoints =
        Array.from(
          new Set(
            safePlanPoints.map(
              (point) =>
                point.nome_plano,
            ),
          ),
        );


      const finalPlans =
        safePlans.length > 0
          ? safePlans
          : plansFromPoints;


      const chartSeries =
        finalPlans.map(
          (planName) => ({
            name:
              planName,

            type:
              "line",

            smooth:
              0.2,

            symbol:
              "circle",

            symbolSize:
              6,

            showSymbol:
              false,

            connectNulls:
              false,

            emphasis: {
              focus:
                "series",
            },

            data:
              finalLabels.map(
                (label) => {
                  const value =
                    valuesByPlan
                      .get(
                        planName,
                      )
                      ?.get(
                        label,
                      );

                  return (
                    value
                    ?? null
                  );
                },
              ),
          }),
        );


      return {
        labels:
          finalLabels,

        series:
          chartSeries,
      };
    },
    [
      safePlanPoints,
      safePlans,
      safePoints,
    ],
  );


  if (
    safePlanPoints.length === 0
  ) {
    return (
      <div className="flex h-[430px] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">
            Sem dados por plano
          </p>

          <p className="mt-1 text-xs text-slate-500">
            O histórico total foi carregado, mas a API não retornou
            pontos detalhados por plano.
          </p>
        </div>
      </div>
    );
  }


  const option = {
    animationDuration:
      450,

    tooltip: {
      trigger:
        "axis",

      axisPointer: {
        type:
          "line",
      },

      formatter:
        (params: any[]) => {
          if (
            !params
            || params.length === 0
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
              item.value === null
              || item.value === undefined
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

      right:
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
        22,

      top:
        58,

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
        labels,

      axisLabel: {
        color:
          "#64748b",

        hideOverlap:
          true,
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
          (value: number) =>
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

    series,
  };


  return (
    <ReactECharts
      option={option}
      style={{
        height:
          430,

        width:
          "100%",
      }}
      notMerge
      lazyUpdate
    />
  );
}
