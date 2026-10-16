from __future__ import annotations

import os
import smtplib
import uuid
from datetime import date, datetime, timezone
from email.message import EmailMessage
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import bindparam, text

from app.config import settings
from app.constants import DURATION_LABELS, EXCLUDED_COMPANY_IDS
from app.database import source_engine, supabase_engine
from app.services.auth_service import (
    ALLOWED_DOMAINS,
    _normalize_email,
    resolve_user_from_token,
)


MIN_DAYS = 1
MAX_DAYS = 90
INTRANET_BASE = "https://intranet.clickdigital.com.br/clientes/visualizar"
EXCLUDED_IDS = tuple(dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371, 517101)))


def _app_tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.app_timezone or "America/Sao_Paulo")
    except Exception:
        return ZoneInfo("America/Sao_Paulo")


def _schedule_label() -> str:
    hour = int(settings.send_hour if settings.send_hour is not None else 9)
    minute = int(settings.send_minute if settings.send_minute is not None else 0)
    timezone_name = settings.app_timezone or "America/Sao_Paulo"
    return f"Todos os dias às {hour:02d}:{minute:02d} ({timezone_name})"

ENSURE_ALERTS_TABLE_SQL = text(
    """
    CREATE TABLE IF NOT EXISTS public.alertas_planos_vencidos (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        dias INTEGER NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_por TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT alertas_planos_vencidos_email_dias_uk UNIQUE (email, dias)
    )
    """
)

LIST_ALERTS_SQL = text(
    """
    SELECT id, email, dias, ativo, criado_por, criado_em, atualizado_em
    FROM public.alertas_planos_vencidos
    ORDER BY email, dias
    """
)

INSERT_ALERT_SQL = text(
    """
    INSERT INTO public.alertas_planos_vencidos (
        id, email, dias, ativo, criado_por, criado_em, atualizado_em
    )
    VALUES (
        :id, :email, :dias, :ativo, :criado_por, :criado_em, :atualizado_em
    )
    """
)

DELETE_ALERT_SQL = text(
    """
    DELETE FROM public.alertas_planos_vencidos
    WHERE id = :id
    """
)

FIND_ALERT_SQL = text(
    """
    SELECT id
    FROM public.alertas_planos_vencidos
    WHERE email = :email AND dias = :dias
    LIMIT 1
    """
)

PLAN_WEIGHT_SQL = """
CASE
    WHEN e.modalidade = 'ERP' THEN
        CASE
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Bronze' THEN 1
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Prata' THEN 2
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Ouro' THEN 3
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Platina' THEN 4
            ELSE 0
        END
    ELSE
        CASE
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Bronze' THEN 1
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Prata' THEN 2
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Ouro' THEN 3
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Platina' THEN 4
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Plus' THEN 5
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Essencial' THEN 6
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Profissional' THEN 7
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Intermediário' THEN 8
            WHEN REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = 'Master' THEN 9
            ELSE 0
        END
END
"""

DURATION_WEIGHT_SQL = """
CASE
    WHEN ep.duracao = 'M' THEN 1
    WHEN ep.duracao = 'T' THEN 2
    WHEN ep.duracao = 'S' THEN 3
    WHEN ep.duracao = 'A' THEN 4
    ELSE 0
END
"""

