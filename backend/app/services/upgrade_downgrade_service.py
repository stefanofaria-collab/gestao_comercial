from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import threading
from typing import Any

from sqlalchemy import bindparam, text

from app.database import source_engine, supabase_engine

VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}
VALID_DURATIONS = {"todos", "M", "T", "S", "A"}
CURRENT_REFRESH_MINUTES = 10
HISTORY_START = date(2024, 1, 1)

# Lista mantida exatamente de acordo com a consulta enviada para Upgrades e Downgrades.
EXCLUDED_IDS = (
    1, 24, 43, 2054, 123242, 216321, 346439, 388198, 196044, 10744,
    11807, 166104, 200440, 177551, 209512, 261147, 463295, 458966,
    403472, 226637, 414735, 361435, 376050, 367178, 263918, 447481,
    48142, 438358, 239292, 376338, 479723, 480921, 481136, 479405,
    482279, 124451, 174166, 184848, 186733, 248366, 444241, 462938,
    473336, 476148, 480590, 485458, 487138, 487525, 193364, 267891,
    369137, 484832, 3897, 209986, 334995, 423464, 379294, 278505,
    363585, 202297, 487136, 495757, 74618, 448705, 492276, 493057,
    493495, 495367, 495470, 500211, 500213, 500508, 500582, 502764,
    497959, 510928, 514140, 187078, 521671, 224287, 205324, 517101,
)

_CACHE_LOCK = threading.Lock()


