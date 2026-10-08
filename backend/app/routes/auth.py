from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.services.auth_service import (
    complete_first_access,
    create_managed_user,
    delete_managed_user,
    get_session,
    list_managed_users,
    reset_managed_user_password,
    login,
    send_confirmation_code,
    update_managed_user,
    update_managed_user_access,
    update_settings,
    verify_confirmation_code,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginPayload(BaseModel):
    email: str
    password: str = Field(default="")


class FirstAccessPayload(BaseModel):
    email: str
    password: str


class CodePayload(BaseModel):
    name: str
    email: str
    purpose: str = "signup"


class VerifyCodePayload(BaseModel):
    name: str
    email: str
    code: str = Field(min_length=6, max_length=6)
    purpose: str = "signup"


class SettingsPayload(BaseModel):
    current_password: str
    new_email: str | None = None
    new_password: str | None = None


class ManagedUserPayload(BaseModel):
    name: str
    email: str
    role: str
    pages: list[str] = Field(default_factory=list)


class ManagedUserAccessPayload(BaseModel):
    role: str
    pages: list[str] = Field(default_factory=list)


class ManagedUserEditPayload(BaseModel):
    name: str
    email: str
    role: str
    pages: list[str] = Field(default_factory=list)


def _token(authorization: str) -> str:
    return authorization.replace("Bearer ", "").strip()




@router.get("/health")
def auth_health_route() -> dict[str, Any]:
    return {"status": "ok", "service": "clickdados-auth"}

@router.post("/login")
def login_route(payload: LoginPayload) -> dict[str, Any]:
    return login(email=payload.email, password=payload.password)


@router.post("/first-access")
def first_access_route(payload: FirstAccessPayload) -> dict[str, Any]:
    return complete_first_access(email=payload.email, password=payload.password)


@router.post("/send-code")
def send_code_route(payload: CodePayload) -> dict[str, Any]:
    return send_confirmation_code(name=payload.name, email=payload.email, purpose=payload.purpose)


@router.post("/verify-code")
def verify_code_route(payload: VerifyCodePayload) -> dict[str, Any]:
    return verify_confirmation_code(name=payload.name, email=payload.email, code=payload.code, purpose=payload.purpose)


@router.get("/me")
def me_route(authorization: str = Header(default="")) -> dict[str, Any]:
    return get_session(_token(authorization))


@router.post("/settings")
def settings_route(payload: SettingsPayload, authorization: str = Header(default="")) -> dict[str, Any]:
    return update_settings(
        token=_token(authorization),
        current_password=payload.current_password,
        new_email=payload.new_email,
        new_password=payload.new_password,
    )


@router.get("/users")
def users_route(authorization: str = Header(default="")) -> dict[str, Any]:
    return list_managed_users(_token(authorization))


@router.post("/users")
def create_user_route(payload: ManagedUserPayload, authorization: str = Header(default="")) -> dict[str, Any]:
    return create_managed_user(
        token=_token(authorization),
        name=payload.name,
        email=payload.email,
        role=payload.role,
        pages=payload.pages,
    )


@router.put("/users/{email}/access")
def update_user_access_route(
    email: str,
    payload: ManagedUserAccessPayload,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    return update_managed_user_access(
        token=_token(authorization),
        email=email,
        role=payload.role,
        pages=payload.pages,
    )


@router.put("/users/{email}")
def update_user_route(
    email: str,
    payload: ManagedUserEditPayload,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    return update_managed_user(
        token=_token(authorization),
        email=email,
        name=payload.name,
        new_email=payload.email,
        role=payload.role,
        pages=payload.pages,
    )


@router.post("/users/{email}/reset-password")
def reset_user_password_route(
    email: str,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    return reset_managed_user_password(
        token=_token(authorization),
        email=email,
    )


@router.delete("/users/{email}")
def delete_user_route(
    email: str,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    return delete_managed_user(
        token=_token(authorization),
        email=email,
    )



@router.get("/analysts")
def analysts_route(authorization: str = Header(default="")) -> dict[str, Any]:
    from app.services.auth_service import list_active_analysts

    token = authorization.replace("Bearer ", "").strip()
    return {"users": list_active_analysts(token)}
