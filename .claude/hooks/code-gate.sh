#!/usr/bin/env bash
# Stop hook của code-writer (chạy như SubagentStop): lint, typecheck, test phải pass mới được báo xong.
input=$(cat)

# Đã bị chặn một lần thì cho dừng, tránh lặp vô hạn
if echo "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Không có file nào thay đổi thì khỏi kiểm tra
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

run() {
  local name=$1; shift
  if ! output=$("$@" 2>&1); then
    echo "$name đang fail. Sửa cho pass rồi mới được báo hoàn thành:" >&2
    echo "$output" | tail -40 >&2
    exit 2
  fi
}

run "pnpm lint" pnpm lint
run "typecheck frontend" pnpm --filter frontend typecheck
run "pnpm test" pnpm test
exit 0
