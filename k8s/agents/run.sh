#!/usr/bin/env bash
# Chạy trong pod của một agent Job (mount qua ConfigMap "agent-script").
# Task KHÔNG viết cứng: đọc từ /task/task.md (ConfigMap "task-<JOB_ID>" do dispatch.sh tạo).
#
# Luồng: clone BASE_BRANCH → pnpm install → claude -p --agent code-writer "<task>"
#        → CI gate do script này chạy (file cấm sửa + pnpm ci:local, tối đa MAX_FIX_ATTEMPTS vòng sửa)
#        → pass thì commit, push, mở PR vào BASE_BRANCH.
# Dòng cuối log luôn là "==> RESULT: SUCCESS pr=<url>" hoặc "==> RESULT: FAILED reason=<lý do>",
# để Claude tổng (dispatch.sh) đọc được.
set -euo pipefail

log() { echo "==> [${JOB_ID}] $*"; }
strip_colors() { sed 's/\x1b\[[0-9;]*m//g'; }

RESULT="FAILED reason=script exited early (see the last ==> step)"
trap 'echo "==> RESULT: ${RESULT}"' EXIT

TASK="$(cat /task/task.md)"
PR_TITLE="$(head -n 1 /task/title.txt)"
BRANCH_PREFIX="agent/${JOB_ID}"
[[ -n "${TASK// }" ]] || { RESULT="FAILED reason=empty task"; exit 1; }
[[ -n "${PR_TITLE// }" ]] || { RESULT="FAILED reason=empty PR title"; exit 1; }

# File agent không được đụng: sửa chúng có thể làm CI pass mà không sửa code thật.
PROTECTED='^(\.github/|ci/|k8s/|\.claude/|CLAUDE\.md$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|(frontend|backend)/package\.json$|frontend/eslint\.config\.js$|(frontend|backend)/tsconfig[^/]*\.json$|(frontend|backend)/(vitest|stryker)\.config\.[cm]?[jt]s$|(frontend|backend)/test/)'
ALLOWED_TOOLS=("Read" "Edit" "Write" "Glob" "Grep" "Bash(pnpm ci:local)" "Bash(pnpm lint:*)" "Bash(pnpm test:*)" "Bash(pnpm --filter:*)" "Bash(git status:*)" "Bash(git diff:*)")
RULES="Follow CLAUDE.md. Make the smallest change that completes the task; do not touch unrelated files.
Do not change tests, CI, lint, TypeScript, package or .claude configuration, and do not add eslint-disable or @ts-ignore comments.
If you believe a test is wrong, stop and explain why instead of working around it.
When you are done, run \`pnpm ci:local\` (exactly that command) and fix what it reports until it prints CI PASSED."

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
pnpm --version   # corepack lấy đúng bản pnpm theo "packageManager" trong package.json

log "Installing project dependencies"
pnpm install --frozen-lockfile

# --agent code-writer: guard.mjs nhận agent_type=code-writer → được sửa src/, không được sửa test/.
log "Running Claude Code agent (code-writer)"
claude -p --agent code-writer "${TASK}

${RULES}" --allowedTools "${ALLOWED_TOOLS[@]}"

if [[ -z "$(git status --porcelain)" ]]; then
  RESULT="FAILED reason=agent made no changes"
  exit 1
fi

# CI gate cuối: do script chạy, agent không bỏ qua hay làm giả được.
attempt=0
while true; do
  log "CI gate: checking protected files"
  CHANGED="$(git status --porcelain | awk '{print $NF}')"
  if echo "${CHANGED}" | grep -Eq "${PROTECTED}"; then
    log "Agent changed protected files, NOT opening a PR:"
    echo "${CHANGED}" | grep -E "${PROTECTED}"
    RESULT="FAILED reason=agent changed protected files"
    exit 1
  fi

  log "CI gate: running pnpm ci:local (round $((attempt + 1)))"
  if pnpm ci:local 2>&1 | tee /tmp/ci.log; then
    log "CI gate: PASSED"
    break
  fi
  if (( attempt >= MAX_FIX_ATTEMPTS )); then
    RESULT="FAILED reason=local CI still failing after ${MAX_FIX_ATTEMPTS} fix attempts"
    exit 1
  fi
  attempt=$((attempt + 1))
  log "CI gate: FAILED, asking Claude to fix it (attempt ${attempt}/${MAX_FIX_ATTEMPTS})"
  claude -p --agent code-writer "The local CI failed after a change made for this task:
${TASK}

${RULES}
CI output (last 150 lines):
$(tail -n 150 /tmp/ci.log | strip_colors)" --allowedTools "${ALLOWED_TOOLS[@]}"
done

CI_SUMMARY="$(strip_colors < /tmp/ci.log | sed -n '/== Summary ==/,$p')"
git diff --stat
git --no-pager diff

log "Committing and opening PR"
git add -A
git commit -m "${PR_TITLE}"
git push -u origin "${BRANCH}"
PR_URL="$(gh pr create --repo "${REPO}" --base "${BASE_BRANCH}" --head "${BRANCH}" \
  --title "${PR_TITLE}" \
  --body "## Task
${TASK}

## Local CI (run in the agent pod before opening this PR)
\`\`\`
${CI_SUMMARY}
\`\`\`
Fix rounds needed after the first agent run: ${attempt}

Change made by a headless Claude Code session (\`--agent code-writer\`) in Kubernetes Job \`agent-${JOB_ID}\`, dispatched with \`k8s/agents/dispatch.sh\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)")"
log "Done"
RESULT="SUCCESS pr=${PR_URL}"
