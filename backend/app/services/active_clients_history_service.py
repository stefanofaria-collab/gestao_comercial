from __future__ import annotations

from collections import defaultdict

from sqlalchemy import text

from app.constants import (
    ALLOWED_COMPANY_FILTERS,
    ALLOWED_DURATION_FILTERS,
    ALLOWED_ORIGIN_FILTERS,
    ALLOWED_YEARS,
    DURATION_LABELS,
    DURATION_ORDER,
    PLAN_ORDER,
)
from app.database import supabase_engine


MONTH_LABELS = (
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

SEGMENT_ORDER = (
    "GestãoClick",
    "ClickNotas",
    "GestãoClick Parceiros",
    "ClickNotas Parceiros",
)


def _validate_filters(
    ano_inicio: int,
    ano_fim: int,
    empresa: str,
    origem: str,
    plano: str,
    duracao: str,
) -> None:
    if ano_inicio not in ALLOWED_YEARS:
        raise ValueError("Ano inicial inválido.")

    if ano_fim not in ALLOWED_YEARS:
        raise ValueError("Ano final inválido.")

    if ano_inicio > ano_fim:
        raise ValueError(
            "ano_inicio não pode ser maior que ano_fim."
        )

    if empresa not in ALLOWED_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")

    if origem not in ALLOWED_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")

    if duracao not in ALLOWED_DURATION_FILTERS:
        raise ValueError("Filtro de duração inválido.")

    if plano != "todos" and plano not in PLAN_ORDER:
        raise ValueError("Filtro de plano inválido.")


def _build_filters(
    empresa: str,
    origem: str,
    plano: str,
    duracao: str,
    *,
    include_company: bool = True,
    include_duration: bool = True,
) -> tuple[str, dict]:
    clauses: list[str] = []
    params: dict = {}

    if include_company:
        if empresa == "gestaoclick":
            clauses.append("empresa = :empresa")
            params["empresa"] = "GestãoClick"

        elif empresa == "clicknotas":
            clauses.append("empresa = :empresa")
            params["empresa"] = "ClickNotas"

    if origem == "gestaoclick":
        clauses.append("origem = :origem")
        params["origem"] = "GestãoClick"

    elif origem == "parceiro":
        clauses.append("origem = :origem")
        params["origem"] = "Parceiro"

    if plano != "todos":
        clauses.append("nome_plano = :plano")
        params["plano"] = plano

    if (
        include_duration
        and duracao != "todos"
    ):
        clauses.append("duracao = :duracao")
        params["duracao"] = duracao

    if not clauses:
        return "", params

    return (
        " AND "
        + " AND ".join(
            clauses
        ),
        params,
    )


def _previous_period(
    year: int,
    month: int,
) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12

    return year, month - 1


def _label(
    year: int,
    month: int,
) -> str:
    return (
        f"{MONTH_LABELS[month]}"
        f"/"
        f"{str(year)[-2:]}"
    )


def _variation(
    current: int,
    previous: int | None,
) -> tuple[int | None, float | None]:
    if previous is None:
        return None, None

    difference = (
        current
        - previous
    )

    if previous == 0:
        return (
            difference,
            None,
        )

    return (
        difference,
        round(
            (
                difference
                / previous
            )
            * 100,
            2,
        ),
    )


def _segment_name(
    company: str,
    origin: str,
) -> str:
    if company == "GestãoClick":
        if origin == "Parceiro":
            return "GestãoClick Parceiros"

        return "GestãoClick"

    if company == "ClickNotas":
        if origin == "Parceiro":
            return "ClickNotas Parceiros"

        return "ClickNotas"

    return (
        f"{company}"
        f" - "
        f"{origin}"
    )


def get_active_clients_history(
    ano_inicio: int = 2024,
    ano_fim: int = 2026,
    empresa: str = "todos",
    origem: str = "todos",
    plano: str = "todos",
    duracao: str = "todos",
) -> dict:
    _validate_filters(
        ano_inicio=ano_inicio,
        ano_fim=ano_fim,
        empresa=empresa,
        origem=origem,
        plano=plano,
        duracao=duracao,
    )

    filter_sql, filter_params = (
        _build_filters(
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
            include_company=True,
            include_duration=True,
        )
    )

    # O gráfico "Clientes ativos por plano e duração" possui
    # seletores locais de empresa e duração. Por isso, para esse
    # gráfico, carregamos todas as empresas e todas as durações,
    # mantendo os demais filtros globais, como origem e plano.
    plan_filter_sql, plan_filter_params = (
        _build_filters(
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
            include_company=False,
            include_duration=False,
        )
    )

    total_query = text(
        f"""
        SELECT
            ano,
            mes,
            SUM(clientes_ativos) AS clientes_ativos
        FROM public.indicadores_mensais
        WHERE
            ano BETWEEN :ano_inicio AND :ano_fim
            {filter_sql}
        GROUP BY
            ano,
            mes
        ORDER BY
            ano,
            mes
        """
    )

    segment_query = text(
        f"""
        SELECT
            ano,
            mes,
            empresa,
            origem,
            SUM(clientes_ativos) AS clientes_ativos
        FROM public.indicadores_mensais
        WHERE
            ano BETWEEN :ano_inicio AND :ano_fim
            {filter_sql}
        GROUP BY
            ano,
            mes,
            empresa,
            origem
        ORDER BY
            ano,
            mes,
            empresa,
            origem
        """
    )

    plan_duration_query = text(
        f"""
        SELECT
            ano,
            mes,
            empresa,
            nome_plano,
            duracao,
            SUM(clientes_ativos) AS clientes_ativos
        FROM public.indicadores_mensais
        WHERE
            ano BETWEEN :ano_inicio AND :ano_fim
            {plan_filter_sql}
        GROUP BY
            ano,
            mes,
            empresa,
            nome_plano,
            duracao
        ORDER BY
            ano,
            mes,
            empresa,
            nome_plano,
            duracao
        """
    )

    common_params = {
        "ano_inicio":
            ano_inicio,

        "ano_fim":
            ano_fim,
    }

    with supabase_engine.connect() as connection:
        total_rows = connection.execute(
            total_query,
            {
                **common_params,
                **filter_params,
            },
        ).mappings().all()

        segment_rows = connection.execute(
            segment_query,
            {
                **common_params,
                **filter_params,
            },
        ).mappings().all()

        plan_duration_rows = connection.execute(
            plan_duration_query,
            {
                **common_params,
                **plan_filter_params,
            },
        ).mappings().all()

    total_map: dict[
        tuple[int, int],
        int,
    ] = {}

    for row in total_rows:
        key = (
            int(
                row["ano"]
            ),
            int(
                row["mes"]
            ),
        )

        total_map[
            key
        ] = int(
            row[
                "clientes_ativos"
            ]
            or 0
        )

    pontos: list[dict] = []

    for key in sorted(
        total_map
    ):
        year, month = key

        current = total_map[
            key
        ]

        previous = total_map.get(
            _previous_period(
                year,
                month,
            )
        )

        (
            difference,
            difference_percent,
        ) = _variation(
            current,
            previous,
        )

        pontos.append(
            {
                "ano":
                    year,

                "mes":
                    month,

                "label":
                    _label(
                        year,
                        month,
                    ),

                "clientes_ativos":
                    current,

                "variacao_clientes":
                    difference,

                "variacao_percentual":
                    difference_percent,
            }
        )

    segment_maps: dict[
        str,
        dict[
            tuple[int, int],
            int,
        ],
    ] = defaultdict(
        dict
    )

    for row in segment_rows:
        year = int(
            row["ano"]
        )

        month = int(
            row["mes"]
        )

        segment = (
            _segment_name(
                str(
                    row[
                        "empresa"
                    ]
                ),
                str(
                    row[
                        "origem"
                    ]
                ),
            )
        )

        segment_maps[
            segment
        ][
            (
                year,
                month,
            )
        ] = int(
            row[
                "clientes_ativos"
            ]
            or 0
        )

    available_segments = [
        segment
        for segment in SEGMENT_ORDER
        if segment in segment_maps
    ]

    extra_segments = sorted(
        segment
        for segment in segment_maps
        if segment not in SEGMENT_ORDER
    )

    available_segments.extend(
        extra_segments
    )

    pontos_segmentos: list[
        dict
    ] = []

    for segment in available_segments:
        series_map = (
            segment_maps[
                segment
            ]
        )

        for key in sorted(
            series_map
        ):
            year, month = key

            current = (
                series_map[
                    key
                ]
            )

            previous = series_map.get(
                _previous_period(
                    year,
                    month,
                )
            )

            (
                difference,
                difference_percent,
            ) = _variation(
                current,
                previous,
            )

            pontos_segmentos.append(
                {
                    "ano":
                        year,

                    "mes":
                        month,

                    "label":
                        _label(
                            year,
                            month,
                        ),

                    "segmento":
                        segment,

                    "clientes_ativos":
                        current,

                    "variacao_clientes":
                        difference,

                    "variacao_percentual":
                        difference_percent,
                }
            )

    plan_names: set[str] = set()
    duration_codes: set[str] = set()
    company_names: set[str] = set()

    pontos_planos_duracoes: list[
        dict
    ] = []

    for row in plan_duration_rows:
        year = int(
            row["ano"]
        )

        month = int(
            row["mes"]
        )

        company_name = str(
            row["empresa"]
        )

        plan_name = str(
            row["nome_plano"]
        )

        duration_code = str(
            row["duracao"]
        )

        company_names.add(
            company_name
        )

        plan_names.add(
            plan_name
        )

        duration_codes.add(
            duration_code
        )

        pontos_planos_duracoes.append(
            {
                "ano":
                    year,

                "mes":
                    month,

                "label":
                    _label(
                        year,
                        month,
                    ),

                "empresa":
                    company_name,

                "nome_plano":
                    plan_name,

                "duracao":
                    duration_code,

                "duracao_label":
                    DURATION_LABELS.get(
                        duration_code,
                        duration_code,
                    ),

                "clientes_ativos":
                    int(
                        row[
                            "clientes_ativos"
                        ]
                        or 0
                    ),
            }
        )

    ordered_companies = [
        company_name
        for company_name in (
            "GestãoClick",
            "ClickNotas",
        )
        if company_name in company_names
    ]

    extra_companies = sorted(
        company_name
        for company_name in company_names
        if company_name
        not in {
            "GestãoClick",
            "ClickNotas",
        }
    )

    ordered_companies.extend(
        extra_companies
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

    ordered_durations = sorted(
        duration_codes,
        key=lambda code: (
            DURATION_ORDER.get(
                code,
                99,
            ),
            code,
        ),
    )

    company_order_map = {
        name:
            index
        for index, name in enumerate(
            ordered_companies
        )
    }

    plan_order_map = {
        name:
            index
        for index, name in enumerate(
            ordered_plans
        )
    }

    duration_order_map = {
        code:
            index
        for index, code in enumerate(
            ordered_durations
        )
    }

    pontos_planos_duracoes.sort(
        key=lambda item: (
            item[
                "ano"
            ],
            item[
                "mes"
            ],
            company_order_map.get(
                item[
                    "empresa"
                ],
                999,
            ),
            plan_order_map.get(
                item[
                    "nome_plano"
                ],
                999,
            ),
            duration_order_map.get(
                item[
                    "duracao"
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

        "segmentos":
            available_segments,

        "pontos_segmentos":
            pontos_segmentos,

        "empresas":
            ordered_companies,

        "planos":
            ordered_plans,

        "duracoes": [
            {
                "value":
                    code,

                "label":
                    DURATION_LABELS.get(
                        code,
                        code,
                    ),
            }
            for code in ordered_durations
        ],

        "pontos_planos_duracoes":
            pontos_planos_duracoes,
    }
