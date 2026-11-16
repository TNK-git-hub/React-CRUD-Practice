#!/usr/bin/env node
// Test suite for guard.mjs: feeds fake PreToolUse inputs to the real hook and checks allow / block.
// Builds a throwaway project tree in the OS temp dir (specs/, src/, public and private test folders, symlinks)
// and points CLAUDE_PROJECT_DIR at it. Never reads or writes the repo's own test folders.
// Usage: node .claude/hooks/guard-cases.mjs [path/to/guard.mjs]    (CI: job spec-check)
// Runs every case twice: as is, and with GUARD_CASE_INSENSITIVE=1 (forces the guard's case-folding branch on, so a
// case-sensitive Linux runner checks it too). The case-change cases run when the temp dir's file system ignores case,
// and always in the forced run.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.resolve(process.argv[2] || path.join(here, "guard.mjs"));
const FAKE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-cases-")));
const OUTSIDE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-outside-")));

const mk = (p, body = "x") => {
  fs.mkdirSync(path.dirname(path.join(FAKE, p)), { recursive: true });
  fs.writeFileSync(path.join(FAKE, p), body);
};
const PRIV = ["backend", "test", "private"].join("/");
const FE_PRIV = ["frontend", "test", "private"].join("/");
mk("specs/changes/002-x/spec.md");
mk("specs/_system/nfr.md");
mk("backend/src/app.ts");
mk("backend/test/public/a.test.ts");
mk(`${PRIV}/existing.test.ts`);
fs.symlinkSync("../backend/src/app.ts", path.join(FAKE, "specs/out-link.md")); // file symlink out of specs
fs.symlinkSync("../backend/src", path.join(FAKE, "specs/dir-link")); // dir symlink out of specs
fs.symlinkSync("/nonexistent/nowhere.md", path.join(FAKE, "specs/dangling.md"));
fs.symlinkSync("../../src", path.join(FAKE, `${PRIV}/escape`)); // dir symlink from private to src
fs.symlinkSync("/nonexistent/x.test.ts", path.join(FAKE, `${PRIV}/dangle.test.ts`));
mk("notes/readme.md");
fs.symlinkSync(path.join(FAKE, PRIV), path.join(FAKE, "notes/priv-dir")); // dir symlink elsewhere -> private
fs.symlinkSync(path.join(FAKE, `${PRIV}/existing.test.ts`), path.join(FAKE, "notes/priv-file.md")); // file symlink -> private
// File system of the temp dir ignores case (default on macOS, Windows)?
const CASE_INSENSITIVE_FS = fs.existsSync(path.join(FAKE, "SPECS"));

// Paths outside the fake project (never created): the guard matches them by name
const HOME = os.homedir();
const AGE_KEY = path.join(HOME, ".config/age/react-crud-private-tests.key");
const HIDDEN_LOG = path.join(HOME, ".local/state/hidden-tests/repo/logs/j1-private.log");

