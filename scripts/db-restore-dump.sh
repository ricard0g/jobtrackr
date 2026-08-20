#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/local-snapshot.dump}"
CONTAINER_FILE="/tmp/jobtrackr-restore.dump"

compose() {
  if [ -n "${COMPOSE_ENV_FILE:-}" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" "$@"
  else
    docker compose "$@"
  fi
}

wait_for_postgres() {
  local _
  for _ in $(seq 1 30); do
    if compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres did not become ready. Start it with ./scripts/dev-up.sh or docker compose up -d postgres."
  return 1
}

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

cd "$ROOT_DIR"
compose up -d postgres
wait_for_postgres

compose cp "$DUMP_FILE" "postgres:$CONTAINER_FILE"
compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges /tmp/jobtrackr-restore.dump'
compose exec -T postgres rm -f "$CONTAINER_FILE"

echo "Restored $DUMP_FILE into the postgres Compose service"
