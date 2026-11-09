"""Atualiza no Supabase snapshots de filtros padrao (runner com acesso ao RDS).

Executar apos sincronizar_indicadores.py. Não altera dados de origem.
Outros filtros continuam precisando de um mecanismo de sincronizacao adequado.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.dashboard_cache_service import save_snapshot  # noqa: E402
from app.services.global_filter_context import (  # noqa: E402
    cache_context,
    pop_request_filters,
    push_request_filters,
)
from app.services.churn_service import get_churn_dashboard  # noqa: E402
from app.services.indicadores_service import get_indicadores_dashboard  # noqa: E402
from app.services.intranet2_service import get_filter_options  # noqa: E402

CACHE_SCHEMA = "3.28.2"


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _save(page: str, params: dict, build) -> None:
    # O frontend envia ano_global/meses_global mesmo para o filtro padrao.
    # O runner precisa aplicar o mesmo contexto antes de construir a chave.
    year = params.get("ano")
    months = params.get("meses", params.get("mes"))
    tokens = push_request_filters(
        raw_months=str(months) if months is not None else None,
        raw_year=str(year) if year is not None else None,
        plan=str(params.get("plano") or "todos"),
        duration=str(params.get("duracao") or "todos"),
    )
    try:
        normalized = {**params, **cache_context(), "_cache_schema": CACHE_SCHEMA}
        payload = build()
        save_snapshot(page, normalized, payload)
        print(f"Snapshot atualizado: {page}", flush=True)
    finally:
        pop_request_filters(tokens)


def main() -> None:
    parser = argparse.ArgumentParser(description="Atualiza snapshots de dashboards no Supabase")
    parser.add_argument("--ano", type=int)
    parser.add_argument("--mes", type=int)
    args = parser.parse_args()

    hoje = datetime.now(ZoneInfo("America/Sao_Paulo"))
    ano = args.ano or hoje.year
    mes = args.mes or hoje.month
    if not 2024 <= ano <= 2100 or not 1 <= mes <= 12:
        parser.error("Ano ou mes invalido")

    periodos = [_previous_month(ano, mes), (ano, mes)]
    falhas = []

    for periodo_ano, periodo_mes in periodos:
        churn_params = {
            "ano": periodo_ano, "mes": periodo_mes,
            "empresa": "todos", "origem": "todos", "pagador": "todos",
        }
        try:
            _save(
                "churn.dashboard.cohort_m24.contacts.v2",
                churn_params,
                lambda a=periodo_ano, m=periodo_mes: get_churn_dashboard(
                    year=a, month=m, empresa="todos", origem="todos", pagador="todos"
                ),
            )
        except Exception:
            logging.exception("Falha ao sincronizar churn: %s-%02d", periodo_ano, periodo_mes)
            falhas.append(f"churn {periodo_ano}-{periodo_mes:02d}")

        indicadores_params = {
            "ano": periodo_ano, "meses": str(periodo_mes),
            "empresa": "todos", "origem": "todos", "pagador": "todos",
            "plano": "todos", "duracao": "todos",
        }
        try:
            _save(
                "indicadores.executivo.3.30.0",
                indicadores_params,
                lambda a=periodo_ano, m=periodo_mes: get_indicadores_dashboard(
                    ano=a, meses=[m], empresa="todos", origem="todos",
                    pagador="todos", plano="todos", duracao="todos",
                ),
            )
        except Exception:
            logging.exception("Falha ao sincronizar indicadores: %s-%02d", periodo_ano, periodo_mes)
            falhas.append(f"indicadores {periodo_ano}-{periodo_mes:02d}")

    try:
        _save("intranet2.options.3.27.2", {}, get_filter_options)
    except Exception:
        logging.exception("Falha ao sincronizar opcoes da Intranet 2.0")
        falhas.append("intranet2.options")

    if falhas:
        print("Snapshots pendentes: " + ", ".join(falhas), file=sys.stderr)
        raise SystemExit(1)

    print("Todos os snapshots padrao foram sincronizados.", flush=True)


if __name__ == "__main__":
    main()
