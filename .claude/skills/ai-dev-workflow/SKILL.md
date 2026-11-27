---
name: ai-dev-workflow
description: Orchestrates the end-to-end AI software development workflow (onboarding -> requirement analysis -> planning -> TDD -> review, plus bug fixing). Use when the user starts a new feature, asks "what's next", resumes work on a feature/bug, or invokes /feature, /bugfix, or /status.
---

# AI Dev Workflow (Orchestrator)

You drive a feature from raw requirement to reviewed, tested code. Each phase has a dedicated skill. This skill decides **which phase runs next**, enforces **human gates**, and keeps **state on disk** so work can be resumed by any developer or agent.

## Phases

```
Phase 0  ONBOARD    project-onboarding            (once per project)
Phase 1  REQUIRE    requirement-analysis           -> GATE 1: user approves spec
Phase 2  PLAN       implementation-planning        -> GATE 2: user approves plan
Phase 3  BUILD      tdd-loop / work-type loop      (autonomous; risk stop if needed)
Phase 4  REVIEW     code-review + security-review  (autonomous, loops back to BUILD)
Phase 5  DELIVER    deliver-pr                     (PR + optional CI)
Phase 6  DONE       verification-before-completion
Side     BUGFIX     systematic-debugging           (any time a bug appears)
```

## Rules

1. **Phase 0 first.** If `context/project/` is missing or empty, run `project-onboarding` before anything else. Every later phase reads it.
2. **Human gates.** Stop for approval after the spec (Gate 1) and the plan (Gate 2). Also stop for a **risk gate** during BUILD if a task introduces a migration/DDL, public API break, new runtime dependency, authz change, or secret/config change that was not already approved in the plan. Between gates, proceed automatically except when a loop limit is hit.
3. **Automatic transitions.** When a phase's exit criteria are met, update `STATUS.md` and immediately start the next phase. Do not ask "should I continue?".
4. **State on disk.** Every feature lives in `context/features/<YYYYMMDD>-<slug>/`. Every bug lives in `context/bugs/<YYYYMMDD>-<slug>/`. Write both human STATUS and machine `status.json`. Features use `templates/STATUS.md` + `templates/status.json`. Bugs use `templates/STATUS-bug.md` (saved as `STATUS.md`) + `templates/status-bug.json` (saved as `status.json`). If they disagree, **trust `status.json`**. Point `context/ACTIVE.json` (`templates/ACTIVE.json`) at the item you are working on.
5. **One item, one branch.** Features use `feat/<id>`. Bugs use `fix/<id>`. Create or check out that branch when the folder is created (if the repo is a git work tree). Store the name in `status.json.branch`. Before BUILD or a bug FIX, refuse to continue if `git branch --show-current` is not that branch (ask the user to switch). Do not force-push.
6. **Loop limits** (escalate to the user when exceeded; never loop silently forever):
   | Loop | Limit |
   |---|---|
   | TDD red/green attempts per task | 5 |
   | Review -> fix rounds | 3 |
   | Bug fix attempts with no progress | 3 (then question the architecture) |
7. **Traceability.** Requirement (`AC-xx`) -> test case (`TC-xx`) -> test code -> task (`T-xx`). Never drop the IDs.
8. **Never cheat a loop.** Do not weaken, skip, or delete tests to make them pass. Do not mark something done without fresh evidence (see `verification-before-completion`).
9. **Language.** Write artifacts in English unless `context/project/conventions.md` says otherwise. Talk to the user in the user's language.
10. **Smallest complete change.** Reuse this repo, the platform, and installed dependencies before writing new code. The approved spec and `conventions.md` win over a smaller option. Do not cut trust-boundary validation, data-loss handling, security, or accessibility. Do not drop a failing test to keep the diff small.

## State authority

`status.json` is the only source for phase, gates, hashes, loop counters, `branch`, `diffBase`, and evidence. Update it on every transition, then mirror the same facts into `STATUS.md`.

Features use `gates.spec` / `gates.plan` / optional `gates.risk`. Bugs use `gates.rootCause` only (no Gate 1/2).

`workType` is set at plan time: `code` (default), `docs`, `infra`, or `config`. It chooses the BUILD verification lane (see implementation-planning and verification-before-completion).

### Metrics

Append one JSON line to `context/metrics/events.jsonl` on every phase enter/exit, gate result, loop increment, and verify fail. No PII, secrets, or command logs—only ids, phase, counts, and timestamps.

