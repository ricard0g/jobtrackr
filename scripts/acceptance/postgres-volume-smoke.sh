#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/full-stack.fixture.env"
DUMP_FILE="$ROOT_DIR/scripts/acceptance/fixtures/postgres-volume.dump"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-postgres-volume-smoke}"
export COMPOSE_PROJECT_NAME
export COMPOSE_ENV_FILE="$FIXTURE_ENV"

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized Compose fixture: $FIXTURE_ENV"
  exit 1
fi

compose() {
  docker compose --env-file "$FIXTURE_ENV" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$DUMP_FILE"
}
trap cleanup EXIT

echo "PostgreSQL Compose volume smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo

compose up -d --wait --wait-timeout 60 postgres

compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE persistence_marker (
    id integer PRIMARY KEY,
    note text NOT NULL
);
INSERT INTO persistence_marker (id, note) VALUES (1, 'survives dump restore and recreate');
SQL

"$ROOT_DIR/scripts/db-dump-local-pg.sh" "$DUMP_FILE"
if [ ! -s "$DUMP_FILE" ]; then
  echo "dump file was not created: $DUMP_FILE"
  exit 1
fi

compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -v ON_ERROR_STOP=1 \
  -c "DROP TABLE persistence_marker;"

"$ROOT_DIR/scripts/db-restore-dump.sh" "$DUMP_FILE"

restored="$(
  compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -Atc \
    "select note from persistence_marker where id = 1;"
)"
if [ "$restored" != "survives dump restore and recreate" ]; then
  echo "restore did not return the dumped row: $restored"
  exit 1
fi

compose up -d --force-recreate --wait --wait-timeout 60 postgres

recreated="$(
  compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -Atc \
    "select note from persistence_marker where id = 1;"
)"
if [ "$recreated" != "survives dump restore and recreate" ]; then
  echo "named volume did not survive container recreation: $recreated"
  exit 1
fi

echo "postgres dump, restore, and named volume persistence passed"
