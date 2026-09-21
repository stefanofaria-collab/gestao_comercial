from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from threading import RLock
from zoneinfo import ZoneInfo

from cachetools import TTLCache, cached
from sqlalchemy import text

from app.config import settings
from app.constants import (
    ALL_PLANS,
    ALLOWED_COMPANY_FILTERS,
    ALLOWED_DURATION_FILTERS,
    ALLOWED_ORIGIN_FILTERS,
    ALLOWED_YEARS,
    CLICKNOTAS_PLANS,
    DURATION_LABELS,
    DURATION_ORDER,
    GESTAOCLICK_PLANS,
    PLAN_ORDER,
)
from app.database import supabase_engine


_cache = TTLCache(
    maxsize=1024,
    ttl=settings.cache_ttl_seconds,
)

_cache_lock = RLock()


def _today_sp() -> date:
    return datetime.now(
        ZoneInfo("America/Sao_Paulo")
    ).date()


def _month_bounds(
    ano: int,
    mes: int,
) -> tuple[date, date]:
    inicio = date(
        ano,
        mes,
        1,
    )

    if mes == 12:
        fim = date(
            ano + 1,
            1,
            1,
        )
    else:
        fim = date(
            ano,
            mes + 1,
            1,
        )

    return inicio, fim


def _previous_period(
    ano: int,
    mes: int,
) -> tuple[int, int] | None:
    if mes == 1:
        previous = (
            ano - 1,
            12,
        )
    else:
        previous = (
            ano,
            mes - 1,
        )

    if previous[0] not in ALLOWED_YEARS:
        return None

    return previous


def _validate_period(
    ano: int,
    mes: int,
) -> None:
    if ano not in ALLOWED_YEARS:
        raise ValueError(
            "O dashboard aceita somente 2024, 2025 e 2026."
        )

    if not 1 <= mes <= 12:
        raise ValueError(
            "O mês deve estar entre 1 e 12."
        )

    hoje = _today_sp()

    inicio, _ = _month_bounds(
        ano,
        mes,
    )

    mes_atual = date(
        hoje.year,
        hoje.month,
        1,
    )

    if inicio > mes_atual:
        raise ValueError(
            "Não é possível consultar meses futuros."
        )


def _validate_filters(
    empresa: str,
    origem: str,
    plano: str,
    duracao: str,
) -> None:
    if empresa not in ALLOWED_COMPANY_FILTERS:
        raise ValueError(
            "Filtro de empresa inválido."
        )

    if origem not in ALLOWED_ORIGIN_FILTERS:
        raise ValueError(
            "Filtro de origem inválido."
        )

    if plano != "todos" and plano not in PLAN_ORDER:
        raise ValueError(
            "Filtro de plano inválido."
        )

    if duracao not in ALLOWED_DURATION_FILTERS:
        raise ValueError(
            "Filtro de duração inválido."
        )


def _company_db_value(
    empresa: str,
) -> str | None:
    if empresa == "gestaoclick":
        return "GestãoClick"

    if empresa == "clicknotas":
        return "ClickNotas"

    return None


def _origin_db_value(
    origem: str,
) -> str | None:
    if origem == "gestaoclick":
        return "GestãoClick"

    if origem == "parceiro":
        return "Parceiro"

    return None


def _expected_plans(
    empresa: str,
    plano: str,
) -> tuple[str, ...]:
    if plano != "todos":
        return (
            plano,
        )

    if empresa == "gestaoclick":
        return GESTAOCLICK_PLANS

    if empresa == "clicknotas":
        return CLICKNOTAS_PLANS

    return ALL_PLANS


def _expected_durations(
    duracao: str,
) -> tuple[str, ...]:
    if duracao != "todos":
        return (
            duracao,
        )

    return tuple(
        DURATION_ORDER.keys()
    )


