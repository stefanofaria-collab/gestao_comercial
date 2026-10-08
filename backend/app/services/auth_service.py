from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
USERS_FILE = DATA_DIR / "clickdados_users.json"
CODES_FILE = DATA_DIR / "clickdados_codes.json"
SECRET = os.getenv("CLICKDADOS_AUTH_SECRET", "clickdados-auth-secret")
CODE_TTL_MINUTES = 15
TOKEN_TTL_DAYS = 15
ALLOWED_DOMAINS = {
    "clickdigital.com.br",
    "beteltecnologia.com.br",
    "beteltecnlogia.com.br",
}
TEST_EMAIL = "stefanobrunofaria@gmail.com"

PAGE_CATALOG = {
    "/indicadores": "Indicadores",
    "/faturamento": "Faturamento",
    "/churn": "Churn",
    "/churn-score": "Churn Score",
    "/ativos-atrasados": "Ativos e Atrasados",
    "/upgrade-downgrade": "Upgrade e Downgrade",
    "/perfil": "Perfil",
    "/atendimentos": "Atendimentos",
    "/pagamentos": "Pagamentos",
    "/vencimentos-futuros": "Vencimentos Futuros",
    "/intranet-2": "Intranet 2.0",
}
DEFAULT_ANALYST_PAGES = [
    "/churn-score",
    "/intranet-2",
    "/perfil",
    "/vencimentos-futuros",
]

SEED_MANAGERS = [
    "stefano.faria@clickdigital.com.br",
    "jessica.neves@clickdigital.com.br",
    "lucas.sousa@gestaoclick.com.br",
    "caio.lopes@clickdigital.com.br",
    "gleiberson@clickdigital.com.br",
]
SEED_ANALYSTS = [
    "julliano.belisario@clickdigital.com.br",
]


@dataclass
class AuthUser:
    email: str
    name: str
    role: str
    password_hash: str | None
    must_define_password: bool
    pages: list[str] | None = None
    active: bool = True
    created_at: str | None = None
    updated_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "password_hash": self.password_hash,
            "must_define_password": self.must_define_password,
            "pages": list(self.pages or []),
            "active": self.active,
            "created_at": self.created_at or utcnow_iso(),
            "updated_at": self.updated_at or utcnow_iso(),
        }


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]", encoding="utf-8")
    if not CODES_FILE.exists():
        CODES_FILE.write_text("[]", encoding="utf-8")


def _load_json(path: Path) -> list[dict[str, Any]]:
    _ensure_files()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = []
    return data if isinstance(data, list) else []


def _save_json(path: Path, data: list[dict[str, Any]]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_seed_email(email: str) -> bool:
    normalized = _normalize_email(email)
    return normalized in {_normalize_email(x) for x in (SEED_MANAGERS + SEED_ANALYSTS)}


def _is_allowed_registration_email(email: str) -> bool:
    normalized = _normalize_email(email)
    if normalized == TEST_EMAIL:
        return True
    if _is_seed_email(normalized):
        return True
    if "@" not in normalized:
        return False
    domain = normalized.split("@", 1)[1]
    return domain in ALLOWED_DOMAINS


def _normalize_pages(pages: list[str] | None) -> list[str]:
    if not pages:
        return []
    allowed = set(PAGE_CATALOG)
    result: list[str] = []
    for page in pages:
        value = str(page or "").strip()
        if value in allowed and value not in result:
            result.append(value)
    return result


def _effective_pages(user: dict[str, Any]) -> list[str]:
    role = str(user.get("role", "analista"))
    if role == "gerencial":
        return list(PAGE_CATALOG.keys())
    pages = _normalize_pages(user.get("pages"))
    return pages or list(DEFAULT_ANALYST_PAGES)


def _seed_users() -> list[dict[str, Any]]:
    users: list[dict[str, Any]] = []
    for email in SEED_MANAGERS:
        users.append(
            AuthUser(
                email=_normalize_email(email),
                name=email.split("@")[0].replace(".", " ").title(),
                role="gerencial",
                password_hash=None,
                must_define_password=True,
                pages=list(PAGE_CATALOG.keys()),
                created_at=utcnow_iso(),
                updated_at=utcnow_iso(),
            ).to_dict()
        )
    for email in SEED_ANALYSTS:
        users.append(
            AuthUser(
                email=_normalize_email(email),
                name=email.split("@")[0].replace(".", " ").title(),
                role="analista",
                password_hash=None,
                must_define_password=True,
                pages=list(DEFAULT_ANALYST_PAGES),
                created_at=utcnow_iso(),
                updated_at=utcnow_iso(),
            ).to_dict()
        )
    return users


def _read_users() -> list[dict[str, Any]]:
    users = _load_json(USERS_FILE)
    changed = False

    # Os usuários iniciais só são criados quando o arquivo ainda está vazio.
    # Assim um usuário excluído ou com e-mail alterado não volta automaticamente.
    if not users:
        users = _seed_users()
        changed = True

    for user in users:
        desired_pages = _effective_pages(user)
        if user.get("pages") != desired_pages:
            user["pages"] = desired_pages
            changed = True
        if "active" not in user:
            user["active"] = True
            changed = True

    if changed:
        _save_json(USERS_FILE, users)
    return users


def get_user(email: str) -> dict[str, Any] | None:
    normalized = _normalize_email(email)
    for user in _read_users():
        if _normalize_email(str(user.get("email", ""))) == normalized:
            return user
    return None


def _write_users(users: list[dict[str, Any]]) -> None:
    _save_json(USERS_FILE, users)


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 150000)
    return f"{salt}${digest.hex()}"


