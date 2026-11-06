#!/usr/bin/env bash
# Chạy trong pod của một agent Job (mount qua ConfigMap "agent-script").
# Task KHÔNG viết cứng: đọc từ /task/task.md (ConfigMap "task-<JOB_ID>" do dispatch.sh tạo).
#
# MODE=full (mặc định), mỗi bước là một session `claude -p --agent <vai>` mới, không chung ngữ cảnh:
#   1. PLAN    code-planner + test-planner (chỉ đọc) → /tmp/plan/*.md (ngoài repo)
#   2. RED     test-writer viết test → gate: chỉ sửa test/public, test mới phải FAIL → commit "test: ..."
#   3. GREEN   code-writer viết code → gate: chỉ sửa src, không có code dò môi trường test,
#              pnpm ci:local pass (tối đa MAX_FIX_ATTEMPTS vòng sửa) → commit
#   4. REVIEW  mutation score (Stryker, do script chạy) + code-reviewer + test-critic (chỉ đọc)
#              → cần sửa thì quay lại bước 2/3 kèm nhận xét, tối đa REVIEW_ROUNDS vòng
#   5. PR      push, mở PR (review không qua thì mở PR draft và báo FAILED)
# MODE=code-only: luồng cũ, chỉ có bước 3 rồi mở PR.
#
# Gate do script chạy SAU khi agent đã thoát, so với SHA của commit trước bước đó (script giữ SHA, agent không với tới):
# agent dùng cách nào để ghi file (Edit, Bash, chạy code qua vitest...) thì vẫn bị bắt.
# Dòng cuối log luôn là "==> RESULT: SUCCESS pr=<url>" hoặc "==> RESULT: FAILED reason=<lý do>".
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
trap 'echo "==> RESULT: ${RESULT}"' EXIT
fail() { RESULT="FAILED reason=$*"; exit 1; }

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
TOOLS_PLANNER=("Read" "Glob" "Grep")
TOOLS_TEST_WRITER=("Read" "Edit" "Write" "Glob" "Grep" "${TEST_CMDS[@]}" "${GIT_READ[@]}")
TOOLS_CODE_WRITER=("Read" "Edit" "Write" "Glob" "Grep" "${TEST_CMDS[@]}" "${GIT_READ[@]}"
  "Bash(pnpm ci:local)" "Bash(pnpm lint)" "Bash(pnpm --filter frontend lint)" "Bash(pnpm --filter frontend typecheck)"
  "Bash(pnpm --filter frontend build)" "Bash(pnpm --filter backend build)")
TOOLS_REVIEWER=("Read" "Glob" "Grep" "${TEST_CMDS[@]}" "${GIT_READ[@]}" "Bash(pnpm lint)" "Bash(pnpm --filter frontend typecheck)")

RULES_CODE="Follow CLAUDE.md. Make the smallest change that completes the task; do not touch unrelated files.
You may only change files in backend/src, frontend/src, frontend/public.
Do not change tests, CI, lint, TypeScript, package or .claude configuration, and do not add eslint-disable or @ts-ignore comments.
Never make code behave differently under test (no checks on VITEST, NODE_ENV === 'test', etc.) and never special-case the exact inputs used in tests: implement the behaviour in general.
If you believe a test is wrong, stop and explain why instead of working around it.
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

