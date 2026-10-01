from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.dashboard_cache_service import cached_daily
from app.services.perfil_service import (
    enrich_perfil_empresarial,
    get_cnpj_profile,
    get_perfil_client_metrics,
    get_perfil_clients,
    get_perfil_dashboard,
    get_perfil_empresarial,
    get_perfil_filter_options,
)

router = APIRouter(prefix="/api/perfil", tags=["Perfil"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]
GroupFilter = Literal["ativos", "churn"]


def _handle(func, **kwargs):
    try:
        return func(**kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro na análise de perfil. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc


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
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao carregar o snapshot de perfil. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc


def _base_params(ano, mes, empresa, origem, pagador):
    return {
        "ano": ano,
        "mes": mes,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
    }


@router.get("")
def perfil_dashboard(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _base_params(ano, mes, empresa, origem, pagador)
    return _cached(
        background_tasks,
        "perfil.dashboard",
        params,
        lambda: get_perfil_dashboard(
            year=ano,
            month=mes,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        ),
    )


@router.get("/clientes")
def perfil_clientes(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    grupo: GroupFilter = Query("ativos"),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    busca: str = Query("", max_length=120),
    pagina: int = Query(1, ge=1),
    limite: int = Query(50, ge=10, le=200),
    fonte_cnpj: Literal["cadastro", "nota"] = Query("cadastro"),
    regime_tributario: str = Query("", max_length=160),
    porte: str = Query("", max_length=160),
    setor: str = Query("", max_length=240),
    segmento: str = Query("", max_length=240),
    plano: str = Query("", max_length=160),
    duracao: str = Query("", max_length=40),
):
    params = {
        **_base_params(ano, mes, empresa, origem, pagador),
        "grupo": grupo,
        "busca": busca,
        "pagina": pagina,
        "limite": limite,
        "fonte_cnpj": fonte_cnpj,
        "regime_tributario": regime_tributario,
        "porte": porte,
        "setor": setor,
        "segmento": segmento,
        "plano": plano,
        "duracao": duracao,
    }
    return _cached(
        background_tasks,
        "perfil.clientes",
        params,
        lambda: get_perfil_clients(
            year=ano,
            month=mes,
            grupo=grupo,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
            search=busca,
            page=pagina,
            limit=limite,
            cnpj_source=fonte_cnpj,
            regime_tributario=regime_tributario,
            porte=porte,
            setor=setor,
            segmento=segmento,
            plano=plano,
            duracao=duracao,
        ),
    )


@router.get("/cnpj/{cnpj}")
def perfil_cnpj(cnpj: str):
    # Este endpoint já lê exclusivamente o Supabase; não consulta a API externa.
    return _handle(get_cnpj_profile, cnpj=cnpj)


@router.get("/empresarial")
def perfil_empresarial(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    fonte_cnpj: Literal["cadastro", "nota"] = Query("cadastro"),
):
    params = {
        **_base_params(ano, mes, empresa, origem, pagador),
        "fonte_cnpj": fonte_cnpj,
    }
    return _cached(
        background_tasks,
        "perfil.empresarial",
        params,
        lambda: get_perfil_empresarial(
            year=ano,
            month=mes,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
            cnpj_source=fonte_cnpj,
        ),
    )


@router.post("/empresarial/enriquecer")
def perfil_empresarial_enriquecer(
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    fonte_cnpj: Literal["cadastro", "nota"] = Query("cadastro"),
    limite: int = Query(50, ge=1, le=100),
):
    # Mantido apenas por compatibilidade. O fluxo atual não deve consultar APIs externas.
    return _handle(
        enrich_perfil_empresarial,
        year=ano,
        month=mes,
        empresa=empresa,
        origem=origem,
        pagador=pagador,
        cnpj_source=fonte_cnpj,
        limit=limite,
    )


@router.get("/filtros")
def perfil_filtros(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    mes: int = Query(..., ge=0, le=12),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _base_params(ano, mes, empresa, origem, pagador)
    return _cached(
        background_tasks,
        "perfil.filtros",
        params,
        lambda: get_perfil_filter_options(
            year=ano,
            month=mes,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
        ),
    )


@router.get("/cliente/{empresa_id}/metricas")
def perfil_cliente_metricas(
    background_tasks: BackgroundTasks,
    empresa_id: int,
    status_base: Literal["Ativo", "Churn"] = Query("Ativo"),
):
    params = {"empresa_id": empresa_id, "status_base": status_base}
    return _cached(
        background_tasks,
        "perfil.cliente_metricas",
        params,
        lambda: get_perfil_client_metrics(
            empresa_id=empresa_id,
            status_base=status_base,
        ),
    )
