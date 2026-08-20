#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/.env.compose}"

if [ ! -f "$COMPOSE_ENV_FILE" ]; then
  cp "$ROOT_DIR/.env.compose.example" "$COMPOSE_ENV_FILE"
  echo "Created $COMPOSE_ENV_FILE from .env.compose.example"
  echo "Replace placeholder secrets, R2, and Gemini values before relying on documents or generation."
fi

set -a
# shellcheck disable=SC1091
. "$COMPOSE_ENV_FILE"
set +a

for key in POSTGRES_PASSWORD JWT_SIGNING_KEY CV_GENERATION_SERVICE_TOKEN; do
  value="${!key:-}"
  if [ -z "$value" ] || [[ "$value" == replace-with-* ]]; then
    echo "Replace placeholder $key in $COMPOSE_ENV_FILE before starting the full stack."
    exit 1
  fi
done
if [ "${JWT_REFRESH_COOKIE_SECURE:-true}" != "true" ] && [ "${JWT_REFRESH_COOKIE_ALLOW_INSECURE:-false}" != "true" ]; then
  echo "Set JWT_REFRESH_COOKIE_SECURE=true, or JWT_REFRESH_COOKIE_ALLOW_INSECURE=true for local HTTP."
  exit 1
fi

cd "$ROOT_DIR"
docker compose --profile full --env-file "$COMPOSE_ENV_FILE" up --build -d --wait

echo
echo "Full Compose stack is up."
echo "  App origin: ${JOBTRACKR_APP_ORIGIN:-http://127.0.0.1:18080}"
echo "  Host-run workflow is unchanged: ./scripts/dev-up.sh, ./scripts/dev-api.sh, ./scripts/dev-web.sh"
echo "  This is not the VPS deployment path."
