#!/usr/bin/env bash
# Run the frontend test suite end-to-end locally. Builds the test image
# (`Dockerfile.test`) and runs it; the image's CMD is `bun run test` which
# chains typecheck + node:test guards + vitest UI + node:test admin-auth.
#
# No external services needed (no DB / Redis / MinIO), so unlike the backend
# test runner this doesn't require the compose stack — only Docker.
#
# Usage (from anywhere; resolves repo root from script location):
#   bash apps/web/scripts/test-local.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
IMAGE="traceoflight-web-test:latest"

# Build (cached layers reused when source unchanged).
docker build -f "$WEB_DIR/Dockerfile.test" -t "$IMAGE" "$WEB_DIR"

# Image CMD is `bun run test`; run it.
docker run --rm "$IMAGE"
