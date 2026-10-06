from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.services.auth_service import (
    complete_first_access,
    get_session,
    login,
    send_confirmation_code,
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
    token = authorization.replace("Bearer ", "").strip()
    return get_session(token)


@router.post("/settings")
def settings_route(payload: SettingsPayload, authorization: str = Header(default="")) -> dict[str, Any]:
    token = authorization.replace("Bearer ", "").strip()
    return update_settings(
        token=token,
        current_password=payload.current_password,
        new_email=payload.new_email,
        new_password=payload.new_password,
    )
