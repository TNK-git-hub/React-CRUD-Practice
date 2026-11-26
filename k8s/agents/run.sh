#!/usr/bin/env bash
# Chạy trong pod của một agent Job (mount qua ConfigMap "agent-script").
# Task KHÔNG viết cứng: đọc từ /task/task.md (ConfigMap "task-<JOB_ID>" do dispatch.sh tạo).
#
# MODE=full (mặc định), mỗi bước là một session `claude -p --agent <vai>` mới, không chung ngữ cảnh:
#   1. PLAN    code-planner + test-planner (chỉ đọc) → /tmp/plan/*.md (ngoài repo)
#   2. RED     test-writer viết test → gate: chỉ sửa test/public, test mới phải FAIL → commit "test: ..."
#   3. GREEN   code-writer viết code → gate: chỉ sửa src, không có code dò môi trường test,
#              pnpm ci:local pass (tối đa MAX_FIX_ATTEMPTS vòng sửa) → commit
#              code-writer ghi "TEST_WRONG: ..." → test-critic làm trọng tài (1 lần/task): test sai thì test-writer sửa assert đó
#   4. REVIEW  mutation score (Stryker, do script chạy) + code-reviewer + test-critic + security-reviewer (chỉ đọc)
#              → cần sửa thì quay lại bước 2/3 kèm nhận xét, tối đa REVIEW_ROUNDS vòng
#              security-reviewer CHANGES: test-writer writes a test per HIGH/MEDIUM finding, code-writer fixes it;
#              a SPEC_PROBLEM line in the security review (permissions) stops the review: draft PR, back to the spec harness
#   5. EXPORT  PR body; on exit the branch is printed as an artifact (git bundle + meta.json + pr-body.md) in the log.
#              The pod has no GitHub write token: k8s/agents/collect.sh on the user's machine pushes the branch and
#              opens the PR (draft when the run FAILED after its first commit)
# MODE=code-only: luồng cũ, chỉ có bước 3 rồi EXPORT.
#
# Spec (tùy chọn, dispatch.sh --change NNN-<feature> [--tasks T001,T002]): task được nối thêm mục "## Spec" trỏ tới
# specs/changes/<change>/ (cấu trúc: specs/changes/.gitkeep). Agent CODE đọc
# spec.md + plan.md + tasks.md, agent TEST đọc scenario + edge case + Test Strategy. Thêm 2 gate:
#   - không ai được sửa specs/ (checksum, kể cả file spec chưa commit được gửi qua ConfigMap)
#   - mỗi scenario ID của các task được giao phải có test mang tên bắt đầu bằng ID đó (chặn duyệt ở REVIEW)
#
# Bug (optional, dispatch.sh --bug <id>, MODE=full): steps f-g of the bug flow (skill bug-fix-flow), after the user
# approved the root cause and the reproduction test in their own terminal (steps a-e stay interactive):
#   - /task/bug.tgz holds bugs/<id>/ and the reproduction test; approval.py verify --bug <id> must pass in the pod
#   - first commit "docs: bug record <id>" (bugs/<id>/ only); task gets a "## Bug (source of truth)" section
#   - PLAN is skipped: code plan = the approved Root cause section; RED = the reproduction test (no test-writer) must
#     FAIL, scenario gate on the bug's scenario ID → commit "test: reproduce bug <id>"; then GREEN, REVIEW, PR as usual
#   - checksum of bugs/<id>/ + the reproduction test: every gate fails if an agent changed them; the test cannot be
#     DELETEd; approval.py verify runs again before the PR
#
# Gate do script chạy SAU khi agent đã thoát, so với SHA của commit trước bước đó (script giữ SHA, agent không với tới):
# agent dùng cách nào để ghi file (Edit, Bash, chạy code qua vitest...) thì vẫn bị bắt.
# Dòng cuối log luôn là "==> RESULT: SUCCESS artifact=ready" hoặc "==> RESULT: FAILED reason=<lý do>[ artifact=ready]"
# (artifact=ready: the ARTIFACT block above it holds the branch; collect.sh turns it into "RESULT: ... pr=<url>").
set -euo pipefail

# Không sinh file core dump khi process crash: file "core" ở gốc repo sẽ làm gate assert_only fail oan
ulimit -c 0

MODE="${MODE:-full}"
MAX_FIX_ATTEMPTS="${MAX_FIX_ATTEMPTS:-2}"
REVIEW_ROUNDS="${REVIEW_ROUNDS:-2}"
MUTATION_MIN="${MUTATION_MIN:-70}"

log() { echo "==> [${JOB_ID}] $*"; }
stage() { echo; echo "==> [${JOB_ID}] ===== $* ====="; }
strip_colors() { sed 's/\x1b\[[0-9;]*m//g'; }

RESULT="FAILED reason=script exited early (see the last ==> step)"
fail() { RESULT="FAILED reason=$*"; exit 1; }

