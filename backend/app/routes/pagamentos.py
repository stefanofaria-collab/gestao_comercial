from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.dashboard_cache_service import cached_daily
from app.services.pagamentos_service import get_pagamentos_dashboard

router = APIRouter(prefix="/api/pagamentos", tags=["Pagamentos"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


@router.get("")
def pagamentos_dashboard(
    background_tasks: BackgroundTasks,
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = {
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }

    try:
        return cached_daily(
            page="pagamentos.dashboard",
            params=params,
            builder=lambda: get_pagamentos_dashboard(
                empresa=empresa,
                origem=origem,
                pagador=pagador,
            ),
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível carregar Pagamentos. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc
