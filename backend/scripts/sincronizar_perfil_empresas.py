from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from sqlalchemy import bindparam, text

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.database import source_engine, test_supabase_connection
from app.repositories.perfil_supabase_repository import (
    get_enriched_cnpjs,
    get_all_mapped_cnpjs,
    get_sync_status,
    upsert_client_documents,
)
from app.services.perfil_service import (
    PROFILE_EXCLUDED_COMPANY_IDS,
    _document_payload,
    get_cnpj_profile,
)


ALL_CLIENT_DOCUMENTS_SQL = text(
    """
    WITH planos AS (
        SELECT
            e.id AS empresa_id,
            ep.cpf_cnpj,
            ep.data_vencimento,
            ep.id AS plano_registro_id,
            ROW_NUMBER() OVER (
                PARTITION BY e.id
                ORDER BY ep.data_vencimento DESC, ep.id DESC
            ) AS ordem
        FROM empresas_planos ep
        JOIN empresas e ON e.id = ep.empresa_id
        WHERE
            ep.plano_id <> 1
            AND ep.pago_em IS NOT NULL
            AND e.id NOT IN :excluidos
    )
    SELECT
        p.empresa_id,
        p.cpf_cnpj,
        (
            SELECT nfs.dest_cnpj
            FROM notas_fiscais_servicos nfs
            JOIN empresas_planos ep_nfs ON ep_nfs.id = nfs.plano_id
            WHERE
                ep_nfs.empresa_id = p.empresa_id
                AND nfs.situacao < 4
                AND nfs.dest_cnpj IS NOT NULL
                AND TRIM(nfs.dest_cnpj) <> ''
            ORDER BY nfs.data_emissao DESC, nfs.id DESC
            LIMIT 1
        ) AS dest_cnpj
    FROM planos p
    WHERE p.ordem = 1
    ORDER BY p.empresa_id
    """
).bindparams(bindparam("excluidos", expanding=True))


def carregar_documentos_mysql() -> list[dict]:
    print("Lendo todos os clientes com histórico de plano no MySQL...")
    with source_engine.connect() as connection:
        rows = connection.execute(
            ALL_CLIENT_DOCUMENTS_SQL,
            {"excluidos": PROFILE_EXCLUDED_COMPANY_IDS},
        ).mappings().all()

    payloads: list[dict] = []
    for row in rows:
        docs = _document_payload(row.get("cpf_cnpj"), row.get("dest_cnpj"))
        payloads.append(
            {
                "empresa_id": int(row["empresa_id"]),
                **docs,
            }
        )
    return payloads


def imprimir_status() -> None:
    status = get_sync_status()
    print("")
    print("================ STATUS DO ENRIQUECIMENTO ================")
    print(f"Empresas mapeadas........: {status['empresas_mapeadas']:,}".replace(",", "."))
    print(f"Empresas com CNPJ........: {status['empresas_com_cnpj']:,}".replace(",", "."))
    print(f"CNPJs únicos.............: {status['cnpjs_unicos']:,}".replace(",", "."))
    print(f"CNPJs enriquecidos.......: {status['cnpjs_enriquecidos']:,}".replace(",", "."))
    print(f"CNPJs com erro............: {status['cnpjs_com_erro']:,}".replace(",", "."))
    print(f"CNPJs pendentes...........: {status['cnpjs_pendentes']:,}".replace(",", "."))
    print(f"Cobertura.................: {status['percentual']:.2f}%".replace(".", ","))
    print("===========================================================")
    print("")


def sincronizar_documentos() -> int:
    rows = carregar_documentos_mysql()
    total = len(rows)
    print(f"Empresas encontradas no MySQL: {total:,}".replace(",", "."))
    if not rows:
        return 0

    chunk_size = 1000
    persisted = 0
    for start in range(0, total, chunk_size):
        chunk = rows[start:start + chunk_size]
        persisted += upsert_client_documents(chunk)
        print(f"Documentos gravados no Supabase: {min(start + len(chunk), total):,}/{total:,}".replace(",", "."))
    return persisted


def enriquecer_cnpjs(limit: int | None, delay: float) -> None:
    all_cnpjs = get_all_mapped_cnpjs()
    enriched = get_enriched_cnpjs()
    pending = [cnpj for cnpj in all_cnpjs if cnpj not in enriched]

    if limit is not None:
        pending = pending[:limit]

    total = len(pending)
    if total == 0:
        print("Nenhum CNPJ pendente para enriquecimento.")
        return

    print(f"CNPJs que serão consultados nesta execução: {total:,}".replace(",", "."))
    print("Os resultados são salvos no Supabase a cada CNPJ; se interromper, a próxima execução continua do ponto restante.")
    print("")

    success = 0
    failed = 0
    started = time.time()

    for index, cnpj in enumerate(pending, start=1):
        try:
            profile = get_cnpj_profile(cnpj, force_refresh=True)
            success += 1
            company = profile.get("nome_fantasia") or profile.get("razao_social") or "sem nome"
            print(f"[{index}/{total}] OK   {cnpj}  {company}")
        except KeyboardInterrupt:
            print("\nExecução interrompida pelo usuário. Os registros já concluídos permanecem salvos no Supabase.")
            break
        except Exception as exc:
            failed += 1
            print(f"[{index}/{total}] ERRO {cnpj}  {type(exc).__name__}: {exc}")

        if delay > 0 and index < total:
            time.sleep(delay)

        if index % 100 == 0:
            elapsed = max(time.time() - started, 1)
            rate = index / elapsed * 60
            print(f"--- Parcial: {success} sucesso(s), {failed} falha(s), {rate:.1f} CNPJs/min ---")

    print("")
    print(f"Finalizado: {success} sucesso(s) e {failed} falha(s).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sincroniza documentos do MySQL e enriquece todos os CNPJs no Supabase Gestão Comercial."
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--todos", action="store_true", help="Enriquece todos os CNPJs pendentes.")
    group.add_argument("--limite", type=int, default=None, help="Enriquece somente os primeiros N CNPJs pendentes.")
    parser.add_argument("--somente-documentos", action="store_true", help="Só alimenta perfil_cliente_documentos; não chama APIs externas.")
    parser.add_argument("--status", action="store_true", help="Mostra apenas o status atual do Supabase.")
    parser.add_argument("--delay", type=float, default=0.5, help="Pausa em segundos entre consultas externas. Padrão: 0.5.")
    args = parser.parse_args()

    print("Testando conexão com Supabase...")
    test_supabase_connection()
    print("Supabase conectado.")

    if args.status:
        imprimir_status()
        return

    sincronizar_documentos()
    imprimir_status()

    if args.somente_documentos:
        return

    if args.todos:
        limit = None
    elif args.limite is not None:
        limit = max(1, args.limite)
    else:
        limit = 50
        print("Nenhum limite informado. Por segurança, esta execução testará os primeiros 50 CNPJs pendentes.")
        print("Para processar toda a base, execute novamente com --todos.")

    enriquecer_cnpjs(limit=limit, delay=max(0.0, args.delay))
    imprimir_status()


if __name__ == "__main__":
    main()
