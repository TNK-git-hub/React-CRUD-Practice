#!/usr/bin/env bash
# Stop hook of code-writer (runs as SubagentStop): lint, typecheck and tests must pass before it may report done.
input=$(cat)

# Already blocked once: let it stop, to avoid an endless loop
if echo "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Harness skeleton without an app yet (no package.json): nothing to test
[ -f package.json ] || exit 0

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

run "pnpm lint" pnpm lint
run "typecheck frontend" pnpm --filter frontend typecheck
run "pnpm test" pnpm test
exit 0
