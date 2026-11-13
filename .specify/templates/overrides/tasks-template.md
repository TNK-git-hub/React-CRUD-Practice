---

description: "Task list template for one change (spec harness: no test tasks, every task names its scenarios)"
---

<!--
Override of the core .specify/templates/tasks-template.md (resolved first by resolve-template.sh / setup-tasks.sh).
Differs from the core template in 3 places:
  1. NO test tasks. Tests are written by the TEST harness from spec.md + checklists/edge-cases.md and the
     test strategy in plan.md; a tasks.md never contains "write test …" tasks, whatever the spec or the user says.
  2. Every task ends with "Scenarios: <ID>, <ID>, …" — the scenario IDs of spec.md it makes pass.
     Tasks that implement no scenario (setup, shared infrastructure, polish) write "Scenarios: —".
     Every scenario ID in the change's spec.md MUST appear in at least one task: check it with the
     "Scenario Coverage" table at the end before finishing.
  3. A user story is one requirement (or a small group of requirements) of the delta spec; name the
     requirement IDs in the phase heading.
Phases, user stories, [P] and the format below are kept from the core template.
Everything is written in English; headings, labels and IDs stay as here; user-facing product text is quoted
verbatim in the product's language (see .claude/CLAUDE.md, Language).
-->

# Tasks: [CHANGE NAME]

**Input**: Design documents from `specs/changes/[NNN-change-name]/`

**Prerequisites**: spec.md (required, approved: requirement details, `## Architecture Decisions`, `## Data Model`),
plan.md (required: Technical Context, Project Structure, Test Strategy, Quickstart). A change has no research.md,
data-model.md, contracts/ or quickstart.md.

**Tests**: NONE in this file. The TEST harness writes the tests (one test per scenario, named by scenario ID) from
spec.md, checklists/edge-cases.md and the test strategy in plan.md. Do not add test tasks.

**Organization**: Tasks are grouped by user story; each user story maps to requirement IDs of spec.md
(e.g. US1 = [CODE]-[NNN]).

## Format: `- [ ] [ID] [P?] [Story] Description — Scenarios: <ID>, <ID>`

- **[P]**: Can run in parallel (different files, no dependencies on unfinished tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3); none in Setup, Foundational, Polish
- **Scenarios**: scenario IDs from spec.md this task makes pass (e.g. `[CODE]-[NNN]-S1, [CODE]-[NNN]-S3`);
  `—` only for tasks that implement no scenario
- Include exact file paths in descriptions; quote constraints verbatim from spec.md (requirement details, Data Model)
  and cite the ADR a task follows (e.g. `001-ADR-1`)

## Path Conventions

- **Single project**: `src/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - Requirements and scenarios from spec.md (with their priorities P1, P2, P3)
  - Technical decisions: the ADRs in spec.md (`## Architecture Decisions`) and plan.md (stack, structure)
  - Entities: `## Data Model` in spec.md
  - Endpoints / UI / messages: the requirement details in spec.md

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Verified independently (by the TEST harness, through its scenario IDs)
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per plan.md — Scenarios: —
- [ ] T002 Initialize [language] project with [framework] dependencies and strictest type checking — Scenarios: —
- [ ] T003 [P] Configure linting and formatting tools — Scenarios: —

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Setup database schema and migrations framework — Scenarios: —
- [ ] T005 [P] Implement authorization check in the backend — Scenarios: [CODE]-[NNN]-S4
- [ ] T006 [P] Setup API routing and middleware structure — Scenarios: —
- [ ] T007 Create base models/entities that all stories depend on — Scenarios: —

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] ([CODE]-[NNN], Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How the TEST harness verifies this story on its own: scenario IDs [CODE]-[NNN]-S1…Sn, Quickstart step of plan.md]

### Implementation for User Story 1

- [ ] T008 [P] [US1] Create [Entity1] model in src/models/[entity1].py — Scenarios: [CODE]-[NNN]-S1
- [ ] T009 [P] [US1] Create [Entity2] model in src/models/[entity2].py — Scenarios: [CODE]-[NNN]-S1
- [ ] T010 [US1] Implement [Service] in src/services/[service].py (depends on T008, T009) — Scenarios: [CODE]-[NNN]-S1, [CODE]-[NNN]-S2
- [ ] T011 [US1] Implement [endpoint/feature] in src/[location]/[file].py — Scenarios: [CODE]-[NNN]-S1, [CODE]-[NNN]-S2
- [ ] T012 [US1] Add validation and error handling ("[message quoted from spec]") — Scenarios: [CODE]-[NNN]-S3

**Checkpoint**: At this point, User Story 1 should be fully functional and verifiable independently

---

## Phase 4: User Story 2 - [Title] ([CODE]-[NNN], Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [Scenario IDs that verify this story on its own]

### Implementation for User Story 2

- [ ] T013 [P] [US2] Create [Entity] model in src/models/[entity].py — Scenarios: [CODE]-[NNN]-S1
- [ ] T014 [US2] Implement [Service] in src/services/[service].py — Scenarios: [CODE]-[NNN]-S1, [CODE]-[NNN]-S2
- [ ] T015 [US2] Implement [endpoint/feature] in src/[location]/[file].py — Scenarios: [CODE]-[NNN]-S1
- [ ] T016 [US2] Integrate with User Story 1 components (if needed) — Scenarios: [CODE]-[NNN]-S3

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] ([CODE]-[NNN], Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [Scenario IDs that verify this story on its own]

### Implementation for User Story 3

- [ ] T017 [P] [US3] Create [Entity] model in src/models/[entity].py — Scenarios: [CODE]-[NNN]-S1
- [ ] T018 [US3] Implement [Service] in src/services/[service].py — Scenarios: [CODE]-[NNN]-S1, [CODE]-[NNN]-S2
- [ ] T019 [US3] Implement [endpoint/feature] in src/[location]/[file].py — Scenarios: [CODE]-[NNN]-S1

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories (no test tasks)

- [ ] TXXX [P] Documentation updates in docs/ — Scenarios: —
- [ ] TXXX Code cleanup and refactoring — Scenarios: —
- [ ] TXXX Security hardening — Scenarios: —
- [ ] TXXX Run the Quickstart of plan.md — Scenarios: —

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently verifiable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently verifiable

### Within Each User Story

- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all models for User Story 1 together:
Task: "Create [Entity1] model in src/models/[entity1].py"
Task: "Create [Entity2] model in src/models/[entity2].py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: User Story 1 scenarios pass (TEST harness)
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → its scenarios pass → Deploy/Demo (MVP!)
3. Add User Story 2 → its scenarios pass → Deploy/Demo
4. Add User Story 3 → its scenarios pass → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Scenario Coverage

<!-- One row per scenario ID in spec.md (happy and edge-case), in spec order. Every row MUST list at least one task.
     A scenario without a task means tasks.md is incomplete: add the task, do not drop the row. -->

| Scenario | Priority | Tasks |
| --- | --- | --- |
| `[CODE]-[NNN]-S1` | P1 | T008, T010, T011 |
| `[CODE]-[NNN]-S2` | P1 | T010, T011 |
| `[CODE]-[NNN]-S3` | P2 | T012 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability; `Scenarios:` maps it to spec.md
- Each user story should be independently completable and verifiable through its scenario IDs
- No test tasks: tests belong to the TEST harness
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
