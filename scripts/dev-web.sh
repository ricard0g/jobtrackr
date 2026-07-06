#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

cd "$ROOT_DIR/jobtrackr-web"

if [ ! -d node_modules ]; then
  npm install
fi

npm run dev -- --host 0.0.0.0
