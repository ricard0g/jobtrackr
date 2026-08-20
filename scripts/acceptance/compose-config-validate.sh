#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ENV="$ROOT_DIR/scripts/acceptance/full-stack.fixture.env"
VALIDATOR="$ROOT_DIR/scripts/acceptance/compose_config_validate.py"

cd "$ROOT_DIR"

if [ ! -f "$FIXTURE_ENV" ]; then
  echo "Missing sanitized Compose fixture: $FIXTURE_ENV"
  exit 1
fi

echo "Compose config validation"
echo "  fixture: $FIXTURE_ENV"
echo

python3 "$VALIDATOR" --self-test

host_run_json="$(docker compose --env-file "$FIXTURE_ENV" config --format json)"
printf '%s' "$host_run_json" | python3 "$VALIDATOR" host-run -

full_json="$(docker compose --profile full --env-file "$FIXTURE_ENV" config --format json)"
printf '%s' "$full_json" | python3 "$VALIDATOR" full -