OVERDUE_EXACT_SQL = text(
    f"""
    WITH loja_contato AS (
        SELECT empresa_id, MAX(celular) AS celular
        FROM lojas
        GROUP BY empresa_id
    ),
    atuais AS (
        SELECT
            ep.id AS plano_atual_id,
            e.id AS empresa_id,
            COALESCE(NULLIF(TRIM(ep.razao_social), ''), CONCAT('Cliente #', e.id)) AS razao_social,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS plano_atual,
            ep.duracao AS duracao_atual,
            {PLAN_WEIGHT_SQL} AS peso_plano,
            {DURATION_WEIGHT_SQL} AS peso_duracao,
            CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor_atual,
            ep.data_vencimento,
            ep.pago_em,
            ep.nome_usuario,
            ep.telefone,
            ep.email,
            lc.celular,
            DATEDIFF(:referencia, ep.data_vencimento) AS dias_vencido
        FROM empresas_planos ep
        JOIN empresas e ON e.id = ep.empresa_id
        LEFT JOIN loja_contato lc ON lc.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.valor > 5
            AND ep.nome_plano NOT LIKE '%recursos%'
            AND e.empresa_indicacao_id = 1
            AND e.modalidade IN ('ERP', 'NFE', 'FIS')
            AND e.id NOT IN :excluidos
            AND DATEDIFF(:referencia, ep.data_vencimento) = :dias
    ),
    anteriores_ranqueados AS (
        SELECT
            a.plano_atual_id,
            REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS plano_anterior,
            ep.duracao AS duracao_anterior,
            {PLAN_WEIGHT_SQL} AS peso_plano_anterior,
            {DURATION_WEIGHT_SQL} AS peso_duracao_anterior,
            CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor_anterior,
            ROW_NUMBER() OVER (
                PARTITION BY a.plano_atual_id
                ORDER BY ep.pago_em DESC, ep.id DESC
            ) AS rn
        FROM atuais a
        JOIN empresas_planos ep ON ep.empresa_id = a.empresa_id
        JOIN empresas e ON e.id = ep.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND ep.valor > 5
            AND ep.nome_plano NOT LIKE '%recursos%'
            AND (
                ep.pago_em < a.pago_em
                OR (ep.pago_em = a.pago_em AND ep.id < a.plano_atual_id)
            )
    ),
    anteriores AS (
        SELECT *
        FROM anteriores_ranqueados
        WHERE rn = 1
    )
    SELECT
        a.empresa_id,
        a.razao_social,
        COALESCE(p.plano_anterior, 'Sem histórico') AS plano_anterior,
        a.plano_atual,
        COALESCE(p.duracao_anterior, '') AS duracao_anterior,
        a.duracao_atual,
        COALESCE(p.peso_plano_anterior, 0) AS peso_plano_anterior,
        a.peso_plano,
        COALESCE(p.peso_duracao_anterior, 0) AS peso_duracao_anterior,
        a.peso_duracao,
        COALESCE(p.valor_anterior, a.valor_atual) AS valor_anterior,
        a.valor_atual,
        a.dias_vencido,
        a.data_vencimento,
        a.nome_usuario,
        a.telefone,
        a.celular,
        a.email
    FROM atuais a
    LEFT JOIN anteriores p ON p.plano_atual_id = a.plano_atual_id
    ORDER BY a.valor_atual DESC, a.empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_store() -> None:
    with supabase_engine.begin() as connection:
        connection.execute(ENSURE_ALERTS_TABLE_SQL)


def _serialize_alert(row: dict[str, Any]) -> dict[str, Any]:
    criado_em = row.get("criado_em")
    atualizado_em = row.get("atualizado_em")
    return {
        "id": str(row.get("id") or ""),
        "email": _normalize_email(str(row.get("email") or "")),
        "dias": int(row.get("dias") or 0),
        "ativo": bool(row.get("ativo", True)),
        "criado_por": str(row.get("criado_por") or ""),
        "criado_em": criado_em.isoformat() if hasattr(criado_em, "isoformat") else str(criado_em or ""),
        "atualizado_em": (
            atualizado_em.isoformat() if hasattr(atualizado_em, "isoformat") else str(atualizado_em or "")
        ),
    }


def _read_alerts() -> list[dict[str, Any]]:
    _ensure_store()
    with supabase_engine.connect() as connection:
        rows = [dict(row) for row in connection.execute(LIST_ALERTS_SQL).mappings().all()]
    return [_serialize_alert(row) for row in rows]


def _is_allowed_alert_email(email: str) -> bool:
    normalized = _normalize_email(email)
    if "@" not in normalized:
        return False
    domain = normalized.split("@", 1)[1]
    return domain in {"clickdigital.com.br", "beteltecnologia.com.br"} or domain in ALLOWED_DOMAINS


def _parse_days(dias: int) -> int:
    try:
        value = int(dias)
    except (TypeError, ValueError) as exc:
        raise ValueError("Informe um período válido em dias.") from exc
    if value < MIN_DAYS or value > MAX_DAYS:
        raise ValueError(f"O período deve ser entre {MIN_DAYS} e {MAX_DAYS} dias.")
    return value


def _validate_days(dias: int) -> int:
    try:
        return _parse_days(dias)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _duration_label(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "Sem histórico"
    return DURATION_LABELS.get(raw, raw)


def _plan_change_label(peso_atual: int, peso_anterior: int, has_previous: bool) -> str:
    if not has_previous:
        return "Sem histórico"
    delta = int(peso_atual or 0) - int(peso_anterior or 0)
    if delta > 0:
        return "Upgrade"
    if delta < 0:
        return "Downgrade"
    return "Sem alteração"


def _duration_change_label(peso_atual: int, peso_anterior: int, has_previous: bool) -> str:
    if not has_previous:
        return "Sem histórico"
    delta = int(peso_atual or 0) - int(peso_anterior or 0)
    if delta > 0:
        return "Aumentou"
    if delta < 0:
        return "Reduziu"
    return "Sem alteração"


def _intranet_url(company_id: int) -> str:
    return f"{INTRANET_BASE}/{company_id}?aba=5"


def _format_money(value: float) -> str:
    formatted = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def _smtp_settings() -> dict[str, Any]:
    user = (
        os.getenv("CLICKDADOS_SMTP_USER")
        or os.getenv("SMTP_USER")
        or settings.smtp_user
        or ""
    ).strip() or None
    password = (
        os.getenv("CLICKDADOS_SMTP_PASS")
        or os.getenv("SMTP_PASS")
        or settings.smtp_pass
        or ""
    ).strip() or None
    sender = (
        os.getenv("CLICKDADOS_SMTP_FROM")
        or os.getenv("SMTP_FROM")
        or settings.smtp_from
        or user
        or "no-reply@clickdados.local"
    )
    host = (
        os.getenv("CLICKDADOS_SMTP_HOST")
        or os.getenv("SMTP_HOST")
        or settings.smtp_host
        or "smtp.gmail.com"
    )
    port = int(
        os.getenv("CLICKDADOS_SMTP_PORT")
        or os.getenv("SMTP_PORT")
        or settings.smtp_port
        or 587
    )
    use_ssl_raw = os.getenv("SMTP_USE_SSL")
    starttls_raw = os.getenv("SMTP_STARTTLS")
    use_ssl = (
        str(use_ssl_raw).strip().lower() in {"1", "true", "yes", "on"}
        if use_ssl_raw is not None
        else bool(settings.smtp_use_ssl)
    )
    starttls = (
        str(starttls_raw).strip().lower() in {"1", "true", "yes", "on"}
        if starttls_raw is not None
        else bool(settings.smtp_starttls)
    )
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "sender": sender,
        "use_ssl": use_ssl,
        "starttls": starttls and not use_ssl,
    }


def list_alert_subscriptions(token: str) -> dict[str, Any]:
    resolve_user_from_token(token)
    items = sorted(
        _read_alerts(),
        key=lambda item: (_normalize_email(str(item.get("email", ""))), int(item.get("dias") or 0)),
    )
    return {
        "alertas": items,
        "regras": {
            "dominios_permitidos": ["clickdigital.com.br", "beteltecnologia.com.br"],
            "dias_min": MIN_DAYS,
            "dias_max": MAX_DAYS,
            "horario": _schedule_label(),
            "origem": "GestãoClick",
            "descricao": (
                "Alertas de planos vencidos: o e-mail lista clientes GestãoClick cujo plano "
                "completa exatamente o período cadastrado em atraso na data do envio."
            ),
        },
    }


def create_alert_subscription(token: str, email: str, dias: int) -> dict[str, Any]:
    user = resolve_user_from_token(token)
    normalized = _normalize_email(email)
    if not _is_allowed_alert_email(normalized):
        raise HTTPException(
            status_code=400,
            detail="Use um e-mail @clickdigital.com.br ou @beteltecnologia.com.br.",
        )
    days = _validate_days(dias)

    _ensure_store()
    with supabase_engine.connect() as connection:
        existing = connection.execute(
            FIND_ALERT_SQL,
            {"email": normalized, "dias": days},
        ).mappings().first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Este e-mail já está cadastrado para esse período de vencimento.",
        )

    now = _utcnow_iso()
    record = {
        "id": str(uuid.uuid4()),
        "email": normalized,
        "dias": days,
        "ativo": True,
        "criado_por": str(user.get("email") or ""),
        "criado_em": now,
        "atualizado_em": now,
    }
    with supabase_engine.begin() as connection:
        connection.execute(INSERT_ALERT_SQL, record)
    return {"message": "Alerta cadastrado com sucesso.", "alerta": record}


def delete_alert_subscription(token: str, alert_id: str) -> dict[str, Any]:
    resolve_user_from_token(token)
    _ensure_store()
    with supabase_engine.begin() as connection:
        result = connection.execute(DELETE_ALERT_SQL, {"id": str(alert_id)})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")
    return {"message": "Alerta removido com sucesso."}


def fetch_overdue_clients(dias: int, reference: date | None = None) -> list[dict[str, Any]]:
    days = _parse_days(dias)
    ref = reference or datetime.now(_app_tz()).date()
    params = {"dias": days, "excluidos": EXCLUDED_IDS, "referencia": ref}
    with source_engine.connect() as connection:
        rows = [dict(row) for row in connection.execute(OVERDUE_EXACT_SQL, params).mappings().all()]

    clients: list[dict[str, Any]] = []
    for row in rows:
        has_previous = str(row.get("plano_anterior") or "") not in {"", "Sem histórico"}
        valor_anterior = round(float(row.get("valor_anterior") or 0), 2)
        valor_atual = round(float(row.get("valor_atual") or 0), 2)
        company_id = int(row["empresa_id"])
        due = row.get("data_vencimento")
        if isinstance(due, datetime):
            due = due.date()

        clients.append(
            {
                "empresa_id": company_id,
                "razao_social": str(row.get("razao_social") or f"Cliente #{company_id}"),
                "plano_anterior": str(row.get("plano_anterior") or "Sem histórico"),
                "plano_atual": str(row.get("plano_atual") or "Não informado"),
                "alteracao_plano": _plan_change_label(
                    int(row.get("peso_plano") or 0),
                    int(row.get("peso_plano_anterior") or 0),
                    has_previous,
                ),
                "duracao_anterior": _duration_label(row.get("duracao_anterior")),
                "duracao_atual": _duration_label(row.get("duracao_atual")),
                "alteracao_duracao": _duration_change_label(
                    int(row.get("peso_duracao") or 0),
                    int(row.get("peso_duracao_anterior") or 0),
                    has_previous and bool(str(row.get("duracao_anterior") or "").strip()),
                ),
                "valor_anterior": valor_anterior,
                "valor_atual": valor_atual,
                "saldo_financeiro": valor_atual,
                "usuario_master": str(row.get("nome_usuario") or "").strip() or "—",
                "telefone": str(row.get("telefone") or "").strip() or "—",
                "celular": str(row.get("celular") or "").strip() or "—",
                "email": str(row.get("email") or "").strip() or "—",
                "intranet": _intranet_url(company_id),
                "dias_vencido": int(row.get("dias_vencido") or days),
                "data_vencimento": due.isoformat() if isinstance(due, date) else None,
            }
        )
    return clients


def _email_html(dias: int, clients: list[dict[str, Any]], reference: date) -> str:
    total_clients = len(clients)
    total_value = round(sum(float(item["saldo_financeiro"]) for item in clients), 2)
    date_label = reference.strftime("%d/%m/%Y")
    period_label = "1 dia" if dias == 1 else f"{dias} dias"

    rows_html: list[str] = []
    if not clients:
        rows_html.append(
            """
            <tr>
              <td colspan="16" style="padding:18px 12px;text-align:center;color:#64748b;font-size:13px;">
                Nenhum cliente GestãoClick completou este período de atraso hoje.
              </td>
            </tr>
            """
        )
    else:
        for index, item in enumerate(clients):
            bg = "#ffffff" if index % 2 == 0 else "#f8fafc"
            rows_html.append(
                f"""
                <tr style="background:{bg};">
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(str(item["empresa_id"]))}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["razao_social"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["plano_anterior"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["plano_atual"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["alteracao_plano"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["duracao_anterior"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["duracao_atual"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["alteracao_duracao"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;white-space:nowrap;">{escape(_format_money(item["valor_anterior"]))}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;white-space:nowrap;">{escape(_format_money(item["valor_atual"]))}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;white-space:nowrap;font-weight:700;">{escape(_format_money(item["saldo_financeiro"]))}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["usuario_master"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["telefone"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["celular"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">{escape(item["email"])}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">
                    <a href="{escape(item["intranet"])}" style="color:#2563eb;text-decoration:none;">Abrir</a>
                  </td>
                </tr>
                """
            )

    header_cells = [
        "Empresa ID",
        "Razão social",
        "Plano anterior",
        "Plano atual",
        "Alteração do plano",
        "Duração anterior",
        "Duração atual",
        "Alteração da duração",
        "Valor anterior",
        "Valor atual",
        "Saldo financeiro",
        "Usuário master",
        "Telefone",
        "Celular",
        "E-mail",
        "Intranet",
    ]
    thead = "".join(
        f'<th style="padding:12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">{escape(label)}</th>'
        for label in header_cells
    )

    return f"""
    <html>
      <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center">
              <table role="presentation" width="1100" style="max-width:1100px;width:100%;">
                <tr>
                  <td style="padding:0 0 18px 0;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#0f766e;">Alertas de planos vencidos</div>
                    <div style="margin-top:8px;font-size:28px;font-weight:800;color:#0f172a;">Planos com {escape(period_label)} de atraso — {escape(date_label)}</div>
                    <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#64748b;">
                      Clientes com origem <strong>GestãoClick</strong> que completam exatamente {escape(period_label)} com o plano vencido na data de hoje.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;">
                            <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">Total de clientes</div>
                            <div style="margin-top:10px;font-size:36px;font-weight:800;color:#0f172a;">{total_clients}</div>
                            <div style="margin-top:4px;font-size:13px;color:#64748b;">origem GestãoClick</div>
                          </div>
                        </td>
                        <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;">
                            <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">Valor total em atraso</div>
                            <div style="margin-top:10px;font-size:36px;font-weight:800;color:#b91c1c;">{escape(_format_money(total_value))}</div>
                            <div style="margin-top:4px;font-size:13px;color:#64748b;">soma dos planos vencidos</div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:22px;">
                    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
                      <div style="padding:16px 18px;font-size:16px;font-weight:700;color:#0f172a;">
                        Clientes em atraso ({total_clients})
                      </div>
                      <div style="overflow-x:auto;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;min-width:1400px;">
                          <thead>
                            <tr style="background:#17364a;color:#ffffff;">
                              {thead}
                            </tr>
                          </thead>
                          <tbody>
                            {''.join(rows_html)}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:18px;font-size:12px;color:#94a3b8;text-align:center;">
                    Enviado automaticamente pelo ClickDados · Alertas de planos vencidos
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def send_html_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    cfg = _smtp_settings()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = cfg["sender"]
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    if cfg["use_ssl"]:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=60) as smtp:
            if cfg["user"] and cfg["password"]:
                smtp.login(cfg["user"], cfg["password"])
            smtp.send_message(message)
        return

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=60) as smtp:
        if cfg["starttls"]:
            smtp.starttls()
        if cfg["user"] and cfg["password"]:
            smtp.login(cfg["user"], cfg["password"])
        smtp.send_message(message)


def send_alert_email(email: str, dias: int, clients: list[dict[str, Any]], reference: date | None = None) -> None:
    ref = reference or datetime.now(_app_tz()).date()
    period_label = "1 dia" if dias == 1 else f"{dias} dias"
    subject = f"Alertas de planos vencidos — {period_label} de atraso — {ref.strftime('%d/%m/%Y')}"
    html = _email_html(dias, clients, ref)
    text = (
        f"Alertas de planos vencidos\n"
        f"Período: {period_label}\n"
        f"Origem: GestãoClick\n"
        f"Total de clientes: {len(clients)}\n"
        f"Valor total em atraso: {_format_money(sum(float(item['saldo_financeiro']) for item in clients))}\n"
    )
    send_html_email(_normalize_email(email), subject, html, text)


def run_daily_alerts(reference: date | None = None) -> dict[str, Any]:
    ref = reference or datetime.now(_app_tz()).date()
    subscriptions = [item for item in _read_alerts() if item.get("ativo", True)]
    by_days: dict[int, list[dict[str, Any]]] = {}
    for item in subscriptions:
        days = int(item.get("dias") or 0)
        by_days.setdefault(days, []).append(item)

    results: list[dict[str, Any]] = []
    for days, recipients in sorted(by_days.items()):
        try:
            clients = fetch_overdue_clients(days, reference=ref)
        except Exception as exc:
            results.append(
                {
                    "dias": days,
                    "status": "erro_consulta",
                    "detail": f"{type(exc).__name__}: {exc}",
                    "destinatarios": 0,
                    "clientes": 0,
                }
            )
            continue

        sent = 0
        errors: list[str] = []
        for recipient in recipients:
            email = _normalize_email(str(recipient.get("email") or ""))
            try:
                send_alert_email(email, days, clients, reference=ref)
                sent += 1
            except Exception as exc:
                errors.append(f"{email}: {type(exc).__name__}: {exc}")

        results.append(
            {
                "dias": days,
                "status": "ok" if not errors else "parcial",
                "destinatarios": sent,
                "clientes": len(clients),
                "valor_total": round(sum(float(item["saldo_financeiro"]) for item in clients), 2),
                "erros": errors,
            }
        )

    return {
        "referencia": ref.isoformat(),
        "assinaturas": len(subscriptions),
        "periodos": len(by_days),
        "resultados": results,
    }
