from __future__ import annotations

import html
import re
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import bindparam, text

from app.config import settings
from app.database import source_engine, supabase_engine

TZ_BRASIL = ZoneInfo("America/Sao_Paulo")
SEARCH_PAGE_SIZE = 500
WORKERS_ZENDESK = 8
LOTE_INSERT_SUPABASE = 1000
CONTEXT_BATCH_SIZE = 10000
MYSQL_ID_BATCH = 400

CANAIS_CHAT = {"chat", "messaging", "native_messaging"}
DOMINIOS_INTERNOS = {"clickdigital.com.br", "beteltecnologia.com.br"}
DOMINIOS_EMAIL_PUBLICO = {
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "hotmail.es",
    "outlook.com", "outlook.com.br", "live.com", "live.com.br", "msn.com",
    "yahoo.com", "yahoo.com.br", "yahoo.es", "icloud.com", "me.com", "mac.com",
    "aol.com", "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br", "globo.com",
    "protonmail.com", "proton.me", "zoho.com", "gmx.com", "gmx.net", "mail.com",
    "ymail.com", "rocketmail.com",
}
TAGS_IGNORAR = {
    "cliente_existente", "chat_perdido", "inatividade_chat", "agent_copilot_enabled",
    "grupo_suporte", "grupo_sup_nfboleto", "grupo_comercial", "suporte_chat",
    "suporte_chat_notas", "comercial", "expansão", "renovação", "lead_sem_cadastro",
    "atendimentos",
}
PREFIXOS_IGNORAR = (
    "plano_", "grupo_", "intent_", "language_", "sentiment_", "notifica_", "duracao_",
)
EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
EMAIL_ROTULO_REGEX = re.compile(
    r"(?:e[\-\s]?mail|email)\s*[:\-]?\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})",
    re.IGNORECASE,
)
HORA_TAG_REGEX = re.compile(r"^\d{1,2}:\d{2}:\d{2}$")
REGEX_EMAIL_MYSQL = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}"

_SYNC_LOCK = threading.Lock()
_SYNC_STATE_LOCK = threading.Lock()
_SYNC_RUNNING = False
_SYNC_LAST_ERROR: str | None = None
_SYNC_LAST_STARTED: datetime | None = None
_SYNC_LAST_FINISHED: datetime | None = None

GET_MAX_DATE_SQL = text("SELECT MAX(data) AS max_data FROM public.atendimentos_zendesk")
CONTEXT_MISSING_EXISTS_SQL = text("""
    SELECT EXISTS (
        SELECT 1
        FROM public.atendimentos_zendesk z
        LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
        WHERE c.atendimento_id IS NULL
        LIMIT 1
    )
""")
DELETE_RANGE_SQL = text(
    "DELETE FROM public.atendimentos_zendesk WHERE data >= :inicio AND data <= :fim"
)
DELETE_CURRENT_FUTURE_SQL = text(
    "DELETE FROM public.atendimentos_zendesk WHERE data >= :hoje"
)
INSERT_SQL = text(
    """
    INSERT INTO public.atendimentos_zendesk (
        data, hora, cliente, email_cliente, empresa_id, sexo, data_nascimento, idade,
        motivo, avaliacao, atendente, email_atendente, tempo_primeira_resposta,
        duracao_humano, tempo_total_atendimento
    ) VALUES (
        :data, :hora, :cliente, :email_cliente, :empresa_id, :sexo, :data_nascimento, :idade,
        :motivo, :avaliacao, :atendente, :email_atendente, :tempo_primeira_resposta,
        :duracao_humano, :tempo_total_atendimento
    )
    """
)

GET_CONTEXT_MISSING_SQL = text(
    """
    SELECT z.id, z.data, z.empresa_id
    FROM public.atendimentos_zendesk z
    LEFT JOIN public.atendimentos_zendesk_contexto c ON c.atendimento_id = z.id
    WHERE c.atendimento_id IS NULL
    ORDER BY z.data, z.id
    LIMIT :limite
    """
)

