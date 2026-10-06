from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.dashboard_cache_service import cached_daily
from app.services.indicadores_service import get_indicadores_dashboard

router = APIRouter(prefix="/api/indicadores", tags=["Indicadores"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


def _parse_months(value: str) -> list[int]:
    months: list[int] = []
    for item in str(value or "").split(","):
        item = item.strip()
        if not item:
            continue
        try:
            month = int(item)
        except ValueError:
            continue
        if 1 <= month <= 12:
            months.append(month)
    return sorted(set(months))


@router.get("")
def indicadores_dashboard(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024, le=2100),
    meses: str = Query(..., min_length=1),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    plano: str = Query("todos", max_length=120),
    duracao: str = Query("todos", max_length=10),
):
    selected_months = _parse_months(meses)
    if not selected_months:
        raise HTTPException(status_code=400, detail="Informe ao menos um mês.")

    normalized_plan = str(plano or "todos").strip() or "todos"
    normalized_duration = str(duracao or "todos").strip().upper()
    if normalized_duration == "TODOS":
        normalized_duration = "todos"

    params = {
        "ano": ano,
        "meses": ",".join(str(month) for month in selected_months),
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "plano": normalized_plan,
        "duracao": normalized_duration,
    }

    try:
        return cached_daily(
            page="indicadores.executivo.3.30.0",
            params=params,
            builder=lambda: get_indicadores_dashboard(
                ano=ano,
                meses=selected_months,
                empresa=empresa,
                origem=origem,
                pagador=pagador,
                plano=normalized_plan,
                duracao=normalized_duration,
            ),
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível carregar os indicadores: {type(exc).__name__}: {exc}",
        ) from exc