def _build_filter_sql(
    empresa: str,
    origem: str,
    plano: str,
    duracao: str,
    table_alias: str = "",
) -> tuple[str, dict]:
    prefix = (
        f"{table_alias}."
        if table_alias
        else ""
    )

    clauses: list[str] = []
    params: dict = {}

    company_value = _company_db_value(
        empresa
    )

    origin_value = _origin_db_value(
        origem
    )

    if company_value is not None:
        clauses.append(
            f"{prefix}empresa = :empresa_db"
        )

        params[
            "empresa_db"
        ] = company_value

    if origin_value is not None:
        clauses.append(
            f"{prefix}origem = :origem_db"
        )

        params[
            "origem_db"
        ] = origin_value

    if plano != "todos":
        clauses.append(
            f"{prefix}nome_plano = :plano_db"
        )

        params[
            "plano_db"
        ] = plano

    if duracao != "todos":
        clauses.append(
            f"{prefix}duracao = :duracao_db"
        )

        params[
            "duracao_db"
        ] = duracao

    if not clauses:
        return "", params

    return (
        " AND "
        + " AND ".join(
            clauses
        ),
        params,
    )


def _to_float(
    value,
) -> float:
    if value is None:
        return 0.0

    return round(
        float(value),
        2,
    )


def _percentage(
    numerator: float,
    denominator: float,
) -> float:
    if not denominator:
        return 0.0

    return round(
        (
            numerator
            / denominator
        )
        * 100,
        2,
    )


def _average(
    total: float,
    quantity: float,
) -> float:
    if not quantity:
        return 0.0

    return round(
        total / quantity,
        2,
    )


def _build_block(
    values: dict,
) -> dict:
    clientes_ativos = int(
        values.get(
            "clientes_ativos",
            0,
        )
        or 0
    )

    renovacoes_previstas = int(
        values.get(
            "renovacoes_previstas",
            0,
        )
        or 0
    )

    receita_vencendo = _to_float(
        values.get(
            "receita_vencendo",
            0,
        )
    )

    renovacoes_clientes = int(
        values.get(
            "renovacoes_clientes",
            0,
        )
        or 0
    )

    renovacoes_receita = _to_float(
        values.get(
            "renovacoes_receita",
            0,
        )
    )

    churn_clientes = int(
        values.get(
            "churn_clientes",
            0,
        )
        or 0
    )

    churn_receita = _to_float(
        values.get(
            "churn_receita",
            0,
        )
    )

    return {
        "clientes_ativos":
            clientes_ativos,

        "renovacoes_previstas":
            renovacoes_previstas,

        "receita_vencendo":
            receita_vencendo,

        "renovacoes_clientes":
            renovacoes_clientes,

        "renovacoes_receita":
            renovacoes_receita,

        "churn_clientes":
            churn_clientes,

        "churn_receita":
            churn_receita,

        "percentual_renovacoes_clientes_ativos":
            _percentage(
                renovacoes_previstas,
                clientes_ativos,
            ),

        "ticket_medio_vencimentos":
            _average(
                receita_vencendo,
                renovacoes_previstas,
            ),

        "ticket_medio_renovado":
            _average(
                renovacoes_receita,
                renovacoes_clientes,
            ),

        "taxa_renovacao_clientes":
            _percentage(
                renovacoes_clientes,
                renovacoes_previstas,
            ),

        "taxa_renovacao_receita":
            _percentage(
                renovacoes_receita,
                receita_vencendo,
            ),

        "ticket_medio_perdido":
            _average(
                churn_receita,
                churn_clientes,
            ),

        "percentual_churn_clientes_ativos":
            _percentage(
                churn_clientes,
                clientes_ativos,
            ),

        "percentual_churn_vencimentos":
            _percentage(
                churn_clientes,
                renovacoes_previstas,
            ),

        "percentual_churn_receita_vencendo":
            _percentage(
                churn_receita,
                receita_vencendo,
            ),
    }


def _aggregate(
    rows: list[dict],
) -> dict:
    values = defaultdict(
        float
    )

    for row in rows:
        values[
            "clientes_ativos"
        ] += row[
            "clientes_ativos"
        ]

        values[
            "renovacoes_previstas"
        ] += row[
            "renovacoes_previstas"
        ]

        values[
            "receita_vencendo"
        ] += row[
            "receita_vencendo"
        ]

        values[
            "renovacoes_clientes"
        ] += row[
            "renovacoes_clientes"
        ]

        values[
            "renovacoes_receita"
        ] += row[
            "renovacoes_receita"
        ]

        values[
            "churn_clientes"
        ] += row[
            "churn_clientes"
        ]

        values[
            "churn_receita"
        ] += row[
            "churn_receita"
        ]

    return _build_block(
        values
    )


def _sort_detail_key(
    row: dict,
) -> tuple:
    plano = row[
        "nome_plano"
    ]

    duracao = row[
        "duracao"
    ]

    return (
        PLAN_ORDER.get(
            plano,
            99,
        ),
        plano,
        DURATION_ORDER.get(
            duracao,
            99,
        ),
        duracao,
    )


@cached(
    cache=_cache,
    lock=_cache_lock,
)
def get_month_data(
    ano: int,
    mes: int,
    empresa: str = "gestaoclick",
    origem: str = "gestaoclick",
    plano: str = "todos",
    duracao: str = "todos",
) -> dict:
    _validate_period(
        ano,
        mes,
    )

    _validate_filters(
        empresa,
        origem,
        plano,
        duracao,
    )

    filter_sql, filter_params = (
        _build_filter_sql(
            empresa,
            origem,
            plano,
            duracao,
        )
    )

    query = text(
        f"""
        SELECT
            nome_plano,
            duracao,

            SUM(clientes_ativos)
                AS clientes_ativos,

            SUM(renovacoes_previstas)
                AS renovacoes_previstas,

            SUM(receita_vencendo)
                AS receita_vencendo,

            SUM(renovacoes_clientes)
                AS renovacoes_clientes,

            SUM(renovacoes_receita)
                AS renovacoes_receita,

            SUM(churn_clientes)
                AS churn_clientes,

            SUM(churn_receita)
                AS churn_receita

        FROM public.indicadores_mensais

        WHERE
            ano = :ano
            AND mes = :mes

            {filter_sql}

        GROUP BY
            nome_plano,
            duracao
        """
    )

    params = {
        "ano":
            ano,

        "mes":
            mes,

        **filter_params,
    }

    with supabase_engine.connect() as connection:
        result = connection.execute(
            query,
            params,
        ).mappings().all()

    by_key: dict[
        tuple[str, str],
        dict,
    ] = {}

    for row in result:
        key = (
            row[
                "nome_plano"
            ],
            row[
                "duracao"
            ],
        )

        by_key[
            key
        ] = {
            "nome_plano":
                row[
                    "nome_plano"
                ],

            "duracao":
                row[
                    "duracao"
                ],

            "clientes_ativos":
                int(
                    row[
                        "clientes_ativos"
                    ]
                    or 0
                ),

            "renovacoes_previstas":
                int(
                    row[
                        "renovacoes_previstas"
                    ]
                    or 0
                ),

            "receita_vencendo":
                _to_float(
                    row[
                        "receita_vencendo"
                    ]
                ),

            "renovacoes_clientes":
                int(
                    row[
                        "renovacoes_clientes"
                    ]
                    or 0
                ),

            "renovacoes_receita":
                _to_float(
                    row[
                        "renovacoes_receita"
                    ]
                ),

            "churn_clientes":
                int(
                    row[
                        "churn_clientes"
                    ]
                    or 0
                ),

            "churn_receita":
                _to_float(
                    row[
                        "churn_receita"
                    ]
                ),
        }

    expected_plans = _expected_plans(
        empresa,
        plano,
    )

    expected_durations = _expected_durations(
        duracao
    )

    for plan_name in expected_plans:
        for duration_code in expected_durations:
            key = (
                plan_name,
                duration_code,
            )

            if key in by_key:
                continue

            by_key[
                key
            ] = {
                "nome_plano":
                    plan_name,

                "duracao":
                    duration_code,

                "clientes_ativos":
                    0,

                "renovacoes_previstas":
                    0,

                "receita_vencendo":
                    0.0,

                "renovacoes_clientes":
                    0,

                "renovacoes_receita":
                    0.0,

                "churn_clientes":
                    0,

                "churn_receita":
                    0.0,
            }

    detalhe: list[dict] = []

    for row in sorted(
        by_key.values(),
        key=_sort_detail_key,
    ):
        detalhe.append(
            {
                "nome_plano":
                    row[
                        "nome_plano"
                    ],

                "duracao":
                    row[
                        "duracao"
                    ],

                "duracao_label":
                    DURATION_LABELS.get(
                        row[
                            "duracao"
                        ],
                        row[
                            "duracao"
                        ],
                    ),

                **_build_block(
                    row
                ),
            }
        )

    resumo = _aggregate(
        detalhe
    )

    por_plano: list[dict] = []

    planos = sorted(
        {
            row[
                "nome_plano"
            ]
            for row in detalhe
        },
        key=lambda nome: (
            PLAN_ORDER.get(
                nome,
                99,
            ),
            nome,
        ),
    )

    for plan_name in planos:
        rows = [
            row
            for row in detalhe
            if row[
                "nome_plano"
            ] == plan_name
        ]

        por_plano.append(
            {
                "nome_plano":
                    plan_name,

                **_aggregate(
                    rows
                ),
            }
        )

    por_duracao: list[dict] = []

    duracoes = sorted(
        {
            row[
                "duracao"
            ]
            for row in detalhe
        },
        key=lambda duration_code: (
            DURATION_ORDER.get(
                duration_code,
                99,
            ),
            duration_code,
        ),
    )

    for duration_code in duracoes:
        rows = [
            row
            for row in detalhe
            if row[
                "duracao"
            ] == duration_code
        ]

        por_duracao.append(
            {
                "duracao":
                    duration_code,

                "duracao_label":
                    DURATION_LABELS.get(
                        duration_code,
                        duration_code,
                    ),

                **_aggregate(
                    rows
                ),
            }
        )

    data_inicio, data_fim = (
        _month_bounds(
            ano,
            mes,
        )
    )

    hoje = _today_sp()

    parcial = (
        ano == hoje.year
        and mes == hoje.month
    )

    return {
        "periodo": {
            "ano":
                ano,

            "mes":
                mes,

            "data_inicio":
                data_inicio.isoformat(),

            "data_fim":
                data_fim.isoformat(),

            "parcial":
                parcial,
        },

        "resumo":
            resumo,

        "por_plano":
            por_plano,

        "por_duracao":
            por_duracao,

        "detalhe":
            detalhe,
    }


