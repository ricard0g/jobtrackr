#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/full-stack.fixture.env"
VPS_FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/vps.fixture.env"
VPS_COMPOSE="$ROOT_DIR/docker-compose.vps.yml"
VALIDATOR="$ROOT_DIR/scripts/acceptance/compose_config_validate.py"
VPS_ENV_VALIDATOR="$ROOT_DIR/scripts/acceptance/vps_env_validate.py"
EDGE_VALIDATOR="$ROOT_DIR/scripts/acceptance/vps_edge_validate.py"
SYSTEM_NGINX_EXAMPLE="$ROOT_DIR/config/nginx/vps-system.conf"
CLOUDFLARED_EXAMPLE="$ROOT_DIR/config/cloudflared/config.example.yml"

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized Compose fixture: $FIXTURE_ENV"
  exit 1
fi
if [ ! -f "$VPS_FIXTURE_ENV" ]; then
  echo "Missing sanitized VPS Compose fixture: $VPS_FIXTURE_ENV"
  exit 1
fi
if [ ! -f "$SYSTEM_NGINX_EXAMPLE" ]; then
  echo "Missing sanitized system Nginx example: $SYSTEM_NGINX_EXAMPLE"
  exit 1
fi
if [ ! -f "$CLOUDFLARED_EXAMPLE" ]; then
  echo "Missing sanitized cloudflared example: $CLOUDFLARED_EXAMPLE"
  exit 1
fi

echo "Compose config validation"
echo "  fixture: $FIXTURE_ENV"
echo "  vps fixture: $VPS_FIXTURE_ENV"
echo

python3 "$VALIDATOR" --self-test
python3 "$VPS_ENV_VALIDATOR" --self-test
python3 "$ROOT_DIR/scripts/acceptance/vps_host_ports.py" --self-test
python3 "$EDGE_VALIDATOR" --self-test
python3 "$VPS_ENV_VALIDATOR" "$VPS_FIXTURE_ENV"
python3 "$EDGE_VALIDATOR" "$SYSTEM_NGINX_EXAMPLE" "$CLOUDFLARED_EXAMPLE"
if python3 "$VPS_ENV_VALIDATOR" "$ROOT_DIR/.env.vps.example" >/dev/null 2>&1; then
  echo "sanitized VPS template unexpectedly passed environment validation"
  exit 1
fi

host_run_json="$(docker compose --env-file "$FIXTURE_ENV" config --format json)"
printf '%s' "$host_run_json" | python3 "$VALIDATOR" host-run -

full_json="$(docker compose --profile full --env-file "$FIXTURE_ENV" config --format json)"
printf '%s' "$full_json" | python3 "$VALIDATOR" full -

vps_json="$(
  env \
    -u JOBTRACKR_FRONTEND_IMAGE \
    -u JOBTRACKR_BACKEND_IMAGE \
    -u JOBTRACKR_CV_GENERATION_IMAGE \
    docker compose -f "$VPS_COMPOSE" --env-file "$VPS_FIXTURE_ENV" config --format json
)"
printf '%s' "$vps_json" | python3 "$VALIDATOR" vps -

incomplete_env="$(mktemp)"
trap 'rm -f "$incomplete_env"' EXIT
grep -v '^POSTGRES_PASSWORD=' "$VPS_FIXTURE_ENV" > "$incomplete_env"
set +e
compose_error="$(
  env \
    -u JOBTRACKR_FRONTEND_IMAGE \
    -u JOBTRACKR_BACKEND_IMAGE \
    -u JOBTRACKR_CV_GENERATION_IMAGE \
    docker compose -f "$VPS_COMPOSE" --env-file "$incomplete_env" config 2>&1
)"
compose_status=$?
set -e
if [ "$compose_status" -eq 0 ]; then
  echo "VPS Compose config succeeded without POSTGRES_PASSWORD"
  exit 1
fi
if ! grep -q 'POSTGRES_PASSWORD' <<<"$compose_error"; then
  echo "missing POSTGRES_PASSWORD did not fail clearly"
  exit 1
fi
if grep -Eq 'vps-compose-db-password|vps-compose-signing-key|vps-placeholder-gemini-key|vps-placeholder-secret-key' <<<"$compose_error"; then
  echo "Compose error displayed a secret value"
  exit 1
fi

echo "vps Compose rejects missing POSTGRES_PASSWORD without printing secrets"
