from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

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


@router.get("")
def vencimentos_futuros_dashboard(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    try:
        return get_vencimentos_futuros_dashboard(
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
                "Erro ao consultar os vencimentos futuros no MySQL de origem. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get("/meta")
def vencimentos_futuros_meta():
    return get_vencimentos_futuros_meta()


@router.get("/exportar/opcoes")
def vencimentos_futuros_exportar_opcoes():
    try:
        return get_vencimentos_export_options()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao carregar as opções da exportação. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc


@router.get("/exportar")
def vencimentos_futuros_exportar(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    plano: str = Query("", max_length=120),
    duracao: str = Query("", max_length=2),
    valor_minimo: float = Query(0, ge=0),
    tempo_cliente_valor: float = Query(0, ge=0),
    tempo_cliente_unidade: Literal["mes", "ano"] = Query("mes"),
):
    try:
        return get_vencimentos_export_rows(
            data_inicio=data_inicio,
            data_fim=data_fim,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
            plano=plano,
            duracao=duracao,
            valor_minimo=valor_minimo,
            tempo_cliente_valor=tempo_cliente_valor,
            tempo_cliente_unidade=tempo_cliente_unidade,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gerar a exportação. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc
