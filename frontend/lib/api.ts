import type {
  ActiveClientsHistoryResponse,
  ActiveClientsPlanPoint,
  ActiveClientsPoint,
  CompanyFilter,
  DashboardBlock,
  DashboardResponse,
  DurationFilter,
  HistoryPoint,
  HistoryResponse,
  MetaResponse,
  OriginFilter,
  PlanFilter,
} from "@/types/dashboard";


const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";


type UnknownRecord =
  Record<string, unknown>;


function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object"
    &&
    value !== null
    &&
    !Array.isArray(value)
  );
}


function toNumber(
  value: unknown,
): number {
  if (
    typeof value === "number"
    &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(
        value.replace(
          ",",
          ".",
        ),
      );

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return 0;
}


function toInteger(
  value: unknown,
): number {
  return Math.trunc(
    toNumber(value),
  );
}


function toStringValue(
  value: unknown,
): string {
  if (
    typeof value === "string"
  ) {
    return value;
  }

  return "";
}


function emptyDashboardBlock():
  DashboardBlock {
  return {
    clientes_ativos: 0,
    renovacoes_previstas: 0,
    receita_vencendo: 0,
    renovacoes_clientes: 0,
    renovacoes_receita: 0,
    churn_clientes: 0,
    churn_receita: 0,
    percentual_renovacoes_clientes_ativos: 0,
    ticket_medio_vencimentos: 0,
    ticket_medio_renovado: 0,
    taxa_renovacao_clientes: 0,
    taxa_renovacao_receita: 0,
    ticket_medio_perdido: 0,
    percentual_churn_clientes_ativos: 0,
    percentual_churn_vencimentos: 0,
    percentual_churn_receita_vencendo: 0,
  };
}


function isActiveClientsPoint(
  value: unknown,
): value is ActiveClientsPoint {
  if (
    !isRecord(value)
  ) {
    return false;
  }

  return (
    typeof value["ano"] === "number"
    &&
    typeof value["mes"] === "number"
    &&
    typeof value["label"] === "string"
    &&
    typeof value["clientes_ativos"] === "number"
  );
}


function isActiveClientsPlanPoint(
  value: unknown,
): value is ActiveClientsPlanPoint {
  if (
    !isRecord(value)
  ) {
    return false;
  }

  return (
    typeof value["ano"] === "number"
    &&
    typeof value["mes"] === "number"
    &&
    typeof value["label"] === "string"
    &&
    typeof value["nome_plano"] === "string"
    &&
    typeof value["clientes_ativos"] === "number"
  );
}


async function parseResponse<T>(
  response: Response,
): Promise<T> {
  if (!response.ok) {
    let message =
      "Erro ao consultar a API.";

    try {
      const body =
        await response.json();

      if (
        body?.detail
      ) {
        message =
          String(
            body.detail,
          );
      }
    } catch {
      // Mantém a mensagem padrão.
    }

    throw new Error(
      message,
    );
  }

  const data =
    await response.json();

  return data;
}


function buildHistoryParams(
  empresa: CompanyFilter,
  origem: OriginFilter,
  plano: PlanFilter,
  duracao: DurationFilter,
): URLSearchParams {
  return new URLSearchParams({
    ano_inicio: "2024",
    ano_fim: "2026",
    empresa,
    origem,
    plano,
    duracao,
  });
}


export async function fetchMeta():
  Promise<MetaResponse> {
  const response =
    await fetch(
      `${API_URL}/api/meta`,
      {
        cache: "no-store",
      },
    );

  return parseResponse<MetaResponse>(
    response,
  );
}


export async function fetchDashboard(
  ano: number,
  mes: number,
  empresa: CompanyFilter = "gestaoclick",
  origem: OriginFilter = "gestaoclick",
  plano: PlanFilter = "todos",
  duracao: DurationFilter = "todos",
  comparar = false,
): Promise<DashboardResponse> {
  const params =
    new URLSearchParams({
      ano: String(ano),
      mes: String(mes),
      empresa,
      origem,
      plano,
      duracao,
      comparar: String(comparar),
    });

  const response =
    await fetch(
      `${API_URL}/api/dashboard?${params.toString()}`,
      {
        cache: "no-store",
      },
    );

  return parseResponse<DashboardResponse>(
    response,
  );
}


export async function fetchHistory(
  empresa: CompanyFilter = "gestaoclick",
  origem: OriginFilter = "gestaoclick",
  plano: PlanFilter = "todos",
  duracao: DurationFilter = "todos",
): Promise<HistoryResponse> {
  const params =
    buildHistoryParams(
      empresa,
      origem,
      plano,
      duracao,
    );


  const [
    renewalResponse,
    revenueResponse,
  ] = await Promise.all([
    fetch(
      `${API_URL}/api/historico-renovacao?${params.toString()}`,
      {
        cache: "no-store",
      },
    ),

    fetch(
      `${API_URL}/api/historico-receita?${params.toString()}`,
      {
        cache: "no-store",
      },
    ),
  ]);


  const renewalRaw =
    await parseResponse<UnknownRecord>(
      renewalResponse,
    );

  const revenueRaw =
    await parseResponse<UnknownRecord>(
      revenueResponse,
    );


  const renewalPoints =
    Array.isArray(
      renewalRaw["pontos"],
    )
      ? renewalRaw["pontos"]
      : [];


  const revenuePoints =
    Array.isArray(
      revenueRaw["pontos"],
    )
      ? revenueRaw["pontos"]
      : [];


  const byMonth =
    new Map<
      string,
      HistoryPoint
    >();


  function ensurePoint(
    ano: number,
    mes: number,
    label: string,
  ): HistoryPoint {
    const key =
      `${ano}-${mes}`;

    const existing =
      byMonth.get(
        key,
      );

    if (existing) {
      return existing;
    }

    const created:
      HistoryPoint = {
        ano,
        mes,
        label,
        parcial: false,
        resumo:
          emptyDashboardBlock(),
      };

    byMonth.set(
      key,
      created,
    );

    return created;
  }


  for (
    const item
    of renewalPoints
  ) {
    if (
      !isRecord(item)
    ) {
      continue;
    }

    const ano =
      toInteger(
        item["ano"],
      );

    const mes =
      toInteger(
        item["mes"],
      );

    if (
      ano === 0
      ||
      mes < 1
      ||
      mes > 12
    ) {
      continue;
    }

    const label =
      toStringValue(
        item["label"],
      )
      || `${mes}/${ano}`;

    const point =
      ensurePoint(
        ano,
        mes,
        label,
      );

    point.resumo.taxa_renovacao_clientes =
      toNumber(
        item[
          "taxa_renovacao_clientes"
        ],
      );

    point.resumo.taxa_renovacao_receita =
      toNumber(
        item[
          "taxa_renovacao_receita"
        ],
      );
  }


  for (
    const item
    of revenuePoints
  ) {
    if (
      !isRecord(item)
    ) {
      continue;
    }

    const ano =
      toInteger(
        item["ano"],
      );

    const mes =
      toInteger(
        item["mes"],
      );

    if (
      ano === 0
      ||
      mes < 1
      ||
      mes > 12
    ) {
      continue;
    }

    const label =
      toStringValue(
        item["label"],
      )
      || `${mes}/${ano}`;

    const point =
      ensurePoint(
        ano,
        mes,
        label,
      );

    point.resumo.receita_vencendo =
      toNumber(
        item[
          "receita_vencendo"
        ],
      );

    point.resumo.renovacoes_receita =
      toNumber(
        item[
          "renovacoes_receita"
        ],
      );
  }


  const pontos =
    Array.from(
      byMonth.values(),
    ).sort(
      (
        first,
        second,
      ) => {
        if (
          first.ano !==
          second.ano
        ) {
          return (
            first.ano
            -
            second.ano
          );
        }

        return (
          first.mes
          -
          second.mes
        );
      },
    );


  return {
    ano_inicio: 2024,
    ano_fim: 2026,
    pontos,
  };
}


export async function fetchActiveClientsHistory(
  empresa: CompanyFilter = "gestaoclick",
  origem: OriginFilter = "gestaoclick",
  plano: PlanFilter = "todos",
  duracao: DurationFilter = "todos",
): Promise<ActiveClientsHistoryResponse> {
  const params =
    buildHistoryParams(
      empresa,
      origem,
      plano,
      duracao,
    );

  const response =
    await fetch(
      `${API_URL}/api/historico-clientes-ativos?${params.toString()}`,
      {
        cache: "no-store",
      },
    );

  const raw =
    await parseResponse<UnknownRecord>(
      response,
    );


  const rawPoints =
    raw["pontos"];

  const rawPlans =
    raw["planos"];

  const rawPlanPoints =
    raw["pontos_planos"]
    ??
    raw["pontos_por_plano"]
    ??
    raw["pontosPorPlano"]
    ??
    raw["por_plano"];


  const pontos:
    ActiveClientsPoint[] =
      Array.isArray(
        rawPoints,
      )
        ? rawPoints.filter(
            isActiveClientsPoint,
          )
        : [];


  const planos:
    string[] =
      Array.isArray(
        rawPlans,
      )
        ? rawPlans.filter(
            (
              item,
            ): item is string =>
              typeof item ===
              "string",
          )
        : [];


  const pontosPlanos:
    ActiveClientsPlanPoint[] =
      Array.isArray(
        rawPlanPoints,
      )
        ? rawPlanPoints.filter(
            isActiveClientsPlanPoint,
          )
        : [];


  return {
    ano_inicio:
      toInteger(
        raw["ano_inicio"],
      )
      || 2024,

    ano_fim:
      toInteger(
        raw["ano_fim"],
      )
      || 2026,

    pontos,

    planos,

    pontos_planos:
      pontosPlanos,
  };
}
