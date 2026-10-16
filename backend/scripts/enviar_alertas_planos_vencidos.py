from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


BACKEND_DIR = Path(__file__).resolve().parent.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from app.config import settings  # noqa: E402
from app.services.alertas_planos_vencidos_service import run_daily_alerts  # noqa: E402


def _timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.app_timezone or "America/Sao_Paulo")
    except Exception:
        return ZoneInfo("America/Sao_Paulo")


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Envia os alertas diários de planos vencidos cadastrados no ClickDados."
    )
    parser.add_argument(
        "--data",
        default=None,
        help="Data de referência no formato YYYY-MM-DD (padrão: hoje no fuso APP_TIMEZONE).",
    )
    args = parser.parse_args()

    reference = _parse_date(args.data) or datetime.now(_timezone()).date()
    result = run_daily_alerts(reference=reference)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    has_error = any(
        item.get("status") in {"erro_consulta", "parcial"} for item in result.get("resultados", [])
    )
    return 1 if has_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
