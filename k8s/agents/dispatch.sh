#!/usr/bin/env bash
# Hands ONE task to an agent running headless in a pod (kind cluster), waits for it to end, prints the result.
#
# Usage (from the repo root):
#   bash k8s/agents/dispatch.sh <job-id> <task-file|-> --title "<PR title>" [--mode full|code-only] [--base <branch>]
#                               [--change NNN-<feature> [--tasks T001,T002] | --bug <YYYYMMDD>-<slug>]
#                               [--no-wait] [--no-private] [--dry-run]
#
#   <job-id>     lower-case letters, digits, "-" (e.g. example-task). The branch will be agent/<job-id>-<timestamp>.
#   <task-file>  a markdown file describing the task (goal, files that may change, done criteria). See tasks/EXAMPLE.md.
#                "-" (only with --change or --bug): the task is generated from the spec / the bug record.
#   --change     follow a spec of the spec harness: specs/changes/NNN-<feature>/ (spec.md, plan.md, tasks.md, checklists/).
#                The whole specs/ folder of this machine is sent to the pod, so an uncommitted spec works too (it does not get into the PR).
#   --tasks      do only these tasks of tasks.md (default: every task). Their scenarios must have tests.
#   --bug        steps f-g of the bug flow (skill bug-fix-flow) for bugs/<id>/: needs a root-cause approval that still
#                matches (approval.py verify --bug <id>, which also covers the reproduction test). Mode full only, not
#                with --change / --tasks. The pod skips PLAN, checks that the reproduction test fails, then GREEN + REVIEW.
#   --mode      full (default): plan → test-writer (RED) → code-writer (GREEN) → mutation + review → PR.
#                code-only: only code-writer, then the PR (small jobs that need no new tests).
#   --base       the branch to clone and open the PR into (default: the "Base branch" line of CLAUDE.md). It must be pushed to origin.
#   --no-wait    create the Job and exit at once, without following the log.
#   --no-private do not run the hidden tests (test/private, only on this machine) on the PR's branch.
#   --dry-run    only check the input and print the manifests; create NOTHING in the cluster.
#
# To run in parallel: call several commands at once (one job-id per task).
# When there is a PR (SUCCESS, or FAILED with a draft PR): also prints "PRIVATE: PASS|FAIL|SKIPPED" (counts only, no test content, so nothing leaks to the agents).
# The last line is always "RESULT: SUCCESS pr=<url>" or "RESULT: FAILED reason=<reason>"; exit 0 only on SUCCESS.
set -euo pipefail

usage() { sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
fail() { echo "RESULT: FAILED reason=$*"; exit 1; }

[[ $# -ge 2 ]] || usage
JOB_ID="$1"; TASK_FILE="$2"; shift 2
TITLE=""; BASE=""; MODE="full"; WAIT=1; DRY=0; PRIVATE=1; CHANGE=""; SPEC_TASKS=""; BUG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --change) CHANGE="${2:-}"; shift 2 ;;
    --tasks) SPEC_TASKS="${2:-}"; shift 2 ;;
    --bug) BUG="${2:-}"; shift 2 ;;
    --no-private) PRIVATE=0; shift ;;
    --no-wait) WAIT=0; shift ;;
    --dry-run) DRY=1; shift ;;
    *) usage ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/k8s/agents"

# Default base branch: the line "- Base branch: `<name>`" in section Branches of CLAUDE.md (not hard-coded here).
# --base overrides it, but prints a WARNING when it differs from CLAUDE.md (the PR would go into another branch than the one the spec harness uses).
CLAUDE_BASE="$(sed -nE 's/^- Base branch: `([^`]+)`.*/\1/p' "$ROOT/CLAUDE.md" 2>/dev/null || true)"
[[ "$CLAUDE_BASE" != *$'\n'* ]] || fail "CLAUDE.md has more than one '- Base branch:' line"
if [[ -z "$BASE" ]]; then
  [[ -n "$CLAUDE_BASE" ]] || fail "no base branch: CLAUDE.md has no line '- Base branch: \`<name>\`' (or pass --base)"
  BASE="$CLAUDE_BASE"
