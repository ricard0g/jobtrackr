#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/scripts/acceptance"

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Missing .env. Copy .env.example and configure R2 before running acceptance."
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$ROOT_DIR/.env"
set +a

cd "$ROOT_DIR"

echo "Documents real-stack acceptance"
echo "  API:       ${VITE_API_ORIGIN:-http://localhost:8080}"
echo "  Gotenberg: ${GOTENBERG_BASE_URL:-http://localhost:3000}"
echo "  R2 bucket: ${R2_BUCKET:-unset}"
echo

PYTHONPATH="$SCRIPT_DIR" python3 "$SCRIPT_DIR/documents_real_stack.py"
