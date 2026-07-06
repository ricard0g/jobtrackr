#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
docker compose down -v
docker compose up -d postgres

echo "Postgres reset. Start the API next so Flyway can recreate the schema:"
echo "./scripts/dev-api.sh"
