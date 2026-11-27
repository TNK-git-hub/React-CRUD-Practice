---
name: systematic-debugging
description: Root-cause-first bug workflow - capture the report, reproduce with a failing test, investigate and form hypotheses, discuss the root cause with the user, then fix and loop the tests until green. Use when the user reports a bug, a test fails unexpectedly, behavior is wrong in production, the TDD loop hits its attempt limit, or the user runs /bugfix.
---

# Systematic Debugging (Bug flow)

Based on: obra/superpowers `systematic-debugging` (4 phases, no fix before root cause) + `root-cause-tracing`, and `verification-before-completion`.

## The iron law

**No fix without a confirmed root cause.** Guess-and-patch creates new bugs. Symptom fixes are failures.

## Output

```
context/bugs/<YYYYMMDD>-<slug>/
├── status.json         # from ai-dev-workflow/templates/status-bug.json
├── STATUS.md           # from ai-dev-workflow/templates/STATUS-bug.md
├── 01-report.md        # templates/bug-report.md
├── 02-investigation.md # templates/investigation.md (evidence + hypotheses + agreed root cause)
└── 03-fix.md           # what changed, tests, verification
```

Use the **bug** templates only. Do not copy the feature Gate 1/2 checklist into a bug folder.

When creating the bug folder: set `branch` to `fix/<id>`, create or check out that branch if git is available, and claim `context/ACTIVE.json`.

## Phase 1: Capture and reproduce

1. Fill `01-report.md` with the user: expected vs actual behavior, exact steps, environment, error messages/stack traces/logs, frequency, when it started, recent changes. Ask only for what is missing, and batch those questions in one message.
2. Read the error messages and stack traces completely. Note file:line.
3. Check recent changes: `git log -p --since=...` on suspected files, recent deploys, dependency bumps.
4. **Reproduce with an automated failing test** at the lowest level that shows the bug (unit if possible). Place it per `structure.md`. Run it and confirm it fails for the reported reason.
   - If you cannot reproduce: gather more data (add temporary logging at component boundaries, ask the user for inputs/logs). Do not proceed to fixing.

## Phase 2: Investigate (delegate to `bug-investigator` subagent if available)

- **Trace backward** from the symptom: where does the bad value come from? Who called this with it? Keep going up the call chain until you reach the original trigger.
- **Compare with working code**: find similar code that works; list every difference.
- In multi-component systems, instrument each boundary (input/output of each layer) once to locate the failing layer before reading deeper.
- Record evidence in `02-investigation.md`.

## Phase 3: Hypotheses and discussion with the user

1. Write 1-3 ranked hypotheses: statement, supporting evidence, contradicting evidence, how to confirm.
2. Test the top hypothesis with the **smallest possible experiment** (one variable at a time).
3. **Discuss with the user** before fixing: present the confirmed (or most likely) root cause, the evidence, the proposed fix, and its blast radius (what else could be affected). Offer alternatives if there's a trade-off (quick fix vs proper fix). Wait for agreement.
4. Record the agreed root cause and decision in `02-investigation.md`. Set `gates.rootCause` to `approved` with `summary` and `at` in `status.json`, and set `diffBase` to current `HEAD` if it is null.

## Phase 4: Fix and loop

```
attempts = 0
FIX     One change at the root cause in the shared code. Grep callers; do not patch each caller
        and do not add a wrapper or a dependency for the fix.
        Delegate the code change to `tdd-implementer` when it can be spawned, with the
        reproduction test as the failing TC. Otherwise set mode to "inline".
TEST    Run the reproduction test -> must pass. Append one-line evidence (kind "bug").
        Run the full suite once, after the last edit that makes the reproduction test pass.
        Do not paste the log.
        If anything fails: attempts += 1; set loops.bugFixAttempts in status.json.
        If the hypothesis is disproved, record why in 02-investigation.md, then
        ask the user to continue in a **new chat** (see Session reset below).
        If attempts == 3: STOP. Three failed fixes signal an architectural problem.
        Write the three attempts and options into 02-investigation.md / STATUS.md,
        then ask the user to continue in a **new chat**.
REVIEW  Run code-review (incl. security-review) on the fix diff.
DELIVER Run deliver-pr (PR + optional CI), then verification-before-completion.
DONE    Fill 03-fix.md (root cause, fix, files, tests added, verification output), update STATUS.md.
```

Also search for the **same bug pattern elsewhere** in the codebase and report other occurrences.

## Session reset (keep disk, drop chat noise)

Start a **new chat** when any of these happen:
- The agreed root cause or fix direction is wrong and must change
- `loops.bugFixAttempts` reaches 3
- The user explicitly wants a clean context after failed attempts

Keep on disk: `01-report.md`, `02-investigation.md` (including failed attempts and why), the reproduction test, `status.json`, `STATUS.md`, `ACTIVE.json`.

In the new chat, resume with `/bugfix` or `/status continue <bug-id>`. Load only those artifacts and the current reproduction test. Do **not** paste prior chat logs, full command output, or reverted patches into the new session.

Do **not** open a new chat after attempt 1 or 2 if the same root cause still stands and you only need the latest failure signal.

## Red flags (stop and go back to Phase 1)

- "Let me just try changing X and see."
- Proposing a fix before tracing the data flow.
- Adding a fix on top of a failed fix.
- Changing or deleting the reproduction test to make it pass.
- "It's probably a timing issue" with no evidence - replace sleeps with condition-based waits after proving the race.
