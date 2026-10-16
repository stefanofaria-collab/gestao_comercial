#!/usr/bin/env bash
set -euo pipefail

# Disparo diário dos alertas de planos vencidos no Linux.
# O Python carrega as credenciais automaticamente de backend/.env
#
# Uso:
#   ./scripts/enviar_alertas_planos_vencidos.sh
#   ./scripts/enviar_alertas_planos_vencidos.sh --data 2026-10-16

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${BACKEND_DIR}/logs"
LOG_FILE="${LOG_DIR}/alertas_planos_vencidos.log"
ENV_FILE="${BACKEND_DIR}/.env"
VENV_DIR="${BACKEND_DIR}/.venv"

mkdir -p "${LOG_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: arquivo .env não encontrado em ${ENV_FILE}" | tee -a "${LOG_FILE}"
  exit 1
fi

if [[ -f "${VENV_DIR}/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
fi

cd "${BACKEND_DIR}"

PYTHON_BIN="$(command -v python3 || command -v python)"

{
  echo "============================================================"
  echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] Iniciando envio de alertas de planos vencidos"
  echo "Backend: ${BACKEND_DIR}"
  echo "Python: ${PYTHON_BIN}"
  echo "Args: $*"
  "${PYTHON_BIN}" scripts/enviar_alertas_planos_vencidos.py "$@"
  echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] Envio finalizado com sucesso"
} >> "${LOG_FILE}" 2>&1