def get_dashboard(
    ano: int,
    mes: int,
    empresa: str = "gestaoclick",
    origem: str = "gestaoclick",
    plano: str = "todos",
    duracao: str = "todos",
    comparar: bool = False,
) -> dict:
    current = dict(
        get_month_data(
            ano,
            mes,
            empresa,
            origem,
            plano,
            duracao,
        )
    )

    current[
        "mes_anterior"
    ] = None

    if not comparar:
        return current

    previous = _previous_period(
        ano,
        mes,
    )

    if previous is None:
        return current

    previous_data = get_month_data(
        previous[
            0
        ],
        previous[
            1
        ],
        empresa,
        origem,
        plano,
        duracao,
    )

    current[
        "mes_anterior"
    ] = {
        "ano":
            previous[
                0
            ],

        "mes":
            previous[
                1
            ],

        "resumo":
            previous_data[
                "resumo"
            ],
    }

    return current


@cached(
    cache=_cache,
    lock=_cache_lock,
)
def get_historico(
    ano_inicio: int,
    ano_fim: int,
    empresa: str = "gestaoclick",
    origem: str = "gestaoclick",
    plano: str = "todos",
    duracao: str = "todos",
) -> dict:
    if (
        ano_inicio not in ALLOWED_YEARS
        or ano_fim not in ALLOWED_YEARS
    ):
        raise ValueError(
            "O histórico está disponível somente para 2024, 2025 e 2026."
        )

    if ano_inicio > ano_fim:
        raise ValueError(
            "ano_inicio não pode ser maior que ano_fim."
        )

    _validate_filters(
        empresa,
        origem,
        plano,
        duracao,
    )

    filter_sql, filter_params = (
        _build_filter_sql(
            empresa,
            origem,
            plano,
            duracao,
        )
    )

    query = text(
        f"""
        SELECT
            ano,
            mes,

            SUM(clientes_ativos)
                AS clientes_ativos,

            SUM(renovacoes_previstas)
                AS renovacoes_previstas,

            SUM(receita_vencendo)
                AS receita_vencendo,

            SUM(renovacoes_clientes)
                AS renovacoes_clientes,

            SUM(renovacoes_receita)
                AS renovacoes_receita,

            SUM(churn_clientes)
                AS churn_clientes,

            SUM(churn_receita)
                AS churn_receita

        FROM public.indicadores_mensais

        WHERE
            ano BETWEEN :ano_inicio
            AND :ano_fim

            {filter_sql}

        GROUP BY
            ano,
            mes

        ORDER BY
            ano,
            mes
        """
    )

    params = {
        "ano_inicio":
            ano_inicio,

        "ano_fim":
            ano_fim,

        **filter_params,
    }

    with supabase_engine.connect() as connection:
        rows = connection.execute(
            query,
            params,
        ).mappings().all()

    meses_pt = (
        "",
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
    )

    hoje = _today_sp()

    pontos: list[dict] = []

    for row in rows:
        ano = int(
            row[
                "ano"
            ]
        )

        mes = int(
            row[
                "mes"
            ]
        )

        values = {
            "clientes_ativos":
                row[
                    "clientes_ativos"
                ],

            "renovacoes_previstas":
                row[
                    "renovacoes_previstas"
                ],

            "receita_vencendo":
                row[
                    "receita_vencendo"
                ],

            "renovacoes_clientes":
                row[
                    "renovacoes_clientes"
                ],

            "renovacoes_receita":
                row[
                    "renovacoes_receita"
                ],

            "churn_clientes":
                row[
                    "churn_clientes"
                ],

            "churn_receita":
                row[
                    "churn_receita"
                ],
        }

        pontos.append(
            {
                "ano":
                    ano,

                "mes":
                    mes,

                "label":
                    (
                        f"{meses_pt[mes]}"
                        f"/"
                        f"{str(ano)[2:]}"
                    ),

                "parcial":
                    (
                        ano
                        == hoje.year
                        and mes
                        == hoje.month
                    ),

                "resumo":
                    _build_block(
                        values
                    ),
            }
        )

    return {
        "ano_inicio":
            ano_inicio,

        "ano_fim":
            ano_fim,

        "pontos":
            pontos,
    }


