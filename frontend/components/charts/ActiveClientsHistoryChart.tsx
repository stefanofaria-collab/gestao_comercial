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


function formatPercent(
  value: number,
): string {
  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  );
}


export default function ActiveClientsHistoryChart({
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

      const pointsBySegment =
        new Map<
          string,
          Map<
            string,
            typeof data.pontos_segmentos[number]
          >
        >();

      for (
        const segment
        of data.segmentos
      ) {
        pointsBySegment.set(
          segment,
          new Map(),
        );
      }

      for (
        const point
        of data.pontos_segmentos
      ) {
        if (
          !pointsBySegment.has(
            point.segmento,
          )
        ) {
          pointsBySegment.set(
            point.segmento,
            new Map(),
          );
        }

        pointsBySegment
          .get(
            point.segmento,
          )
          ?.set(
            point.label,
            point,
          );
      }

      const series =
        data.segmentos.map(
          (segment) => ({
            name:
              segment,

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

            connectNulls:
              false,

            emphasis: {
              focus:
                "series",
            },

            lineStyle: {
              width:
                3,
            },

            data:
              labels.map(
                (label) => {
                  const point =
                    pointsBySegment
                      .get(
                        segment,
                      )
                      ?.get(
                        label,
                      );

                  if (!point) {
                    return null;
                  }

                  return {
                    value:
                      point.clientes_ativos,

                    variacao_clientes:
                      point.variacao_clientes,

                    variacao_percentual:
                      point.variacao_percentual,
                  };
                },
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

  if (
    labels.length === 0
    ||
    series.length === 0
  ) {
    return (
      <div className="flex h-[380px] items-center justify-center">
        <p className="text-sm font-semibold text-slate-500">
          Sem histórico de clientes ativos para os filtros selecionados.
        </p>
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

            const raw =
              item.data;

            let variationText =
              "Sem mês anterior";

            if (
              raw
              &&
              raw.variacao_clientes !== null
              &&
              raw.variacao_clientes !== undefined
            ) {
              const variation =
                Number(
                  raw.variacao_clientes,
                );

              const sign =
                variation > 0
                  ? "+"
                  : "";

              let percentText =
                "";

              if (
                raw.variacao_percentual !== null
                &&
                raw.variacao_percentual !== undefined
              ) {
                const percentage =
                  Number(
                    raw.variacao_percentual,
                  );

                percentText =
                  ` (${percentage > 0 ? "+" : ""}${formatPercent(
                    percentage,
                  )}%)`;
              }

              variationText =
                `${sign}${formatInteger(
                  variation,
                )}${percentText}`;
            }

            lines.push(
              `${item.marker}${item.seriesName}: <strong>${formatInteger(
                Number(
                  item.value,
                ),
              )}</strong>`,
            );

            lines.push(
              `<span style="padding-left:18px;color:#64748b">Variação: ${variationText}</span>`,
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
          380,

        width:
          "100%",
      }}
      notMerge
      lazyUpdate
    />
  );
}
