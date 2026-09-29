from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import bindparam, text

from app.database import supabase_engine


SELECT_PROFILE_COLUMNS = """
    cnpj,
    fonte,
    razao_social,
    nome_fantasia,
    situacao_cadastral,
    matriz_filial,
    data_abertura,
    cnae_principal_codigo,
    cnae_principal_descricao,
    setor,
    segmento,
    grupo_cnae,
    classe_cnae,
    porte,
    natureza_juridica,
    regime_tributario,
    simples_nacional,
    mei,
    capital_social,
    municipio,
    uf,
    cep,
    endereco,
    email,
    telefone,
    cnaes_secundarios,
    socios,
    payload_bruto,
    erro_ultima_consulta,
    consultado_em,
    atualizado_em
"""

SELECT_ANALYTICS_COLUMNS = """
    cnpj,
    regime_tributario,
    porte,
    setor,
    segmento
"""

UPSERT_PROFILE_SQL = text(
    """
    INSERT INTO public.perfil_empresas_enriquecidas (
        cnpj,
        fonte,
        razao_social,
        nome_fantasia,
        situacao_cadastral,
        matriz_filial,
        data_abertura,
        cnae_principal_codigo,
        cnae_principal_descricao,
        setor,
        segmento,
        grupo_cnae,
        classe_cnae,
        porte,
        natureza_juridica,
        regime_tributario,
        simples_nacional,
        mei,
        capital_social,
        municipio,
        uf,
        cep,
        endereco,
        email,
        telefone,
        cnaes_secundarios,
        socios,
        payload_bruto,
        erro_ultima_consulta,
        consultado_em,
        atualizado_em
    ) VALUES (
        :cnpj,
        :fonte,
        :razao_social,
        :nome_fantasia,
        :situacao_cadastral,
        :matriz_filial,
        :data_abertura,
        :cnae_principal_codigo,
        :cnae_principal_descricao,
        :setor,
        :segmento,
        :grupo_cnae,
        :classe_cnae,
        :porte,
        :natureza_juridica,
        :regime_tributario,
        :simples_nacional,
        :mei,
        :capital_social,
        :municipio,
        :uf,
        :cep,
        :endereco,
        :email,
        :telefone,
        CAST(:cnaes_secundarios AS jsonb),
        CAST(:socios AS jsonb),
        CAST(:payload_bruto AS jsonb),
        :erro_ultima_consulta,
        :consultado_em,
        :atualizado_em
    )
    ON CONFLICT (cnpj) DO UPDATE SET
        fonte = EXCLUDED.fonte,
        razao_social = EXCLUDED.razao_social,
        nome_fantasia = EXCLUDED.nome_fantasia,
        situacao_cadastral = EXCLUDED.situacao_cadastral,
        matriz_filial = EXCLUDED.matriz_filial,
        data_abertura = EXCLUDED.data_abertura,
        cnae_principal_codigo = EXCLUDED.cnae_principal_codigo,
        cnae_principal_descricao = EXCLUDED.cnae_principal_descricao,
        setor = EXCLUDED.setor,
        segmento = EXCLUDED.segmento,
        grupo_cnae = EXCLUDED.grupo_cnae,
        classe_cnae = EXCLUDED.classe_cnae,
        porte = EXCLUDED.porte,
        natureza_juridica = EXCLUDED.natureza_juridica,
        regime_tributario = EXCLUDED.regime_tributario,
        simples_nacional = EXCLUDED.simples_nacional,
        mei = EXCLUDED.mei,
        capital_social = EXCLUDED.capital_social,
        municipio = EXCLUDED.municipio,
        uf = EXCLUDED.uf,
        cep = EXCLUDED.cep,
        endereco = EXCLUDED.endereco,
        email = EXCLUDED.email,
        telefone = EXCLUDED.telefone,
        cnaes_secundarios = EXCLUDED.cnaes_secundarios,
        socios = EXCLUDED.socios,
        payload_bruto = EXCLUDED.payload_bruto,
        erro_ultima_consulta = EXCLUDED.erro_ultima_consulta,
        consultado_em = EXCLUDED.consultado_em,
        atualizado_em = EXCLUDED.atualizado_em
    """
)

