"use client";

import ReactECharts from "echarts-for-react";

import type {
  HistoryPoint,
} from "@/types/dashboard";

type Props = {
  points: HistoryPoint[];
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function compactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mi`;
  }

  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })} mil`;
  }

  return formatCurrency(value);
}

export default function RevenueHistoryChart({
  points,
}: Props) {
  const safePoints = Array.isArray(points)
    ? points.filter(
        (point) =>
          point &&
          point.resumo &&
          typeof point.resumo.receita_vencendo === "number" &&
          typeof point.resumo.renovacoes_receita === "number",
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
            Não há pontos válidos para montar o histórico de receita.
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
        type: "shadow",
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
            `${item.marker}${item.seriesName}: <strong>${formatCurrency(
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
        "Receita vencendo",
        "Receita renovada",
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
        formatter: compactCurrency,
      },

      splitLine: {
        lineStyle: {
          color: "#e2e8f0",
        },
      },
    },

    series: [
      {
        name: "Receita vencendo",
        type: "bar",

        data: safePoints.map(
          (point) =>
            point.resumo.receita_vencendo,
        ),

        barMaxWidth: 22,
      },

      {
        name: "Receita renovada",
        type: "bar",

        data: safePoints.map(
          (point) =>
            point.resumo.renovacoes_receita,
        ),

        barMaxWidth: 22,
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
