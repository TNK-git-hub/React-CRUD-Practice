---
name: verification-before-completion
description: Requires fresh, command-based evidence before claiming any work is done, fixed, or passing. Use before marking a task, review round, feature, or bug as complete, and before telling the user something works.
---

# Verification Before Completion

Based on: obra/superpowers `verification-before-completion`.

## Rule

**Evidence before claims.** Never say "done", "fixed", "tests pass", or "should work" without having run the verifying command **in this session, after the last code change**, and read its output.

## Gate

Before any completion claim:
1. Identify the command that proves the claim (from `context/project/commands.md`).
2. If this turn already has that command's tool output, use it. Otherwise run it once.
3. Read exit code and pass/fail counts. Do not paste the log into the chat or into `status.json`.
4. Append an evidence object (`command`, `exitCode`, one-line `summary`, `at`) and only then state the claim (e.g. "`npm test` -> exit 0, 148 passed, 0 failed").

| Claim | Required evidence |
|---|---|
| Task done (`code`) | That task's tests pass (one-line evidence) |
| Task done (non-code) | Planned `CK-xx` check passes (one-line evidence) |
| Feature done (`code`) | Fresh suite + lint + typecheck + build green; review clean; DELIVER done or skipped with user OK |
| Feature done (`docs`/`infra`/`config`) | Final plan checks green; review clean; DELIVER done or skipped with user OK |
| Bug fixed | Reproduction test passes; full suite green once after the last edit |
| Requirement met | Each AC maps to a passing TC or CK |

## Forbidden

- "Should pass now", "probably fixed", "looks good" without a run.
- Trusting a prose "tests passed" when the tool result has no exit code. Do not re-run a command whose tool result is already in this turn.
- Treating `STATUS.md` as proof when `status.json` has no matching evidence object.
- Claiming success from a partial run or a previous run before the last edit.

If verification fails, report the actual state honestly and continue the relevant loop.