UPSERT_CONTEXT_SQL = text(
    """
    INSERT INTO public.atendimentos_zendesk_contexto (
        atendimento_id, data, empresa_id, empresa, origem, pagador, plano, duracao,
        ativou_em, data_vencimento, dias_desde_ativacao,
        contato_ate_30_dias_contratacao, contato_ate_30_dias_antes_churn,
        ciclo_churnou, atualizado_em
    ) VALUES (
        :atendimento_id, :data, :empresa_id, :empresa, :origem, :pagador, :plano, :duracao,
        :ativou_em, :data_vencimento, :dias_desde_ativacao,
        :contato_ate_30_dias_contratacao, :contato_ate_30_dias_antes_churn,
        :ciclo_churnou, now()
    )
    ON CONFLICT (atendimento_id) DO UPDATE SET
        data = EXCLUDED.data,
        empresa_id = EXCLUDED.empresa_id,
        empresa = EXCLUDED.empresa,
        origem = EXCLUDED.origem,
        pagador = EXCLUDED.pagador,
        plano = EXCLUDED.plano,
        duracao = EXCLUDED.duracao,
        ativou_em = EXCLUDED.ativou_em,
        data_vencimento = EXCLUDED.data_vencimento,
        dias_desde_ativacao = EXCLUDED.dias_desde_ativacao,
        contato_ate_30_dias_contratacao = EXCLUDED.contato_ate_30_dias_contratacao,
        contato_ate_30_dias_antes_churn = EXCLUDED.contato_ate_30_dias_antes_churn,
        ciclo_churnou = EXCLUDED.ciclo_churnou,
        atualizado_em = now()
    """
)

SQL_EMPRESAS = text(
    """
    SELECT id, ativou_em, modalidade, empresa_indicacao_id, tipo_cobranca
    FROM empresas
    WHERE id IN :empresa_ids
    """
).bindparams(bindparam("empresa_ids", expanding=True))

SQL_PLANOS = text(
    """
    SELECT
        ep.empresa_id,
        ep.id,
        REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
        ep.duracao,
        ep.pago_em,
        ep.data_vencimento,
        LEAD(ep.pago_em) OVER (
            PARTITION BY ep.empresa_id
            ORDER BY ep.pago_em, ep.id
        ) AS prox_pago_em
    FROM empresas_planos ep
    WHERE
        ep.empresa_id IN :empresa_ids
        AND ep.plano_id <> 1
        AND ep.pago_em IS NOT NULL
        AND ep.nota_fiscal_servico_id IS NOT NULL
        AND ep.nome_plano NOT LIKE '% (+) recursos%'
        AND ep.nome_plano NOT LIKE '% + recursos%'
    ORDER BY ep.empresa_id, ep.pago_em, ep.id
    """
).bindparams(bindparam("empresa_ids", expanding=True))

SQL_USUARIOS = text(
    f"""
    WITH usuarios_normalizados AS (
        SELECT
            empresa_id,
            sexo,
            data_nascimento,
            LOWER(REGEXP_SUBSTR(email, '{REGEX_EMAIL_MYSQL}')) AS email_normalizado
        FROM usuarios
        WHERE email IS NOT NULL AND TRIM(email) <> ''
    )
    SELECT
        empresa_id,
        sexo,
        data_nascimento,
        email_normalizado,
        LOWER(SUBSTRING_INDEX(email_normalizado, '@', -1)) AS dominio
    FROM usuarios_normalizados
    WHERE
        email_normalizado IN :emails
        OR LOWER(SUBSTRING_INDEX(email_normalizado, '@', -1)) IN :dominios
    """
).bindparams(
    bindparam("emails", expanding=True),
    bindparam("dominios", expanding=True),
)


def _chunks(values: list[Any], size: int):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def _to_date(value: Any) -> date | None:
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


