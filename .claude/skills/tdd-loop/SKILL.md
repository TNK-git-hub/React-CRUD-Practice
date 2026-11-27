---
name: tdd-loop
description: Executes an approved plan task by task with strict test-driven development (red -> green -> refactor), looping until every test case passes, then hands off to code review automatically. Use after Gate 2 (plan approved), when the user runs /implement, or when fixing review findings.
---

# TDD Loop (Phase 3)

Based on: obra/superpowers `test-driven-development` (the iron law) and `subagent-driven-development` / `executing-plans` (one task at a time, fresh context, check after each).

## The iron law

**No production code without a failing test first.** If you wrote code before the test, delete it and start from the test. A test you never saw fail proves nothing.

## Loop per task

Before the first task, read `status.json`. Refuse to start unless `gates.spec` and `gates.plan` are `approved` and both hashes still match the files. Refuse if `git branch --show-current` is not `status.json.branch` (ask the user to switch). Set `diffBase` if it is null.

If `workType` is `docs`, `infra`, or `config`, follow **Non-code BUILD lane** below instead of the RED/GREEN iron law.

### Risk gate (during BUILD)

Before starting a task that adds or changes any of: DB migration/DDL, breaking public API, new runtime dependency, authz rules, secrets/config handling—and that risk was not already listed and approved in the plan—**stop**. Set `gates.risk` to `pending` with `kinds: [...]`, explain blast radius in one short message, and wait for user approval. On approval set `gates.risk.state` to `approved` and continue. Do not silently expand scope.

For each unchecked task `T-xx` in `03-plan.md`, **one at a time** (never in parallel, even if an old plan says `[P]`). Delegate that single task to the `tdd-implementer` subagent when it can be spawned (`mode: "subagent"`); otherwise run the same loop yourself and set `mode: "inline"`.

Brief for that spawn only:
- the `T-xx` block from `03-plan.md`
- the matching rows from `04-test-cases.md`
- `context/project/structure.md`
- the one command from `commands.md` that runs a single test file
- `context/project/ui-source.md` and the task's **UI source** line, only when that line is not `n/a`

Do not attach `01-discussion.md`, the rest of the spec, other tasks, or the rest of `context/project/`. Do not paste earlier test logs into the brief.

When the task names a UI source, read it before writing markup:
- `figma`: call the project's already-connected Figma Dev Mode MCP for that node (design context, screenshot, variables). Use a Code Connect component when the node maps to one. The generated snippet is a reference. Production markup uses the repo component named on the task.
- `codebase`: open only the named reference files and reuse their layout, components, and tokens.
- If the node or the reference file cannot be read, stop and ask the user. Do not invent the screen.

```
attempts = 0
RED      Write the test(s) for the task's TCs, in the path required by structure.md.
         Run only those tests. They MUST fail, and fail for the expected reason
         (assertion on missing behavior, not a typo/import error).
         -> mark TC status "red" in 04-test-cases.md
GREEN    The test is already red. Write the smallest production code that makes it pass.
         Stop at the first rung that fully satisfies this task's test cases:
         1. Code already in the repo, used the way neighboring code uses it.
         2. The standard library or a platform feature, unless the project has its own.
         3. An installed dependency. Do not add one for a few lines.
         4. One clear line, when a reader gets it at a glance.
         5. Otherwise the minimum code that passes.
         The approved spec and conventions.md win over a smaller option.
         Do not cut trust-boundary validation, data-loss handling, security, or accessibility.
         No abstraction, wrapper, or option this task did not ask for.
         Run the task's tests.
         If failing: attempts += 1; read the actual error; fix code (not the test); repeat.
         If attempts == 5: STOP, switch to systematic-debugging and ask the user.
         -> mark TC status "green"
REFACTOR Remove duplication, improve names, follow conventions.md. Tests stay green.
CHECK    Run only this task's tests. Do not run the full suite here.
RECORD   Keep the tool result you already have. Do not run that command again.
         Append one evidence object (kind "task"): command, exitCode, and a one-line
         summary such as "4 passed, 0 failed". Never store or quote the log.
         If the tool result has no exit code, run that one command once.
         Check the task in 03-plan.md, append one line to 05-implementation-log.md,
         mirror STATUS.md. Reset loops.tddAttempts to 0 before the next task.
```

Then move straight to the next task. No confirmation needed between tasks.

## Exit -> REVIEW

### Non-code BUILD lane

For `docs` / `infra` / `config`: each task implements the planned change, then runs the planned `CK-xx` verify command (or checklist). Append evidence `kind: "check"`. No failing unit test is required. Do not invent fake tests to satisfy TDD.

When all tasks are checked:
1. **code:** Run the full suite, lint, typecheck, and build once. Append one-line evidence. Refuse to leave BUILD if any is missing or stale.
2. **non-code:** Run the final checks named in the plan once. Append `check` evidence.
3. Set `phase` to `REVIEW` and **immediately start `code-review`** (for non-code, review still checks placement/scope; security-review only if secrets/infra auth surface changed). Do not carry task logs into review.

## When returning from review

Treat each Critical/Major finding as a mini-task: write or adjust a test that exposes the problem (when testable), fix, and run that test. Run the full suite only if this fix can affect other tests; otherwise the next review reuses the BUILD suite evidence until it is stale. Mark the finding `fixed` in `06-review.md`. Return to `code-review` with only the fix diff and the open finding ids.

## Rules

- **Never** edit, skip (`.skip`, `xit`, `@Ignore`, `t.Skip`), or delete a test to make it pass. If a test is genuinely wrong (contradicts the spec), stop and ask the user; record the decision in `01-discussion.md`.
- Test behavior through public interfaces, not implementation details. Mock only at system boundaries (network, clock, randomness, external services).
- One logical change per green step. Keep diffs small.
- New files go exactly where the plan / `structure.md` says. If the plan's path seems wrong, fix the plan first.
- No secrets, credentials, or real PII in code or fixtures.
- If you need to deviate from the plan (missing step, wrong assumption), update `03-plan.md` and note why in the implementation log. Ask the user only if the deviation changes spec behavior.
