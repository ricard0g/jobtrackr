#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Missing .env. Run ./scripts/dev-up.sh first."
  exit 1
fi

set -a
. "$ROOT_DIR/.env"
set +a

cd "$ROOT_DIR/JobTrackrApi"
./mvnw spring-boot:run
