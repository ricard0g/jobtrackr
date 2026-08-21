#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY="$ROOT_DIR/scripts/acceptance/release_images.py"
WORKFLOW="$ROOT_DIR/.github/workflows/release-images.yml"
SMOKE="$ROOT_DIR/scripts/acceptance/release-smoke.sh"

cd "$ROOT_DIR"

python3 "$POLICY" --self-test
python3 "$POLICY" validate-workflow "$WORKFLOW"
python3 "$POLICY" validate-smoke "$SMOKE"
python3 "$POLICY" validate-docs "$ROOT_DIR/docs/releasing-images.md"
