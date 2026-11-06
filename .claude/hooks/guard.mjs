#!/usr/bin/env node
// PreToolUse hook: phân quyền ghi file theo agent (agent_type trong input của hook).
//   session chính (không có agent_type) -> điều phối: không sửa src/ hay test/
//   code-writer  -> chỉ sửa backend/src, frontend/src, frontend/public
//   test-writer  -> chỉ sửa <package>/test/public, frontend/test/e2e
//   agent khác   -> không ghi gì
// Không ai được đọc <package>/test/private và .env.
// File harness (.claude/, CLAUDE.md, config test, package.json) -> hỏi người dùng.
// exit 2 = chặn, stderr được gửi lại cho agent.
import path from "node:path";

const block = (msg) => {
  process.stderr.write(`[guard] ${msg}\n`);
  process.exit(2);
};
const ask = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `[guard] ${reason}`,
      },
    }),
  );
  process.exit(0);
};
const allow = () => process.exit(0);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_name: tool, tool_input: input = {}, cwd = process.cwd(), agent_type } = JSON.parse(raw || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || cwd;
const agent = agent_type || "main";
const who = agent === "main" ? "Session chính" : agent;

// Đường dẫn tương đối so với gốc project, vd "backend/test/private/a.test.ts"
const rel = (p) => path.relative(root, path.resolve(cwd, p)).split(path.sep).join("/");

const ENV = /(^|\/)\.env(\.[\w-]+)?$/;
const PRIVATE = /(^|\/)test\/private(\/|$)/;
const TEST_ANY = /(^|\/)test(\/|$)/;
const TEST_WRITABLE = /^((backend|frontend)\/test\/public|frontend\/test\/e2e)(\/|$)/;
const SRC = /^(backend\/src|frontend\/src|frontend\/public)(\/|$)/;
const HARNESS = /^(\.claude\/|CLAUDE\.md$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$)|(^|\/)(package\.json|(vitest|stryker)\.config\.[cm]?[jt]s)$/;

// ---------- Edit / Write ----------
if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const target = input.file_path || input.notebook_path || "";
  if (!target) allow();
  const r = rel(target);
  if (r.startsWith("../")) allow(); // ngoài project (vd scratchpad)

  if (ENV.test(r)) block("Không ai được sửa file .env.");
  if (PRIVATE.test(r)) block("Không ai được sửa test/private.");
  if (TEST_ANY.test(r)) {
    if (agent === "test-writer" && TEST_WRITABLE.test(r)) allow();
    block(`${who} không được sửa ${r}. Chỉ test-writer được ghi vào test/public và frontend/test/e2e.`);
  }
  if (SRC.test(r)) {
    if (agent === "code-writer") allow();
    block(`${who} không được sửa ${r}. Chỉ code-writer được sửa code production.`);
  }
  if (HARNESS.test(r)) {
    if (agent === "main" || agent === "code-writer") ask(`${who} muốn sửa file harness ${r}.`);
    block(`${who} không được sửa file harness ${r}.`);
  }
  if (agent === "main") allow();
  block(`${who} không được sửa ${r} (ngoài phạm vi của agent này).`);
}

// ---------- Read / Grep / Glob ----------
if (["Read", "Grep", "Glob"].includes(tool)) {
  const target = input.file_path || input.path || "";
  if (target && PRIVATE.test(rel(target))) block("Không được đọc test/private.");
  if (PRIVATE.test(String(input.pattern || "")) || PRIVATE.test(String(input.glob || ""))) {
    block("Không được đọc test/private.");
  }
  allow();
}

// ---------- Bash ----------
if (tool === "Bash") {
  const cmd = String(input.command || "");

  // Lệnh chạy test hợp lệ: pnpm [--filter <pkg>] test|test:private [đường dẫn test/...] [--flag], không nối lệnh
  const isRunTest =
    /^\s*pnpm\s+(--filter[\s=](backend|frontend)\s+)?(run\s+)?test(:private)?(\s+([\w./-]*\/)?test\/(public|private)[^\s;&|<>`$()]*|\s+--?[\w-]+(=[^\s;&|<>`$()]+)?)*\s*$/.test(cmd);
  if (isRunTest) allow();

  if (/test\/private/.test(cmd)) block("test/private chỉ được chạy bằng `pnpm test:private`, không được đọc.");

  // Bỏ nội dung heredoc, chuỗi trong nháy và redirect vô hại trước khi tìm dấu hiệu ghi file
  const ops = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\n|$)/g, "")
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/\d?>&\d/g, "")
    .replace(/[\d&]?>>?\s*\/dev\/null/g, "");
  const writes = /(\bsed\s+-i|>|\brm\b|\brmdir\b|\bmv\b|\bcp\b|\btee\b|\btouch\b|\bmkdir\b|\bchmod\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv|clean)\b)/;
  if (!writes.test(ops)) allow();

  if (/(^|[\s/'"=])test\//.test(cmd)) block("Không được sửa/tạo/xoá file trong test/ bằng Bash.");
  if (/\b(backend\/src|frontend\/src|frontend\/public)\b/.test(cmd) && agent !== "code-writer") {
    block(`${who} không được sửa code production bằng Bash. Chỉ code-writer được sửa.`);
  }
  if (/(^|[\s'"=])(\.claude\/|CLAUDE\.md)/.test(cmd)) {
    if (agent === "main") ask("Session chính muốn sửa file harness bằng Bash.");
    block(`${who} không được sửa file harness.`);
  }
  allow();
}

allow();
