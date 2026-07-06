#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_FILE="${1:-$ROOT_DIR/db/seed/dev.sql}"

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Missing .env. Run ./scripts/dev-up.sh first."
  exit 1
fi

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file not found: $SEED_FILE"
  exit 1
fi

set -a
. "$ROOT_DIR/.env"
set +a

case "${JOBTRACKR_SEED_ENV:-}" in
  dev|local|cloud-agent)
    ;;
  *)
    echo "Refusing to seed: set JOBTRACKR_SEED_ENV=dev, local, or cloud-agent in .env."
    echo "This script is intentionally opt-in and must not be used against production data."
    exit 1
    ;;
esac

cd "$ROOT_DIR"
docker compose up -d postgres

for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready \
    -U "${POSTGRES_USER:-jobtrackr_app}" \
    -d "${POSTGRES_DB:-jobtrackr}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

schema_ready="$(
  docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-jobtrackr_app}" \
    -d "${POSTGRES_DB:-jobtrackr}" \
    -Atc "select case when to_regclass('public.users') is not null and to_regclass('public.applications') is not null then 'ready' else 'missing' end"
)"

if [ "$schema_ready" != "ready" ]; then
  echo "Database schema is missing. Start the API once so Flyway runs, then rerun this script."
  echo "./scripts/dev-api.sh"
  exit 1
fi

docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-jobtrackr_app}" \
  -d "${POSTGRES_DB:-jobtrackr}" \
  -v ON_ERROR_STOP=1 \
  -1 < "$SEED_FILE"

echo "Seeded development data from $SEED_FILE"
echo "Login with agent@example.test / dev-password"
