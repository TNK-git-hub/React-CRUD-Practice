# .claude/hooks

| File | Hook | What it does |
| --- | --- | --- |
| `guard.mjs` | PreToolUse (every session and agent) | write areas per agent, harness files, `test/private`, test commands; fail-closed on a missing or invalid `.claude/harness.json` |
| `stop-gate.sh` | Stop | runs `stack.commands.test` when files changed (skipped while a bug waits for the root-cause approval) |
| `code-gate.sh` | SubagentStop of `code-writer` | runs the steps of `stack.commands.gate` in order |
| `lint-changed.mjs` | PostToolUse | lints the edited file with `stack.commands.lintFile` |
| `allow_paths.py` | PreToolUse of the spec agents | the paths `spec-writer` / `planner` may write |
| `guard-cases.mjs` | (test) | allow / block cases of `guard.mjs`, run twice (as is, and case-insensitive) |
| `test_*.py` | (test) | unittests of the hooks: `python3 -m unittest discover -s .claude/hooks` |

## Editing a hook

A hook takes effect the moment its file is saved: a hook that breaks halfway through an edit can block every
following tool call, the one that would fix it included (a broken `guard.mjs` fails closed and blocks every write).
So never edit a hook in place step by step:

1. Build the complete new version in a scratch folder outside the repo.
2. Check it there: `node --check` for `.mjs`, `bash -n` for `.sh`; run its tests against that copy (for
   `guard.mjs`: `node guard-cases.mjs <copy of guard.mjs>`, both modes, with the `harness.json` it will see next to it,
   i.e. `<scratch>/harness.json` beside `<scratch>/hooks/`).
3. Only then replace the live file in one step (one write of the whole file, or a copy of the tested file).

When a schema change needs the guard and `harness.json` to change together, go through a guard that accepts both
(old | new) → change `harness.json` → a guard that accepts only the new one, each guard version through steps 1-3.

If a hook breaks anyway: stop, and restore it by hand from git in your own terminal, e.g.
`git -C <repo> checkout -- .claude/hooks/guard.mjs`.
