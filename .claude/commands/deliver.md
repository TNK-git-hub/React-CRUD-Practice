---
description: Phase DELIVER - open or update the PR and record CI evidence before DONE
argument-hint: [feature-id or bug-id]
---

Open or update the PR for the active feature/bug and record CI evidence.

Target: `$ARGUMENTS`, or `context/ACTIVE.json`.

Use the `deliver-pr` skill. Refuse if review still has open Critical/Major. After PR (or approved local skip), run `verification-before-completion` and the DONE summary.