UPSERT_DOCUMENT_SQL = text(
    """
    INSERT INTO public.perfil_cliente_documentos (
        empresa_id,
        tipo_pessoa,
        cnpj_cadastro,
        cnpj_nota,
        cnpjs_diferentes,
        fonte_cnpj_preferida,
        atualizado_em
    ) VALUES (
        :empresa_id,
        :tipo_pessoa,
        :cnpj_cadastro,
        :cnpj_nota,
        :cnpjs_diferentes,
        :fonte_cnpj_preferida,
        now()
    )
    ON CONFLICT (empresa_id) DO UPDATE SET
        tipo_pessoa = EXCLUDED.tipo_pessoa,
        cnpj_cadastro = EXCLUDED.cnpj_cadastro,
        cnpj_nota = EXCLUDED.cnpj_nota,
        cnpjs_diferentes = EXCLUDED.cnpjs_diferentes,
        fonte_cnpj_preferida = CASE
            WHEN public.perfil_cliente_documentos.fonte_cnpj_preferida IN ('cadastro', 'nota')
            THEN public.perfil_cliente_documentos.fonte_cnpj_preferida
            ELSE EXCLUDED.fonte_cnpj_preferida
        END,
        atualizado_em = now()
    """
)


def _profile_from_row(row: dict) -> dict:
    cnpj = str(row.get("cnpj") or "")
    cnaes = row.get("cnaes_secundarios") or []
    socios = row.get("socios") or []
    if isinstance(cnaes, str):
        try:
            cnaes = json.loads(cnaes)
        except Exception:
            cnaes = []
    if isinstance(socios, str):
        try:
            socios = json.loads(socios)
        except Exception:
            socios = []
    formatted = cnpj
    if len(cnpj) == 14 and cnpj.isdigit():
        formatted = f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
    return {
        "fonte": row.get("fonte") or "Supabase",
        "aviso_fonte": (
            "Dados empresariais persistidos no banco Gestão Comercial. "
            "A fonte externa e a data da consulta ficam registradas no Supabase."
        ),
        "cnpj": formatted,
        "cnpj_limpo": cnpj,
        "razao_social": row.get("razao_social"),
        "nome_fantasia": row.get("nome_fantasia"),
        "situacao_cadastral": row.get("situacao_cadastral"),
        "matriz_filial": row.get("matriz_filial"),
        "data_abertura": row.get("data_abertura").isoformat() if row.get("data_abertura") else None,
        "cnae_principal": {
            "codigo": row.get("cnae_principal_codigo"),
            "descricao": row.get("cnae_principal_descricao"),
        },
        "setor": row.get("setor"),
        "segmento": row.get("segmento"),
        "grupo_cnae": row.get("grupo_cnae"),
        "classe_cnae": row.get("classe_cnae"),
        "porte": row.get("porte"),
        "natureza_juridica": row.get("natureza_juridica"),
        "regime_tributario": row.get("regime_tributario"),
        "simples_nacional": row.get("simples_nacional"),
        "mei": row.get("mei"),
        "capital_social": float(row.get("capital_social") or 0),
        "municipio": row.get("municipio"),
        "uf": row.get("uf"),
        "cep": row.get("cep"),
        "endereco": row.get("endereco"),
        "email": row.get("email"),
        "telefone": row.get("telefone"),
        "cnaes_secundarios": cnaes if isinstance(cnaes, list) else [],
        "socios": socios if isinstance(socios, list) else [],
        "consultado_em": row.get("consultado_em").isoformat() if row.get("consultado_em") else None,
        "erro_ultima_consulta": row.get("erro_ultima_consulta"),
    }


def get_business_profile(cnpj: str) -> dict | None:
    # A página Perfil é somente leitura em relação ao enriquecimento.
    # Retornamos apenas empresas já enriquecidas com sucesso no Supabase.
    sql = text(
        f"""
        SELECT {SELECT_PROFILE_COLUMNS}
        FROM public.perfil_empresas_enriquecidas
        WHERE cnpj = :cnpj
          AND erro_ultima_consulta IS NULL
        """
    )
    with supabase_engine.connect() as connection:
        row = connection.execute(sql, {"cnpj": cnpj}).mappings().first()
    if not row:
        return None
    return _profile_from_row(dict(row))


def get_business_profiles(cnpjs: list[str] | set[str] | tuple[str, ...]) -> dict[str, dict]:
    values = sorted({str(value) for value in cnpjs if value})
    if not values:
        return {}

    # Evita enviar dezenas de milhares de parâmetros em uma única consulta.
    # Mantemos uma única conexão e consultamos os CNPJs em blocos.
    result: dict[str, dict] = {}
    chunk_size = 1000
    sql = text(
        f"""
        SELECT {SELECT_PROFILE_COLUMNS}
        FROM public.perfil_empresas_enriquecidas
        WHERE cnpj IN :cnpjs
          AND erro_ultima_consulta IS NULL
        """
    ).bindparams(bindparam("cnpjs", expanding=True))

    with supabase_engine.connect() as connection:
        for index in range(0, len(values), chunk_size):
            chunk = values[index:index + chunk_size]
            rows = connection.execute(sql, {"cnpjs": chunk}).mappings().all()
            for row in rows:
                result[str(row["cnpj"])] = _profile_from_row(dict(row))

    return result


def get_business_analytics_snapshot(
    cnpjs: list[str] | set[str] | tuple[str, ...],
) -> tuple[dict[str, dict], dict]:
    """Lê do Supabase somente os campos usados nos gráficos de Perfil.

    Os CNPJs relevantes são enviados como um array PostgreSQL e consultados em
    uma única instrução. Não carregamos payload_bruto, sócios ou CNAEs
    secundários nesta etapa, então a leitura fica pequena e rápida.
    """
    values = sorted({str(value) for value in cnpjs if value})
    profiles: dict[str, dict] = {}

    sql = text(
        f"""
        SELECT {SELECT_ANALYTICS_COLUMNS}
        FROM public.perfil_empresas_enriquecidas
        WHERE cnpj = ANY(CAST(:cnpjs AS text[]))
          AND erro_ultima_consulta IS NULL
        """
    )

    with supabase_engine.connect() as connection:
        if values:
            rows = connection.execute(sql, {"cnpjs": values}).mappings().all()
            for row in rows:
                cnpj = str(row["cnpj"])
                profiles[cnpj] = {
                    "cnpj_limpo": cnpj,
                    "regime_tributario": row.get("regime_tributario"),
                    "porte": row.get("porte"),
                    "setor": row.get("setor"),
                    "segmento": row.get("segmento"),
                }

        mapped_companies = int(connection.execute(
            text("SELECT COUNT(*) FROM public.perfil_cliente_documentos")
        ).scalar_one())
        mapped_pj = int(connection.execute(text(
            "SELECT COUNT(*) FROM public.perfil_cliente_documentos "
            "WHERE cnpj_cadastro IS NOT NULL OR cnpj_nota IS NOT NULL"
        )).scalar_one())
        unique_cnpjs = int(connection.execute(text("""
            SELECT COUNT(DISTINCT cnpj)
            FROM (
                SELECT cnpj_cadastro AS cnpj
                FROM public.perfil_cliente_documentos
                WHERE cnpj_cadastro IS NOT NULL
                UNION ALL
                SELECT cnpj_nota AS cnpj
                FROM public.perfil_cliente_documentos
                WHERE cnpj_nota IS NOT NULL
            ) x
        """)).scalar_one())
        enriched = int(connection.execute(text(
            "SELECT COUNT(*) FROM public.perfil_empresas_enriquecidas "
            "WHERE erro_ultima_consulta IS NULL"
        )).scalar_one())
        failed = int(connection.execute(text(
            "SELECT COUNT(*) FROM public.perfil_empresas_enriquecidas "
            "WHERE erro_ultima_consulta IS NOT NULL"
        )).scalar_one())

    pending = max(0, unique_cnpjs - enriched)
    status = {
        "empresas_mapeadas": mapped_companies,
        "empresas_com_cnpj": mapped_pj,
        "cnpjs_unicos": unique_cnpjs,
        "cnpjs_enriquecidos": enriched,
        "cnpjs_com_erro": failed,
        "cnpjs_pendentes": pending,
        "percentual": round((enriched / unique_cnpjs * 100), 2) if unique_cnpjs else 0.0,
    }
    return profiles, status


