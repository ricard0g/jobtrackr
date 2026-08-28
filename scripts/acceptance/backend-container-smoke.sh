#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/backend-container.fixture.env"
OVERRIDE_FILE="$ROOT_DIR/scripts/acceptance/backend-container-smoke.override.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-backend-smoke}"
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

echo "Backend container smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo "  services: postgres, cv-generation, gotenberg, backend"
echo

compose up --build -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend

compose exec -T cv-generation python -c '
import json
import sys
import urllib.request

def get(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return response.status, response.read().decode()

status, body = get("http://backend:8080/actuator/health/readiness")
if status != 200:
    sys.exit("readiness returned HTTP %s: %s" % (status, body))
payload = json.loads(body)
if payload.get("status") != "UP":
    sys.exit("readiness was not UP: %s" % body)

status, body = get("http://backend:8080/api/v1/auth/csrf")
if status != 200:
    sys.exit("csrf returned HTTP %s: %s" % (status, body))
payload = json.loads(body)
if not payload.get("token") or not payload.get("headerName"):
    sys.exit("csrf route did not return a token: %s" % body)

print("backend container smoke passed")
'
