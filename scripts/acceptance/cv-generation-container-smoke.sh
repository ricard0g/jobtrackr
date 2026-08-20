#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${CV_GENERATION_SMOKE_IMAGE:-jobtrackr-cv-generation:local}"
PROD_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-cv-generation-smoke}-prod"
FAKE_NAME="${COMPOSE_PROJECT_NAME:-jobtrackr-cv-generation-smoke}-fake"
SAMPLE_CV="$ROOT_DIR/cv-generation-service/tests/fixtures/sample_base_cv.md"
SMOKE_TOKEN="cv-generation-smoke-token"

cd "$ROOT_DIR"

if [ ! -f "$SAMPLE_CV" ]; then
  echo "Missing sample Base CV fixture: $SAMPLE_CV"
  exit 1
fi

cleanup() {
  docker rm -f "$PROD_NAME" "$FAKE_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_live() {
  local name="$1"
  local i
  for i in $(seq 1 30); do
    if docker exec "$name" python -c \
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/health/live', timeout=2)" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "liveness did not become available for $name"
  docker logs "$name" >&2 || true
  return 1
}

echo "CV Generation container smoke"
echo "  image: $IMAGE"
echo

docker build -t "$IMAGE" "$ROOT_DIR/cv-generation-service"

docker run -d --name "$PROD_NAME" \
  --network none \
  "$IMAGE" >/dev/null
wait_for_live "$PROD_NAME"

docker exec "$PROD_NAME" python -c '
import json
import sys
import urllib.error
import urllib.request

status, body = None, None
with urllib.request.urlopen("http://127.0.0.1:8081/health/live", timeout=10) as response:
    status, body = response.status, response.read().decode()
if status != 200:
    sys.exit("production liveness returned HTTP %s: %s" % (status, body))
if json.loads(body).get("status") != "ok":
    sys.exit("production liveness was not ok: %s" % body)

try:
    urllib.request.urlopen("http://127.0.0.1:8081/health/ready", timeout=10)
    sys.exit("production readiness unexpectedly succeeded")
except urllib.error.HTTPError as exc:
    if exc.code != 503:
        sys.exit("production readiness returned HTTP %s: %s" % (exc.code, exc.read().decode()))
    payload = json.loads(exc.read().decode())
    if payload.get("status") != "not_ready":
        sys.exit("production readiness was not not_ready: %s" % payload)
'

docker run -d --name "$FAKE_NAME" \
  --network none \
  -e CV_GENERATION_PROVIDER=fake \
  -e CV_GENERATION_ALLOW_FAKE_PROVIDER=true \
  -e CV_GENERATION_PROFILE=test \
  -e CV_GENERATION_SERVICE_TOKEN="$SMOKE_TOKEN" \
  -v "$SAMPLE_CV:/tmp/sample_base_cv.md:ro" \
  "$IMAGE" >/dev/null
wait_for_live "$FAKE_NAME"

docker exec -e SMOKE_TOKEN="$SMOKE_TOKEN" "$FAKE_NAME" python -c '
import json
import os
import sys
import uuid

import httpx

live = httpx.get("http://127.0.0.1:8081/health/live", timeout=10)
if live.status_code != 200:
    sys.exit("liveness returned HTTP %s: %s" % (live.status_code, live.text))
if live.json().get("status") != "ok":
    sys.exit("liveness was not ok: %s" % live.text)

ready = httpx.get("http://127.0.0.1:8081/health/ready", timeout=10)
if ready.status_code != 200:
    sys.exit("readiness returned HTTP %s: %s" % (ready.status_code, ready.text))
payload = ready.json()
if payload.get("status") != "ready" or payload.get("provider") != "fake":
    sys.exit("readiness was not fake-ready: %s" % ready.text)

spec = {
    "output_format": "MARKDOWN",
    "job_description": "Software Engineer\nRequirements: Python experience required.",
    "additional_information": None,
    "correlation_id": str(uuid.uuid4()),
}
token = os.environ["SMOKE_TOKEN"]
with open("/tmp/sample_base_cv.md", "rb") as fh:
    response = httpx.post(
        "http://127.0.0.1:8081/v1/generate",
        headers={"Authorization": "Bearer %s" % token},
        files={"file": ("cv.md", fh, "text/markdown")},
        data={"specification": json.dumps(spec)},
        timeout=60,
    )
if response.status_code != 200:
    sys.exit("generate returned HTTP %s: %s" % (response.status_code, response.text))
if "Ada Lovelace" not in response.text:
    sys.exit("Generated CV markdown did not include the candidate name")
print("cv-generation container smoke passed")
'
