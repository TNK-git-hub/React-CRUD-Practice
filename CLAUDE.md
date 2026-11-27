# AI-native harness

Harness skeleton (spec, code, test, CI, agent pod), no app code yet. An app built on this skeleton is a pnpm monorepo of `frontend/` (Next.js 16 App Router, React 19, TanStack Query, Tailwind) and `backend/` (NestJS, TypeORM, PostgreSQL, Redis).

Before writing frontend code, read `frontend/AGENTS.md`: this Next.js version differs from what you may know; read the docs in `node_modules/next/dist/docs/`.

## Commands
- Public tests (CI runs them, they must pass): `pnpm test`
- Tests of one package: `pnpm --filter backend test`, `pnpm --filter frontend test`
- Filter by test name: `pnpm --filter backend test -t=<scenario ID>` (with `=`, no space; a path argument may only start with
  `test/public/`). The `guard.mjs` hook blocks every other form of the test command, and blocks `test:private` / `typecheck:private` for every role.
- Lint: `pnpm lint`. Frontend typecheck: `pnpm --filter frontend typecheck`
- Typecheck test files (strict, constitution Principle IV; CI runs it): `pnpm --filter backend typecheck:test`, `pnpm --filter frontend typecheck:test` (`tsconfig.test.json`: `src` + `test/public`, never `test/private`)
- UI tests (webapp-testing): run Python with `.venv/bin/python`. Run `pnpm db:up` first to have a DB.
- UI test scripts go in `frontend/test/e2e/`. CI does not run them yet.

## Test conventions
- Framework: Vitest for both packages.
- New tests go in `<package>/test/public/`, file name `*.test.ts` (React components: `*.test.tsx`).
- React component tests: first line of the file `// @vitest-environment jsdom`, use `@testing-library/react` + `@testing-library/user-event`, `cleanup` after each test. Mock only external things (HTTP, `next/navigation`), never the app's components.
- Do not read, edit or create files in `test/private/`.
- Mock only slow or external things (HTTP, DB, Redis). Do not assert on mocks.
- Do not change production code to make a test pass. If you suspect a bug, report it with evidence.