# A consulta segue a lógica enviada pelo usuário: primeiro identifica o plano
# pago no período e depois procura o plano imediatamente anterior da empresa.
# Isso evita recalcular toda a série histórica toda vez que o mês atual muda.
SOURCE_MOVEMENTS_SQL = text(
    """
    WITH plano_atual AS (
        SELECT
            ep.id AS plano_atual_id,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            ep.empresa_id,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            CASE
                WHEN e.modalidade = 'ERP' THEN
                    CASE
                        WHEN ep.nome_plano = 'Bronze' THEN 1
                        WHEN ep.nome_plano = 'Prata' THEN 2
                        WHEN ep.nome_plano = 'Ouro' THEN 3
                        WHEN ep.nome_plano = 'Platina' THEN 4
                    END
                ELSE
                    CASE
                        WHEN ep.nome_plano = 'Bronze' THEN 1
                        WHEN ep.nome_plano = 'Prata' THEN 2
                        WHEN ep.nome_plano = 'Ouro' THEN 3
                        WHEN ep.nome_plano = 'Platina' THEN 4
                        WHEN ep.nome_plano = 'Plus' THEN 5
                        WHEN ep.nome_plano = 'Essencial' THEN 6
                        WHEN ep.nome_plano = 'Profissional' THEN 7
                        WHEN ep.nome_plano = 'Intermediário' THEN 8
                        WHEN ep.nome_plano = 'Master' THEN 9
                    END
            END AS peso_plano,
            ep.duracao,
            CASE
                WHEN ep.duracao = 'M' THEN 1
                WHEN ep.duracao = 'T' THEN 2
                WHEN ep.duracao = 'S' THEN 3
                WHEN ep.duracao = 'A' THEN 4
            END AS peso_duracao,
            CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor,
            ep.data_vencimento,
            ep.pago_em
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.valor > 5
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.pago_em >= :inicio
            AND ep.pago_em < :fim
            AND ep.nome_plano NOT LIKE '% recursos'
            AND ep.nome_plano NOT LIKE '% (+) recursos%'
            AND ep.nome_plano NOT LIKE '% + recursos%'
            AND ep.pago_em > e.ativou_em
            AND ep.empresa_id NOT IN :excluidos
    ),
    plano_anterior_ranqueado AS (
        SELECT
            pa.plano_atual_id,
            ep.id AS plano_anterior_id,
            ep.empresa_id,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
            CASE
                WHEN e.modalidade = 'ERP' THEN
                    CASE
                        WHEN ep.nome_plano = 'Bronze' THEN 1
                        WHEN ep.nome_plano = 'Prata' THEN 2
                        WHEN ep.nome_plano = 'Ouro' THEN 3
                        WHEN ep.nome_plano = 'Platina' THEN 4
                    END
                ELSE
                    CASE
                        WHEN ep.nome_plano = 'Bronze' THEN 1
                        WHEN ep.nome_plano = 'Prata' THEN 2
                        WHEN ep.nome_plano = 'Ouro' THEN 3
                        WHEN ep.nome_plano = 'Platina' THEN 4
                        WHEN ep.nome_plano = 'Plus' THEN 5
                        WHEN ep.nome_plano = 'Essencial' THEN 6
                        WHEN ep.nome_plano = 'Profissional' THEN 7
                        WHEN ep.nome_plano = 'Intermediário' THEN 8
                        WHEN ep.nome_plano = 'Master' THEN 9
                    END
            END AS peso_plano,
            ep.duracao,
            CASE
                WHEN ep.duracao = 'M' THEN 1
                WHEN ep.duracao = 'T' THEN 2
                WHEN ep.duracao = 'S' THEN 3
                WHEN ep.duracao = 'A' THEN 4
            END AS peso_duracao,
            CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor,
            ep.data_vencimento,
            ep.pago_em,
            ROW_NUMBER() OVER (
                PARTITION BY pa.plano_atual_id
                ORDER BY ep.pago_em DESC, ep.id DESC
            ) AS rn
        FROM plano_atual pa
        JOIN empresas_planos ep ON ep.empresa_id = pa.empresa_id
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.valor > 5
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.nome_plano NOT LIKE '% recursos'
            AND ep.nome_plano NOT LIKE '% (+) recursos%'
            AND ep.nome_plano NOT LIKE '% + recursos%'
            AND ep.pago_em IS NOT NULL
            AND ep.pago_em > e.ativou_em
            AND (
                ep.pago_em < pa.pago_em
                OR (ep.pago_em = pa.pago_em AND ep.id < pa.plano_atual_id)
            )
            AND ep.empresa_id NOT IN :excluidos
    ),
    plano_anterior AS (
        SELECT *
        FROM plano_anterior_ranqueado
        WHERE rn = 1
    )
    SELECT
        pa.plano_atual_id,
        pa.empresa_id,
        pa.modalidade,
        pa.empresa_indicacao_id,
        pa.tipo_cobranca,
        pant.nome_plano AS plano_anterior,
        pa.nome_plano AS plano_atual,
        pant.peso_plano AS peso_plano_anterior,
        pa.peso_plano,
        pant.duracao AS duracao_anterior,
        pa.duracao AS duracao_atual,
        pant.peso_duracao AS peso_duracao_anterior,
        pa.peso_duracao,
        pant.valor AS valor_anterior,
        pa.valor AS valor_atual,
        ROUND(
            CASE
                WHEN pa.peso_plano <> pant.peso_plano OR pa.peso_duracao <> pant.peso_duracao
                THEN pa.valor - pant.valor
                ELSE 0
            END,
            2
        ) AS diferenca_valor,
        pant.pago_em AS pagamento_anterior,
        pa.pago_em AS pagamento_atual,
        pa.data_vencimento
    FROM plano_atual pa
    LEFT JOIN plano_anterior pant ON pant.plano_atual_id = pa.plano_atual_id
    WHERE
        pa.peso_plano <> pant.peso_plano
        OR pa.peso_duracao <> pant.peso_duracao
    ORDER BY pa.pago_em, pa.plano_atual_id
    """
).bindparams(bindparam("excluidos", expanding=True))

