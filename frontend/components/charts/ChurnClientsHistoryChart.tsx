"use client";

import ReactECharts
  from "echarts-for-react";

import type {
  ChurnPoint,
} from "@/types/dashboard";


type Props = {
  points: ChurnPoint[];
};


export default function ChurnClientsHistoryChart({
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

          return [
            `<strong>${params[0].axisValueLabel}</strong>`,
            `Clientes em churn: <strong>${Number(
              params[0].value,
            ).toLocaleString(
              "pt-BR",
            )}</strong>`,
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

    series: [
      {
        name:
          "Clientes em churn",

        type:
          "line",

        smooth:
          0.25,

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

        areaStyle: {
          opacity:
            0.08,
        },

        data:
          points.map(
            (point) =>
              point.churn_clientes,
          ),
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{
        height:
          340,

        width:
          "100%",
      }}
      notMerge
      lazyUpdate
    />
  );
}
