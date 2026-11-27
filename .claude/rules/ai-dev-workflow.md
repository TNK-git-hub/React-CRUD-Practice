# AI Dev Workflow

This project uses a structured AI workflow. Skills live in `.claude/skills/`, subagents in `.claude/agents/`, commands in `.claude/commands/`.

## Flow

```
/onboard (once) -> /feature: requirement-analysis -> [GATE 1]
  -> plan -> [GATE 2] -> BUILD -> REVIEW -> DELIVER (PR) -> DONE
/bugfix: systematic-debugging -> root cause gate -> fix -> review -> deliver
```

- The `ai-dev-workflow` skill is the orchestrator: use it whenever starting, resuming, or transitioning phases.
- Stop for user approval at Gate 1, Gate 2, risk gate (migration/API/dependency/authz/secrets), loop limits, or root-cause agreement.
- Loop limits: 5 TDD attempts per task, 3 review rounds, 3 failed bug-fix attempts. Escalate to the user when exceeded.
- After a wrong root cause or 3 failed bug-fix attempts: keep artifacts on disk, continue in a **new chat** from `context/bugs/<id>/`. Do not carry failed-attempt logs into the new session.

## Context folder

- `context/project/` holds tech stack, structure, conventions, commands, and `ui-source.md` (`figma`, `codebase`, or `none`). Create it with `/onboard` if it is missing. Pass a file onward only when that step uses it.
- `context/features/<YYYYMMDD>-<slug>/` - STATUS, discussion, spec, plan, test cases, implementation log, review.
- `context/bugs/<YYYYMMDD>-<slug>/` - bug STATUS templates, report, investigation, fix (no feature Gate 1/2).
- `context/workflow-version.json` - installed pack version (written by the installer).
- `context/metrics/events.jsonl` - append-only phase/gate/loop events (no PII).
- Features use branch `feat/<id>`; bugs use `fix/<id>`. Stay on that branch while working.
- `context/ACTIVE.json` names the single item in progress. If several are unfinished, commands require an id.
- Each feature and bug has `status.json` (authority: phase, gates, loop counters, evidence) and `STATUS.md` (human mirror).
- Tasks run one at a time. Do not parallelize implementation.
- Read-only subagents use Read, Grep, and Glob only. If a review cannot stay read-only, record `isolation: degraded`.
- Keep both status files current after every step so any developer or agent can resume.

## Non-negotiables

1. For `workType: code`, no production code without a failing test first (TDD). For docs/infra/config, use planned checks instead of fake tests.
2. Never weaken, skip, or delete tests to make them pass.
3. No bug fix without a confirmed root cause discussed with the user.
4. New files go where `context/project/structure.md` says.
5. No secrets or real PII in code, tests, fixtures, or logs.
6. No completion claims without an exit code. Evidence summaries are one line. Do not paste command logs into chat or `status.json`.
7. Batch clarification questions that do not depend on each other. Ask the next question only when it depends on the answer. Prefer a recommended option.
8. Write artifacts in English; talk to the user in their language.
9. Smallest change that meets the approved spec. Reuse this repo, the platform, and installed dependencies before new code. `conventions.md` wins on conflict. Do not cut trust-boundary validation, data-loss handling, security, or accessibility.
10. Visible UI follows `context/project/ui-source.md`. Read the named Figma node or reference file before writing markup. MCP-generated code is a reference. If that source cannot be read, stop and ask. A feature with no UI skips this.
