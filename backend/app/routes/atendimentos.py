from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.atendimentos_service import get_atendimentos_dashboard, get_atendimentos_meta, get_churn_attendances_export
from app.services.dashboard_cache_service import cached_daily
from app.services.zendesk_sync_service import get_sync_status, trigger_incremental_sync

router = APIRouter(prefix="/api/atendimentos", tags=["Atendimentos"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]
CACHE_VERSION = "3.32.6"


def _build_dashboard(*, ano: int, mes: int, empresa: str, origem: str, pagador: str):
    # O dashboard lê primeiro o histórico que já está salvo no Supabase.
    # A sincronização do Zendesk é independente e nunca bloqueia a consulta.
    return get_atendimentos_dashboard(
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
    )


@router.get("")
def atendimentos_dashboard(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=1, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    # A versão entra na chave do cache para invalidar snapshots antigos desta
    # atualização sem precisar apagar manualmente a tabela do Supabase.
    params = {
        "ano": ano,
        "mes": mes,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "versao": CACHE_VERSION,
    }
    try:
        # O período faz parte do nome da página do snapshot. Assim o fallback
        # nunca consegue devolver setembro quando outubro foi solicitado.
        result = cached_daily(
            page=f"atendimentos.dashboard.{ano:04d}-{mes:02d}",
            params=params,
            builder=lambda: _build_dashboard(
                ano=ano,
                mes=mes,
                empresa=empresa,
                origem=origem,
                pagador=pagador,
            ),
            background_tasks=background_tasks,
        )
        if isinstance(result, dict):
            result["sincronizacao"] = get_sync_status()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Os dados de atendimentos ainda estão sendo preparados no banco do dashboard. "
                "Tente novamente em alguns instantes."
            ),
        ) from exc


@router.get("/churn/exportar")
def atendimentos_churn_exportar(
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    try:
        return get_churn_attendances_export(empresa=empresa, origem=origem, pagador=pagador)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Não foi possível exportar os atendimentos de churn agora.") from exc


@router.get("/meta")
def atendimentos_meta():
    trigger_incremental_sync()
    return get_atendimentos_meta()


@router.get("/status")
def atendimentos_status():
    return get_sync_status()


@router.post("/sincronizar")
def atendimentos_sincronizar():
    started = trigger_incremental_sync()
    return {"iniciado": started, **get_sync_status()}