const PTW = "private-test-writer";
const A = "ALLOW", B = "BLOCK", Q = "ASK";
const cases = [
  // ---- private-test-writer: reads (only specs/, also after resolving symlinks) ----
  [PTW, "Read", { file_path: "specs/changes/002-x/spec.md" }, A, "Read specs (relative)"],
  [PTW, "Read", { file_path: path.join(FAKE, "specs/_system/nfr.md") }, A, "Read specs (absolute path)"],
  [PTW, "Read", { file_path: "backend/src/app.ts" }, B, "Read src"],
  [PTW, "Read", { file_path: "backend/test/public/a.test.ts" }, B, "Read test/public"],
  [PTW, "Read", { file_path: `${PRIV}/existing.test.ts` }, B, "Read private tests"],
  [PTW, "Read", { file_path: "specs/../backend/src/app.ts" }, B, "Read specs/../src (dot-dot)"],
  [PTW, "Read", { file_path: "/etc/hosts" }, B, "Read absolute path outside project"],
  [PTW, "Read", { file_path: "specs/out-link.md" }, B, "Read file symlink specs -> src"],
  [PTW, "Read", { file_path: "specs/dir-link/app.ts" }, B, "Read via dir symlink specs -> src"],
  [PTW, "Read", { file_path: "specs/dangling.md" }, B, "Read dangling symlink in specs"],
  [PTW, "Grep", { pattern: "foo" }, B, "Grep without path"],
  [PTW, "Grep", { pattern: "foo", path: "specs" }, A, "Grep path=specs"],
  [PTW, "Grep", { pattern: "foo", path: "specs", glob: "../backend/**" }, B, "Grep glob with .."],
  [PTW, "Grep", { pattern: "foo", path: "specs/dir-link" }, B, "Grep via dir symlink"],
  [PTW, "Glob", { pattern: "**/*.md", path: "specs" }, A, "Glob path=specs"],
  [PTW, "Glob", { pattern: "../**/*.ts", path: "specs" }, B, "Glob pattern with .."],
  [PTW, "Glob", { pattern: path.join(FAKE, "backend/src/*.ts"), path: "specs" }, B, "Glob absolute pattern"],
  [PTW, "Glob", { pattern: "**/*.ts" }, B, "Glob without path"],
  // ---- private-test-writer: writes (only new .ts/.tsx in the private test folders) ----
  [PTW, "Write", { file_path: `${PRIV}/002-x/a.test.ts` }, A, "Write new .test.ts in backend private"],
  [PTW, "Write", { file_path: `${FE_PRIV}/002-x/b.test.tsx` }, A, "Write new .test.tsx in frontend private"],
  [PTW, "Write", { file_path: path.join(FAKE, `${PRIV}/002-x/abs.test.ts`) }, A, "Write private (absolute path)"],
  [PTW, "Write", { file_path: `${PRIV}/002-x/a.test.ts` }, A, "Write new file in a change folder that does not exist yet"],
  [PTW, "Write", { file_path: `${PRIV}/existing.test.ts` }, B, "Write over an existing private file"],
  [PTW, "Write", { file_path: `${PRIV}/abs.test.ts` }, B, "Write private without <change>/ folder"],
  [PTW, "Write", { file_path: `${PRIV}/x/a.test.ts` }, B, "Write private, change folder not NNN-<name>"],
  [PTW, "Write", { file_path: `${PRIV}/002-x/a.ts` }, B, "Write private without .test. in the name"],
  [PTW, "Write", { file_path: `${PRIV}/002-x/sub/a.test.ts` }, B, "Write private in a nested folder"],
  [PTW, "MultiEdit", { file_path: `${PRIV}/existing.test.ts` }, B, "MultiEdit private"],
  [PTW, "NotebookEdit", { notebook_path: `${PRIV}/002-x/n.ipynb` }, B, "NotebookEdit private"],
  [PTW, "Grep", { pattern: "foo", path: PRIV }, B, "Grep path=private"],
  [PTW, "Glob", { pattern: "**/*.ts", path: PRIV }, B, "Glob path=private"],
  [PTW, "Write", { file_path: `${PRIV}/../../src/x.ts` }, B, "Write private/../../src/x.ts"],
  [PTW, "Write", { file_path: `${PRIV}/x.test.js` }, B, "Write .js in private"],
  [PTW, "Write", { file_path: `${PRIV}/.env` }, B, "Write .env in private"],
  [PTW, "Write", { file_path: "backend/test/public/x.test.ts" }, B, "Write test/public"],
  [PTW, "Write", { file_path: "specs/changes/002-x/spec.md" }, B, "Write specs"],
  [PTW, "Write", { file_path: path.join(OUTSIDE, "outside.test.ts") }, B, "Write outside project"],
  [PTW, "Write", { file_path: `${PRIV}/escape/x.ts` }, B, "Write via dir symlink private -> src"],
  [PTW, "Write", { file_path: `${PRIV}/dangle.test.ts` }, B, "Write through dangling symlink"],
  [PTW, "Write", {}, B, "Write without file_path"],
  [PTW, "Edit", { file_path: `${PRIV}/existing.test.ts` }, B, "Edit (tool not allowed)"],
  [PTW, "Bash", { command: "pnpm test:private" }, B, "Bash pnpm test:private"],
  [PTW, "Bash", { command: "ls specs" }, B, "Bash ls"],
  [PTW, "WebFetch", { url: "https://example.com" }, B, "WebFetch"],
  // ---- other roles: private test folders stay closed ----
  ["test-writer", "Write", { file_path: `${PRIV}/a.test.ts` }, B, "test-writer Write private"],
  ["code-writer", "Write", { file_path: `${PRIV}/a.test.ts` }, B, "code-writer Write private"],
  ["main", "Write", { file_path: `${PRIV}/a.test.ts` }, B, "main Write private"],
  ["test-writer", "Read", { file_path: `${PRIV}/existing.test.ts` }, B, "test-writer Read private"],
  ["main", "Read", { file_path: `${PRIV}/existing.test.ts` }, B, "main Read private"],
  ["main", "Write", { file_path: `${PRIV}/002-x/a.test.ts` }, B, "main Write private <change>/ file"],
  ["test-writer", "Write", { file_path: `${FE_PRIV}/002-x/b.test.tsx` }, B, "test-writer Write frontend private <change>/ file"],
  ["main", "Edit", { file_path: `${PRIV}/existing.test.ts` }, B, "main Edit private"],
  ["code-writer", "MultiEdit", { file_path: `${PRIV}/existing.test.ts` }, B, "code-writer MultiEdit private"],
  ["main", "NotebookEdit", { notebook_path: `${PRIV}/n.ipynb` }, B, "main NotebookEdit private"],
  ["main", "Read", { file_path: "notes/priv-file.md" }, B, "main Read file symlink -> private"],
  ["main", "Read", { file_path: "notes/priv-dir/existing.test.ts" }, B, "main Read via dir symlink -> private"],
  ["main", "Edit", { file_path: "notes/priv-file.md" }, B, "main Edit file symlink -> private"],
  ["main", "Grep", { pattern: "x", path: "notes/priv-dir" }, B, "main Grep via dir symlink -> private"],
  ["main", "Grep", { pattern: "x", path: PRIV }, B, "main Grep path=private"],
  ["main", "Grep", { pattern: "x", path: "backend/test" }, B, "main Grep path=backend/test (parent of private)"],
  ["test-planner", "Grep", { pattern: "x", path: "backend" }, B, "test-planner Grep path=backend (parent of private)"],
  ["main", "Glob", { pattern: "**/*.ts", path: "frontend/test" }, B, "main Glob path=frontend/test"],
  ["main", "Glob", { pattern: "backend/test/**/*.ts" }, B, "main Glob pattern backend/test/**"],
  ["main", "Glob", { pattern: "**/test/**/*.ts" }, B, "main Glob pattern **/test/**"],
  ["main", "Grep", { pattern: "x", glob: "backend/test/**" }, B, "main Grep glob backend/test/**"],
  ["main", "Grep", { pattern: "x", path: "backend/test/public" }, A, "main Grep path=backend/test/public"],
  ["main", "Grep", { pattern: "x", path: "backend/src" }, A, "main Grep path=backend/src"],
  ["main", "Glob", { pattern: "backend/test/public/**/*.ts" }, A, "main Glob pattern backend/test/public/**"],
  ["main", "Grep", { pattern: "x" }, A, "main Grep without path (project root)"],
  ["main", "Grep", { pattern: "see test/foo" }, A, "main Grep regex mentioning test/ (not a glob)"],
  ["main", "Read", { file_path: "notes/readme.md" }, A, "main Read normal file"],
  ["main", "Bash", { command: "cat " + `${PRIV}/existing.test.ts` }, B, "main Bash cat private"],
  // ---- Bash: hidden test commands are never run through Claude ----
  ["main", "Bash", { command: "pnpm test:private" }, B, "main pnpm test:private"],
  ["main", "Bash", { command: "pnpm typecheck:private" }, B, "main pnpm typecheck:private"],
  ["main", "Bash", { command: "pnpm run typecheck:private" }, B, "main pnpm run typecheck:private"],
  ["main", "Bash", { command: "pnpm --filter=backend test:private" }, B, "main pnpm --filter=backend test:private"],
  ["code-writer", "Bash", { command: "pnpm --filter backend test:private" }, B, "code-writer pnpm --filter backend test:private"],
  ["main", "Bash", { command: "cd backend && pnpm test:private" }, B, "main cd backend && pnpm test:private"],
  ["main", "Bash", { command: "npx tsc -p tsconfig.private.json" }, B, "main npx tsc -p tsconfig.private.json"],
  ["test-writer", "Bash", { command: "pnpm test " + `${PRIV}/x.test.ts` }, B, "test-writer pnpm test <private path>"],
  // ---- Bash: strict allow-list for test / typecheck commands ----
  ["main", "Bash", { command: "pnpm test private" }, B, "main pnpm test private (substring filter)"],
  ["main", "Bash", { command: "pnpm exec vitest run priv" }, B, "main pnpm exec vitest run priv"],
  ["main", "Bash", { command: "pnpm test a" }, B, "main pnpm test a"],
  ["test-writer", "Bash", { command: "pnpm --filter backend test foo" }, B, "test-writer pnpm --filter backend test foo"],
  ["main", "Bash", { command: 'pnpm "test:private"' }, B, 'main pnpm "test:private" (quoted script name)'],
  ["main", "Bash", { command: "pnpm 'test:pri''vate'" }, B, "main pnpm 'test:pri''vate' (split quotes)"],
  ["main", "Bash", { command: "X=test:private; pnpm $X" }, B, "main X=test:private; pnpm $X"],
  ["main", "Bash", { command: "X='test:pri''vate'; pnpm $X" }, B, "main quoted var then pnpm $X"],
  ["main", "Bash", { command: "pnpm test --dir=../frontend" }, B, "main pnpm test --dir=.. (flag value with ..)"],
  ["main", "Bash", { command: "pnpm test --root=/tmp" }, B, "main pnpm test --root=/tmp (flag value with /)"],
  ["main", "Bash", { command: "pnpm test > out.txt" }, B, "main pnpm test > out.txt"],
  ["code-writer", "Bash", { command: "npx vitest run test/public/a.test.ts" }, B, "code-writer npx vitest (not in allow-list)"],
  ["code-writer", "Bash", { command: "npx tsc --noEmit" }, B, "code-writer npx tsc (not in allow-list)"],
  ["main", "Bash", { command: "node node_modules/vitest/vitest.mjs run" }, B, "main node .../vitest.mjs"],
  ["main", "Bash", { command: "pnpm -r test" }, B, "main pnpm -r test (not in allow-list)"],
  ["main", "Bash", { command: "pnpm test" }, A, "main pnpm test"],
  ["test-writer", "Bash", { command: "pnpm --filter backend test test/public/a.test.ts" }, A, "test-writer pnpm --filter backend test test/public/a.test.ts"],
  ["test-writer", "Bash", { command: "pnpm test backend/test/public/a.test.ts" }, A, "test-writer pnpm test backend/test/public/..."],
  ["main", "Bash", { command: "pnpm test test/public/privacy.test.ts" }, A, "main pnpm test test/public/privacy.test.ts"],
  ["test-writer", "Bash", { command: "pnpm --filter=frontend test -- -t=PROD-001-S2 --reporter=verbose" }, A, "test-writer flags only"],
  ["code-writer", "Bash", { command: "pnpm --filter frontend typecheck" }, A, "code-writer pnpm --filter frontend typecheck"],
  ["test-writer", "Bash", { command: "pnpm --filter backend typecheck:test" }, A, "test-writer pnpm --filter backend typecheck:test"],
  ["main", "Bash", { command: "pnpm ci:local" }, A, "main pnpm ci:local"],
  ["main", "Bash", { command: "pnpm test 2>&1 | tail -40" }, A, "main pnpm test 2>&1 | tail -40"],
  ["main", "Bash", { command: "cd backend && pnpm test" }, A, "main cd backend && pnpm test"],
  // ---- Bash: not test commands, unchanged ----
  ["main", "Bash", { command: 'git commit -m "pnpm test:private"' }, A, 'main git commit -m "pnpm test:private"'],
  ["main", "Bash", { command: "git commit -q -F - <<'EOF'\nRun pnpm typecheck:private by hand\nEOF" }, A, "main git commit heredoc mentioning typecheck:private"],
  ["main", "Bash", { command: "pnpm lint" }, A, "main pnpm lint"],
  ["main", "Bash", { command: "pnpm install --frozen-lockfile" }, A, "main pnpm install"],
  ["main", "Bash", { command: "pnpm db:up" }, A, "main pnpm db:up"],
  ["main", "Bash", { command: 'bash k8s/agents/dispatch.sh j1 k8s/agents/tasks/j1.md --title "Fix x"' }, A, "main dispatch.sh (run_private runs inside)"],
  ["main", "Bash", { command: 'bash k8s/agents/dispatch.sh j1 k8s/agents/tasks/j1.md --title "Fix x" --no-private --dry-run' }, A, "main dispatch.sh --no-private --dry-run"],
  // ---- encrypted hidden tests: keys, full logs and decryption stay closed; seal scripts run ----
  ["main", "Read", { file_path: AGE_KEY }, B, "main Read age key"],
  ["code-writer", "Read", { file_path: AGE_KEY }, B, "code-writer Read age key"],
  ["main", "Glob", { pattern: "**/*.key", path: path.join(HOME, ".config/age") }, B, "main Glob in ~/.config/age"],
  ["main", "Grep", { pattern: "AGE-SECRET", path: HOME, glob: ".config/age/*" }, B, "main Grep glob .config/age"],
  ["main", "Read", { file_path: HIDDEN_LOG }, B, "main Read hidden-test log"],
  ["main", "Write", { file_path: AGE_KEY }, B, "main Write age key"],
  ["main", "Bash", { command: "cat ~/.config/age/react-crud-private-tests.key" }, B, "main Bash cat age key"],
  ["main", "Bash", { command: 'cat "$HOME/.config/age/x.key"' }, B, "main Bash cat quoted age key"],
  ["main", "Bash", { command: "tail -50 ~/.local/state/hidden-tests/repo/logs/j1-private.log" }, B, "main Bash tail hidden-test log"],
  ["main", "Bash", { command: "age -d -i k private-tests/tests.tar.age | tar -xO" }, B, "main Bash age -d"],
  ["main", "Bash", { command: "cd private-tests && age --decrypt -i /tmp/k tests.tar.age" }, B, "main Bash age --decrypt"],
  ["code-writer", "Bash", { command: "rage -d -i k private-tests/tests.tar.age" }, B, "code-writer Bash rage -d"],
  ["main", "Bash", { command: "age -R private-tests/recipients.txt -o /tmp/x.age /tmp/x" }, A, "main Bash age encrypt (public key only)"],
  ["main", "Bash", { command: "bash k8s/agents/private-seal.sh" }, A, "main private-seal.sh"],
  ["main", "Bash", { command: "bash k8s/agents/private-unseal.sh --merge" }, A, "main private-unseal.sh --merge"],
  ["main", "Bash", { command: "git add private-tests/tests.tar.age" }, A, "main git add sealed file"],
  ["main", "Read", { file_path: "private-tests/recipients.txt" }, A, "main Read recipients"],
  ["main", "Write", { file_path: "private-tests/recipients.txt" }, Q, "main Write recipients (asked)"],
  ["code-writer", "Write", { file_path: "private-tests/tests.tar.age" }, B, "code-writer Write sealed file"],
  ["test-writer", "Write", { file_path: "private-tests/recipients.txt" }, B, "test-writer Write recipients"],
  ["code-writer", "Bash", { command: "cp /tmp/x.age private-tests/tests.tar.age" }, B, "code-writer Bash cp over sealed file"],
  ["main", "Bash", { command: "cp /tmp/x.age private-tests/tests.tar.age" }, Q, "main Bash cp over sealed file (asked)"],
  // ---- harness files: main session is asked (CLAUDE.md in any case, every file system) ----
  ["main", "Write", { file_path: "CLAUDE.md" }, Q, "main Write CLAUDE.md"],
  ["main", "Write", { file_path: "claude.md" }, Q, "main Write claude.md"],
  ["main", "Write", { file_path: "Claude.MD" }, Q, "main Write Claude.MD"],
  ["main", "Write", { file_path: ".claude/settings.json" }, Q, "main Write .claude/settings.json"],
  ["main", "Bash", { command: "echo x > CLAUDE.md" }, Q, "main Bash echo x > CLAUDE.md"],
  ["main", "Bash", { command: "echo x > claude.md" }, Q, "main Bash echo x > claude.md"],
  ["test-writer", "Write", { file_path: "CLAUDE.md" }, B, "test-writer Write CLAUDE.md"],
  // ---- other roles: normal work still allowed ----
  ["test-writer", "Write", { file_path: "backend/test/public/a.test.ts" }, A, "test-writer Write public"],
  ["code-writer", "Write", { file_path: "backend/src/x.ts" }, A, "code-writer Write src"],
  ["code-reviewer", "Read", { file_path: "backend/src/app.ts" }, A, "code-reviewer Read src"],
  ["planner", "Read", { file_path: "specs/changes/002-x/spec.md" }, A, "planner Read specs"],
  ["main", "Read", { file_path: "specs/_system/nfr.md" }, A, "main Read specs"],
  ["spec-writer", "Write", { file_path: "specs/changes/002-x/spec.md" }, A, "spec-writer Write specs/changes"],
];

