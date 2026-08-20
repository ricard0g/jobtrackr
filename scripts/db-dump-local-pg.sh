#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/local-snapshot.dump}"
CONTAINER_FILE="/tmp/jobtrackr-local-snapshot.dump"

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

mkdir -p "$(dirname "$DUMP_FILE")"

cd "$ROOT_DIR"
compose up -d postgres
wait_for_postgres

compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --blobs --no-owner --no-privileges --exclude-table-data=refresh_tokens --file=/tmp/jobtrackr-local-snapshot.dump'

compose cp "postgres:$CONTAINER_FILE" "$DUMP_FILE"
compose exec -T postgres rm -f "$CONTAINER_FILE"

echo "Wrote $DUMP_FILE"
echo "This is a full local snapshot and is intentionally ignored by Git."
echo "Review and sanitize before committing any derived seed data."
