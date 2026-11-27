---
description: Bug flow - reproduce, find root cause with the user, fix, loop tests until green
argument-hint: <bug description>
---

Investigate and fix a bug.

Bug: $ARGUMENTS

(If empty, ask me for the description.)

Use the `systematic-debugging` skill:
1. Create `context/bugs/<YYYYMMDD>-<slug>/` from the **bug** templates (`status-bug.json` → `status.json`, `STATUS-bug.md` → `STATUS.md`), set `branch` to `fix/<id>`, create or check out that branch, and claim `context/ACTIVE.json`. Capture the report with me, batching questions that do not depend on each other.
2. Reproduce with a failing automated test and record that failure as evidence.
3. Delegate investigation to the read-only `bug-investigator` subagent (inline + `mode: inline` if it cannot be spawned). Present the evidence and ranked hypotheses.
4. Discuss the root cause and fix options with me, wait for my agreement, then set `gates.rootCause` to `approved` in `status.json`.
5. Fix via `tdd-implementer` when possible. Run the reproduction test on each attempt, and the full suite once after it passes. Increment `loops.bugFixAttempts` on each failed fix (max 3, then escalate).
6. If the root cause changes or attempts hit 3: write the outcome to disk, then ask me to continue in a **new chat** from `context/bugs/<id>/` (do not carry failed-attempt chat logs).
7. Run `/review` on the fix, then `/deliver`, record `03-fix.md`, and update `status.json` plus `STATUS.md`.
