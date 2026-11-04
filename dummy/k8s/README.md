# Claude Code agents in k8s pods (dummy test)

Headless Claude Code sessions run in Kubernetes pods. Authentication uses a **Claude subscription** (Pro/Max)
through an OAuth token, not the API.

| File | What it does |
|---|---|
| `agent-pod.yaml` | One pod creates `dummy/hello.md` and opens a PR (first experiment) |
| `live-pod.yaml` | Long-lived pod, run `claude -p` in it with `kubectl exec` |
| `agent-jobs.yaml` | **3 parallel agents**: each changes the code → runs local CI → opens a PR only if CI passes |
| `run-jobs.sh` | Starts chosen jobs from `agent-jobs.yaml` and saves their logs to `logs/` |
| `arc-runner-values.yaml` | Self-hosted GitHub Actions runner (ARC) for PR checks, see `RUNNER.md` |

## Agent jobs: change code → local CI → PR

```
clone BASE_BRANCH (local-ci) → pnpm install
→ claude -p "<task> … then run pnpm ci:local and fix what it reports"
     tools: Read, Edit, Glob, Grep, Bash(pnpm ci:local) only
→ CI gate (run by the script, not by the agent):
     agent changed CI/lint/TS/package config? → no PR, job fails
     pnpm ci:local ❌ → send the CI log back to Claude (max MAX_FIX_ATTEMPTS=2) → still ❌ → no PR, job fails
     pnpm ci:local ✅ → commit, push, gh pr create (CI summary in the PR body)
```

PRs target `local-ci`. Each PR is then checked again by the self-hosted runner in the kind cluster
(`ci` check on the PR, see [`RUNNER.md`](RUNNER.md)). Nothing runs on GitHub's cloud machines.

## Run

```bash
# One-time setup
claude setup-token                       # copy the sk-ant-oat... value
kind create cluster --name claude-demo
kubectl create secret generic agent-secrets \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN='<sk-ant-oat...>' \
  --from-literal=GH_TOKEN="$(gh auth token)"
security find-certificate -c MWG -p /Library/Keychains/System.keychain > mwg-ca.pem
kubectl create configmap mwg-ca --from-file=mwg-ca.crt=mwg-ca.pem

# Run agents (from the repo root); returns when all of them finish
bash dummy/k8s/run-jobs.sh agent-title-product   # one
bash dummy/k8s/run-jobs.sh all                   # all 3 in parallel
```

## Logs

Pods are deleted the moment they finish (`ttlSecondsAfterFinished: 0`), so `run-jobs.sh` streams each pod's
log to `dummy/k8s/logs/<job>-<time>.log` while it runs (the folder is gitignored).
Each file ends with `RESULT: SUCCESS (PR opened)` or `RESULT: FAILED …`; the last `==>` line before it shows
the step that failed.

## Notes

- Usage counts against your subscription limits. Each CI fix round is another Claude call.
- Don't set `ANTHROPIC_API_KEY` in the pod. If it's set, Claude Code uses it instead of the subscription token.
- The office gateway (MWG) re-signs HTTPS, hence the `mwg-ca` ConfigMap and `NODE_EXTRA_CA_CERTS`.
