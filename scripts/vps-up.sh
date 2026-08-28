#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/.env.vps}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.vps.yml"
VOLUME_NAME="jobtrackr_pgdata"

if [ ! -f "$COMPOSE_ENV_FILE" ]; then
  echo "Missing $COMPOSE_ENV_FILE. Copy .env.vps.example, replace placeholders, and restrict permissions:"
  echo "  cp .env.vps.example .env.vps"
  echo "  chmod 600 .env.vps"
  exit 1
fi

python3 "$ROOT_DIR/scripts/acceptance/vps_env_validate.py" "$COMPOSE_ENV_FILE"

if [ "$(uname -s)" = Linux ]; then
  mode="$(stat -c '%a' "$COMPOSE_ENV_FILE")"
  if [ "$mode" != 600 ] && [ "$mode" != 400 ]; then
    echo "$COMPOSE_ENV_FILE permissions are $mode; chmod 600 and keep ownership on the deploy user."
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1091
. "$COMPOSE_ENV_FILE"
set +a

docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1 || docker volume create "$VOLUME_NAME" >/dev/null

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" pull
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" up --no-build -d --wait

echo
echo "VPS stack is up."
echo "  Loopback origin: http://127.0.0.1:${JOBTRACKR_PORT:-18080}"
echo "  Internal services are unpublished. Inspect health with docker compose ps, not by curling secrets."
echo "  This is not the host-run or local full Compose path."
