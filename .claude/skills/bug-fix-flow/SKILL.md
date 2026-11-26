---
name: bug-fix-flow
description: Use when the user reports a bug, a test fails unexpectedly, or the app behaves wrongly. Interactive flow for the main session (orchestrator) - classify against the spec scenarios, write bugs/<id>/report.md, reproduce with a failing test (test-writer), investigate (bug-investigator), stop for the user to approve the root cause, then fix at the source (code-writer, at most 3 failed attempts) and review (code-reviewer + test-critic + security-reviewer). No fix before the user approves a root cause.
---
# Bug fix flow (interactive)

You are the main session: you orchestrate, you do not edit `src/` or `test/` (root `CLAUDE.md`, `guard.mjs`).
You write the record in `bugs/<id>/`; the agents write code and tests.
**Iron law: no fix until the user has approved a root cause.**

Templates: `.claude/skills/bug-fix-flow/templates/` (`report.md`, `investigation.md`, `fix.md`).
Run one test: `pnpm --filter <backend|frontend> test -t=<scenario ID>` (the only form `guard.mjs` allows; the
`test` script already points at `test/public`, so a path argument does not narrow the run, `-t=` does).

## a) Classify
Find the scenario the wrong behavior breaks: `grep -rn` the behavior's words and the IDs in `specs/capabilities/` and
`specs/changes/`. Read the scenario's Given / When / Then.
- A scenario says what should happen and the app does otherwise → a bug: go on with its ID.
- No scenario covers it → a spec gap, not a bug. STOP: tell the user, suggest the spec harness (`/speckit-specify`)
  to add the scenario. Never invent a scenario or an expected value.

## b) Report
Create `bugs/<YYYYMMDD>-<slug>/report.md` from the template (`<YYYYMMDD>` = today, `<slug>` = kebab-case,
e.g. `20261125-price-filter-ignores-max`): expected (from the scenario), actual, steps, environment, error / log,
violated scenario ID. Ask the user for what is missing, all independent questions in one turn.

## c) RED: reproduce
Give `test-writer`: `report.md`, the scenario ID, its Given / When / Then. Tell it: one test in
`<package>/test/public/`, name starts with the scenario ID, expected value verbatim from the spec; the test MUST
fail now because of the bug; do not make it pass, report the failing output.
Then run it yourself: `pnpm --filter <package> test -t=<scenario ID>`. Check that it fails on the assertion of the
bug (expected vs actual as in `report.md`), not on an import, syntax, type or setup error. Paste the failing lines
into `investigation.md` (Evidence log). Before the investigation, write the test into `report.md`, section
"Reproduction test": `- Path: \`<package>/test/public/<file>.test.ts\`` and `- Name: \`<scenario ID> ...\``.
- Does not fail, or fails for another reason → do not go on: send it back to `test-writer` with the output, or ask
  the user for more information (steps, data, environment). Cannot reproduce → no investigation, no fix.
- Do not commit yet: the record and the test stay uncommitted until the root-cause gate (the Stop hook relies on it,
  see e). They get their own two commits at the start of f.

## d) Investigate
Give `bug-investigator`: `bugs/<id>/report.md`, the failing line of the test, the test's path. It only reads and
runs; it writes nothing. Copy its answer into `investigation.md`: evidence log, call chain, ranked hypotheses
(supporting / contradicting evidence, confirming experiment), most likely root cause, fix direction, impact,
same pattern elsewhere.

## e) GATE: root cause
Show the user: the root cause, the evidence (`file:line`, test output), the fix direction, the impact. Then STOP and
wait. The Stop hook (`stop-gate.sh`) skips `pnpm test` by itself only while the record is complete and waits for
the root-cause approval: `bugs/<id>/` has uncommitted changes, `report.md`, the Root cause section of
`investigation.md` and the reproduction test are there, and `approval.py verify --bug <id>` exits 1 (gate missing or
changed). An incomplete record or any error (exit 2) still runs the tests. Do not fix.
- Approval is the user's, in their own terminal (you cannot run it; `guard.mjs` blocks it): ask the user to run
  `python3 .specify/scripts/approval.py approve --bug <id> --gate root-cause --summary "<one line>"`. It hashes
  `report.md`, the "Root cause" section of `investigation.md` and the reproduction test (the "Reproduction test"
  Path of `report.md`) into `bugs/<id>/approval.json`: approving the root cause approves the reproduction test too,
  so the test cannot change after it without a new approval. Never write an approval line yourself.
