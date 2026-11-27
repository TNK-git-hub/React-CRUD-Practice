---
name: code-review
description: Rigorous multi-dimension review of the feature's changes - spec compliance, coding conventions, stack best practices, file placement per project structure, test quality - combined with automated linters and the security-review skill. Loops back to TDD until no Critical/Major findings remain. Use automatically after the TDD phase, or when the user runs /review.
---

# Code Review (Phase 4)

Based on: obra/superpowers `requesting-code-review` + `receiving-code-review` (independent reviewer, severity triage, verify feedback before acting) and Google's engineering code review guidelines.

## Scope

Review only this feature. Read `status.json` and use `diffBase`. The file set is every path named in `03-plan.md` and `05-implementation-log.md`.

```bash
git diff <diffBase> -- <those paths>
```

Also include uncommitted changes **only** when they are inside that file set. If other dirty files exist, list them and do not review them unless the user explicitly widens scope. If `diffBase` or the gate hashes are missing or drifted, stop and return to the orchestrator. Do not invent a base branch.

## Process

### 1. Automated checks first (cheap, objective)
If `status.json` already has fresh `suite`, `lint`, `typecheck`, and `build` evidence and no file in the diff changed after `at`, reuse it. Otherwise run the missing commands once. Any failure is a **Major** finding.

On review round 1, run `semgrep`, `gitleaks`, and the dependency audit only if installed. Keep scanner text that names a file in the diff, at most 40 lines. No hits means the brief says `no scanner hits`. Do not attach a full scanner report.

### 2. Independent reviewers (in parallel when subagents are available)
Launch with fresh context. They must not see the implementer's reasoning or earlier test logs.

Round 1 briefs:
- `code-reviewer`: scoped diff, acceptance criteria from `02-spec.md`, matching rows from `04-test-cases.md`, `structure.md`, `conventions.md`, and `ui-source.md` when any task in the diff has a UI source line other than `n/a`.
- `security-reviewer`: scoped diff, the security section of `tech-stack.md`, and the scanner excerpt.

Round 2 and later: only the diff since the previous review round, plus the open finding ids and their one-line text. Do not resend the original feature diff, the spec, or the scanner log.

If a subagent cannot be spawned, do that pass yourself and set `mode` to `inline`. If a reviewer can edit files or shares the implementer's conversation, record `isolation: degraded` and tell the user once. Do not run a second pass in the same round.

### 3. Review dimensions

**A. Spec compliance**
- Every AC implemented; nothing outside scope added (scope creep is a finding).
- Every TC has a real test that asserts the expected result.

**B. Structure and placement** (enforce `structure.md`)
- Every new/changed file is in the correct folder with the correct naming.
- Layering rules respected (no forbidden imports, no business logic in controllers/views, no data access from UI).
- Tests mirror source location per convention. No stray files (debug scripts, `.bak`, commented-out blocks, TODO without ticket).

**C. Conventions** (enforce `conventions.md`)
- Naming, error handling, logging, config access, DI patterns match the project's established style.
- Consistent with neighboring code; no new pattern introduced where one exists.

**D. Stack best practices** (from `tech-stack.md` + official framework guidance)
- Correct framework idioms; no deprecated APIs.
- Resource handling (connections, files, subscriptions closed), async correctness (unawaited promises, race conditions, blocking calls in async code).
- Performance traps: N+1 queries, unbounded loops/queries, missing pagination, needless re-renders, missing indexes for new queries.
- Readability: function size, cyclomatic complexity, duplication (DRY), dead code, magic numbers.

**E. Test quality**
- Tests assert behavior, not implementation; meaningful names; no sleeps/flakiness; mocks only at boundaries.
- Edge and error cases covered; no skipped/disabled tests; no assertions removed.

**F. Necessary code**
- A new dependency, a from-scratch replacement of a component the repo already has, or a new pattern where `conventions.md` already names one, is a Major finding.
- An abstraction, wrapper, or option the spec did not ask for is a Minor finding.
- Do not ask to delete trust-boundary validation, data-loss handling, security, or accessibility to make the diff smaller.

**G. UI source** (enforce `ui-source.md`)
- Skip when mode is `none`, or this diff changes no visible UI.
- `figma`: the screen follows the named node. Pasting MCP-generated code as the production implementation, or restyling chrome the file says comes from the repo, is Major.
- `codebase`: a new button, spacing scale, or color where a reference component already exists is Major.
- A visible screen whose plan task has no UI source line is Major.

### 4. Severity

| Severity | Meaning | Action |
|---|---|---|
| Critical | Security vulnerability, data loss/corruption, broken AC, crash | Must fix |
| Major | Wrong placement/layering, convention violation, UI source mismatch, failing automated check, missing test for an AC, significant perf issue | Must fix |
| Minor | Readability, naming nit, small refactor | Fix if cheap, else list as follow-up |
| Info | Observations, praise | none |

Each finding: ID (`R-xx` or `S-xx`), severity, `file:line`, problem, why it matters, concrete fix.

### 5. Triage (receiving-code-review)
Before fixing, verify each finding against the code. Reject false positives with a one-line reason (recorded in the report), do not fix blindly.

### 6. Loop
- Write all findings into `06-review.md` (`templates/review.md`), with a section per round.
- If any Critical/Major remains open: increment `loops.reviewRounds` in `status.json` (and mirror `STATUS.md`), go back to `tdd-loop` (fix mode), then review again with only the fix diff and the open findings.
- Round limit: **3**. If still failing after 3 rounds, stop and present the remaining findings to the user with options.
- When zero Critical/Major remain: set `phase` to `DELIVER`, append metrics, and **immediately start `deliver-pr`**. (DONE comes after DELIVER + verification.)
