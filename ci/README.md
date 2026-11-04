# Local CI for React-CRUD-Practice

CI (Continuous Integration) checks every change automatically, so broken code never reaches a PR.
This repo has **no cloud CI**: the only pipeline is [`local-ci.sh`](local-ci.sh), run on your machine
or inside the agent pods before they open a PR.

```bash
pnpm ci:local        # from the repo root (or: bash ci/local-ci.sh)
```

> Don't use `pnpm ci`: that's a built-in pnpm command (clean reinstall of `node_modules`), not this script.

## Pipeline

```
setup:     install (pnpm install --frozen-lockfile)
frontend:  lint → typecheck → build
backend:   build
                                    all ✅ → "CI PASSED", exit 0
                                    any ❌ → "CI FAILED", exit 1
```

- If install fails, nothing else runs.
- Inside a job the steps run in order, and the job stops at its first failing step (later steps are skipped).
- Every job still runs, so one run shows all the jobs that are broken.
- At the end it prints a ✅ / ❌ / ⏭ summary of every step.

## Leftover build folders

`frontend/.next/` (an old build folder) is ignored by both git (`.gitignore`) and ESLint (`globalIgnores` in
`frontend/eslint.config.js`), so it can't add false lint errors to a local run.

## Agents

The agent jobs run `pnpm ci:local` after changing the code, and only open a PR if it passes.
See `dummy/k8s/README.md` (local only, not committed).
