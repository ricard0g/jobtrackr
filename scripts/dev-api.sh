#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Missing .env. Run ./scripts/dev-up.sh first."
  exit 1
fi

set -a
PRESERVED_JWT_REFRESH_COOKIE_SECURE="${JWT_REFRESH_COOKIE_SECURE-}"
. "$ROOT_DIR/.env"
set +a

if [ -n "$PRESERVED_JWT_REFRESH_COOKIE_SECURE" ]; then
  export JWT_REFRESH_COOKIE_SECURE="$PRESERVED_JWT_REFRESH_COOKIE_SECURE"
fi

if [ -d /usr/lib/jvm/temurin-25-jdk-amd64 ]; then
  export JAVA_HOME=/usr/lib/jvm/temurin-25-jdk-amd64
  export PATH="$JAVA_HOME/bin:$PATH"
fi

cd "$ROOT_DIR/JobTrackrApi"
./mvnw spring-boot:run
