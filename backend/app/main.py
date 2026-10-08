from __future__ import annotations

from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import test_supabase_connection
from app.services.dashboard_cache_service import cache_status, reset_refresh_locks
from app.services.global_filter_context import pop_request_filters, push_request_filters
from app.routes.dashboard import router as dashboard_router
from app.routes.auth import router as auth_router
from app.routes.indicadores import router as indicadores_router
from app.routes.faturamento import router as faturamento_router
from app.routes.churn import router as churn_router
from app.routes.churn_score import router as churn_score_router
from app.routes.ativos_atrasados import router as ativos_atrasados_router
from app.routes.upgrade_downgrade import router as upgrade_downgrade_router
from app.routes.perfil import router as perfil_router
from app.routes.vencimentos_futuros import router as vencimentos_futuros_router
from app.routes.pagamentos import router as pagamentos_router
from app.routes.atendimentos import router as atendimentos_router
from app.routes.intranet2 import router as intranet2_router


app = FastAPI(
    title="Gestão Comercial API",
    version="3.32.0",
    description=(
        "API do dashboard comercial. Mantém os indicadores existentes "
        "e adiciona as visões de faturamento, churn, churn score, ativos e atrasados, perfil, atendimentos, pagamentos, vencimentos futuros e Intranet 2.0."
    ),
)


def normalize_origin(origin: str) -> str:
    value = (origin or "").strip().rstrip("/")

    if not value:
        return ""

    parsed = urlparse(value)

    if parsed.scheme not in {"http", "https"}:
        return ""

    if not parsed.netloc:
        return ""

    return value


allowed_origins = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}

configured_frontend_origin = normalize_origin(settings.frontend_origin)

if configured_frontend_origin:
    allowed_origins.add(configured_frontend_origin)


@app.middleware("http")
async def apply_global_filter_context(request, call_next):
    tokens = push_request_filters(
        raw_months=request.query_params.get("meses"),
        raw_year=request.query_params.get("ano_global"),
        plan=request.query_params.get("plano_global"),
        duration=request.query_params.get("duracao_global"),
    )
    try:
        return await call_next(request)
    finally:
        pop_request_filters(tokens)


app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=(
        r"^https?://"
        r"(localhost|127\.0\.0\.1)"
        r"(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


app.include_router(dashboard_router)
app.include_router(auth_router)
app.include_router(indicadores_router)
app.include_router(faturamento_router)
app.include_router(churn_router)
app.include_router(churn_score_router)
app.include_router(ativos_atrasados_router)
app.include_router(upgrade_downgrade_router)
app.include_router(perfil_router)
app.include_router(atendimentos_router)
app.include_router(pagamentos_router)
app.include_router(vencimentos_futuros_router)
app.include_router(intranet2_router)


@app.on_event("startup")
def clear_abandoned_refresh_locks():
    reset_refresh_locks()


@app.get("/")
def root():
    return {
        "app": "Gestão Comercial API",
        "version": "3.32.0",
        "docs": "/docs",
        "health": "/health",
        "indicadores": "/api/indicadores",
        "faturamento": "/api/faturamento",
        "churn": "/api/churn",
        "churn_score": "/api/churn-score",
        "ativos_atrasados": "/api/ativos-atrasados",
        "upgrade_downgrade": "/api/upgrade-downgrade",
        "perfil": "/api/perfil",
        "atendimentos": "/api/atendimentos",
        "pagamentos": "/api/pagamentos",
        "vencimentos_futuros": "/api/vencimentos-futuros",
        "intranet_2": "/api/intranet-2",
    }


@app.get("/health")
def health():
    try:
        test_supabase_connection()
        return {
            "status": "ok",
            "supabase": "connected",
        }
    except Exception as exc:
        return {
            "status": "error",
            "supabase": "disconnected",
            "detail": str(exc),
        }


@app.get("/api/cache/status")
def dashboard_cache_status():
    return cache_status()
