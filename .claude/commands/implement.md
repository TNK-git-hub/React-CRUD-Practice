---
description: Phase 3 - execute the approved plan with strict TDD, then hand off to review
argument-hint: [feature-id]
---

Execute the approved plan with strict TDD.

Target: `$ARGUMENTS`, or (if empty) the single non-DONE feature claimed in `context/ACTIVE.json`. If several are unfinished and no id was given, list them and stop.

Use the `tdd-loop` skill. Refuse to start unless `status.json` gate hashes still match the spec and plan. Run tasks strictly one at a time (ignore `[P]`). Each `tdd-implementer` brief is only that task, its test-case rows, `structure.md`, and the single-test command. Record one-line task evidence from the tool result. Do not re-run a command already in the turn, and do not run the full suite until every task is checked. Then continue automatically into the `code-review` skill.
