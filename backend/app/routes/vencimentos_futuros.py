from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.dashboard_cache_service import cached_daily
from app.services.vencimentos_futuros_service import (
    get_vencimentos_export_options,
    get_vencimentos_export_rows,
    get_vencimentos_futuros_dashboard,
    get_vencimentos_futuros_meta,
)

router = APIRouter(prefix="/api/vencimentos-futuros", tags=["Vencimentos Futuros"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


def _cached(background_tasks, page, params, builder):
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
                "Não foi possível carregar o snapshot de vencimentos. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get("")
def vencimentos_futuros_dashboard(
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
    return _cached(
        background_tasks,
        "vencimentos.dashboard",
        params,
        lambda: get_vencimentos_futuros_dashboard(
            year=ano,
            month=mes,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        ),
    )


@router.get("/meta")
def vencimentos_futuros_meta():
    return get_vencimentos_futuros_meta()


@router.get("/exportar/opcoes")
def vencimentos_futuros_exportar_opcoes(background_tasks: BackgroundTasks):
    return _cached(
        background_tasks,
        "vencimentos.exportar_opcoes",
        {},
        get_vencimentos_export_options,
    )


@router.get("/exportar")
def vencimentos_futuros_exportar(
    background_tasks: BackgroundTasks,
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    plano: str = Query("", max_length=120),
    duracao: str = Query("", max_length=2),
    valor_minimo: float = Query(0, ge=0),
    tempo_cliente_minimo: float | None = Query(None, ge=0),
    tempo_cliente_maximo: float | None = Query(None, ge=0),
    tempo_cliente_unidade: Literal["mes", "ano"] = Query("mes"),
    somente_ultrapassou_media: bool = Query(False),
):
    params = {
        "data_inicio": data_inicio.isoformat(),
        "data_fim": data_fim.isoformat(),
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "plano": plano,
        "duracao": duracao,
        "valor_minimo": valor_minimo,
        "tempo_cliente_minimo": tempo_cliente_minimo,
        "tempo_cliente_maximo": tempo_cliente_maximo,
        "tempo_cliente_unidade": tempo_cliente_unidade,
        "somente_ultrapassou_media": somente_ultrapassou_media,
    }
    return _cached(
        background_tasks,
        "vencimentos.exportar",
        params,
        lambda: get_vencimentos_export_rows(
            data_inicio=data_inicio,
            data_fim=data_fim,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
            plano=plano,
            duracao=duracao,
            valor_minimo=valor_minimo,
            tempo_cliente_minimo=tempo_cliente_minimo,
            tempo_cliente_maximo=tempo_cliente_maximo,
            tempo_cliente_unidade=tempo_cliente_unidade,
            somente_ultrapassou_media=somente_ultrapassou_media,
        ),
    )
