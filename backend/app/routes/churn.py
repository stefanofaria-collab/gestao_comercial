from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.churn_service import get_churn_dashboard, get_churn_renewal_history
from app.services.dashboard_cache_service import cached_daily

router = APIRouter(prefix="/api/churn", tags=["Churn"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


def _cached_handle(background_tasks, page, params, builder):
    try:
        return cached_daily(
            page=page,
            params=params,
            builder=builder,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Não foi possível carregar o snapshot do churn. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get("")
def churn_dashboard(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = {
        "ano": ano,
        "mes": mes,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }
    return _cached_handle(
        background_tasks,
        "churn.dashboard.cohort_m24.contacts.v2",
        params,
        lambda: get_churn_dashboard(
            year=ano,
            month=mes,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        ),
    )


@router.get("/renovacoes-historico")
def churn_renewal_history(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    dimensao: Literal["plano", "duracao"] = Query(...),
    valor: str = Query(..., min_length=1),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = {
        "ano": ano,
        "mes": mes,
        "dimensao": dimensao,
        "valor": valor,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }
    return _cached_handle(
        background_tasks,
        "churn.renovacoes_historico",
        params,
        lambda: get_churn_renewal_history(
            year=ano,
            month=mes,
            dimension=dimensao,
            value=valor,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        ),
    )
