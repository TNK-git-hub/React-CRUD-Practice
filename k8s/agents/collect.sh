#!/usr/bin/env bash
# Mở PR cho MỘT agent Job, trên máy người dùng: pod không có token ghi GitHub (xem run.sh, bước EXPORT).
#
# Usage (từ gốc repo):
#   bash k8s/agents/collect.sh <job-id> [--log <file>] [--base <branch>] [--dry-run]
#
#   <job-id>   như dispatch.sh. Không có --log: lấy log bằng `kubectl logs job/agent-<job-id>`.
#   --log      log đã lưu (dispatch.sh truyền file trong logs/).
#   --base     base branch đã dispatch (mặc định: dòng "Base branch" của CLAUDE.md); meta.json phải khớp một trong hai.
#   --dry-run  làm mọi bước trừ push và gh pr create, in các lệnh sẽ chạy.
#
# Marker CUỐI của job-id quyết định (của job khác: bỏ qua): khối BEGIN..END, hoặc "ARTIFACT NONE" -> FAILED, không PR.
# base64 -d; tar chỉ có branch.bundle, meta.json, pr-body.md; kiểm meta; fetch bundle; mọi file đổi phải nằm trong vùng
# của agent (AGENT_AREAS); git push origin <branch> (không force: đã có trên origin -> FAILED); gh pr create (--draft).
# Nội dung artifact do pod (agent) tạo ra: chỉ dùng như dữ liệu. Không eval, không chạy file nào trong đó; branch, title,
# base kiểm bằng regex chặt trước khi đưa vào lệnh (luôn là đối số riêng, không qua shell).
# Dòng cuối: "RESULT: SUCCESS pr=<url>" | "RESULT: FAILED reason=<lý do>[ pr=<url>]" (định dạng cũ của dispatch.sh)
#            | "RESULT: DRY-RUN ..." với --dry-run.
set -euo pipefail

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
fail() { echo "RESULT: FAILED reason=$*"; exit 1; }

[[ $# -ge 1 ]] || usage
JOB_ID="$1"; shift
LOG=""; BASE=""; DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --log) LOG="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) usage ;;
  esac
done
[[ "$JOB_ID" =~ ^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$ ]] || fail "invalid job-id '$JOB_ID'"
[[ -z "$BASE" || "$BASE" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "invalid --base '$BASE'"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLAUDE_BASE="$(sed -nE 's/^- Base branch: `([^`]+)`.*/\1/p' "$ROOT/CLAUDE.md" 2>/dev/null | head -n 1 || true)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# --- log ---
if [[ -z "$LOG" ]]; then
  LOG="$TMP/pod.log"
  kubectl logs "job/agent-$JOB_ID" > "$LOG" 2>/dev/null || fail "kubectl logs job/agent-$JOB_ID failed (job gone? pass --log)"
fi
[[ -f "$LOG" ]] || fail "log file '$LOG' not found"

# --- the LAST marker of this job id wins: a complete BEGIN..END block, or "ARTIFACT NONE" (markers of other ids are
# ignored). The pod prints its own marker on exit, after everything else, so an ARTIFACT block printed earlier by
# test output or agent code is never the last one.
marker="$(awk -v id="$JOB_ID" -v out="$TMP/artifact.b64" '
  $0 == "==> ARTIFACT BEGIN " id { inb = 1; buf = ""; next }
  $0 == "==> ARTIFACT END " id   { if (inb) { last = buf; state = "BLOCK" } inb = 0; next }
  $0 == "==> ARTIFACT NONE " id  { inb = 0; state = "NONE"; next }
  inb                            { buf = buf $0 "\n" }
  END                            { if (state == "BLOCK") printf "%s", last > out; print (state == "" ? "MISSING" : state) }
' "$LOG")"
case "$marker" in
  BLOCK) ;;
  NONE) fail "the pod reported ARTIFACT NONE for job $JOB_ID (no commit, or its export failed): no PR" ;;
  *) fail "no ARTIFACT marker for job $JOB_ID in the log (the log is cut, or the pod did not get to its exit)" ;;
