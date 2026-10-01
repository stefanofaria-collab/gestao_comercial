from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.ativos_atrasados_service import get_ativos_atrasados_dashboard
from app.services.dashboard_cache_service import cached_daily

router = APIRouter(prefix="/api/ativos-atrasados", tags=["Ativos e Atrasados"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


@router.get("")
def ativos_atrasados(
    background_tasks: BackgroundTasks,
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = {"empresa": empresa, "origem": origem, "pagador": pagador}
    try:
        return cached_daily(
            page="ativos_atrasados.dashboard",
            params=params,
            builder=lambda: get_ativos_atrasados_dashboard(
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
            detail=f"Não foi possível carregar Ativos e Atrasados. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc
