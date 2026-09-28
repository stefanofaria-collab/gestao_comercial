from __future__ import annotations

import json
import re
from collections import Counter
from collections import defaultdict
from datetime import date
from functools import lru_cache
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from sqlalchemy import bindparam, text

from app.constants import EXCLUDED_COMPANY_IDS
from app.database import source_engine
from app.repositories.perfil_supabase_repository import (
    count_business_profiles,
    get_business_profile as get_business_profile_from_db,
    get_business_profiles,
    get_sync_status,
    mark_business_profile_error,
    upsert_business_profile,
    upsert_client_documents,
)
from app.services.churn_service import get_churn_dashboard


VALID_COMPANY_FILTERS = {"todos", "gestaoclick", "clicknotas"}
VALID_ORIGIN_FILTERS = {"todos", "gestaoclick", "parceiro"}
VALID_PAYER_FILTERS = {"todos", "cliente", "parceiro"}
PROFILE_EXCLUDED_COMPANY_IDS = tuple(
    dict.fromkeys((*EXCLUDED_COMPANY_IDS, 205324, 380371, 517101))
)

VALID_CNPJ_SOURCES = {"cadastro", "nota"}


DIMENSION_FILTER_SQL = """
    AND (
        :empresa = 'todos'
        OR (:empresa = 'gestaoclick' AND e.modalidade = 'ERP')
        OR (:empresa = 'clicknotas' AND e.modalidade IN ('NFE', 'FIS'))
    )
    AND (
        :origem = 'todos'
        OR (:origem = 'gestaoclick' AND e.empresa_indicacao_id = 1)
        OR (:origem = 'parceiro' AND e.empresa_indicacao_id <> 1)
    )
    AND (
        :pagador = 'todos'
        OR (:pagador = 'cliente' AND e.tipo_cobranca = 'E')
        OR (:pagador = 'parceiro' AND e.tipo_cobranca = 'P')
    )
"""

