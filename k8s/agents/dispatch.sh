#!/usr/bin/env bash
# Giao MỘT task cho một agent chạy headless trong pod (kind cluster), đợi xong, in kết quả.
#
# Usage (từ gốc repo):
#   bash k8s/agents/dispatch.sh <job-id> <task-file|-> --title "<PR title>" [--mode full|code-only] [--base level-3]
#                               [--change NNN-<feature> [--tasks T001,T002]] [--no-wait] [--no-private] [--dry-run]
#
#   <job-id>     chữ thường, số, dấu "-" (vd: search-btn-yellow). Branch sẽ là agent/<job-id>-<timestamp>.
#   <task-file>  file markdown mô tả task (mục tiêu, file được sửa, tiêu chí xong). Xem tasks/EXAMPLE.md.
#                "-" (chỉ khi có --change): task sinh tự động từ spec.
#   --change     làm theo spec của spec harness: specs/changes/NNN-<feature>/ (spec.md, plan.md, tasks.md, checklists/).
#                Cả thư mục specs/ ở máy này được gửi vào pod, nên spec chưa commit vẫn dùng được (không lọt vào PR).
#   --tasks      chỉ làm các task này trong tasks.md (mặc định: mọi task). Scenario của chúng phải có test.
#   --mode       full (mặc định): plan → test-writer (RED) → code-writer (GREEN) → mutation + review → PR.
#                code-only: chỉ code-writer rồi mở PR (việc nhỏ, không cần test mới).
#   --base       branch để clone và mở PR vào (mặc định: level-3). Phải đã push lên origin.
#   --no-wait    tạo Job rồi thoát ngay, không theo dõi log.
#   --no-private không chạy hidden test (test/private, chỉ có trên máy này) trên branch của PR.
#   --dry-run    chỉ kiểm tra đầu vào và in manifest, KHÔNG tạo gì trong cluster.
#
# Muốn chạy song song: gọi nhiều lệnh cùng lúc (mỗi task một job-id khác nhau).
# Khi có PR (SUCCESS, hoặc FAILED kèm PR draft): in thêm "PRIVATE: PASS|FAIL|SKIPPED" (chỉ số lượng, không in nội dung test để không lộ cho agent).
# Dòng cuối luôn là "RESULT: SUCCESS pr=<url>" hoặc "RESULT: FAILED reason=<lý do>"; exit 0 chỉ khi SUCCESS.
set -euo pipefail

usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
fail() { echo "RESULT: FAILED reason=$*"; exit 1; }

[[ $# -ge 2 ]] || usage
JOB_ID="$1"; TASK_FILE="$2"; shift 2
TITLE=""; BASE="level-3"; MODE="full"; WAIT=1; DRY=0; PRIVATE=1; CHANGE=""; SPEC_TASKS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --change) CHANGE="${2:-}"; shift 2 ;;
    --tasks) SPEC_TASKS="${2:-}"; shift 2 ;;
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
[[ -n "${TITLE// }" ]] || fail "missing --title"
case "$MODE" in full) DEADLINE=5400 ;; code-only) DEADLINE=2400 ;; *) fail "invalid --mode '$MODE' (full|code-only)" ;; esac

