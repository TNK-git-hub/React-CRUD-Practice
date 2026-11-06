#!/usr/bin/env bash
# Giao MỘT task cho một agent chạy headless trong pod (kind cluster), đợi xong, in kết quả.
#
# Usage (từ gốc repo):
#   bash k8s/agents/dispatch.sh <job-id> <task-file> --title "<PR title>" [--mode full|code-only] [--base level-3]
#                               [--no-wait] [--no-private] [--dry-run]
#
#   <job-id>     chữ thường, số, dấu "-" (vd: search-btn-yellow). Branch sẽ là agent/<job-id>-<timestamp>.
#   <task-file>  file markdown mô tả task (mục tiêu, file được sửa, tiêu chí xong). Xem tasks/EXAMPLE.md.
#   --mode       full (mặc định): plan → test-writer (RED) → code-writer (GREEN) → mutation + review → PR.
#                code-only: chỉ code-writer rồi mở PR (việc nhỏ, không cần test mới).
#   --base       branch để clone và mở PR vào (mặc định: level-3). Phải đã push lên origin.
#   --no-wait    tạo Job rồi thoát ngay, không theo dõi log.
#   --no-private không chạy hidden test (test/private, chỉ có trên máy này) trên branch của PR.
#   --dry-run    chỉ kiểm tra đầu vào và in manifest, KHÔNG tạo gì trong cluster.
#
# Muốn chạy song song: gọi nhiều lệnh cùng lúc (mỗi task một job-id khác nhau).
# Khi SUCCESS: in thêm "PRIVATE: PASS|FAIL|SKIPPED" (chỉ số lượng, không in nội dung test để không lộ cho agent).
# Dòng cuối luôn là "RESULT: SUCCESS pr=<url>" hoặc "RESULT: FAILED reason=<lý do>"; exit 0 chỉ khi SUCCESS.
set -euo pipefail

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
fail() { echo "RESULT: FAILED reason=$*"; exit 1; }

[[ $# -ge 2 ]] || usage
JOB_ID="$1"; TASK_FILE="$2"; shift 2
TITLE=""; BASE="level-3"; MODE="full"; WAIT=1; DRY=0; PRIVATE=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --no-private) PRIVATE=0; shift ;;
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
case "$MODE" in full) DEADLINE=5400 ;; code-only) DEADLINE=2400 ;; *) fail "invalid --mode '$MODE' (full|code-only)" ;; esac

render() {
  sed -e "s|__JOB_ID__|$JOB_ID|g" -e "s|__BASE_BRANCH__|$BASE|g" -e "s|__MODE__|$MODE|g" -e "s|__DEADLINE__|$DEADLINE|g" \
    "$DIR/job-template.yaml"
}
if [[ "$DRY" == 1 ]]; then
  kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" --dry-run=client -o yaml
  echo "---"
  render
  echo "RESULT: DRY-RUN job=agent-$JOB_ID base=$BASE mode=$MODE"
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
echo "Dispatched job agent-$JOB_ID (base: $BASE, mode: $MODE)"

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
# --- hidden test: test/private chỉ có trên máy này (gitignore), agent trong pod không bao giờ thấy ---
# Chạy trên branch của PR trong một git worktree tạm. Chỉ in số lượng pass/fail; log đầy đủ ở logs/ cho người dùng.
private_counts() { grep -E '^[[:space:]]*Tests[[:space:]]' "$1" | sed 's/\x1b\[[0-9;]*m//g' | tr -s ' ' | paste -sd ';' - || true; }
run_private() {
  local pr_url="$1" branch wt plog pkg have=0
  for pkg in backend frontend; do
    [[ -n "$(find "$ROOT/$pkg/test/private" -name '*.test.ts*' 2>/dev/null | head -n 1)" ]] && have=1
  done
  [[ "$have" == 1 ]] || { echo "PRIVATE: SKIPPED (no hidden tests on this machine)"; return 0; }
  branch="$(gh pr view "$pr_url" --json headRefName -q .headRefName)" || { echo "PRIVATE: SKIPPED (cannot read PR branch)"; return 0; }
  plog="$DIR/logs/$JOB_ID-private-$(date +%Y-%m-%dT%H-%M-%S).log"
  wt="$(mktemp -d)"
  echo "Running hidden tests on $branch -> ${plog#"$ROOT"/}"
  git -C "$ROOT" fetch -q origin "$branch"
  git -C "$ROOT" worktree add -q --detach "$wt" FETCH_HEAD
  for pkg in backend frontend; do
    if [[ -d "$ROOT/$pkg/test/private" ]]; then cp -R "$ROOT/$pkg/test/private" "$wt/$pkg/test/"; fi
  done
  if (cd "$wt" && pnpm install --frozen-lockfile --prefer-offline && pnpm test:private) > "$plog" 2>&1; then
    echo "PRIVATE: PASS ($(private_counts "$plog"))"
  else
    echo "PRIVATE: FAIL ($(private_counts "$plog")) - full log is for the user only, do not pass it to an agent: ${plog#"$ROOT"/}"
  fi
  git -C "$ROOT" worktree remove --force "$wt"
}
if [[ "$line" == "RESULT: SUCCESS"* && "$PRIVATE" == 1 ]]; then
  run_private "${line#RESULT: SUCCESS pr=}" || echo "PRIVATE: SKIPPED (error while running hidden tests)"
fi

echo "$line"
[[ "$line" == "RESULT: SUCCESS"* ]]
