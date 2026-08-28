#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/frontend-container.fixture.env"
OVERRIDE_FILE="$ROOT_DIR/scripts/acceptance/frontend-container-smoke.override.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-frontend-smoke}"
export COMPOSE_PROJECT_NAME

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized smoke fixture: $FIXTURE_ENV"
  exit 1
fi

compose() {
  docker compose --profile full \
    --env-file "$FIXTURE_ENV" \
    -f "$ROOT_DIR/docker-compose.yml" \
    -f "$OVERRIDE_FILE" \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Frontend container smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo "  services: postgres, cv-generation, gotenberg, backend, frontend"
echo

compose up --build -d --wait --wait-timeout 420 \
  postgres cv-generation gotenberg backend frontend

CHECKS="$ROOT_DIR/scripts/acceptance/frontend-container-smoke.py"
if [ ! -f "$CHECKS" ]; then
  echo "Missing smoke checks: $CHECKS"
  exit 1
fi

compose exec -T cv-generation python - < "$CHECKS"
