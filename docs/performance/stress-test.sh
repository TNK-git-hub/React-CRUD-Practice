#!/usr/bin/env bash
# Usage: ./docs/performance/stress-test.sh [label] [baseUrl]
#   ./docs/performance/stress-test.sh before-redis http://localhost:3001
#   ./docs/performance/stress-test.sh after-redis  http://localhost:3001
# Start the backend in production mode first: pnpm --filter backend build && pnpm --filter backend start:prod
set -euo pipefail

LABEL="${1:-before-redis}"
BASE_URL="${2:-http://localhost:3000}"
DIR="$(cd "$(dirname "$0")" && pwd)"

# npm exec provides autocannon temporarily; NODE_PATH lets the script require() it
npm exec --yes --package=autocannon@8.0.0 -- sh -c \
  'NODE_PATH="$(dirname "$(dirname "$(command -v autocannon)")")" node "$0" "$1" "$2"' \
  "$DIR/stress-test.cjs" "$LABEL" "$BASE_URL"
