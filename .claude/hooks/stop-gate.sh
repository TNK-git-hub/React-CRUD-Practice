#!/usr/bin/env bash
input=$(cat)

# Bước RED trong pod (k8s/agents/run.sh): test mới phải fail theo thiết kế, script tự kiểm gate riêng
if [ "${SKIP_STOP_GATE:-}" = "1" ]; then
  exit 0
fi

# Đã bị chặn một lần thì cho dừng, tránh lặp vô hạn
if echo "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Khung harness chưa có app (chưa có package.json) thì không có gì để test
[ -f package.json ] || exit 0

# Không có file nào thay đổi thì khỏi chạy test
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

# Bug flow (skill bug-fix-flow): while a bug record with uncommitted changes is complete but its root-cause gate is
# missing or changed, the session is waiting for the user (the reproduction test is red by design), so do not push
# it to "fix" the test. "Waiting" is derived from approval.py only (no marker file): skip only on `verify` exit 1
# (pending: report.md + the Root cause section are there). Exit 2 (missing file / heading, broken approval.json,
# unexpected error) or any other code -> run the tests (fail-closed). Only folders named like a bug id count
# (<YYYYMMDD>-<slug>), so another folder under bugs/ cannot switch the gate off; bugs/.gitkeep is ignored.
PY="$(command -v python3 || command -v python || true)"
if [ -n "$PY" ] && [ -f .specify/scripts/approval.py ]; then
  bug_ids=$(git status --porcelain --untracked-files=all -- bugs/ \
    | sed -E 's/^.{3}//; s/.* -> //; s/^"//' \
    | sed -nE 's#^bugs/([0-9]{8}-[a-z0-9]+(-[a-z0-9]+)*)/.*#\1#p' | sort -u)
  for id in $bug_ids; do
    "$PY" .specify/scripts/approval.py verify --bug "$id" --root "$CLAUDE_PROJECT_DIR" >/dev/null 2>&1
    if [ "$?" -eq 1 ]; then
      echo "[stop-gate] bug $id is waiting for the user to approve the root cause (the record is complete, approval.py verify --bug $id does not match yet): skipping pnpm test." >&2
      exit 0
    fi
  done
fi

if ! output=$(pnpm test 2>&1); then
  echo "pnpm test is failing. If you are waiting for the user to decide (e.g. after 3 failed fix attempts), say so and stop. Do NOT edit, weaken, skip or delete tests to make them pass. Output:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi
exit 0
