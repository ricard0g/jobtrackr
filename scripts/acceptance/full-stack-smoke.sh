#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/full-stack.fixture.env"
OVERRIDE_FILE="$ROOT_DIR/scripts/acceptance/full-stack-smoke.override.yml"
CHECKS="$ROOT_DIR/scripts/acceptance/full-stack-smoke.py"
CREDS_FILE="${TMPDIR:-/tmp}/jobtrackr-full-stack-smoke.creds"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-full-stack-smoke}"
export COMPOSE_PROJECT_NAME

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized smoke fixture: $FIXTURE_ENV"
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$FIXTURE_ENV"
set +a
export JOBTRACKR_APP_ORIGIN

compose() {
  docker compose --profile full \
    --env-file "$FIXTURE_ENV" \
    -f "$ROOT_DIR/docker-compose.yml" \
    -f "$OVERRIDE_FILE" \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$CREDS_FILE"
}
trap cleanup EXIT

echo "Full-stack Compose smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo "  origin: $JOBTRACKR_APP_ORIGIN"
echo "  services: postgres, cv-generation, gotenberg, backend, frontend"
echo

compose up --build -d --wait --wait-timeout 420 \
  postgres cv-generation gotenberg backend frontend

python3 "$CHECKS" | tee "$CREDS_FILE"

auth_email="$(awk -F= '/^JOBTRACKR_AUTH_EMAIL=/{print $2}' "$CREDS_FILE")"
auth_password="$(awk -F= '/^JOBTRACKR_AUTH_PASSWORD=/{print $2}' "$CREDS_FILE")"
if [ -z "$auth_email" ] || [ -z "$auth_password" ]; then
  echo "registration did not print credentials"
  exit 1
fi

compose down --remove-orphans
compose up -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend

JOBTRACKR_AUTH_EMAIL="$auth_email" JOBTRACKR_AUTH_PASSWORD="$auth_password" \
  python3 "$CHECKS"

echo "full-stack compose smoke passed"
