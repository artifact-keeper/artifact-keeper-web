#!/usr/bin/env bash
set -euo pipefail

# Run Playwright E2E tests against a docker-compose stack.
#
# This script:
#   1. Builds the web frontend from the current source
#   2. Starts backend + postgres + meilisearch using published images
#   3. Waits for all services to be healthy
#   4. Runs Playwright tests
#   5. Tears everything down
#
# Options:
#   --keep          Keep containers running after tests (for debugging)
#   --backend-tag   Backend image tag (default: dev)
#   --port          Host port for web UI (default: 3100)
#   --ui            Open Playwright UI mode instead of headless
#   --headed        Run tests in headed mode
#   --grep PATTERN  Only run tests matching pattern
#   --shard N/M     Run shard N of M (for parallel CI)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.e2e.yml"

KEEP=false
BACKEND_TAG="${BACKEND_TAG:-dev}"
WEB_PORT="${E2E_WEB_PORT:-3100}"
PW_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)        KEEP=true; shift ;;
    --backend-tag) BACKEND_TAG="$2"; shift 2 ;;
    --port)        WEB_PORT="$2"; shift 2 ;;
    --ui)          PW_ARGS+=(--ui); shift ;;
    --headed)      PW_ARGS+=(--headed); shift ;;
    --grep)        PW_ARGS+=(--grep "$2"); shift 2 ;;
    --shard)       PW_ARGS+=(--shard "$2"); shift 2 ;;
    *)             PW_ARGS+=("$1"); shift ;;
  esac
done

export BACKEND_TAG E2E_WEB_PORT="$WEB_PORT"

cleanup() {
  if [[ "$KEEP" = false ]]; then
    echo "Tearing down E2E stack..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
  else
    echo "Keeping containers running (--keep). Tear down with:"
    echo "  docker compose -f docker-compose.e2e.yml down -v"
  fi
  return 0
}
trap cleanup EXIT

echo "=== Artifact Keeper E2E Tests ==="
echo "Backend image tag: $BACKEND_TAG"
echo "Web port: $WEB_PORT"
echo ""

# Build web from current source and start the stack
echo "Starting E2E stack..."
docker compose -f "$COMPOSE_FILE" up -d --build --wait

echo ""
echo "All services healthy. Running Playwright tests..."
echo ""

# Run Playwright against the local stack
cd "$PROJECT_DIR"
PLAYWRIGHT_BASE_URL="http://localhost:$WEB_PORT" \
  npx playwright test "${PW_ARGS[@]+"${PW_ARGS[@]}"}"