def _to_datetime_br(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(TZ_BRASIL)


def _normalizar_email(value: Any) -> str:
    if not value:
        return ""
    match = EMAIL_REGEX.search(str(value))
    return match.group(0).lower().strip() if match else ""


def _dominio(email: str) -> str:
    email = _normalizar_email(email)
    return email.split("@", 1)[1].lower().strip() if email and "@" in email else ""


def _email_valido(email: str) -> bool:
    email = _normalizar_email(email)
    return bool(email) and _dominio(email) not in DOMINIOS_INTERNOS


def _dominio_empresarial(email: str) -> bool:
    domain = _dominio(email)
    return bool(domain) and domain not in DOMINIOS_EMAIL_PUBLICO and domain not in DOMINIOS_INTERNOS


def _procurar_email_texto(value: Any) -> str | None:
    if not value:
        return None
    raw = html.unescape(str(value))
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"</p>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<[^>]+>", " ", raw)
    match = EMAIL_ROTULO_REGEX.search(raw)
    if match:
        email = _normalizar_email(match.group(1))
        if _email_valido(email):
            return email
    for email in EMAIL_REGEX.findall(raw):
        normalized = _normalizar_email(email)
        if _email_valido(normalized):
            return normalized
    return None


def _procurar_email_json(obj: Any) -> str | None:
    if obj is None:
        return None
    if isinstance(obj, dict):
        preferred = ["email", "external_id", "value", "details", "notes", "description", "name"]
        for key in preferred:
            if key in obj:
                email = _procurar_email_texto(obj.get(key))
                if email:
                    return email
        for key, value in obj.items():
            if key not in preferred:
                email = _procurar_email_json(value)
                if email:
                    return email
    elif isinstance(obj, list):
        for item in obj:
            email = _procurar_email_json(item)
            if email:
                return email
    elif isinstance(obj, str):
        return _procurar_email_texto(obj)
    return None


def _limpar_motivo(tag: Any) -> str:
    return str(tag).replace("_", " ").strip().title()


def _extrair_motivo(tags: Iterable[Any]) -> str:
    for tag in tags:
        normalized = str(tag).lower().strip()
        if normalized in TAGS_IGNORAR or HORA_TAG_REGEX.match(normalized):
            continue
        if any(normalized.startswith(prefix) for prefix in PREFIXOS_IGNORAR):
            continue
        return _limpar_motivo(tag)
    return "Não identificado"


def _eh_suporte(ticket: dict) -> bool:
    channel = (ticket.get("via") or {}).get("channel")
    if channel not in CANAIS_CHAT:
        return False
    tags = [str(tag).lower().strip() for tag in ticket.get("tags", [])]
    return any(
        tag == "grupo_suporte"
        or tag == "grupo_sup_nfboleto"
        or tag.startswith("suporte_chat")
        for tag in tags
    )


def _timedelta_seconds(value: Any) -> timedelta | None:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return None
    return timedelta(seconds=seconds) if seconds >= 0 else None


def _moda_sem_empate(values: Iterable[Any]):
    cleaned = [value for value in values if value is not None and str(value).strip() != ""]
    if not cleaned:
        return None
    ranking = Counter(cleaned).most_common()
    if len(ranking) > 1 and ranking[0][1] == ranking[1][1]:
        return None
    return ranking[0][0]


def _selecionar_sexo_exato(rows: list[dict]) -> str | None:
    if not rows:
        return None
    values = [str(row["sexo"]).strip().upper() for row in rows if row.get("sexo") is not None and str(row.get("sexo")).strip()]
    if not values or len(values) / len(rows) <= 0.5:
        return None
    return _moda_sem_empate(values)


def _selecionar_data_nascimento(rows: list[dict]) -> date | None:
    values = [_to_date(row.get("data_nascimento")) for row in rows]
    return _moda_sem_empate([value for value in values if value is not None])


def _calcular_idade(birth_date: date | None, attendance_date: date | None) -> int | None:
    if not birth_date or not attendance_date:
        return None
    age = attendance_date.year - birth_date.year - (
        (attendance_date.month, attendance_date.day) < (birth_date.month, birth_date.day)
    )
    return age if 16 <= age <= 90 else None


