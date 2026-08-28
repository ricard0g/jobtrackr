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
if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

export COMPOSE_FILE
export COMPOSE_ENV_FILE

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" up -d postgres
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" stop frontend backend cv-generation gotenberg

exec "$ROOT_DIR/scripts/db-restore-dump.sh" "$DUMP_FILE"
