#!/usr/bin/env bash
# Giao MỘT task cho một agent chạy headless trong pod (kind cluster), đợi xong, in kết quả.
#
# Usage (từ gốc repo):
#   bash k8s/agents/dispatch.sh <job-id> <task-file> --title "<PR title>" [--base level-3] [--no-wait]
#
#   <job-id>     chữ thường, số, dấu "-" (vd: search-btn-yellow). Branch sẽ là agent/<job-id>-<timestamp>.
#   <task-file>  file markdown mô tả task (mục tiêu, file được sửa, tiêu chí xong). Xem tasks/EXAMPLE.md.
#   --base       branch để clone và mở PR vào (mặc định: level-3). Phải đã push lên origin.
#   --no-wait    tạo Job rồi thoát ngay, không theo dõi log.
#   --dry-run    chỉ kiểm tra đầu vào và in manifest, KHÔNG tạo gì trong cluster.
#
# Muốn chạy song song: gọi nhiều lệnh cùng lúc (mỗi task một job-id khác nhau).
# Dòng cuối luôn là "RESULT: SUCCESS pr=<url>" hoặc "RESULT: FAILED reason=<lý do>"; exit 0 chỉ khi SUCCESS.
set -euo pipefail

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
fail() { echo "RESULT: FAILED reason=$*"; exit 1; }

[[ $# -ge 2 ]] || usage
JOB_ID="$1"; TASK_FILE="$2"; shift 2
TITLE=""; BASE="level-3"; WAIT=1; DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --no-wait) WAIT=0; shift ;;
    --dry-run) DRY=1; shift ;;
    *) usage ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/k8s/agents"

# --- kiểm tra đầu vào ---
[[ "$JOB_ID" =~ ^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$ ]] || fail "invalid job-id '$JOB_ID' (a-z, 0-9, '-', max 42 chars)"
[[ "$BASE" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "invalid base branch '$BASE'"
[[ -s "$TASK_FILE" ]] || fail "task file '$TASK_FILE' not found or empty"
[[ -n "${TITLE// }" ]] || fail "missing --title"

render() { sed -e "s|__JOB_ID__|$JOB_ID|g" -e "s|__BASE_BRANCH__|$BASE|g" "$DIR/job-template.yaml"; }
if [[ "$DRY" == 1 ]]; then
  kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" --dry-run=client -o yaml
  echo "---"
  render
  echo "RESULT: DRY-RUN job=agent-$JOB_ID base=$BASE"
  exit 0
fi

kubectl cluster-info >/dev/null 2>&1 || fail "kubernetes cluster not reachable (start kind: see k8s/agents/README.md)"
git -C "$ROOT" ls-remote --exit-code --heads origin "$BASE" >/dev/null 2>&1 || fail "branch '$BASE' does not exist on origin (push it first)"
if git -C "$ROOT" rev-parse --verify -q "$BASE" >/dev/null && git -C "$ROOT" rev-parse --verify -q "origin/$BASE" >/dev/null; then
  ahead="$(git -C "$ROOT" rev-list --count "origin/$BASE..$BASE")"
  [[ "$ahead" == 0 ]] || echo "WARN: local '$BASE' is $ahead commit(s) ahead of origin; the pod clones origin/$BASE"
fi

# --- tạo/cập nhật ConfigMap script + task, rồi Job ---
kubectl create configmap agent-script --from-file=run.sh="$DIR/run.sh" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl delete job "agent-$JOB_ID" --ignore-not-found --wait=true >/dev/null
kubectl delete configmap "task-$JOB_ID" --ignore-not-found >/dev/null
kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" >/dev/null
render | kubectl apply -f - >/dev/null
echo "Dispatched job agent-$JOB_ID (base: $BASE)"

[[ "$WAIT" == 1 ]] || { echo "RESULT: DISPATCHED job=agent-$JOB_ID"; exit 0; }

# --- theo dõi log ---
mkdir -p "$DIR/logs"
LOG="$DIR/logs/$JOB_ID-$(date +%Y-%m-%dT%H-%M-%S).log"
pod=""; phase=""
for _ in $(seq 1 300); do   # đợi tối đa 10 phút cho pod chạy (kéo image)
  pod="$(kubectl get pods -l job-name="agent-$JOB_ID" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  phase="$(kubectl get pod "$pod" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
  [[ "$phase" == Running || "$phase" == Succeeded || "$phase" == Failed ]] && break
  sleep 2
done
[[ -n "$pod" ]] || fail "pod for agent-$JOB_ID never started"
echo "Following pod $pod -> ${LOG#$ROOT/}"
{ echo "# job=agent-$JOB_ID pod=$pod base=$BASE"; kubectl logs -f "pod/$pod" 2>&1 || true; } > "$LOG"

line="$(grep -E '^==> RESULT: ' "$LOG" | tail -n 1 | sed 's/^==> //')"
if [[ -z "$line" ]]; then
  status="$(kubectl get job "agent-$JOB_ID" -o jsonpath='{.status.conditions[*].reason}' 2>/dev/null || true)"
  line="RESULT: FAILED reason=pod ended without a result line (job status: ${status:-unknown}); see ${LOG#$ROOT/}"
fi
echo "$line"
[[ "$line" == "RESULT: SUCCESS"* ]]
