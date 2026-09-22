"use client";

import ReactECharts
  from "echarts-for-react";

import {
  useMemo,
} from "react";

import type {
  ChurnHistoryResponse,
} from "@/types/dashboard";


type Props = {
  data: ChurnHistoryResponse;
};


export default function ChurnByPlanChart({
  data,
}: Props) {
  const {
    labels,
    series,
  } = useMemo(
    () => {
      const labels =
        data.pontos.map(
          (point) =>
            point.label,
        );

      const valuesByPlan =
        new Map<
          string,
          Map<string, number>
        >();

      for (
        const plan
        of data.planos
      ) {
        valuesByPlan.set(
          plan,
          new Map(),
        );
      }

      for (
        const point
        of data.pontos_planos
      ) {
        if (
          !valuesByPlan.has(
            point.nome_plano,
          )
        ) {
          valuesByPlan.set(
            point.nome_plano,
            new Map(),
          );
        }

        valuesByPlan
          .get(
            point.nome_plano,
          )
          ?.set(
            point.label,
            point.churn_clientes,
          );
      }

      const series =
        data.planos.map(
          (plan) => ({
            name:
              plan,

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

            emphasis: {
              focus:
                "series",
            },

            data:
              labels.map(
                (label) =>
                  valuesByPlan
                    .get(
                      plan,
                    )
                    ?.get(
                      label,
                    )
                  ?? null,
              ),
          }),
        );

      return {
        labels,
        series,
      };
    },
    [
      data,
    ],
  );

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
            ||
            params.length === 0
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
              ||
              item.value === undefined
            ) {
              continue;
            }

            lines.push(
              `${item.marker}${item.seriesName}: <strong>${Number(
                item.value,
              ).toLocaleString(
                "pt-BR",
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
    },

    yAxis: {
      type:
        "value",

      axisLabel: {
        color:
          "#64748b",

        formatter:
          (
            value: number,
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

    series,
  };

  return (
    <ReactECharts
      option={option}
      style={{
        height:
          400,

        width:
          "100%",
      }}
      notMerge
      lazyUpdate
    />
  );
}