# >>> export (self-contained: the harness simulation extracts this block and sources it)
# EXPORT: the pod has no GitHub write token. When the branch has commits, the pod prints them as a git bundle +
# meta.json + pr-body.md (tar.gz, base64, 76 columns) between the lines "==> ARTIFACT BEGIN <job>" and
# "==> ARTIFACT END <job>". k8s/agents/collect.sh, on the user's machine, checks it, pushes the branch, opens the PR.
# Any exit after the first commit exports (a FAILED run becomes a draft PR); no commit -> nothing to export.
ARTIFACT_MAX=$((5 * 1024 * 1024))   # bytes of base64
EXPORT_ERR=""
export_artifact() {
  local draft="$1" reason="$2" dir=/tmp/export b64
  rm -rf "$dir"; mkdir -p "$dir" || { EXPORT_ERR="cannot create $dir"; return 1; }
  git bundle create "$dir/branch.bundle" "${BASE_SHA}..HEAD" >/dev/null 2>&1 || { EXPORT_ERR="git bundle create failed"; return 1; }
  git bundle verify "$dir/branch.bundle" >/dev/null 2>&1 || { EXPORT_ERR="git bundle verify failed"; return 1; }
  if [[ -s /tmp/out/pr-body.md ]]; then
    cp /tmp/out/pr-body.md "$dir/pr-body.md"
  else
    printf '## Task\n%s\n\nThe pipeline stopped before the PR step: %s\n' "${TASK:-}" "$reason" > "$dir/pr-body.md"
  fi
  M_BRANCH="${BRANCH:-}" M_BASE="${BASE_BRANCH:-}" M_SHA="${BASE_SHA:-}" M_TITLE="${PR_TITLE:-}" M_DRAFT="$draft" \
  M_REASON="$reason" M_JOB="${JOB_ID:-}" M_MODE="${MODE:-}" M_CHANGE="${CHANGE:-}" M_BUG="${BUG:-}" node -e '
    const e = process.env;
    require("fs").writeFileSync(process.argv[1], JSON.stringify({
      branch: e.M_BRANCH, base_branch: e.M_BASE, base_sha: e.M_SHA, title: e.M_TITLE, draft: e.M_DRAFT === "true",
      result_reason: e.M_REASON, job_id: e.M_JOB, mode: e.M_MODE, change: e.M_CHANGE, bug: e.M_BUG,
    }, null, 2) + "\n");
  ' "$dir/meta.json" || { EXPORT_ERR="cannot write meta.json"; return 1; }
  tar -czf "$dir/artifact.tgz" -C "$dir" branch.bundle meta.json pr-body.md || { EXPORT_ERR="tar failed"; return 1; }
  b64="$(base64 < "$dir/artifact.tgz" | tr -d '\n')"
  if (( ${#b64} > ARTIFACT_MAX )); then
    EXPORT_ERR="artifact is ${#b64} bytes in base64 (max ${ARTIFACT_MAX}): too many or too big commits"; return 1
  fi
  echo "==> ARTIFACT BEGIN ${JOB_ID}"
  fold -w 76 <<<"$b64"
  echo "==> ARTIFACT END ${JOB_ID}"
}
on_exit() {
  set +e
  local commits=0 draft=true reason
  if [[ -n "${BASE_SHA:-}" ]] && git rev-parse --git-dir >/dev/null 2>&1; then
    commits="$(git rev-list --count "${BASE_SHA}..HEAD" 2>/dev/null || echo 0)"
  fi
  if (( commits > 0 )); then
    reason="${RESULT#FAILED reason=}"
    if [[ "$RESULT" == SUCCESS* ]]; then draft=false; reason=""; fi
    log "EXPORT: ${commits} commit(s) on ${BRANCH:-?} (draft=${draft}); the host pushes and opens the PR (collect.sh)"
    if export_artifact "$draft" "$reason"; then
      RESULT="${RESULT} artifact=ready"
    else
      RESULT="FAILED reason=artifact export failed: ${EXPORT_ERR} (pipeline result: ${RESULT})"
    fi
  fi
  echo "==> RESULT: ${RESULT}"
}
# <<< export
trap on_exit EXIT

TASK="$(cat /task/task.md)"
PR_TITLE="$(head -n 1 /task/title.txt)"
BRANCH_PREFIX="agent/${JOB_ID}"
[[ -n "${TASK// }" ]] || fail "empty task"
[[ -n "${PR_TITLE// }" ]] || fail "empty PR title"
[[ "$MODE" == full || "$MODE" == code-only ]] || fail "unknown MODE '$MODE'"

# ---------- phân quyền theo vai (allow-list, không phải deny-list) ----------
SRC_RE='^(backend/src|frontend/src|frontend/public)/'
TEST_RE='^(backend|frontend)/test/public/'
# Code dò môi trường test để trả kết quả giả: không có lý do chính đáng nào để có trong src
ENV_SNIFF_RE='vitest|\bjest\b|__TEST__|NODE_ENV[[:space:]]*[!=]==?[[:space:]]*["'"'"']test'

# Liệt kê lệnh cụ thể, không dùng "pnpm --filter:*" (nó cho cả "pnpm --filter x exec <lệnh bất kỳ>")
TEST_CMDS=("Bash(pnpm test)" "Bash(pnpm --filter backend test:*)" "Bash(pnpm --filter frontend test:*)")
GIT_READ=("Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)")
# strict type check of the test files (constitution Principle IV), also run by ci:local
TYPECHECK_TEST=("Bash(pnpm --filter backend typecheck:test)" "Bash(pnpm --filter frontend typecheck:test)")
TOOLS_PLANNER=("Read" "Glob" "Grep")
TOOLS_TEST_WRITER=("Read" "Edit" "Write" "Glob" "Grep" "${TEST_CMDS[@]}" "${GIT_READ[@]}" "${TYPECHECK_TEST[@]}"
  "Bash(pnpm lint)" "Bash(pnpm --filter frontend typecheck)")
TOOLS_CODE_WRITER=("Read" "Edit" "Write" "Glob" "Grep" "${TEST_CMDS[@]}" "${GIT_READ[@]}" "${TYPECHECK_TEST[@]}"
  "Bash(pnpm ci:local)" "Bash(pnpm lint)" "Bash(pnpm --filter frontend lint)" "Bash(pnpm --filter frontend typecheck)"
  "Bash(pnpm --filter frontend build)" "Bash(pnpm --filter backend build)")
TOOLS_REVIEWER=("Read" "Glob" "Grep" "${TEST_CMDS[@]}" "${GIT_READ[@]}" "${TYPECHECK_TEST[@]}" "Bash(pnpm lint)" "Bash(pnpm --filter frontend typecheck)")

RULES_CODE="Follow CLAUDE.md. Make the smallest change that completes the task; do not touch unrelated files.
You may only change files in backend/src, frontend/src, frontend/public.
Do not change tests, CI, lint, TypeScript, package or .claude configuration, and do not add eslint-disable or @ts-ignore comments.
Never make code behave differently under test (no checks on VITEST, NODE_ENV === 'test', etc.) and never special-case the exact inputs used in tests: implement the behaviour in general.
If you believe a test is wrong, stop and explain why instead of working around it.
If you are sure an assertion contradicts the task (not just your implementation), also add one line per assertion:
\`TEST_WRONG: <file>:<line> <why>\` at the start of a line in your answer. An independent reviewer then decides
whether the test or the code is wrong (this happens at most once per task).
When you are done, run \`pnpm ci:local\` (exactly that command) and fix what it reports until it prints CI PASSED."

RULES_TEST="Follow CLAUDE.md and the writing-good-tests skill. You may only create or change files in backend/test/public and frontend/test/public.
Do not change production code, test config, package.json or .claude. Only mock slow or external things (HTTP, DB, Redis); never assert on mocks.
Each test must name the bug it catches; expected values are fixed literals or computed by hand, never by calling the code under test."

# ---------- helper ----------
# run_agent <vai> <file output> <prompt> <tools...>: một session mới, output lưu vào file và in ra log
run_agent() {
  local agent="$1" out="$2" prompt="$3"; shift 3
  log "agent ${agent} starting"
  if ! claude -p --agent "$agent" "$prompt" --allowedTools "$@" > "$out" 2>&1; then
    log "agent ${agent} exited non-zero (gates below still decide)"
  fi
  sed 's/^/    | /' "$out"
}

# File đã đổi so với một SHA (cả file mới chưa track, cả file bị xoá)
changed_since() { { git diff --no-renames --name-only "$1"; git ls-files --others --exclude-standard; } | sort -u; }

# Checksum toàn bộ specs/ (cả file đã commit lẫn file spec gửi qua ConfigMap, bị git bỏ qua)
spec_sum() { find specs -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}'; }

# Bug mode: checksum of the bug record and the reproduction test (both approved by the user, read-only in the pod)
bug_sum() {
  { find "bugs/${BUG}" -type f -print0 2>/dev/null; printf '%s\0' "$REPRO"; } \
    | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}'
}

# assert_only <sha> <regex> <vai>: mọi file đổi kể từ <sha> phải khớp <regex>
assert_only() {
  local sha="$1" re="$2" who="$3" bad
  git merge-base --is-ancestor "$sha" HEAD || fail "${who}: git history was rewritten (commit ${sha:0:8} is gone)"
  if [[ -n "$CHANGE" && "$(spec_sum)" != "$SPEC_SUM" ]]; then
    log "${who} modified files under specs/ (the spec is read-only for the CODE and TEST harnesses), NOT opening a PR"
    fail "${who} modified the spec"
  fi
  if [[ -n "$BUG" && "$(bug_sum)" != "$BUG_SUM" ]]; then
    log "${who} modified bugs/${BUG}/ or the reproduction test ${REPRO} (approved by the user, read-only here), NOT opening a PR"
    fail "${who} modified the bug record or the reproduction test"
  fi
  bad="$(changed_since "$sha" | grep -Ev "$re" || true)"
  if [[ -n "$bad" ]]; then
    log "${who} changed files outside its allowed area, NOT opening a PR:"
    echo "$bad" | sed 's/^/    /'
    fail "${who} changed files outside its allowed area"
  fi
}

assert_no_env_sniff() {
  local hits
  hits="$(git diff "$1" -- backend/src frontend/src | grep -E '^\+' | grep -Ei "$ENV_SNIFF_RE" || true)"
  if [[ -n "$hits" ]]; then
    log "production code checks for the test environment:"
    echo "$hits" | sed 's/^/    /'
    fail "production code checks for the test environment"
  fi
}

# Không có gì để commit thì giữ nguyên HEAD (vd sau trọng tài, code đã được commit sẵn)
commit_stage() { git add -A; git diff --cached --quiet || git commit -q -m "$1"; git rev-parse HEAD; }

# test-writer không có quyền xoá file (pod không cho Bash rm): nó ghi dòng "DELETE: <path>" trong câu trả lời,
# script xoá giúp, nhưng CHỈ file trong test/public do chính branch này tạo ra (không có ở BASE_SHA).
# Nhờ vậy review có thể đòi xoá test vô nghĩa, mà agent vẫn không xoá được test có sẵn để cho dễ pass.
apply_test_deletions() {
  local out="$1" p
  while read -r p; do
    [[ -n "$p" ]] || continue
    if [[ -n "$BUG" && "$p" == "$REPRO" ]]; then
      log "DELETE ignored (reproduction test of bug ${BUG}): $p"; continue
    fi
    if [[ ! "$p" =~ ^(backend|frontend)/test/public/[A-Za-z0-9._/-]+$ || "$p" == *..* ]]; then
      log "DELETE ignored (not under test/public): $p"; continue
    fi
    if git cat-file -e "${BASE_SHA}:${p}" 2>/dev/null; then
      log "DELETE ignored (file existed before this branch): $p"; continue
    fi
    [[ -f "$p" ]] || { log "DELETE ignored (no such file): $p"; continue; }
    rm -f -- "$p"
    log "DELETE: removed $p (requested by test-writer)"
  done < <({ grep -Eo '^[[:space:]]*DELETE: [^[:space:]]+' "$out" || true; } | sed -E 's/^[[:space:]]*DELETE: //; s/`//g' | sort -u)
}

# Trọng tài: code-writer khẳng định test sai (dòng "TEST_WRONG:"), CI fail. Tối đa 1 lần mỗi task (mode full).
# test-critic (chỉ đọc) phán theo spec của task:
#   TESTS_WRONG -> chốt code hiện tại (commit "wip"), test-writer sửa đúng các assert bị phán sai -> commit; ARB_SHA = mốc mới cho gate
#   CODE_WRONG / không có phán quyết -> code-writer sửa tiếp, kèm lập luận của trọng tài (ARB_NOTE)
# Gate vẫn giữ nguyên: code-writer chỉ src, test-writer chỉ test/public; test sau đó còn qua mutation + test-critic ở REVIEW.
arbitrate() {
  local sha="$1" code_out="$2" v wip
  ARBITRATED=1; ARB_RESULT=CODE_WRONG
  stage "ARBITRATION: code-writer says a test is wrong"
  run_agent test-critic /tmp/out/arbitration.txt "The code-writer claims that some tests on this branch are wrong, and the local CI fails because of them.
Using ONLY the task below as the source of truth (including the spec files its \"## Spec\" section points to, if any; the spec wins over the task text), decide whether the failing assertions are wrong (they reject output the task
allows or asks for, e.g. they match the wrong thing) or the code is wrong (it does not do what the task asks).
Read the failing tests and the code (\`git diff ${BASE_SHA}\`) before deciding.
For each assertion you judge wrong, give file:line and what it should check instead so that it still catches the bug it was written for.

## Task
${TASK}

## Code-writer's claim
$({ grep -E '^[[:space:]]*TEST_WRONG:' "$code_out" || true; })

## Code-writer's answer
$(tail -c 6000 "$code_out")

## Failing CI output (last 120 lines)
$(tail -n 120 /tmp/ci.log | strip_colors)

End your answer with exactly one line: \`ARBITRATION: TESTS_WRONG\` or \`ARBITRATION: CODE_WRONG\`." "${TOOLS_REVIEWER[@]}"
  v="$({ grep -Eo 'ARBITRATION: (TESTS_WRONG|CODE_WRONG)' /tmp/out/arbitration.txt || true; } | tail -n 1 | awk '{print $2}')"
  log "ARBITRATION: ${v:-no verdict, treated as CODE_WRONG}"
  echo "### Arbitration (code-writer said a test is wrong): ${v:-no verdict, treated as CODE_WRONG}" >> /tmp/out/review.txt
  if [[ "$v" != TESTS_WRONG ]]; then
    ARB_NOTE="An independent reviewer checked your claim that a test is wrong and judged that the CODE must change:
$(cat /tmp/out/arbitration.txt)"
    return 0
  fi
  ARB_RESULT=TESTS_WRONG
  assert_only "$sha" "$SRC_RE" "code-writer"
  wip="$(commit_stage "wip: ${PR_TITLE} (before test arbitration)")"
  stage "ARBITRATION: test-writer fixes the assertions judged wrong"
  # The fixed tests may still fail until the code is right: stop-gate must not push the test-writer to weaken them.
  # The gates of run.sh below (assert_only, ci_gate) still decide.
  export SKIP_STOP_GATE=1
  run_agent test-writer /tmp/out/test-arb.txt "An independent reviewer judged some of the assertions on this branch wrong (decision below).
Fix ONLY those assertions so they check what the task asks for and still catch the bug they were written for.
Do not weaken, skip or remove other tests, and do not change production code.

## Task
${TASK}

## Reviewer's decision
$(cat /tmp/out/arbitration.txt)

## Rules
${RULES_TEST}" "${TOOLS_TEST_WRITER[@]}"
  unset SKIP_STOP_GATE
  assert_only "$wip" "$TEST_RE" "test-writer"
  ARB_SHA="$(commit_stage "test: fix assertions after arbitration")"
}

# ci_gate <sha> [code-writer output]: gate của code-writer kể từ <sha>, chạy ci:local, fail thì nhờ code-writer sửa.
# [code-writer output] = câu trả lời của code-writer vừa chạy; có dòng TEST_WRONG thì gọi trọng tài trước khi sửa tiếp.
ci_gate() {
  local sha="$1" code_out="${2:-}" attempt=0
  while true; do
    log "CI gate: checking changed files (code-writer may only touch src)"
    assert_only "$sha" "$SRC_RE" "code-writer"
    assert_no_env_sniff "$sha"
    log "CI gate: running pnpm ci:local (round $((attempt + 1)))"
    if pnpm ci:local 2>&1 | tee /tmp/ci.log; then
      log "CI gate: PASSED"
      FIX_ROUNDS=$((FIX_ROUNDS + attempt))
      return 0
    fi
    if [[ "$MODE" == full && "$ARBITRATED" == 0 && -n "$code_out" ]] && grep -Eq '^[[:space:]]*TEST_WRONG:' "$code_out"; then
      arbitrate "$sha" "$code_out"
      if [[ "$ARB_RESULT" == TESTS_WRONG ]]; then
        sha="$ARB_SHA"; code_out=""
        continue   # chạy lại CI với test đã sửa, không tính vào số vòng sửa code
      fi
    fi
    (( attempt < MAX_FIX_ATTEMPTS )) || fail "local CI still failing after ${MAX_FIX_ATTEMPTS} fix attempts"
    attempt=$((attempt + 1))
    log "CI gate: FAILED, asking code-writer to fix it (attempt ${attempt}/${MAX_FIX_ATTEMPTS})"
    run_agent code-writer /tmp/out/code-fix.txt "The local CI failed after a change made for this task:
${TASK}

${RULES_CODE}
${ARB_NOTE}
CI output (last 150 lines):
$(tail -n 150 /tmp/ci.log | strip_colors)" "${TOOLS_CODE_WRITER[@]}"
    code_out=/tmp/out/code-fix.txt
  done
}

# Test file mới/đổi kể từ <sha>, chạy theo từng package; in log ra file
run_new_tests() {
  local sha="$1" out="$2" pkg files rc=0
  : > "$out"
  for pkg in backend frontend; do
    files="$(changed_since "$sha" | grep -E "^${pkg}/test/public/.*\.test\.tsx?$" | sed "s|^${pkg}/||" || true)"
    [[ -n "$files" ]] || continue
    echo "## ${pkg}: $(echo "$files" | tr '\n' ' ')" >> "$out"
    # shellcheck disable=SC2086
    (cd "$pkg" && pnpm exec vitest run $files) >> "$out" 2>&1 || rc=1
  done
  return "$rc"
}

# Bug mode: run only the reproduction test (it may already be on the base branch, so changed_since cannot find it)
run_repro_test() {
  local out="$1" pkg="${REPRO%%/*}"
  echo "## ${pkg}: ${REPRO#"${pkg}"/}" > "$out"
  (cd "$pkg" && pnpm exec vitest run "${REPRO#"${pkg}"/}") >> "$out" 2>&1
}

# Mutation score trên các dòng src đã thêm/sửa kể từ BASE_SHA (Stryker vẫn chạy cả file, chỉ chấm phần đổi). Đặt MUT_OK (1/0) và ghi báo cáo vào /tmp/out/mutation.txt
mutation_gate() {
  local pkg files mutate report="/tmp/out/mutation.txt" ok=1
  : > "$report"
  for pkg in backend frontend; do
    files="$(git diff --no-renames --name-only --diff-filter=AM "$BASE_SHA" -- "$pkg/src" \
      | grep -E '\.tsx?$' | grep -Ev '\.d\.ts$|/(main|seed)\.tsx?$' | sed "s|^${pkg}/||" || true)"
    [[ -n "$files" ]] || continue
    mutate="$(echo "$files" | paste -sd, -)"
    log "Mutation: ${pkg} (${mutate})"
    if ! (cd "$pkg" && pnpm exec stryker run --mutate "$mutate" --reporters json,clear-text) > /tmp/out/stryker-$pkg.log 2>&1; then
      echo "## ${pkg}: stryker failed to run" >> "$report"
      tail -n 40 /tmp/out/stryker-$pkg.log | strip_colors >> "$report"
      ok=0; continue
    fi
    # Dòng đã thêm/sửa kể từ BASE_SHA, mỗi dòng "<file trong pkg> <từ> <đến>" (lấy từ hunk "+c,d" của diff -U0).
    # Gate chỉ chấm mutant nằm trên các dòng này: mutant sống trong code cũ của file không phải lỗi của task.
    git diff -U0 --no-renames "$BASE_SHA" -- "$pkg/src" | awk -v pfx="${pkg}/" '
      /^\+\+\+ / { f = substr($2, 3); sub("^" pfx, "", f); next }
      /^@@ / { split(substr($3, 2), a, ","); n = (a[2] == "" ? 1 : a[2]); if (n > 0) print f, a[1], a[1] + n - 1 }
    ' > /tmp/out/changed-lines-$pkg.txt
    node -e '
      const fs = require("fs");
      const r = require(process.argv[1]); const min = Number(process.argv[2]);
      const ranges = {};
      for (const l of fs.readFileSync(process.argv[3], "utf8").split("\n").filter(Boolean)) {
        const [f, s, e] = l.split(" "); (ranges[f] ??= []).push([Number(s), Number(e)]);
      }
      const touches = (file, loc) => (ranges[file] ?? []).some(([s, e]) => loc.start.line <= e && loc.end.line >= s);
      let det = 0, undet = 0, allDet = 0, allTotal = 0; const survivors = [];
      for (const [file, f] of Object.entries(r.files)) for (const m of f.mutants) {
        const killed = m.status === "Killed" || m.status === "Timeout";
        const alive = m.status === "Survived" || m.status === "NoCoverage";
        if (killed || alive) { allTotal++; if (killed) allDet++; }
        if (!touches(file, m.location)) continue;
        if (killed) det++;
        else if (alive) {
          undet++; survivors.push(`  ${file}:${m.location.start.line} ${m.mutatorName} -> ${JSON.stringify(m.replacement ?? "")} (${m.status})`);
        }
      }
      const total = det + undet, score = total ? (100 * det / total) : 100;
      const all = allTotal ? (100 * allDet / allTotal).toFixed(1) : "100.0";
      console.log(`score=${score.toFixed(1)}% on changed lines (killed ${det}/${total}, min ${min}%); whole files ${all}% (info only)`);
      if (survivors.length) console.log("surviving mutants on changed lines:\n" + survivors.slice(0, 30).join("\n"));
      process.exit(score >= min ? 0 : 3);
    ' "$PWD/$pkg/reports/mutation/mutation.json" "$MUTATION_MIN" /tmp/out/changed-lines-$pkg.txt > /tmp/out/mut-$pkg.txt || ok=0
    { echo "## ${pkg}"; cat /tmp/out/mut-$pkg.txt; } >> "$report"
    rm -rf "$pkg/reports" "$pkg/.stryker-tmp"
  done
  [[ -s "$report" ]] || echo "no mutable src files changed" > "$report"
  sed 's/^/    /' "$report"
  MUT_OK="$ok"
}

# Mỗi scenario ID của task phải có ít nhất một test (describe/it/test) mà tên bắt đầu bằng ID đó, trong test/public.
# Đặt SCN_OK (1/0) và ghi báo cáo vào /tmp/out/scenarios.txt. Không có spec / không có scenario → luôn OK.
scenario_gate() {
  local report=/tmp/out/scenarios.txt id missing=() found=0
  SCN_OK=1
  if [[ -z "$SCENARIOS" ]]; then echo "no spec scenarios for this task" > "$report"; return 0; fi
  for id in $SCENARIOS; do
    if grep -rqE "(describe|it|test)(\.[A-Za-z]+)*(\([^)]*\))?\(\s*['\"\`]${id}([^0-9]|$)" backend/test/public frontend/test/public 2>/dev/null; then
      found=$((found + 1))
    else
      missing+=("$id")
    fi
  done
  {
    echo "scenarios with a test named after them: ${found}/$(wc -w <<<"$SCENARIOS" | tr -d ' ')"
    if (( ${#missing[@]} )); then
      SCN_OK=0
      echo "missing (no describe/it/test whose name starts with the ID): ${missing[*]}"
    fi
  } > "$report"
  sed 's/^/    /' "$report"
}

verdict() { { grep -Eo 'VERDICT: (APPROVE|CHANGES)' "$1" || true; } | tail -n 1 | awk '{print $2}'; }

# ---------- chuẩn bị ----------
# approval.py (verify of a change's plan or a bug's root cause) needs python3: required with a spec change or a bug
if ! command -v python3 >/dev/null 2>&1; then
  if [[ -s /task/bug.txt || -s /task/change.txt ]]; then
    fail "python3 not found in the pod image (needed by approval.py)"
  fi
  log "WARNING: python3 not found in the pod image (only needed by approval.py, for --change / --bug)"
fi
log "Trusting corporate CA (MWG TLS inspection)"
update-ca-certificates >/dev/null

log "Installing gh CLI, Claude Code and pnpm"
ARCH="$(dpkg --print-architecture)"
curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${ARCH}.tar.gz" | tar -xz -C /tmp
mv "/tmp/gh_${GH_VERSION}_linux_${ARCH}/bin/gh" /usr/local/bin/gh
npm install -g @anthropic-ai/claude-code >/dev/null
corepack enable
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
claude --version

# No GitHub write token in the pod: the host pushes and opens the PR (collect.sh). An old GH_TOKEN in agent-secrets
# is dropped here; remove it from the Secret (k8s/agents/README.md).
if [[ -n "${GH_TOKEN:-}" ]]; then
  log "WARNING: GH_TOKEN is set in the pod; it is not used any more (remove it from agent-secrets), unsetting it"
  unset GH_TOKEN
fi
# Public repo: anonymous clone. Private repo: GH_READ_TOKEN (fine-grained, Contents: read only), given to git through
# a credential helper that reads it from the environment of that one command, never in the URL or .git/config.
READ_TOKEN="${GH_READ_TOKEN:-}"; unset GH_READ_TOKEN
log "Cloning ${REPO} (${BASE_BRANCH})$([[ -n "$READ_TOKEN" ]] && echo ' with the read-only token' || echo ', anonymous')"
if [[ -n "$READ_TOKEN" ]]; then
  GH_READ_TOKEN="$READ_TOKEN" git -c credential.helper= \
    -c credential.helper='!f() { echo username=x-access-token; echo "password=${GH_READ_TOKEN}"; }; f' \
    clone --depth 1 --branch "${BASE_BRANCH}" "https://github.com/${REPO}.git" /work
else
  GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "${BASE_BRANCH}" "https://github.com/${REPO}.git" /work
fi
if [[ -n "$READ_TOKEN" ]] && grep -qF -- "$READ_TOKEN" /work/.git/config; then
  fail "the read token ended up in /work/.git/config"
fi
unset READ_TOKEN
grep -qE '://[^/[:space:]]+@' /work/.git/config && fail "/work/.git/config has credentials in a URL"
git -C /work remote -v | grep -q '@' && fail "git remote of /work has credentials in its URL"
cd /work
export CLAUDE_PROJECT_DIR=/work
git config user.name "claude-k8s-agent"
git config user.email "claude-k8s-agent@users.noreply.github.com"
BRANCH="${BRANCH_PREFIX}-$(date +%s)"
git checkout -b "${BRANCH}"
BASE_SHA="$(git rev-parse HEAD)"
pnpm --version   # corepack lấy đúng bản pnpm theo "packageManager" trong package.json

# ---------- spec (tùy chọn) ----------
CHANGE="$(head -n 1 /task/change.txt 2>/dev/null || true)"
SPEC_TASKS="$(head -n 1 /task/tasks.txt 2>/dev/null || true)"
SPEC_SUM=""; SCENARIOS=""
if [[ -n "$CHANGE" ]]; then
  [[ "$CHANGE" =~ ^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "invalid change '$CHANGE'"
  SPEC_DIR="specs/changes/${CHANGE}"
  if [[ -f /task/spec.tgz ]]; then
    # File đã có trên BASE_BRANCH giữ nguyên (--skip-old-files); file chưa commit thì lấy bản dispatch.sh gửi
    # và cho vào .git/info/exclude: agent đọc được nhưng không lọt vào commit / PR.
    tar -xzf /task/spec.tgz --skip-old-files --warning=no-unknown-keyword
    git ls-files --others --exclude-standard specs/ | sed 's|^|/|' >> .git/info/exclude
    if git ls-files --error-unmatch "${SPEC_DIR}/spec.md" >/dev/null 2>&1; then
      log "spec: using ${SPEC_DIR} committed on ${BASE_BRANCH}"
    else
      log "spec: ${SPEC_DIR} is not on ${BASE_BRANCH}; using the copy sent by dispatch.sh (read-only, not committed)"
    fi
  fi
  [[ -f "${SPEC_DIR}/spec.md" && -f "${SPEC_DIR}/tasks.md" ]] || fail "change '${CHANGE}': ${SPEC_DIR}/spec.md or tasks.md missing"
  # Dòng task trong tasks.md: "- [ ] T012 [P] [US1] ... — Scenarios: ABC-001-S1, ABC-001-S2"
  TASK_LINES="$(grep -E '^[[:space:]]*- \[[ xX]\] T[0-9]+' "${SPEC_DIR}/tasks.md" || true)"
  if [[ -n "$SPEC_TASKS" ]]; then
    sel=""
    for t in ${SPEC_TASKS//,/ }; do
      l="$(grep -E "^[[:space:]]*- \[[ xX]\] ${t}([^0-9]|$)" <<<"$TASK_LINES" || true)"
      [[ -n "$l" ]] || fail "task ${t} not found in ${SPEC_DIR}/tasks.md"
      sel+="${l}"$'\n'
    done
    TASK_LINES="$sel"
  fi
  [[ -n "${TASK_LINES// }" ]] || fail "no tasks found in ${SPEC_DIR}/tasks.md"
  SCENARIOS="$(grep -oE '[A-Z]{2,5}-[0-9]{3}-S[0-9]+' <<<"$TASK_LINES" | sort -u | paste -sd' ' - || true)"
  SPEC_SUM="$(spec_sum)"
  log "spec: change ${CHANGE}, tasks ${SPEC_TASKS:-all}, scenarios: ${SCENARIOS:-none}"
  TASK="${TASK}

## Spec (source of truth)
This task implements change \`${CHANGE}\` of the spec harness. Its files are in \`${SPEC_DIR}/\`:
\`spec.md\` (delta spec), \`plan.md\`, \`tasks.md\`, \`checklists/\`. Current behaviour: \`specs/capabilities/<domain>/\`;
shared knowledge (glossary, domain model, NFRs): \`specs/_system/\`.

Tasks to implement (from \`${SPEC_DIR}/tasks.md\`):
${TASK_LINES}
Scenarios these tasks must make pass: ${SCENARIOS:-none listed}

What to read before planning or writing:
- CODE roles (code-planner, code-writer, code-reviewer): \`spec.md\`: the requirement details (API, UI, messages, checks)
  of the requirements behind these scenarios, \`## Architecture Decisions\` (follow every ADR, cite it as \`<NNN>-ADR-<n>\`),
  \`## Data Model\`; \`plan.md\` (stack, project structure, Quickstart); the task lines above (exact paths, quoted constraints).
- TEST roles (test-planner, test-writer, test-critic): \`spec.md\`: the scenarios listed above (Given / When / Then,
  \`→ Recovery:\`), \`## Edge Cases & Error Handling\`, the Verification column of the NFR table;
  \`checklists/edge-cases.md\`; the \`## Test Strategy\` section of \`plan.md\` (adapt paths to backend|frontend/test/public).

Spec rules:
- Nobody edits anything under \`specs/\` (the pipeline fails the job if a file there changes).
- The spec wins over the task text. Spec wrong, unclear (\`[NEEDS CLARIFICATION]\`) or impossible with this code base:
  do not guess; put a line \`SPEC_PROBLEM: <file> <section> <why>\` at the start of a line in your answer and do the rest.
- Every scenario listed above gets at least one test whose name starts with its ID,
  e.g. \`it('ABC-003-S2 rejects min greater than max', ...)\`. The pipeline checks this."
fi

# ---------- bug (optional, dispatch.sh --bug <id>): steps f-g of the bug flow ----------
BUG="$(head -n 1 /task/bug.txt 2>/dev/null || true)"
REPRO=""; BUG_SCENARIO=""; BUG_SUM=""; ROOT_CAUSE=""
if [[ -n "$BUG" ]]; then
  [[ "$BUG" =~ ^[0-9]{8}-[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "invalid bug '$BUG'"
  [[ "$MODE" == full ]] || fail "bug mode needs MODE=full"
  [[ -z "$CHANGE" ]] || fail "bug mode cannot go with a spec change"
  REPRO="$(head -n 1 /task/repro.txt 2>/dev/null || true)"
  BUG_SCENARIO="$(head -n 1 /task/scenario.txt 2>/dev/null || true)"
  [[ "$REPRO" =~ ^(backend|frontend)/test/public/[A-Za-z0-9._/-]+\.test\.tsx?$ && "$REPRO" != *..* ]] \
    || fail "invalid reproduction test path '$REPRO'"
  [[ "$BUG_SCENARIO" =~ ^[A-Z]{2,5}-[0-9]{3}-S[0-9]+$ ]] || fail "invalid bug scenario '$BUG_SCENARIO'"
  [[ -f /task/bug.tgz ]] || fail "bug mode: /task/bug.tgz is missing"
  # The approved copy wins over the base branch (bugs/<id>/ and the reproduction test)
  tar -xzf /task/bug.tgz --warning=no-unknown-keyword
  [[ -f "bugs/${BUG}/report.md" && -f "$REPRO" ]] || fail "bug.tgz has no bugs/${BUG}/report.md or ${REPRO}"
  log "bug: approval.py verify --bug ${BUG}"
  python3 .specify/scripts/approval.py verify --bug "$BUG" \
    || fail "root cause not approved or changed since approval (bugs/${BUG})"
  BUG_SUM="$(bug_sum)"
  git add -- "bugs/${BUG}"
  git diff --cached --quiet || git commit -q -m "docs: bug record ${BUG}"
  SCENARIOS="$BUG_SCENARIO"
  ROOT_CAUSE="$(awk '/^## Root cause[[:space:]]*$/ { f = 1; print; next } f && /^##? / { exit } f' "bugs/${BUG}/investigation.md")"
  log "bug: ${BUG}, scenario ${BUG_SCENARIO}, reproduction test ${REPRO}"
  TASK="${TASK}

## Bug (source of truth)
This task fixes bug \`${BUG}\` (steps f-g of the bug flow). The user approved the root cause and the reproduction
test; the pipeline checks that approval again before the PR. Record: \`bugs/${BUG}/\` (\`report.md\`, \`investigation.md\`).
Reproduction test: \`${REPRO}\` (scenario ${BUG_SCENARIO}). It fails on the current code and must pass after the fix.

### report.md
$(cat "bugs/${BUG}/report.md")

### Approved root cause and fix direction (investigation.md)
${ROOT_CAUSE}

Bug rules:
- Never change, skip or delete the reproduction test \`${REPRO}\` (the pipeline fails the job if it changes).
- Do not edit anything under \`specs/\` or \`bugs/\`.
- Fix at the approved root cause, in the shared code: no patch in each caller, no wrapper, no new dependency.
- If the approved root cause looks wrong, say so in your answer and do not work around it."
fi

log "Installing project dependencies"
pnpm install --frozen-lockfile
mkdir -p /tmp/plan /tmp/out
FIX_ROUNDS=0; REVIEW_DONE=0; MUT_OK=1; SCN_OK=1
echo "no spec scenarios for this task" > /tmp/out/scenarios.txt
ARBITRATED=0; ARB_RESULT=""; ARB_SHA=""; ARB_NOTE=""
: > /tmp/out/red.txt; : > /tmp/out/review.txt; echo "skipped (code-only mode)" > /tmp/out/mutation.txt
: > /tmp/out/security-review.txt; SEC_SPEC_PROBLEM=0

if [[ "$MODE" == code-only ]]; then
  # ---------- luồng cũ: chỉ code-writer ----------
  stage "GREEN (code-only): code-writer"
  run_agent code-writer /tmp/out/code.txt "${TASK}

${RULES_CODE}" "${TOOLS_CODE_WRITER[@]}"
  [[ -n "$(changed_since "$BASE_SHA")" ]] || fail "agent made no changes"
  ci_gate "$BASE_SHA" /tmp/out/code.txt
  commit_stage "${PR_TITLE}" >/dev/null
  REVIEW_DONE=1
else
  # ---------- 1. PLAN ----------
  if [[ -n "$BUG" ]]; then
    stage "PLAN: skipped (bug mode: the approved root cause is the code plan)"
    printf '%s\n' "$ROOT_CAUSE" > /tmp/plan/code-plan.md
    echo "Reproduction test already written and approved; add tests only if review asks" > /tmp/plan/test-plan.md
  else
  stage "PLAN: code-planner + test-planner (read-only)"
  run_agent code-planner /tmp/plan/code-plan.md "Plan the production code change for this task. The code is not written yet.
${TASK}" "${TOOLS_PLANNER[@]}"
  run_agent test-planner /tmp/plan/test-plan.md "Plan the tests for the behaviour this task asks for. The production code is NOT written yet:
plan tests for the target behaviour (they must fail on the current code and pass once the task is done), not for the current behaviour.
Only plan Vitest tests in backend/test/public or frontend/test/public (no e2e: there is no browser or DB here).
${TASK}" "${TOOLS_PLANNER[@]}"
  fi
  CODE_PLAN="$(cat /tmp/plan/code-plan.md)"
  TEST_PLAN="$(cat /tmp/plan/test-plan.md)"

  # ---------- 2. RED ----------
  if [[ -n "$BUG" ]]; then
  # Bug mode: no test-writer. The approved reproduction test must fail on the current code, for the same reasons as RED.
  stage "RED (bug mode): the approved reproduction test must fail on the current code"
  if run_repro_test /tmp/out/red.txt; then
    strip_colors < /tmp/out/red.txt | tail -n 40
    fail "reproduction test ${REPRO} already passes before any code change (it does not reproduce the bug)"
  fi
  grep -q 'No test files found' /tmp/out/red.txt && fail "RED gate could not run the reproduction test ${REPRO}"
  strip_colors < /tmp/out/red.txt | tail -n 60 | sed 's/^/    /'
  log "RED: scenario coverage of the bug (${BUG_SCENARIO})"
  scenario_gate
  git add -- "$REPRO"
  git diff --cached --quiet || git commit -q -m "test: reproduce bug ${BUG}"
  TEST_SHA="$(git rev-parse HEAD)"
  log "RED gate: PASSED (reproduction test committed as ${TEST_SHA:0:8})"
  else
  stage "RED: test-writer writes failing tests"
  # Ở bước RED test phải fail -> tắt stop-gate (nó đòi pnpm test pass). Gate RED bên dưới vẫn do script kiểm.
  export SKIP_STOP_GATE=1
  run_agent test-writer /tmp/out/test.txt "Write the tests for this task BEFORE the production code exists.
The new tests MUST FAIL on the current code (that is expected: the code-writer will implement the change afterwards).
Do not try to make them pass and do not touch production code. Make sure they fail because the behaviour is missing,
not because of a typo or a broken import of a test helper.

## Task
${TASK}

## Test plan
${TEST_PLAN}

## Rules
${RULES_TEST}" "${TOOLS_TEST_WRITER[@]}"
  unset SKIP_STOP_GATE
  assert_only "$BASE_SHA" "$TEST_RE" "test-writer"
  [[ -n "$(changed_since "$BASE_SHA")" ]] || fail "test-writer wrote no tests"
  log "RED gate: new tests must fail on the current code"
  if run_new_tests "$BASE_SHA" /tmp/out/red.txt; then
    [[ -s /tmp/out/red.txt ]] || fail "test-writer wrote no *.test.ts(x) files"
    strip_colors < /tmp/out/red.txt | tail -n 40
    fail "new tests already pass before any code change (they do not test the new behaviour)"
  fi
  grep -q 'No test files found' /tmp/out/red.txt && fail "RED gate found no runnable test files"
  strip_colors < /tmp/out/red.txt | tail -n 60 | sed 's/^/    /'
  log "RED: spec scenario coverage (checked again at REVIEW, where it blocks approval)"
  scenario_gate
  TEST_SHA="$(commit_stage "test: ${PR_TITLE}")"
  log "RED gate: PASSED (tests committed as ${TEST_SHA:0:8})"
  fi

  # ---------- 3. GREEN ----------
  stage "GREEN: code-writer makes the tests pass"
  run_agent code-writer /tmp/out/code.txt "Implement this task. Tests for it were already written by another agent and currently fail
(see \`git show --stat HEAD\`). Make them pass by implementing the behaviour, not by targeting the tests.

## Task
${TASK}

## Code plan
${CODE_PLAN}

## Rules
${RULES_CODE}" "${TOOLS_CODE_WRITER[@]}"
  [[ -n "$(changed_since "$TEST_SHA")" ]] || fail "code-writer made no changes"
  ci_gate "$TEST_SHA" /tmp/out/code.txt
  CODE_SHA="$(commit_stage "${PR_TITLE}")"

  # ---------- 4. REVIEW ----------
  round=0
  CRITIC_HISTORY=""; SEC_HISTORY=""
  while true; do
    stage "REVIEW round $((round + 1)): mutation + code-reviewer + test-critic + security-reviewer"
    # Mỗi vòng critic là session mới: đưa nhận xét vòng trước + trả lời của test-writer để critic không đổi ý / đòi thứ không làm được
    if (( round > 0 )); then
      CRITIC_HISTORY="## Previous round
This is review round $((round + 1)). Your previous review and the test-writer's answer are below.
Rules for this round:
- Return CHANGES only for (a) items of the previous review that are still not addressed and still valid, or
  (b) a NEW issue that would let a real bug in the task's behaviour go unnoticed.
- Do not reverse a request from the previous review (e.g. ask to delete a test it asked for, or the opposite)
  unless it was plainly wrong; if so, say why.
- Items the test-writer explained it cannot do (e.g. needs a new dependency or an HTTP-level test) go under
  'Accepted gaps' and do not block.

### Previous review
$(cat /tmp/out/test-review-prev.txt)

### Test-writer's answer
$(cat /tmp/out/test-fix.txt)
"
      # Same rules for the security-reviewer: it sees its previous review and both writers' answers
      SEC_HISTORY="## Previous round
This is review round $((round + 1)). Your previous security review and the writers' answers are below.
Rules for this round:
- Return CHANGES only for (a) findings of the previous review that are still not addressed and still valid, or
  (b) a NEW HIGH or MEDIUM finding in the diff.
- Do not reverse a request from the previous review unless it was plainly wrong; if so, say why.
- Items a writer explained it cannot do (e.g. needs a new dependency) go under 'Accepted gaps' and do not block.

### Previous security review
$(cat /tmp/out/security-review-prev.txt)

### Test-writer's answer
$(cat /tmp/out/test-fix.txt)

### Code-writer's answer
$(cat /tmp/out/code-fix.txt)
"
    fi
    mutation_gate
    scenario_gate
    run_agent code-reviewer /tmp/out/code-review.txt "Review the change on this branch: \`git diff ${BASE_SHA} HEAD\` (tests were written first by another agent, then the code).

## Task
${TASK}

## Code plan
${CODE_PLAN}

Also flag: code that special-cases test inputs or behaves differently under test, and anything outside the task scope.
End your answer with exactly one line: \`VERDICT: APPROVE\` (no blocking issue) or \`VERDICT: CHANGES\` (list the blocking issues above it, each with file:line)." "${TOOLS_REVIEWER[@]}"
    run_agent test-critic /tmp/out/test-review.txt "Review the tests added on this branch: \`git diff ${BASE_SHA} HEAD -- backend/test frontend/test\`.
Mutation testing was already run by the pipeline on the changed src files (do not run stryker yourself):
$(cat /tmp/out/mutation.txt)

Spec scenario coverage (checked by the pipeline: each scenario of the task needs a test named after its ID):
$(cat /tmp/out/scenarios.txt)

Output of the new tests BEFORE the code existed (they must have failed because the behaviour was missing):
$(strip_colors < /tmp/out/red.txt | tail -n 80)

## Task
${TASK}

## Test plan
${TEST_PLAN}

${CRITIC_HISTORY}
The test-writer cannot delete files itself; it asks the pipeline to delete test files added on this branch.
Put nice-to-have remarks under 'Optional': they do not block.
End your answer with exactly one line: \`VERDICT: APPROVE\` (tests would catch real bugs in this behaviour) or \`VERDICT: CHANGES\` (list what to fix above it)." "${TOOLS_REVIEWER[@]}"
    run_agent security-reviewer /tmp/out/security-review.txt "Security-review the change on this branch: \`git diff ${BASE_SHA} HEAD\`.
Use exactly this diff; do not look up the base branch yourself. Follow your agent file and the security-review skill.

## Task
${TASK}

${SEC_HISTORY}
End your answer with exactly one line: \`VERDICT: APPROVE\` (your verdict is PASS) or \`VERDICT: CHANGES\` (your verdict is CHANGES REQUIRED)." "${TOOLS_REVIEWER[@]}"
    CODE_V="$(verdict /tmp/out/code-review.txt)"; TEST_V="$(verdict /tmp/out/test-review.txt)"
    SEC_V="$(verdict /tmp/out/security-review.txt)"
    cp /tmp/out/test-review.txt /tmp/out/test-review-prev.txt
    cp /tmp/out/security-review.txt /tmp/out/security-review-prev.txt
    CODE_V="${CODE_V:-CHANGES}"; TEST_V="${TEST_V:-CHANGES}"; SEC_V="${SEC_V:-CHANGES}"   # không có VERDICT thì coi như chưa duyệt
    {
      echo "### Round $((round + 1)): code-reviewer=${CODE_V}, test-critic=${TEST_V}, security=${SEC_V}, mutation=$([[ $MUT_OK == 1 ]] && echo OK || echo LOW), scenarios=$([[ $SCN_OK == 1 ]] && echo OK || echo MISSING)"
    } >> /tmp/out/review.txt
    log "REVIEW: code-reviewer=${CODE_V} test-critic=${TEST_V} security=${SEC_V} mutation_ok=${MUT_OK} scenarios_ok=${SCN_OK}"
    if [[ "$CODE_V" == APPROVE && "$TEST_V" == APPROVE && "$SEC_V" == APPROVE && "$MUT_OK" == 1 && "$SCN_OK" == 1 ]]; then
      REVIEW_DONE=1; break
    fi
    # Permissions in the spec are wrong or missing: no writer can fix that, go back to the spec harness
    if [[ "$SEC_V" == CHANGES ]] && grep -Eq '^[[:space:]`*>-]*SPEC_PROBLEM:' /tmp/out/security-review.txt; then
      log "REVIEW: security-reviewer reported a SPEC_PROBLEM (permissions), stopping the review (draft PR)"
      echo "### Stopped: security review found a spec problem (permissions)" >> /tmp/out/review.txt
      SEC_SPEC_PROBLEM=1; REVIEW_DONE=0; break
    fi
    (( round < REVIEW_ROUNDS )) || break
    round=$((round + 1))
    echo "(the test-writer did not run in this round: only the code review asked for changes)" > /tmp/out/test-fix.txt
    # code-fix.txt keeps the code-writer's answer of this round for the next security review
    echo "(the code-writer did not run in this round)" > /tmp/out/code-fix.txt
    if [[ "$SEC_V" == CHANGES ]]; then
      SEC_FOR_TESTS="## Security review
$(cat /tmp/out/security-review.txt)
For each HIGH or MEDIUM finding above, write one test in test/public that proves the vulnerability (e.g. user A
requesting user B's resource must be denied). Such a test may fail: the code is not fixed yet."
    else
      SEC_FOR_TESTS=""
    fi

    if [[ "$TEST_V" == CHANGES || "$MUT_OK" == 0 || "$SCN_OK" == 0 || "$SEC_V" == CHANGES ]]; then
      stage "REVIEW round ${round}: test-writer addresses test review"
      # Here the test-writer may write failing tests on purpose (a security finding, code it thinks is wrong):
      # stop-gate must not push it to weaken them. The gates of run.sh after it (assert_only, ci_gate) still decide.
      export SKIP_STOP_GATE=1
      run_agent test-writer /tmp/out/test-fix.txt "Improve the tests on this branch based on the review below. The production code now exists.
Tests must check the behaviour asked for in the task; do not weaken them to match the code.
If you think the code is wrong, write a test that shows it (it may fail) and explain.

## Task
${TASK}

## Test review
$(cat /tmp/out/test-review.txt)

## Mutation testing
$(cat /tmp/out/mutation.txt)

## Spec scenario coverage
$(cat /tmp/out/scenarios.txt)
Each missing scenario needs a test whose name starts with its ID (see the task's Spec section).

${SEC_FOR_TESTS}

## Deleting a test file
You cannot delete files yourself. To delete a test file that was ADDED on this branch, put a line
\`DELETE: <path from the repo root>\` at the start of a line in your final answer (one line per file, no other text on it),
e.g. \`DELETE: backend/test/public/foo.test.ts\`. The pipeline deletes it after you exit.
Files that existed before this branch cannot be deleted.

## Your answer
End with a short 'Response to review' list: for each review item, say what you did, or why you did not do it.
The next reviewer reads this.

## Rules
${RULES_TEST}" "${TOOLS_TEST_WRITER[@]}"
      unset SKIP_STOP_GATE
      apply_test_deletions /tmp/out/test-fix.txt
      assert_only "$CODE_SHA" "$TEST_RE" "test-writer"
      if [[ -n "$(changed_since "$CODE_SHA")" ]]; then
        TEST_SHA="$(commit_stage "test: address review (round ${round})")"
      fi
    fi

    STAGE_SHA="$(git rev-parse HEAD)"
    if [[ "$CODE_V" == CHANGES || "$SEC_V" == CHANGES ]]; then
      stage "REVIEW round ${round}: code-writer addresses code review + security review"
      run_agent code-writer /tmp/out/code-fix.txt "Address the code review and the security review below for this task (fix every HIGH / MEDIUM
security finding at its source). Tests may have been updated by another agent, including tests that prove a security
finding; make them pass.

## Task
${TASK}

## Code review (verdict: ${CODE_V})
$(cat /tmp/out/code-review.txt)

## Security review (verdict: ${SEC_V})
$(cat /tmp/out/security-review.txt)

## Rules
${RULES_CODE}" "${TOOLS_CODE_WRITER[@]}"
    fi
    # tests mới có thể làm CI fail: code-writer sửa trong gate này
    ci_gate "$STAGE_SHA" "$([[ "$CODE_V" == CHANGES || "$SEC_V" == CHANGES ]] && echo /tmp/out/code-fix.txt || true)"
    if [[ -n "$(changed_since "$STAGE_SHA")" ]]; then
      CODE_SHA="$(commit_stage "fix: address review (round ${round})")"
    else
      CODE_SHA="$STAGE_SHA"
    fi
  done
fi

# ---------- 5. EXPORT (PR body; the host pushes and opens the PR) ----------
stage "EXPORT: PR body, then the branch is printed as an artifact (on exit)"
if [[ -n "$BUG" ]]; then
  log "bug: approval.py verify --bug ${BUG} (again, before the PR)"
  python3 .specify/scripts/approval.py verify --bug "$BUG" || fail "reproduction test or bug record changed during the run"
fi
CI_SUMMARY="$(strip_colors < /tmp/ci.log | sed -n '/== Summary ==/,$p')"
git --no-pager log --oneline "${BASE_SHA}..HEAD"
git --no-pager diff --stat "${BASE_SHA}" HEAD

section() { echo "<details><summary>$1</summary>"; echo; echo '```'; head -c "${3:-6000}" "$2"; echo; echo '```'; echo "</details>"; echo; }
{
  echo "## Task"; echo "${TASK}"; echo
  echo "## Pipeline (mode: ${MODE})"
  echo '```'; git --no-pager log --reverse --format='%h %s' "${BASE_SHA}..HEAD"; echo '```'
  echo "CI fix rounds: ${FIX_ROUNDS}"; echo
  if [[ "$MODE" == full ]]; then
    cat /tmp/out/review.txt; echo
    if [[ -n "$BUG" ]]; then
      section "Code plan (approved root cause, bugs/${BUG}/investigation.md)" /tmp/plan/code-plan.md
    else
      section "Code plan (code-planner)" /tmp/plan/code-plan.md
      section "Test plan (test-planner)" /tmp/plan/test-plan.md
    fi
    strip_colors < /tmp/out/red.txt | tail -n 60 > /tmp/out/red-tail.txt
    section "RED: new tests failing before the code change" /tmp/out/red-tail.txt
    section "Mutation testing" /tmp/out/mutation.txt
    section "Spec scenario coverage" /tmp/out/scenarios.txt
    section "Code review (last round)" /tmp/out/code-review.txt
    section "Test review (last round)" /tmp/out/test-review.txt
    section "Security review (last round)" /tmp/out/security-review.txt
  fi
  if [[ -n "$CHANGE" ]]; then
    echo "## Spec"
    echo "Change \`${CHANGE}\`, tasks: ${SPEC_TASKS:-all}. Scenarios: ${SCENARIOS:-none}"; echo
    { grep -hE '^[[:space:]]*SPEC_PROBLEM:' /tmp/plan/*.md /tmp/out/*.txt 2>/dev/null || true; } | sort -u > /tmp/out/spec-problems.txt
    if [[ -s /tmp/out/spec-problems.txt ]]; then
      echo "**Spec problems reported by the agents** (go back to the spec harness, the spec was not changed):"
      echo '```'; cat /tmp/out/spec-problems.txt; echo '```'; echo
    fi
  fi
  if [[ -n "$BUG" ]]; then
    echo "## Bug"
    echo "- Bug: \`${BUG}\` (record: \`bugs/${BUG}/\`, committed first)"
    echo "- Violated scenario: ${BUG_SCENARIO}"
    echo "- Reproduction test: \`${REPRO}\` (approved with the root cause; failed before the fix, see RED)"
    echo "- Approved root cause: $(node -e 'try { const a = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(a["root-cause"].summary || "(no summary)") } catch (e) { console.log("(unreadable)") }' "bugs/${BUG}/approval.json")"
    echo
  fi
  echo "## Local CI (run in the agent pod before opening this PR)"
  echo '```'; echo "${CI_SUMMARY}"; echo '```'; echo
  echo "Made by headless Claude Code sessions in Kubernetes Job \`agent-${JOB_ID}\`, dispatched with \`k8s/agents/dispatch.sh\`."
  echo; echo "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
} > /tmp/out/pr-body.md

# No push and no PR from the pod: on_exit prints the artifact, collect.sh on the host pushes and opens the PR
# (draft unless SUCCESS) and prints the final "RESULT: ... pr=<url>".
log "Done (branch ${BRANCH}; collect.sh on the host opens the PR)"
if [[ "$REVIEW_DONE" == 1 ]]; then
  RESULT="SUCCESS"
elif [[ "$SEC_SPEC_PROBLEM" == 1 ]]; then
  RESULT="FAILED reason=security review found a spec problem (permissions): back to the spec harness (draft PR for a human)"
else
  RESULT="FAILED reason=review not approved after ${REVIEW_ROUNDS} rounds (draft PR for a human)"
fi