## Agent workflow
- The main session only orchestrates: it assigns work to subagents and collects their results. It does not edit `src/` or `test/` itself (the hook `.claude/hooks/guard.mjs` blocks it).
- Order: `code-planner` + `test-planner` → `test-writer` (tests fail first) → `code-writer` (code makes them pass) → `code-reviewer` + `test-critic` + `security-reviewer` (may run in parallel, all three read-only). When there is a problem, go back to the matching writer.
- After `test-writer`: the main session runs the new tests itself (`pnpm --filter <package> test -t=<scenario ID>`), checks that they are red for the right reason (an assertion on the missing behaviour, not an import / syntax / setup error), then makes a SEPARATE COMMIT of only the test files (`test: <description>`) before assigning `code-writer`. Before opening the PR: `python3 .specify/scripts/red_check.py --base <base branch>` must PASS (CI job `red-check` checks it again on the git history).
- A HIGH/MEDIUM finding of `security-reviewer` is a serious problem: `test-writer` writes a test proving the vulnerability (e.g. user A calling user B's resource must be denied), `code-writer` fixes the code until it passes. A finding that shows the spec is missing a scenario: write `SPEC_PROBLEM`, go back to the spec harness.
- Write permissions: `code-writer` only `backend/src`, `frontend/src`, `frontend/public`; `test-writer` only `<package>/test/public`, `frontend/test/e2e`; `spec-writer`, `planner` only `specs/changes/`, `.specify/feature.json`. Nobody reads or edits `test/private`.
- Never ask one writer to fix the other writer's part (e.g. asking `test-writer` to change a test to match wrong code).
- Before assigning `test-writer` / `code-writer` work on a change: the main session runs `python3 .specify/scripts/approval.py verify --change <change>`. On an error (not approved, or spec / plan / tasks changed since the approval) stop and tell the user; only the user approves again, with that script's `approve` command in their own terminal.
- Editing a harness file (`.claude/`, `CLAUDE.md`, `package.json`, test config, `.github/`, `ci/`, `k8s/`) always needs the user's go-ahead first.
- Dispatching work to agents that run in a pod (kind), open their own PR and watch GitHub Actions: use the skill `dispatch-agents` (`k8s/agents/README.md`).

## Bug-fix workflow
- The user reports a bug, a test fails unexpectedly, or the app behaves wrongly: follow the skill `bug-fix-flow`. No fix before the user has agreed to the root cause.
- Order: classify (which scenario is violated; when no scenario covers it, it is a spec gap: go to the spec harness) → `bugs/<id>/report.md` → RED (`test-writer` writes a reproduction test whose name starts with the scenario ID; it must fail exactly because of the bug) → investigate (`bug-investigator`, read-only) → root-cause gate (stop and wait for the user to agree) → GREEN (`code-writer` fixes one place at the source, at most 3 failed attempts) → review (`code-reviewer` + `test-critic` + `security-reviewer`).
- The main session writes the bug record `bugs/<id>/` (`report.md`, `investigation.md`, `fix.md`). That is the whole record: to go on in a new chat, only this folder is needed, not the old chat log.
- Never edit, delete or skip the reproduction test to make it pass; never edit `specs/`.

## Branches
- Base branch: `harness-base`. Change branches (`NNN-<name>`) start from it and their PRs merge into it. The skills and agents of the spec harness read the base branch name from this line; no other file hard-codes it.

## Spec (spec harness: `.claude/CLAUDE.md`)
- The spec harness (writes spec, plan, tasks) is part of the repo: rules in `.claude/CLAUDE.md`, principles in `.specify/memory/constitution.md`, agents `spec-writer` + `planner`, skills `speckit-*`, `spec-bootstrap`, `spec-edge-cases`, `spec-archive`. Specs are written in English. The machine needs Python 3.9+ with PyYAML.
- Order: `/spec-bootstrap` (once) → per change: `/speckit-specify` → `/speckit-clarify` → `/spec-edge-cases` → spec approval → `/speckit-plan` → `/speckit-checklist` → `/speckit-tasks` → `/speckit-analyze` → plan + tasks approval → CODE/TEST (below) → `/spec-archive`.
- Layout of `specs/`: `_system/`, `capabilities/<domain>/<feature>/` (one living spec per feature; `states.md`, `rules.md`, `history.md` shared at domain level), `changes/NNN-<feature>/` (spec.md, plan.md, tasks.md, checklists/), `archive/`. Each folder is described in its `.gitkeep`.
- CODE agents read `spec.md` (requirement details, `## Architecture Decisions`, `## Data Model`), `plan.md`, `tasks.md`. TEST agents read the scenarios, `## Edge Cases & Error Handling`, the NFR Verification column of `spec.md`, `checklists/edge-cases.md`, `## Test Strategy` of `plan.md`.
- No agent edits `specs/`. Spec wrong or incomplete: write `SPEC_PROBLEM: <file> <section> <reason>`, go back to the spec harness.
- The name of every test starts with a scenario ID, e.g. `it('ABC-003-S2 ...')`.
- Dispatching to agents in a pod: `dispatch.sh ... --change NNN-<feature> [--tasks T001,T002]` (`k8s/agents/README.md`, section "Working from a spec").

## CI
- `pnpm ci:local`: install → lint, typecheck, build frontend → build backend → `pnpm test`. It must print `CI PASSED`.
- PRs run the same pipeline through `.github/workflows/ci.yml` on GitHub's cloud runner (`ubuntu-latest`).
- Second job `spec-check`: unittests of the spec harness scripts + `python3 .specify/scripts/spec_check.py --stage spec --change <branch>`. It runs locally with that same command.
- Third job `red-check` (PRs only, skipped while there is no `package.json`): `python3 .specify/scripts/red_check.py --base origin/<base branch>` checks the RED → GREEN order on the git history (the first test commit fails at that commit, no `src` change comes before it). Locally: `python3 .specify/scripts/red_check.py --base <base branch>`.

## Definition of done
Report a task as done only when `pnpm lint`, `pnpm --filter frontend typecheck` and `pnpm test` have just run and passed, with their output as evidence.

## Language
- Every file in this repo is written in English, as the Language rule of `.specify/memory/constitution.md` says: requirement documents in another language are translated to English before they go into `docs/requirements/`; user-facing product text is quoted verbatim in the product's language.
- Reply to the user in the language they write in.
