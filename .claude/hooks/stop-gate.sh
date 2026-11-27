#!/usr/bin/env bash
input=$(cat)

# RED step in the pod (k8s/agents/run.sh): new tests must fail by design; the script checks its own gate
if [ "${SKIP_STOP_GATE:-}" = "1" ]; then
  exit 0
fi

# Already blocked once: let it stop, to avoid an endless loop
if echo "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# The stack profile of .claude/harness.json says what "the app exists" means (stack.appMarker) and how to run the
# tests (stack.commands.test). Read with harness_config.py; python3 missing or harness.json invalid -> block
# (fail-closed), the second stop goes through (stop_hook_active above).
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "[stop-gate] python3 not found: cannot read the stack profile of .claude/harness.json (install Python 3)." >&2
  exit 2
fi
hc() { "$PY" .specify/scripts/harness_config.py "$@"; }
if ! marker="$(hc get stack.appMarker 2>&1)" || ! test_argv="$(hc argv test 2>&1)"; then
  echo "[stop-gate] .claude/harness.json missing or invalid, cannot run the tests: ${marker:-} ${test_argv:-}" >&2
  exit 2
fi
TEST_CMD=()
while IFS= read -r a; do TEST_CMD+=("$a"); done <<<"$test_argv"
TEST_LABEL="${TEST_CMD[*]}"

# Harness skeleton without an app yet (no stack.appMarker, e.g. package.json): nothing to test
[ -f "$marker" ] || exit 0

# No file changed: no need to run the tests
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

# Bug flow (skill bug-fix-flow): while a bug record with uncommitted changes is complete but its root-cause gate is
# missing or changed, the session is waiting for the user (the reproduction test is red by design), so do not push
# it to "fix" the test. "Waiting" is derived from approval.py only (no marker file): skip only on `verify` exit 1
# (pending: report.md + the Root cause section are there). Exit 2 (missing file / heading, broken approval.json,
# unexpected error) or any other code -> run the tests (fail-closed). Only folders named like a bug id count
# (<YYYYMMDD>-<slug>), so another folder under bugs/ cannot switch the gate off; bugs/.gitkeep is ignored.
if [ -f .specify/scripts/approval.py ]; then
  bug_ids=$(git status --porcelain --untracked-files=all -- bugs/ \
    | sed -E 's/^.{3}//; s/.* -> //; s/^"//' \
    | sed -nE 's#^bugs/([0-9]{8}-[a-z0-9]+(-[a-z0-9]+)*)/.*#\1#p' | sort -u)
  for id in $bug_ids; do
    "$PY" .specify/scripts/approval.py verify --bug "$id" --root "$CLAUDE_PROJECT_DIR" >/dev/null 2>&1
    if [ "$?" -eq 1 ]; then
      echo "[stop-gate] bug $id is waiting for the user to approve the root cause (the record is complete, approval.py verify --bug $id does not match yet): skipping $TEST_LABEL." >&2
      exit 0
    fi
  done
fi

if ! output=$("${TEST_CMD[@]}" 2>&1); then
  echo "$TEST_LABEL is failing. If you are waiting for the user to decide (e.g. after 3 failed fix attempts), say so and stop. Do NOT edit, weaken, skip or delete tests to make them pass. Output:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi
exit 0