elif [[ "$BASE" != "$CLAUDE_BASE" ]]; then
  echo "WARNING: --base '$BASE' differs from the Base branch in CLAUDE.md ('${CLAUDE_BASE:-<none>}'): the pod clones '$BASE' and the PR is opened into '$BASE'."
fi

# --- check the input ---
[[ "$JOB_ID" =~ ^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$ ]] || fail "invalid job-id '$JOB_ID' (a-z, 0-9, '-', max 42 chars)"
[[ "$BASE" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "invalid base branch '$BASE'"
[[ -n "${TITLE// }" ]] || fail "missing --title"
case "$MODE" in full) DEADLINE=5400 ;; code-only) DEADLINE=2400 ;; *) fail "invalid --mode '$MODE' (full|code-only)" ;; esac

# --- spec (optional) ---
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
  # plan + tasks must be approved by the user themselves (approval.py approve in their terminal) and unchanged since the approval
  python3 "$ROOT/.specify/scripts/approval.py" verify --change "$CHANGE" --gate plan --root "$ROOT" >&2 \
    || fail "plan not approved or changed since approval: run approval.py verify --change $CHANGE"
  # specs/archive is not needed by the agents; leave out macOS junk files
  COPYFILE_DISABLE=1 tar -C "$ROOT" --exclude '.DS_Store' --exclude 'specs/archive' -czf "$TMP/spec.tgz" specs
  [[ "$(wc -c < "$TMP/spec.tgz")" -lt 900000 ]] || fail "specs/ is too big for a ConfigMap (max ~1 MiB)"
  SPEC_ARGS=(--from-file=spec.tgz="$TMP/spec.tgz" --from-literal=change.txt="$CHANGE" --from-literal=tasks.txt="$SPEC_TASKS")
elif [[ -n "$SPEC_TASKS" ]]; then
  fail "--tasks needs --change"
fi

