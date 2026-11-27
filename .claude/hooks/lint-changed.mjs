#!/usr/bin/env node
// PostToolUse hook: lints exactly the file just edited, with stack.commands.lintFile of the stack profile in
// .claude/harness.json ({package, match, argv}; ts-pnpm-vitest: eslint in the frontend package). The file must be in
// <package>/ and match `match`; argv runs in the package folder with {file} = the file relative to it.
// Errors -> exit 2, so they are sent back to the agent to fix. Warnings do not block.
// No lintFile (null), or harness.json missing / invalid: nothing to lint (guard.mjs blocks every write then anyway).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_input: input = {}, cwd = process.cwd() } = JSON.parse(raw || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || cwd;

const file = input.file_path || "";
if (!file) process.exit(0);

let lint = null;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, ".claude/harness.json"), "utf8"));
  if (cfg && cfg.version === 2 && cfg.stack && cfg.stack.commands) lint = cfg.stack.commands.lintFile;
} catch {
  process.exit(0);
}
const okArgv = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === "string" && x);
if (!lint || typeof lint.package !== "string" || typeof lint.match !== "string" || !okArgv(lint.argv)) process.exit(0);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
let inScope;
try {
  inScope = new RegExp(`^${reEsc(lint.package)}\\/.+(?:${lint.match})`);
} catch {
  process.exit(0);
}

const rel = path.relative(root, path.resolve(cwd, file)).split(path.sep).join("/");
if (!inScope.test(rel)) process.exit(0);

const pkgDir = path.join(root, lint.package);
const fileArg = path.relative(pkgDir, path.join(root, rel));
const argv = lint.argv.map((a) => a.split("{file}").join(fileArg));
const r = spawnSync(argv[0], argv.slice(1), { cwd: pkgDir, encoding: "utf8" });
if (r.status === 0) process.exit(0);
// The tool's name for the message: the last argv element that is neither an option nor the file (eslint)
const tool = lint.argv.filter((a) => !a.startsWith("-") && !a.includes("{file}")).pop() || argv[0];
process.stderr.write(`${tool} reports errors in ${rel}; fix them before going on:\n${(r.stdout || "") + (r.stderr || "")}`.slice(0, 4000));
process.exit(2);
