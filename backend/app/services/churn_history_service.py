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
) -> tuple[str, dict]:
    clauses: list[str] = []
    params: dict = {}

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

    if duracao != "todos":
        clauses.append("duracao = :duracao")
        params["duracao"] = duracao

    if not clauses:
        return "", params

    return " AND " + " AND ".join(clauses), params


def _label(
    year: int,
    month: int,
) -> str:
    return (
        f"{MONTH_LABELS[month]}"
        f"/"
        f"{str(year)[-2:]}"
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


def get_churn_history(
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

    filter_sql, filter_params = _build_filters(
        empresa=empresa,
        origem=origem,
        plano=plano,
        duracao=duracao,
    )

    monthly_query = text(
        f"""
        SELECT
            ano,
            mes,
            SUM(clientes_ativos) AS clientes_ativos,
            SUM(renovacoes_previstas) AS renovacoes_previstas,
            SUM(receita_vencendo) AS receita_vencendo,
            SUM(churn_clientes) AS churn_clientes,
            SUM(churn_receita) AS churn_receita
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

    plan_query = text(
        f"""
        SELECT
            ano,
            mes,
            nome_plano,
            SUM(churn_clientes) AS churn_clientes
        FROM public.indicadores_mensais
        WHERE
            ano BETWEEN :ano_inicio AND :ano_fim
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
        "ano_inicio": ano_inicio,
        "ano_fim": ano_fim,
        **filter_params,
    }

    with supabase_engine.connect() as connection:
        monthly_rows = connection.execute(
            monthly_query,
            params,
        ).mappings().all()

        plan_rows = connection.execute(
            plan_query,
            params,
        ).mappings().all()

    pontos: list[dict] = []

    for row in monthly_rows:
        year = int(row["ano"])
        month = int(row["mes"])

        active_clients = int(
            row["clientes_ativos"]
            or 0
        )

        renewals_expected = int(
            row["renovacoes_previstas"]
            or 0
        )

        expiring_revenue = float(
            row["receita_vencendo"]
            or 0
        )

        churn_clients = int(
            row["churn_clientes"]
            or 0
        )

        churn_revenue = float(
            row["churn_receita"]
            or 0
        )

        pontos.append(
            {
                "ano": year,
                "mes": month,
                "label": _label(
                    year,
                    month,
                ),
                "churn_clientes": churn_clients,
                "churn_receita": round(
                    churn_revenue,
                    2,
                ),
                "percentual_churn_clientes_ativos": _percentage(
                    churn_clients,
                    active_clients,
                ),
                "percentual_churn_vencimentos": _percentage(
                    churn_clients,
                    renewals_expected,
                ),
                "percentual_churn_receita_vencendo": _percentage(
                    churn_revenue,
                    expiring_revenue,
                ),
            }
        )

    plan_names: set[str] = set()
    pontos_planos: list[dict] = []

    for row in plan_rows:
        year = int(row["ano"])
        month = int(row["mes"])
        plan_name = str(
            row["nome_plano"]
        )

        plan_names.add(
            plan_name
        )

        pontos_planos.append(
            {
                "ano": year,
                "mes": month,
                "label": _label(
                    year,
                    month,
                ),
                "nome_plano": plan_name,
                "churn_clientes": int(
                    row["churn_clientes"]
                    or 0
                ),
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
        name: index
        for index, name in enumerate(
            ordered_plans
        )
    }

    pontos_planos.sort(
        key=lambda item: (
            item["ano"],
            item["mes"],
            plan_order_map.get(
                item["nome_plano"],
                999,
            ),
        )
    )

    return {
        "ano_inicio": ano_inicio,
        "ano_fim": ano_fim,
        "pontos": pontos,
        "planos": ordered_plans,
        "pontos_planos": pontos_planos,
    }
