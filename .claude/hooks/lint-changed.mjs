#!/usr/bin/env node
// PostToolUse hook: lint đúng file vừa sửa (chỉ frontend có eslint).
// Có lỗi -> exit 2 để lỗi được gửi lại cho agent tự sửa. Warning không chặn.
import path from "node:path";
import { spawnSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_input: input = {}, cwd = process.cwd() } = JSON.parse(raw || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || cwd;

const file = input.file_path || "";
if (!file) process.exit(0);
const rel = path.relative(root, path.resolve(cwd, file)).split(path.sep).join("/");
if (!/^frontend\/.+\.(ts|tsx|js|jsx|mjs)$/.test(rel)) process.exit(0);

const frontend = path.join(root, "frontend");
const r = spawnSync("pnpm", ["exec", "eslint", "--quiet", path.relative(frontend, path.join(root, rel))], {
  cwd: frontend,
  encoding: "utf8",
});
if (r.status === 0) process.exit(0);
process.stderr.write(`eslint báo lỗi ở ${rel}, sửa trước khi làm tiếp:\n${(r.stdout || "") + (r.stderr || "")}`.slice(0, 4000));
process.exit(2);
