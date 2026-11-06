#!/usr/bin/env node
// PreToolUse hook: bảo vệ thư mục tests/
//   tests/public  -> được đọc + chạy, KHÔNG được sửa
//   tests/private -> chỉ được chạy, KHÔNG được đọc/sửa
// exit 2 = chặn tool call, nội dung stderr được gửi lại cho agent.
import path from "node:path";

const block = (msg) => {
  process.stderr.write(`[guard-tests] ${msg}\n`);
  process.exit(2);
};

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_name: tool, tool_input: input = {}, cwd = process.cwd() } = JSON.parse(raw || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || cwd;

// Trả về đường dẫn tương đối so với gốc project (vd: "tests/private/a.test.ts")
const rel = (p) => path.relative(root, path.resolve(cwd, p)).split(path.sep).join("/");
const inTests = (p) => /^tests(\/|$)/.test(rel(p));
const inPrivate = (p) => /^tests\/private(\/|$)/.test(rel(p));

if (tool === "Bash") {
  const cmd = String(input.command || "");
  if (!/tests\//.test(cmd)) process.exit(0);

  // Lệnh chạy test hợp lệ: pnpm test tests/... [--flag], không nối lệnh/chuyển hướng
  const isRunTest =
    /^\s*pnpm\s+(run\s+)?test(\s+tests\/(public|private)[^\s;&|<>`$()]*|\s+--?[\w-]+(=[^\s;&|<>`$()]+)?)*\s*$/.test(cmd);
  if (isRunTest) process.exit(0);

  const writes = /(\bsed\s+-i|>>?|\brm\b|\bmv\b|\bcp\b|\btee\b|\btouch\b|\bmkdir\b|\bchmod\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv)\b)/;
  if (writes.test(cmd)) block("Không được sửa/tạo/xoá file trong tests/ (chỉ được chạy test).");
  if (/tests\/private/.test(cmd)) block("tests/private chỉ được chạy bằng `pnpm test tests/private`, không được đọc.");
  process.exit(0);
}

const target = input.file_path || input.notebook_path || input.path || "";

if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  if (target && inTests(target)) block("Không được sửa file trong tests/ (public lẫn private).");
}

if (["Read", "Grep", "Glob"].includes(tool)) {
  if (target && inPrivate(target)) block("Không được đọc tests/private.");
  if (/tests\/private/.test(String(input.pattern || "")) || /tests\/private/.test(String(input.glob || ""))) {
    block("Không được đọc tests/private.");
  }
}

process.exit(0);
