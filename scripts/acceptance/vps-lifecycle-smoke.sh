#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/vps.fixture.env"
OVERRIDE_FILE="$ROOT_DIR/scripts/acceptance/vps-lifecycle-smoke.override.yml"
CHECKS="$ROOT_DIR/scripts/acceptance/vps_stack_smoke.py"
HOST_PORTS="$ROOT_DIR/scripts/acceptance/vps_host_ports.py"
VPS_COMPOSE="$ROOT_DIR/docker-compose.vps.yml"
VOLUME_NAME="jobtrackr_vps_lifecycle_pgdata"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-vps-lifecycle-smoke}"
NEXT_TAG="sha-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
LOOPBACK_PORT=18088
export COMPOSE_PROJECT_NAME

: "${JOBTRACKR_FRONTEND_IMAGE:?JOBTRACKR_FRONTEND_IMAGE is required}"
: "${JOBTRACKR_BACKEND_IMAGE:?JOBTRACKR_BACKEND_IMAGE is required}"
: "${JOBTRACKR_CV_GENERATION_IMAGE:?JOBTRACKR_CV_GENERATION_IMAGE is required}"
RELEASE_A_FRONTEND="$JOBTRACKR_FRONTEND_IMAGE"
RELEASE_A_BACKEND="$JOBTRACKR_BACKEND_IMAGE"
RELEASE_A_CV="$JOBTRACKR_CV_GENERATION_IMAGE"
RELEASE_B_FRONTEND="${RELEASE_A_FRONTEND%:*}:${NEXT_TAG}"
RELEASE_B_BACKEND="${RELEASE_A_BACKEND%:*}:${NEXT_TAG}"
RELEASE_B_CV="${RELEASE_A_CV%:*}:${NEXT_TAG}"

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized VPS smoke fixture: $FIXTURE_ENV"
  exit 1
fi

WORKDIR="$(mktemp -d)"
ENV_A="$WORKDIR/release-a.env"
ENV_B="$WORKDIR/release-b.env"
DUMP_FILE="$WORKDIR/pre-deploy.dump"
CURRENT_ENV="$ENV_A"

write_env() {
  local dest="$1"
  local frontend="$2"
  local backend="$3"
  local cv_generation="$4"
  sed \
    -e "s|^JOBTRACKR_FRONTEND_IMAGE=.*|JOBTRACKR_FRONTEND_IMAGE=${frontend}|" \
    -e "s|^JOBTRACKR_BACKEND_IMAGE=.*|JOBTRACKR_BACKEND_IMAGE=${backend}|" \
    -e "s|^JOBTRACKR_CV_GENERATION_IMAGE=.*|JOBTRACKR_CV_GENERATION_IMAGE=${cv_generation}|" \
    -e "s|^JOBTRACKR_RELEASE_TAG=.*|JOBTRACKR_RELEASE_TAG=${frontend##*:}|" \
    -e "s|^JOBTRACKR_PORT=.*|JOBTRACKR_PORT=${LOOPBACK_PORT}|" \
    -e "s|^JOBTRACKR_APP_ORIGIN=.*|JOBTRACKR_APP_ORIGIN=http://127.0.0.1:${LOOPBACK_PORT}|" \
    "$FIXTURE_ENV" > "$dest"
}

compose() {
  docker compose \
    --env-file "$CURRENT_ENV" \
    -f "$VPS_COMPOSE" \
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

assert_running_tag() {
  local service="$1"
  local expected="$2"
  local container running
  container="$(compose ps -q "$service")"
  if [ -z "$container" ]; then
    echo "$service is not running"
    exit 1
  fi
  running="$(docker inspect --format '{{.Config.Image}}' "$container")"
  if [ "$running" != "$expected" ]; then
    echo "$service is running $running, expected $expected"
    exit 1
  fi
}

assert_marker() {
  local expected="$1"
  local actual
  actual="$(
    compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -Atc \
      "select note from persistence_marker where id = 1;"
  )"
  if [ "$actual" != "$expected" ]; then
    echo "persistence marker was ${actual:-<empty>}, expected $expected"
    exit 1
  fi
}

assert_volume() {
  local name
  name="$(docker volume inspect --format '{{.Name}}' "$VOLUME_NAME")"
  if [ "$name" != "$VOLUME_NAME" ]; then
    echo "PostgreSQL volume was renamed to $name"
    exit 1
  fi
}