def _zendesk_session() -> tuple[requests.Session, str]:
    if not settings.subdomain or not settings.client_id or not settings.client_secret:
        raise RuntimeError("As credenciais do Zendesk não foram configuradas no arquivo .env do projeto.")

    session = requests.Session()
    base_url = f"https://{settings.subdomain}.zendesk.com"
    response = session.post(
        f"{base_url}/oauth/tokens",
        json={
            "grant_type": "client_credentials",
            "client_id": settings.client_id,
            "client_secret": settings.client_secret,
            "scope": "read",
        },
        timeout=30,
    )
    response.raise_for_status()
    token = response.json()["access_token"]
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return session, base_url


def _get(session: requests.Session, url: str, params: dict | None = None) -> requests.Response:
    while True:
        response = session.get(url, params=params, timeout=90)
        if response.status_code != 429:
            response.raise_for_status()
            return response
        time.sleep(int(response.headers.get("Retry-After", 5)))


def _buscar_tickets_periodo(start_date: date, end_date: date) -> tuple[list[dict], dict, dict]:
    session, base_url = _zendesk_session()
    cache_users: dict[int, dict] = {}
    metrics_map: dict[int, dict] = {}

    query_start = start_date - timedelta(days=1)
    query_end = end_date + timedelta(days=2)
    url = f"{base_url}/api/v2/search/export"
    params: dict | None = {
        "filter[type]": "ticket",
        "query": f"created>={query_start.isoformat()} created<{query_end.isoformat()}",
        "page[size]": SEARCH_PAGE_SIZE,
        "include": "tickets(users,metric_sets)",
    }
    found: list[dict] = []

    while url:
        payload = _get(session, url, params=params).json()
        for user in payload.get("users", []):
            if user.get("id"):
                cache_users[int(user["id"])] = user
        for metric in payload.get("metric_sets") or payload.get("ticket_metrics") or []:
            if metric.get("ticket_id"):
                metrics_map[int(metric["ticket_id"])] = metric

        for ticket in payload.get("results", []):
            created = _to_datetime_br(ticket.get("created_at"))
            if not created or not (start_date <= created.date() <= end_date):
                continue
            if _eh_suporte(ticket):
                found.append(ticket)

        if not (payload.get("meta") or {}).get("has_more"):
            break
        url = (payload.get("links") or {}).get("next")
        params = None

    # Complementa sideloads ausentes em lotes.
    missing_ids = []
    for ticket in found:
        ticket_id = int(ticket["id"])
        requester_id = ticket.get("requester_id")
        assignee_id = ticket.get("assignee_id")
        if (
            ticket_id not in metrics_map
            or (requester_id and int(requester_id) not in cache_users)
            or (assignee_id and int(assignee_id) not in cache_users)
        ):
            missing_ids.append(ticket_id)

    def fetch_many(ids: list[int]):
        return _get(
            session,
            f"{base_url}/api/v2/tickets/show_many.json",
            params={"ids": ",".join(map(str, ids)), "include": "users,metric_sets"},
        ).json()

    if missing_ids:
        batches = list(_chunks(missing_ids, 100))
        with ThreadPoolExecutor(max_workers=WORKERS_ZENDESK) as executor:
            futures = [executor.submit(fetch_many, batch) for batch in batches]
            for future in as_completed(futures):
                payload = future.result()
                for user in payload.get("users", []):
                    if user.get("id"):
                        cache_users[int(user["id"])] = user
                for metric in payload.get("metric_sets") or payload.get("ticket_metrics") or []:
                    if metric.get("ticket_id"):
                        metrics_map[int(metric["ticket_id"])] = metric

    # Resolve e-mails: requester -> payload -> identities -> comments.
    emails_by_ticket: dict[int, str] = {}
    requesters_missing: set[int] = set()
    for ticket in found:
        requester = cache_users.get(int(ticket.get("requester_id") or 0), {})
        email = _normalizar_email(requester.get("email"))
        if not _email_valido(email):
            email = _procurar_email_json(requester) or _procurar_email_json(ticket) or ""
        emails_by_ticket[int(ticket["id"])] = email
        if not email and ticket.get("requester_id"):
            requesters_missing.add(int(ticket["requester_id"]))

    identities_by_user: dict[int, str] = {}
    if requesters_missing:
        for batch in _chunks(sorted(requesters_missing), 100):
            payload = _get(
                session,
                f"{base_url}/api/v2/users/show_many.json",
                params={"ids": ",".join(map(str, batch)), "include": "identities"},
            ).json()
            for identity in payload.get("identities", []):
                user_id = identity.get("user_id")
                email = _procurar_email_json(identity)
                if user_id and email:
                    identities_by_user[int(user_id)] = email

    for ticket in found:
        tid = int(ticket["id"])
        if not emails_by_ticket.get(tid):
            emails_by_ticket[tid] = identities_by_user.get(int(ticket.get("requester_id") or 0), "")

    tickets_without_email = [ticket for ticket in found if not emails_by_ticket.get(int(ticket["id"]))]

    def fetch_comment_email(ticket: dict) -> tuple[int, str]:
        tid = int(ticket["id"])
        payload = _get(session, f"{base_url}/api/v2/tickets/{tid}/comments.json", params={"page[size]": 100}).json()
        requester_id = ticket.get("requester_id")
        comments = payload.get("comments", [])
        for comment in comments:
            if requester_id and comment.get("author_id") != requester_id:
                continue
            email = _procurar_email_json(comment)
            if email:
                return tid, email
        return tid, _procurar_email_json(comments) or ""

    if tickets_without_email:
        with ThreadPoolExecutor(max_workers=WORKERS_ZENDESK) as executor:
            futures = [executor.submit(fetch_comment_email, ticket) for ticket in tickets_without_email]
            for future in as_completed(futures):
                tid, email = future.result()
                if email:
                    emails_by_ticket[tid] = email

    found.sort(key=lambda item: item.get("created_at", ""))
    return found, cache_users, metrics_map | {-(tid): {"email": email} for tid, email in emails_by_ticket.items()}


