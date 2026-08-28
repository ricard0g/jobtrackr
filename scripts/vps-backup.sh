#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/vps-pre-deploy.dump}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.vps.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/.env.vps}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE"
  exit 1
fi
if [ ! -f "$COMPOSE_ENV_FILE" ]; then
  echo "Missing $COMPOSE_ENV_FILE. Copy .env.vps.example, replace placeholders, and restrict permissions."
  exit 1
fi

export COMPOSE_FILE
export COMPOSE_ENV_FILE
exec "$ROOT_DIR/scripts/db-dump-local-pg.sh" "$DUMP_FILE"