```json
{"at":"2026-10-23T04:00:00Z","id":"20261023-checkout","event":"phase_enter","phase":"BUILD"}
```

### Hashes

```bash
shasum -a 256 02-spec.md | awk '{print $1}'
cat 03-plan.md 04-test-cases.md | shasum -a 256 | awk '{print $1}'
```

On Gate 1 approval, set `gates.spec` to `approved` with that sha256 and an ISO timestamp. On Gate 2 approval, do the same for `gates.plan`. A verbal "LGTM" without these fields is not approval.

Before BUILD or any later phase, recompute both hashes. If either file changed after approval, set that gate back to `pending`, stop, and ask the user to approve again. Do not start or continue BUILD on a drifted hash.

When entering BUILD, set `diffBase` to `git rev-parse HEAD` (or the empty tree if there is no commit yet). Review uses only `git diff <diffBase>` limited to files named in `03-plan.md` and `05-implementation-log.md`.

### Active item

Write `context/ACTIVE.json` when a feature or bug starts or is resumed. If more than one item has `phase` other than `DONE`, `/status continue` and `/implement` require an explicit id. Do not guess.

### Evidence

Append one object per verifying run. `summary` is one line (`4 passed, 0 failed`). Do not write command logs into `status.json` or the chat.

Use the tool result already in the turn. Do not run the same command twice to confirm it. A task's evidence is that task's tests. The full suite, lint, typecheck, and build run once at the end of BUILD. Before DONE, run the suite again only if code changed after that suite evidence.

```json
{
  "at": "2026-10-23T04:00:00Z",
  "kind": "task",
  "id": "T-01",
  "command": "npm test -- tests/checkout.test.ts",
  "cwd": ".",
  "exitCode": 0,
  "summary": "4 passed, 0 failed"
}
```

`kind` is `task`, `suite`, `lint`, `typecheck`, `build`, or `bug`. A task is done only when its evidence `exitCode` is 0 and the summary matches the output you just read. Evidence is stale if any file in that task changed after `at`.

### Subagent fallback

Try the named subagent first (`mode: "subagent"`). If it cannot be spawned, do the same checklist yourself and set `mode: "inline"`. Read-only reviewers that can run write commands, or that share the implementer's chat, are not independent: set `isolation` to `"degraded"` on that review round in `06-review.md` and say so once. Do not launch a second review pass in the same round.

### Parallelism

Do not run implementation tasks in parallel. Ignore any `[P]` marks in older plans. One `tdd-implementer` at a time, then verify, then the next task.

## Resuming

When asked to continue or for status:
1. Read `context/ACTIVE.json`. List every `status.json` whose `phase` is not `DONE`.
2. If the user named an id, claim it in `ACTIVE.json`. If they said "continue" and exactly one non-DONE item exists, claim that one. If several exist and they did not name an id, list them and stop.
3. Recompute gate hashes before doing anything in BUILD or later. Report phase, gates, loop counters, last evidence line, and `Next action` from `STATUS.md` in 3-5 lines.
4. Continue from `Next action`.

## Phase exit criteria

| Phase | Exit when |
|---|---|
| ONBOARD | `context/project/{tech-stack,structure,conventions,commands,ui-source}.md` exist and the user confirmed them |
| REQUIRE | `02-spec.md` has no open `[NEEDS CLARIFICATION]` markers and `gates.spec.state` is `approved` with a matching sha256 |
| PLAN | `03-plan.md` and `04-test-cases.md` exist, every AC maps to at least one TC, `gates.plan` approved with a matching sha256 |
| BUILD | every task checked with lane-appropriate evidence; for `code`, suite/lint/typecheck green; `diffBase` set; risk gate approved or `n/a` |
| REVIEW | `06-review.md` has zero open Critical/Major findings, and the diff was limited to `diffBase` plus plan/log files |
| DELIVER | `prUrl` set, or user approved local skip; CI evidence green when CI exists |
| DONE | verification lane evidence in `status.json` is fresh, summary given to the user |

## Final summary to the user (DONE)

- What was built (link to spec) and `workType`
- Verification evidence (command + pass count, or docs/infra check)
- Review result (findings fixed / remaining minors)
- PR URL if any
- Files created/changed grouped by folder
- Follow-ups or known limitations
