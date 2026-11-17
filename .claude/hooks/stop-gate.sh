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

# Không có file nào thay đổi thì khỏi chạy test
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

if ! output=$(pnpm test 2>&1); then
  echo "pnpm test đang fail. Sửa cho pass rồi mới được báo hoàn thành:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi
exit 0
