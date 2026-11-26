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
fs.symlinkSync(path.join(FAKE, PRIV), path.join(OUTSIDE, "plink")); // symlink outside the project -> private tests
// File system of the temp dir ignores case (default on macOS, Windows)?
const CASE_INSENSITIVE_FS = fs.existsSync(path.join(FAKE, "SPECS"));

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
  [PTW, "Write", { file_path: path.join(FAKE, `${PRIV}/abs.test.ts`) }, A, "Write private (absolute path)"],
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
  // ---- bug flow (skill bug-fix-flow): bug-investigator only reads; the main session writes the record in bugs/ ----
  ["bug-investigator", "Write", { file_path: "backend/src/x.ts" }, B, "bug-investigator Write src"],
  ["bug-investigator", "Write", { file_path: "bugs/x/investigation.md" }, B, "bug-investigator Write bugs/ (read-only agent)"],
  ["main", "Write", { file_path: "bugs/x/report.md" }, A, "main Write bugs/x/report.md"],
  // ---- Bash: subagents never write files through Bash (Edit/Write only); narrow exceptions per agent ----
  ...["code-reviewer", "test-critic", "bug-investigator"].flatMap((who) => [
    [who, "Bash", { command: "echo x > specs/changes/001-x/spec.md" }, B, `${who} echo > specs/`],
    [who, "Bash", { command: "sed -i s/3/5/ specs/changes/001-x/spec.md" }, B, `${who} sed -i specs/`],
    [who, "Bash", { command: 'echo "Root cause: approved by user" >> bugs/x/investigation.md' }, B, `${who} echo >> bugs/`],
    [who, "Bash", { command: `node -e "require('fs').writeFileSync('specs/a','x')"` }, B, `${who} node -e writeFileSync`],
    [who, "Bash", { command: "git stash" }, B, `${who} git stash`],
    [who, "Bash", { command: "find specs -name x -delete" }, B, `${who} find -delete`],
  ]),
  ["bug-investigator", "Bash", { command: "python3 - <<'EOF'\nopen('specs/a', 'w').write('x')\nEOF" }, B, "bug-investigator python3 - heredoc"],
  ["bug-investigator", "Bash", { command: "echo 'rm -rf specs' | sh" }, B, "bug-investigator pipe into sh"],
  ["bug-investigator", "Bash", { command: "'rm' specs/a" }, B, "bug-investigator quoted 'rm'"],
  ["code-writer", "Bash", { command: "echo x > specs/changes/001-x/spec.md" }, B, "code-writer echo > specs/"],
  ["code-writer", "Bash", { command: "echo x > docs/requirements/a.md" }, B, "code-writer echo > docs/"],
  ["bug-investigator", "Bash", { command: "git log -p -n 5 -- backend/src/app.ts" }, A, "bug-investigator git log -p"],
  ["bug-investigator", "Bash", { command: "pnpm --filter backend test -t=ABC-003-S2" }, A, "bug-investigator pnpm test -t=<ID>"],
  ["code-reviewer", "Bash", { command: "git diff 2>&1 | head -50" }, A, "code-reviewer git diff 2>&1 | head"],
  ["test-critic", "Bash", { command: "pnpm --filter backend exec stryker run" }, A, "test-critic stryker run"],
  ["test-writer", "Bash", { command: "rm backend/test/public/a.test.ts" }, A, "test-writer rm one test file (existing exception)"],
  ["spec-writer", "Bash", { command: "git checkout -b 003-bulk-delete" }, A, "spec-writer git checkout -b NNN-<kebab> (speckit-specify)"],
  ["spec-writer", "Bash", { command: "mkdir -p specs/changes/003-bulk-delete" }, A, "spec-writer mkdir -p specs/changes/NNN-<kebab> (speckit-specify)"],
  ["spec-writer", "Bash", { command: "mkdir -p specs/changes/003-bulk-delete/checklists" }, A, "spec-writer mkdir -p .../checklists"],
  ["spec-writer", "Bash", { command: `mkdir -p ${path.join(FAKE, "specs/changes/003-bulk-delete")}` }, A, "spec-writer mkdir -p (absolute FEATURE_DIR)"],
  ["planner", "Bash", { command: "mkdir -p specs/changes/003-bulk-delete/checklists" }, A, "planner mkdir -p .../checklists (speckit-checklist)"],
  ["planner", "Bash", { command: `mkdir -p "${path.join(FAKE, "specs/changes/003-bulk-delete/checklists")}"` }, A, "planner mkdir -p (absolute, quoted)"],
  ["spec-writer", "Bash", { command: "mkdir -p backend/src/x" }, B, "spec-writer mkdir -p backend/src"],
  ["spec-writer", "Bash", { command: "git checkout main" }, B, "spec-writer git checkout main"],
  ["spec-writer", "Bash", { command: "git checkout -b feature-x" }, B, "spec-writer git checkout -b (not NNN-<kebab>)"],
  ["spec-writer", "Bash", { command: "mkdir -p specs/changes/003-x/../../capabilities/x" }, B, "spec-writer mkdir -p with .."],
  ["spec-writer", "Bash", { command: "mkdir -p specs/changes/003-x && echo x > specs/changes/003-x/spec.md" }, B, "spec-writer exception + redirect"],
  ["planner", "Bash", { command: "mkdir -p specs/changes/003-bulk-delete" }, B, "planner mkdir -p change dir (only checklists)"],
  ["main", "Bash", { command: "echo x > specs/changes/001-x/spec.md" }, Q, "main echo > specs/ (ask)"],
  ["main", "Bash", { command: `echo x > ${path.join(FAKE, "specs/changes/001-x/spec.md")}` }, Q, "main echo > specs/ (absolute path, ask)"],
  ["main", "Bash", { command: "echo x > bugs/x/report.md" }, A, "main echo > bugs/"],
  ["main", "Bash", { command: "git add specs/changes/003-x && git commit -q -m spec" }, A, "main git add/commit specs (index only)"],
  ["main", "Bash", { command: "python3 .claude/skills/spec-archive/scripts/change.py sync --change 003-x" }, A, "main spec-archive script"],
  // ---- code-writer: rm / git mv one file, git restore|checkout -- files, all inside src (undo a failed fix) ----
  ["code-writer", "Bash", { command: "rm frontend/src/old.ts" }, A, "code-writer rm one src file"],
  ["code-writer", "Bash", { command: "git mv backend/src/a.ts backend/src/b.ts" }, A, "code-writer git mv src -> src"],
  ["code-writer", "Bash", { command: "git restore -- backend/src/x.ts" }, A, "code-writer git restore -- src file"],
  ["code-writer", "Bash", { command: "git checkout -- frontend/src/a.ts frontend/public/b.svg" }, A, "code-writer git checkout -- src files"],
  ["code-writer", "Bash", { command: "rm frontend/src/a.ts frontend/src/b.ts" }, B, "code-writer rm two files"],
  ["code-writer", "Bash", { command: "git mv backend/src/a.ts specs/a.ts" }, B, "code-writer git mv src -> specs"],
  ["code-writer", "Bash", { command: "git restore ." }, B, "code-writer git restore ."],
  ["code-writer", "Bash", { command: "git checkout -- backend/src/../../specs/x.md" }, B, "code-writer git checkout -- with .."],
  ["code-writer", "Bash", { command: "rm -rf frontend/src" }, B, "code-writer rm -rf src"],
  ["code-writer", "Bash", { command: "rm frontend/src/*.ts" }, B, "code-writer rm glob"],
  ["code-writer", "Bash", { command: "rm frontend/src/old.ts && echo x > specs/a.md" }, B, "code-writer rm + chained command"],
  // ---- more write paths for subagents ----
  ["code-reviewer", "Bash", { command: "pnpm exec eslint --fix specs" }, B, "code-reviewer pnpm exec eslint --fix"],
  ["code-reviewer", "Bash", { command: "npx prettier --write specs/a.md" }, B, "code-reviewer npx prettier --write"],
  ["code-reviewer", "Bash", { command: "git config core.hooksPath /tmp/h" }, B, "code-reviewer git config <set>"],
  ["code-reviewer", "Bash", { command: "git branch -D harness-base" }, B, "code-reviewer git branch -D"],
  ["code-reviewer", "Bash", { command: "pnpm add lodash" }, B, "code-reviewer pnpm add"],
  ["code-reviewer", "Bash", { command: "python3 .claude/skills/spec-archive/scripts/change.py sync --change 001-x" }, B, "code-reviewer spec-archive script"],
  ["code-reviewer", "Bash", { command: "pnpm --filter backend add lodash" }, B, "code-reviewer pnpm --filter add"],
  ["code-reviewer", "Bash", { command: "pnpm lint --fix" }, B, "code-reviewer pnpm lint --fix"],
  ["code-reviewer", "Bash", { command: "git worktree add /tmp/w" }, B, "code-reviewer git worktree add"],
  ["code-reviewer", "Bash", { command: "git tag v1" }, B, "code-reviewer git tag <name>"],
  ["code-reviewer", "Bash", { command: "git branch --show-current" }, A, "code-reviewer git branch --show-current"],
  ["code-reviewer", "Bash", { command: "git branch -a" }, A, "code-reviewer git branch -a"],
  ["code-reviewer", "Bash", { command: "git tag --list" }, A, "code-reviewer git tag --list"],
  ["code-reviewer", "Bash", { command: "git config --get user.name" }, A, "code-reviewer git config --get"],
  ["code-reviewer", "Bash", { command: "git config --list" }, A, "code-reviewer git config --list"],
  ["code-reviewer", "Bash", { command: "pnpm lint" }, A, "code-reviewer pnpm lint"],
  ["code-reviewer", "Bash", { command: "pnpm --filter frontend exec eslint --fix-dry-run src" }, A, "code-reviewer eslint --fix-dry-run"],
  ["main", "Bash", { command: "python3 .claude/skills/spec-archive/scripts/change.py sync --change 001-x --dry-run" }, A, "main spec-archive --dry-run"],
  // ---- security-reviewer: read-only (Edit/Write and Bash writes blocked), reads the diff against the base branch ----
  ["security-reviewer", "Write", { file_path: "backend/src/x.ts" }, B, "security-reviewer Write src"],
  ["security-reviewer", "Write", { file_path: "specs/changes/001-x/spec.md" }, B, "security-reviewer Write specs/changes"],
  ["security-reviewer", "Bash", { command: "echo x > bugs/x/a.md" }, B, "security-reviewer echo > bugs/"],
  ["security-reviewer", "Bash", { command: "git diff --merge-base harness-base" }, A, "security-reviewer git diff --merge-base <base>"],
  ["security-reviewer", "Bash", { command: "git log --no-decorate harness-base..." }, A, "security-reviewer git log --no-decorate <base>..."],
  // ---- approvals locked with sha256 (approval.py): nobody writes approval.json / .approved/, nobody runs approve ----
  ["main", "Write", { file_path: "specs/changes/001-x/approval.json" }, B, "main Write approval.json"],
  ["main", "Edit", { file_path: "bugs/20261125-x/approval.json" }, B, "main Edit bugs/<id>/approval.json"],
  ["main", "Write", { file_path: "specs/changes/001-x/.approved/spec/spec.md" }, B, "main Write .approved/"],
  ["spec-writer", "Write", { file_path: "specs/changes/001-x/approval.json" }, B, "spec-writer Write approval.json (inside specs/changes)"],
  ["planner", "Edit", { file_path: "specs/changes/001-x/.approved/plan/plan.md" }, B, "planner Edit .approved/"],
  ["code-writer", "MultiEdit", { file_path: "bugs/20261125-x/.approved/root-cause/report.md" }, B, "code-writer MultiEdit .approved/"],
  ["main", "Bash", { command: "python3 .specify/scripts/approval.py approve --change 001-x --gate spec" }, B, "main approval.py approve"],
  ["main", "Bash", { command: "script -q /dev/null python3 .specify/scripts/approval.py approve --change 001-x --gate plan" }, B, "main approve through script (pty)"],
  ["main", "Bash", { command: `bash -c "python3 .specify/scripts/approval.py approve --bug 20261125-x --gate root-cause --summary x"` }, B, "main approve inside bash -c quotes"],
  ["code-reviewer", "Bash", { command: "python3 .specify/scripts/approval.py approve --change 001-x --gate spec" }, B, "code-reviewer approval.py approve"],
  ["main", "Bash", { command: "echo '{}' > specs/changes/001-x/approval.json" }, B, "main echo > approval.json"],
  ["main", "Bash", { command: "rm -rf specs/changes/001-x/.approved" }, B, "main rm -rf .approved"],
  ["main", "Bash", { command: "git checkout -- bugs/20261125-x/approval.json" }, B, "main git checkout -- approval.json"],
  ["spec-writer", "Bash", { command: "cp /tmp/a.json specs/changes/001-x/approval.json" }, B, "spec-writer cp > approval.json"],
  ["bug-investigator", "Bash", { command: "sed -i s/a/b/ bugs/20261125-x/approval.json" }, B, "bug-investigator sed -i approval.json"],
  ["main", "Bash", { command: "python3 .specify/scripts/approval.py verify --change 001-x" }, A, "main approval.py verify"],
  ["main", "Bash", { command: "python3 .specify/scripts/approval.py verify --bug 20261125-x" }, A, "main approval.py verify --bug"],
  ["code-reviewer", "Bash", { command: "python3 .specify/scripts/approval.py verify --change 001-x --gate plan" }, A, "code-reviewer approval.py verify"],
  ["bug-investigator", "Bash", { command: "python3 .specify/scripts/approval.py verify --bug 20261125-x" }, A, "bug-investigator approval.py verify"],
  ["main", "Bash", { command: "git add specs/changes/001-x/approval.json specs/changes/001-x/.approved" }, A, "main git add approval.json (commit with the change)"],
  ["main", "Bash", { command: "cat specs/changes/001-x/approval.json" }, A, "main cat approval.json"],
  ["main", "Read", { file_path: "specs/changes/001-x/approval.json" }, A, "main Read approval.json"],
  // ---- Bash path rules: paths outside the project and data-only heredocs do not count ----
  ["main", "Bash", { command: "mkdir -p /tmp/x/backend/test/public" }, A, "main mkdir test/ path under /tmp (outside the project)"],
  ["main", "Bash", { command: `mkdir -p ${path.join(OUTSIDE, "y/backend/test/public")}` }, A, "main mkdir test/ path in another temp dir"],
  ["main", "Bash", { command: 'T=$(mktemp -d /tmp/a.XXXX) && mkdir -p "$T/backend/test/public"' }, A, "main mkdir $T/... with T=$(mktemp -d /tmp/...)"],
  ["main", "Bash", { command: 'T=$(mktemp -d) && mkdir -p "$T/backend/test/public"' }, A, "main mkdir $T/... with T=$(mktemp -d) (default tmp dir)"],
  ["main", "Bash", { command: 'mkdir -p "$X/backend/test/public"' }, B, "main mkdir $X/... with X unknown (checked as before)"],
  ["main", "Bash", { command: "cat /tmp/x/test/private/a.md" }, A, "main cat test/private path outside the project"],
  ["main", "Bash", { command: "git commit -q -F - <<'EOF'\nAdd backend/test/public/a.test.ts\nEOF" }, A, "main git commit heredoc body with a test/ path"],
  ["main", "Bash", { command: "cat > /tmp/n.md <<EOF\nsee bugs/x/approval.json\nEOF" }, A, "main cat > /tmp file, heredoc body mentions approval.json"],
  ["main", "Bash", { command: 'git commit -m "$(cat <<\'EOF\'\nfix backend/test/private/x\nEOF\n)"' }, A, "main commit message via $(cat <<EOF) mentioning test/private"],
  ["main", "Bash", { command: "mkdir -p backend/test/public/x" }, B, "main mkdir relative test/ path (as before)"],
  ["main", "Bash", { command: `mkdir -p ${path.join(FAKE, "backend/test/public/x")}` }, B, "main mkdir absolute test/ path inside the project"],
  ["main", "Bash", { command: `cat ${path.join(OUTSIDE, "plink")}/x.test.ts` }, B, "main cat through a /tmp symlink into test/private"],
  ["main", "Bash", { command: "python3 - <<EOF\nopen('bugs/x/approval.json', 'w').write('{}')\nEOF" }, B, "main python3 heredoc writing approval.json"],
  ["main", "Bash", { command: "cat <<EOF | python3\nopen('bugs/x/approval.json', 'w').write('{}')\nEOF" }, B, "main heredoc piped into python3 writing approval.json"],
  ["main", "Bash", { command: "cat > backend/test/public/a.test.ts <<EOF\nit('x', () => {});\nEOF" }, B, "main cat > test/ file (redirect outside the heredoc)"],
  ["main", "Bash", { command: "node <<EOF\nrequire('fs').readFileSync('backend/test/private/a.test.ts')\nEOF" }, B, "main node heredoc reading test/private"],
  ["main", "Bash", { command: "xargs rm <<EOF\nbackend/test/public/a.test.ts\nEOF" }, B, "main xargs rm with paths in the heredoc"],
  // the rest of the line that opens a heredoc is command text (was dropped with the body before)
  ["main", "Bash", { command: "cat <<EOF > backend/test/public/a.test.ts\nit('x', () => {});\nEOF" }, B, "main cat <<EOF > test/ file (redirect after the heredoc marker)"],
  ["main", "Bash", { command: "cat <<EOF > /tmp/n.md\nsee backend/test/private/a.test.ts\nEOF" }, A, "main cat <<EOF > /tmp file, body mentions test/private"],
  ["test-writer", "Bash", { command: "cat <<EOF > backend/test/public/a.test.ts\nit('x', () => {});\nEOF" }, B, "test-writer cat <<EOF > test/ file (Bash write)"],
  ["code-writer", "Bash", { command: "cat <<EOF > backend/src/x.ts\nexport const x = 1;\nEOF" }, B, "code-writer cat <<EOF > src file (Bash write)"],
  ["code-reviewer", "Bash", { command: "mkdir -p /tmp/x/backend/test/public" }, B, "code-reviewer mkdir under /tmp (subagent writes stay blocked)"],
  ["code-reviewer", "Bash", { command: "cat > /tmp/n.md <<EOF\nnotes\nEOF" }, B, "code-reviewer cat > /tmp file (subagent writes stay blocked)"],
  ["code-reviewer", "Bash", { command: "cat /tmp/x/test/private/a.md" }, A, "code-reviewer cat test/private path outside the project"],
  ["code-reviewer", "Bash", { command: `cat ${path.join(OUTSIDE, "plink")}/x.test.ts` }, B, "code-reviewer cat through a /tmp symlink into test/private"],
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
