from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.services.upgrade_downgrade_service import (
    get_upgrade_downgrade_dashboard,
    prepare_cache_for_request,
)

router = APIRouter(prefix="/api/upgrade-downgrade", tags=["Upgrade e Downgrade"])

CompanyFilter = Literal["todos", "gestaoclick", "clicknotas"]
OriginFilter = Literal["todos", "gestaoclick", "parceiro"]
PayerFilter = Literal["todos", "cliente", "parceiro"]


def _parse_months(value: str) -> list[int]:
    months: list[int] = []
    for raw in (value or "").split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            month = int(raw)
        except ValueError as exc:
            raise ValueError("Mês inválido.") from exc
        if month < 1 or month > 12:
            raise ValueError("Mês inválido.")
        if month not in months:
            months.append(month)
    months.sort()
    if not months:
        raise ValueError("Informe ao menos um mês.")
    return months


@router.get("")
def upgrade_downgrade_dashboard(
    background_tasks: BackgroundTasks,
    ano: int = Query(..., ge=2024),
    meses: str = Query(...),
    empresa: CompanyFilter = Query("todos"),
    origem: OriginFilter = Query("todos"),
    pagador: PayerFilter = Query("todos"),
    plano: str = Query("todos", max_length=120),
    duracao: str = Query("todos", max_length=5),
):
    try:
        parsed_months = _parse_months(meses)
        raw_plan = (plano or "todos").strip() or "todos"
        normalized_plan = "todos" if raw_plan.lower() == "todos" else raw_plan

        raw_duration = (duracao or "todos").strip() or "todos"
        normalized_duration = "todos" if raw_duration.lower() == "todos" else raw_duration.upper()

        # Meses fechados são imutáveis no Supabase. O mês atual é atualizado em
        # segundo plano quando o snapshot ficar antigo.
        prepare_cache_for_request(background_tasks)

        return get_upgrade_downgrade_dashboard(
            ano=ano,
            meses=parsed_months,
            empresa=empresa,
            origem=origem,
            pagador=pagador,
            plano=normalized_plan,
            duracao=normalized_duration,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível carregar Upgrade e Downgrade. Detalhe técnico: {type(exc).__name__}: {exc}",
        ) from exc
