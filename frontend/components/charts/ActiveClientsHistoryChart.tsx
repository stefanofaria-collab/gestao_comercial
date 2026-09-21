"use client";

import ReactECharts
  from "echarts-for-react";

import type {
  ActiveClientsPoint,
} from "@/types/dashboard";


type Props = {
  points: ActiveClientsPoint[];
};


function formatInteger(
  value: number,
): string {
  return value.toLocaleString(
    "pt-BR",
  );
}


function formatPercent(
  value: number,
): string {
  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}


export default function ActiveClientsHistoryChart({
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
            || params.length === 0
          ) {
            return "";
          }

          const index =
            params[0]
              .dataIndex;

          const point =
            points[index];

          if (!point) {
            return "";
          }

          const variation =
            point
              .variacao_clientes;

          const variationPercent =
            point
              .variacao_percentual;

          let variationText =
            "Sem mês anterior para comparação";

          if (
            variation !== null
          ) {
            const sign =
              variation > 0
                ? "+"
                : "";

            const percentText =
              variationPercent === null
                ? ""
                : ` (${variationPercent > 0 ? "+" : ""}${formatPercent(
                    variationPercent,
                  )}%)`;

            variationText =
              `${sign}${formatInteger(
                variation,
              )}${percentText}`;
          }

          return [
            `<strong>${point.label}</strong>`,
            `Clientes ativos: <strong>${formatInteger(
              point.clientes_ativos,
            )}</strong>`,
            `Variação vs. mês anterior: <strong>${variationText}</strong>`,
          ].join(
            "<br/>",
          );
        },
    },

    grid: {
      left:
        16,

      right:
        22,

      top:
        22,

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

    series: [
      {
        name:
          "Clientes ativos",

        type:
          "line",

        smooth:
          0.25,

        symbol:
          "circle",

        symbolSize:
          7,

        showSymbol:
          true,

        lineStyle: {
          width:
            3,
        },

        areaStyle: {
          opacity:
            0.08,
        },

        data:
          points.map(
            (point) =>
              point
                .clientes_ativos,
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