esac
[[ -s "$TMP/artifact.b64" ]] || fail "the ARTIFACT block of job $JOB_ID is empty"
(( $(wc -c < "$TMP/artifact.b64") <= 6 * 1024 * 1024 )) || fail "ARTIFACT block too large"
grep -qvE '^[A-Za-z0-9+/=]*$' "$TMP/artifact.b64" && fail "artifact is not valid base64 (unexpected characters)"
base64 --decode < "$TMP/artifact.b64" > "$TMP/artifact.tgz" 2>/dev/null || fail "artifact is not valid base64"

# --- tar: exactly three regular files, no paths ---
listing="$(tar -tvzf "$TMP/artifact.tgz" 2>/dev/null)" || fail "artifact is not a valid tar.gz"
names="$(tar -tzf "$TMP/artifact.tgz" | sort | paste -sd' ' -)"
[[ "$names" == "branch.bundle meta.json pr-body.md" ]] || fail "artifact must hold exactly branch.bundle, meta.json, pr-body.md (got: $names)"
grep -qv '^-' <<<"$listing" && fail "artifact holds something other than regular files"
mkdir -p "$TMP/a"
tar -xzf "$TMP/artifact.tgz" -C "$TMP/a" branch.bundle meta.json pr-body.md
(( $(wc -c < "$TMP/a/pr-body.md") <= 65536 )) || fail "pr-body.md is larger than 64 KiB"