@cached(
    cache=_cache,
    lock=_cache_lock,
)
def get_clientes_ativos_historico(
    ano_inicio: int,
    ano_fim: int,
    empresa: str = "gestaoclick",
    origem: str = "gestaoclick",
    plano: str = "todos",
    duracao: str = "todos",
) -> dict:
    if (
        ano_inicio not in ALLOWED_YEARS
        or ano_fim not in ALLOWED_YEARS
    ):
        raise ValueError(
            "O histórico está disponível somente para 2024, 2025 e 2026."
        )

    if ano_inicio > ano_fim:
        raise ValueError(
            "ano_inicio não pode ser maior que ano_fim."
        )

    _validate_filters(
        empresa,
        origem,
        plano,
        duracao,
    )

    filter_sql, filter_params = (
        _build_filter_sql(
            empresa,
            origem,
            plano,
            duracao,
        )
    )

    query = text(
        f"""
        SELECT
            ano,
            mes,
            nome_plano,

            SUM(clientes_ativos)
                AS clientes_ativos

        FROM public.indicadores_mensais

        WHERE
            ano BETWEEN :ano_inicio
            AND :ano_fim

            {filter_sql}

        GROUP BY
            ano,
            mes,
            nome_plano

        ORDER BY
            ano,
            mes,
            nome_plano
        """
    )

    params = {
        "ano_inicio":
            ano_inicio,

        "ano_fim":
            ano_fim,

        **filter_params,
    }

    with supabase_engine.connect() as connection:
        rows = connection.execute(
            query,
            params,
        ).mappings().all()

    meses_pt = (
        "",
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
    )

    month_totals: dict[
        tuple[int, int],
        int,
    ] = defaultdict(
        int
    )

    plan_points: list[dict] = []

    plan_names: set[str] = set()

    for row in rows:
        row_year = int(
            row[
                "ano"
            ]
        )

        row_month = int(
            row[
                "mes"
            ]
        )

        plan_name = str(
            row[
                "nome_plano"
            ]
        )

        clients = int(
            row[
                "clientes_ativos"
            ]
            or 0
        )

        month_totals[
            (
                row_year,
                row_month,
            )
        ] += clients

        plan_names.add(
            plan_name
        )

        plan_points.append(
            {
                "ano":
                    row_year,

                "mes":
                    row_month,

                "label":
                    (
                        f"{meses_pt[row_month]}"
                        f"/"
                        f"{str(row_year)[2:]}"
                    ),

                "nome_plano":
                    plan_name,

                "clientes_ativos":
                    clients,
            }
        )

    pontos: list[dict] = []

    ordered_months = sorted(
        month_totals.keys()
    )

    for row_year, row_month in ordered_months:
        current_clients = month_totals[
            (
                row_year,
                row_month,
            )
        ]

        previous = _previous_period(
            row_year,
            row_month,
        )

        previous_clients = (
            month_totals.get(
                previous
            )
            if previous is not None
            else None
        )

        variation = None
        variation_percent = None

        if previous_clients is not None:
            variation = (
                current_clients
                - previous_clients
            )

            if previous_clients != 0:
                variation_percent = round(
                    (
                        variation
                        / previous_clients
                    )
                    * 100,
                    2,
                )

        pontos.append(
            {
                "ano":
                    row_year,

                "mes":
                    row_month,

                "label":
                    (
                        f"{meses_pt[row_month]}"
                        f"/"
                        f"{str(row_year)[2:]}"
                    ),

                "clientes_ativos":
                    current_clients,

                "variacao_clientes":
                    variation,

                "variacao_percentual":
                    variation_percent,
            }
        )

    ordered_plans = sorted(
        plan_names,
        key=lambda name: (
            PLAN_ORDER.get(
                name,
                99,
            ),
            name,
        ),
    )

    plan_order_map = {
        name:
            index
        for index, name in enumerate(
            ordered_plans
        )
    }

    plan_points.sort(
        key=lambda item: (
            item[
                "ano"
            ],
            item[
                "mes"
            ],
            plan_order_map.get(
                item[
                    "nome_plano"
                ],
                999,
            ),
        )
    )

    return {
        "ano_inicio":
            ano_inicio,

        "ano_fim":
            ano_fim,

        "pontos":
            pontos,

        "planos":
            ordered_plans,

        "pontos_planos":
            plan_points,
    }


def get_meta() -> dict:
    hoje = _today_sp()

    primeiro_ano = min(
        ALLOWED_YEARS
    )

    ultimo_ano_permitido = max(
        ALLOWED_YEARS
    )

    if hoje.year < primeiro_ano:
        ultimo_ano = primeiro_ano
        ultimo_mes = 1

    elif hoje.year > ultimo_ano_permitido:
        ultimo_ano = ultimo_ano_permitido
        ultimo_mes = 12

    else:
        ultimo_ano = hoje.year
        ultimo_mes = hoje.month

    return {
        "anos":
            list(
                ALLOWED_YEARS
            ),

        "ultimo_ano":
            ultimo_ano,

        "ultimo_mes":
            ultimo_mes,

        "mes_atual_parcial":
            (
                hoje.year
                in ALLOWED_YEARS
            ),

        "planos":
            list(
                ALL_PLANS
            ),

        "duracoes": [
            {
                "value":
                    code,

                "label":
                    DURATION_LABELS[
                        code
                    ],
            }
            for code in DURATION_ORDER
        ],
    }
