#!/usr/bin/env bash
# Run the backend test suite end-to-end on a local machine. Bootstraps every
# prerequisite that's missing — env files, compose stack, test image — so a
# fresh clone can run `bash apps/api/scripts/test-local.sh` with no other
# setup steps. Existing `.env.api` / `.env.test` / running infra are honored
# (we only fill in the gaps).
#
# Usage (from anywhere; resolves repo root from script location):
#   bash apps/api/scripts/test-local.sh [extra cargo test args...]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
INFRA_COMPOSE="$REPO_ROOT/infra/docker/infra/docker-compose.yml"
ENV_API="$API_DIR/.env.api"
ENV_TEST="$API_DIR/.env.test"
NETWORK="traceoflight-api-stack_api_internal"
IMAGE="traceoflight-api-test:latest"

# 1. env files — fill in from the committed examples if missing. Existing
# files (real local dev creds) are left alone.
if [ ! -f "$ENV_API" ]; then
  cp "$API_DIR/.env.api.example" "$ENV_API"
  echo "[test-local] created $ENV_API from .env.api.example"
fi
if [ ! -f "$ENV_TEST" ]; then
  cp "$API_DIR/.env.test.example" "$ENV_TEST"
  echo "[test-local] created $ENV_TEST from .env.test.example"
fi

# 2. infra compose — bring up postgres / redis / minio if any are missing.
need_up=0
for svc in traceoflight-postgres traceoflight-redis traceoflight-minio; do
  if ! docker ps --filter "name=^${svc}$" --filter "status=running" --format '{{.Names}}' | grep -q .; then
    need_up=1
    break
  fi
done
if [ "$need_up" -eq 1 ]; then
  echo "[test-local] bringing up infra compose..."
  docker compose -f "$INFRA_COMPOSE" --env-file "$ENV_API" up -d
  # Wait for postgres to be ready (compose healthcheck takes a few seconds).
  for i in $(seq 1 30); do
    if docker exec traceoflight-postgres bash -c 'pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER"' >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

# 3. Sanity-check the api_internal network exists.
if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  echo "ERROR: docker network '${NETWORK}' missing even after compose up." >&2
  exit 1
fi

# 4. Build (or rebuild from cached layers) the test runner image.
docker build -f "$API_DIR/Dockerfile.test" -t "$IMAGE" "$API_DIR"

# 5. Run cargo test inside a container joined to api_internal.
docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_TEST" \
  "$IMAGE" \
  bash -c "bash scripts/setup-test-db.sh && cargo test --locked $*"
