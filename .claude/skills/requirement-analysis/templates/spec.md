# Spec: <feature title>

| Field | Value |
|---|---|
| Feature ID | <YYYYMMDD-slug> |
| Status | Draft / Approved on <date> |
| Discussion | [01-discussion.md](01-discussion.md) |

## 1. Goal

<problem, who benefits, success metric>

## 2. Scope

**In scope**
- 

**Out of scope**
- 

## 3. Actors and permissions

| Actor | Can | Cannot |
|---|---|---|
| | | |

## 4. User stories

- **US-01**: As a <actor>, I want <capability>, so that <value>.

## 5. Acceptance criteria

| ID | Story | Given | When | Then |
|---|---|---|---|---|
| AC-01 | US-01 | | | |
| AC-02 | US-01 | (error case) | | |

## 6. Business rules

- **BR-01**: 

## 7. Data

| Entity / field | Type | Constraints | PII? |
|---|---|---|---|
| | | | |

## 8. Interfaces

### UI source

`n/a` when this feature has no UI. Otherwise follow `context/project/ui-source.md`.

| Screen / state | Source (Figma `node-id`, or repo path) | May differ by |
|---|---|---|
| default | | |
| empty / loading / error | when the story has that state | |

### API / events

<API contract (method, path, request, response, error codes), events>

## 9. Non-functional requirements

| ID | Category | Requirement (measurable) |
|---|---|---|
| NFR-01 | Security | e.g. only role X can call endpoint Y; returns 403 otherwise |
| NFR-02 | Performance | e.g. p95 < 300 ms at 50 rps |

## 10. Edge cases

- 

## 11. Open questions

- none (all `[NEEDS CLARIFICATION]` resolved before approval)
