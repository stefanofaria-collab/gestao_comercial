from typing import Literal

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
)

from app.schemas import (
    DashboardResponse,
    MetaResponse,
)

from app.services.dashboard_service import (
    get_clientes_ativos_historico,
    get_dashboard,
    get_historico,
    get_meta,
)

from app.services.renewal_history_service import (
    get_renewal_history,
)

from app.services.revenue_history_service import (
    get_revenue_history,
)


router = APIRouter(
    prefix="/api",
    tags=["Dashboard"],
)


CompanyFilter = Literal[
    "todos",
    "gestaoclick",
    "clicknotas",
]


OriginFilter = Literal[
    "todos",
    "gestaoclick",
    "parceiro",
]


DurationFilter = Literal[
    "todos",
    "M",
    "T",
    "S",
    "A",
]


@router.get(
    "/meta",
    response_model=MetaResponse,
)
def meta():
    return get_meta()


@router.get(
    "/dashboard",
    response_model=DashboardResponse,
)
def dashboard(
    ano: int = Query(
        ...,
        description="2024, 2025 ou 2026",
    ),
    mes: int = Query(
        ...,
        ge=1,
        le=12,
    ),
    empresa: CompanyFilter = Query(
        "gestaoclick",
    ),
    origem: OriginFilter = Query(
        "gestaoclick",
    ),
    plano: str = Query(
        "todos",
    ),
    duracao: DurationFilter = Query(
        "todos",
    ),
    comparar: bool = Query(
        False,
    ),
):
    try:
        return get_dashboard(
            ano=ano,
            mes=mes,
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
            comparar=comparar,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar o Supabase. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get(
    "/historico",
)
def historico(
    ano_inicio: int = Query(
        2024,
    ),
    ano_fim: int = Query(
        2026,
    ),
    empresa: CompanyFilter = Query(
        "gestaoclick",
    ),
    origem: OriginFilter = Query(
        "gestaoclick",
    ),
    plano: str = Query(
        "todos",
    ),
    duracao: DurationFilter = Query(
        "todos",
    ),
):
    try:
        return get_historico(
            ano_inicio=ano_inicio,
            ano_fim=ano_fim,
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar o histórico no Supabase. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get(
    "/historico-clientes-ativos",
)
def historico_clientes_ativos(
    ano_inicio: int = Query(
        2024,
    ),
    ano_fim: int = Query(
        2026,
    ),
    empresa: CompanyFilter = Query(
        "gestaoclick",
    ),
    origem: OriginFilter = Query(
        "gestaoclick",
    ),
    plano: str = Query(
        "todos",
    ),
    duracao: DurationFilter = Query(
        "todos",
    ),
):
    try:
        resultado = get_clientes_ativos_historico(
            ano_inicio=ano_inicio,
            ano_fim=ano_fim,
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
        )

        pontos = (
            resultado.get("pontos")
            or []
        )

        planos = (
            resultado.get("planos")
            or []
        )

        pontos_planos = (
            resultado.get("pontos_planos")
            or resultado.get("pontos_por_plano")
            or resultado.get("pontosPorPlano")
            or resultado.get("por_plano")
            or []
        )

        return {
            "ano_inicio":
                int(
                    resultado.get(
                        "ano_inicio",
                        ano_inicio,
                    )
                ),

            "ano_fim":
                int(
                    resultado.get(
                        "ano_fim",
                        ano_fim,
                    )
                ),

            "pontos":
                pontos
                if isinstance(
                    pontos,
                    list,
                )
                else [],

            "planos":
                planos
                if isinstance(
                    planos,
                    list,
                )
                else [],

            "pontos_planos":
                pontos_planos
                if isinstance(
                    pontos_planos,
                    list,
                )
                else [],
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar o histórico de clientes ativos "
                "no Supabase. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get(
    "/historico-renovacao",
)
def historico_renovacao(
    ano_inicio: int = Query(
        2024,
    ),
    ano_fim: int = Query(
        2026,
    ),
    empresa: CompanyFilter = Query(
        "gestaoclick",
    ),
    origem: OriginFilter = Query(
        "gestaoclick",
    ),
    plano: str = Query(
        "todos",
    ),
    duracao: DurationFilter = Query(
        "todos",
    ),
):
    try:
        return get_renewal_history(
            ano_inicio=ano_inicio,
            ano_fim=ano_fim,
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar histórico de renovação. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc


@router.get(
    "/historico-receita",
)
def historico_receita(
    ano_inicio: int = Query(
        2024,
    ),
    ano_fim: int = Query(
        2026,
    ),
    empresa: CompanyFilter = Query(
        "gestaoclick",
    ),
    origem: OriginFilter = Query(
        "gestaoclick",
    ),
    plano: str = Query(
        "todos",
    ),
    duracao: DurationFilter = Query(
        "todos",
    ),
):
    try:
        return get_revenue_history(
            ano_inicio=ano_inicio,
            ano_fim=ano_fim,
            empresa=empresa,
            origem=origem,
            plano=plano,
            duracao=duracao,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Erro ao consultar histórico de receita. "
                f"Detalhe técnico: {type(exc).__name__}: {exc}"
            ),
        ) from exc
