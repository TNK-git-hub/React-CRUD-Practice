# Local CI for React-CRUD-Practice

CI (Continuous Integration) checks every change automatically, so broken code never reaches a PR.
The pipeline is [`local-ci.sh`](local-ci.sh). It runs in three places, never on GitHub's cloud machines:
your machine, the agent pods (before they open a PR), and the self-hosted runner in the local kind
cluster for every PR (`.github/workflows/ci.yml`, see [`k8s/runner/RUNNER.md`](../k8s/runner/RUNNER.md)).

```bash
pnpm ci:local        # from the repo root (or: bash ci/local-ci.sh)
```

> Don't use `pnpm ci`: that's a built-in pnpm command (clean reinstall of `node_modules`), not this script.

## Pipeline

```
setup:     install (pnpm install --frozen-lockfile)
frontend:  lint → typecheck → build
backend:   build
test:      pnpm test  (public tests of both packages, <package>/test/public)
                                    all ✅ → "CI PASSED", exit 0
                                    any ❌ → "CI FAILED", exit 1
```

- If install fails, nothing else runs.
- Inside a job the steps run in order, and the job stops at its first failing step (later steps are skipped).
- Every job still runs, so one run shows all the jobs that are broken.
- At the end it prints a ✅ / ❌ / ⏭ summary of every step.
- Private tests (`pnpm test:private`) are not part of this pipeline yet.

## Leftover build folders

`frontend/.next/` is ignored by both git (`.gitignore`) and ESLint (`globalIgnores` in
`frontend/eslint.config.js`), so it can't add false lint errors to a local run.

## Agents

The agent pods run `pnpm ci:local` after changing the code, and only open a PR if it passes.
See [`k8s/agents/README.md`](../k8s/agents/README.md).
