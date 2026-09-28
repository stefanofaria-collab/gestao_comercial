from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.churn_service import get_churn_dashboard, get_churn_renewal_history


router = APIRouter(prefix="/api/churn", tags=["Churn"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


@router.get("")
def churn_dashboard(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    try:
        return get_churn_dashboard(
            year=ano,
            month=mes,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar o churn no MySQL de origem. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get("/renovacoes-historico")
def churn_renewal_history(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    dimensao: Literal["plano", "duracao"] = Query(...),
    valor: str = Query(..., min_length=1),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    try:
        return get_churn_renewal_history(
            year=ano,
            month=mes,
            dimension=dimensao,
            value=valor,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar a evolução de renovações no MySQL de origem. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc
