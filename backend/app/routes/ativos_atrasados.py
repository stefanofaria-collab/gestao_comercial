from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.ativos_atrasados_service import (
    get_active_client_count_for_month,
    get_ativos_atrasados_dashboard,
)
from app.services.dashboard_cache_service import cached_daily

router = APIRouter(prefix="/api/ativos-atrasados", tags=["Ativos e Atrasados"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]
CACHE_VERSION = "3.23.0"
MONTHS = ("Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez")


def _build_dashboard(*, empresa: str, origem: str, pagador: str):
    payload = get_ativos_atrasados_dashboard(empresa=empresa, origem=origem, pagador=pagador)

    # A fotografia do mês atual é sempre conferida diretamente na origem. Isso
    # evita que a virada do mês fique presa ao último mês disponível no snapshot.
    today = date.today()
    current_active = get_active_client_count_for_month(
        today.year,
        today.month,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )

    history = [dict(row) for row in (payload.get("historico_ativos") or [])]
    current = next(
        (row for row in history if int(row.get("ano") or 0) == today.year and int(row.get("mes") or 0) == today.month),
        None,
    )

    if current is None:
        current = {
            "ano": today.year,
            "mes": today.month,
            "label": f"{MONTHS[today.month - 1]}/{str(today.year)[-2:]}",
            "clientes_ativos": current_active,
            "saldo_clientes": None,
            "ativos_mais_30": current_active,
            "ativos_mais_media": current_active,
            "atrasados_1_30": 0,
            "dentro_media": 0,
        }
        history.append(current)
    else:
        old_active = int(current.get("clientes_ativos") or 0)
        overdue_30 = int(current.get("atrasados_1_30") or max(int(current.get("ativos_mais_30") or old_active) - old_active, 0))
        within_average = int(current.get("dentro_media") or max(int(current.get("ativos_mais_media") or old_active) - old_active, 0))
        current["clientes_ativos"] = current_active
        current["ativos_mais_30"] = current_active + overdue_30
        current["ativos_mais_media"] = current_active + within_average

    history.sort(key=lambda row: (int(row.get("ano") or 0), int(row.get("mes") or 0)))
    previous = None
    for row in history:
        active = int(row.get("clientes_ativos") or 0)
        row["saldo_clientes"] = None if previous is None else active - previous
        previous = active

    payload["historico_ativos"] = history
    payload["historico_tres_linhas"] = [dict(row) for row in history]

    same_month = {int(row["ano"]): int(row.get("clientes_ativos") or 0) for row in history if int(row.get("mes") or 0) == today.month}
    comparisons = []
    for year in (2025, 2024):
        if year in same_month:
            value = same_month[year]
            comparisons.append(
                {
                    "ano": year,
                    "clientes_ativos": value,
                    "diferenca": current_active - value,
                    "percentual": round(((current_active - value) / value) * 100, 2) if value else None,
                }
            )
    payload["yoy"] = {
        "mes": today.month,
        "mes_label": MONTHS[today.month - 1],
        "ano_atual": today.year,
        "clientes_ativos_atual": current_active,
        "comparacoes": comparisons,
    }
    payload["data_referencia"] = today.isoformat()
    return payload


@router.get("")
def ativos_atrasados(
    background_tasks: BackgroundTasks,
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = {
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "versao": CACHE_VERSION,
    }
    try:
        return cached_daily(
            page="ativos_atrasados.dashboard",
            params=params,
            builder=lambda: _build_dashboard(empresa=empresa, origem=origem, pagador=pagador),
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível carregar Ativos e Atrasados. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc
