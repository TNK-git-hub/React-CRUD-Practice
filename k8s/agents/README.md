# Agents running headless in a pod (kind)

The main session (the local session) dispatches tasks to agents that run in parallel, one pod per agent. Tasks are **not hard-coded**:
each dispatch is a markdown file, passed in at run time.

```
main session: splits a feature into tasks (each task its own group of files) → tasks/<id>.md
  → dispatch.sh <id> tasks/<id>.md|- --title "..." [--mode full|code-only] [--change NNN-<feature> [--tasks T001,...] | --bug <id>]
                                                       (may run in parallel; --change: follow a spec, see "Working from a spec";
                                                        --bug: steps f-g of the bug flow, see "Fixing a bug")
      pod: clone the base branch (CLAUDE.md, section Branches) → pnpm install, then (mode full, each step a new claude -p --agent <role> session):
        1. PLAN    code-planner + test-planner (read-only)          → /tmp/plan (outside the repo)
        2. RED     test-writer → gate: only test/public changed, the new tests must FAIL → commit "test: ..."
        3. GREEN   code-writer → gate: only src changed, no probing of the test environment, pnpm ci:local (≤2 fix rounds) → commit
        4. REVIEW  mutation score (Stryker) + code-reviewer + test-critic + security-reviewer → changes needed: back to 2/3 (≤2 rounds)
                   security CHANGES: test-writer writes a test proving each HIGH/MEDIUM vulnerability, code-writer fixes it;
                   security with SPEC_PROBLEM (permissions in the spec wrong/missing) → review stops, draft PR, back to the spec harness
        5. EXPORT  the pod has no GitHub write token: it prints the branch in the log (git bundle + meta + PR body, between two ARTIFACT lines)
      (mode code-only: only steps 3 and 5)
      → pod: "RESULT: SUCCESS artifact=ready" | "RESULT: FAILED reason=...[ artifact=ready]"
  → collect.sh (called by dispatch.sh) on this machine: checks the artifact, pushes the branch, opens the PR (FAILED after the first commit: draft PR)
      → "RESULT: SUCCESS pr=<url>" | "RESULT: FAILED reason=... pr=<url>"
  → dispatch.sh runs the hidden tests (test/private, only on this machine) on the PR branch → "PRIVATE: PASS|FAIL|SKIPPED"
  → watch-pr.sh <pr>                                   (GitHub Actions runs ci.yml on the ARC runner)
      → "CHECKS: PASS" | "CHECKS: FAIL" (+ logs of the failed steps) | "CHECKS: TIMEOUT"
  → on failure, write a fix task with the log and re-dispatch; on success, sum up for the user
```

