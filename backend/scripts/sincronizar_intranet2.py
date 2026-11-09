"""Executa somente a sincronizacao de clientes da Intranet 2.0.

Uso (dentro de backend): python scripts/sincronizar_intranet2.py
Executar somente na maquina Windows com acesso ao MySQL.
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.intranet2_snapshot_service import sync_intranet2_snapshot  # noqa: E402


if __name__ == "__main__":
    count = sync_intranet2_snapshot()
    print(f"SUCESSO: {count} clientes atualizados no Supabase.", flush=True)
