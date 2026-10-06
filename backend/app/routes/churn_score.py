from __future__ import annotations

import threading
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.churn_score_service import (
    get_churn_score_dashboard,
    get_churn_score_meta,
    train_churn_score_model,
)
from app.services.dashboard_cache_service import get_snapshot, save_snapshot
from app.services.global_filter_context import current_duration, current_plan

router = APIRouter(prefix="/api/churn-score", tags=["Churn Score"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]
RiskFilter = Literal["todos", "alto_ou_maior", "muito_alto", "alto", "moderado", "baixo"]

CACHE_PAGE = "churn-score.dashboard"
CONTACT_CACHE_PAGE = "churn-score.contacts"
CACHE_MAX_AGE_MINUTES = 30
TZ = ZoneInfo("America/Sao_Paulo")

_REFRESH_LOCK = threading.Lock()
_REFRESHING_KEYS: set[str] = set()


def _params(empresa: str, origem: str, pagador: str) -> dict[str, str]:
    return {
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "plano_global": current_plan(),
        "duracao_global": current_duration(),
    }


def _refresh_key(params: dict[str, str]) -> str:
    return "|".join(f"{key}={params[key]}" for key in sorted(params))


def _normalize_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        current = value
    else:
        try:
            current = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None

    if current.tzinfo is None:
        current = current.replace(tzinfo=TZ)
    return current.astimezone(TZ)


def _is_stale(snapshot: dict) -> bool:
    updated_at = _normalize_datetime(snapshot.get("updated_at"))
    if updated_at is None:
        return True
    return datetime.now(TZ) - updated_at >= timedelta(minutes=CACHE_MAX_AGE_MINUTES)


def _without_contacts(payload: dict) -> dict:
    result = dict(payload)
    result.pop("contatos", None)
    return result


def _with_cache_info(payload: dict, snapshot: dict, refreshing: bool) -> dict:
    result = _without_contacts(payload)
    updated_at = _normalize_datetime(snapshot.get("updated_at"))
    result["_cache_info"] = {
        "updated_at": updated_at.isoformat(timespec="seconds") if updated_at else None,
        "source_date": str(snapshot.get("source_date") or "") or None,
        "refreshing": refreshing,
        "preparing": False,
        "max_age_minutes": CACHE_MAX_AGE_MINUTES,
    }
    return result


def _preparing_payload(params: dict[str, str]) -> dict:
    meta = get_churn_score_meta()

    return {
        "model": meta,
        "filtros": params,
        "resumo": {
            "clientes": 0,
            "score_medio": 0.0,
            "alto_risco": 0,
            "muito_alto_risco": 0,
            "valor_total": 0.0,
            "valor_ponderado_risco": 0.0,
        },
        "faixas": [],
        "risco_por_plano": [],
        "risco_por_duracao": [],
        "clientes": [],
        "clientes_retornados": 0,
        "regra_score": "Primeira fotografia do Churn Score em preparação.",
        "_cache_info": {
            "updated_at": None,
            "source_date": None,
            "refreshing": True,
            "preparing": True,
            "max_age_minutes": CACHE_MAX_AGE_MINUTES,
        },
    }


def _refresh_snapshot(params: dict[str, str]) -> None:
    key = _refresh_key(params)
    try:
        payload = get_churn_score_dashboard(
            empresa=params["empresa"],
            origem=params["origem"],
            pagador=params["pagador"],
            plano_global=params.get("plano_global", "todos"),
            duracao_global=params.get("duracao_global", "todos"),
        )
        contacts = payload.pop("contatos", []) if isinstance(payload, dict) else []
        save_snapshot(CACHE_PAGE, params, payload)
        save_snapshot(CONTACT_CACHE_PAGE, params, {"contatos": contacts})
    except Exception:
        # Mantém o último snapshot disponível se a origem estiver lenta ou indisponível.
        pass
    finally:
        with _REFRESH_LOCK:
            _REFRESHING_KEYS.discard(key)


def _train_and_refresh(params: dict[str, str]) -> None:
    key = _refresh_key(params)
    refreshed = False
    try:
        train_churn_score_model()
        # _refresh_snapshot também libera a chave em andamento no finally.
        _refresh_snapshot(params)
        refreshed = True
    except Exception:
        pass
    finally:
        if not refreshed:
            with _REFRESH_LOCK:
                _REFRESHING_KEYS.discard(key)


def _schedule_training(background_tasks: BackgroundTasks, params: dict[str, str]) -> bool:
    key = _refresh_key(params)
    with _REFRESH_LOCK:
        if key in _REFRESHING_KEYS:
            return False
        _REFRESHING_KEYS.add(key)

    background_tasks.add_task(_train_and_refresh, params)
    return True


def _schedule_refresh(background_tasks: BackgroundTasks, params: dict[str, str]) -> bool:
    key = _refresh_key(params)
    with _REFRESH_LOCK:
        if key in _REFRESHING_KEYS:
            return False
        _REFRESHING_KEYS.add(key)

    background_tasks.add_task(_refresh_snapshot, params)
    return True


def _snapshot_contacts(params: dict[str, str]) -> tuple[list[dict], dict]:
    contact_snapshot = get_snapshot(CONTACT_CACHE_PAGE, params)
    if contact_snapshot and isinstance(contact_snapshot.get("payload"), dict):
        contacts = contact_snapshot["payload"].get("contatos")
        if isinstance(contacts, list):
            return contacts, contact_snapshot

    # Compatibilidade com snapshots anteriores enquanto a primeira atualização
    # da lista completa termina em segundo plano.
    dashboard_snapshot = get_snapshot(CACHE_PAGE, params)
    if not dashboard_snapshot or not isinstance(dashboard_snapshot.get("payload"), dict):
        return [], {}
    payload = dashboard_snapshot["payload"]
    contacts = payload.get("clientes") if isinstance(payload.get("clientes"), list) else []
    return contacts, dashboard_snapshot


def _matches_dimensions(item: dict, *, empresa: str, origem: str, pagador: str) -> bool:
    modalidade = str(item.get("modalidade") or "")
    item_origem = str(item.get("origem") or "")
    item_pagador = str(item.get("pagador") or "")

    if empresa == "gestaoclick" and modalidade != "ERP":
        return False
    if empresa == "clicknotas" and modalidade not in {"NFE", "FIS"}:
        return False
    if origem == "gestaoclick" and item_origem != "GestãoClick":
        return False
    if origem == "parceiro" and item_origem != "Parceiro":
        return False
    if pagador == "cliente" and item_pagador != "Cliente":
        return False
    if pagador == "parceiro" and item_pagador != "Parceiro":
        return False
    return True


def _snapshot_contacts_flexible(params: dict[str, str]) -> tuple[list[dict], dict]:
    contacts, snapshot = _snapshot_contacts(params)
    if contacts:
        return contacts, snapshot

    base_params = _params("todos", "todos", "todos")
    base_contacts, base_snapshot = _snapshot_contacts(base_params)
    if not base_contacts:
        return contacts, snapshot

    filtered = [
        item
        for item in base_contacts
        if _matches_dimensions(
            item,
            empresa=params["empresa"],
            origem=params["origem"],
            pagador=params["pagador"],
        )
    ]
    return filtered, base_snapshot


def _matches_risk(item: dict, risco: str) -> bool:
    band = str(item.get("faixa_risco") or "")
    if risco == "todos":
        return True
    if risco == "alto_ou_maior":
        return band in {"Alto", "Muito alto"}
    if risco == "muito_alto":
        return band == "Muito alto"
    if risco == "alto":
        return band == "Alto"
    if risco == "moderado":
        return band == "Moderado"
    if risco == "baixo":
        return band == "Baixo"
    return True


def _filter_contacts(
    contacts: list[dict],
    *,
    risco: str,
    plano: str = "",
    duracao: str = "",
    data_inicio: str = "",
    data_fim: str = "",
    valor_minimo: float = 0.0,
    tempo_cliente_minimo: float | None = None,
    tempo_cliente_maximo: float | None = None,
    tempo_cliente_unidade: str = "mes",
    somente_ultrapassou_media: bool = False,
) -> list[dict]:
    plan_filter = plano.strip().casefold()
    duration_filter = duracao.strip().upper()
    multiplier = 12.0 if tempo_cliente_unidade == "ano" else 1.0
    min_months = tempo_cliente_minimo * multiplier if tempo_cliente_minimo is not None else None
    max_months = tempo_cliente_maximo * multiplier if tempo_cliente_maximo is not None else None

    rows = []
    for item in contacts:
        if not _matches_risk(item, risco):
            continue
        if plan_filter and str(item.get("nome_plano") or "").casefold() != plan_filter:
            continue
        if duration_filter and str(item.get("duracao") or "").upper() != duration_filter:
            continue

        due_date = str(item.get("data_vencimento") or "")[:10]
        if data_inicio and (not due_date or due_date < data_inicio):
            continue
        if data_fim and (not due_date or due_date > data_fim):
            continue

        if float(item.get("valor") or 0) < float(valor_minimo or 0):
            continue

        months = float(item.get("tempo_vida_meses") or 0)
        if min_months is not None and months < min_months:
            continue
        if max_months is not None and months > max_months:
            continue

        if somente_ultrapassou_media and not bool(item.get("ultrapassou_media_atraso")):
            continue

        rows.append(item)

    rows.sort(
        key=lambda item: (
            -int(item.get("score") or 0),
            str(item.get("data_vencimento") or "9999-12-31"),
            -float(item.get("valor") or 0),
        )
    )
    return rows


def _contact_meta(contacts: list[dict]) -> dict:
    plans = sorted({str(item.get("nome_plano") or "").strip() for item in contacts if str(item.get("nome_plano") or "").strip()})
    durations = []
    duration_labels = {"M": "Mensal", "T": "Trimestral", "S": "Semestral", "A": "Anual"}
    for value in ("M", "T", "S", "A"):
        if any(str(item.get("duracao") or "").upper() == value for item in contacts):
            durations.append({"value": value, "label": duration_labels[value]})
    dates = sorted({str(item.get("data_vencimento") or "")[:10] for item in contacts if item.get("data_vencimento")})
    return {
        "planos": plans,
        "duracoes": durations,
        "data_minima": dates[0] if dates else None,
        "data_maxima": dates[-1] if dates else None,
    }


@router.get("/meta")
def churn_score_meta():
    return get_churn_score_meta()


@router.post("/treinar")
def churn_score_train(
    background_tasks: BackgroundTasks,
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    try:
        result = train_churn_score_model()
        _schedule_refresh(background_tasks, _params(empresa, origem, pagador))
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao treinar o Churn Score: {type(exc).__name__}: {exc}",
        ) from exc


@router.post("/atualizar")
def churn_score_refresh(
    background_tasks: BackgroundTasks,
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _params(empresa, origem, pagador)
    meta = get_churn_score_meta()
    if meta.get("status") == "treinado":
        started = _schedule_refresh(background_tasks, params)
    else:
        started = _schedule_training(background_tasks, params)
    snapshot = get_snapshot(CACHE_PAGE, params)
    updated_at = _normalize_datetime(snapshot.get("updated_at")) if snapshot else None
    return {
        "status": "atualizando" if started else "atualizacao_em_andamento",
        "ultima_atualizacao": updated_at.isoformat(timespec="seconds") if updated_at else None,
    }


@router.get("/clientes")
def churn_score_clients(
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    risco: RiskFilter = Query("todos"),
    plano: str = Query("", max_length=120),
    duracao: str = Query("", max_length=2),
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(20, ge=1, le=100),
):
    params = _params(empresa, origem, pagador)
    contacts, snapshot = _snapshot_contacts_flexible(params)
    rows = _filter_contacts(contacts, risco=risco, plano=plano, duracao=duracao)
    total = len(rows)
    total_paginas = max(1, (total + por_pagina - 1) // por_pagina)
    pagina = min(pagina, total_paginas)
    inicio = (pagina - 1) * por_pagina
    fim = inicio + por_pagina
    updated_at = _normalize_datetime(snapshot.get("updated_at")) if snapshot else None
    return {
        **_contact_meta(contacts),
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "total_paginas": total_paginas,
        "rows": rows[inicio:fim],
        "ultima_atualizacao": updated_at.isoformat(timespec="seconds") if updated_at else None,
    }


@router.get("/lista-contato")
def churn_score_contact_list(
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    risco: RiskFilter = Query("alto_ou_maior"),
    plano: str = Query("", max_length=120),
    duracao: str = Query("", max_length=2),
    data_inicio: str = Query("", max_length=10),
    data_fim: str = Query("", max_length=10),
    valor_minimo: float = Query(0, ge=0),
    tempo_cliente_minimo: float | None = Query(None, ge=0),
    tempo_cliente_maximo: float | None = Query(None, ge=0),
    tempo_cliente_unidade: Literal["mes", "ano"] = Query("mes"),
    somente_ultrapassou_media: bool = Query(False),
):
    params = _params(empresa, origem, pagador)
    contacts, snapshot = _snapshot_contacts_flexible(params)
    rows = _filter_contacts(
        contacts,
        risco=risco,
        plano=plano,
        duracao=duracao,
        data_inicio=data_inicio,
        data_fim=data_fim,
        valor_minimo=valor_minimo,
        tempo_cliente_minimo=tempo_cliente_minimo,
        tempo_cliente_maximo=tempo_cliente_maximo,
        tempo_cliente_unidade=tempo_cliente_unidade,
        somente_ultrapassou_media=somente_ultrapassou_media,
    )
    updated_at = _normalize_datetime(snapshot.get("updated_at")) if snapshot else None
    return {
        **_contact_meta(contacts),
        "risco": risco,
        "total": len(rows),
        "rows": rows,
        "ultima_atualizacao": updated_at.isoformat(timespec="seconds") if updated_at else None,
    }


@router.get("")
def churn_score_dashboard(
    background_tasks: BackgroundTasks,
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
):
    params = _params(empresa, origem, pagador)

    try:
        snapshot = get_snapshot(CACHE_PAGE, params)

        if snapshot and isinstance(snapshot.get("payload"), dict):
            stale = _is_stale(snapshot)
            refreshing = False
            if stale:
                meta = get_churn_score_meta()
                if meta.get("status") == "treinado":
                    refreshing = _schedule_refresh(background_tasks, params) or True
                else:
                    refreshing = _schedule_training(background_tasks, params) or True
            return _with_cache_info(snapshot["payload"], snapshot, refreshing)

        # Primeiro uso deste filtro: nunca bloqueia a página esperando o MySQL.
        # Se o modelo foi invalidado por uma nova versão, treino e fotografia
        # também são produzidos em segundo plano.
        meta = get_churn_score_meta()
        if meta.get("status") == "treinado":
            _schedule_refresh(background_tasks, params)
        else:
            _schedule_training(background_tasks, params)
        return _preparing_payload(params)

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
            detail=f"Falha ao carregar o Churn Score: {type(exc).__name__}: {exc}",
        ) from exc
