from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.dashboard_cache_service import cached_daily
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


def _cached_handle(background_tasks, page, func, cache_params, **kwargs):
    try:
        return cached_daily(
            page=page,
            params=cache_params,
            builder=lambda: func(**kwargs),
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Não foi possível carregar o snapshot do faturamento. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


def _base_params(ano, mes, empresa, origem, pagador):
    return {
        "ano": ano,
        "mes": mes,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }


@router.get("/total")
def faturamento_total(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _base_params(ano, mes, empresa, origem, pagador)
    return _cached_handle(
        background_tasks,
        "faturamento.total",
        get_faturamento_total,
        params,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/detalhes")
def faturamento_detalhes(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _base_params(ano, mes, empresa, origem, pagador)
    return _cached_handle(
        background_tasks,
        "faturamento.detalhes",
        get_faturamento_detalhes,
        params,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/componente")
def faturamento_componente(
    background_tasks: BackgroundTasks,
    componente: str = Query(...),
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    compare_mode: CompareMode = Query("mes_completo"),
):
    params = {
        **_base_params(ano, mes, empresa, origem, pagador),
        "componente": componente,
        "compare_mode": compare_mode,
    }
    return _cached_handle(
        background_tasks,
        "faturamento.componente",
        get_faturamento_componente,
        params,
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
    background_tasks: BackgroundTasks,
    plano: str = Query(...),
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    compare_mode: CompareMode = Query("mes_completo"),
):
    params = {
        **_base_params(ano, mes, empresa, origem, pagador),
        "plano": plano,
        "compare_mode": compare_mode,
    }
    return _cached_handle(
        background_tasks,
        "faturamento.plano_detalhe",
        get_faturamento_plano_detalhe,
        params,
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
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _base_params(ano, mes, empresa, origem, pagador)
    return _cached_handle(
        background_tasks,
        "faturamento.pagina",
        get_faturamento,
        params,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("/historico")
def faturamento_historico(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _base_params(ano, mes, empresa, origem, pagador)
    return _cached_handle(
        background_tasks,
        "faturamento.historico",
        get_faturamento_historico,
        params,
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
