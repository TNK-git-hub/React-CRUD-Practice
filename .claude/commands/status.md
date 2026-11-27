---
description: Show workflow status of active features and bugs, or resume with "continue"
argument-hint: [continue | feature-id]
---

Show the workflow status. Argument: $ARGUMENTS

Follow the "Resuming" section of the `ai-dev-workflow` skill. Read `context/ACTIVE.json` and every `status.json`. Report phase, gate state (including whether hashes still match), loop counters, last evidence line, next action, and blockers. If the argument is "continue", resume only when a single non-DONE item exists or an id was named. Recompute gate hashes before continuing BUILD or later.