- Rejected → write the hypothesis as rejected, with the user's reason; back to d) with the new information, or (when
  this chat already holds a long dead-end) suggest going on in a new chat (see "New chat").

## f) GREEN: fix at the source
First run `python3 .specify/scripts/approval.py verify --bug <id>`. Not exit 0 (not approved, or `report.md` / the Root
cause section / the reproduction test changed since) → STOP and tell the user; no fix without a matching approval.
Then, before any fix, two commits of their own (the shape the pod's bug mode makes; `red_check.py` checks it):
1. `git add bugs/<id>/` → `git commit -m "docs: bug record <id>"` (the record only, with `approval.json` and `.approved/`);
2. `git add <reproduction test>` → `git commit -m "test: reproduce bug <id>"` (the test only: the RED commit).
Give `code-writer`: the approved root cause and fix direction from `investigation.md`, the reproduction test. Tell it:
one change at the source, in the shared code (no patch in each caller, no wrapper, no new dependency); the
reproduction test must pass and the rest of `pnpm test` stay green.
After each attempt write `fix.md`: `Attempt <n>: <change> — <result>` (test output, file:line).
- Attempt fails (reproduction test still red, or another test turns red) → back to d) with the new evidence before
  the next attempt; a new root cause needs gate e) again.
- 3rd failed attempt → STOP. Write the 3 attempts and the options (rethink the design, a bigger change, leave it)
  in `investigation.md`. Tell the user it may be an architecture problem and suggest a new chat (see "New chat").

## g) Review
`code-reviewer` (the diff), `test-critic` (the reproduction test) and `security-reviewer` (the diff, Principle II) as in
the feature flow; the three only read, so they can run in parallel. Findings → back to the
writer that owns the file (`code-writer` for code, `test-writer` for the test), never one for the other.
Look for the same mistake elsewhere (the investigator's list + a `grep` of the pattern): list each `file:line` in
`fix.md`, "Same pattern elsewhere". Fixing them is a new decision for the user, not part of this fix.

## h) Done
Only with evidence, following skill `verification-before-completion`: `pnpm lint`, `pnpm --filter frontend typecheck`,
`pnpm test` just ran and passed, and the reproduction test passes (root `CLAUDE.md`, "Thế nào là xong"). Paste the
outputs into `fix.md`, Verification.
Before the PR: `python3 .specify/scripts/red_check.py --base <base branch>` must PASS (record, then the failing
reproduction test, then the fix; CI job `red-check` checks it again).

## Hand off to a pod
Steps a–e stay interactive. Once `python3 .specify/scripts/approval.py verify --bug <id>` exits 0, steps f–g can run in
a pod instead (skill dispatch-agents): `bash k8s/agents/dispatch.sh <job-id> - --title "<title>" --bug <id>`. The pod
gets `bugs/<id>/` and the reproduction test, checks the approval again, commits the record, checks that the test
fails, then runs GREEN and REVIEW and opens a PR. Step h (verification) is the PR's CI and your own check of it.

## New chat
`bugs/<id>/` is the whole record: `report.md`, `investigation.md`, `fix.md`. To go on in a new chat, the user opens one
with only: "Continue the bug in `bugs/<id>/` with skill bug-fix-flow" (no old chat log). There, read the three files,
find the step from them (no approved root cause → d / e; approved → f), and go on.

## Rules
- Never edit, delete or skip (`.skip`, `.todo`, `.only`, a weaker assertion) the reproduction test to make it pass.
  Test wrong? Show the user why, then back to `test-writer`.
- Never edit `specs/`. Scenario wrong or missing: write `SPEC_PROBLEM: <file> <section> <reason>` and go back to the
  spec harness.
- `bug-investigator` never writes the fix and never edits a file; `code-writer` starts only after gate e).
- No new scenario ID, no expected value that is not in the spec.