origin_smoke() {
  export JOBTRACKR_APP_ORIGIN="http://127.0.0.1:${LOOPBACK_PORT}"
  python3 "$CHECKS"
  compose ps --format json | python3 "$HOST_PORTS"
}

cleanup() {
  CURRENT_ENV="$ENV_A"
  compose down --remove-orphans >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME_NAME" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

python3 "$HOST_PORTS" --self-test

write_env "$ENV_A" "$RELEASE_A_FRONTEND" "$RELEASE_A_BACKEND" "$RELEASE_A_CV"
write_env "$ENV_B" "$RELEASE_B_FRONTEND" "$RELEASE_B_BACKEND" "$RELEASE_B_CV"

echo "VPS lifecycle smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo "  origin: http://127.0.0.1:${LOOPBACK_PORT}"
echo "  release A: $RELEASE_A_FRONTEND"
echo "  release B: $RELEASE_B_FRONTEND"
echo

assert_local_image "$RELEASE_A_FRONTEND"
assert_local_image "$RELEASE_A_BACKEND"
assert_local_image "$RELEASE_A_CV"
docker tag "$RELEASE_A_FRONTEND" "$RELEASE_B_FRONTEND"
docker tag "$RELEASE_A_BACKEND" "$RELEASE_B_BACKEND"
docker tag "$RELEASE_A_CV" "$RELEASE_B_CV"

docker volume create "$VOLUME_NAME" >/dev/null

CURRENT_ENV="$ENV_A"
compose up --no-build -d --wait --wait-timeout 420 \
  postgres cv-generation gotenberg backend frontend

assert_running_tag frontend "$RELEASE_A_FRONTEND"
assert_running_tag backend "$RELEASE_A_BACKEND"
assert_running_tag cv-generation "$RELEASE_A_CV"
origin_smoke

compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE persistence_marker (
    id integer PRIMARY KEY,
    note text NOT NULL
);
INSERT INTO persistence_marker (id, note) VALUES (1, 'survives update rollback backup and restore');
SQL

COMPOSE_FILE="$VPS_COMPOSE:$OVERRIDE_FILE" COMPOSE_ENV_FILE="$ENV_A" \
  "$ROOT_DIR/scripts/db-dump-local-pg.sh" "$DUMP_FILE"
if [ ! -s "$DUMP_FILE" ]; then
  echo "pre-deploy dump was not created: $DUMP_FILE"
  exit 1
fi

postgres_before="$(compose ps -q postgres)"
backend_before="$(compose ps -q backend)"
assert_volume

CURRENT_ENV="$ENV_B"
compose up --no-build -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend

assert_running_tag frontend "$RELEASE_B_FRONTEND"
assert_running_tag backend "$RELEASE_B_BACKEND"
assert_running_tag cv-generation "$RELEASE_B_CV"
postgres_after_update="$(compose ps -q postgres)"
backend_after_update="$(compose ps -q backend)"
if [ "$postgres_after_update" != "$postgres_before" ]; then
  echo "update recreated postgres; expected only changed application services"
  exit 1
fi
if [ "$backend_after_update" = "$backend_before" ]; then
  echo "update did not recreate backend for the new immutable tag"
  exit 1
fi
assert_volume
assert_marker "survives update rollback backup and restore"
origin_smoke

CURRENT_ENV="$ENV_A"
compose up --no-build -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend

assert_running_tag frontend "$RELEASE_A_FRONTEND"
assert_running_tag backend "$RELEASE_A_BACKEND"
assert_running_tag cv-generation "$RELEASE_A_CV"
postgres_after_rollback="$(compose ps -q postgres)"
if [ "$postgres_after_rollback" != "$postgres_before" ]; then
  echo "rollback recreated postgres; the PostgreSQL volume must stay in place"
  exit 1
fi
assert_volume
assert_marker "survives update rollback backup and restore"
origin_smoke

compose stop frontend backend cv-generation gotenberg
compose exec -T postgres psql -U jobtrackr_app -d jobtrackr -v ON_ERROR_STOP=1 \
  -c "DROP TABLE persistence_marker;"

COMPOSE_FILE="$VPS_COMPOSE:$OVERRIDE_FILE" COMPOSE_ENV_FILE="$ENV_A" \
  "$ROOT_DIR/scripts/db-restore-dump.sh" "$DUMP_FILE"

assert_marker "survives update rollback backup and restore"

compose up --no-build -d --force-recreate --wait --wait-timeout 300 postgres
assert_volume
assert_marker "survives update rollback backup and restore"

compose up --no-build -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend
origin_smoke

echo "vps lifecycle smoke passed"
