#!/usr/bin/env bash
# Stop hook of code-writer (runs as SubagentStop): the gate steps of the stack profile (stack.commands.gate in
# .claude/harness.json; ts-pnpm-vitest: lint, typecheck, tests) must pass before it may report done.
input=$(cat)

# Already blocked once: let it stop, to avoid an endless loop
if echo "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# python3 missing or harness.json invalid -> block (fail-closed); the second stop goes through (stop_hook_active)
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "[code-gate] python3 not found: cannot read the stack profile of .claude/harness.json (install Python 3)." >&2
  exit 2
fi
hc() { "$PY" .specify/scripts/harness_config.py "$@"; }
if ! marker="$(hc get stack.appMarker 2>&1)" || ! steps="$(hc get stack.commands.gate --count 2>&1)"; then
  echo "[code-gate] .claude/harness.json missing or invalid, cannot run the gate: ${marker:-} ${steps:-}" >&2
  exit 2
fi

# Harness skeleton without an app yet (no stack.appMarker, e.g. package.json): nothing to test
[ -f "$marker" ] || exit 0

# No file changed: nothing to check
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

run() {
  local name=$1; shift
  if ! output=$("$@" 2>&1); then
    echo "$name is failing. Make it pass before you report the task as done:" >&2
    echo "$output" | tail -40 >&2
    exit 2
  fi
}

i=0
while [ "$i" -lt "$steps" ]; do
  if ! label="$(hc get "stack.commands.gate.$i.label" 2>&1)" || ! step_argv="$(hc argv gate --index "$i" 2>&1)"; then
    echo "[code-gate] cannot read gate step $i of .claude/harness.json: ${label:-} ${step_argv:-}" >&2
    exit 2
  fi
  STEP=()
  while IFS= read -r a; do STEP+=("$a"); done <<<"$step_argv"
  run "$label" "${STEP[@]}"
  i=$((i + 1))
done
exit 0