def _lookup_mysql_users(records: list[dict]) -> None:
    emails = sorted({_normalizar_email(row.get("email_cliente")) for row in records if _email_valido(row.get("email_cliente", ""))})
    domains = sorted({_dominio(email) for email in emails if _dominio_empresarial(email)})
    if not emails:
        return

    with source_engine.connect() as connection:
        rows = [
            dict(row)
            for row in connection.execute(
                SQL_USUARIOS,
                {"emails": emails, "dominios": domains or [""]},
            ).mappings().all()
        ]

    by_email: dict[str, list[dict]] = defaultdict(list)
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        if row.get("email_normalizado"):
            by_email[str(row["email_normalizado"])].append(row)
        if row.get("dominio"):
            by_domain[str(row["dominio"])].append(row)

    for record in records:
        email = _normalizar_email(record.get("email_cliente"))
        exact = by_email.get(email, [])
        if exact:
            sex = _selecionar_sexo_exato(exact)
            birth_date = _selecionar_data_nascimento(exact)
            age = _calcular_idade(birth_date, record.get("data"))
            if age is None:
                birth_date = None
            record["sexo"] = sex
            record["data_nascimento"] = birth_date
            record["idade"] = age

        company_id = _moda_sem_empate([row.get("empresa_id") for row in exact if row.get("empresa_id") is not None])
        if company_id is None and _dominio_empresarial(email):
            company_id = _moda_sem_empate([
                row.get("empresa_id")
                for row in by_domain.get(_dominio(email), [])
                if row.get("empresa_id") is not None
            ])
        record["empresa_id"] = company_id