## Against reward hacking: what blocks what
| Risk | Blocked by |
|---|---|
| code-writer edits tests / test-writer edits code | `guard.mjs` (by `agent_type`), `--allowedTools` per role, and **the gates in `run.sh`**: after each step, every file changed since the SHA of the commit before that step must be in the role's area (allow-list). The gate runs after the agent has exited, so it cannot be bypassed with Bash or by running code |
| Rewriting git history to drop the test commit | The gate checks that the commit before the step is still an ancestor of `HEAD` |
| Code that probes the test environment (`VITEST`, `NODE_ENV === 'test'`) | The gate greps the `src` diff |
| Tests written afterwards, fitted to the code | RED step: the new tests must fail on the old code before code-writer runs; the PR has 2 commits, test → code |
| The RED → GREEN order reversed or faked in the git history (pod branches and hand-made branches alike) | CI job `red-check` (`.specify/scripts/red_check.py --base origin/<base>`) checks it again on the PR's history: the first commit that touches the test area holds only tests, the tests it adds/changes fail at that very commit (run in a temporary worktree), no commit that changes `src` comes before it; a bug record `bugs/<id>/` may only be in its own commit before it |
| Weak tests | Mutation score ≥ `MUTATION_MIN` on the changed src files + test-critic |
| Deleting existing tests to pass more easily | test-writer cannot delete files itself; it writes `DELETE: <path>` and `run.sh` only deletes files in `test/public` created by the branch itself (not present at `BASE_SHA`) |
| A wrong test, code-writer stuck (or claiming "the test is wrong" to dodge it) | code-writer writes `TEST_WRONG: <file>:<line> <reason>`; test-critic arbitrates from the spec, at most once per task. `TESTS_WRONG` → the current code is committed (`wip`), test-writer fixes only the assertions judged wrong; `CODE_WRONG` → code-writer goes on fixing, with the reasoning. The per-role area gates do not change |
| The critic changing its mind between rounds | From round 2, the critic gets the previous round's review + the test-writer's answer, and may block only with an old item not yet addressed or a significant new problem |
| Code tailored to the public tests | Hidden tests `test/private` run on the local machine once there is a PR; only counts are printed, no content goes to the agents. Quarantined hidden tests (`_stale/`, see "Stale hidden tests") are not copied into the worktree, so they do not run |
| Prompt injection into a reviewer | A VERDICT can only stop the flow or send it back for fixes; the gates above still decide |
| Security holes / missing permission checks in the backend | security-reviewer (read-only, constitution Principle II) in every REVIEW round; approval also needs `security=APPROVE`. A HIGH/MEDIUM finding → a test proving the vulnerability (test-writer), then the code fix (code-writer); a `SPEC_PROBLEM` about permissions → stop, draft PR |
| An agent edits the spec to fit the code/tests (`--change`) | Checksum of the whole `specs/` taken before the PLAN step; every `assert_only` gate fails if a file in `specs/` changed (including uncommitted spec files sent through the ConfigMap) |
| An agent edits the bug record or the reproduction test to pass more easily (`--bug`) | The reproduction test is part of the root-cause gate the user approved (`approval.py`, hash). The pod runs `approval.py verify --bug` at the start and before opening the PR; checksum of `bugs/<id>/` + the reproduction test in every `assert_only` gate; `DELETE:` cannot delete the reproduction test |
| Secrets in the pod read or used by an agent | The pod has only the Claude token (`CLAUDE_CODE_OAUTH_TOKEN`), no GitHub write token (with `GH_TOKEN`, `run.sh` FAILS): anonymous clone (public repo) or a read-only `GH_READ_TOKEN` through a credential helper, never in the URL or `.git/config` (`run.sh` checks). Push and PR happen on this machine (`collect.sh`, which treats the artifact as data only; the job's last marker decides — `ARTIFACT NONE` means no PR —; every changed file must be in the agent areas; no force push). Commands the script runs (pnpm install / ci:local, vitest, stryker, `node -e`, `approval.py`) run without the Claude token (`noenv`) |
| Remaining limits on secrets | Commands an agent runs itself through Bash still inherit the Claude token (`claude` needs it). Outbound network from the pod is not filtered yet (an agent could send data out) |
| Missing a scenario of the spec (`--change`) | The scenario gate at REVIEW: every scenario ID of the assigned tasks must have a `describe`/`it`/`test` in `test/public` whose name starts with that ID; if one is missing, no approval, and test-writer must add it |

The procedure for the main session is in the skill `.claude/skills/dispatch-agents/SKILL.md`.

**Agent areas** (code, public / e2e / private tests, package names, test-file pattern) are defined once, in
`.claude/harness.json`. `run.sh` reads it right after the clone (`SRC_RE` = `pod.codeWritable`, `TEST_RE` =
`pod.testWritable`; on an error it FAILS), `collect.sh` checks the branch again against `pod.agentAreas` of the config at `base_sha`
(`git show <base_sha>:.claude/harness.json | harness_config.py … --config -`, i.e. exactly the version the pod used, not the
working tree of this machine; if it cannot be read: FAILED, no push), `dispatch.sh` takes the hidden test areas
and the reproduction-test regex from it (`python3 .specify/scripts/harness_config.py get <key> --regex|--list`).
Changing the folder layout = edit that file + the prose in `CLAUDE.md` and the agent prompts.

| File | What it does |
|---|---|
| `run.sh` | The script that runs in the pod (ConfigMap `agent-script`, updated by `dispatch.sh`) |
| `job-template.yaml` | Template of one Job; `dispatch.sh` fills in `JOB_ID`, `BASE_BRANCH`, `MODE`, the deadline. Set `REVIEW_ROUNDS`, `MUTATION_MIN` here |
| `dispatch.sh` | Creates the task ConfigMap + Job, follows the log into `logs/`, calls `collect.sh`, runs the hidden tests, prints `PRIVATE` and `RESULT` |
| `collect.sh` | On this machine: takes the job's artifact from the log, checks it (as data only), pushes the branch (no force), opens the PR with `gh` |
| `watch-pr.sh` | Waits for the PR's checks, prints the logs of the failed steps on failure |
| `tasks/EXAMPLE.md` | Sample task file |

## Why each step runs `--agent <role>`
The pod clones the repo, so it has `.claude/` too (guard, hooks). A plain `claude -p` counts as the main session and is blocked from editing
`src/`, `test/`. With `--agent <role>`, the hook gets the matching `agent_type`: `test-writer` can only edit `test/public`,
`code-writer` can only edit `src/`, planners/reviewers can write nothing. After each step, `run.sh` checks again with the
per-role allow-list (against the SHA of the commit before that step) before going on, so that the agent cannot get around it.
Each step is a new session: the roles share only files (plan, commits), no conversation context.

## One-time setup
```bash
claude setup-token                       # copy the value sk-ant-oat...
kind create cluster --name claude-demo
# Claude token only: the pod does not push or open PRs (collect.sh does that on this machine, with your gh)
kubectl create secret generic agent-secrets \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN='<sk-ant-oat...>'
# This repo is PUBLIC: do NOT set GH_READ_TOKEN (the pod clones anonymously). Add it only if the repo becomes private:
#   --from-literal=GH_READ_TOKEN='<github_pat_...>'
# That token is also in the container's /proc/1/environ (agents can read it), so use only a fine-grained token, for THIS repo ONLY,
# with ONLY the permission "Contents: Read-only", nothing else.
security find-certificate -c MWG -p /Library/Keychains/System.keychain > mwg-ca.pem
kubectl create configmap mwg-ca --from-file=mwg-ca.crt=mwg-ca.pem
```
The PR's CI runs on GitHub's cloud runner (`.github/workflows/ci.yml`); no runner needs to be installed in kind.

**If you created `agent-secrets` with `GH_TOKEN` earlier: remove it from the Secret** (`envFrom` loads every key, the agents would see the write token).
With `GH_TOKEN` in the pod, `run.sh` FAILS at the very start (not just a warning: `unset` cannot remove the variable from `/proc/1/environ`):
```bash
kubectl patch secret agent-secrets --type=json -p='[{"op": "remove", "path": "/data/GH_TOKEN"}]'
```
This machine needs a logged-in `gh` (`gh auth login`) for `collect.sh`, the hidden tests and `watch-pr.sh`.

## Usage
```bash
# preview the manifests, create nothing in the cluster
bash k8s/agents/dispatch.sh example-task k8s/agents/tasks/EXAMPLE.md --title "<PR title>" --dry-run

# real run — the base branch must be pushed: the pod clones from origin. dispatch.sh waits for the pod, then calls collect.sh (opens the PR)
bash k8s/agents/dispatch.sh example-task k8s/agents/tasks/EXAMPLE.md --title "<PR title>"
bash k8s/agents/watch-pr.sh <pr-number>

# --no-wait: open the PR yourself once the job is done (log read with kubectl logs job/agent-<id>); --dry-run: no push, no PR
bash k8s/agents/collect.sh example-task [--dry-run]
```

### Working from a spec (`--change`)
Specs are written by the spec harness (`.claude/CLAUDE.md`), in `specs/changes/NNN-<feature>/` (layout: `specs/changes/.gitkeep`).
```bash
# task generated from the spec ("-"), only T002 and T003 of tasks.md
bash k8s/agents/dispatch.sh example-be - --title "<PR title>" \
  --change 001-example-feature --tasks T002,T003 --dry-run
# or a hand-written task file + the "## Spec" section appended by run.sh
bash k8s/agents/dispatch.sh example-be k8s/agents/tasks/example-be.md --title "..." --change 001-example-feature
```
- `dispatch.sh` packs the whole `specs/` of this machine (except `archive/`) into the ConfigMap `task-<id>`: an **uncommitted spec works too**.
  In the pod, a file already on the base branch keeps the branch's version; uncommitted files are added to `.git/info/exclude`
  so they do not get into the PR.
- `run.sh` appends a `## Spec` section to the task: the change's path, the assigned task lines, the list of scenario IDs, which files the CODE
  roles read (`spec.md` requirements + ADRs + Data Model, `plan.md`, `tasks.md`) and the TEST roles read (scenarios, Edge Cases, NFR
  Verification, `checklists/edge-cases.md`, `## Test Strategy`). Every agent, the arbiter included, gets this section.
- An agent that finds the spec wrong or incomplete writes `SPEC_PROBLEM: ...`; these lines are collected into the "Spec" section of the PR, to go back to the spec harness.

### Stale hidden tests
A change with `MODIFIED` / `REMOVED` requirements makes the old hidden tests of those requirements wrong (`dispatch.sh` would report
`PRIVATE: FAIL` wrongly). When the plan is approved, `approval.py approve --gate plan` prints the number of affected files. The user runs, in
their own terminal (agents cannot run it: `guard.mjs` blocks every command naming the script):
```bash
python3 .specify/scripts/private_tests.py stale --change 004-example          # table removed / modified / mixed / unaffected
python3 .specify/scripts/private_tests.py quarantine --change 004-example --kind removed   # asks y/N; --kind modified|all|mixed
python3 .specify/scripts/private_tests.py restore --change 004-example        # moves back from the MANIFEST, never overwrites
```
`--kind all` = removed + modified, **not** the mixed files (files holding scenarios of several requirements, including requirements
the change does not touch): split them by hand per requirement, or use `--kind mixed` if losing the untouched part is acceptable (the command prints a warning
with those IDs before the y/N question; the `stale` table has a hint line about it).
Then open `claude --agent private-test-writer` to write new tests for the ADDED / MODIFIED requirements (one
file `<REQ-ID>.test.ts` per requirement). Quarantined files are in `<package>/test/private/_stale/<change>/` with `MANIFEST.txt`;
`run_private` of `dispatch.sh` does not copy the `_stale/` folder.

### Fixing a bug (`--bug`)
Steps a–e of the bug flow (skill `bug-fix-flow`: classify, `report.md`, reproduction test, investigate, root-cause approval) are still
done interactively on the local machine. Once the user has approved the root cause in their terminal (`approval.py` gate `root-cause`, which includes
the reproduction test named in the "Reproduction test" section of `report.md`), steps f–g go to the pod:
```bash
python3 .specify/scripts/approval.py verify --bug 20261125-example-bug     # must exit 0
bash k8s/agents/dispatch.sh example-bug - --title "<PR title>" --bug 20261125-example-bug --dry-run
```
- `dispatch.sh` checks `verify --bug`, reads Path / Name / scenario from `report.md`, packs `bugs/<id>/` + the reproduction test into
  `bug.tgz` (ConfigMap `task-<id>`, with `bug.txt`, `repro.txt`, `scenario.txt`). Mode `full` only, never with `--change`.
- Pod: `verify --bug` again → commit `docs: bug record <id>` → PLAN skipped (code plan = the approved Root cause section) → RED: the
  reproduction test must FAIL, scenario gate on the bug's ID → commit `test: reproduce bug <id>` → GREEN → REVIEW (with
  security-reviewer) → `verify --bug` once more → a PR with a "## Bug" section.

## Notes
- Every run (and every CI fix round) counts against the Claude subscription plan's limits.
- Do not set `ANTHROPIC_API_KEY` in the pod: if it is there, Claude Code uses it instead of the subscription token.
- The company proxy (MWG) re-signs HTTPS, so the ConfigMap `mwg-ca` and `NODE_EXTRA_CA_CERTS` are needed.
- The pod is kept 10 minutes after it ends (`ttlSecondsAfterFinished: 600`); the full logs are in `k8s/agents/logs/` (gitignored).
- Two tasks must never change the same file, or their PRs will conflict.
