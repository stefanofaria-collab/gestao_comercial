from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.dashboard_cache_service import cached_daily
from app.services.intranet2_service import (
    export_clients,
    get_client_detail,
    get_filter_options,
    search_clients,
)

router = APIRouter(prefix="/api/intranet-2", tags=["Intranet 2.0"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]
ActiveFilter = Literal["todos", "sim", "nao"]
SupportFilter = Literal["todos", "sim", "nao"]
TenureUnit = Literal["mes", "ano"]


def _common_filters(
    razao_social: str,
    email: str,
    telefone: str,
    estado: str,
    cidade: str,
    ultimo_acesso_de: date | None,
    ultimo_acesso_ate: date | None,
    sem_acesso_min: int | None,
    sem_acesso_max: int | None,
    vencimento_de: date | None,
    vencimento_ate: date | None,
    vencido_min: int | None,
    vencido_max: int | None,
    vencem_em_min: int | None,
    vencem_em_max: int | None,
    pagamento_de: date | None,
    pagamento_ate: date | None,
    plano: str,
    duracao: str,
    empresa: str,
    origem: str,
    pagador: str,
    somente_ativos: str,
    cliente_com_atendimento: str,
    valor_minimo: float,
    tempo_cliente_minimo: float | None,
    tempo_cliente_maximo: float | None,
    tempo_cliente_unidade: str,
    somente_ultrapassou_media: bool,
) -> dict:
    return {
        "razao_social": razao_social,
        "email": email,
        "telefone": telefone,
        "estado": estado,
        "cidade": cidade,
        "ultimo_acesso_de": ultimo_acesso_de,
        "ultimo_acesso_ate": ultimo_acesso_ate,
        "sem_acesso_min": sem_acesso_min,
        "sem_acesso_max": sem_acesso_max,
        "vencimento_de": vencimento_de,
        "vencimento_ate": vencimento_ate,
        "vencido_min": vencido_min,
        "vencido_max": vencido_max,
        "vencem_em_min": vencem_em_min,
        "vencem_em_max": vencem_em_max,
        "pagamento_de": pagamento_de,
        "pagamento_ate": pagamento_ate,
        "plano": plano,
        "duracao": duracao,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "somente_ativos": somente_ativos,
        "cliente_com_atendimento": cliente_com_atendimento,
        "valor_minimo": valor_minimo,
        "tempo_cliente_minimo": tempo_cliente_minimo,
        "tempo_cliente_maximo": tempo_cliente_maximo,
        "tempo_cliente_unidade": tempo_cliente_unidade,
        "somente_ultrapassou_media": somente_ultrapassou_media,
    }


def _handle(builder):
    try:
        return builder()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível carregar as informações agora. Tente novamente em alguns instantes.",
        ) from exc


@router.get("/opcoes")
def intranet2_options(background_tasks: BackgroundTasks):
    return _handle(
        lambda: cached_daily(
            page="intranet2.options.3.27.2",
            params={},
            builder=get_filter_options,
            background_tasks=background_tasks,
        )
    )


@router.get("/buscar")
def intranet2_search(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    razao_social: str = Query("", max_length=180),
    email: str = Query("", max_length=180),
    telefone: str = Query("", max_length=80),
    estado: str = Query("", max_length=10),
    cidade: str = Query("", max_length=160),
    ultimo_acesso_de: date | None = Query(None),
    ultimo_acesso_ate: date | None = Query(None),
    sem_acesso_min: int | None = Query(None, ge=0),
    sem_acesso_max: int | None = Query(None, ge=0),
    vencimento_de: date | None = Query(None),
    vencimento_ate: date | None = Query(None),
    vencido_min: int | None = Query(None, ge=0),
    vencido_max: int | None = Query(None, ge=0),
    vencem_em_min: int | None = Query(None, ge=0),
    vencem_em_max: int | None = Query(None, ge=0),
    pagamento_de: date | None = Query(None),
    pagamento_ate: date | None = Query(None),
    plano: str = Query("", max_length=120),
    duracao: str = Query("", max_length=2),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    somente_ativos: ActiveFilter = Query("todos"),
    cliente_com_atendimento: SupportFilter = Query("todos"),
    valor_minimo: float = Query(0, ge=0),
    tempo_cliente_minimo: float | None = Query(None, ge=0),
    tempo_cliente_maximo: float | None = Query(None, ge=0),
    tempo_cliente_unidade: TenureUnit = Query("mes"),
    somente_ultrapassou_media: bool = Query(False),
):
    filters = _common_filters(
        razao_social, email, telefone, estado, cidade,
        ultimo_acesso_de, ultimo_acesso_ate, sem_acesso_min, sem_acesso_max,
        vencimento_de, vencimento_ate, vencido_min, vencido_max, vencem_em_min, vencem_em_max,
        pagamento_de, pagamento_ate,
        plano, duracao, empresa, origem, pagador, somente_ativos, cliente_com_atendimento,
        valor_minimo, tempo_cliente_minimo, tempo_cliente_maximo,
        tempo_cliente_unidade, somente_ultrapassou_media,
    )
    return _handle(lambda: search_clients(page=page, limit=limit, **filters))


@router.get("/exportar")
def intranet2_export(
    razao_social: str = Query("", max_length=180),
    email: str = Query("", max_length=180),
    telefone: str = Query("", max_length=80),
    estado: str = Query("", max_length=10),
    cidade: str = Query("", max_length=160),
    ultimo_acesso_de: date | None = Query(None),
    ultimo_acesso_ate: date | None = Query(None),
    sem_acesso_min: int | None = Query(None, ge=0),
    sem_acesso_max: int | None = Query(None, ge=0),
    vencimento_de: date | None = Query(None),
    vencimento_ate: date | None = Query(None),
    vencido_min: int | None = Query(None, ge=0),
    vencido_max: int | None = Query(None, ge=0),
    vencem_em_min: int | None = Query(None, ge=0),
    vencem_em_max: int | None = Query(None, ge=0),
    pagamento_de: date | None = Query(None),
    pagamento_ate: date | None = Query(None),
    plano: str = Query("", max_length=120),
    duracao: str = Query("", max_length=2),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    somente_ativos: ActiveFilter = Query("todos"),
    cliente_com_atendimento: SupportFilter = Query("todos"),
    valor_minimo: float = Query(0, ge=0),
    tempo_cliente_minimo: float | None = Query(None, ge=0),
    tempo_cliente_maximo: float | None = Query(None, ge=0),
    tempo_cliente_unidade: TenureUnit = Query("mes"),
    somente_ultrapassou_media: bool = Query(False),
):
    filters = _common_filters(
        razao_social, email, telefone, estado, cidade,
        ultimo_acesso_de, ultimo_acesso_ate, sem_acesso_min, sem_acesso_max,
        vencimento_de, vencimento_ate, vencido_min, vencido_max, vencem_em_min, vencem_em_max,
        pagamento_de, pagamento_ate,
        plano, duracao, empresa, origem, pagador, somente_ativos, cliente_com_atendimento,
        valor_minimo, tempo_cliente_minimo, tempo_cliente_maximo,
        tempo_cliente_unidade, somente_ultrapassou_media,
    )
    return _handle(lambda: export_clients(**filters))


@router.get("/cliente/{empresa_id}")
def intranet2_client_detail(empresa_id: int):
    return _handle(lambda: get_client_detail(empresa_id))