// ---- case-insensitive file system: changing case must not get around any rule ----
// Same dir in another case is the same dir, so the allow-lists accept it too (last rows).
const caseCases = [
  ["main", "Read", { file_path: "backend/test/Private/existing.test.ts" }, B, "main Read test/Private"],
  ["main", "Read", { file_path: "Backend/Test/private/existing.test.ts" }, B, "main Read Backend/Test/private"],
  ["code-writer", "Read", { file_path: "backend/test/Private/existing.test.ts" }, B, "code-writer Read test/Private"],
  ["code-writer", "Read", { file_path: "Backend/Test/private/existing.test.ts" }, B, "code-writer Read Backend/Test/private"],
  ["main", "Grep", { pattern: "x", path: "backend/test/PRIVATE" }, B, "main Grep path test/PRIVATE"],
  ["main", "Glob", { pattern: "backend/test/Private/**" }, B, "main Glob pattern test/Private"],
  ["main", "Write", { file_path: "backend/Test/public/x.test.ts" }, B, "main Write backend/Test/public"],
  ["main", "Write", { file_path: "Backend/Src/x.ts" }, B, "main Write Backend/Src"],
  ["main", "Write", { file_path: "backend/Test/Private/new.test.ts" }, B, "main Write backend/Test/Private"],
  ["test-writer", "Write", { file_path: "backend/test/Private/new.test.ts" }, B, "test-writer Write test/Private"],
  ["main", "Write", { file_path: ".Claude/settings.json" }, Q, "main Write .Claude/ (harness -> ask)"],
  ["main", "Write", { file_path: "Backend/.ENV" }, B, "main Write Backend/.ENV"],
  [PTW, "Read", { file_path: "Backend/src/app.ts" }, B, "PTW Read Backend/src"],
  [PTW, "Read", { file_path: "SPECS/../backend/src/app.ts" }, B, "PTW Read SPECS/../backend/src"],
  ["main", "Bash", { command: "cat backend/test/Private/existing.test.ts" }, B, "main Bash cat test/Private"],
  ["main", "Bash", { command: "cat Backend/Test/Private/existing.test.ts" }, B, "main Bash cat Backend/Test/Private"],
  ["main", "Bash", { command: "PNPM test a" }, B, "main Bash PNPM test a"],
  ["main", "Bash", { command: "Pnpm Test:Private" }, B, "main Bash Pnpm Test:Private"],
  ["main", "Bash", { command: "echo x > .Claude/settings.json" }, Q, "main Bash echo > .Claude/ (harness -> ask)"],
  ["code-writer", "Bash", { command: "echo x > Backend/Test/public/a.test.ts" }, B, "code-writer Bash write Backend/Test/public"],
  ["test-writer", "Write", { file_path: "Backend/Test/Public/x.test.ts" }, A, "test-writer Write Backend/Test/Public (same dir)"],
  ["code-writer", "Write", { file_path: "Backend/SRC/x.ts" }, A, "code-writer Write Backend/SRC (same dir)"],
  [PTW, "Read", { file_path: "SPECS/_system/nfr.md" }, A, "PTW Read SPECS/ (same dir)"],
  [PTW, "Write", { file_path: "Backend/Test/Private/n.test.ts" }, B, "PTW Write Backend/Test/Private (exact lowercase only)"],
  [PTW, "Write", { file_path: "backend/test/Private/n.test.ts" }, B, "PTW Write backend/test/Private (exact lowercase only)"],
  ["main", "Bash", { command: "PNPM test" }, A, "main Bash PNPM test"],
];

