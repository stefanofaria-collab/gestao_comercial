"use client";

import ReactECharts from "echarts-for-react";

import type {
  HistoryPoint,
} from "@/types/dashboard";

type Props = {
  points: HistoryPoint[];
};

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export default function RenewalHistoryChart({
  points,
}: Props) {
  const safePoints = Array.isArray(points)
    ? points.filter(
        (point) =>
          point &&
          point.resumo &&
          typeof point.resumo.taxa_renovacao_clientes === "number" &&
          typeof point.resumo.taxa_renovacao_receita === "number",
      )
    : [];

  if (safePoints.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">
            Sem histórico disponível
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Não há pontos válidos para montar a evolução da renovação.
          </p>
        </div>
      </div>
    );
  }

  const option = {
    animationDuration: 450,

    tooltip: {
      trigger: "axis",

      axisPointer: {
        type: "line",
      },

      formatter: (params: any[]) => {
        if (!params || params.length === 0) {
          return "";
        }

        const lines = [
          `<strong>${params[0].axisValueLabel}</strong>`,
        ];

        for (const item of params) {
          lines.push(
            `${item.marker}${item.seriesName}: <strong>${formatPercent(
              Number(item.value),
            )}</strong>`,
          );
        }

        return lines.join("<br/>");
      },
    },

    legend: {
      top: 0,
      right: 0,

      data: [
        "Clientes",
        "Receita",
      ],

      textStyle: {
        color: "#475569",
      },
    },

    grid: {
      left: 16,
      right: 22,
      top: 52,
      bottom: 28,
      containLabel: true,
    },

    xAxis: {
      type: "category",
      boundaryGap: false,

      data: safePoints.map(
        (point) =>
          point.label,
      ),

      axisLabel: {
        color: "#64748b",
        hideOverlap: true,
      },

      axisLine: {
        lineStyle: {
          color: "#cbd5e1",
        },
      },
    },

    yAxis: {
      type: "value",

      axisLabel: {
        color: "#64748b",

        formatter: (value: number) =>
          `${value}%`,
      },

      splitLine: {
        lineStyle: {
          color: "#e2e8f0",
        },
      },
    },

    series: [
      {
        name: "Clientes",
        type: "line",
        smooth: 0.2,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: true,

        data: safePoints.map(
          (point) =>
            point.resumo.taxa_renovacao_clientes,
        ),

        lineStyle: {
          width: 3,
        },
      },

      {
        name: "Receita",
        type: "line",
        smooth: 0.2,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: true,

        data: safePoints.map(
          (point) =>
            point.resumo.taxa_renovacao_receita,
        ),

        lineStyle: {
          width: 3,
        },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{
        height: 350,
        width: "100%",
      }}
      notMerge
      lazyUpdate
    />
  );
}
