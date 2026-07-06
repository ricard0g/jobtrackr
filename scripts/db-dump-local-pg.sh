#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/local-snapshot.dump}"
CONTAINER_FILE="/tmp/jobtrackr-local-snapshot.dump"

mkdir -p "$(dirname "$DUMP_FILE")"

docker exec local-pg pg_dump \
  -U jobtrackr_app \
  -d jobtrackr \
  --format=custom \
  --blobs \
  --no-owner \
  --no-privileges \
  --exclude-table-data=refresh_tokens \
  --file="$CONTAINER_FILE"

docker cp "local-pg:$CONTAINER_FILE" "$DUMP_FILE"
docker exec local-pg rm -f "$CONTAINER_FILE"

echo "Wrote $DUMP_FILE"
echo "This is a full local snapshot and is intentionally ignored by Git."
echo "Review and sanitize before committing any derived seed data."
