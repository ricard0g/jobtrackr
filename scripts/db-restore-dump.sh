#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-$ROOT_DIR/db/dumps/local-data.sql}"

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
docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-jobtrackr_app}" \
  -d "${POSTGRES_DB:-jobtrackr}" \
  -v ON_ERROR_STOP=1 < "$DUMP_FILE"
