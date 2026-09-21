from __future__ import annotations

import argparse
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


BACKEND_DIR = Path(__file__).resolve().parent.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from sqlalchemy import text  # noqa: E402

from app.constants import EXCLUDED_COMPANY_IDS  # noqa: E402
from app.database import source_engine, supabase_engine  # noqa: E402
from app.source_queries import (  # noqa: E402
    CHURN_SOURCE_SQL,
    CLIENTES_ATIVOS_SOURCE_SQL,
    RENOVACOES_SOURCE_SQL,
    VENCIMENTOS_SOURCE_SQL,
)


DELETE_MONTH_SQL = text(
    """
    DELETE FROM public.indicadores_mensais
    WHERE ano = :ano AND mes = :mes
    """
)


INSERT_MONTH_SQL = text(
    """
    INSERT INTO public.indicadores_mensais (
        ano,
        mes,
        data_inicio,
        data_fim,
        empresa,
        origem,
        nome_plano,
        duracao,
        clientes_ativos,
        renovacoes_previstas,
        receita_vencendo,
        renovacoes_clientes,
        renovacoes_receita,
        churn_clientes,
        churn_receita,
        atualizado_em
    )
    VALUES (
        :ano,
        :mes,
        :data_inicio,
        :data_fim,
        :empresa,
        :origem,
        :nome_plano,
        :duracao,
        :clientes_ativos,
        :renovacoes_previstas,
        :receita_vencendo,
        :renovacoes_clientes,
        :renovacoes_receita,
        :churn_clientes,
        :churn_receita,
        NOW()
    )
    """
)


def today_sp() -> date:
    return datetime.now(
        ZoneInfo("America/Sao_Paulo")
    ).date()


def month_bounds(
    ano: int,
    mes: int,
) -> tuple[date, date]:
    inicio = date(ano, mes, 1)

    if mes == 12:
        fim = date(ano + 1, 1, 1)
    else:
        fim = date(ano, mes + 1, 1)

    return inicio, fim


def previous_month(
    ano: int,
    mes: int,
) -> tuple[int, int]:
    if mes == 1:
        return ano - 1, 12

    return ano, mes - 1


def run_source_query(
    query,
    data_inicio: date,
    data_fim: date,
):
    params = {
        "data_inicio": data_inicio,
        "data_fim": data_fim,
        "excluidos": EXCLUDED_COMPANY_IDS,
    }

    with source_engine.connect() as connection:
        return connection.execute(
            query,
            params,
        ).mappings().all()


def make_key(row) -> tuple[str, str, str, str]:
    return (
        row["empresa"],
        row["origem"],
        row["nome_plano"],
        row["duracao"],
    )


def collect_month(
    ano: int,
    mes: int,
) -> list[dict]:
    data_inicio, data_fim = month_bounds(
        ano,
        mes,
    )

    print("=" * 80)
    print(f"Processando {mes:02d}/{ano}")
    print(f"Período: {data_inicio} até {data_fim}")
    print("=" * 80)

    print("[1/4] Clientes ativos...")
    ativos_rows = run_source_query(
        CLIENTES_ATIVOS_SOURCE_SQL,
        data_inicio,
        data_fim,
    )

    print("[2/4] Vencimentos...")
    vencimentos_rows = run_source_query(
        VENCIMENTOS_SOURCE_SQL,
        data_inicio,
        data_fim,
    )

    print("[3/4] Renovações...")
    renovacoes_rows = run_source_query(
        RENOVACOES_SOURCE_SQL,
        data_inicio,
        data_fim,
    )

    print("[4/4] Churn...")
    churn_rows = run_source_query(
        CHURN_SOURCE_SQL,
        data_inicio,
        data_fim,
    )

    dados: dict[
        tuple[str, str, str, str],
        dict,
    ] = {}

    def ensure_row(
        key: tuple[str, str, str, str],
    ) -> dict:
        if key not in dados:
            empresa, origem, nome_plano, duracao = key

            dados[key] = {
                "ano": ano,
                "mes": mes,
                "data_inicio": data_inicio,
                "data_fim": data_fim,
                "empresa": empresa,
                "origem": origem,
                "nome_plano": nome_plano,
                "duracao": duracao,
                "clientes_ativos": 0,
                "renovacoes_previstas": 0,
                "receita_vencendo": 0.0,
                "renovacoes_clientes": 0,
                "renovacoes_receita": 0.0,
                "churn_clientes": 0,
                "churn_receita": 0.0,
            }

        return dados[key]

    for row in ativos_rows:
        target = ensure_row(
            make_key(row)
        )
        target["clientes_ativos"] = int(
            row["clientes_ativos"] or 0
        )

    for row in vencimentos_rows:
        target = ensure_row(
            make_key(row)
        )
        target["renovacoes_previstas"] = int(
            row["renovacoes_previstas"] or 0
        )
        target["receita_vencendo"] = float(
            row["receita_vencendo"] or 0
        )

    for row in renovacoes_rows:
        target = ensure_row(
            make_key(row)
        )
        target["renovacoes_clientes"] = int(
            row["renovacoes_clientes"] or 0
        )
        target["renovacoes_receita"] = float(
            row["renovacoes_receita"] or 0
        )

    for row in churn_rows:
        target = ensure_row(
            make_key(row)
        )
        target["churn_clientes"] = int(
            row["churn_clientes"] or 0
        )
        target["churn_receita"] = float(
            row["churn_receita"] or 0
        )

    rows = list(
        dados.values()
    )

    print(
        f"[OK] {len(rows)} linhas consolidadas."
    )

    return rows


def save_month(
    ano: int,
    mes: int,
    rows: list[dict],
) -> None:
    with supabase_engine.begin() as connection:
        connection.execute(
            DELETE_MONTH_SQL,
            {
                "ano": ano,
                "mes": mes,
            },
        )

        if rows:
            connection.execute(
                INSERT_MONTH_SQL,
                rows,
            )

    print(
        f"[OK] {mes:02d}/{ano} gravado no Supabase."
    )


def sync_month(
    ano: int,
    mes: int,
) -> None:
    rows = collect_month(
        ano,
        mes,
    )

    save_month(
        ano,
        mes,
        rows,
    )


def historical_months() -> list[tuple[int, int]]:
    hoje = today_sp()

    start = date(
        2024,
        1,
        1,
    )

    current = date(
        hoje.year,
        hoje.month,
        1,
    )

    months: list[
        tuple[int, int]
    ] = []

    cursor = start

    while cursor <= current:
        if cursor.year > 2026:
            break

        months.append(
            (
                cursor.year,
                cursor.month,
            )
        )

        if cursor.month == 12:
            cursor = date(
                cursor.year + 1,
                1,
                1,
            )
        else:
            cursor = date(
                cursor.year,
                cursor.month + 1,
                1,
            )

    return months


def run_daily() -> None:
    hoje = today_sp()

    atual = (
        hoje.year,
        hoje.month,
    )

    anterior = previous_month(
        hoje.year,
        hoje.month,
    )

    periods: list[
        tuple[int, int]
    ] = []

    if anterior[0] >= 2024:
        periods.append(
            anterior
        )

    if atual[0] <= 2026:
        periods.append(
            atual
        )

    for ano, mes in periods:
        sync_month(
            ano,
            mes,
        )


def run_historical() -> None:
    for ano, mes in historical_months():
        sync_month(
            ano,
            mes,
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Sincroniza os indicadores do MySQL "
            "corporativo para o Supabase."
        )
    )

    parser.add_argument(
        "--modo",
        choices=[
            "diario",
            "historico",
            "mes",
        ],
        default="diario",
    )

    parser.add_argument(
        "--ano",
        type=int,
    )

    parser.add_argument(
        "--mes",
        type=int,
    )

    args = parser.parse_args()

    if args.modo == "historico":
        run_historical()
        return

    if args.modo == "mes":
        if args.ano is None or args.mes is None:
            parser.error(
                "--modo mes exige --ano e --mes."
            )

        if not 1 <= args.mes <= 12:
            parser.error(
                "--mes deve estar entre 1 e 12."
            )

        sync_month(
            args.ano,
            args.mes,
        )
        return

    run_daily()


if __name__ == "__main__":
    main()
