# Local CI for React-CRUD-Practice

CI (Continuous Integration) checks every change automatically, so broken code never reaches a PR.
The pipeline is [`local-ci.sh`](local-ci.sh). It runs in three places, never on GitHub's cloud machines:
your machine, the agent pods (before they open a PR), and the self-hosted runner in the local kind
cluster for every PR (`.github/workflows/ci.yml`, see [`dummy/k8s/RUNNER.md`](../dummy/k8s/RUNNER.md)).

```bash
pnpm ci:local        # from the repo root (or: bash ci/local-ci.sh)
```

> Don't use `pnpm ci`: that's a built-in pnpm command (clean reinstall of `node_modules`), not this script.

## Pipeline

```
setup:     install (pnpm install --frozen-lockfile)
frontend:  lint → typecheck → test (Vitest) → build
backend:   build
                                    all ✅ → "CI PASSED", exit 0
                                    any ❌ → "CI FAILED", exit 1
```

- If install fails, nothing else runs.
- Inside a job the steps run in order, and the job stops at its first failing step (later steps are skipped).
- Every job still runs, so one run shows all the jobs that are broken.
- At the end it prints a ✅ / ❌ / ⏭ summary of every step.

## End-to-end tests

```bash
pnpm e2e             # Playwright + Chromium against Postgres + Redis + backend (:3100) + frontend (:4173)
pnpm e2e -g E2E-4    # only one test
```

[`e2e.sh`](e2e.sh) uses its own database `crud_e2e` and Redis db 1, reset on every run, so dev data is never touched.
Locally it reuses a Postgres / Redis that is already running (e.g. `brew services`), otherwise it starts docker compose.
`pnpm ci:local` does **not** run E2E (the agent pods have no database); on PRs the `e2e` job runs it on the E2E runner.
Spec: [`docs/specs/e2e-product-crud.spec.md`](../docs/specs/e2e-product-crud.spec.md).

## Leftover build folders

`frontend/.next/` (an old build folder) is ignored by both git (`.gitignore`) and ESLint (`globalIgnores` in
`frontend/eslint.config.js`), so it can't add false lint errors to a local run.

## Agents

The agent jobs run `pnpm ci:local` after changing the code, and only open a PR if it passes.
See [`dummy/k8s/README.md`](../dummy/k8s/README.md).
