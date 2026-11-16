#!/usr/bin/env bash
# Hidden tests (<package>/test/private): run by the "ci" job of .github/workflows/ci.yml after `pnpm ci:local`.
# Not part of ci:local: agent pods check out the repo without test/private (sparse-checkout in k8s/agents/run.sh).
#
# Prints ONLY a summary, never test code, assertion messages or stack traces: k8s/agents/watch-pr.sh copies the log of a
# failed CI step into the fix task of a coding agent. The full vitest / tsc output goes to $PRIVATE_LOG.
#
#   1. rules   the hidden tests themselves: no .skip / .only / .todo, no xit / fit, no vi.mock of app code (src/),
#              no expect(true).toBe(true)-style assertions. Prints "<file>:<line> <rule>" only.
#   2. vitest  per package: "files N, load errors N, tests N fail / N pass" + scenario IDs of the failing tests
#              (the IDs are in the public spec, the test code is not).
#   3. tsc     per package: "type errors N" (vitest does not type check).
#
# Usage (repo root, after pnpm install):  bash ci/private-tests.sh
# Exit 0 only if every rule holds and every package passes. A package without hidden tests is skipped.
set -uo pipefail

cd "$(dirname "$0")/.."
PRIVATE_LOG="${PRIVATE_LOG:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/private-tests.log}"
: > "$PRIVATE_LOG"
DIR_NAME="private"
FAILED=0

# ---------- 1. rules ----------
# <rule name>|<ERE matched against each line of the hidden tests>
RULES=(
  'skipped or focused test (.skip / .only / .todo)|\b(describe|it|test|suite)\.(skip|only|todo|skipIf|runIf)\b'
  'skipped or focused test (xit / fit / xdescribe / fdescribe)|(^|[^.[:alnum:]_])(xit|xtest|xdescribe|fit|fdescribe)\('
  'vi.mock of app code (only mock HTTP, DB, Redis)|vi\.(mock|doMock)\([[:space:]]*["'"'"'`][^"'"'"'`]*(\.\./|/)src/'
  'assertion that cannot fail|expect\([[:space:]]*(true|false|1|0)[[:space:]]*\)\.(toBe|toEqual|toStrictEqual)\([[:space:]]*(true|false|1|0)[[:space:]]*\)'
)
violations=0
for pkg in backend frontend; do
  d="$pkg/test/$DIR_NAME"
  [[ -d "$d" ]] || continue
  while IFS= read -r -d '' f; do
    for rule in "${RULES[@]}"; do
      name="${rule%%|*}"; re="${rule#*|}"
      while IFS=: read -r line _; do
        [[ -n "$line" ]] || continue
        echo "rule violated: $f:$line $name"
        violations=$((violations + 1))
      done < <(grep -nE "$re" "$f" || true)
    done
  done < <(find "$d" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0)
done
if [[ "$violations" -gt 0 ]]; then
  echo "hidden test rules: $violations violation(s)"
  FAILED=1
else
  echo "hidden test rules: ok"
fi

# ---------- 2 + 3. vitest and tsc per package ----------
# summary <vitest-json>: "files N, load errors N, tests N fail / N pass[, failing: IDs]"; exit 1 on any failure.
# "load error" = a file with no test result (syntax error, missing module, error at top level).
summary() {
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const files = r.testResults || [];
    const loadErr = files.filter((f) => f.status === "failed" && (f.assertionResults || []).length === 0).length;
    const ids = new Set(); let noId = 0;
    for (const f of files) for (const a of f.assertionResults || []) {
      if (a.status !== "failed") continue;
      const m = [...(a.ancestorTitles || []), a.title || ""].join(" ").match(/\b[A-Z]{2,}-\d{3}-S\d+\b/);
      if (m) ids.add(m[0]); else noId++;
    }
    let out = `files ${files.length}, load errors ${loadErr}, tests ${r.numFailedTests} fail / ${r.numPassedTests} pass`;
    if (ids.size) out += `, failing scenarios: ${[...ids].sort().join(" ")}`;
    if (noId) out += `, failing tests without scenario ID: ${noId}`;
    console.log(out);
    process.exit(loadErr || r.numFailedTests ? 1 : 0);
  ' "$1"
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for pkg in backend frontend; do
  if [[ -z "$(find "$pkg/test/$DIR_NAME" -name '*.test.ts*' 2>/dev/null | head -n 1)" ]]; then
    echo "$pkg: no hidden tests, skipped"
    continue
  fi
  json="$tmp/$pkg.json"; tlog="$tmp/$pkg-tsc.log"
  echo "## $pkg: vitest" >> "$PRIVATE_LOG"
  (cd "$pkg" && pnpm exec vitest run "test/$DIR_NAME" --passWithNoTests \
    --reporter=default --reporter=json --outputFile.json="$json") >> "$PRIVATE_LOG" 2>&1 || true
  if [[ -s "$json" ]]; then
    sum="$(summary "$json")" || FAILED=1
  else
    sum="no vitest report (vitest crashed)"; FAILED=1
  fi
  echo "## $pkg: typecheck:$DIR_NAME" >> "$PRIVATE_LOG"
  if (cd "$pkg" && pnpm "typecheck:$DIR_NAME") > "$tlog" 2>&1; then
    sum="$sum, type errors 0"
  else
    nerr="$(grep -cE 'error TS[0-9]+' "$tlog" || true)"
    if [[ "${nerr:-0}" -gt 0 ]]; then sum="$sum, type errors $nerr"; else sum="$sum, typecheck failed (no TS errors parsed)"; fi
    FAILED=1
  fi
  cat "$tlog" >> "$PRIVATE_LOG"
  echo "$pkg: $sum"
done

if [[ "$FAILED" == 1 ]]; then
  echo "PRIVATE: FAIL (full output for the user only, never for an agent: $PRIVATE_LOG)"
  exit 1
fi
echo "PRIVATE: PASS"
