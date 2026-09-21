from __future__ import annotations

from sqlalchemy import text

from app.constants import (
    ALLOWED_COMPANY_FILTERS,
    ALLOWED_DURATION_FILTERS,
    ALLOWED_ORIGIN_FILTERS,
    ALLOWED_YEARS,
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


def _validate_filters(
    ano_inicio: int,
    ano_fim: int,
    empresa: str,
    origem: str,
    plano: str,
    duracao: str,
) -> None:
    if ano_inicio not in ALLOWED_YEARS:
        raise ValueError(
            "Ano inicial inválido."
        )

    if ano_fim not in ALLOWED_YEARS:
        raise ValueError(
            "Ano final inválido."
        )

    if ano_inicio > ano_fim:
        raise ValueError(
            "ano_inicio não pode ser maior que ano_fim."
        )

    if empresa not in ALLOWED_COMPANY_FILTERS:
        raise ValueError(
            "Filtro de empresa inválido."
        )

    if origem not in ALLOWED_ORIGIN_FILTERS:
        raise ValueError(
            "Filtro de origem inválido."
        )

    if duracao not in ALLOWED_DURATION_FILTERS:
        raise ValueError(
            "Filtro de duração inválido."
        )

    if plano != "todos" and plano not in PLAN_ORDER:
        raise ValueError(
            "Filtro de plano inválido."
        )


def _build_filters(
    empresa: str,
    origem: str,
    plano: str,
    duracao: str,
) -> tuple[str, dict]:
    clauses: list[str] = []
    params: dict = {}

    if empresa == "gestaoclick":
        clauses.append(
            "empresa = :empresa"
        )
        params["empresa"] = "GestãoClick"

    elif empresa == "clicknotas":
        clauses.append(
            "empresa = :empresa"
        )
        params["empresa"] = "ClickNotas"

    if origem == "gestaoclick":
        clauses.append(
            "origem = :origem"
        )
        params["origem"] = "GestãoClick"

    elif origem == "parceiro":
        clauses.append(
            "origem = :origem"
        )
        params["origem"] = "Parceiro"

    if plano != "todos":
        clauses.append(
            "nome_plano = :plano"
        )
        params["plano"] = plano

    if duracao != "todos":
        clauses.append(
            "duracao = :duracao"
        )
        params["duracao"] = duracao

    if not clauses:
        return "", params

    return (
        " AND " + " AND ".join(clauses),
        params,
    )


def _percentage(
    numerator: float,
    denominator: float,
) -> float:
    if not denominator:
        return 0.0

    return round(
        (numerator / denominator) * 100,
        2,
    )


def get_renewal_history(
    ano_inicio: int = 2024,
    ano_fim: int = 2026,
    empresa: str = "gestaoclick",
    origem: str = "gestaoclick",
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
        )
    )

    query = text(
        f"""
        SELECT
            ano,
            mes,
            SUM(renovacoes_previstas) AS renovacoes_previstas,
            SUM(renovacoes_clientes) AS renovacoes_clientes,
            SUM(receita_vencendo) AS receita_vencendo,
            SUM(renovacoes_receita) AS renovacoes_receita

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

    pontos: list[dict] = []

    for row in rows:
        ano = int(
            row["ano"]
        )

        mes = int(
            row["mes"]
        )

        renovacoes_previstas = int(
            row["renovacoes_previstas"]
            or 0
        )

        renovacoes_clientes = int(
            row["renovacoes_clientes"]
            or 0
        )

        receita_vencendo = float(
            row["receita_vencendo"]
            or 0
        )

        renovacoes_receita = float(
            row["renovacoes_receita"]
            or 0
        )

        pontos.append(
            {
                "ano":
                    ano,

                "mes":
                    mes,

                "label":
                    (
                        f"{MONTH_LABELS[mes]}"
                        f"/"
                        f"{str(ano)[-2:]}"
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
