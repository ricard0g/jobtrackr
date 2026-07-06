#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
docker compose down -v
docker compose up -d postgres

echo "Postgres reset."
echo "For a fresh migrated database, start the API next so Flyway can recreate the schema:"
echo "./scripts/dev-api.sh"
echo
echo "For an exact local snapshot, restore it before starting the API:"
echo "./scripts/db-restore-dump.sh db/dumps/local-snapshot.dump"
