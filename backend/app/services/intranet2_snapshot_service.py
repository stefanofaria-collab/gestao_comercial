"""Snapshot pesquisavel da Intranet 2.0, sem acesso MySQL pela Vercel.

Os dados pessoais ficam em um schema privado do PostgreSQL, nao exposto
pela API REST publica do Supabase. Somente o backend autenticado consulta.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.database import source_engine, supabase_engine
from app.services.intranet2_service import (
    SEARCH_SQL,
    _query_params,
    _score_map,
    _serialize_search_row,
    normalize_filters,
)
from app.services.payment_metrics_service import get_payment_metrics

LOGGER = logging.getLogger(__name__)
TABLE_NAME = "clickdados_private.intranet2_clients"

CREATE_SCHEMA = text("CREATE SCHEMA IF NOT EXISTS clickdados_private")
CREATE_TABLE = text(
    """
    CREATE TABLE IF NOT EXISTS clickdados_private.intranet2_clients (
        empresa_id BIGINT PRIMARY KEY,
        payload JSONB NOT NULL,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """
)
INSERT_BATCH = text(
    """
    INSERT INTO clickdados_private.intranet2_clients (empresa_id, payload, atualizado_em)
    SELECT item.empresa_id, item.payload, NOW()
    FROM jsonb_to_recordset(CAST(:batch AS JSONB))
        AS item(empresa_id BIGINT, payload JSONB)
    """
)
TODAY_SQL = "(NOW() AT TIME ZONE 'America/Sao_Paulo')::date"


class Intranet2SnapshotUnavailable(RuntimeError):
    pass


def sync_intranet2_snapshot() -> int:
    """Executado somente no Windows autorizado a ler o MySQL.

    A troca ocorre numa unica transacao PostgreSQL: em caso de falha,
    os dados anteriores continuam disponiveis.
    """
    print("Intranet 2.0: consultando clientes no MySQL...", flush=True)
    params = _query_params(normalize_filters())
    with source_engine.connect() as connection:
        raw_rows = [
            dict(row)
            for row in connection.execute(SEARCH_SQL, params).mappings().all()
        ]

    if not raw_rows:
        raise RuntimeError(
            "A busca de origem da Intranet retornou zero clientes. "
            "Snapshot anterior preservado para evitar apagamento acidental."
        )

    print(f"Intranet 2.0: {len(raw_rows)} clientes recebidos.", flush=True)
    scores = _score_map()
    ids = [int(row["empresa_id"]) for row in raw_rows]

    # O filtro 'ultrapassaram a media de atraso' depende destas metricas.
    # Calculamos fora da requisicao web, na maquina com acesso ao MySQL.
    print("Intranet 2.0: calculando medias historicas de pagamento...", flush=True)
    payment_metrics = get_payment_metrics(ids)

    payloads: list[dict[str, Any]] = []
    for row in raw_rows:
        serialized = _serialize_search_row(row, scores)
        metric = payment_metrics.get(int(row["empresa_id"]), {})
        serialized["_media_dias_pagamento_real"] = metric.get("media_dias_pagamento_real")
        payloads.append({
            "empresa_id": int(row["empresa_id"]),
            "payload": serialized,
        })

    print("Intranet 2.0: gravando snapshot privado no Supabase...", flush=True)
    with supabase_engine.begin() as connection:
        connection.execute(CREATE_SCHEMA)
        connection.execute(CREATE_TABLE)
        connection.execute(text("DELETE FROM clickdados_private.intranet2_clients"))

        # jsonb_to_recordset insere centenas de clientes por consulta.
        # Isso evita milhares de idas e voltas ao Supabase.
        for start in range(0, len(payloads), 300):
            batch = payloads[start:start + 300]
            connection.execute(
                INSERT_BATCH,
                {"batch": json.dumps(batch, ensure_ascii=False, default=str)},
            )

    print(f"Intranet 2.0: {len(payloads)} clientes sincronizados no Supabase.", flush=True)
    return len(payloads)


def _local_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _fresh_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Atualiza campos que dependem da passagem de dias apos a sincronizacao."""
    item = dict(raw)
    today = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    last_access = _local_date(item.get("ultimo_acesso"))
    due_date = _local_date(item.get("data_vencimento"))
    if last_access:
        item["dias_sem_acesso"] = max((today - last_access).days, 0)
    if due_date:
        item["dias_vencido"] = (today - due_date).days
        item["ativo"] = due_date >= today and item.get("pago_em") is not None
    return item


def _date_expression(column: str) -> str:
    return f"CAST(NULLIF(LEFT(s.payload->>'{column}', 10), '') AS DATE)"


def _search_conditions(filters: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    clauses: list[str] = []
    params: dict[str, Any] = {}

    for field in ("razao_social", "email"):
        value = filters[field]
        if value:
            clauses.append(f"COALESCE(s.payload->>'{field}', '') ILIKE :{field}_pattern")
            params[f"{field}_pattern"] = f"%{value}%"

    if filters["telefone"]:
        clauses.append(
            "(REGEXP_REPLACE(COALESCE(s.payload->>'telefone', ''), '[^0-9]', '', 'g') "
            "LIKE :telefone_padrao OR "
            "REGEXP_REPLACE(COALESCE(s.payload->>'celular', ''), '[^0-9]', '', 'g') "
            "LIKE :telefone_padrao)"
        )
        cleaned = "".join(x for x in filters["telefone"] if x.isdigit())
        params["telefone_padrao"] = f"%{cleaned}%"

    if filters["cidade"]:
        clauses.append("LOWER(COALESCE(s.payload->>'cidade', '')) = LOWER(:cidade)")
        params["cidade"] = filters["cidade"]

    for field, source in (
        ("estado", "estado"), ("plano", "nome_plano"), ("duracao", "duracao")
    ):
        if filters[field]:
            clauses.append(f"COALESCE(s.payload->>'{source}', '') = :{field}")
            params[field] = filters[field]

    for field, source in (
        ("empresa", "empresa"), ("origem", "origem"), ("pagador", "pagador")
    ):
        if filters[field] != "todos":
            display_values = {
                "empresa": {"gestaoclick": "GestãoClick", "clicknotas": "ClickNotas"},
                "origem": {"gestaoclick": "GestãoClick", "parceiro": "Parceiro"},
                "pagador": {"cliente": "Cliente", "parceiro": "Parceiro"},
            }
            clauses.append(f"s.payload->>'{source}' = :{field}")
            params[field] = display_values[field][filters[field]]

    for field in ("ultimo_acesso", "vencimento", "pagamento"):
        column = {
            "ultimo_acesso": "ultimo_acesso",
            "vencimento": "data_vencimento",
            "pagamento": "pago_em",
        }[field]
        expr = _date_expression(column)
        for suffix, operator in (("de", ">="), ("ate", "<=")):
            key = f"{field}_{suffix}"
            if filters[key] is not None:
                clauses.append(f"{expr} {operator} :{key}")
                params[key] = filters[key]

    access = _date_expression("ultimo_acesso")
    due = _date_expression("data_vencimento")
    age_access = f"(CAST({TODAY_SQL} AS DATE) - {access})"
    days_overdue = f"({TODAY_SQL} - {due})"

    for name, expression, predicate in (
        ("sem_acesso_min", age_access, f"{access} IS NOT NULL"),
        ("sem_acesso_max", age_access, f"{access} IS NOT NULL"),
        ("vencido_min", days_overdue, f"{due} < {TODAY_SQL}"),
        ("vencido_max", days_overdue, f"{due} < {TODAY_SQL}"),
        ("vencem_em_min", f"({due} - {TODAY_SQL})", f"{due} >= {TODAY_SQL}"),
        ("vencem_em_max", f"({due} - {TODAY_SQL})", f"{due} >= {TODAY_SQL}"),
    ):
        if filters[name] is not None:
            comparison = ">=" if name.endswith("_min") else "<="
            clauses.append(f"({predicate} AND {expression} {comparison} :{name})")
            params[name] = filters[name]

    if filters["somente_ativos"] != "todos":
        active = f"({due} >= {TODAY_SQL} AND s.payload->>'pago_em' IS NOT NULL)"
        clauses.append(active if filters["somente_ativos"] == "sim" else f"NOT {active}")

    if filters["valor_minimo"] > 0:
        clauses.append("CAST(COALESCE(s.payload->>'valor', '0') AS NUMERIC) >= :valor_minimo")
        params["valor_minimo"] = filters["valor_minimo"]

    for key, operator in (
        ("tempo_cliente_min_meses", ">="),
        ("tempo_cliente_max_meses", "<="),
    ):
        if filters[key] is not None:
            clauses.append(f"CAST(COALESCE(s.payload->>'tempo_vida', '0') AS NUMERIC) {operator} :{key}")
            params[key] = filters[key]

    if filters["cliente_com_atendimento"] != "todos":
        exists = (
            "EXISTS (SELECT 1 FROM public.atendimentos_zendesk a "
            "WHERE a.empresa_id = s.empresa_id)"
        )
        clauses.append(exists if filters["cliente_com_atendimento"] == "sim" else f"NOT {exists}")

    if filters["somente_ultrapassou_media"]:
        clauses.append(
            f"({due} < {TODAY_SQL} "
            "AND s.payload->>'_media_dias_pagamento_real' IS NOT NULL "
            f"AND ({TODAY_SQL} - {due}) > "
            "GREATEST(CAST(s.payload->>'_media_dias_pagamento_real' AS NUMERIC), 0))"
        )

    return (" AND ".join(clauses) if clauses else "TRUE"), params


def _snapshot_exists(connection) -> bool:
    return bool(
        connection.execute(
            text("SELECT to_regclass('clickdados_private.intranet2_clients') IS NOT NULL")
        ).scalar()
    )


def search_intranet2_snapshot(*, page: int = 1, limit: int = 20, **kwargs: Any) -> dict[str, Any]:
    filters = normalize_filters(**kwargs)
    page = max(int(page), 1)
    limit = min(200, max(int(limit), 1))
    where, params = _search_conditions(filters)
    params["limit"] = limit
    params["offset"] = (page - 1) * limit

    count_sql = text(
        f"SELECT COUNT(*) FROM {TABLE_NAME} s WHERE {where}"
    )
    read_sql = text(
        f"SELECT s.payload FROM {TABLE_NAME} s WHERE {where} "
        f"ORDER BY LEFT(s.payload->>'data_vencimento', 10) ASC NULLS LAST, "
        f"s.empresa_id ASC LIMIT :limit OFFSET :offset"
    )
    with supabase_engine.connect() as connection:
        if not _snapshot_exists(connection):
            raise Intranet2SnapshotUnavailable(
                "A base de clientes da Intranet 2.0 ainda nao foi sincronizada. "
                "Atualize o codigo no Windows e execute a sincronizacao local."
            )
        total = int(connection.execute(count_sql, params).scalar() or 0)
        records = connection.execute(read_sql, params).scalars().all()

    rows = [
        _fresh_row(json.loads(item) if isinstance(item, str) else item)
        for item in records
    ]
    return {
        "filtros": {
            key: str(value) if isinstance(value, date) else value
            for key, value in filters.items() if not key.endswith("_meses")
        },
        "page": page,
        "limit": limit,
        "total": total,
        "total_paginas": max(1, (total + limit - 1) // limit),
        "rows": rows,
    }


def export_intranet2_snapshot(**kwargs: Any) -> dict[str, Any]:
    """Exporta somente consultas filtradas, sem liberar dados a usuarios anonimos."""
    filters = normalize_filters(**kwargs)
    where, params = _search_conditions(filters)
    sql = text(
        f"SELECT s.payload FROM {TABLE_NAME} s WHERE {where} "
        f"ORDER BY LEFT(s.payload->>'data_vencimento', 10) ASC NULLS LAST, s.empresa_id ASC"
    )

    with supabase_engine.connect() as connection:
        if not _snapshot_exists(connection):
            raise Intranet2SnapshotUnavailable(
                "A base de clientes ainda nao foi sincronizada no Supabase."
            )
        records = connection.execute(sql, params).scalars().all()

    rows = [
        _fresh_row(json.loads(item) if isinstance(item, str) else item)
        for item in records
    ]
    return {
        "filtros": {
            key: str(value) if isinstance(value, date) else value
            for key, value in filters.items() if not key.endswith("_meses")
        },
        "total": len(rows),
        "rows": rows,
    }