def _check_password(password: str, stored: str | None) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(_hash_password(password, salt), stored)


def validate_password_rules(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos uma letra maiúscula.")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos uma letra minúscula.")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos um número.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos um caractere especial.")


def _encode_token(payload: dict[str, Any]) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("utf-8").rstrip("=")
    signature = hmac.new(SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def decode_token(token: str) -> dict[str, Any]:
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Token inválido.") from exc
    expected = hmac.new(SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Token inválido.")
    padded = body + "=" * ((4 - len(body) % 4) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
    exp = payload.get("exp")
    if exp and datetime.now(timezone.utc).timestamp() > float(exp):
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    return payload


def create_token(user: dict[str, Any]) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    payload = {
        "email": _normalize_email(str(user.get("email", ""))),
        "name": str(user.get("name", "")),
        "role": str(user.get("role", "analista")),
        "pages": _effective_pages(user),
        "exp": exp.timestamp(),
    }
    return _encode_token(payload)


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": str(user.get("email", "")),
        "name": str(user.get("name", "")),
        "role": str(user.get("role", "analista")),
        "pages": _effective_pages(user),
        "must_define_password": bool(user.get("must_define_password", False)),
        "active": bool(user.get("active", True)),
    }


def login(email: str, password: str) -> dict[str, Any]:
    user = get_user(email)
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    if user.get("must_define_password") or not user.get("password_hash"):
        return {
            "status": "first_access_required",
            "user": _public_user(user),
            "message": "Defina sua senha no primeiro acesso.",
        }
    if not _check_password(password, str(user.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    return {
        "status": "authenticated",
        "token": create_token(user),
        "user": _public_user(user),
    }


def complete_first_access(email: str, password: str) -> dict[str, Any]:
    validate_password_rules(password)
    users = _read_users()
    normalized = _normalize_email(email)
    selected = None
    for user in users:
        if _normalize_email(str(user.get("email", ""))) == normalized:
            selected = user
            break
    if not selected:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    selected["password_hash"] = _hash_password(password)
    selected["must_define_password"] = False
    selected["updated_at"] = utcnow_iso()
    _write_users(users)
    return {
        "status": "authenticated",
        "token": create_token(selected),
        "user": _public_user(selected),
    }


def _read_codes() -> list[dict[str, Any]]:
    return _load_json(CODES_FILE)


def _write_codes(codes: list[dict[str, Any]]) -> None:
    _save_json(CODES_FILE, codes)


def _clear_expired_codes() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    codes = []
    for item in _read_codes():
        try:
            expires_at = datetime.fromisoformat(str(item.get("expires_at")))
        except Exception:
            continue
        if expires_at > now:
            codes.append(item)
    _write_codes(codes)
    return codes


def _store_code(name: str, email: str, purpose: str, code: str) -> None:
    codes = [
        item
        for item in _clear_expired_codes()
        if not (_normalize_email(str(item.get("email", ""))) == _normalize_email(email) and str(item.get("purpose", "")) == purpose)
    ]
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    codes.append(
        {
            "name": name,
            "email": _normalize_email(email),
            "purpose": purpose,
            "code": code,
            "expires_at": expires_at.isoformat(),
            "created_at": utcnow_iso(),
        }
    )
    _write_codes(codes)


def _consume_code(email: str, purpose: str, code: str) -> dict[str, Any]:
    normalized = _normalize_email(email)
    codes = _clear_expired_codes()
    selected = None
    remaining: list[dict[str, Any]] = []
    for item in codes:
        same_key = _normalize_email(str(item.get("email", ""))) == normalized and str(item.get("purpose", "")) == purpose
        if same_key and str(item.get("code", "")) == code and selected is None:
            selected = item
            continue
        remaining.append(item)
    _write_codes(remaining)
    if not selected:
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")
    return selected


def _smtp_settings() -> tuple[str, int, str | None, str | None, str]:
    host = os.getenv("CLICKDADOS_SMTP_HOST") or os.getenv("SMTP_HOST") or "smtp.gmail.com"
    port = int(os.getenv("CLICKDADOS_SMTP_PORT") or os.getenv("SMTP_PORT") or "587")
    user = os.getenv("CLICKDADOS_SMTP_USER") or os.getenv("SMTP_USER")
    password = os.getenv("CLICKDADOS_SMTP_PASS") or os.getenv("SMTP_PASS")
    sender = os.getenv("CLICKDADOS_SMTP_FROM") or os.getenv("SMTP_FROM") or (user or "no-reply@clickdados.local")
    return host, port, user, password, sender


def _email_html(name: str, code: str) -> str:
    first_name = (name or "Cliente").strip().split(" ")[0]
    return f"""
    <html>
      <body style=\"margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">
        <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">
          <tr>
            <td align=\"center\">
              <table role=\"presentation\" width=\"680\" style=\"max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;\">
                <tr>
                  <td style=\"background:#17364a;padding:22px 24px;text-align:center;\">
                    <div style=\"font-size:34px;font-weight:700;letter-spacing:-1px;color:#0b1b58;\">
                      <span style=\"color:#ffffff;font-weight:500;\">click</span><span style=\"color:#ffffff;font-weight:700;\">dados</span><span style=\"color:#ef4444;\">▶</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style=\"padding:36px 48px;\">
                    <p style=\"margin:0 0 18px 0;font-size:16px;\">Olá <strong>{first_name}</strong>,</p>
                    <p style=\"margin:0 0 28px 0;font-size:16px;line-height:1.6;\">Utilize o código abaixo para confirmar seu acesso ao <strong>ClickDados</strong>:</p>
                    <div style=\"margin:0 auto 28px auto;max-width:280px;background:#f8fafc;border:1px solid #dbeafe;border-radius:14px;padding:22px 16px;text-align:center;\">
                      <div style=\"font-size:48px;letter-spacing:6px;font-weight:800;color:#111827;\">{code}</div>
                    </div>
                    <p style=\"margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#475569;\">Esse código é válido por {CODE_TTL_MINUTES} minutos.</p>
                    <p style=\"margin:0;font-size:14px;line-height:1.6;color:#475569;\">Se você não solicitou esse acesso, ignore este e-mail.</p>
                    <div style=\"margin-top:30px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:13px;color:#64748b;text-align:center;\">Enviado por ClickDados</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def _send_email(name: str, email: str, code: str) -> None:
    host, port, user, password, sender = _smtp_settings()
    message = EmailMessage()
    message["Subject"] = f"Código de confirmação {code}"
    message["From"] = sender
    message["To"] = email
    message.set_content(f"Olá {name}. Seu código de confirmação é: {code}")
    message.add_alternative(_email_html(name, code), subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(message)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível enviar o e-mail de confirmação: {exc}") from exc


def send_confirmation_code(name: str, email: str, purpose: str = "signup") -> dict[str, Any]:
    if not name.strip():
        raise HTTPException(status_code=400, detail="Informe o nome.")
    if not _is_allowed_registration_email(email):
        raise HTTPException(status_code=400, detail="Use um e-mail permitido para criar o acesso.")
    code = f"{secrets.randbelow(900000) + 100000}"
    _store_code(name=name.strip(), email=email, purpose=purpose, code=code)
    _send_email(name=name.strip(), email=_normalize_email(email), code=code)
    return {"message": "Código enviado com sucesso."}


def verify_confirmation_code(name: str, email: str, code: str, purpose: str = "signup") -> dict[str, Any]:
    record = _consume_code(email=email, purpose=purpose, code=code.strip())
    normalized = _normalize_email(email)
    if normalized == TEST_EMAIL:
        return {"message": "Teste concluído com sucesso.", "created": False}

    users = _read_users()
    if get_user(normalized) is None:
        users.append(
            AuthUser(
                email=normalized,
                name=name.strip() or str(record.get("name", "Novo usuário")),
                role="analista",
                password_hash=None,
                must_define_password=True,
                pages=list(DEFAULT_ANALYST_PAGES),
                created_at=utcnow_iso(),
                updated_at=utcnow_iso(),
            ).to_dict()
        )
        _write_users(users)
    return {"message": "Acesso confirmado com sucesso.", "created": True}


def resolve_user_from_token(token: str) -> dict[str, Any]:
    payload = decode_token(token)
    user = get_user(str(payload.get("email", "")))
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    return user


def update_settings(token: str, current_password: str, new_email: str | None = None, new_password: str | None = None) -> dict[str, Any]:
    if not current_password:
        raise HTTPException(status_code=400, detail="Informe a senha atual.")
    payload = decode_token(token)
    normalized = _normalize_email(str(payload.get("email", "")))
    users = _read_users()
    selected = None
    for user in users:
        if _normalize_email(str(user.get("email", ""))) == normalized:
            selected = user
            break
    if not selected:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if not _check_password(current_password, str(selected.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="Senha atual inválida.")

    if new_email:
        normalized_new_email = _normalize_email(new_email)
        if not _is_allowed_registration_email(normalized_new_email):
            raise HTTPException(status_code=400, detail="Use um e-mail permitido.")
        existing = get_user(normalized_new_email)
        if existing and _normalize_email(str(existing.get("email", ""))) != normalized:
            raise HTTPException(status_code=400, detail="Esse e-mail já está em uso.")
        selected["email"] = normalized_new_email

    if new_password:
        validate_password_rules(new_password)
        selected["password_hash"] = _hash_password(new_password)
        selected["must_define_password"] = False

    selected["updated_at"] = utcnow_iso()
    _write_users(users)
    return {
        "message": "Configurações atualizadas com sucesso.",
        "token": create_token(selected),
        "user": _public_user(selected),
    }


def _require_manager(token: str) -> dict[str, Any]:
    user = resolve_user_from_token(token)
    if str(user.get("role", "")) != "gerencial":
        raise HTTPException(status_code=403, detail="Apenas usuários gerenciais podem gerenciar acessos.")
    return user


def _is_allowed_admin_email(email: str) -> bool:
    normalized = _normalize_email(email)
    if "@" not in normalized:
        return False
    return normalized.split("@", 1)[1] in ALLOWED_DOMAINS


def list_managed_users(token: str) -> dict[str, Any]:
    _require_manager(token)
    users = sorted(
        [user for user in _read_users() if user.get("active", True)],
        key=lambda item: (str(item.get("name", "")).lower(), str(item.get("email", "")).lower()),
    )
    return {
        "pages": [{"path": path, "label": label} for path, label in PAGE_CATALOG.items()],
        "users": [_public_user(user) for user in users],
    }


def create_managed_user(token: str, name: str, email: str, role: str, pages: list[str] | None) -> dict[str, Any]:
    _require_manager(token)
    clean_name = name.strip()
    normalized = _normalize_email(email)
    role = role.strip().lower()

    if not clean_name:
        raise HTTPException(status_code=400, detail="Informe o nome do usuário.")
    if not _is_allowed_admin_email(normalized):
        raise HTTPException(status_code=400, detail="O e-mail deve ser dos domínios permitidos.")
    if role not in {"gerencial", "analista"}:
        raise HTTPException(status_code=400, detail="Nível de acesso inválido.")
    existing = get_user(normalized)
    if existing and existing.get("active", True):
        raise HTTPException(status_code=400, detail="Esse e-mail já está cadastrado.")

    selected_pages = list(PAGE_CATALOG.keys()) if role == "gerencial" else _normalize_pages(pages)
    if role == "analista" and not selected_pages:
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma página para o usuário.")

    users = _read_users()
    created = AuthUser(
        email=normalized,
        name=clean_name,
        role=role,
        password_hash=None,
        must_define_password=True,
        pages=selected_pages,
        active=True,
        created_at=utcnow_iso(),
        updated_at=utcnow_iso(),
    ).to_dict()

    # Caso o mesmo e-mail tenha sido removido anteriormente, reativamos o registro.
    replaced = False
    for index, user in enumerate(users):
        if _normalize_email(str(user.get("email", ""))) == normalized:
            users[index] = created
            replaced = True
            break
    if not replaced:
        users.append(created)

    _write_users(users)
    return {
        "message": "Usuário adicionado com sucesso. No primeiro acesso ele deverá cadastrar a senha.",
        "user": _public_user(created),
    }


def update_managed_user(
    token: str,
    email: str,
    name: str,
    new_email: str,
    role: str,
    pages: list[str] | None,
) -> dict[str, Any]:
    manager = _require_manager(token)
    original_email = _normalize_email(email)
    clean_name = name.strip()
    normalized_new_email = _normalize_email(new_email)
    role = role.strip().lower()

    if not clean_name:
        raise HTTPException(status_code=400, detail="Informe o nome do usuário.")
    if role not in {"gerencial", "analista"}:
        raise HTTPException(status_code=400, detail="Nível de acesso inválido.")

    users = _read_users()
    selected = None
    for user in users:
        if _normalize_email(str(user.get("email", ""))) == original_email and user.get("active", True):
            selected = user
            break
    if not selected:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    manager_email = _normalize_email(str(manager.get("email", "")))
    if original_email == manager_email and normalized_new_email != original_email:
        raise HTTPException(
            status_code=400,
            detail="Para alterar o seu próprio e-mail, use a aba Minha conta.",
        )
    if original_email == manager_email and role != "gerencial":
        raise HTTPException(status_code=400, detail="Você não pode remover o seu próprio acesso gerencial.")

    if normalized_new_email != original_email:
        if not _is_allowed_admin_email(normalized_new_email):
            raise HTTPException(status_code=400, detail="O e-mail deve ser dos domínios permitidos.")
        for user in users:
            if (
                user is not selected
                and user.get("active", True)
                and _normalize_email(str(user.get("email", ""))) == normalized_new_email
            ):
                raise HTTPException(status_code=400, detail="Esse e-mail já está cadastrado.")

    selected_pages = list(PAGE_CATALOG.keys()) if role == "gerencial" else _normalize_pages(pages)
    if role == "analista" and not selected_pages:
        raise HTTPException(status_code=400, detail="Selecione pelo menos uma página para o usuário.")

    selected["name"] = clean_name
    selected["email"] = normalized_new_email
    selected["role"] = role
    selected["pages"] = selected_pages
    selected["updated_at"] = utcnow_iso()
    _write_users(users)
    return {
        "message": "Usuário atualizado com sucesso.",
        "user": _public_user(selected),
    }


def update_managed_user_access(token: str, email: str, role: str, pages: list[str] | None) -> dict[str, Any]:
    current = get_user(email)
    if not current:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return update_managed_user(
        token=token,
        email=email,
        name=str(current.get("name", "")),
        new_email=email,
        role=role,
        pages=pages,
    )


def _generate_temporary_password() -> str:
    # Atende às mesmas regras de complexidade exigidas pelo sistema.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    middle = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"Cd#{secrets.randbelow(90) + 10}{middle}"


def reset_managed_user_password(token: str, email: str) -> dict[str, Any]:
    _require_manager(token)
    normalized = _normalize_email(email)
    users = _read_users()
    selected = None
    for user in users:
        if _normalize_email(str(user.get("email", ""))) == normalized and user.get("active", True):
            selected = user
            break
    if not selected:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    temporary_password = _generate_temporary_password()
    validate_password_rules(temporary_password)
    selected["password_hash"] = _hash_password(temporary_password)
    selected["must_define_password"] = False
    selected["updated_at"] = utcnow_iso()
    _write_users(users)
    return {
        "message": "Nova senha gerada com sucesso.",
        "temporary_password": temporary_password,
        "user": _public_user(selected),
    }


def delete_managed_user(token: str, email: str) -> dict[str, Any]:
    manager = _require_manager(token)
    normalized = _normalize_email(email)
    manager_email = _normalize_email(str(manager.get("email", "")))
    if normalized == manager_email:
        raise HTTPException(status_code=400, detail="Você não pode excluir o seu próprio usuário.")

    users = _read_users()
    selected = None
    for user in users:
        if _normalize_email(str(user.get("email", ""))) == normalized and user.get("active", True):
            selected = user
            break
    if not selected:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    # Remoção lógica preserva histórico e permite reativação futura com o mesmo e-mail.
    selected["active"] = False
    selected["updated_at"] = utcnow_iso()
    _write_users(users)
    return {"message": "Usuário excluído com sucesso."}


def get_session(token: str) -> dict[str, Any]:
    user = resolve_user_from_token(token)
    return _public_user(user)




def list_active_analysts(token: str) -> list[dict[str, str]]:
    """Retorna somente usuários ativos de nível Analista para distribuição de campanhas."""
    resolve_user_from_token(token)
    analysts: list[dict[str, str]] = []
    for user in _read_users():
        if not bool(user.get("active", True)):
            continue
        if str(user.get("role", "")).strip().lower() != "analista":
            continue
        analysts.append(
            {
                "name": str(user.get("name") or user.get("email") or "Analista"),
                "email": _normalize_email(str(user.get("email") or "")),
                "role": "analista",
            }
        )
    analysts = [item for item in analysts if item["email"]]
    analysts.sort(key=lambda item: (item["name"].lower(), item["email"]))
    return analysts

# garante seed logo na importação
_ensure_files()
_read_users()
