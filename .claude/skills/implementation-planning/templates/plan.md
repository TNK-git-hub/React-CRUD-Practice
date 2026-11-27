# Plan: <feature title>

| Field | Value |
|---|---|
| Feature ID | <YYYYMMDD-slug> |
| Spec | [02-spec.md](02-spec.md) |
| Test cases | [04-test-cases.md](04-test-cases.md) |
| Status | Draft / Approved on <date> |

## 1. Technical design

**Approach:** <2-5 sentences>

**Components touched**

| Component | Change |
|---|---|
| | |

**New / changed files** (paths must follow `context/project/structure.md`)

| Path | New / Modified | Purpose |
|---|---|---|
| | | |

**Data / migration changes:** 

**API / interface contracts:** 

**New dependencies:** none / <name + justification>

## 2. Tasks

Run tasks in order. Do not parallelize.

### T-01: <title>
- **Makes pass:** TC-01, TC-02
- **Files:** `src/...` (create), `tests/...` (create)
- **UI source:** `n/a`, or `<node-id | reference path>` reusing `<repo component>`
- **Steps:**
  1. Write failing test(s) for TC-01, TC-02 in `tests/...`
  2. Run `<single test command>`; confirm failure for the expected reason
  3. Implement minimal code in `src/...`
  4. Run tests; confirm pass; run lint/typecheck
  5. Refactor if needed; tests stay green
- [ ] Done

### T-02: <title>
- ...

## 3. Coverage

| AC | Test cases | Tasks |
|---|---|---|
| AC-01 | TC-01, TC-02 | T-01 |

## 4. Risks

- 
