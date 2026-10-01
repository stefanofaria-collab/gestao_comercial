from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from app.database import supabase_engine

TZ = ZoneInfo("America/Sao_Paulo")
REFRESH_LOCK_MINUTES = 20

GET_CACHE_SQL = text(
    """
    SELECT cache_key, page, params, payload, source_date, updated_at,
           refresh_started_at, refresh_error
    FROM public.dashboard_daily_cache
    WHERE cache_key = :cache_key
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
    SET refresh_started_at = now(),
        refresh_error = :refresh_error,
        updated_at = updated_at
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


def _today() -> date:
    return datetime.now(TZ).date()


def _normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    return jsonable_encoder(params)


def build_cache_key(page: str, params: dict[str, Any]) -> str:
    normalized = _normalize_params(params)
    raw = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{page}:{digest}"


def _json_string(value: Any) -> str:
    return json.dumps(jsonable_encoder(value), ensure_ascii=False, separators=(",", ":"))


def get_snapshot(page: str, params: dict[str, Any]) -> dict[str, Any] | None:
    cache_key = build_cache_key(page, params)
    with supabase_engine.connect() as connection:
        row = connection.execute(GET_CACHE_SQL, {"cache_key": cache_key}).mappings().first()
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
            {
                "cache_key": cache_key,
            },
        ).first()
    return row is not None


def _release_with_error(cache_key: str, exc: Exception) -> None:
    message = f"{type(exc).__name__}: {exc}"[:1500]
    with supabase_engine.begin() as connection:
        connection.execute(
            RELEASE_REFRESH_ERROR_SQL,
            {"cache_key": cache_key, "refresh_error": message},
        )


def _refresh_snapshot(
    page: str,
    params: dict[str, Any],
    builder: Callable[[], Any],
) -> None:
    cache_key = build_cache_key(page, params)
    try:
        payload = builder()
        save_snapshot(page, params, payload)
    except Exception as exc:  # mantém o snapshot antigo se a origem falhar
        _release_with_error(cache_key, exc)


def cached_daily(
    *,
    page: str,
    params: dict[str, Any],
    builder: Callable[[], Any],
    background_tasks: BackgroundTasks | None = None,
) -> Any:
    """
    Leitura database-first:
    - Sempre tenta ler o snapshot do Supabase.
    - Se o snapshot é de hoje, retorna imediatamente.
    - Se é antigo, retorna o snapshot antigo imediatamente e atualiza em segundo plano.
    - Se nunca existiu snapshot, consulta a origem uma única vez, salva no Supabase e retorna.
    """
    normalized = _normalize_params(params)
    snapshot = get_snapshot(page, normalized)
    today = _today()

    if snapshot:
        source_date = snapshot.get("source_date")
        if isinstance(source_date, datetime):
            source_date = source_date.date()
        elif isinstance(source_date, str):
            source_date = date.fromisoformat(source_date[:10])

        payload = snapshot.get("payload")

        if source_date == today:
            return payload

        cache_key = build_cache_key(page, normalized)
        if _acquire_refresh(cache_key):
            if background_tasks is not None:
                background_tasks.add_task(_refresh_snapshot, page, normalized, builder)
            else:
                # Sem BackgroundTasks, atualiza depois da leitura somente em chamadas internas.
                _refresh_snapshot(page, normalized, builder)
        return payload

    # Primeira carga histórica desse recorte: precisa buscar a origem uma vez.
    payload = builder()
    save_snapshot(page, normalized, payload)
    return payload


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
