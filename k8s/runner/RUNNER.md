# Self-hosted GitHub Actions runner (ARC in kind)

PR checks are **scheduled by GitHub** but **run on your machine**, in the local kind cluster.

```
PR opened ─► GitHub reads .github/workflows/ci.yml ─► "runs-on: arc-runner-set"
          ─► listener pod (arc-systems) gets the job ─► new runner pod in arc-runners
          ─► checkout, Node 22, pnpm ci:local ─► result + logs sent to GitHub ─► pod deleted
          ─► PR shows the "ci" check ✅ / ❌
```

The runner connects **out** to GitHub (HTTPS long-poll), so no port is opened on your machine.
The cluster must be running, otherwise jobs wait in "Waiting for a runner…".

## Pieces

| What | Where |
|---|---|
| ARC controller (Helm `arc`, chart 0.15.1) | namespace `arc-systems` |
| Listener pod (talks to GitHub) | `arc-systems`, `arc-runner-set-…-listener` |
| Runner scale set (Helm `arc-runner-set`) | namespace `arc-runners`, values in `arc-runner-values.yaml` |
| PAT secret `arc-github-pat` (key `github_token`) | `arc-runners` (fine-grained, this repo only, Administration: Read and write) |
| CA ConfigMaps `mwg-ca`, `ca-bundle` | `arc-runners` (office gateway re-signs HTTPS) |
| Workflow | `.github/workflows/ci.yml` |

The kind node also trusts the MWG CA (`/usr/local/share/ca-certificates/mwg-ca.crt` in the
`claude-demo-control-plane` container); without it the node cannot pull images from `ghcr.io`.
If the cluster is recreated, redo that step and the ConfigMaps.

## Everyday commands

```bash
kubectl -n arc-systems get pods                 # controller + listener should be Running
kubectl -n arc-runners get pods -w              # watch runner pods appear during a job
gh pr checks <PR> --watch                        # CI result of a PR
gh run list --workflow CI                        # all CI runs
gh run view <run-id> --log-failed                # logs of failed steps

# Pause / resume the runner (jobs queue on GitHub while paused)
helm uninstall arc-runner-set -n arc-runners
helm upgrade --install arc-runner-set -n arc-runners --version 0.15.1 \
  -f k8s/runner/arc-runner-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

## Security

| Risk | Protection |
|---|---|
| Stranger forks the repo and opens a PR with malicious code | Repo setting **Require approval for all external contributors** (the real guard: a fork PR can edit `ci.yml`, so the `if:` fork check in the workflow only stops accidents). Never click "Approve and run" without reading the PR, especially `.github/` changes. |
| Secrets stolen by a job | Workflow uses no secrets; `pull_request` (never `pull_request_target`); token is `contents: read`; `persist-credentials: false`; runner pods have no Kubernetes token and live in `arc-runners`, away from `agent-secrets` in `default`. |
| Malware staying on the machine | Ephemeral runners: a new pod per job, deleted after. No hostPath, no Docker socket, not privileged, no sudo, all capabilities dropped. |
| Hijacked third-party action | Actions pinned to full commit SHAs. |
| Job eating the machine | `timeout-minutes: 15`, CPU 1 / memory 3Gi per pod, at most 3 runners. |
| Merging code that fails CI | Branch protection on `local-ci`: PR required, `ci` check required, no force push / delete. |
| Agents changing the rules | `.github/` and CI/lint/TS/package config are in the agents' `PROTECTED` list. |

Known limit: kind's default network does not enforce NetworkPolicy, so runner pods can reach the
internet and other pods. The approval gate is what keeps untrusted code from running at all.

## Remove everything

```bash
helm uninstall arc-runner-set -n arc-runners
helm uninstall arc -n arc-systems
kubectl delete namespace arc-runners arc-systems
```
Then **revoke the PAT** on GitHub (Settings → Developer settings → Fine-grained tokens).
