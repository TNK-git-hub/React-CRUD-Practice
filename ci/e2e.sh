#!/usr/bin/env bash
# End-to-end tests (Playwright, Chromium) against the real stack:
#   Postgres + Redis -> backend (NestJS, :3100) -> frontend (vite preview, :4173)
# Spec: docs/specs/e2e-product-crud.spec.md
#
# Locally:  pnpm e2e   (uses the docker compose Postgres/Redis from `pnpm db:up`,
#                       with its own database "crud_e2e" and Redis db 1 -> your dev data is never touched)
# In CI:    the E2E runner pod has Postgres + Redis sidecars on localhost (DB_* / REDIS_URL set by the workflow).
# Extra arguments go to Playwright, e.g.  pnpm e2e -g E2E-4
set -euo pipefail
cd "$(dirname "$0")/.."

E2E_DB_NAME="crud_e2e"

if [[ "${GITHUB_ACTIONS:-}" != true ]]; then
  DB_USER="$(grep -E '^DB_USER=' backend/.env | cut -d= -f2-)"
  DB_PASSWORD="$(grep -E '^DB_PASSWORD=' backend/.env | cut -d= -f2-)"
  DB_PORT="$(grep -E '^DB_PORT=' backend/.env | cut -d= -f2-)"
  export DB_HOST=localhost DB_USER="${DB_USER:-postgres}" DB_PASSWORD DB_PORT="${DB_PORT:-5432}"
  export REDIS_URL="redis://localhost:6379/1"   # db 1: separate from the dev cache in db 0

  # Postgres / Redis: reuse ones already running (e.g. brew services), otherwise start docker compose
  if command -v pg_isready >/dev/null && pg_isready -q -h localhost -p "$DB_PORT"; then
    echo "==> Local run: using the Postgres already on :${DB_PORT}"
    PSQL=(env PGPASSWORD="$DB_PASSWORD" psql -q -h localhost -p "$DB_PORT" -U "$DB_USER" -d postgres)
  else
    echo "==> Local run: starting Postgres (docker compose)"
    docker compose --env-file backend/.env up -d postgres >/dev/null
    until docker exec crud-postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; do sleep 1; done
    PSQL=(docker exec crud-postgres psql -q -U "$DB_USER" -d postgres)
  fi
  if command -v redis-cli >/dev/null && redis-cli -p 6379 ping >/dev/null 2>&1; then
    REDIS_CLI=(redis-cli -p 6379)
  else
    echo "==> Local run: starting Redis (docker compose)"
    docker compose --env-file backend/.env up -d redis >/dev/null
    REDIS_CLI=(docker exec crud-redis redis-cli)
  fi

  echo "==> Resetting database ${E2E_DB_NAME} and Redis db 1"
  "${PSQL[@]}" -c "DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)" -c "CREATE DATABASE ${E2E_DB_NAME}"
  "${REDIS_CLI[@]}" -n 1 FLUSHDB >/dev/null
  export NODE_OPTIONS="${NODE_OPTIONS:-} --use-system-ca"   # office proxy (MWG) for the browser download
fi

export DB_NAME="$E2E_DB_NAME" PORT=3100 FRONTEND_URL=http://localhost:4173 PUBLIC_URL=http://localhost:3100

echo "==> Building backend and frontend (frontend -> API http://localhost:3100)"
pnpm --filter backend build
VITE_API_URL=http://localhost:3100 pnpm --filter frontend build

echo "==> Chromium for Playwright"
pnpm --filter frontend exec playwright install chromium

echo "==> Running Playwright"
pnpm --filter frontend exec playwright test "$@"
