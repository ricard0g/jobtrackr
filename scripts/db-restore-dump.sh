#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/local-snapshot.dump}"
CONTAINER_NAME="${JOBTRACKR_POSTGRES_CONTAINER:-jobtrackr-postgres}"
CONTAINER_FILE="/tmp/jobtrackr-restore.dump"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Missing .env. Run ./scripts/dev-up.sh first."
  exit 1
fi

set -a
. "$ROOT_DIR/.env"
set +a

cd "$ROOT_DIR"
docker compose up -d postgres
docker cp "$DUMP_FILE" "$CONTAINER_NAME:$CONTAINER_FILE"
docker exec "$CONTAINER_NAME" pg_restore \
  -U "${POSTGRES_USER:-jobtrackr_app}" \
  -d "${POSTGRES_DB:-jobtrackr}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$CONTAINER_FILE"
docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_FILE"

echo "Restored $DUMP_FILE into $CONTAINER_NAME/${POSTGRES_DB:-jobtrackr}"
