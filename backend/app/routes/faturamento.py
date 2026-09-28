from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.faturamento_service import (
    get_faturamento,
    get_faturamento_componente,
    get_faturamento_detalhes,
    get_faturamento_historico,
    get_faturamento_plano_detalhe,
    get_faturamento_total,
)

router = APIRouter(prefix="/api/faturamento", tags=["Faturamento"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]
CompareMode = Literal["mes_completo", "mesmo_periodo_atual"]


def _handle(func, **kwargs):
    try:
        return func(**kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar o faturamento no MySQL de origem. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get("/total")
def faturamento_total(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    return _handle(
        get_faturamento_total,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/detalhes")
def faturamento_detalhes(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    return _handle(
        get_faturamento_detalhes,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/componente")
def faturamento_componente(
    componente: str = Query(...),
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    compare_mode: CompareMode = Query("mes_completo"),
):
    return _handle(
        get_faturamento_componente,
        year=ano,
        month=mes,
        componente=componente,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
        compare_mode=compare_mode,
    )


@router.get("/plano-detalhe")
def faturamento_plano_detalhe(
    plano: str = Query(...),
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    compare_mode: CompareMode = Query("mes_completo"),
):
    return _handle(
        get_faturamento_plano_detalhe,
        year=ano,
        month=mes,
        plano=plano,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
        compare_mode=compare_mode,
    )


@router.get("")
def faturamento(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    return _handle(
        get_faturamento,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/historico")
def faturamento_historico(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    return _handle(
        get_faturamento_historico,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/meta")
def faturamento_meta():
    today = date.today()
    return {
        "ano_inicio": 2024,
        "ano_atual": today.year,
        "mes_atual": today.month,
        "anos": list(range(2024, today.year + 1)),
        "empresas": [
            {"value": "todos", "label": "Todas"},
            {"value": "gestaoclick", "label": "GestãoClick"},
            {"value": "clicknotas", "label": "ClickNotas"},
        ],
        "origens": [
            {"value": "todos", "label": "Todas"},
            {"value": "gestaoclick", "label": "GestãoClick"},
            {"value": "parceiro", "label": "Parceiro"},
        ],
        "pagadores": [
            {"value": "todos", "label": "Todos"},
            {"value": "cliente", "label": "Cliente"},
            {"value": "parceiro", "label": "Parceiro"},
        ],
    }
