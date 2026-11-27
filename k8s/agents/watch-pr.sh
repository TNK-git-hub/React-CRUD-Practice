#!/usr/bin/env bash
# Waits for the GitHub Actions of a PR to finish and prints the result; on failure, prints the logs of the failed steps.
#
# Usage:  bash k8s/agents/watch-pr.sh <pr-number|pr-url> [max-wait-seconds, default 1800]
#
# Last line: "CHECKS: PASS", "CHECKS: FAIL" (with the error logs above) or "CHECKS: TIMEOUT".
# Exit 0 only on PASS. A check stuck in pending for long usually means the ARC runner (kind) is down.
# Needs only gh (uses gh's built-in --jq), no jq install.
set -euo pipefail

[[ $# -ge 1 ]] || { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
PR="$1"; MAX_WAIT="${2:-1800}"; INTERVAL=20; waited=0

# Each line: "<bucket>\t<name>\t<link>". gh pr checks exits non-zero while checks are pending/failed -> ignore the exit code, keep the output.
checks() { gh pr checks "$PR" --json name,bucket,link --jq '.[] | "\(.bucket)\t\(.name)\t\(.link)"' 2>/dev/null || true; }
count() { grep -cE "$1" <<<"$2" || true; }

while true; do
  lines="$(checks)"
  total="$(count . "$lines")"
  pending="$(count '^pending' "$lines")"
  if [[ "$total" -gt 0 && "$pending" == 0 ]]; then break; fi
  if (( waited >= MAX_WAIT )); then
    [[ "$total" -gt 0 ]] && sed 's/^/  /' <<<"$lines" || echo "  (no checks reported yet)"
    echo "CHECKS: TIMEOUT after ${MAX_WAIT}s (check the run in the Actions tab: queued or stuck?)"
    exit 1
  fi
  sleep "$INTERVAL"; waited=$((waited + INTERVAL))
done

sed 's/^/  /' <<<"$lines"
failed="$(count '^(fail|cancel)' "$lines")"
if [[ "$failed" == 0 ]]; then
  echo "CHECKS: PASS"
  exit 0
fi

# Logs of the failed steps (links like .../actions/runs/<run-id>/job/<job-id>)
for run in $(grep '^fail' <<<"$lines" | cut -f3 | sed -nE 's#.*/actions/runs/([0-9]+).*#\1#p' | sort -u); do
  echo "----- failed steps of run $run (last 150 lines) -----"
  gh run view "$run" --log-failed 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -n 150
done
echo "CHECKS: FAIL"
exit 1
