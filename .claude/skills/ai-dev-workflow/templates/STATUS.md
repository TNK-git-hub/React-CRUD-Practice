# Status: <feature title>

| Field | Value |
|---|---|
| ID | <YYYYMMDD-slug> |
| Type | feature |
| Work type | code / docs / infra / config |
| Phase | REQUIRE / PLAN / BUILD / REVIEW / DELIVER / DONE |
| Branch | `feat/<YYYYMMDD-slug>` |
| Gate 1 (spec approved) | pending / approved on <date> |
| Gate 2 (plan approved) | pending / approved on <date> |
| Risk gate | n/a / pending / approved on <date> |
| PR | <url or none> |
| Owner | <developer> |
| Last updated | <date time> |

## Progress

- [ ] Requirement discussion (`01-discussion.md`)
- [ ] Spec approved (`02-spec.md`)
- [ ] Plan approved (`03-plan.md`, `04-test-cases.md`)
- [ ] Implementation complete (`05-implementation-log.md`)
- [ ] Review passed (`06-review.md`)
- [ ] Delivered (PR or local skip)
- [ ] Verified and done

## Loop counters

| Loop | Count | Limit |
|---|---|---|
| Review rounds | 0 | 3 |
| Current task TDD attempts | 0 | 5 |

Machine-readable twin: `status.json` in this folder. If the two disagree, `status.json` wins.

## Next action

<one sentence: what the agent will do next>

## Blockers / open questions

- none

## Verification evidence

<command> -> <result, e.g. "142 passed, 0 failed">