const run = (label, extraEnv, withCaseCases) => {
  const all = withCaseCases ? [...cases, ...caseCases] : cases;
  let pass = 0, failN = 0;
  console.log(`\n=== ${label}${withCaseCases ? "" : ` (case-sensitive file system: skipping ${caseCases.length} case-change cases)`}`);
  for (const [agent, tool, input, want, name] of all) {
    const payload = { tool_name: tool, tool_input: input, cwd: FAKE, ...(agent === "main" ? {} : { agent_type: agent }) };
    const r = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify(payload),
      env: { ...process.env, GUARD_CASE_INSENSITIVE: "", ...extraEnv, CLAUDE_PROJECT_DIR: FAKE },
      encoding: "utf8",
    });
    const got =
      r.status === 2 ? B : r.status === 0 && r.stdout.includes('"ask"') ? Q : r.status === 0 ? A : `OTHER(status=${r.status}, ${r.stdout.trim()})`;
    const ok = got === want;
    ok ? pass++ : failN++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${agent.padEnd(19)} ${tool.padEnd(8)} want=${want} got=${got}  ${name}${ok ? "" : "  | " + r.stderr.trim()}`);
  }
  console.log(`${label}: ${pass} passed, ${failN} failed, ${all.length} cases`);
  return failN;
};

let failures = 0;
try {
  failures += run("run 1: as is", {}, CASE_INSENSITIVE_FS);
  failures += run("run 2: GUARD_CASE_INSENSITIVE=1", { GUARD_CASE_INSENSITIVE: "1" }, true);
} finally {
  fs.rmSync(FAKE, { recursive: true, force: true });
  fs.rmSync(OUTSIDE, { recursive: true, force: true });
}
console.log(`\n${failures ? `FAILED: ${failures} case(s)` : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
