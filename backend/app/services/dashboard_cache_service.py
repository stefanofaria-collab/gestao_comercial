from __future__ import annotations

import copy
import hashlib
import json
import threading
from datetime import date, datetime
from typing import Any, Callable
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from app.database import supabase_engine

TZ = ZoneInfo("America/Sao_Paulo")
REFRESH_LOCK_MINUTES = 20

# O banco oficial é um backup e deve ser consultado com parcimônia. Mesmo que
# várias partes da tela descubram que precisam atualizar ao mesmo tempo, apenas
# uma consulta pesada à origem é executada por vez neste processo.
_SOURCE_REFRESH_LOCK = threading.Lock()
_IN_FLIGHT_LOCK = threading.Lock()
_IN_FLIGHT_KEYS: set[str] = set()

GET_CACHE_SQL = text(
    """
    SELECT cache_key, page, params, payload, source_date, updated_at,
           refresh_started_at, refresh_error
    FROM public.dashboard_daily_cache
    WHERE cache_key = :cache_key
    """
)

GET_FALLBACK_SQL = text(
    """
    SELECT cache_key, page, params, payload, source_date, updated_at,
           refresh_started_at, refresh_error
    FROM public.dashboard_daily_cache
    WHERE page = :page
      AND params @> CAST(:stable_params AS jsonb)
      AND payload IS NOT NULL
    ORDER BY source_date DESC, updated_at DESC
    LIMIT 1
    """
)

UPSERT_CACHE_SQL = text(
    """
    INSERT INTO public.dashboard_daily_cache (
        cache_key, page, params, payload, source_date, updated_at,
        refresh_started_at, refresh_error
    )
    VALUES (
        :cache_key, :page, CAST(:params AS jsonb), CAST(:payload AS jsonb),
        :source_date, now(), NULL, NULL
    )
    ON CONFLICT (cache_key)
    DO UPDATE SET
        page = EXCLUDED.page,
        params = EXCLUDED.params,
        payload = EXCLUDED.payload,
        source_date = EXCLUDED.source_date,
        updated_at = now(),
        refresh_started_at = NULL,
        refresh_error = NULL
    """
)

ACQUIRE_REFRESH_SQL = text(
    """
    UPDATE public.dashboard_daily_cache
    SET refresh_started_at = now(), refresh_error = NULL
    WHERE cache_key = :cache_key
      AND (
        refresh_started_at IS NULL
        OR refresh_started_at < now() - interval '20 minutes'
      )
    RETURNING cache_key
    """
)

RELEASE_REFRESH_ERROR_SQL = text(
    """
    UPDATE public.dashboard_daily_cache
    SET refresh_started_at = NULL,
        refresh_error = :refresh_error
    WHERE cache_key = :cache_key
    """
)

CACHE_STATUS_SQL = text(
    """
    SELECT
        COUNT(*) AS snapshots,
        COUNT(*) FILTER (WHERE source_date = :today) AS atualizados_hoje,
        MAX(updated_at) AS ultima_atualizacao
    FROM public.dashboard_daily_cache
    """
)

# Campos de período não fazem parte da identidade estável usada para localizar
# um snapshot anterior. Todos os demais filtros (empresa, origem, plano etc.)
# continuam sendo respeitados no fallback.
_TEMPORAL_KEYS = {
    "ano",
    "mes",
    "year",
    "month",
    "data_inicio",
    "data_fim",
    "start_date",
    "end_date",
    "periodo_inicio",
    "periodo_fim",
}


def _today() -> date:
    return datetime.now(TZ).date()


def _normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    return jsonable_encoder(params)