def _build_records(start_date: date, end_date: date) -> list[dict]:
    tickets, users, metrics_plus_email = _buscar_tickets_periodo(start_date, end_date)
    records: list[dict] = []

    for ticket in tickets:
        ticket_id = int(ticket["id"])
        requester = users.get(int(ticket.get("requester_id") or 0), {})
        assignee = users.get(int(ticket.get("assignee_id") or 0), {})
        created = _to_datetime_br(ticket.get("created_at"))
        if not created:
            continue
        metrics = metrics_plus_email.get(ticket_id, {})
        email = (metrics_plus_email.get(-ticket_id) or {}).get("email", "")

        reply_seconds = (metrics.get("reply_time_in_seconds") or {}).get("calendar")
        if reply_seconds is None:
            minutes = (metrics.get("reply_time_in_minutes") or {}).get("calendar")
            reply_seconds = minutes * 60 if minutes is not None else None

        assigned = _to_datetime_br(metrics.get("initially_assigned_at"))
        solved = _to_datetime_br(metrics.get("solved_at"))
        human_seconds = (solved - assigned).total_seconds() if assigned and solved else None
        total_minutes = (metrics.get("full_resolution_time_in_minutes") or {}).get("calendar")
        total_seconds = total_minutes * 60 if total_minutes is not None else ((solved - created).total_seconds() if solved else None)

        score = (ticket.get("satisfaction_rating") or {}).get("score")
        evaluation = "Positiva" if score == "good" else "Negativa" if score == "bad" else "Sem avaliação"

        records.append({
            "data": created.date(),
            "hora": created.time().replace(tzinfo=None),
            "cliente": requester.get("name") or "",
            "email_cliente": email,
            "empresa_id": None,
            "sexo": None,
            "data_nascimento": None,
            "idade": None,
            "motivo": _extrair_motivo(ticket.get("tags", [])),
            "avaliacao": evaluation,
            "atendente": assignee.get("name") or "",
            "email_atendente": assignee.get("email") or "",
            "tempo_primeira_resposta": _timedelta_seconds(reply_seconds),
            "duracao_humano": _timedelta_seconds(human_seconds),
            "tempo_total_atendimento": _timedelta_seconds(total_seconds),
        })

    _lookup_mysql_users(records)
    records.sort(key=lambda item: (item["data"], item["hora"]))
    return records


def get_last_attendance_date() -> date | None:
    with supabase_engine.connect() as connection:
        value = connection.execute(GET_MAX_DATE_SQL).scalar_one_or_none()
    return _to_date(value)


def remove_current_or_future_attendances() -> int:
    """Garante que o banco nunca mantenha atendimentos do dia atual ou do futuro."""
    today = datetime.now(TZ_BRASIL).date()
    with supabase_engine.begin() as connection:
        result = connection.execute(DELETE_CURRENT_FUTURE_SQL, {"hoje": today})
    return int(result.rowcount or 0)


def get_sync_window() -> tuple[date | None, date]:
    # Regra absoluta do projeto: nunca coletar a data atual.
    remove_current_or_future_attendances()
    yesterday = datetime.now(TZ_BRASIL).date() - timedelta(days=1)
    last_date = get_last_attendance_date()
    start = (last_date + timedelta(days=1)) if last_date else date(2024, 1, 1)
    return (start if start <= yesterday else None), yesterday


def _save_records(records: list[dict], start_date: date, end_date: date) -> int:
    today = datetime.now(TZ_BRASIL).date()
    safe_end = min(end_date, today - timedelta(days=1))
    if start_date > safe_end:
        return 0

    safe_records = [
        row for row in records
        if (_to_date(row.get("data")) is not None and start_date <= _to_date(row.get("data")) <= safe_end)
    ]

    with supabase_engine.begin() as connection:
        connection.execute(DELETE_RANGE_SQL, {"inicio": start_date, "fim": safe_end})
        for batch in _chunks(safe_records, LOTE_INSERT_SUPABASE):
            if batch:
                connection.execute(INSERT_SQL, batch)
    return len(safe_records)


def _fetch_company_and_plan_context(company_ids: list[int]) -> tuple[dict[int, dict], dict[int, list[dict]]]:
    company_map: dict[int, dict] = {}
    plan_map: dict[int, list[dict]] = defaultdict(list)
    if not company_ids:
        return company_map, plan_map

    with source_engine.connect() as connection:
        for batch in _chunks(company_ids, MYSQL_ID_BATCH):
            for row in connection.execute(SQL_EMPRESAS, {"empresa_ids": batch}).mappings().all():
                company_map[int(row["id"])] = dict(row)
            for row in connection.execute(SQL_PLANOS, {"empresa_ids": batch}).mappings().all():
                plan_map[int(row["empresa_id"])].append(dict(row))
    return company_map, plan_map


