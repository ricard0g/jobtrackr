#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/local-data.sql}"
CONTAINER_FILE="/tmp/jobtrackr-local-data.sql"

mkdir -p "$(dirname "$DUMP_FILE")"

docker exec local-pg pg_dump \
  -U jobtrackr_app \
  -d jobtrackr \
  --data-only \
  --column-inserts \
  --exclude-table=flyway_schema_history \
  --exclude-table=refresh_tokens \
  --file="$CONTAINER_FILE"

docker cp "local-pg:$CONTAINER_FILE" "$DUMP_FILE"
docker exec local-pg rm -f "$CONTAINER_FILE"

echo "Wrote $DUMP_FILE"
echo "Review this file before committing any derived seed data."
