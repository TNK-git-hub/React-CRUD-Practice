---
name: dispatch-agents
description: Use when the user wants to hand a feature/bug to agents that run headless in a pod (kind) so they change the code and run CI, get their branch pushed and the PR opened from this machine (collect.sh), then watch the GitHub Actions results. Splits the work into tasks, calls k8s/agents/dispatch.sh, watches with k8s/agents/watch-pr.sh, re-dispatches on failure, sums up the results.
---
# Dispatching work to agents in a pod

You are the main session (the orchestrator). You do not edit code or tests yourself: the agents in the pod do that.
Mode `full` (default): the pod runs, in order, planner → test-writer (tests must fail first) → code-writer → mutation + review (code-reviewer, test-critic, security-reviewer).
Mode `code-only`: only code-writer, for small jobs that need no new tests (style, text changes...).
Infrastructure details and the anti-reward-hacking gates: `k8s/agents/README.md`.

## 0. Check first (stop and tell the user if anything fails)
- `kubectl get nodes` works (the kind cluster is up).
- The base branch (the "Base branch" line of `CLAUDE.md`, or `--base`) is pushed and has no unpushed local commits: the pod clones from origin.
- **Do not pass `--base` yourself**: `dispatch.sh` reads the base branch from the "Base branch" line of `CLAUDE.md`. Pass `--base`
  only when the user asks for it explicitly; then `dispatch.sh` prints `WARNING: --base ... differs ...` when it differs from `CLAUDE.md`: report that line to the user.
- Ask the user to confirm the task list before dispatching: every run uses subscription quota and opens a real PR.

## 1. Split the work
- Read the related code (you may ask `code-planner`) to know which files need changing.
- Each task changes **its own group of files**. Two tasks must never change the same file (the PRs would conflict). If they cannot be split, merge them into one task.
- A task must be self-contained: the agents in the pod do not see this conversation.

## 1b. With a spec from the spec harness (`specs/changes/NNN-<feature>/`)
- Do not copy the spec into the task file: use `--change NNN-<feature>` (and `--tasks T00x,...` to pick tasks of `tasks.md`).
  `run.sh` appends a `## Spec` section (the assigned tasks, scenario IDs, the files each role must read) to the task of every agent.
- Split the work by the task IDs of `tasks.md`: only `[P]` tasks that touch different files may be dispatched in parallel.
- The task file may be `-` (generated) or a hand-written file that only adds constraints (Files you may change, Out of scope).
- Do not edit `specs/`. If the PR has a "Spec problems" section, tell the user to go back to the spec harness; do not fix the spec yourself.

## 1c. A bug whose root cause is approved (`bugs/<id>/`, skill bug-fix-flow)
- Dispatch only when `python3 .specify/scripts/approval.py verify --bug <id>` exits 0 (the user approved the root cause and the
  reproduction test in their terminal). Not exit 0: stop and tell the user; you cannot approve it yourself.
- `bash k8s/agents/dispatch.sh <job-id> - --title "<PR title>" --bug <id>`: the task is generated from the bug record. Mode `full` only,
  never with `--change` / `--tasks`. The pod does steps f–g (GREEN + REVIEW) and does not touch `bugs/` or the reproduction test.
- `RESULT: FAILED reason=security review found a spec problem (permissions) ...`: the permissions in the spec are wrong or missing; tell the
  user to go back to the spec harness.

## 2. Write the task file
Create `k8s/agents/tasks/<job-id>.md` from the sample `k8s/agents/tasks/EXAMPLE.md`, with:
- **Goal**: the behaviour wanted, stated as an observable result.
- **Behaviors to test** (mode full): input → expected output, each line must fail on the current code. For a bug: the exact input that triggers it and the correct output.
- **Files you may change**: concrete paths in `frontend/src`, `backend/src`, `frontend/public` (the test-writer picks its own files in `test/public`).
- **Out of scope**: what must not change.
- **Done when**: the done criteria, always including "`pnpm ci:local` prints CI PASSED".

`<job-id>`: lower-case letters, digits, `-`, short and describing the job (e.g. `example-task`). PR title: English, imperative, short.

## 3. Dispatch
- Preview: `bash k8s/agents/dispatch.sh <job-id> k8s/agents/tasks/<job-id>.md --title "<PR title>" [--mode code-only] --dry-run`
- Real run: drop `--dry-run`. With several tasks, run them in parallel (one background Bash command per task), then wait for all of them. Mode full takes about 20–60 minutes per task.
- Read the last line: `RESULT: SUCCESS pr=<url>` or `RESULT: FAILED reason=...`. On failure read the log in `k8s/agents/logs/<job-id>-*.log` (the `==> ... =====` lines show the step it was in, the last `==>` line shows the step that broke).
- `FAILED reason=review not approved ... pr=<url>`: a draft PR was opened with the review report (hidden tests still run on the draft PR). Tell the user; do not dispatch again yourself.
- The `PRIVATE:` line (hidden tests, run on the local machine), of the form
  `PRIVATE: PASS|FAIL (backend: files N, load errors N, tests N fail / N pass, type errors N; frontend: ...)` or `PRIVATE: SKIPPED (<reason>)`:
  - `PASS` (every package: load errors 0, tests 0 fail, type errors 0) → go on to step 4.
  - `SKIPPED` → **not a pass**: tell the user the reason in brackets (no hidden tests yet, the PR branch could not be read, pnpm install failed...). Still do step 4, but do not report the task as passed until the user decides.
  - `FAIL`, even when only `type errors` > 0 → **not a pass**: tell the user, with the log path. **Do not read that log, and do not put its content or test names into a fix task**: showing hidden tests to an agent defeats their purpose (catching code tailored to the public tests).

## 4. Watch GitHub Actions
- For each PR: `bash k8s/agents/watch-pr.sh <pr-url>`.
- `CHECKS: PASS` → done.
- `CHECKS: FAIL` → the log of the failed step is printed above. Write a new fix task (`<job-id>-fix1`) with the original task + the error log + "fix on top of PR <url>", then dispatch it. At most 2 rounds per task.
- `CHECKS: TIMEOUT` → the run is stuck or queued for long on GitHub Actions (see the Actions tab). Tell the user; do not dispatch again.

## 5. Summary for the user
Table: task | mode | PR | dispatch result | hidden tests | GitHub checks | fix rounds | notes. Say clearly which task failed and why.
Do not merge PRs: the user reviews and merges them.

## Never
- Do not edit `run.sh`, `job-template.yaml`, `ci/`, `.github/` to make a task pass (they are harness files; the guard asks the user).
- Do not assign a task that changes test config, and never a task "fix the test to match the code" (in mode full the tests are written by test-writer from the behaviour; the gate allows only `test/public`).
- Do not put secrets or tokens in a task file.
