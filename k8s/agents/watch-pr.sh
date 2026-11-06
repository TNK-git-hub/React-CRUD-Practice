#!/usr/bin/env bash
# Đợi GitHub Actions của một PR chạy xong, in kết quả; nếu fail thì in log các step lỗi.
#
# Usage:  bash k8s/agents/watch-pr.sh <pr-number|pr-url> [max-wait-seconds, mặc định 1800]
#
# Dòng cuối: "CHECKS: PASS", "CHECKS: FAIL" (kèm log lỗi phía trên) hoặc "CHECKS: TIMEOUT".
# Exit 0 chỉ khi PASS. Check đứng ở pending quá lâu thường là runner ARC (kind) đang tắt.
set -euo pipefail

[[ $# -ge 1 ]] || { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
PR="$1"; MAX_WAIT="${2:-1800}"; INTERVAL=20; waited=0

while true; do
  json="$(gh pr checks "$PR" --json name,bucket,link 2>/dev/null || echo '[]')"
  total="$(jq 'length' <<<"$json")"
  pending="$(jq '[.[] | select(.bucket == "pending")] | length' <<<"$json")"
  if [[ "$total" -gt 0 && "$pending" == 0 ]]; then break; fi
  if (( waited >= MAX_WAIT )); then
    jq -r '.[] | "  \(.bucket)\t\(.name)\t\(.link)"' <<<"$json"
    [[ "$total" -gt 0 ]] || echo "  (no checks reported yet)"
    echo "CHECKS: TIMEOUT after ${MAX_WAIT}s (is the ARC runner in kind running? see k8s/runner/RUNNER.md)"
    exit 1
  fi
  sleep "$INTERVAL"; waited=$((waited + INTERVAL))
done

jq -r '.[] | "  \(.bucket)\t\(.name)\t\(.link)"' <<<"$json"
failed="$(jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length' <<<"$json")"
if [[ "$failed" == 0 ]]; then
  echo "CHECKS: PASS"
  exit 0
fi

# Log các step lỗi (link dạng .../actions/runs/<run-id>/job/<job-id>)
for run in $(jq -r '.[] | select(.bucket == "fail") | .link' <<<"$json" | sed -nE 's#.*/actions/runs/([0-9]+).*#\1#p' | sort -u); do
  echo "----- failed steps of run $run (last 150 lines) -----"
  gh run view "$run" --log-failed 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -n 150
done
echo "CHECKS: FAIL"
exit 1