def _plan_for_contact(plans: list[dict], contact_date: date) -> dict | None:
    if not plans:
        return None
    exact = []
    prior = []
    for row in plans:
        paid = _to_date(row.get("pago_em"))
        due = _to_date(row.get("data_vencimento"))
        if not paid:
            continue
        if paid <= contact_date:
            prior.append(row)
            if due and contact_date <= due:
                exact.append(row)
    candidates = exact or prior
    if not candidates:
        return plans[0]
    return max(candidates, key=lambda row: (_to_date(row.get("pago_em")) or date.min, int(row.get("id") or 0)))


def _serialize_context(raw: dict, company: dict | None, plan: dict | None, today: date) -> dict:
    attendance_id = int(raw["id"])
    attendance_date = _to_date(raw.get("data")) or today
    company_id = int(raw["empresa_id"]) if raw.get("empresa_id") is not None else None
    activated = _to_date((company or {}).get("ativou_em"))
    due = _to_date((plan or {}).get("data_vencimento"))
    next_paid = _to_date((plan or {}).get("prox_pago_em"))

    churned_cycle = bool(
        due and (
            (next_paid is not None and next_paid >= due + timedelta(days=60))
            or (next_paid is None and today >= due + timedelta(days=60))
        )
    )
    within_30_activation = bool(activated and 0 <= (attendance_date - activated).days <= 30)
    within_30_pre_churn = bool(
        churned_cycle and due and due - timedelta(days=30) <= attendance_date <= due
    )

    modality = str((company or {}).get("modalidade") or "")
    indication = (company or {}).get("empresa_indicacao_id")
    payer = str((company or {}).get("tipo_cobranca") or "")
    company_label = "GestãoClick" if modality == "ERP" else "ClickNotas" if modality in {"NFE", "FIS"} else None
    origin_label = "GestãoClick" if indication == 1 else "Parceiro" if indication is not None else None
    payer_label = "Cliente" if payer == "E" else "Parceiro" if payer == "P" else None

    return {
        "atendimento_id": attendance_id,
        "data": attendance_date,
        "empresa_id": company_id,
        "empresa": company_label,
        "origem": origin_label,
        "pagador": payer_label,
        "plano": str((plan or {}).get("nome_plano") or "Não identificado") if company_id else None,
        "duracao": str((plan or {}).get("duracao") or "") if plan else None,
        "ativou_em": activated,
        "data_vencimento": due,
        "dias_desde_ativacao": (attendance_date - activated).days if activated else None,
        "contato_ate_30_dias_contratacao": within_30_activation,
        "contato_ate_30_dias_antes_churn": within_30_pre_churn,
        "ciclo_churnou": churned_cycle,
    }


def sync_missing_context() -> int:
    inserted = 0
    today = datetime.now(TZ_BRASIL).date()

    while True:
        with supabase_engine.connect() as connection:
            raw_rows = [
                dict(row)
                for row in connection.execute(
                    GET_CONTEXT_MISSING_SQL,
                    {"limite": CONTEXT_BATCH_SIZE},
                ).mappings().all()
            ]
        if not raw_rows:
            break

        company_ids = sorted({int(row["empresa_id"]) for row in raw_rows if row.get("empresa_id") is not None})
        companies, plans = _fetch_company_and_plan_context(company_ids)
        payload = []
        for raw in raw_rows:
            company_id = int(raw["empresa_id"]) if raw.get("empresa_id") is not None else None
            company = companies.get(company_id) if company_id is not None else None
            plan = _plan_for_contact(plans.get(company_id, []), _to_date(raw.get("data")) or today) if company_id is not None else None
            payload.append(_serialize_context(raw, company, plan, today))

        with supabase_engine.begin() as connection:
            for batch in _chunks(payload, LOTE_INSERT_SUPABASE):
                connection.execute(UPSERT_CONTEXT_SQL, batch)
        inserted += len(payload)

    return inserted