def _stable_params(params: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_params(params)
    return {
        key: value
        for key, value in normalized.items()
        if key not in _TEMPORAL_KEYS
    }


def build_cache_key(page: str, params: dict[str, Any]) -> str:
    normalized = _normalize_params(params)
    raw = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{page}:{digest}"


def _json_string(value: Any) -> str:
    return json.dumps(jsonable_encoder(value), ensure_ascii=False, separators=(",", ":"))


def _normalize_source_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def get_snapshot(page: str, params: dict[str, Any]) -> dict[str, Any] | None:
    cache_key = build_cache_key(page, params)
    with supabase_engine.connect() as connection:
        row = connection.execute(GET_CACHE_SQL, {"cache_key": cache_key}).mappings().first()
    return dict(row) if row else None


def get_latest_compatible_snapshot(page: str, params: dict[str, Any]) -> dict[str, Any] | None:
    stable = _stable_params(params)
    with supabase_engine.connect() as connection:
        row = connection.execute(
            GET_FALLBACK_SQL,
            {
                "page": page,
                "stable_params": _json_string(stable),
            },
        ).mappings().first()
    return dict(row) if row else None


def save_snapshot(page: str, params: dict[str, Any], payload: Any) -> None:
    cache_key = build_cache_key(page, params)
    with supabase_engine.begin() as connection:
        connection.execute(
            UPSERT_CACHE_SQL,
            {
                "cache_key": cache_key,
                "page": page,
                "params": _json_string(_normalize_params(params)),
                "payload": _json_string(payload),
                "source_date": _today(),
            },
        )


def _acquire_refresh(cache_key: str) -> bool:
    with supabase_engine.begin() as connection:
        row = connection.execute(
            ACQUIRE_REFRESH_SQL,
            {"cache_key": cache_key},
        ).first()
    return row is not None


def _release_with_error(cache_key: str, exc: Exception) -> None:
    message = f"{type(exc).__name__}: {exc}"[:1500]
    try:
        with supabase_engine.begin() as connection:
            connection.execute(
                RELEASE_REFRESH_ERROR_SQL,
                {"cache_key": cache_key, "refresh_error": message},
            )
    except Exception:
        # Falha ao registrar erro não pode derrubar o dashboard.
        pass


def _claim_in_flight(cache_key: str) -> bool:
    with _IN_FLIGHT_LOCK:
        if cache_key in _IN_FLIGHT_KEYS:
            return False
        _IN_FLIGHT_KEYS.add(cache_key)
        return True


def _release_in_flight(cache_key: str) -> None:
    with _IN_FLIGHT_LOCK:
        _IN_FLIGHT_KEYS.discard(cache_key)


def _refresh_snapshot(
    page: str,
    params: dict[str, Any],
    builder: Callable[[], Any],
) -> None:
    cache_key = build_cache_key(page, params)
    try:
        # Uma única leitura pesada do backup por vez. Isso evita que Total,
        # Composição e Histórico concorram entre si e derrubem a conexão.
        with _SOURCE_REFRESH_LOCK:
            payload = builder()
            save_snapshot(page, params, payload)
    except Exception as exc:  # mantém o snapshot antigo se a origem falhar
        _release_with_error(cache_key, exc)
    finally:
        _release_in_flight(cache_key)


def _schedule_refresh(
    *,
    page: str,
    params: dict[str, Any],
    builder: Callable[[], Any],
    background_tasks: BackgroundTasks | None,
) -> None:
    cache_key = build_cache_key(page, params)
    if not _claim_in_flight(cache_key):
        return

    if background_tasks is not None:
        background_tasks.add_task(_refresh_snapshot, page, params, builder)
        return

    _refresh_snapshot(page, params, builder)


def _with_cache_info(
    payload: Any,
    *,
    requested_params: dict[str, Any],
    snapshot: dict[str, Any],
    fallback: bool,
) -> Any:
    # As APIs do dashboard retornam objetos. Copiamos para não alterar o JSON
    # original salvo no Supabase.
    if not isinstance(payload, dict):
        return payload

    result = copy.deepcopy(payload)
    result["_cache_info"] = {
        "fallback": fallback,
        "source_date": (
            _normalize_source_date(snapshot.get("source_date")).isoformat()
            if _normalize_source_date(snapshot.get("source_date"))
            else None
        ),
        "updated_at": jsonable_encoder(snapshot.get("updated_at")),
        "requested_params": _normalize_params(requested_params),
        "source_params": snapshot.get("params") or {},
        "refreshing": fallback,
    }
    return result


def cached_daily(
    *,
    page: str,
    params: dict[str, Any],
    builder: Callable[[], Any],
    background_tasks: BackgroundTasks | None = None,
) -> Any:
    """
    Leitura database-first e tolerante à indisponibilidade do backup:

    - Snapshot exato de hoje: retorna imediatamente.
    - Snapshot exato antigo: retorna imediatamente e atualiza em segundo plano.
    - Sem snapshot exato: usa o último snapshot compatível (mesmos filtros de
      negócio, outro período), retorna imediatamente e cria o novo snapshot em
      segundo plano.
    - Somente quando nunca houve dado compatível é necessário aguardar a origem.

    Assim uma virada de mês não deixa a página indisponível enquanto o backup
    diário está sendo atualizado.
    """
    normalized = _normalize_params(params)
    snapshot = get_snapshot(page, normalized)
    today = _today()

    if snapshot:
        source_date = _normalize_source_date(snapshot.get("source_date"))
        payload = snapshot.get("payload")

        if source_date == today:
            return _with_cache_info(
                payload,
                requested_params=normalized,
                snapshot=snapshot,
                fallback=False,
            )

        cache_key = build_cache_key(page, normalized)
        if _acquire_refresh(cache_key):
            _schedule_refresh(
                page=page,
                params=normalized,
                builder=builder,
                background_tasks=background_tasks,
            )

        return _with_cache_info(
            payload,
            requested_params=normalized,
            snapshot=snapshot,
            fallback=False,
        )

    # Virada de mês / primeiro acesso a um período novo. Em vez de bloquear a
    # tela, procuramos o último snapshot com os mesmos filtros de negócio.
    fallback = get_latest_compatible_snapshot(page, normalized)
    if fallback:
        _schedule_refresh(
            page=page,
            params=normalized,
            builder=builder,
            background_tasks=background_tasks,
        )
        return _with_cache_info(
            fallback.get("payload"),
            requested_params=normalized,
            snapshot=fallback,
            fallback=True,
        )

    # Primeiro uso absoluto deste recorte/filtro. Neste caso ainda precisamos
    # criar a primeira fotografia. A trava evita múltiplas consultas simultâneas.
    cache_key = build_cache_key(page, normalized)
    if not _claim_in_flight(cache_key):
        # Em uma corrida rara sem qualquer snapshot, esperamos a chamada que já
        # está produzindo o dado e tentamos ler novamente de forma curta.
        import time

        for _ in range(30):
            time.sleep(1)
            ready = get_snapshot(page, normalized)
            if ready:
                return _with_cache_info(
                    ready.get("payload"),
                    requested_params=normalized,
                    snapshot=ready,
                    fallback=False,
                )

    try:
        with _SOURCE_REFRESH_LOCK:
            payload = builder()
            save_snapshot(page, normalized, payload)
        created = get_snapshot(page, normalized)
        if created:
            return _with_cache_info(
                created.get("payload"),
                requested_params=normalized,
                snapshot=created,
                fallback=False,
            )
        return payload
    finally:
        _release_in_flight(cache_key)


def cache_status() -> dict[str, Any]:
    today = _today()
    with supabase_engine.connect() as connection:
        row = connection.execute(CACHE_STATUS_SQL, {"today": today}).mappings().first()
    if not row:
        return {"snapshots": 0, "atualizados_hoje": 0, "ultima_atualizacao": None}
    return {
        "snapshots": int(row.get("snapshots") or 0),
        "atualizados_hoje": int(row.get("atualizados_hoje") or 0),
        "ultima_atualizacao": row.get("ultima_atualizacao"),
    }
