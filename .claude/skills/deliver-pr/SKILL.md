---
name: deliver-pr
description: After review passes, opens or updates a pull request for the feature/bug branch, attaches verification evidence, and optionally waits for CI before DONE. Use automatically after REVIEW when phase becomes DELIVER, or when the user runs /deliver.
---

# Deliver (Phase DELIVER)

Create the handoff to the team's normal merge path. Do not mark DONE until this phase finishes (or the user explicitly skips PR in a non-git project).

## When to run

- After `06-review.md` has zero open Critical/Major and `phase` is set to `DELIVER`.
- Or when the user runs `/deliver` for the active item.

## Process

1. Read `status.json`. Confirm branch is `status.json.branch` and review is clean.
2. Push the branch if a remote exists (`git push -u origin HEAD`). If push fails, stop and tell the user.
3. Open or update a PR with `gh pr create` / `gh pr edit` (or the host equivalent):
   - Base: default branch
   - Head: `status.json.branch`
   - Body: link to `02-spec.md` or `01-report.md`, AC/TC coverage or root cause, one-line evidence from `status.json.evidence`, open Minor follow-ups
4. Store `prUrl` in `status.json`.
5. If CI is configured, wait for the latest check suite on the PR head (or poll once). Record one-line evidence `kind: "ci"`. If CI fails, set phase back toward BUILD/REVIEW as appropriate; do not DONE.
6. If there is no remote / no `gh`, record `prUrl: null`, note `deliver: skipped-local` in STATUS, and ask the user whether to DONE locally anyway.
7. Append a metrics event `phase=DELIVER` (see orchestrator metrics). Set `phase` to prepare for DONE, then run `verification-before-completion` and the final summary.

## Rules

- Do not force-push.
- Do not merge the PR unless the user explicitly asks.
- Keep the PR body short; do not paste test logs.