# Baseada na consulta fornecida para clientes ativos, retirando apenas os filtros
# usados para validar Bronze/Trimestral e tornando a data de referência dinâmica.
ACTIVE_CLIENTS_SQL = text(
    f"""
    WITH base_ativa AS (
        SELECT
            e.id AS empresa_id,
            e.modalidade,
            e.empresa_indicacao_id,
            e.tipo_cobranca,
            e.ativou_em,
            ep.cpf_cnpj,
            (
                SELECT nfs_doc.dest_cnpj
                FROM notas_fiscais_servicos nfs_doc
                WHERE nfs_doc.plano_id = ep.id
                  AND nfs_doc.situacao < 4
                ORDER BY nfs_doc.data_emissao DESC, nfs_doc.id DESC
                LIMIT 1
            ) AS dest_cnpj,
            CASE
                WHEN e.modalidade = 'ERP' THEN 'GestãoClick'
                WHEN e.modalidade IN ('NFE', 'FIS') THEN 'ClickNotas'
                ELSE 'Outros'
            END AS empresa,
            CASE
                WHEN e.empresa_indicacao_id = 1 THEN 'GestãoClick'
                ELSE 'Parceiro'
            END AS origem,
            CASE
                WHEN e.tipo_cobranca = 'E' THEN 'Cliente'
                WHEN e.tipo_cobranca = 'P' THEN 'Parceiro'
                ELSE 'Não informado'
            END AS pagador,
            REPLACE(REPLACE(ep.nome_plano, ' + recursos', ''), ' (+) recursos', '') AS nome_plano,
            ep.duracao,
            ep.data_vencimento,
            CASE
                WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado
                ELSE ep.valor
            END AS valor,
            ROW_NUMBER() OVER (
                PARTITION BY e.id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON ep.empresa_id = e.id
        WHERE
            ep.plano_id <> 1
            AND ep.atual = 1
            AND ep.data_vencimento >= :data_referencia
            AND ep.pago_em IS NOT NULL
            AND ep.nota_fiscal_servico_id IS NOT NULL
            AND e.id NOT IN :excluidos
            {DIMENSION_FILTER_SQL}
    )
    SELECT
        empresa_id,
        modalidade,
        empresa_indicacao_id,
        tipo_cobranca,
        ativou_em,
        cpf_cnpj,
        dest_cnpj,
        empresa,
        origem,
        pagador,
        nome_plano,
        duracao,
        data_vencimento,
        ROUND(COALESCE(valor, 0), 2) AS valor
    FROM base_ativa
    WHERE ordem = 1
    ORDER BY empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))


def _validate(year: int, month: int, empresa: str, origem: str, pagador: str) -> None:
    today = date.today()
    if year < 2024:
        raise ValueError("A análise de perfil começa em 2024.")
    if not 0 <= month <= 12:
        raise ValueError("Mês inválido.")
    if year > today.year or (year == today.year and month != 0 and month > today.month):
        raise ValueError("Não é possível consultar um período futuro.")
    if empresa not in VALID_COMPANY_FILTERS:
        raise ValueError("Filtro de empresa inválido.")
    if origem not in VALID_ORIGIN_FILTERS:
        raise ValueError("Filtro de origem inválido.")
    if pagador not in VALID_PAYER_FILTERS:
        raise ValueError("Filtro de responsável pelo pagamento inválido.")


def _duration_label(value: str | None) -> str:
    return {
        "M": "Mensal",
        "T": "Trimestral",
        "S": "Semestral",
        "A": "Anual",
    }.get(value or "", value or "Não informado")


def _clean_document(value: str | None) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", str(value or "")).upper()


def _document_kind(value: str | None) -> str:
    cleaned = _clean_document(value)
    if len(cleaned) == 11 and cleaned.isdigit():
        return "PF"
    if len(cleaned) == 14 and cleaned.isalnum():
        return "PJ"
    return "Não identificado"


def _format_document(value: str | None) -> str | None:
    cleaned = _clean_document(value)
    if not cleaned:
        return None
    if len(cleaned) == 11 and cleaned.isdigit():
        return f"***.***.***-{cleaned[-2:]}"
    if len(cleaned) == 14 and cleaned.isdigit():
        return f"{cleaned[:2]}.{cleaned[2:5]}.{cleaned[5:8]}/{cleaned[8:12]}-{cleaned[12:]}"
    return cleaned


def _document_payload(cpf_cnpj: str | None, dest_cnpj: str | None) -> dict:
    cadastro = _clean_document(cpf_cnpj)
    nota = _clean_document(dest_cnpj)
    tipo_cadastro = _document_kind(cpf_cnpj)
    tipo_nota = _document_kind(dest_cnpj)
    cnpj_cadastro = cadastro if tipo_cadastro == "PJ" else None
    cnpj_nota = nota if tipo_nota == "PJ" else None
    return {
        "tipo_pessoa": tipo_cadastro,
        "tipo_documento_nota": tipo_nota,
        "documento_cadastro": _format_document(cpf_cnpj),
        "documento_nota": _format_document(dest_cnpj),
        "cnpj_cadastro": cnpj_cadastro,
        "cnpj_nota": cnpj_nota,
        "cnpjs_diferentes": bool(cnpj_cadastro and cnpj_nota and cnpj_cadastro != cnpj_nota),
        "tem_cnpj_consultavel": bool(cnpj_cadastro or cnpj_nota),
    }


def _serialize_active(db_rows) -> list[dict]:
    rows: list[dict] = []
    for raw in db_rows:
        row = dict(raw._mapping)
        docs = _document_payload(row.get("cpf_cnpj"), row.get("dest_cnpj"))
        rows.append(
            {
                "empresa_id": int(row["empresa_id"]),
                "cliente": f"Cliente #{int(row['empresa_id'])}",
                "status_base": "Ativo",
                "empresa": str(row.get("empresa") or "Não informado"),
                "origem": str(row.get("origem") or "Não informado"),
                "pagador": str(row.get("pagador") or "Não informado"),
                "modalidade": str(row.get("modalidade") or ""),
                "nome_plano": str(row.get("nome_plano") or "Não informado"),
                "duracao": str(row.get("duracao") or ""),
                "duracao_label": _duration_label(row.get("duracao")),
                "ativou_em": row.get("ativou_em").isoformat() if row.get("ativou_em") else None,
                "data_vencimento": row.get("data_vencimento").isoformat() if row.get("data_vencimento") else None,
                "valor": round(float(row.get("valor") or 0), 2),
                **docs,
            }
        )
    return rows


def _serialize_churn_client(row: dict) -> dict:
    docs = _document_payload(row.get("cpf_cnpj"), row.get("dest_cnpj"))
    return {
        **row,
        "status_base": "Churn",
        "valor": round(float(row.get("valor_perdido") or 0), 2),
        **docs,
    }


@lru_cache(maxsize=64)
def _get_active_clients_cached(empresa: str, origem: str, pagador: str, reference_iso: str) -> tuple[dict, ...]:
    params = {
        "data_referencia": date.fromisoformat(reference_iso),
        "empresa": empresa,
        "origem": origem,
        "pagador": pagador,
        "excluidos": PROFILE_EXCLUDED_COMPANY_IDS,
    }
    with source_engine.connect() as connection:
        db_rows = connection.execute(ACTIVE_CLIENTS_SQL, params).all()
    return tuple(_serialize_active(db_rows))


def _get_active_clients(empresa: str, origem: str, pagador: str) -> list[dict]:
    return [dict(row) for row in _get_active_clients_cached(empresa, origem, pagador, date.today().isoformat())]


def _summary_by_person(active_rows: list[dict], churn_rows: list[dict]) -> list[dict]:
    values = []
    for kind in ("PJ", "PF", "Não identificado"):
        active = [row for row in active_rows if row["tipo_pessoa"] == kind]
        churn = [row for row in churn_rows if row["tipo_pessoa"] == kind]
        active_value = round(sum(float(row.get("valor") or 0) for row in active), 2)
        churn_last_value = round(sum(float(row.get("valor_perdido") or 0) for row in churn), 2)
        ltv_total = round(sum(float(row.get("ltv") or 0) for row in churn), 2)
        churn_count = len(churn)
        values.append(
            {
                "tipo": kind,
                "ativos": len(active),
                "valor_ativos": active_value,
                "ticket_ativo_medio": round(active_value / len(active), 2) if active else 0.0,
                "churns": churn_count,
                "valor_ultimo_plano_churn": churn_last_value,
                "ltv_total_churn": ltv_total,
                "ltv_medio_churn": round(ltv_total / churn_count, 2) if churn_count else 0.0,
                "tempo_medio_churn_meses": round(sum(float(row.get("meses_cliente") or 0) for row in churn) / churn_count, 1) if churn_count else 0.0,
                "renovacoes_media_churn": round(sum(int(row.get("renovacoes") or 0) for row in churn) / churn_count, 1) if churn_count else 0.0,
            }
        )
    return values


def _plan_cross(active_rows: list[dict], churn_rows: list[dict]) -> list[dict]:
    grouped: defaultdict[str, dict] = defaultdict(
        lambda: {
            "ativos_pf": 0,
            "ativos_pj": 0,
            "ativos_outros": 0,
            "valor_ativos": 0.0,
            "churn_pf": 0,
            "churn_pj": 0,
            "churn_outros": 0,
            "ltv_churn": 0.0,
            "valor_churn": 0.0,
        }
    )
    for row in active_rows:
        item = grouped[row["nome_plano"]]
        kind = row["tipo_pessoa"]
        item["ativos_pf" if kind == "PF" else "ativos_pj" if kind == "PJ" else "ativos_outros"] += 1
        item["valor_ativos"] += float(row.get("valor") or 0)
    for row in churn_rows:
        item = grouped[row["nome_plano"]]
        kind = row["tipo_pessoa"]
        item["churn_pf" if kind == "PF" else "churn_pj" if kind == "PJ" else "churn_outros"] += 1
        item["ltv_churn"] += float(row.get("ltv") or 0)
        item["valor_churn"] += float(row.get("valor_perdido") or 0)

    result = []
    for plan, item in grouped.items():
        active_total = item["ativos_pf"] + item["ativos_pj"] + item["ativos_outros"]
        churn_total = item["churn_pf"] + item["churn_pj"] + item["churn_outros"]
        result.append(
            {
                "plano": plan,
                **item,
                "ativos_total": active_total,
                "churn_total": churn_total,
                "valor_ativos": round(item["valor_ativos"], 2),
                "ltv_churn": round(item["ltv_churn"], 2),
                "valor_churn": round(item["valor_churn"], 2),
            }
        )
    result.sort(key=lambda item: item["ativos_total"], reverse=True)
    return result


def _document_quality(rows: list[dict]) -> dict:
    total = len(rows)
    counters = {
        "cadastro_pf": 0,
        "cadastro_pj": 0,
        "cadastro_nao_identificado": 0,
        "cnpj_igual_cadastro_nota": 0,
        "cnpj_diferente_cadastro_nota": 0,
        "cadastro_pf_com_cnpj_na_nota": 0,
        "sem_cnpj_consultavel": 0,
    }
    for row in rows:
        kind = row["tipo_pessoa"]
        if kind == "PF":
            counters["cadastro_pf"] += 1
        elif kind == "PJ":
            counters["cadastro_pj"] += 1
        else:
            counters["cadastro_nao_identificado"] += 1
        if row.get("cnpj_cadastro") and row.get("cnpj_nota"):
            if row["cnpj_cadastro"] == row["cnpj_nota"]:
                counters["cnpj_igual_cadastro_nota"] += 1
            else:
                counters["cnpj_diferente_cadastro_nota"] += 1
        if kind == "PF" and row.get("cnpj_nota"):
            counters["cadastro_pf_com_cnpj_na_nota"] += 1
        if not row.get("tem_cnpj_consultavel"):
            counters["sem_cnpj_consultavel"] += 1
    return {"total": total, **counters}


@lru_cache(maxsize=128)
def get_perfil_dashboard(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    active_rows = _get_active_clients(empresa, origem, pagador)
    churn = get_churn_dashboard(year, month, empresa, origem, pagador)
    churn_rows = [_serialize_churn_client(row) for row in churn.get("clientes", [])]
    by_person = _summary_by_person(active_rows, churn_rows)
    active_value = round(sum(row["valor"] for row in active_rows), 2)
    churn_ltv = round(sum(float(row.get("ltv") or 0) for row in churn_rows), 2)

    return {
        "periodo_churn": churn["periodo"],
        "data_base_ativa": date.today().isoformat(),
        "filtros": {"empresa": empresa, "origem": origem, "pagador": pagador},
        "resumo": {
            "clientes_ativos": len(active_rows),
            "valor_base_ativa": active_value,
            "clientes_churn": len(churn_rows),
            "ltv_total_churn": churn_ltv,
            "ltv_medio_churn": round(churn_ltv / len(churn_rows), 2) if churn_rows else 0.0,
        },
        "por_tipo_pessoa": by_person,
        "por_plano": _plan_cross(active_rows, churn_rows),
        "qualidade_documentos": {
            "ativos": _document_quality(active_rows),
            "churn": _document_quality(churn_rows),
        },
    }


def get_perfil_clients(
    year: int,
    month: int,
    grupo: str,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    search: str = "",
    page: int = 1,
    limit: int = 50,
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    if grupo not in {"ativos", "churn"}:
        raise ValueError("Grupo inválido. Use ativos ou churn.")
    if page < 1:
        raise ValueError("Página inválida.")
    limit = max(10, min(int(limit), 200))

    if grupo == "ativos":
        rows = _get_active_clients(empresa, origem, pagador)
    else:
        churn = get_churn_dashboard(year, month, empresa, origem, pagador)
        rows = [_serialize_churn_client(row) for row in churn.get("clientes", [])]


    term = search.strip().lower()
    if term:
        def matches(row: dict) -> bool:
            haystack = " ".join(
                str(row.get(key) or "")
                for key in (
                    "empresa_id", "cliente", "empresa", "origem", "pagador", "nome_plano",
                    "duracao_label", "documento_cadastro", "documento_nota", "tipo_pessoa"
                )
            ).lower()
            return term in haystack
        rows = [row for row in rows if matches(row)]

    total = len(rows)
    start = (page - 1) * limit
    end = start + limit
    return {
        "grupo": grupo,
        "page": page,
        "limit": limit,
        "total": total,
        "total_paginas": max(1, (total + limit - 1) // limit),
        "clientes": rows[start:end],
    }


def _fetch_json(url: str, timeout: int = 12) -> dict | list:
    request = Request(
        url,
        headers={
            "User-Agent": "GestaoComercial/3.7 (+local dashboard)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


@lru_cache(maxsize=2048)
def _try_cnae_hierarchy(cnae_code: str) -> dict:
    digits = re.sub(r"\D", "", str(cnae_code or ""))
    if len(digits) < 5:
        return {}
    class_code = digits[:5]
    try:
        payload = _fetch_json(
            f"https://brasilapi.com.br/api/ibge/cnae/v1/classes/{quote(class_code)}",
            timeout=8,
        )
        if isinstance(payload, list) and payload:
            payload = payload[0]
        if not isinstance(payload, dict):
            return {}
        group = payload.get("grupo") or {}
        division = group.get("divisao") or {}
        section = division.get("secao") or {}
        return {
            "setor": section.get("descricao"),
            "segmento": division.get("descricao"),
            "grupo_cnae": group.get("descricao"),
            "classe_cnae": payload.get("descricao"),
        }
    except Exception:
        return {}


def _latest_tax_regime(payload: dict) -> str | None:
    if payload.get("opcao_pelo_mei") is True:
        return "MEI"
    if payload.get("opcao_pelo_simples") is True:
        return "Simples Nacional"
    regimes = payload.get("regime_tributario") or []
    if isinstance(regimes, list) and regimes:
        valid = [item for item in regimes if isinstance(item, dict)]
        valid.sort(key=lambda item: int(item.get("ano") or 0), reverse=True)
        if valid:
            return valid[0].get("forma_de_tributacao") or None
    return None


def _normalize_brasilapi(payload: dict, cnpj: str) -> dict:
    cnae_code = str(payload.get("cnae_fiscal") or "")
    hierarchy = _try_cnae_hierarchy(cnae_code)
    secondary = payload.get("cnaes_secundarios") or []
    partners = payload.get("qsa") or []
    phone = payload.get("ddd_telefone_1") or payload.get("ddd_telefone1") or None
    address_parts = [
        payload.get("descricao_tipo_de_logradouro"),
        payload.get("logradouro"),
        payload.get("numero"),
        payload.get("complemento"),
        payload.get("bairro"),
    ]
    address = " ".join(str(item).strip() for item in address_parts if str(item or "").strip()) or None
    return {
        "fonte": "BrasilAPI / Minha Receita",
        "cnpj": _format_document(cnpj),
        "cnpj_limpo": cnpj,
        "razao_social": payload.get("razao_social"),
        "nome_fantasia": payload.get("nome_fantasia"),
        "situacao_cadastral": payload.get("descricao_situacao_cadastral"),
        "matriz_filial": payload.get("descricao_identificador_matriz_filial"),
        "data_abertura": payload.get("data_inicio_atividade"),
        "cnae_principal": {
            "codigo": cnae_code or None,
            "descricao": payload.get("cnae_fiscal_descricao"),
        },
        **hierarchy,
        "porte": payload.get("porte") or payload.get("descricao_porte"),
        "natureza_juridica": payload.get("natureza_juridica"),
        "regime_tributario": _latest_tax_regime(payload),
        "simples_nacional": payload.get("opcao_pelo_simples"),
        "mei": payload.get("opcao_pelo_mei"),
        "capital_social": float(payload.get("capital_social") or 0),
        "municipio": payload.get("municipio"),
        "uf": payload.get("uf"),
        "cep": payload.get("cep"),
        "endereco": address,
        "email": payload.get("email"),
        "telefone": phone,
        "cnaes_secundarios": [
            {"codigo": str(item.get("codigo") or ""), "descricao": item.get("descricao")}
            for item in secondary
            if isinstance(item, dict)
        ],
        "socios": [
            {"nome": item.get("nome_socio"), "qualificacao": item.get("qualificacao_socio")}
            for item in partners[:12]
            if isinstance(item, dict)
        ],
    }


def _normalize_cnpjws(payload: dict, cnpj: str) -> dict:
    estab = payload.get("estabelecimento") or {}
    activity = estab.get("atividade_principal") or {}
    section = activity.get("secao")
    division = activity.get("divisao")
    group = activity.get("grupo")
    if isinstance(section, dict):
        section = section.get("descricao")
    if isinstance(division, dict):
        division = division.get("descricao")
    if isinstance(group, dict):
        group = group.get("descricao")
    simples = payload.get("simples") or {}
    if str(simples.get("mei") or "").upper() in {"SIM", "S", "TRUE", "1"}:
        tax = "MEI"
    elif str(simples.get("simples") or "").upper() in {"SIM", "S", "TRUE", "1"}:
        tax = "Simples Nacional"
    else:
        tax = None
    state = estab.get("estado") or {}
    city = estab.get("cidade") or {}
    porte = payload.get("porte") or {}
    nature = payload.get("natureza_juridica") or {}
    address_parts = [estab.get("tipo_logradouro"), estab.get("logradouro"), estab.get("numero"), estab.get("complemento"), estab.get("bairro")]
    return {
        "fonte": "CNPJ.ws pública",
        "cnpj": _format_document(cnpj),
        "cnpj_limpo": cnpj,
        "razao_social": payload.get("razao_social"),
        "nome_fantasia": estab.get("nome_fantasia"),
        "situacao_cadastral": estab.get("situacao_cadastral"),
        "matriz_filial": estab.get("tipo"),
        "data_abertura": estab.get("data_inicio_atividade"),
        "cnae_principal": {"codigo": activity.get("id"), "descricao": activity.get("descricao")},
        "setor": section,
        "segmento": division,
        "grupo_cnae": group,
        "classe_cnae": activity.get("descricao"),
        "porte": porte.get("descricao") if isinstance(porte, dict) else porte,
        "natureza_juridica": nature.get("descricao") if isinstance(nature, dict) else nature,
        "regime_tributario": tax,
        "simples_nacional": simples.get("simples"),
        "mei": simples.get("mei"),
        "capital_social": float(payload.get("capital_social") or 0),
        "municipio": city.get("nome") if isinstance(city, dict) else None,
        "uf": state.get("sigla") if isinstance(state, dict) else None,
        "cep": estab.get("cep"),
        "endereco": " ".join(str(item).strip() for item in address_parts if str(item or "").strip()) or None,
        "email": estab.get("email"),
        "telefone": "".join(filter(None, [str(estab.get("ddd1") or ""), str(estab.get("telefone1") or "")])) or None,
        "cnaes_secundarios": [
            {"codigo": str(item.get("id") or ""), "descricao": item.get("descricao")}
            for item in (estab.get("atividades_secundarias") or [])
            if isinstance(item, dict)
        ],
        "socios": [
            {"nome": item.get("nome"), "qualificacao": (item.get("qualificacao_socio") or {}).get("descricao") if isinstance(item.get("qualificacao_socio"), dict) else None}
            for item in (payload.get("socios") or [])[:12]
            if isinstance(item, dict)
        ],
    }


def get_cnpj_profile(cnpj: str, force_refresh: bool = False) -> dict:
    cleaned = _clean_document(cnpj)
    if len(cleaned) != 14 or not cleaned.isalnum():
        raise ValueError("CNPJ inválido. Informe 14 caracteres.")

    # A aplicação web não consulta mais APIs externas. Enquanto o processo de
    # sincronização roda em paralelo, o site exibe apenas CNPJs que já foram
    # enriquecidos e persistidos no Supabase.
    stored = get_business_profile_from_db(cleaned)
    if isinstance(stored, dict):
        return stored

    raise RuntimeError(
        "Este CNPJ ainda não foi enriquecido no banco Gestão Comercial. "
        "Aguarde o processo de sincronização e use o botão 'Atualizar dados do banco'."
    )


def _validate_cnpj_source(value: str) -> None:
    if value not in VALID_CNPJ_SOURCES:
        raise ValueError("Fonte de CNPJ inválida. Use cadastro ou nota.")


def _pick_analysis_cnpj(row: dict, source: str) -> str | None:
    if source == "nota":
        return row.get("cnpj_nota") or row.get("cnpj_cadastro")
    return row.get("cnpj_cadastro") or row.get("cnpj_nota")


def _category_counts(rows: list[dict], cache: dict[str, dict], source: str, field: str, include_unknown: bool = True) -> tuple[Counter, int]:
    counts: Counter = Counter()
    enriched = 0
    for row in rows:
        cnpj = _pick_analysis_cnpj(row, source)
        if not cnpj:
            continue
        profile = cache.get(cnpj)
        if not isinstance(profile, dict):
            continue
        enriched += 1
        value = str(profile.get(field) or "").strip()
        if not value:
            value = "Não identificado"
        if not include_unknown and value == "Não identificado":
            continue
        counts[value] += 1
    return counts, enriched


def _category_breakdown(
    rows: list[dict],
    cache: dict[str, dict],
    source: str,
    field: str,
    category_label: str,
) -> dict:
    plan_counts: Counter = Counter()
    duration_counts: Counter = Counter()

    for row in rows:
        cnpj = _pick_analysis_cnpj(row, source)
        if not cnpj:
            continue
        profile = cache.get(cnpj)
        if not isinstance(profile, dict):
            continue

        category_value = str(profile.get(field) or "").strip() or "Não identificado"
        if category_value != category_label:
            continue

        plan = str(row.get("nome_plano") or "Não informado").strip() or "Não informado"
        duration = str(row.get("duracao_label") or _duration_label(row.get("duracao"))).strip() or "Não informado"
        plan_counts[plan] += 1
        duration_counts[duration] += 1

    return {
        "planos": [
            {"label": label, "quantidade": int(value)}
            for label, value in plan_counts.most_common()
        ],
        "duracoes": [
            {"label": label, "quantidade": int(value)}
            for label, value in duration_counts.most_common()
        ],
    }


def _comparison_categories(active_rows: list[dict], churn_rows: list[dict], cache: dict[str, dict], source: str, field: str) -> list[dict]:
    active_counts, _ = _category_counts(active_rows, cache, source, field, True)
    churn_counts, _ = _category_counts(churn_rows, cache, source, field, True)
    labels = set(active_counts) | set(churn_counts)
    result = [
        {
            "label": label,
            "ativos": int(active_counts.get(label, 0)),
            "churn": int(churn_counts.get(label, 0)),
            "ativos_detalhes": _category_breakdown(active_rows, cache, source, field, label),
            "churn_detalhes": _category_breakdown(churn_rows, cache, source, field, label),
        }
        for label in labels
    ]
    result.sort(key=lambda item: (item["ativos"] + item["churn"], item["ativos"]), reverse=True)
    return result


def _top_categories(rows: list[dict], cache: dict[str, dict], source: str, field: str, limit: int = 10) -> list[dict]:
    counts, _ = _category_counts(rows, cache, source, field, False)
    return [
        {
            "label": label,
            "quantidade": int(value),
            "detalhes": _category_breakdown(rows, cache, source, field, label),
        }
        for label, value in counts.most_common(limit)
    ]


def _business_coverage(rows: list[dict], cache: dict[str, dict], source: str) -> dict:
    cnpjs = [_pick_analysis_cnpj(row, source) for row in rows]
    cnpjs = [cnpj for cnpj in cnpjs if cnpj]
    total = len(cnpjs)
    enriched = sum(1 for cnpj in cnpjs if cnpj in cache)
    unique = set(cnpjs)
    unique_enriched = sum(1 for cnpj in unique if cnpj in cache)
    return {
        "clientes_com_cnpj": total,
        "clientes_enriquecidos": enriched,
        "percentual": round((enriched / total * 100), 1) if total else 0.0,
        "cnpjs_unicos": len(unique),
        "cnpjs_unicos_enriquecidos": unique_enriched,
    }


def _profile_rows_for_analysis(year: int, month: int, empresa: str, origem: str, pagador: str) -> tuple[list[dict], list[dict]]:
    active_rows = _get_active_clients(empresa, origem, pagador)
    churn = get_churn_dashboard(year, month, empresa, origem, pagador)
    churn_rows = [_serialize_churn_client(row) for row in churn.get("clientes", [])]
    return active_rows, churn_rows


def _collect_analysis_cnpjs(rows: list[dict], source: str) -> set[str]:
    return {cnpj for row in rows if (cnpj := _pick_analysis_cnpj(row, source))}


def _persist_document_links(rows: list[dict]) -> None:
    try:
        upsert_client_documents(rows)
    except Exception:
        # O dashboard não deve parar apenas porque a persistência analítica falhou.
        # O /health continua permitindo diagnosticar a conexão com o Supabase.
        pass


def get_perfil_empresarial(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    cnpj_source: str = "cadastro",
) -> dict:
    _validate(year, month, empresa, origem, pagador)
    _validate_cnpj_source(cnpj_source)
    active_rows, churn_rows = _profile_rows_for_analysis(year, month, empresa, origem, pagador)

    relevant_cnpjs = _collect_analysis_cnpjs([*active_rows, *churn_rows], cnpj_source)
    stored_profiles = get_business_profiles(relevant_cnpjs)
    cache = {
        cnpj: profile
        for cnpj, profile in stored_profiles.items()
        if not profile.get("erro_ultima_consulta")
    }

    return {
        "fonte_cnpj": cnpj_source,
        "sincronizacao_global": get_sync_status(),
        "cobertura": {
            "ativos": _business_coverage(active_rows, cache, cnpj_source),
            "churn": _business_coverage(churn_rows, cache, cnpj_source),
            "banco_cnpjs": count_business_profiles(),
        },
        "regime_tributario": _comparison_categories(active_rows, churn_rows, cache, cnpj_source, "regime_tributario"),
        "porte": _comparison_categories(active_rows, churn_rows, cache, cnpj_source, "porte"),
        "top_setores_ativos": _top_categories(active_rows, cache, cnpj_source, "setor", 10),
        "top_setores_churn": _top_categories(churn_rows, cache, cnpj_source, "setor", 10),
        "top_segmentos_ativos": _top_categories(active_rows, cache, cnpj_source, "segmento", 10),
        "top_segmentos_churn": _top_categories(churn_rows, cache, cnpj_source, "segmento", 10),
    }


def enrich_perfil_empresarial(
    year: int,
    month: int,
    empresa: str = "todos",
    origem: str = "todos",
    pagador: str = "todos",
    cnpj_source: str = "cadastro",
    limit: int = 50,
) -> dict:
    # Mantido por compatibilidade com versões antigas do frontend.
    # A partir da versão 3.10.0 este endpoint NÃO consulta APIs externas.
    # Ele apenas relê do Supabase os CNPJs que o sincronizador já gravou.
    analysis = get_perfil_empresarial(
        year,
        month,
        empresa,
        origem,
        pagador,
        cnpj_source,
    )
    analysis["atualizacao"] = {
        "tentados": 0,
        "sucesso": 0,
        "falhas": 0,
        "pendentes_antes": analysis.get("sincronizacao_global", {}).get("cnpjs_pendentes", 0),
        "pendentes_depois_estimado": analysis.get("sincronizacao_global", {}).get("cnpjs_pendentes", 0),
        "erros": [],
    }
    return analysis

