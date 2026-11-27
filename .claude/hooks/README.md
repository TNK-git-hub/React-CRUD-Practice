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

## Exit codes

A PreToolUse hook decides by its exit code: **0** = allow (or the decision it prints as JSON on stdout, e.g. `ask`),
**2** = block (its stderr goes back to the agent), **anything else** = a hook error: Claude Code reports it and the tool
call goes ahead. A syntax error in `guard.mjs`, an exception it does not catch, or a missing `node` (exit 127) would
therefore let every call through. That is why the guard command in `.claude/settings.json` is

```
node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs" || exit 2
```

- The `|| exit 2` must stay. Any generator of `settings.json` (the planned one of task 5b-2 included) must write it
  too: `test_guard_command.py` reads the command from `settings.json` and fails without it.
- The pod (`k8s/agents/run.sh`) runs `claude -p --agent <role>` in its clone of the base branch, with this same
  `settings.json`: it wires no hooks of its own.
- The PreToolUse hooks of `spec-writer` / `planner` (`allow_paths.py`, in their agent files) end in `|| exit 2` for
  the same reason.
- `stop-gate.sh`, `code-gate.sh` (Stop / SubagentStop) and `lint-changed.mjs` (PostToolUse) are quality gates, not
  permission checks: a crash skips the gate but grants no access, so they have no `|| exit 2`. On a Stop hook it
  would even keep the agent from stopping on every attempt, since a script that cannot run never reaches its own
  `stop_hook_active` check.
- Claude Code reads the `hooks` section of `settings.json` when a session starts: a change to it takes effect in the
  next session. A change to a hook's file is live at once (next section).

## Editing a hook

A hook takes effect the moment its file is saved: a hook that breaks halfway through an edit can block every
following tool call, the one that would fix it included (a `guard.mjs` that cannot run blocks every call, through
the `|| exit 2` above). So never edit a hook in place step by step:

1. Build the complete new version in a scratch folder outside the repo.
2. Check it there: `node --check` for `.mjs`, `bash -n` for `.sh`; run its tests against that copy (for
   `guard.mjs`: `node guard-cases.mjs <copy of guard.mjs>`, both modes, with the `harness.json` it will see next to it,
   i.e. `<scratch>/harness.json` beside `<scratch>/hooks/`).
3. Only then replace the live file in one step (one write of the whole file, or a copy of the tested file).

When a schema change needs the guard and `harness.json` to change together, go through a guard that accepts both
(old | new) → change `harness.json` → a guard that accepts only the new one, each guard version through steps 1-3.

If a hook breaks anyway: stop, and restore it by hand from git in your own terminal, e.g.
`git -C <repo> checkout -- .claude/hooks/guard.mjs`.
