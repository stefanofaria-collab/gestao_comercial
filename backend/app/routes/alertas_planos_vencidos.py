from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.services.alertas_planos_vencidos_service import (
    create_alert_subscription,
    delete_alert_subscription,
    list_alert_subscriptions,
    run_daily_alerts,
)


router = APIRouter(prefix="/api/alertas-planos-vencidos", tags=["Alertas de planos vencidos"])


class AlertPayload(BaseModel):
    email: str
    dias: int = Field(..., ge=1, le=90)


def _token(authorization: str) -> str:
    return authorization.replace("Bearer ", "").strip()


@router.get("")
def list_alerts(authorization: str = Header(default="")) -> dict[str, Any]:
    return list_alert_subscriptions(_token(authorization))


@router.post("")
def create_alert(payload: AlertPayload, authorization: str = Header(default="")) -> dict[str, Any]:
    return create_alert_subscription(
        token=_token(authorization),
        email=payload.email,
        dias=payload.dias,
    )


@router.delete("/{alert_id}")
def delete_alert(alert_id: str, authorization: str = Header(default="")) -> dict[str, Any]:
    return delete_alert_subscription(_token(authorization), alert_id)


@router.post("/enviar-agora")
def send_now(authorization: str = Header(default="")) -> dict[str, Any]:
    """Disparo manual útil para validar o fluxo sem esperar o cron das 09h."""
    list_alert_subscriptions(_token(authorization))
    return run_daily_alerts()
