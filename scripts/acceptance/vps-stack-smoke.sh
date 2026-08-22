#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/vps.fixture.env"
OVERRIDE_FILE="$ROOT_DIR/scripts/acceptance/vps-stack-smoke.override.yml"
CHECKS="$ROOT_DIR/scripts/acceptance/vps_stack_smoke.py"
HOST_PORTS="$ROOT_DIR/scripts/acceptance/vps_host_ports.py"
COMPOSE_FILE="$ROOT_DIR/docker-compose.vps.yml"
VOLUME_NAME="jobtrackr_vps_smoke_pgdata"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-vps-stack-smoke}"
export COMPOSE_PROJECT_NAME

: "${JOBTRACKR_FRONTEND_IMAGE:?JOBTRACKR_FRONTEND_IMAGE is required}"
: "${JOBTRACKR_BACKEND_IMAGE:?JOBTRACKR_BACKEND_IMAGE is required}"
: "${JOBTRACKR_CV_GENERATION_IMAGE:?JOBTRACKR_CV_GENERATION_IMAGE is required}"
FRONTEND_IMAGE="$JOBTRACKR_FRONTEND_IMAGE"
BACKEND_IMAGE="$JOBTRACKR_BACKEND_IMAGE"
CV_GENERATION_IMAGE="$JOBTRACKR_CV_GENERATION_IMAGE"

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized VPS smoke fixture: $FIXTURE_ENV"
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$FIXTURE_ENV"
set +a
export JOBTRACKR_APP_ORIGIN
export JOBTRACKR_FRONTEND_IMAGE="$FRONTEND_IMAGE"
export JOBTRACKR_BACKEND_IMAGE="$BACKEND_IMAGE"
export JOBTRACKR_CV_GENERATION_IMAGE="$CV_GENERATION_IMAGE"

compose() {
  docker compose \
    --env-file "$FIXTURE_ENV" \
    -f "$COMPOSE_FILE" \
    -f "$OVERRIDE_FILE" \
    "$@"
}

assert_local_image() {
  local image="$1"
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "prebuilt image is not loaded locally: $image"
    exit 1
  fi
}

assert_running_image() {
  local service="$1"
  local expected="$2"
  local container expected_id running_id
  container="$(compose ps -q "$service")"
  if [ -z "$container" ]; then
    echo "$service is not running"
    exit 1
  fi
  expected_id="$(docker image inspect --format '{{.Id}}' "$expected")"
  running_id="$(docker inspect --format '{{.Image}}' "$container")"
  if [ "$expected_id" != "$running_id" ]; then
    echo "$service is running $running_id, expected prebuilt $expected ($expected_id)"
    exit 1
  fi
}

assert_host_publications() {
  compose ps --format json | python3 "$HOST_PORTS"
}

cleanup() {
  compose down --remove-orphans >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

python3 "$HOST_PORTS" --self-test

echo "VPS Compose smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo "  origin: $JOBTRACKR_APP_ORIGIN"
echo "  frontend: $JOBTRACKR_FRONTEND_IMAGE"
echo "  backend: $JOBTRACKR_BACKEND_IMAGE"
echo "  cv-generation: $JOBTRACKR_CV_GENERATION_IMAGE"
echo

assert_local_image "$JOBTRACKR_FRONTEND_IMAGE"
assert_local_image "$JOBTRACKR_BACKEND_IMAGE"
assert_local_image "$JOBTRACKR_CV_GENERATION_IMAGE"

docker volume create "$VOLUME_NAME" >/dev/null

compose up --no-build -d --wait --wait-timeout 420 \
  postgres cv-generation gotenberg backend frontend

assert_running_image frontend "$JOBTRACKR_FRONTEND_IMAGE"
assert_running_image backend "$JOBTRACKR_BACKEND_IMAGE"
assert_running_image cv-generation "$JOBTRACKR_CV_GENERATION_IMAGE"

frontend_bind="$(compose port frontend 80)"
if [[ "$frontend_bind" != 127.0.0.1:* ]]; then
  echo "frontend host mapping was $frontend_bind, expected 127.0.0.1"
  exit 1
fi
assert_host_publications

python3 "$CHECKS"

compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE persistence_marker (
    id integer PRIMARY KEY,
    note text NOT NULL
);
INSERT INTO persistence_marker (id, note) VALUES (1, 'survives vps recreate and compose down');
SQL

compose up --no-build -d --force-recreate --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend

recreated="$(
  compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -Atc \
    "select note from persistence_marker where id = 1;"
)"
if [ "$recreated" != "survives vps recreate and compose down" ]; then
  echo "external volume did not survive container recreation: $recreated"
  exit 1
fi

compose down --remove-orphans
if ! docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
  echo "external volume was removed by Compose teardown"
  exit 1
fi

compose up --no-build -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend

restored="$(
  compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -Atc \
    "select note from persistence_marker where id = 1;"
)"
if [ "$restored" != "survives vps recreate and compose down" ]; then
  echo "external volume did not survive Compose teardown: $restored"
  exit 1
fi

assert_host_publications
python3 "$CHECKS"

echo "vps compose smoke passed"