# --- bug (optional): steps f-g of the bug flow, after the user approved the root cause in their terminal ---
BUG_ARGS=()
if [[ -n "$BUG" ]]; then
  [[ "$BUG" =~ ^[0-9]{8}-[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "invalid --bug '$BUG' (<YYYYMMDD>-<slug>)"
  [[ -z "$CHANGE" && -z "$SPEC_TASKS" ]] || fail "--bug cannot go with --change or --tasks"
  [[ "$MODE" == full ]] || fail "--bug needs --mode full (the reproduction test must fail before the fix)"
  BDIR="$ROOT/bugs/$BUG"
  [[ -f "$BDIR/report.md" && -f "$BDIR/investigation.md" ]] || fail "bugs/$BUG/report.md or investigation.md not found"
  # root cause + report + reproduction test approved by the user (approval.py approve) and unchanged since
  python3 "$ROOT/.specify/scripts/approval.py" verify --bug "$BUG" --root "$ROOT" >&2 \
    || fail "root cause not approved or changed since approval: run approval.py verify --bug $BUG"
  # report.md, section "## Reproduction test": "- Path: `<file>`", "- Name: `<scenario ID> ...`"
  REPRO_SECTION="$(awk '/^## Reproduction test[[:space:]]*$/ { f = 1; next } /^##? / { f = 0 } f' "$BDIR/report.md")"
  REPRO="$(sed -nE 's/^- Path: `([^`]+)`[[:space:]]*$/\1/p' <<<"$REPRO_SECTION" | head -n 1)"
  REPRO_NAME="$(sed -nE 's/^- Name: `([^`]+)`[[:space:]]*$/\1/p' <<<"$REPRO_SECTION" | head -n 1)"
  SCENARIO="$(sed -nE 's/^- \*\*Violated scenario:\*\*[^A-Z]*([A-Z]{2,5}-[0-9]{3}-S[0-9]+).*/\1/p' "$BDIR/report.md" | head -n 1)"
  # public test areas and the test-file pattern: .claude/harness.json
  TEST_RE="$(python3 "$ROOT/.specify/scripts/harness_config.py" get pod.testWritable --regex --root "$ROOT")" \
    || fail "harness.json missing or invalid (see harness_config.py above)"
  TEST_FILE_RE="$(python3 "$ROOT/.specify/scripts/harness_config.py" get testFile --regex --root "$ROOT")" \
    || fail "harness.json missing or invalid (see harness_config.py above)"
  [[ "$REPRO" =~ ${TEST_RE}[A-Za-z0-9._/-]+${TEST_FILE_RE} && "$REPRO" != *..* ]] \
    || fail "bugs/$BUG/report.md: reproduction test '$REPRO' is not a test file (${TEST_FILE_RE}) under ${TEST_RE}"
  [[ -f "$ROOT/$REPRO" ]] || fail "reproduction test $REPRO not found"
  [[ -n "$SCENARIO" ]] || fail "bugs/$BUG/report.md: no scenario ID on the 'Violated scenario' line"
  [[ "$REPRO_NAME" =~ ^${SCENARIO}([^0-9]|$) ]] \
    || fail "bugs/$BUG/report.md: reproduction test Name '$REPRO_NAME' must start with the violated scenario $SCENARIO"
  COPYFILE_DISABLE=1 tar -C "$ROOT" --exclude '.DS_Store' -czf "$TMP/bug.tgz" "bugs/$BUG" "$REPRO"
  [[ "$(wc -c < "$TMP/bug.tgz")" -lt 900000 ]] || fail "bugs/$BUG/ is too big for a ConfigMap (max ~1 MiB)"
  BUG_ARGS=(--from-file=bug.tgz="$TMP/bug.tgz" --from-literal=bug.txt="$BUG" --from-literal=repro.txt="$REPRO"
    --from-literal=scenario.txt="$SCENARIO")
fi

if [[ "$TASK_FILE" == "-" && -n "$BUG" ]]; then
  TASK_FILE="$TMP/task.md"
  cat > "$TASK_FILE" <<EOF
## Goal
Fix bug \`${BUG}\` at the approved root cause (see the Bug section below), so that the reproduction test
\`${REPRO}\` (\`${REPRO_NAME}\`) passes.

## Files you may change
- Code: \`backend/src\`, \`frontend/src\`, \`frontend/public\` (where the approved root cause is)
- New tests: \`backend/test/public/\`, \`frontend/test/public/\` (test-writer only, when the review asks)

## Out of scope
- Any file under \`specs/\` and \`bugs/\`.
- The reproduction test \`${REPRO}\`: never change, skip or delete it.
- Anything but the approved fix (no patch in each caller, no wrapper, no new dependency).

## Done when
- The reproduction test \`${REPRO}\` passes.
- \`pnpm ci:local\` prints CI PASSED.
EOF
elif [[ "$TASK_FILE" == "-" ]]; then
  [[ -n "$CHANGE" ]] || fail "task file '-' needs --change or --bug"
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
  # spec.tgz (binary) is not printed: only its content is listed
  kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" \
    ${CHANGE:+--from-literal=change.txt="$CHANGE" --from-literal=tasks.txt="$SPEC_TASKS"} \
    ${BUG:+--from-literal=bug.txt="$BUG" --from-literal=repro.txt="$REPRO" --from-literal=scenario.txt="$SCENARIO"} \
    --dry-run=client -o yaml
  if [[ -n "$CHANGE" ]]; then echo "# spec.tgz ($(wc -c < "$TMP/spec.tgz" | tr -d ' ') bytes):"; tar -tzf "$TMP/spec.tgz" | sed 's/^/#   /'; fi
  if [[ -n "$BUG" ]]; then echo "# bug.tgz ($(wc -c < "$TMP/bug.tgz" | tr -d ' ') bytes):"; tar -tzf "$TMP/bug.tgz" | sed 's/^/#   /'; fi
  echo "---"
  render
  echo "RESULT: DRY-RUN job=agent-$JOB_ID base=$BASE mode=$MODE${CHANGE:+ change=$CHANGE tasks=${SPEC_TASKS:-all}}${BUG:+ bug=$BUG}"
  exit 0
fi

kubectl cluster-info >/dev/null 2>&1 || fail "kubernetes cluster not reachable (start kind: see k8s/agents/README.md)"
git -C "$ROOT" ls-remote --exit-code --heads origin "$BASE" >/dev/null 2>&1 || fail "branch '$BASE' does not exist on origin (push it first)"
if git -C "$ROOT" rev-parse --verify -q "$BASE" >/dev/null && git -C "$ROOT" rev-parse --verify -q "origin/$BASE" >/dev/null; then
  ahead="$(git -C "$ROOT" rev-list --count "origin/$BASE..$BASE")"
  [[ "$ahead" == 0 ]] || echo "WARN: local '$BASE' is $ahead commit(s) ahead of origin; the pod clones origin/$BASE"
fi

# --- create / update the script + task ConfigMaps, then the Job ---
kubectl create configmap agent-script --from-file=run.sh="$DIR/run.sh" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl delete job "agent-$JOB_ID" --ignore-not-found --wait=true >/dev/null
kubectl delete configmap "task-$JOB_ID" --ignore-not-found >/dev/null
kubectl create configmap "task-$JOB_ID" --from-file=task.md="$TASK_FILE" --from-literal=title.txt="$TITLE" \
  ${SPEC_ARGS[@]+"${SPEC_ARGS[@]}"} ${BUG_ARGS[@]+"${BUG_ARGS[@]}"} >/dev/null
render | kubectl apply -f - >/dev/null
echo "Dispatched job agent-$JOB_ID (base: $BASE, mode: $MODE${CHANGE:+, change: $CHANGE, tasks: ${SPEC_TASKS:-all}}${BUG:+, bug: $BUG})"

if [[ "$WAIT" != 1 ]]; then
  echo "The pod has no GitHub write token: when the job is done, open its PR from this machine with"
  echo "  bash k8s/agents/collect.sh $JOB_ID --base $BASE"
  echo "RESULT: DISPATCHED job=agent-$JOB_ID"
  exit 0
fi

# --- follow the log ---
mkdir -p "$DIR/logs"
LOG="$DIR/logs/$JOB_ID-$(date +%Y-%m-%dT%H-%M-%S).log"
pod=""; phase=""
for _ in $(seq 1 300); do   # wait at most 10 minutes for the pod to run (image pull)
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
# --- PR: the pod has no GitHub write token; it printed the branch as an artifact, collect.sh pushes and opens the PR ---
# The final RESULT line is collect.sh's ("... pr=<url>"), so the hidden tests below run on that PR as before.
if [[ "$line" == *" artifact=ready"* ]]; then
  echo "Pod: $line"
  echo "Collecting the artifact: bash k8s/agents/collect.sh $JOB_ID --log ${LOG#$ROOT/} --base $BASE"
  cout="$(bash "$DIR/collect.sh" "$JOB_ID" --log "$LOG" --base "$BASE" 2>&1)" || true
  echo "$cout" | grep -vE '^RESULT: ' || true
  cline="$(grep -E '^RESULT: ' <<<"$cout" | tail -n 1)"
  line="${cline:-RESULT: FAILED reason=collect.sh printed no result (pod: ${line#RESULT: })}"
fi
# --- hidden tests: test/private exists only on this machine (gitignored); the agents in the pod never see it ---
# Run on the PR's branch in a temporary git worktree, one package at a time (a failing package does not make the other one skipped).
# Prints only counts: files that do not load / failing tests / passing tests / type errors. Never test names or content;
# the full log (test runner + typecheck) is in logs/ for the user. How to run them: the stack profile of
# .claude/harness.json (stack.commands.install, private, privateTypecheck; the report read by stack_adapter.py).
# >>> private_package (self-contained: .specify/scripts/test_dispatch_private.py extracts this block and sources it)
# private_package <root with .claude/harness.json> <worktree> <package> <folder inside the package> <log>: runs the hidden
# tests of that folder in <worktree>/<package> with stack.commands.private, then stack.commands.privateTypecheck when it is
# set; appends their output to <log>; prints one line of counts, "files N, load errors N, tests N fail / N pass" (from
# stack_adapter.py summary) plus ", type errors N"; returns 1 when a test failed, a file did not load, the report is
# missing or the typecheck failed. "load error" (vitest) = a file with no test result at all (syntax error, import of a
# module that cannot be found, an error at the top level); pytest: every error of the JUnit report.
private_package() {
  local root="$1" wt="$2" pkg="$3" sub="$4" plog="$5" runner ext report out sum ok=0 tlog nerr pattern a
  local hc=(python3 "$root/.specify/scripts/harness_config.py") cmd=() tc=()
  runner="$("${hc[@]}" get stack.runner --root "$root")" || { echo "harness.json missing or invalid"; return 1; }
  ext=json; [[ "$runner" == pytest ]] && ext=xml
  report="$wt/private-$pkg.$ext"
  out="$("${hc[@]}" argv private --set "dir=$sub" --set "report=$report" --root "$root")" \
    || { echo "harness.json missing or invalid"; return 1; }
  while IFS= read -r a; do cmd+=("$a"); done <<<"$out"
  echo "## $pkg: $runner" >> "$plog"
  (cd "$wt/$pkg" && "${cmd[@]}") >> "$plog" 2>&1 || true
  if [[ -s "$report" ]]; then
    sum="$(python3 "$root/.specify/scripts/stack_adapter.py" summary --report "$report" --root "$root" 2>>"$plog")" || ok=1
  else
    sum="no $runner report ($runner crashed)"; ok=1
  fi
  # Type errors: vitest does not typecheck, so an import with a wrong name or type only shows up here (exit 3: none set)
  if out="$("${hc[@]}" argv privateTypecheck --root "$root" 2>/dev/null)"; then
    while IFS= read -r a; do tc+=("$a"); done <<<"$out"
    pattern="$("${hc[@]}" get stack.commands.privateTypecheck.errorPattern --root "$root")"
    tlog="$wt/private-$pkg-tsc.log"
    echo "## $pkg: ${tc[*]}" >> "$plog"
    if (cd "$wt/$pkg" && "${tc[@]}") > "$tlog" 2>&1; then
      sum="$sum, type errors 0"
    else
      nerr="$(grep -cE "$pattern" "$tlog" || true)"
      if [[ "${nerr:-0}" -gt 0 ]]; then sum="$sum, type errors $nerr"; else sum="$sum, typecheck failed (no TS errors parsed)"; fi
      ok=1
    fi
    cat "$tlog" >> "$plog"
  fi
  echo "$sum"
  return "$ok"
}
# <<< private_package
# >>> copy_private_tests (self-contained: the harness check extracts this block and sources it)
# copy_private_tests <from root> <to root> <hidden test folder>...: copies each folder WITHOUT its _stale/ (tests
# quarantined by private_tests.py), so vitest and typecheck:private in the worktree never see them.
copy_private_tests() {
  local from="$1" to="$2" d; shift 2
  for d in "$@"; do
    [[ -d "$from/$d" ]] || continue
    mkdir -p "$to/$d"
    rsync -a --exclude '/_stale/' "$from/$d/" "$to/$d/"
  done
}
# <<< copy_private_tests
run_private() {
  local pr_url="$1" branch wt plog pkg sub d private_dirs test_file_re install_argv a have=0 sum ok=1 joined parts=() install=()
  # hidden test folders (areas.testPrivate of .claude/harness.json), each "<package>/<folder in the package>"
  private_dirs="$(python3 "$ROOT/.specify/scripts/harness_config.py" get areas.testPrivate --list --root "$ROOT")" \
    || { echo "PRIVATE: SKIPPED (harness.json missing or invalid)"; return 0; }
  test_file_re="$(python3 "$ROOT/.specify/scripts/harness_config.py" get testFile --regex --root "$ROOT")" \
    || { echo "PRIVATE: SKIPPED (harness.json missing or invalid)"; return 0; }
  for d in $private_dirs; do   # a file whose name matches stack.testFile; quarantined tests (_stale/) do not count
    [[ -n "$(find "$ROOT/$d" -path "$ROOT/$d/_stale" -prune -o -type f -print 2>/dev/null | sed 's#.*/##' \
      | grep -E "$test_file_re" | head -n 1)" ]] && have=1
  done
  [[ "$have" == 1 ]] || { echo "PRIVATE: SKIPPED (no hidden tests on this machine)"; return 0; }
  branch="$(gh pr view "$pr_url" --json headRefName -q .headRefName)" || { echo "PRIVATE: SKIPPED (cannot read PR branch)"; return 0; }
  plog="$DIR/logs/$JOB_ID-private-$(date +%Y-%m-%dT%H-%M-%S).log"
  wt="$(mktemp -d)"
  echo "Running hidden tests on $branch -> ${plog#"$ROOT"/}"
  git -C "$ROOT" fetch -q origin "$branch"
  git -C "$ROOT" worktree add -q --detach "$wt" FETCH_HEAD
  # shellcheck disable=SC2086
  copy_private_tests "$ROOT" "$wt" $private_dirs
  : > "$plog"
  # stack.commands.install (null: no install step); exit 3 of `argv` = not set
  if install_argv="$(python3 "$ROOT/.specify/scripts/harness_config.py" argv install --root "$ROOT" 2>/dev/null)"; then
    while IFS= read -r a; do install+=("$a"); done <<<"$install_argv"
    if ! (cd "$wt" && "${install[@]}") > "$plog" 2>&1; then
      echo "PRIVATE: SKIPPED (${install[0]} ${install[1]:-} failed, see ${plog#"$ROOT"/})"
      git -C "$ROOT" worktree remove --force "$wt"; return 0
    fi
  fi
  for d in $private_dirs; do
    pkg="${d%%/*}"; sub="${d#*/}"
    [[ -d "$wt/$d" ]] || continue
    sum="$(private_package "$ROOT" "$wt" "$pkg" "$sub" "$plog")" || ok=0
    parts+=("$pkg: $sum")
  done
  printf -v joined '%s; ' "${parts[@]}"; joined="${joined%; }"
  if [[ "$ok" == 1 ]]; then
    echo "PRIVATE: PASS (${joined})"
  else
    echo "PRIVATE: FAIL (${joined}) - full log is for the user only, do not pass it to an agent: ${plog#"$ROOT"/}"
  fi
  git -C "$ROOT" worktree remove --force "$wt"
}
# Runs whenever there is a PR, a draft PR too (FAILED because the review did not pass): the user needs to know whether the code is right to decide
PR_IN_LINE="$(sed -nE 's/.*[[:space:]]pr=([^[:space:]]+).*/\1/p' <<<"$line")"
if [[ -n "$PR_IN_LINE" && "$PRIVATE" == 1 ]]; then
  run_private "$PR_IN_LINE" || echo "PRIVATE: SKIPPED (error while running hidden tests)"
fi

echo "$line"
[[ "$line" == "RESULT: SUCCESS"* ]]