# --- spec (tùy chọn) ---
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SPEC_ARGS=()
if [[ -n "$CHANGE" ]]; then
  [[ "$CHANGE" =~ ^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "invalid --change '$CHANGE' (NNN-<feature>)"
  [[ -z "$SPEC_TASKS" || "$SPEC_TASKS" =~ ^T[0-9]+(,T[0-9]+)*$ ]] || fail "invalid --tasks '$SPEC_TASKS' (T001,T002)"
  CDIR="$ROOT/specs/changes/$CHANGE"
  [[ -f "$CDIR/spec.md" && -f "$CDIR/tasks.md" ]] || fail "specs/changes/$CHANGE/spec.md or tasks.md not found"
  for t in ${SPEC_TASKS//,/ }; do
    grep -qE "^[[:space:]]*- \[[ xX]\] ${t}([^0-9]|\$)" "$CDIR/tasks.md" || fail "task $t not found in specs/changes/$CHANGE/tasks.md"
  done
  # specs/archive không cần cho agent; bỏ file rác của macOS
  COPYFILE_DISABLE=1 tar -C "$ROOT" --exclude '.DS_Store' --exclude 'specs/archive' -czf "$TMP/spec.tgz" specs
  [[ "$(wc -c < "$TMP/spec.tgz")" -lt 900000 ]] || fail "specs/ is too big for a ConfigMap (max ~1 MiB)"
  SPEC_ARGS=(--from-file=spec.tgz="$TMP/spec.tgz" --from-literal=change.txt="$CHANGE" --from-literal=tasks.txt="$SPEC_TASKS")
elif [[ -n "$SPEC_TASKS" ]]; then
  fail "--tasks needs --change"
fi
if [[ "$TASK_FILE" == "-" ]]; then
  [[ -n "$CHANGE" ]] || fail "task file '-' needs --change"
  TASK_FILE="$TMP/task.md"
  cat > "$TASK_FILE" <<EOF
## Goal
Implement ${SPEC_TASKS:+tasks ${SPEC_TASKS} of }change \`${CHANGE}\` exactly as its spec says (see the Spec section below).

## Files you may change
- The paths named in the task lines and in plan.md, inside \`backend/src\`, \`frontend/src\`, \`frontend/public\`
- Tests: \`backend/test/public/\`, \`frontend/test/public/\` (test-writer only, --mode full)

## Out of scope
- Tasks of tasks.md not listed below, and any behaviour the spec does not ask for.
- Any file under \`specs/\`.

## Done when
- Every scenario listed below has a passing test whose name starts with its ID.
- \`pnpm ci:local\` prints CI PASSED.
EOF
fi
[[ -s "$TASK_FILE" ]] || fail "task file '$TASK_FILE' not found or empty"

render() {
  sed -e "s|__JOB_ID__|$JOB_ID|g" -e "s|__BASE_BRANCH__|$BASE|g" -e "s|__MODE__|$MODE|g" -e "s|__DEADLINE__|$DEADLINE|g" \
    "$DIR/job-template.yaml"
}
if [[ "$DRY" == 1 ]]; then
  # spec.tgz (nhị phân) không in ra: chỉ liệt kê nội dung
  kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" \
    ${CHANGE:+--from-literal=change.txt="$CHANGE" --from-literal=tasks.txt="$SPEC_TASKS"} --dry-run=client -o yaml
  if [[ -n "$CHANGE" ]]; then echo "# spec.tgz ($(wc -c < "$TMP/spec.tgz" | tr -d ' ') bytes):"; tar -tzf "$TMP/spec.tgz" | sed 's/^/#   /'; fi
  echo "---"
  render
  echo "RESULT: DRY-RUN job=agent-$JOB_ID base=$BASE mode=$MODE${CHANGE:+ change=$CHANGE tasks=${SPEC_TASKS:-all}}"
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
kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" ${SPEC_ARGS[@]+"${SPEC_ARGS[@]}"} >/dev/null
render | kubectl apply -f - >/dev/null
echo "Dispatched job agent-$JOB_ID (base: $BASE, mode: $MODE${CHANGE:+, change: $CHANGE, tasks: ${SPEC_TASKS:-all}})"

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
# Có PR là chạy, kể cả PR draft (FAILED vì review không qua): người dùng cần biết code có đúng không để quyết định
PR_IN_LINE="$(sed -nE 's/.*[[:space:]]pr=([^[:space:]]+).*/\1/p' <<<"$line")"
if [[ -n "$PR_IN_LINE" && "$PRIVATE" == 1 ]]; then
  run_private "$PR_IN_LINE" || echo "PRIVATE: SKIPPED (error while running hidden tests)"
fi

echo "$line"
[[ "$line" == "RESULT: SUCCESS"* ]]