# assert_only <sha> <regex> <vai>: mọi file đổi kể từ <sha> phải khớp <regex>
assert_only() {
  local sha="$1" re="$2" who="$3" bad
  git merge-base --is-ancestor "$sha" HEAD || fail "${who}: git history was rewritten (commit ${sha:0:8} is gone)"
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

commit_stage() { git add -A; git commit -q -m "$1"; git rev-parse HEAD; }

# ci_gate <sha>: gate của code-writer kể từ <sha>, chạy ci:local, fail thì nhờ code-writer sửa
ci_gate() {
  local sha="$1" attempt=0
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
    (( attempt < MAX_FIX_ATTEMPTS )) || fail "local CI still failing after ${MAX_FIX_ATTEMPTS} fix attempts"
    attempt=$((attempt + 1))
    log "CI gate: FAILED, asking code-writer to fix it (attempt ${attempt}/${MAX_FIX_ATTEMPTS})"
    run_agent code-writer /tmp/out/code-fix.txt "The local CI failed after a change made for this task:
${TASK}

${RULES_CODE}
CI output (last 150 lines):
$(tail -n 150 /tmp/ci.log | strip_colors)" "${TOOLS_CODE_WRITER[@]}"
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

# Mutation score trên file src đã đổi kể từ BASE_SHA. Đặt MUT_OK (1/0) và ghi báo cáo vào /tmp/out/mutation.txt
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
    node -e '
      const r = require(process.argv[1]); const min = Number(process.argv[2]);
      let det = 0, undet = 0; const survivors = [];
      for (const [file, f] of Object.entries(r.files)) for (const m of f.mutants) {
        if (m.status === "Killed" || m.status === "Timeout") det++;
        else if (m.status === "Survived" || m.status === "NoCoverage") {
          undet++; survivors.push(`  ${file}:${m.location.start.line} ${m.mutatorName} -> ${JSON.stringify(m.replacement ?? "")} (${m.status})`);
        }
      }
      const total = det + undet, score = total ? (100 * det / total) : 100;
      console.log(`score=${score.toFixed(1)}% (killed ${det}/${total}, min ${min}%)`);
      if (survivors.length) console.log("surviving mutants:\n" + survivors.slice(0, 30).join("\n"));
      process.exit(score >= min ? 0 : 3);
    ' "$PWD/$pkg/reports/mutation/mutation.json" "$MUTATION_MIN" > /tmp/out/mut-$pkg.txt || ok=0
    { echo "## ${pkg}"; cat /tmp/out/mut-$pkg.txt; } >> "$report"
    rm -rf "$pkg/reports" "$pkg/.stryker-tmp"
  done
  [[ -s "$report" ]] || echo "no mutable src files changed" > "$report"
  sed 's/^/    /' "$report"
  MUT_OK="$ok"
}

verdict() { { grep -Eo 'VERDICT: (APPROVE|CHANGES)' "$1" || true; } | tail -n 1 | awk '{print $2}'; }

# ---------- chuẩn bị ----------
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

log "Cloning ${REPO} (${BASE_BRANCH})"
git clone --depth 1 --branch "${BASE_BRANCH}" "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" /work
cd /work
export CLAUDE_PROJECT_DIR=/work
git config user.name "claude-k8s-agent"
git config user.email "claude-k8s-agent@users.noreply.github.com"
BRANCH="${BRANCH_PREFIX}-$(date +%s)"
git checkout -b "${BRANCH}"
BASE_SHA="$(git rev-parse HEAD)"
pnpm --version   # corepack lấy đúng bản pnpm theo "packageManager" trong package.json

log "Installing project dependencies"
pnpm install --frozen-lockfile
mkdir -p /tmp/plan /tmp/out
FIX_ROUNDS=0; REVIEW_DONE=0; MUT_OK=1
: > /tmp/out/red.txt; : > /tmp/out/review.txt; echo "skipped (code-only mode)" > /tmp/out/mutation.txt

if [[ "$MODE" == code-only ]]; then
  # ---------- luồng cũ: chỉ code-writer ----------
  stage "GREEN (code-only): code-writer"
  run_agent code-writer /tmp/out/code.txt "${TASK}

${RULES_CODE}" "${TOOLS_CODE_WRITER[@]}"
  [[ -n "$(changed_since "$BASE_SHA")" ]] || fail "agent made no changes"
  ci_gate "$BASE_SHA"
  commit_stage "${PR_TITLE}" >/dev/null
  REVIEW_DONE=1
else
  # ---------- 1. PLAN ----------
  stage "PLAN: code-planner + test-planner (read-only)"
  run_agent code-planner /tmp/plan/code-plan.md "Plan the production code change for this task. The code is not written yet.
${TASK}" "${TOOLS_PLANNER[@]}"
  run_agent test-planner /tmp/plan/test-plan.md "Plan the tests for the behaviour this task asks for. The production code is NOT written yet:
plan tests for the target behaviour (they must fail on the current code and pass once the task is done), not for the current behaviour.
Only plan Vitest tests in backend/test/public or frontend/test/public (no e2e: there is no browser or DB here).
${TASK}" "${TOOLS_PLANNER[@]}"
  CODE_PLAN="$(cat /tmp/plan/code-plan.md)"
  TEST_PLAN="$(cat /tmp/plan/test-plan.md)"

  # ---------- 2. RED ----------
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
  TEST_SHA="$(commit_stage "test: ${PR_TITLE}")"
  log "RED gate: PASSED (tests committed as ${TEST_SHA:0:8})"

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
  ci_gate "$TEST_SHA"
  CODE_SHA="$(commit_stage "${PR_TITLE}")"

  # ---------- 4. REVIEW ----------
  round=0
  while true; do
    stage "REVIEW round $((round + 1)): mutation + code-reviewer + test-critic"
    mutation_gate
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

Output of the new tests BEFORE the code existed (they must have failed because the behaviour was missing):
$(strip_colors < /tmp/out/red.txt | tail -n 80)

## Task
${TASK}

## Test plan
${TEST_PLAN}

End your answer with exactly one line: \`VERDICT: APPROVE\` (tests would catch real bugs in this behaviour) or \`VERDICT: CHANGES\` (list what to fix above it)." "${TOOLS_REVIEWER[@]}"
    CODE_V="$(verdict /tmp/out/code-review.txt)"; TEST_V="$(verdict /tmp/out/test-review.txt)"
    CODE_V="${CODE_V:-CHANGES}"; TEST_V="${TEST_V:-CHANGES}"   # không có VERDICT thì coi như chưa duyệt
    {
      echo "### Round $((round + 1)): code-reviewer=${CODE_V}, test-critic=${TEST_V}, mutation=$([[ $MUT_OK == 1 ]] && echo OK || echo LOW)"
    } >> /tmp/out/review.txt
    log "REVIEW: code-reviewer=${CODE_V} test-critic=${TEST_V} mutation_ok=${MUT_OK}"
    if [[ "$CODE_V" == APPROVE && "$TEST_V" == APPROVE && "$MUT_OK" == 1 ]]; then
      REVIEW_DONE=1; break
    fi
    (( round < REVIEW_ROUNDS )) || break
    round=$((round + 1))

    if [[ "$TEST_V" == CHANGES || "$MUT_OK" == 0 ]]; then
      stage "REVIEW round ${round}: test-writer addresses test review"
      run_agent test-writer /tmp/out/test-fix.txt "Improve the tests on this branch based on the review below. The production code now exists.
Tests must check the behaviour asked for in the task; do not weaken them to match the code.
If you think the code is wrong, write a test that shows it (it may fail) and explain.

## Task
${TASK}

## Test review
$(cat /tmp/out/test-review.txt)

## Mutation testing
$(cat /tmp/out/mutation.txt)

## Rules
${RULES_TEST}" "${TOOLS_TEST_WRITER[@]}"
      assert_only "$CODE_SHA" "$TEST_RE" "test-writer"
      if [[ -n "$(changed_since "$CODE_SHA")" ]]; then
        TEST_SHA="$(commit_stage "test: address review (round ${round})")"
      fi
    fi

    STAGE_SHA="$(git rev-parse HEAD)"
    if [[ "$CODE_V" == CHANGES ]]; then
      stage "REVIEW round ${round}: code-writer addresses code review"
      run_agent code-writer /tmp/out/code-fix.txt "Address the code review below for this task. Tests may have been updated by another agent; make them pass.

## Task
${TASK}

## Code review
$(cat /tmp/out/code-review.txt)

## Rules
${RULES_CODE}" "${TOOLS_CODE_WRITER[@]}"
    fi
    ci_gate "$STAGE_SHA"   # tests mới có thể làm CI fail: code-writer sửa trong gate này
    if [[ -n "$(changed_since "$STAGE_SHA")" ]]; then
      CODE_SHA="$(commit_stage "fix: address review (round ${round})")"
    else
      CODE_SHA="$STAGE_SHA"
    fi
  done
fi

# ---------- 5. PR ----------
stage "PR"
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
    section "Code plan (code-planner)" /tmp/plan/code-plan.md
    section "Test plan (test-planner)" /tmp/plan/test-plan.md
    strip_colors < /tmp/out/red.txt | tail -n 60 > /tmp/out/red-tail.txt
    section "RED: new tests failing before the code change" /tmp/out/red-tail.txt
    section "Mutation testing" /tmp/out/mutation.txt
    section "Code review (last round)" /tmp/out/code-review.txt
    section "Test review (last round)" /tmp/out/test-review.txt
  fi
  echo "## Local CI (run in the agent pod before opening this PR)"
  echo '```'; echo "${CI_SUMMARY}"; echo '```'; echo
  echo "Made by headless Claude Code sessions in Kubernetes Job \`agent-${JOB_ID}\`, dispatched with \`k8s/agents/dispatch.sh\`."
  echo; echo "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
} > /tmp/out/pr-body.md

log "Pushing and opening PR"
git push -u origin "${BRANCH}"
DRAFT=()
[[ "$REVIEW_DONE" == 1 ]] || DRAFT=(--draft)
PR_URL="$(gh pr create --repo "${REPO}" --base "${BASE_BRANCH}" --head "${BRANCH}" "${DRAFT[@]}" \
  --title "${PR_TITLE}" --body-file /tmp/out/pr-body.md)"
log "Done"
if [[ "$REVIEW_DONE" == 1 ]]; then
  RESULT="SUCCESS pr=${PR_URL}"
else
  RESULT="FAILED reason=review not approved after ${REVIEW_ROUNDS} rounds (draft PR for a human) pr=${PR_URL}"
fi