CREATE_MOVEMENTS_TABLE_SQL = text(
    """
    CREATE TABLE IF NOT EXISTS public.upgrade_downgrade_movimentos_cache (
        plano_atual_id BIGINT PRIMARY KEY,
        mes_referencia DATE NOT NULL,
        empresa_id BIGINT NOT NULL,
        modalidade TEXT,
        empresa_indicacao_id BIGINT,
        tipo_cobranca TEXT,
        plano_anterior TEXT,
        plano_atual TEXT,
        peso_plano_anterior INTEGER,
        peso_plano INTEGER,
        duracao_anterior TEXT,
        duracao_atual TEXT,
        peso_duracao_anterior INTEGER,
        peso_duracao INTEGER,
        valor_anterior NUMERIC(14, 2),
        valor_atual NUMERIC(14, 2),
        diferenca_valor NUMERIC(14, 2),
        pagamento_anterior TIMESTAMP,
        pagamento_atual TIMESTAMP NOT NULL,
        data_vencimento DATE,
        tipo_movimento TEXT NOT NULL,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """
)
CREATE_STATUS_TABLE_SQL = text(
    """
    CREATE TABLE IF NOT EXISTS public.upgrade_downgrade_cache_status (
        mes_referencia DATE PRIMARY KEY,
        fechado BOOLEAN NOT NULL DEFAULT FALSE,
        quantidade INTEGER NOT NULL DEFAULT 0,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """
)
CREATE_INDEXES_SQL = (
    text("CREATE INDEX IF NOT EXISTS idx_ud_cache_mes ON public.upgrade_downgrade_movimentos_cache (mes_referencia)"),
    text("CREATE INDEX IF NOT EXISTS idx_ud_cache_pagamento ON public.upgrade_downgrade_movimentos_cache (pagamento_atual)"),
    text("CREATE INDEX IF NOT EXISTS idx_ud_cache_empresa ON public.upgrade_downgrade_movimentos_cache (empresa_id)"),
    text("CREATE INDEX IF NOT EXISTS idx_ud_cache_plano ON public.upgrade_downgrade_movimentos_cache (plano_atual)"),
    text("CREATE INDEX IF NOT EXISTS idx_ud_cache_duracao ON public.upgrade_downgrade_movimentos_cache (duracao_atual)"),
)

DELETE_RANGE_CACHE_SQL = text(
    """
    DELETE FROM public.upgrade_downgrade_movimentos_cache
    WHERE mes_referencia >= :inicio AND mes_referencia < :fim
    """
)
INSERT_CACHE_SQL = text(
    """
    INSERT INTO public.upgrade_downgrade_movimentos_cache (
        plano_atual_id, mes_referencia, empresa_id, modalidade, empresa_indicacao_id,
        tipo_cobranca, plano_anterior, plano_atual, peso_plano_anterior, peso_plano,
        duracao_anterior, duracao_atual, peso_duracao_anterior, peso_duracao,
        valor_anterior, valor_atual, diferenca_valor, pagamento_anterior,
        pagamento_atual, data_vencimento, tipo_movimento, atualizado_em
    ) VALUES (
        :plano_atual_id, :mes_referencia, :empresa_id, :modalidade, :empresa_indicacao_id,
        :tipo_cobranca, :plano_anterior, :plano_atual, :peso_plano_anterior, :peso_plano,
        :duracao_anterior, :duracao_atual, :peso_duracao_anterior, :peso_duracao,
        :valor_anterior, :valor_atual, :diferenca_valor, :pagamento_anterior,
        :pagamento_atual, :data_vencimento, :tipo_movimento, NOW()
    )
    ON CONFLICT (plano_atual_id) DO UPDATE SET
        mes_referencia = EXCLUDED.mes_referencia,
        empresa_id = EXCLUDED.empresa_id,
        modalidade = EXCLUDED.modalidade,
        empresa_indicacao_id = EXCLUDED.empresa_indicacao_id,
        tipo_cobranca = EXCLUDED.tipo_cobranca,
        plano_anterior = EXCLUDED.plano_anterior,
        plano_atual = EXCLUDED.plano_atual,
        peso_plano_anterior = EXCLUDED.peso_plano_anterior,
        peso_plano = EXCLUDED.peso_plano,
        duracao_anterior = EXCLUDED.duracao_anterior,
        duracao_atual = EXCLUDED.duracao_atual,
        peso_duracao_anterior = EXCLUDED.peso_duracao_anterior,
        peso_duracao = EXCLUDED.peso_duracao,
        valor_anterior = EXCLUDED.valor_anterior,
        valor_atual = EXCLUDED.valor_atual,
        diferenca_valor = EXCLUDED.diferenca_valor,
        pagamento_anterior = EXCLUDED.pagamento_anterior,
        pagamento_atual = EXCLUDED.pagamento_atual,
        data_vencimento = EXCLUDED.data_vencimento,
        tipo_movimento = EXCLUDED.tipo_movimento,
        atualizado_em = NOW()
    """
)

