#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/scripts/acceptance"

load_env() {
  local file="$1"
  if [ -f "$file" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
    return 0
  fi
  return 1
}

loaded=0
if load_env "$ROOT_DIR/.env"; then
  loaded=1
fi
if [ -n "${COMPOSE_ENV_FILE:-}" ] && load_env "$COMPOSE_ENV_FILE"; then
  loaded=1
elif load_env "$ROOT_DIR/.env.compose"; then
  loaded=1
fi
if [ "$loaded" -eq 0 ]; then
  echo "Missing .env or .env.compose. Copy .env.example for host-run or .env.compose.example for full Compose, and configure R2."
  exit 1
fi

cd "$ROOT_DIR"

APP_ORIGIN="${JOBTRACKR_APP_ORIGIN:-${VITE_API_ORIGIN:-http://localhost:8080}}"
export JOBTRACKR_APP_ORIGIN="$APP_ORIGIN"

echo "Documents real-stack acceptance"
echo "  App origin: $APP_ORIGIN"
echo "  Gotenberg:  ${GOTENBERG_BASE_URL:-http://localhost:3000}"
echo "  R2 bucket:  ${R2_BUCKET:-unset}"
echo

PYTHONPATH="$SCRIPT_DIR" python3 "$SCRIPT_DIR/documents_real_stack.py"