# --- meta.json: read as data (NUL-separated fields), then strict checks ---
fields=()
while IFS= read -r -d '' f; do fields+=("$f"); done < <(python3 -c '
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
if not isinstance(m, dict):
    sys.exit(1)
keys = ("job_id", "branch", "base_branch", "base_sha", "title", "draft", "result_reason", "bug")
for k in keys:
    v = m.get(k)
    if k == "draft":
        if not isinstance(v, bool):
            sys.exit(1)
        v = "true" if v else "false"
    elif not isinstance(v, str) or "\0" in v:
        sys.exit(1)
    sys.stdout.write(v + "\0")
' "$TMP/a/meta.json" 2>/dev/null) || true
[[ ${#fields[@]} -eq 8 ]] || fail "meta.json is not valid (needs job_id, branch, base_branch, base_sha, title, draft, result_reason, bug)"
M_JOB="${fields[0]}"; M_BRANCH="${fields[1]}"; M_BASE="${fields[2]}"; M_SHA="${fields[3]}"
M_TITLE="${fields[4]}"; M_DRAFT="${fields[5]}"; M_REASON="${fields[6]}"; M_BUG="${fields[7]}"
[[ -z "$M_BUG" || "$M_BUG" =~ ^[0-9]{8}-[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "meta.json bug '$M_BUG' is not a bug id"
[[ "$M_JOB" == "$JOB_ID" ]] || fail "meta.json job_id '$M_JOB' is not $JOB_ID"
[[ "$M_BRANCH" =~ ^agent/${JOB_ID}-[0-9]+$ ]] || fail "meta.json branch '$M_BRANCH' does not match agent/${JOB_ID}-<number>"
[[ "$M_BASE" =~ ^[A-Za-z0-9._/-]+$ && ( "$M_BASE" == "$CLAUDE_BASE" || ( -n "$BASE" && "$M_BASE" == "$BASE" ) ) ]] \
  || fail "meta.json base_branch '$M_BASE' is neither the Base branch of CLAUDE.md ('$CLAUDE_BASE') nor --base ('$BASE')"
[[ "$M_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "meta.json base_sha is not a commit id"
[[ "$M_TITLE" =~ ^[A-Za-z0-9][A-Za-z0-9\ ._,:\;\(\)/#+\'\"\&-]{0,199}$ ]] || fail "meta.json title has characters outside the allowed set or is too long"
M_REASON="$(printf '%s' "$M_REASON" | tr -d '\000-\037' | cut -c1-500)"

# --- bundle into the local repo ---
git -C "$ROOT" fetch -q origin "$M_BASE" || fail "git fetch origin $M_BASE failed"
git -C "$ROOT" cat-file -e "${M_SHA}^{commit}" 2>/dev/null || fail "base_sha ${M_SHA:0:12} is not in origin/$M_BASE (fetch it first)"
git -C "$ROOT" bundle verify "$TMP/a/branch.bundle" >/dev/null 2>&1 || fail "branch.bundle does not verify against the local repo"
git -C "$ROOT" ls-remote --exit-code --heads origin "$M_BRANCH" >/dev/null 2>&1 \
  && fail "branch $M_BRANCH already exists on origin (not forcing; delete it or dispatch again)"
LOCAL_REF="refs/heads/$M_BRANCH"
[[ "$DRY" == 1 ]] && LOCAL_REF="refs/collect-dry-run/$M_BRANCH"   # dry run: a scratch ref, removed below
git -C "$ROOT" rev-parse --verify -q "$LOCAL_REF" >/dev/null && fail "local ref $LOCAL_REF already exists"
git -C "$ROOT" fetch -q "$TMP/a/branch.bundle" "HEAD:$LOCAL_REF" || fail "git fetch from branch.bundle failed"
git -C "$ROOT" merge-base --is-ancestor "$M_SHA" "$LOCAL_REF" || fail "the bundle's branch does not start from base_sha"
commits="$(git -C "$ROOT" rev-list --count "${M_SHA}..${LOCAL_REF}")"

# --- re-check on the host: every changed path (deleted and renamed ones too: --no-renames lists both sides) must be in
# an area the pod lets its agents write: pod.agentAreas of .claude/harness.json (the same areas as the gates of run.sh)
AGENT_AREAS="$(python3 "$ROOT/.specify/scripts/harness_config.py" get pod.agentAreas --regex --root "$ROOT")" \
  || { git -C "$ROOT" update-ref -d "$LOCAL_REF"; fail "harness.json missing or invalid (see harness_config.py above)"; }
[[ -n "$M_BUG" ]] && AGENT_AREAS="${AGENT_AREAS%)/}|bugs/${M_BUG})/"   # bug mode: the record of THIS bug only
outside="$(git -C "$ROOT" diff --no-renames --name-only "${M_SHA}...${LOCAL_REF}" | grep -Ev "$AGENT_AREAS" || true)"
if [[ -n "$outside" ]]; then
  git -C "$ROOT" update-ref -d "$LOCAL_REF"   # never keep a ref that will not be pushed
  fail "branch touches files outside the agent areas: $(paste -sd' ' - <<<"$outside")"
fi
echo "Branch $M_BRANCH: $commits commit(s) on $M_BASE @ ${M_SHA:0:8}, draft=$M_DRAFT"
git -C "$ROOT" --no-pager log --oneline "${M_SHA}..${LOCAL_REF}"

DRAFT=(); [[ "$M_DRAFT" == true ]] && DRAFT=(--draft)
if [[ "$DRY" == 1 ]]; then
  git -C "$ROOT" update-ref -d "$LOCAL_REF"
  echo "DRY-RUN: git push origin refs/heads/$M_BRANCH:refs/heads/$M_BRANCH   (after fetching the bundle into refs/heads/$M_BRANCH)"
  echo "DRY-RUN: gh pr create --base $M_BASE --head $M_BRANCH ${DRAFT[*]:-} --title \"$M_TITLE\" --body-file <pr-body.md>"
  echo "RESULT: DRY-RUN job=$JOB_ID branch=$M_BRANCH commits=$commits draft=$M_DRAFT"
  exit 0
fi

git -C "$ROOT" push origin "refs/heads/$M_BRANCH:refs/heads/$M_BRANCH" || fail "git push origin $M_BRANCH failed"
PR_URL="$(cd "$ROOT" && gh pr create --base "$M_BASE" --head "$M_BRANCH" ${DRAFT[@]+"${DRAFT[@]}"} \
  --title "$M_TITLE" --body-file "$TMP/a/pr-body.md")" || fail "gh pr create failed (branch $M_BRANCH is pushed)"
PR_URL="$(tail -n 1 <<<"$PR_URL")"
if [[ "$M_DRAFT" == true ]]; then
  echo "RESULT: FAILED reason=${M_REASON:-pipeline failed} pr=${PR_URL}"
  exit 1
fi
echo "RESULT: SUCCESS pr=${PR_URL}"
