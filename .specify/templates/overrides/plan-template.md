<!--
Override of the core .specify/templates/plan-template.md (resolved first by resolve-template.sh / setup-plan.sh).
Differs from the core template in 2 places:
  1. Paths point to the change folder specs/changes/NNN-<name>/ (level 4 delta specs).
  2. Adds the MANDATORY section "## Test Strategy". The TEST harness reads it (with spec.md and
     checklists/edge-cases.md) to write the tests; a plan without a complete Test Strategy is not ready for approval.
     Never invent limits, numbers or environments the project does not have: write [NEEDS CLARIFICATION: …].
Prose is written in Vietnamese; headings, labels and IDs stay as here (see .claude/CLAUDE.md, Language).
-->

# Implementation Plan: [FEATURE]

**Branch**: `[NNN-change-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Delta spec from `specs/changes/[NNN-change-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION] (details in Test Strategy)

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/changes/[NNN-change-name]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
├── checklists/          # edge-cases.md (/spec-edge-cases), quality.md (/speckit-checklist)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Test Strategy

<!--
  MANDATORY. Read by the TEST harness together with spec.md and checklists/edge-cases.md.
  Every subsection must be filled in; anything unknown is [NEEDS CLARIFICATION: …], never a guess.
  No test code here: only what the TEST harness needs to write and run the tests.
-->

### Runner and commands

| Part | Test runner | Command (from repo root) | Test file location / pattern |
| --- | --- | --- | --- |
| [e.g., backend] | [e.g., vitest 3] | [e.g., `npm test -- backend`] | [e.g., `tests/<domain>/backend/*.spec.ts`] |

- Run a single scenario: [e.g., `npm test -- -t "ABC-003-S2"`]
- Strict type check of the test files: [command; constitution Principle IV]

### Environment

| Needs | What (version) | How to set it up | Isolated from dev by |
| --- | --- | --- | --- |
| Database | [e.g., PostgreSQL 16, DB `app_test`] | [e.g., `docker compose up -d db`, created by global setup] | [e.g., separate DB name] |
| Cache | [e.g., Redis DB index 1 or N/A] | [...] | [...] |
| External services | [each one: real, fake or stubbed; how] | [...] | [...] |
| Seed / sample data | [fixtures or factories; where they live] | [command] | [...] |

### Naming

- Every test name (or description) starts with exactly one scenario ID from spec.md: `[CODE]-[NNN]-S[n] <short description>`.
- Tests live in `tests/<domain>/`; every scenario of spec.md has at least one test (constitution Principle I).

### Test level per scenario type

<!-- Scenario types come from specs/_system/edge-case-catalog.md. Keep the rows used by this change's spec.md;
     mark the others N/A. A row may list more than one level. -->

| Scenario type | Level (unit / integration / e2e) | Why / what is real, what is faked |
| --- | --- | --- |
| happy | [e.g., integration] | [...] |
| input | [e.g., unit + integration] | [...] |
| boundary | [...] | [...] |
| missing | [...] | [...] |
| collection | [...] | [...] |
| state | [...] | [...] |
| permission | [integration: call the backend directly (constitution Principle II)] | [...] |
| concurrency | [...] | [...] |
| time | [...] | [...] |
| dependency | [e.g., integration with the dependency made unavailable] | [...] |
| resource | [...] | [...] |
| data | [...] | [...] |
| domain | [...] | [...] |

### Data safety

- Tests and seed commands MUST NOT touch dev (or any non-test) data: [test DB / cache / bucket names and how they differ from dev].
- Guard: [where and how the run fails fast, before any write, when the configuration points anywhere but the
  test resources — e.g., global setup aborts unless DB name ends with `_test` and host is local].
- Clean-up between tests: [e.g., truncate tables / flush cache per test file].

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
