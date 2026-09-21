"use client";

import ReactECharts
  from "echarts-for-react";

import type {
  DashboardPlan,
} from "@/types/dashboard";


type Props = {
  rows:
    DashboardPlan[];
};


export default function PlanPerformanceChart({
  rows,
}: Props) {


  // ==========================================================
  // PLANOS
  // ==========================================================
  //
  // A API já envia os planos na ordem correta:
  //
  // 1. Bronze
  // 2. Prata
  // 3. Ouro
  // 4. Platina
  // 5. Essencial
  // 6. Profissional
  // 7. Intermediário
  // 8. Master
  //
  // Portanto não precisamos filtrar os quatro planos
  // tradicionais do GestãoClick.
  // ==========================================================

  const filtered =
    rows.filter(
      (row) =>
        row.nome_plano
        &&
        row.nome_plano !==
          "Sem plano",
    );


  // ==========================================================
  // ALTURA DINÂMICA
  // ==========================================================
  //
  // Com oito planos, aumentamos a altura do gráfico.
  // Isso evita barras muito espremidas.
  // ==========================================================

  const chartHeight =
    Math.max(
      350,
      filtered.length * 58,
    );


  // ==========================================================
  // CONFIGURAÇÃO DO GRÁFICO
  // ==========================================================

  const option = {

    animationDuration:
      500,


    tooltip: {

      trigger:
        "axis",

      axisPointer: {
        type:
          "shadow",
      },

      valueFormatter: (
        value: number,
      ) =>
        `${Number(
          value,
        ).toLocaleString(
          "pt-BR",
          {
            minimumFractionDigits:
              2,

            maximumFractionDigits:
              2,
          },
        )}%`,
    },


    legend: {

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
        20,

      right:
        24,

      top:
        50,

      bottom:
        20,

      containLabel:
        true,
    },


    xAxis: {

      type:
        "value",

      min:
        0,

      max:
        110,

      axisLabel: {

        color:
          "#64748b",

        formatter:
          "{value}%",
      },

      splitLine: {

        lineStyle: {
          color:
            "#e2e8f0",
        },
      },
    },


    yAxis: {

      type:
        "category",

      data:
        filtered.map(
          (row) =>
            row.nome_plano,
        ),

      axisLabel: {

        color:
          "#334155",

        fontWeight:
          600,

        interval:
          0,
      },

      axisLine: {

        lineStyle: {
          color:
            "#cbd5e1",
        },
      },
    },


    series: [

      {
        name:
          "Renovação",

        type:
          "bar",

        barWidth:
          15,

        itemStyle: {

          color:
            "#2563eb",

          borderRadius: [
            0,
            6,
            6,
            0,
          ],
        },

        data:
          filtered.map(
            (row) =>
              row
                .taxa_renovacao_clientes,
          ),
      },


      {
        name:
          "Churn",

        type:
          "bar",

        barWidth:
          15,

        itemStyle: {

          color:
            "#f43f5e",

          borderRadius: [
            0,
            6,
            6,
            0,
          ],
        },

        data:
          filtered.map(
            (row) =>
              row
                .percentual_churn_vencimentos,
          ),
      },

    ],
  };


  return (

    <ReactECharts

      option={
        option
      }

      style={{
        height:
          chartHeight,

        width:
          "100%",
      }}

      notMerge

      lazyUpdate

    />
  );
}