# Inserção em lote via cursor nativo do psycopg. O projeto pode ter listeners
# do SQLAlchemy no processo local; enviar uma lista de dicionários para
# Connection.execute() dispara executemany e pode conflitar com esses listeners.
# O cursor nativo preserva a mesma transação e evita esse conflito.
INSERT_CACHE_DBAPI_SQL = """
    INSERT INTO public.upgrade_downgrade_movimentos_cache (
        plano_atual_id, mes_referencia, empresa_id, modalidade, empresa_indicacao_id,
        tipo_cobranca, plano_anterior, plano_atual, peso_plano_anterior, peso_plano,
        duracao_anterior, duracao_atual, peso_duracao_anterior, peso_duracao,
        valor_anterior, valor_atual, diferenca_valor, pagamento_anterior,
        pagamento_atual, data_vencimento, tipo_movimento, atualizado_em
    ) VALUES (
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s, NOW()
    )
    ON CONFLICT (plano_atual_id) DO UPDATE SET
        mes_referencia = EXCLUDED.mes_referencia,
        empresa_id = EXCLUDED.empresa_id,
        modalidade = EXCLUDED.modalidade,
        empresa_indicacao_id = EXCLUDED.empresa_indicacao_id,
        tipo_cobranca = EXCLUDED.tipo_cobranca,
        plano_anterior = EXCLUDED.plano_anterior,
        plano_atual = EXCLUDED.plano_atual,
        peso_plano_anterior = EXCLUDED.peso_plano_anterior,
        peso_plano = EXCLUDED.peso_plano,
        duracao_anterior = EXCLUDED.duracao_anterior,
        duracao_atual = EXCLUDED.duracao_atual,
        peso_duracao_anterior = EXCLUDED.peso_duracao_anterior,
        peso_duracao = EXCLUDED.peso_duracao,
        valor_anterior = EXCLUDED.valor_anterior,
        valor_atual = EXCLUDED.valor_atual,
        diferenca_valor = EXCLUDED.diferenca_valor,
        pagamento_anterior = EXCLUDED.pagamento_anterior,
        pagamento_atual = EXCLUDED.pagamento_atual,
        data_vencimento = EXCLUDED.data_vencimento,
        tipo_movimento = EXCLUDED.tipo_movimento,
        atualizado_em = NOW()
"""

INSERT_CACHE_FIELDS = (
    "plano_atual_id",
    "mes_referencia",
    "empresa_id",
    "modalidade",
    "empresa_indicacao_id",
    "tipo_cobranca",
    "plano_anterior",
    "plano_atual",
    "peso_plano_anterior",
    "peso_plano",
    "duracao_anterior",
    "duracao_atual",
    "peso_duracao_anterior",
    "peso_duracao",
    "valor_anterior",
    "valor_atual",
    "diferenca_valor",
    "pagamento_anterior",
    "pagamento_atual",
    "data_vencimento",
    "tipo_movimento",
)
UPSERT_STATUS_SQL = text(
    """
    INSERT INTO public.upgrade_downgrade_cache_status (
        mes_referencia, fechado, quantidade, atualizado_em
    ) VALUES (
        :mes_referencia, :fechado, :quantidade, NOW()
    )
    ON CONFLICT (mes_referencia) DO UPDATE SET
        fechado = EXCLUDED.fechado,
        quantidade = EXCLUDED.quantidade,
        atualizado_em = NOW()
    """
)
STATUS_SQL = text(
    """
    SELECT mes_referencia, fechado, quantidade, atualizado_em
    FROM public.upgrade_downgrade_cache_status
    ORDER BY mes_referencia
    """
)

CACHE_ROWS_SQL = text(
    """
    SELECT
        plano_atual_id,
        mes_referencia,
        empresa_id,
        modalidade,
        empresa_indicacao_id,
        tipo_cobranca,
        plano_anterior,
        plano_atual,
        peso_plano_anterior,
        peso_plano,
        duracao_anterior,
        duracao_atual,
        peso_duracao_anterior,
        peso_duracao,
        valor_anterior,
        valor_atual,
        diferenca_valor,
        pagamento_anterior,
        pagamento_atual,
        data_vencimento,
        tipo_movimento
    FROM public.upgrade_downgrade_movimentos_cache
    WHERE
        mes_referencia >= :inicio
        AND mes_referencia < :fim
        AND (
            :empresa = 'todos'
            OR (:empresa = 'gestaoclick' AND modalidade = 'ERP')
            OR (:empresa = 'clicknotas' AND modalidade IN ('NFE', 'FIS'))
        )
        AND (
            :origem = 'todos'
            OR (:origem = 'gestaoclick' AND empresa_indicacao_id = 1)
            OR (:origem = 'parceiro' AND empresa_indicacao_id <> 1)
        )
        AND (
            :pagador = 'todos'
            OR (:pagador = 'cliente' AND tipo_cobranca = 'E')
            OR (:pagador = 'parceiro' AND tipo_cobranca = 'P')
        )
        AND (:plano = 'todos' OR plano_atual = :plano)
        AND (:duracao = 'todos' OR duracao_atual = :duracao)
    ORDER BY pagamento_atual, plano_atual_id
    """
)


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _next_month(year: int, month: int) -> date:
    return date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)


