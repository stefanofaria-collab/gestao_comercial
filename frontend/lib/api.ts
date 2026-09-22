import type {
  ActiveClientsHistoryResponse,
  ChurnHistoryResponse,
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


type RenewalHistoryPoint = {
  ano: number;
  mes: number;
  label: string;
  taxa_renovacao_clientes: number;
  taxa_renovacao_receita: number;
};


type RenewalHistoryResponse = {
  ano_inicio: number;
  ano_fim: number;
  pontos: RenewalHistoryPoint[];
};


type RevenueHistoryPoint = {
  ano: number;
  mes: number;
  label: string;
  receita_vencendo: number;
  renovacoes_receita: number;
};


type RevenueHistoryResponse = {
  ano_inicio: number;
  ano_fim: number;
  pontos: RevenueHistoryPoint[];
};


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
        body
        &&
        typeof body.detail ===
          "string"
      ) {
        message =
          body.detail;
      }
    } catch {
      // Mantém a mensagem padrão.
    }

    throw new Error(
      message,
    );
  }

  return response.json();
}


function buildHistoryParams(
  empresa: CompanyFilter,
  origem: OriginFilter,
  plano: PlanFilter,
  duracao: DurationFilter,
): URLSearchParams {
  return new URLSearchParams({
    ano_inicio:
      "2024",

    ano_fim:
      "2026",

    empresa,

    origem,

    plano,

    duracao,
  });
}


function emptyDashboardBlock():
  DashboardBlock {
  return {
    clientes_ativos:
      0,

    renovacoes_previstas:
      0,

    receita_vencendo:
      0,

    renovacoes_clientes:
      0,

    renovacoes_receita:
      0,

    churn_clientes:
      0,

    churn_receita:
      0,

    percentual_renovacoes_clientes_ativos:
      0,

    ticket_medio_vencimentos:
      0,

    ticket_medio_renovado:
      0,

    taxa_renovacao_clientes:
      0,

    taxa_renovacao_receita:
      0,

    ticket_medio_perdido:
      0,

    percentual_churn_clientes_ativos:
      0,

    percentual_churn_vencimentos:
      0,

    percentual_churn_receita_vencendo:
      0,
  };
}


export async function fetchMeta():
  Promise<MetaResponse> {
  const response =
    await fetch(
      `${API_URL}/api/meta`,
      {
        cache:
          "no-store",
      },
    );

  return parseResponse<MetaResponse>(
    response,
  );
}


export async function fetchDashboard(
  ano: number,
  mes: number,
  empresa: CompanyFilter = "todos",
  origem: OriginFilter = "todos",
  plano: PlanFilter = "todos",
  duracao: DurationFilter = "todos",
  comparar = false,
): Promise<DashboardResponse> {
  const params =
    new URLSearchParams({
      ano:
        String(
          ano,
        ),

      mes:
        String(
          mes,
        ),

      empresa,

      origem,

      plano,

      duracao,

      comparar:
        String(
          comparar,
        ),
    });

  const response =
    await fetch(
      `${API_URL}/api/dashboard?${params.toString()}`,
      {
        cache:
          "no-store",
      },
    );

  return parseResponse<DashboardResponse>(
    response,
  );
}


export async function fetchHistory(
  empresa: CompanyFilter = "todos",
  origem: OriginFilter = "todos",
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
        cache:
          "no-store",
      },
    ),

    fetch(
      `${API_URL}/api/historico-receita?${params.toString()}`,
      {
        cache:
          "no-store",
      },
    ),
  ]);

  const renewal =
    await parseResponse<RenewalHistoryResponse>(
      renewalResponse,
    );

  const revenue =
    await parseResponse<RevenueHistoryResponse>(
      revenueResponse,
    );

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
        parcial:
          false,

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
    const point
    of renewal.pontos
  ) {
    const target =
      ensurePoint(
        point.ano,
        point.mes,
        point.label,
      );

    target.resumo
      .taxa_renovacao_clientes =
        point
          .taxa_renovacao_clientes;

    target.resumo
      .taxa_renovacao_receita =
        point
          .taxa_renovacao_receita;
  }

  for (
    const point
    of revenue.pontos
  ) {
    const target =
      ensurePoint(
        point.ano,
        point.mes,
        point.label,
      );

    target.resumo
      .receita_vencendo =
        point
          .receita_vencendo;

    target.resumo
      .renovacoes_receita =
        point
          .renovacoes_receita;
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
    ano_inicio:
      2024,

    ano_fim:
      2026,

    pontos,
  };
}


export async function fetchActiveClientsHistory(
  empresa: CompanyFilter = "todos",
  origem: OriginFilter = "todos",
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
        cache:
          "no-store",
      },
    );

  return parseResponse<ActiveClientsHistoryResponse>(
    response,
  );
}


export async function fetchChurnHistory(
  empresa: CompanyFilter = "todos",
  origem: OriginFilter = "todos",
  plano: PlanFilter = "todos",
  duracao: DurationFilter = "todos",
): Promise<ChurnHistoryResponse> {
  const params =
    buildHistoryParams(
      empresa,
      origem,
      plano,
      duracao,
    );

  const response =
    await fetch(
      `${API_URL}/api/historico-churn?${params.toString()}`,
      {
        cache:
          "no-store",
      },
    );

  return parseResponse<ChurnHistoryResponse>(
    response,
  );
}
