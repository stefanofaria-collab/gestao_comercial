from __future__ import annotations

from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import test_supabase_connection
from app.routes.dashboard import router as dashboard_router


app = FastAPI(
    title="Gestão de Clientes API",
    version="2.1.0",
    description=(
        "API do dashboard executivo de renovação, clientes ativos, "
        "receita e churn, usando Supabase como camada de leitura."
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

configured_frontend_origin = normalize_origin(
    settings.frontend_origin
)

if configured_frontend_origin:
    allowed_origins.add(
        configured_frontend_origin
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(
        allowed_origins
    ),
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
    allow_headers=[
        "*",
    ],
    expose_headers=[
        "*",
    ],
    max_age=86400,
)


app.include_router(
    dashboard_router
)


@app.get("/")
def root():
    return {
        "app": "Gestão de Clientes API",
        "version": "2.1.0",
        "data_source": "Supabase",
        "docs": "/docs",
        "health": "/health",
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