def _next_month_date(value: date) -> date:
    return _next_month(value.year, value.month)


def _month_range(start: date, end_exclusive: date) -> list[date]:
    result: list[date] = []
    cursor = start.replace(day=1)
    while cursor < end_exclusive:
        result.append(cursor)
        cursor = _next_month_date(cursor)
    return result


def _validate(empresa: str, origem: str, pagador: str, duracao: str) -> None:
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Empresa inválida.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Origem inválida.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Responsável pelo pagamento inválido.")
    if duracao not in VALID_DURATIONS:
        raise ValueError("Duração inválida.")


def _duration_label(value: str | None) -> str:
    return {"M": "Mensal", "T": "Trimestral", "S": "Semestral", "A": "Anual"}.get(
        str(value or ""), str(value or "Não informado")
    )


def _movement_type(row: dict[str, Any]) -> str:
    plan_delta = int(row.get("peso_plano") or 0) - int(row.get("peso_plano_anterior") or 0)
    duration_delta = int(row.get("peso_duracao") or 0) - int(row.get("peso_duracao_anterior") or 0)

    has_up = plan_delta > 0 or duration_delta > 0
    has_down = plan_delta < 0 or duration_delta < 0
    if has_up and not has_down:
        return "Upgrade"
    if has_down and not has_up:
        return "Downgrade"
    if has_up and has_down:
        difference = float(row.get("diferenca_valor") or 0)
        if difference > 0:
            return "Upgrade"
        if difference < 0:
            return "Downgrade"
        return "Misto"
    return "Sem alteração"


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text_value = str(value).strip()
    if not text_value:
        return None
    try:
        return datetime.fromisoformat(text_value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _source_rows(start: date, end_exclusive: date) -> list[dict[str, Any]]:
    params = {
        "inicio": start,
        "fim": end_exclusive,
        "excluidos": EXCLUDED_IDS,
    }
    with source_engine.connect() as connection:
        raw = [dict(row) for row in connection.execute(SOURCE_MOVEMENTS_SQL, params).mappings().all()]

    result: list[dict[str, Any]] = []
    for row in raw:
        payment = _as_datetime(row.get("pagamento_atual"))
        if payment is None:
            continue
        item = dict(row)
        item["plano_atual_id"] = int(item["plano_atual_id"])
        item["empresa_id"] = int(item["empresa_id"])
        item["empresa_indicacao_id"] = (
            int(item["empresa_indicacao_id"]) if item.get("empresa_indicacao_id") is not None else None
        )
        item["mes_referencia"] = payment.date().replace(day=1)
        item["pagamento_atual"] = payment
        item["pagamento_anterior"] = _as_datetime(item.get("pagamento_anterior"))
        item["data_vencimento"] = _as_date(item.get("data_vencimento"))
        item["valor_anterior"] = float(item.get("valor_anterior") or 0)
        item["valor_atual"] = float(item.get("valor_atual") or 0)
        item["diferenca_valor"] = float(item.get("diferenca_valor") or 0)
        item["tipo_movimento"] = _movement_type(item)
        result.append(item)
    return result


def _ensure_schema() -> None:
    with supabase_engine.begin() as connection:
        connection.execute(CREATE_MOVEMENTS_TABLE_SQL)
        connection.execute(CREATE_STATUS_TABLE_SQL)
        for statement in CREATE_INDEXES_SQL:
            connection.execute(statement)


def _status_map() -> dict[date, dict[str, Any]]:
    _ensure_schema()
    with supabase_engine.connect() as connection:
        rows = [dict(row) for row in connection.execute(STATUS_SQL).mappings().all()]
    result: dict[date, dict[str, Any]] = {}
    for row in rows:
        month = _as_date(row.get("mes_referencia"))
        if month is not None:
            result[month] = row
    return result


def _insert_cache_rows(connection: Any, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    # Usa a conexão DBAPI real que já participa da transação aberta pelo
    # SQLAlchemy. Isso mantém o lote rápido sem passar pelo executemany do
    # SQLAlchemy, que é exatamente onde ocorria o InvalidRequestError.
    raw_connection = connection.connection
    driver_connection = (
        getattr(raw_connection, "driver_connection", None)
        or getattr(raw_connection, "dbapi_connection", None)
        or raw_connection
    )
    cursor = driver_connection.cursor()
    try:
        for offset in range(0, len(rows), 1000):
            batch = rows[offset : offset + 1000]
            params = [
                tuple(row.get(field) for field in INSERT_CACHE_FIELDS)
                for row in batch
            ]
            cursor.executemany(INSERT_CACHE_DBAPI_SQL, params)
    finally:
        cursor.close()


def _replace_range(start: date, end_exclusive: date, rows: list[dict[str, Any]], *, close_past: bool) -> None:
    month_counts = {month: 0 for month in _month_range(start, end_exclusive)}
    for row in rows:
        month = row["mes_referencia"]
        month_counts[month] = month_counts.get(month, 0) + 1

    today_month = date.today().replace(day=1)
    with supabase_engine.begin() as connection:
        connection.execute(DELETE_RANGE_CACHE_SQL, {"inicio": start, "fim": end_exclusive})
        _insert_cache_rows(connection, rows)
        for month, count in month_counts.items():
            connection.execute(
                UPSERT_STATUS_SQL,
                {
                    "mes_referencia": month,
                    "fechado": bool(close_past and month < today_month),
                    "quantidade": count,
                },
            )


def _sync_range(start: date, end_exclusive: date, *, close_past: bool) -> int:
    rows = _source_rows(start, end_exclusive)
    _replace_range(start, end_exclusive, rows, close_past=close_past)
    return len(rows)


def sync_upgrade_downgrade_month(month: date, *, closed: bool | None = None) -> int:
    month = month.replace(day=1)
    end = _next_month_date(month)
    current_month = date.today().replace(day=1)
    should_close = month < current_month if closed is None else bool(closed)
    with _CACHE_LOCK:
        return _sync_range(month, end, close_past=should_close)


def bootstrap_upgrade_downgrade_cache() -> dict[str, Any]:
    """
    Cria o cache persistente e materializa apenas o que estiver faltando.

    - Primeira execução: carrega todo o histórico fechado em uma única consulta.
    - Depois: meses fechados não são recalculados.
    - Mês atual é atualizado e permanece aberto.
    """
    with _CACHE_LOCK:
        _ensure_schema()
        today = date.today()
        current_month = today.replace(day=1)
        statuses = _status_map()
        expected_closed = _month_range(HISTORY_START, current_month)

        missing_closed = [month for month in expected_closed if not statuses.get(month, {}).get("fechado")]
        historical_count = 0

        if missing_closed:
            # Primeira carga: uma consulta única de 2024 até o início do mês atual.
            if len(missing_closed) == len(expected_closed):
                historical_count = _sync_range(HISTORY_START, current_month, close_past=True)
            else:
                # Em viradas de mês, normalmente só o mês anterior cairá aqui.
                for month in missing_closed:
                    historical_count += _sync_range(month, _next_month_date(month), close_past=True)

        current_count = _sync_range(current_month, _next_month_date(current_month), close_past=False)

        return {
            "historico_processado": historical_count,
            "mes_atual_processado": current_count,
            "mes_atual": current_month.isoformat(),
        }


def refresh_current_month() -> None:
    try:
        sync_upgrade_downgrade_month(date.today().replace(day=1), closed=False)
    except Exception:
        # Atualização em segundo plano não pode derrubar a tela.
        pass


def prepare_cache_for_request(background_tasks: Any | None = None) -> None:
    """Garante histórico fechado e agenda somente a atualização do mês atual."""
    _ensure_schema()
    today = date.today()
    current_month = today.replace(day=1)
    statuses = _status_map()

    expected_closed = _month_range(HISTORY_START, current_month)
    missing_closed = [month for month in expected_closed if not statuses.get(month, {}).get("fechado")]

    if missing_closed:
        # Em condição normal isso só acontece na primeira execução ou na virada do mês.
        # Mantemos síncrono para nunca servir um histórico incompleto.
        with _CACHE_LOCK:
            statuses = _status_map()
            missing_closed = [month for month in expected_closed if not statuses.get(month, {}).get("fechado")]
            if missing_closed:
                if len(missing_closed) == len(expected_closed):
                    _sync_range(HISTORY_START, current_month, close_past=True)
                else:
                    for month in missing_closed:
                        _sync_range(month, _next_month_date(month), close_past=True)
        statuses = _status_map()

    current_status = statuses.get(current_month)
    if current_status is None:
        sync_upgrade_downgrade_month(current_month, closed=False)
        return

    updated_at = current_status.get("atualizado_em")
    if isinstance(updated_at, datetime):
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - updated_at.astimezone(timezone.utc)
    else:
        age = timedelta(days=1)

    if age >= timedelta(minutes=CURRENT_REFRESH_MINUTES):
        if background_tasks is not None:
            background_tasks.add_task(refresh_current_month)
        else:
            refresh_current_month()


def _cache_rows(
    *,
    empresa: str,
    origem: str,
    pagador: str,
    plano: str,
    duracao: str,
) -> list[dict[str, Any]]:
    today = date.today()
    current_end = _next_month(today.year, today.month)
    params = {
        "inicio": HISTORY_START,
        "fim": current_end,
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "plano": plano,
        "duracao": duracao,
    }
    with supabase_engine.connect() as connection:
        raw_rows = [dict(row) for row in connection.execute(CACHE_ROWS_SQL, params).mappings().all()]

    result: list[dict[str, Any]] = []
    for row in raw_rows:
        item = dict(row)
        for key in ("valor_anterior", "valor_atual", "diferenca_valor"):
            item[key] = float(item.get(key) or 0)
        for key in ("pagamento_anterior", "pagamento_atual", "data_vencimento", "mes_referencia"):
            value = item.get(key)
            if value is not None and hasattr(value, "isoformat"):
                item[key] = value.isoformat()
        result.append(item)
    return result


def _aggregate_de_para(rows: list[dict[str, Any]], dimension: str) -> list[dict[str, Any]]:
    if dimension == "plano":
        before_key, after_key = "plano_anterior", "plano_atual"
        weight_before, weight_after = "peso_plano_anterior", "peso_plano"
        label = lambda value: str(value or "Não informado")
    else:
        before_key, after_key = "duracao_anterior", "duracao_atual"
        weight_before, weight_after = "peso_duracao_anterior", "peso_duracao"
        label = _duration_label

    grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        before = row.get(before_key)
        after = row.get(after_key)
        if before == after:
            continue
        delta = int(row.get(weight_after) or 0) - int(row.get(weight_before) or 0)
        movement = "Upgrade" if delta > 0 else "Downgrade" if delta < 0 else "Sem alteração"
        key = (label(before), label(after), movement)
        item = grouped.setdefault(
            key,
            {
                "de": key[0],
                "para": key[1],
                "movimento": movement,
                "quantidade": 0,
                "saldo_quantidade": 0,
                "saldo_financeiro": 0.0,
            },
        )
        item["quantidade"] += 1
        item["saldo_quantidade"] += 1 if movement == "Upgrade" else -1 if movement == "Downgrade" else 0
        item["saldo_financeiro"] += float(row.get("diferenca_valor") or 0)

    values = list(grouped.values())
    for item in values:
        item["saldo_financeiro"] = round(float(item["saldo_financeiro"]), 2)
    values.sort(key=lambda item: (-int(item["quantidade"]), item["de"], item["para"]))
    return values


def get_upgrade_downgrade_dashboard(
    *,
    ano: int,
    meses: list[int],
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    plano: str = "todos",
    duracao: str = "todos",
) -> dict[str, Any]:
    _validate(empresa, origem, pagador, duracao)
    if ano < 2024:
        raise ValueError("O histórico começa em 2024.")

    clean_months = sorted({int(month) for month in meses if 1 <= int(month) <= 12})
    if not clean_months:
        raise ValueError("Informe ao menos um mês.")

    rows = _cache_rows(
        empresa=empresa,
        origem=origem,
        pagador=pagador,
        plano=plano,
        duracao=duracao,
    )

    selected_rows: list[dict[str, Any]] = []
    for row in rows:
        payment = _as_date(row.get("pagamento_atual"))
        if payment is not None and payment.year == ano and payment.month in clean_months:
            selected_rows.append(row)

    upgrades = sum(1 for row in selected_rows if row.get("tipo_movimento") == "Upgrade")
    downgrades = sum(1 for row in selected_rows if row.get("tipo_movimento") == "Downgrade")
    mixed = sum(1 for row in selected_rows if row.get("tipo_movimento") == "Misto")

    upgrades_financeiro = round(
        sum(max(float(row.get("diferenca_valor") or 0), 0.0) for row in selected_rows), 2
    )
    downgrades_financeiro = round(
        sum(max(-float(row.get("diferenca_valor") or 0), 0.0) for row in selected_rows), 2
    )
    total_financeiro = round(upgrades_financeiro + downgrades_financeiro, 2)
    saldo_financeiro = round(upgrades_financeiro - downgrades_financeiro, 2)

    monthly: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "total": 0,
            "upgrades": 0,
            "downgrades": 0,
            "saldo": 0,
            "total_financeiro": 0.0,
            "upgrades_financeiro": 0.0,
            "downgrades_financeiro": 0.0,
            "saldo_financeiro": 0.0,
        }
    )

    today = date.today()
    for month in _month_range(HISTORY_START, _next_month(today.year, today.month)):
        monthly[f"{month.year:04d}-{month.month:02d}"]

    for row in rows:
        payment = _as_date(row.get("pagamento_atual"))
        if payment is None:
            continue
        key = f"{payment.year:04d}-{payment.month:02d}"
        item = monthly[key]
        item["total"] += 1
        if row.get("tipo_movimento") == "Upgrade":
            item["upgrades"] += 1
        elif row.get("tipo_movimento") == "Downgrade":
            item["downgrades"] += 1
        item["saldo"] = item["upgrades"] - item["downgrades"]

        difference = float(row.get("diferenca_valor") or 0)
        if difference > 0:
            item["upgrades_financeiro"] += difference
        elif difference < 0:
            item["downgrades_financeiro"] += abs(difference)
        item["total_financeiro"] = item["upgrades_financeiro"] + item["downgrades_financeiro"]
        item["saldo_financeiro"] = item["upgrades_financeiro"] - item["downgrades_financeiro"]

    history = []
    for key in sorted(monthly):
        year_text, month_text = key.split("-")
        item = monthly[key]
        history.append(
            {
                "mes": key,
                "ano": int(year_text),
                "numero_mes": int(month_text),
                "total": int(item["total"]),
                "upgrades": int(item["upgrades"]),
                "downgrades": int(item["downgrades"]),
                "saldo": int(item["saldo"]),
                "total_financeiro": round(float(item["total_financeiro"]), 2),
                "upgrades_financeiro": round(float(item["upgrades_financeiro"]), 2),
                "downgrades_financeiro": round(float(item["downgrades_financeiro"]), 2),
                "saldo_financeiro": round(float(item["saldo_financeiro"]), 2),
            }
        )

    selected_start = _month_start(ano, clean_months[0])
    selected_end = _next_month(ano, clean_months[-1])
    return {
        "periodo": {
            "ano": ano,
            "meses": clean_months,
            "inicio": selected_start.isoformat(),
            "fim": (selected_end - timedelta(days=1)).isoformat(),
            "ano_completo": clean_months == list(range(1, 13)),
        },
        "filtros": {
            "empresa": empresa,
            "origem": origem,
            "pagador": pagador,
            "plano": plano,
            "duracao": duracao,
        },
        "resumo": {
            "total_alteracoes": len(selected_rows),
            "upgrades": upgrades,
            "downgrades": downgrades,
            "saldo": upgrades - downgrades,
            "mistos": mixed,
            "total_financeiro": total_financeiro,
            "upgrades_financeiro": upgrades_financeiro,
            "downgrades_financeiro": downgrades_financeiro,
            "saldo_financeiro": saldo_financeiro,
        },
        "historico": history,
        "de_para_planos": _aggregate_de_para(selected_rows, "plano"),
        "de_para_duracoes": _aggregate_de_para(selected_rows, "duracao"),
    }
