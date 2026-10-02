from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.churn_score_service import (
    get_churn_score_dashboard,
    get_churn_score_meta,
    train_churn_score_model,
)

router = APIRouter(prefix="/api/churn-score", tags=["Churn Score"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


@router.get("/meta")
def churn_score_meta():
    return get_churn_score_meta()


@router.post("/treinar")
def churn_score_train():
    try:
        return train_churn_score_model()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao treinar o Churn Score: {type(exc).__name__}: {exc}",
        ) from exc


@router.get("")
def churn_score_dashboard(
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    try:
        return get_churn_score_dashboard(empresa=empresa, origem=origem, pagador=pagador)
    except RuntimeError as exc:
        if str(exc) == "MODEL_NOT_TRAINED":
            raise HTTPException(
                status_code=409,
                detail="O Churn Score ainda não foi treinado. Use o botão 'Treinar modelo' ou execute a atualização novamente.",
            ) from exc
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao calcular o Churn Score: {type(exc).__name__}: {exc}",
        ) from exc