def upsert_business_profile(profile: dict, payload_bruto: dict | list | None = None, erro: str | None = None) -> None:
    now = datetime.now(timezone.utc)
    main_cnae = profile.get("cnae_principal") or {}
    data_abertura = profile.get("data_abertura") or None
    params = {
        "cnpj": profile.get("cnpj_limpo"),
        "fonte": profile.get("fonte") or "Não informada",
        "razao_social": profile.get("razao_social"),
        "nome_fantasia": profile.get("nome_fantasia"),
        "situacao_cadastral": profile.get("situacao_cadastral"),
        "matriz_filial": profile.get("matriz_filial"),
        "data_abertura": data_abertura,
        "cnae_principal_codigo": main_cnae.get("codigo"),
        "cnae_principal_descricao": main_cnae.get("descricao"),
        "setor": profile.get("setor"),
        "segmento": profile.get("segmento"),
        "grupo_cnae": profile.get("grupo_cnae"),
        "classe_cnae": profile.get("classe_cnae"),
        "porte": profile.get("porte"),
        "natureza_juridica": profile.get("natureza_juridica"),
        "regime_tributario": profile.get("regime_tributario"),
        "simples_nacional": profile.get("simples_nacional") if isinstance(profile.get("simples_nacional"), bool) else None,
        "mei": profile.get("mei") if isinstance(profile.get("mei"), bool) else None,
        "capital_social": float(profile.get("capital_social") or 0),
        "municipio": profile.get("municipio"),
        "uf": profile.get("uf"),
        "cep": profile.get("cep"),
        "endereco": profile.get("endereco"),
        "email": profile.get("email"),
        "telefone": profile.get("telefone"),
        "cnaes_secundarios": json.dumps(profile.get("cnaes_secundarios") or [], ensure_ascii=False),
        "socios": json.dumps(profile.get("socios") or [], ensure_ascii=False),
        "payload_bruto": json.dumps(payload_bruto or {}, ensure_ascii=False),
        "erro_ultima_consulta": erro,
        "consultado_em": now,
        "atualizado_em": now,
    }
    with supabase_engine.begin() as connection:
        connection.execute(UPSERT_PROFILE_SQL, params)


def mark_business_profile_error(cnpj: str, error_message: str) -> None:
    now = datetime.now(timezone.utc)
    params = {
        "cnpj": cnpj,
        "fonte": "Falha na consulta",
        "razao_social": None,
        "nome_fantasia": None,
        "situacao_cadastral": None,
        "matriz_filial": None,
        "data_abertura": None,
        "cnae_principal_codigo": None,
        "cnae_principal_descricao": None,
        "setor": None,
        "segmento": None,
        "grupo_cnae": None,
        "classe_cnae": None,
        "porte": None,
        "natureza_juridica": None,
        "regime_tributario": None,
        "simples_nacional": None,
        "mei": None,
        "capital_social": 0,
        "municipio": None,
        "uf": None,
        "cep": None,
        "endereco": None,
        "email": None,
        "telefone": None,
        "cnaes_secundarios": "[]",
        "socios": "[]",
        "payload_bruto": "{}",
        "erro_ultima_consulta": error_message[:1000],
        "consultado_em": now,
        "atualizado_em": now,
    }
    with supabase_engine.begin() as connection:
        connection.execute(UPSERT_PROFILE_SQL, params)


def upsert_client_documents(rows: list[dict]) -> int:
    payloads: list[dict] = []
    seen: set[int] = set()
    for row in rows:
        company_id = int(row.get("empresa_id") or 0)
        if not company_id or company_id in seen:
            continue
        seen.add(company_id)
        cnpj_cadastro = row.get("cnpj_cadastro") or None
        cnpj_nota = row.get("cnpj_nota") or None
        preferred = "cadastro" if cnpj_cadastro else "nota"
        payloads.append(
            {
                "empresa_id": company_id,
                "tipo_pessoa": row.get("tipo_pessoa") or "Não identificado",
                "cnpj_cadastro": cnpj_cadastro,
                "cnpj_nota": cnpj_nota,
                "cnpjs_diferentes": bool(cnpj_cadastro and cnpj_nota and cnpj_cadastro != cnpj_nota),
                "fonte_cnpj_preferida": preferred,
            }
        )
    if not payloads:
        return 0
    with supabase_engine.begin() as connection:
        connection.execute(UPSERT_DOCUMENT_SQL, payloads)
    return len(payloads)


def count_business_profiles() -> int:
    with supabase_engine.connect() as connection:
        return int(connection.execute(text("SELECT COUNT(*) FROM public.perfil_empresas_enriquecidas WHERE erro_ultima_consulta IS NULL")).scalar_one())


def get_all_mapped_cnpjs() -> list[str]:
    sql = text(
        """
        SELECT DISTINCT cnpj
        FROM (
            SELECT cnpj_cadastro AS cnpj FROM public.perfil_cliente_documentos WHERE cnpj_cadastro IS NOT NULL
            UNION
            SELECT cnpj_nota AS cnpj FROM public.perfil_cliente_documentos WHERE cnpj_nota IS NOT NULL
        ) docs
        WHERE cnpj IS NOT NULL
        ORDER BY cnpj
        """
    )
    with supabase_engine.connect() as connection:
        return [str(row[0]) for row in connection.execute(sql).all()]


def get_enriched_cnpjs() -> set[str]:
    with supabase_engine.connect() as connection:
        rows = connection.execute(
            text("SELECT cnpj FROM public.perfil_empresas_enriquecidas WHERE erro_ultima_consulta IS NULL")
        ).all()
    return {str(row[0]) for row in rows}


def get_sync_status() -> dict:
    with supabase_engine.connect() as connection:
        mapped_companies = int(connection.execute(text("SELECT COUNT(*) FROM public.perfil_cliente_documentos")).scalar_one())
        mapped_pj = int(connection.execute(text("SELECT COUNT(*) FROM public.perfil_cliente_documentos WHERE cnpj_cadastro IS NOT NULL OR cnpj_nota IS NOT NULL")).scalar_one())
        unique_cnpjs = int(connection.execute(text("""
            SELECT COUNT(DISTINCT cnpj)
            FROM (
                SELECT cnpj_cadastro AS cnpj FROM public.perfil_cliente_documentos WHERE cnpj_cadastro IS NOT NULL
                UNION ALL
                SELECT cnpj_nota AS cnpj FROM public.perfil_cliente_documentos WHERE cnpj_nota IS NOT NULL
            ) x
        """)).scalar_one())
        enriched = int(connection.execute(text("SELECT COUNT(*) FROM public.perfil_empresas_enriquecidas WHERE erro_ultima_consulta IS NULL")).scalar_one())
        failed = int(connection.execute(text("SELECT COUNT(*) FROM public.perfil_empresas_enriquecidas WHERE erro_ultima_consulta IS NOT NULL")).scalar_one())
    pending = max(0, unique_cnpjs - enriched)
    return {
        "empresas_mapeadas": mapped_companies,
        "empresas_com_cnpj": mapped_pj,
        "cnpjs_unicos": unique_cnpjs,
        "cnpjs_enriquecidos": enriched,
        "cnpjs_com_erro": failed,
        "cnpjs_pendentes": pending,
        "percentual": round((enriched / unique_cnpjs * 100), 2) if unique_cnpjs else 0.0,
    }


def get_business_filter_options() -> dict:
    sql = text(
        """
        SELECT
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT regime_tributario ORDER BY regime_tributario), NULL) AS regimes,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT porte ORDER BY porte), NULL) AS portes,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT setor ORDER BY setor), NULL) AS setores,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT segmento ORDER BY segmento), NULL) AS segmentos
        FROM public.perfil_empresas_enriquecidas
        WHERE erro_ultima_consulta IS NULL
        """
    )
    with supabase_engine.connect() as connection:
        row = connection.execute(sql).mappings().first() or {}
    return {
        "regimes": [str(value) for value in (row.get("regimes") or []) if value],
        "portes": [str(value) for value in (row.get("portes") or []) if value],
        "setores": [str(value) for value in (row.get("setores") or []) if value],
        "segmentos": [str(value) for value in (row.get("segmentos") or []) if value],
    }


def get_matching_business_cnpjs(
    regime_tributario: str = "",
    porte: str = "",
    setor: str = "",
    segmento: str = "",
) -> set[str]:
    clauses = ["erro_ultima_consulta IS NULL"]
    params: dict[str, str] = {}

    filters = {
        "regime_tributario": regime_tributario,
        "porte": porte,
        "setor": setor,
        "segmento": segmento,
    }
    for field, value in filters.items():
        cleaned = str(value or "").strip()
        if cleaned:
            clauses.append(f"LOWER({field}) LIKE LOWER(:{field})")
            params[field] = f"%{cleaned}%"

    sql = text(
        "SELECT cnpj FROM public.perfil_empresas_enriquecidas WHERE "
        + " AND ".join(clauses)
    )
    with supabase_engine.connect() as connection:
        rows = connection.execute(sql, params).scalars().all()
    return {str(value) for value in rows if value}
