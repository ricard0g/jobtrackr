#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/full-stack.fixture.env"
STACK_OVERRIDE="$ROOT_DIR/scripts/acceptance/full-stack-smoke.override.yml"
RELEASE_OVERRIDE="$ROOT_DIR/scripts/acceptance/release-smoke.override.yml"
CHECKS="$ROOT_DIR/scripts/acceptance/full-stack-smoke.py"
CREDS_FILE="${TMPDIR:-/tmp}/jobtrackr-release-smoke.creds"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-release-smoke}"
export COMPOSE_PROJECT_NAME

: "${JOBTRACKR_FRONTEND_IMAGE:?JOBTRACKR_FRONTEND_IMAGE is required}"
: "${JOBTRACKR_BACKEND_IMAGE:?JOBTRACKR_BACKEND_IMAGE is required}"
: "${JOBTRACKR_CV_GENERATION_IMAGE:?JOBTRACKR_CV_GENERATION_IMAGE is required}"
export JOBTRACKR_FRONTEND_IMAGE JOBTRACKR_BACKEND_IMAGE JOBTRACKR_CV_GENERATION_IMAGE

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
    -f "$STACK_OVERRIDE" \
    -f "$RELEASE_OVERRIDE" \
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

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$CREDS_FILE"
}
trap cleanup EXIT

echo "Release Compose smoke"
echo "  compose project: $COMPOSE_PROJECT_NAME"
echo "  origin: $JOBTRACKR_APP_ORIGIN"
echo "  frontend: $JOBTRACKR_FRONTEND_IMAGE"
echo "  backend: $JOBTRACKR_BACKEND_IMAGE"
echo "  cv-generation: $JOBTRACKR_CV_GENERATION_IMAGE"
echo

assert_local_image "$JOBTRACKR_FRONTEND_IMAGE"
assert_local_image "$JOBTRACKR_BACKEND_IMAGE"
assert_local_image "$JOBTRACKR_CV_GENERATION_IMAGE"

compose up --no-build -d --wait --wait-timeout 420 \
  postgres cv-generation gotenberg backend frontend

assert_running_image frontend "$JOBTRACKR_FRONTEND_IMAGE"
assert_running_image backend "$JOBTRACKR_BACKEND_IMAGE"
assert_running_image cv-generation "$JOBTRACKR_CV_GENERATION_IMAGE"

python3 "$CHECKS" | tee "$CREDS_FILE"

auth_email="$(awk -F= '/^JOBTRACKR_AUTH_EMAIL=/{print $2}' "$CREDS_FILE")"
auth_password="$(awk -F= '/^JOBTRACKR_AUTH_PASSWORD=/{print $2}' "$CREDS_FILE")"
if [ -z "$auth_email" ] || [ -z "$auth_password" ]; then
  echo "registration did not print credentials"
  exit 1
fi

compose down --remove-orphans
compose up --no-build -d --wait --wait-timeout 300 \
  postgres cv-generation gotenberg backend frontend

assert_running_image frontend "$JOBTRACKR_FRONTEND_IMAGE"
assert_running_image backend "$JOBTRACKR_BACKEND_IMAGE"
assert_running_image cv-generation "$JOBTRACKR_CV_GENERATION_IMAGE"

JOBTRACKR_AUTH_EMAIL="$auth_email" JOBTRACKR_AUTH_PASSWORD="$auth_password" \
  python3 "$CHECKS"

echo "release compose smoke passed"