def run_incremental_sync() -> dict:
    global _SYNC_RUNNING, _SYNC_LAST_ERROR, _SYNC_LAST_STARTED, _SYNC_LAST_FINISHED
    with _SYNC_LOCK:
        with _SYNC_STATE_LOCK:
            _SYNC_RUNNING = True
            _SYNC_LAST_ERROR = None
            _SYNC_LAST_STARTED = datetime.now(TZ_BRASIL)

        try:
            start_date, end_date = get_sync_window()
            inserted = 0
            if start_date is not None:
                records = _build_records(start_date, end_date)
                inserted = _save_records(records, start_date, end_date)

            context_rows = sync_missing_context()
            result = {
                "status": "ok",
                "inicio": start_date.isoformat() if start_date else None,
                "fim": end_date.isoformat(),
                "registros_inseridos": inserted,
                "contextos_atualizados": context_rows,
                "ultima_data": get_last_attendance_date().isoformat() if get_last_attendance_date() else None,
            }
            return result
        except Exception as exc:
            with _SYNC_STATE_LOCK:
                _SYNC_LAST_ERROR = f"{type(exc).__name__}: {exc}"[:1200]
            raise
        finally:
            with _SYNC_STATE_LOCK:
                _SYNC_RUNNING = False
                _SYNC_LAST_FINISHED = datetime.now(TZ_BRASIL)


def _has_missing_context() -> bool:
    with supabase_engine.connect() as connection:
        return bool(connection.execute(CONTEXT_MISSING_EXISTS_SQL).scalar())


def trigger_incremental_sync() -> bool:
    global _SYNC_RUNNING
    with _SYNC_STATE_LOCK:
        if _SYNC_RUNNING:
            return False

    start_date, _ = get_sync_window()
    if start_date is None and not _has_missing_context():
        return False

    with _SYNC_STATE_LOCK:
        if _SYNC_RUNNING:
            return False
        _SYNC_RUNNING = True

    # A flag é reservada imediatamente para impedir duas tarefas simultâneas.
    def runner():
        global _SYNC_RUNNING, _SYNC_LAST_ERROR, _SYNC_LAST_STARTED, _SYNC_LAST_FINISHED
        try:
            with _SYNC_LOCK:
                with _SYNC_STATE_LOCK:
                    _SYNC_LAST_STARTED = datetime.now(TZ_BRASIL)
                    _SYNC_LAST_ERROR = None
                start_date, end_date = get_sync_window()
                if start_date is not None:
                    records = _build_records(start_date, end_date)
                    _save_records(records, start_date, end_date)
                sync_missing_context()
        except Exception as exc:
            with _SYNC_STATE_LOCK:
                _SYNC_LAST_ERROR = f"{type(exc).__name__}: {exc}"[:1200]
        finally:
            with _SYNC_STATE_LOCK:
                _SYNC_RUNNING = False
                _SYNC_LAST_FINISHED = datetime.now(TZ_BRASIL)

    thread = threading.Thread(target=runner, daemon=True, name="zendesk-incremental-sync")
    thread.start()
    return True


def get_sync_status() -> dict:
    last_date = get_last_attendance_date()
    target = datetime.now(TZ_BRASIL).date() - timedelta(days=1)
    missing_context = _has_missing_context()
    with _SYNC_STATE_LOCK:
        return {
            "executando": _SYNC_RUNNING,
            "ultima_data": last_date.isoformat() if last_date else None,
            "data_alvo": target.isoformat(),
            "contexto_pendente": missing_context,
            "atualizado": bool(last_date and last_date >= target and not missing_context),
            "ultimo_inicio": _SYNC_LAST_STARTED.isoformat() if _SYNC_LAST_STARTED else None,
            "ultimo_fim": _SYNC_LAST_FINISHED.isoformat() if _SYNC_LAST_FINISHED else None,
            "ultimo_erro": _SYNC_LAST_ERROR,
        }
