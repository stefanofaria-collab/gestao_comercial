from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.upgrade_downgrade_service import bootstrap_upgrade_downgrade_cache


if __name__ == "__main__":
    result = bootstrap_upgrade_downgrade_cache()
    print("[OK] Cache de Upgrade e Downgrade preparado.")
    print(f"Historico processado: {result['historico_processado']} movimentos")
    print(f"Mes atual processado: {result['mes_atual_processado']} movimentos")
