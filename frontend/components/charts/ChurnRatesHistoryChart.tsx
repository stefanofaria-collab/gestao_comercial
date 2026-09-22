"use client";

import ReactECharts
  from "echarts-for-react";

import type {
  ChurnPoint,
} from "@/types/dashboard";


type Props = {
  points: ChurnPoint[];
};


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


export default function ChurnRatesHistoryChart({
  points,
}: Props) {
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
            lines.push(
              `${item.marker}${item.seriesName}: <strong>${formatPercent(
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

      data: [
        "% Churn ativos",
        "% Churn vencimentos",
        "% Churn receita",
      ],

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
        points.map(
          (point) =>
            point.label,
        ),

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
            `${value}%`,
      },

      splitLine: {
        lineStyle: {
          color:
            "#e2e8f0",
        },
      },
    },

    series: [
      {
        name:
          "% Churn ativos",

        type:
          "line",

        smooth:
          0.2,

        symbol:
          "circle",

        symbolSize:
          6,

        showSymbol:
          true,

        lineStyle: {
          width:
            3,
        },

        data:
          points.map(
            (point) =>
              point
                .percentual_churn_clientes_ativos,
          ),
      },

      {
        name:
          "% Churn vencimentos",

        type:
          "line",

        smooth:
          0.2,

        symbol:
          "circle",

        symbolSize:
          6,

        showSymbol:
          true,

        lineStyle: {
          width:
            3,
        },

        data:
          points.map(
            (point) =>
              point
                .percentual_churn_vencimentos,
          ),
      },

      {
        name:
          "% Churn receita",

        type:
          "line",

        smooth:
          0.2,

        symbol:
          "circle",

        symbolSize:
          6,

        showSymbol:
          true,

        lineStyle: {
          width:
            3,
        },

        data:
          points.map(
            (point) =>
              point
                .percentual_churn_receita_vencendo,
          ),
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{
        height:
          360,

        width:
          "100%",
      }}
      notMerge
      lazyUpdate
    />
  );
}
