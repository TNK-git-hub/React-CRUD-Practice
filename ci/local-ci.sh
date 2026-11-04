#!/usr/bin/env bash
# Local CI: the only CI for this repo. Runs lint, typecheck and builds directly on the machine (no cloud).
# Each job stops at its first failing step, but every job still runs.
# Exit code is 0 only if every job passes.
#
# Usage (from the repo root):  pnpm ci:local   or   bash ci/local-ci.sh
set -uo pipefail

cd "$(dirname "$0")/.."

GREEN=$'\e[32m'; RED=$'\e[31m'; GRAY=$'\e[90m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
SUMMARY=()
FAILED=0

# run_step <job> <step name> <command...>
# Skips the step if an earlier step in the same job already failed.
run_step() {
  local job="$1" name="$2"; shift 2
  if [[ "${JOB_FAILED:-0}" == 1 ]]; then
    SUMMARY+=("${GRAY}⏭  ${job} › ${name} (skipped)${RESET}")
    return
  fi
  echo
  echo "${BOLD}▶ ${job} › ${name}${RESET}  ${GRAY}\$ $*${RESET}"
  local start=$SECONDS
  if "$@"; then
    SUMMARY+=("${GREEN}✅ ${job} › ${name} ($((SECONDS - start))s)${RESET}")
  else
    SUMMARY+=("${RED}❌ ${job} › ${name} ($((SECONDS - start))s)${RESET}")
    JOB_FAILED=1
    FAILED=1
  fi
}

echo "${BOLD}== Local CI ==${RESET}"

JOB_FAILED=0
run_step setup "Install dependencies" pnpm install --frozen-lockfile
if [[ "$JOB_FAILED" == 1 ]]; then
  printf '%s\n' "" "${BOLD}== Summary ==${RESET}" "${SUMMARY[@]}"
  exit 1
fi

JOB_FAILED=0
run_step frontend "Lint"      pnpm --filter frontend lint
run_step frontend "Typecheck" pnpm --filter frontend typecheck
run_step frontend "Build"     pnpm --filter frontend build

JOB_FAILED=0
run_step backend "Build" pnpm --filter backend build

echo
echo "${BOLD}== Summary ==${RESET}"
printf '%s\n' "${SUMMARY[@]}"
echo
if [[ "$FAILED" == 1 ]]; then
  echo "${RED}${BOLD}CI FAILED${RESET}"
  exit 1
fi
echo "${GREEN}${BOLD}CI PASSED${RESET}"
