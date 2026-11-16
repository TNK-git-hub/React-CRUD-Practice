#!/usr/bin/env node
// PreToolUse hook: phân quyền ghi file theo agent (agent_type trong input của hook).
//   session chính (không có agent_type) -> điều phối: không sửa src/ hay test/
//   code-writer  -> chỉ sửa backend/src, frontend/src, frontend/public
//   test-writer  -> chỉ sửa <package>/test/public, frontend/test/e2e
//   spec-writer, planner -> chỉ sửa specs/changes/, .specify/feature.json (spec harness)
//   spec-writer additionally: append rows to specs/_system/{traceability,glossary,domain-model}.md
//   private-test-writer -> chỉ dùng Read/Grep/Glob/Write; chỉ đọc specs/; chỉ tạo file MỚI
//                          <package>/test/private/<NNN-change>/*.test.ts(x); không đọc src/, test/public/; không Bash
//                          (đường dẫn kiểm cả sau symlink)
//   agent khác   -> không ghi gì
// Không ai được đọc (Read/Grep/Glob) <package>/test/private và .env, kể cả private-test-writer. Chặn ở hook này, không
// ở settings.json: rule deny-Read của settings.json chặn luôn cả Write nên private-test-writer không tạo được file.
// Grep/Glob với path là thư mục cha của test/private (backend, frontend, <package>/test) cũng bị chặn.
// Ngoài private-test-writer, không ai được ghi <package>/test/private; không ai được Edit / NotebookEdit ở đó.
// Test private được commit dạng mã hoá (private-tests/tests.tar.age, age). Không ai đọc khoá age (~/.config/age/),
// log đầy đủ của lần chạy test private (~/.local/state/hidden-tests/) hay chạy `age -d`; chỉ session chính (hỏi người
// dùng) được ghi private-tests/. Script k8s/agents/private-{seal,unseal,hooks}.sh chạy được: chúng chỉ in số lượng.
// Không ai (kể cả session chính) chạy test:private / typecheck:private / tsconfig.private qua Claude (output lộ test);
// lệnh test / typecheck chỉ được theo allow-list chặt (STRICT_TEST bên dưới).
// File harness (.claude/, CLAUDE.md, config test, package.json) -> hỏi người dùng.
// exit 2 = chặn, stderr được gửi lại cho agent.
import fs from "node:fs";
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

// File system không phân biệt hoa thường (mặc định của macOS, Windows): "backend/test/Private" là cùng thư mục với
// "backend/test/private", và `PNPM` chạy được pnpm. Khi đó mọi so khớp đường dẫn và lệnh Bash làm trên chữ thường (fold).
// Dò thật trên gốc project (APFS có thể format phân biệt hoa thường); không dò được thì đoán theo platform như allow_paths.py.
// GUARD_CASE_INSENSITIVE=1 chỉ ÉP BẬT fold (để CI Linux kiểm nhánh này), không tắt được.
// Mọi regex so với đường dẫn hay lệnh phải viết chữ thường, hoặc có cờ i nếu buộc phải chứa chữ hoa (vd CLAUDE.md).
const CASE_INSENSITIVE_FS =
  process.env.GUARD_CASE_INSENSITIVE === "1" ||
  (() => {
    const flipped = root.replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
    if (flipped === root) return process.platform === "darwin" || process.platform === "win32";
    try {
      const a = fs.statSync(root);
      const b = fs.statSync(flipped);
      return a.dev === b.dev && a.ino === b.ino;
    } catch {
      return false; // tên đảo hoa thường không tồn tại -> phân biệt hoa thường
    }
  })();
const fold = (s) => (CASE_INSENSITIVE_FS ? s.toLowerCase() : s);

// Đường dẫn tương đối so với gốc project, vd "backend/test/private/a.test.ts". relRaw: giữ nguyên hoa thường; rel: đã fold.
const relRaw = (p) => path.relative(root, path.resolve(cwd, p)).split(path.sep).join("/");
const rel = (p) => fold(relRaw(p));

const ENV = /(^|\/)\.env(\.[\w-]+)?$/;
const PRIVATE = /(^|\/)test\/private(\/|$)/;
// Đọc được một trong hai thứ này là đọc được test private: khoá age của máy, log đầy đủ của dispatch.sh run_private.
// So trên đường dẫn tuyệt đối (cả hai nằm ngoài project) và trên lệnh Bash gốc (chuỗi trong nháy không lọt).
const AGE_KEYS = /(^|\/)\.config\/age(\/|$)/;
const HIDDEN_LOGS = /(^|\/)hidden-tests(\/|$)/;
const AGE_DECRYPT = /(^|[\s;&|(`])r?age(\.exe)?(\s[^;&|\n]*)?\s(-d\b|--decrypt\b)/;
// File đã seal + danh sách public key: agent đổi được là thay được bộ test (mã hoá bằng public key ai cũng làm được)
const SEALED = /^private-tests\//;
const absFold = (p) => fold(path.resolve(cwd, p).split(path.sep).join("/"));
const secretPath = (p) => AGE_KEYS.test(absFold(p)) || HIDDEN_LOGS.test(absFold(p));
const TEST_ANY = /(^|\/)test(\/|$)/;
const TEST_WRITABLE = /^((backend|frontend)\/test\/public|frontend\/test\/e2e)(\/|$)/;
const SRC = /^(backend\/src|frontend\/src|frontend\/public)(\/|$)/;
const SPEC_WRITABLE = /^(specs\/changes\/|\.specify\/feature\.json$)/;
// spec-writer (/speckit-specify) may also append rows to these three files; the allow_paths.py rule in its frontmatter allows exactly the same three.
const SPEC_SYSTEM_APPEND = /^specs\/_system\/(traceability|glossary|domain-model)\.md$/;
// k8s/agents/tasks/ không phải harness: Claude tổng viết file task ở đó (skill dispatch-agents)
// Cờ i: có CLAUDE.md (chữ hoa) mà vẫn phải khớp sau fold
const HARNESS = /^(\.claude\/|\.github\/|ci\/|k8s\/(?!agents\/tasks\/)|CLAUDE\.md$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$)|(^|\/)(package\.json|(vitest|stryker)\.config\.[cm]?[jt]s)$/i;

// ---------- private-test-writer: viết hidden test chỉ từ spec ----------
const PTW = "private-test-writer";
const PTW_TOOLS = ["Read", "Grep", "Glob", "Write"];
const PTW_READABLE = /^specs(\/|$)/;
// <package>/test/private/<change>/<tên>.test.ts(x), <change> = NNN-<name>
const PTW_WRITABLE = /^(backend|frontend)\/test\/private\/\d{3}-[a-z0-9]+(-[a-z0-9]+)*\/[\w.-]+\.test\.tsx?$/;
// Thư mục cha của test/private: Grep/Glob từ đây quét được vào test/private
const PRIVATE_PARENT = /^(backend|frontend)(\/test)?\/?$/;
// Glob (tương đối) đi vào <package>/test/ mà không giới hạn ở public/ hay e2e/
const GLOB_INTO_TEST = /^(\*\*\/)?((backend|frontend|\*\*?)\/)?test\/(?!(public|e2e)\/)/;

// Như rel() nhưng theo symlink: realpath của tổ tiên gần nhất đang tồn tại + phần chưa tồn tại (file sắp tạo).
// Symlink hỏng (realpath lỗi) -> null, nơi gọi chặn.
const lexists = (q) => {
  try {
    fs.lstatSync(q);
    return true;
  } catch {
    return false;
  }
};
const realRelWith = (p, realpath) => {
  try {
    let cur = path.resolve(cwd, p);
    const rest = [];
    while (!lexists(cur) && path.dirname(cur) !== cur) {
      rest.unshift(path.basename(cur));
      cur = path.dirname(cur);
    }
    const real = path.join(realpath(cur), ...rest);
    return path.relative(realpath(root), real).split(path.sep).join("/");
  } catch {
    return null;
  }
};
const realRel = (p) => {
  const r = realRelWith(p, fs.realpathSync);
  return r === null ? null : fold(r);
};
// Đúng cả theo đường dẫn chữ lẫn sau khi theo symlink.
// exactCase: so trên đường dẫn CHƯA fold, phần đã tồn tại lấy đúng hoa thường trên đĩa (realpathSync.native):
// PTW chỉ được ghi đúng "test/private" chữ thường, kể cả khi trên đĩa đã có "test/Private" (vitest / run_private có thể bỏ sót).
const ptwPathOk = (p, re, { exactCase = false } = {}) => {
  const lit = exactCase ? relRaw(p) : rel(p);
  const real = exactCase ? realRelWith(p, fs.realpathSync.native) : realRel(p);
  return re.test(lit) && real !== null && re.test(real);
};

if (agent === PTW && !PTW_TOOLS.includes(tool)) {
  block(`${PTW} chỉ được dùng ${PTW_TOOLS.join(", ")} (không chạy test, không Bash).`);
}

// ---------- Edit / Write ----------
if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const target = input.file_path || input.notebook_path || "";
  if (agent === PTW) {
    if (tool !== "Write") block(`${PTW} chỉ được tạo file mới bằng Write, không được ${tool}.`);
    // PTW_WRITABLE so trên đường dẫn chưa fold (đúng chữ thường); các luật chặn khác vẫn so trên đường dẫn đã fold
    if (!target || !ptwPathOk(target, PTW_WRITABLE, { exactCase: true })) {
      block(`${PTW} chỉ được tạo <package>/test/private/<NNN-change>/<tên>.test.ts(x) (không được ghi ${target ? rel(target) : "(không có file_path)"}).`);
    }
    // Chỉ tạo mới: lstat thấy cả symlink, và trên FS không phân biệt hoa thường thấy cả tên khác hoa thường
    if (lexists(path.resolve(cwd, target))) block(`${PTW} chỉ được tạo file mới: ${rel(target)} đã tồn tại, chọn tên khác.`);
    allow();
  }
  if (!target) allow();
  if (secretPath(target)) block("Không ai được ghi khoá age hay log của test private.");
  const r = rel(target);
  // Kiểm cả sau symlink (vd file ngoài project hay trong src/ là symlink trỏ vào test/private)
  if (PRIVATE.test(r) || PRIVATE.test(realRel(target) ?? "")) block("Không ai được sửa test/private.");
  if (r.startsWith("../")) allow(); // ngoài project (vd scratchpad)

  if (ENV.test(r)) block("Không ai được sửa file .env.");
  if (SEALED.test(r)) {
    if (agent === "main") ask(`Session chính muốn sửa ${r} (test private đã mã hoá / danh sách public key).`);
    block(`${who} không được sửa ${r}. Chỉ người dùng seal test private (k8s/agents/private-seal.sh).`);
  }
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
  // Spec harness (từ nhánh new-project): spec-writer / planner chỉ ghi spec của change đang làm.
  // Hook allow_paths.py trong frontmatter của chúng siết thêm (vd planner chỉ được Edit vài mục của spec.md).
  if ((agent === "spec-writer" || agent === "planner") && SPEC_WRITABLE.test(r)) allow();
  if (agent === "spec-writer" && SPEC_SYSTEM_APPEND.test(r)) allow();
  if (agent === "main") allow();
  block(`${who} không được sửa ${r} (ngoài phạm vi của agent này).`);
}

// ---------- Read / Grep / Glob ----------
if (["Read", "Grep", "Glob"].includes(tool)) {
  const target = input.file_path || input.path || "";
  if (agent === PTW) {
    // allow-list: chỉ specs/ => src/, test/public/, test/private/ và mọi chỗ khác đều bị chặn
    if (!target) block(`${PTW} phải truyền path nằm trong specs/ (vd "specs/changes/NNN-<name>").`);
    if (!ptwPathOk(target, PTW_READABLE)) block(`${PTW} chỉ được đọc specs/ (không được đọc ${rel(target)}).`);
    // glob không được thoát ra ngoài path đã kiểm tra
    const globs = [tool === "Glob" ? input.pattern : "", input.glob].map((g) => String(g || ""));
    if (globs.some((g) => g.includes("..") || path.isAbsolute(g) || g.startsWith("~"))) {
      block(`${PTW}: glob không được chứa "..", đường dẫn tuyệt đối hay "~".`);
    }
  }
  // Kiểm cả sau symlink (symlink ở chỗ khác trỏ vào test/private)
  if (target && (PRIVATE.test(rel(target)) || PRIVATE.test(realRel(target) ?? ""))) block("Không được đọc test/private.");
  if (tool !== "Read") {
    // Grep/Glob từ thư mục cha của test/private quét được vào đó: phải tìm hẹp hơn (vd backend/src, backend/test/public)
    const roots = target ? [rel(target), realRel(target) ?? ""] : [];
    if (roots.some((x) => PRIVATE_PARENT.test(x))) {
      block(`${tool} với path ${rel(target)} quét được vào test/private. Dùng path hẹp hơn, vd <package>/src hoặc <package>/test/public.`);
    }
    // pattern của Grep là regex nội dung, không phải glob: chỉ kiểm pattern của Glob và glob của Grep
    if ([tool === "Glob" ? input.pattern : "", input.glob].some((g) => GLOB_INTO_TEST.test(fold(String(g || ""))))) {
      block(`${tool}: glob đi vào <package>/test/ phải giới hạn ở test/public/ hoặc test/e2e/.`);
    }
  }
  const globs = [input.pattern, input.glob].map((g) => fold(String(g || "")));
  if ((target && secretPath(target)) || globs.some((g) => AGE_KEYS.test(g) || HIDDEN_LOGS.test(g))) {
    block("Không được đọc khoá age hay log của test private (đọc được là lộ test private).");
  }
  if (PRIVATE.test(fold(String(input.pattern || ""))) || PRIVATE.test(fold(String(input.glob || "")))) {
    block("Không được đọc test/private.");
  }
  allow();
}

// ---------- Bash ----------
if (tool === "Bash") {
  // fold: `cat …/Private/…` và `PNPM test a` không lọt qua các regex chữ thường bên dưới
  const cmd = fold(String(input.command || ""));

  // Bỏ nội dung heredoc, chuỗi trong nháy và redirect vô hại: commit message hay chuỗi trong nháy không bị chặn nhầm.
  // Dùng cho mọi kiểm tra bên dưới, trừ kiểm tra đường dẫn test/private (chạy trên lệnh gốc, để `cat "…"` không lọt).
  const ops = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\n|$)/g, "")
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/\d?>&\d/g, "")
    .replace(/[\d&]?>>?\s*\/dev\/null/g, "");

  // Test private: output của vitest / tsc in nguyên code test. Không ai chạy qua Claude, kể cả session chính;
  // người dùng tự chạy trong terminal riêng. Hook chỉ thấy lệnh gốc, nên `bash k8s/agents/dispatch.sh …` vẫn chạy run_private.
  if (/test:private|typecheck:private|tsconfig\.private/.test(ops)) {
    block("Không chạy test private qua Claude (output lộ nội dung test). Người dùng tự chạy `pnpm test:private` / `pnpm typecheck:private` trong terminal riêng.");
  }
  if (/test\/private/.test(cmd)) block("Không được đọc hay chạy test/private qua Claude.");
  if (AGE_KEYS.test(cmd) || HIDDEN_LOGS.test(cmd)) {
    block("Không được đụng tới khoá age (~/.config/age) hay log của test private (~/.local/state/hidden-tests) qua Claude.");
  }
  if (AGE_DECRYPT.test(cmd)) {
    block("Không giải mã test private qua Claude. Người dùng chạy `bash k8s/agents/private-unseal.sh` (chỉ in số lượng).");
  }

  // Lệnh test / typecheck: allow-list chặt, không khớp là chặn (không rơi xuống "không ghi thì allow").
  // vitest lọc file theo chuỗi con của đường dẫn (`pnpm test a` chạy cả test private có chữ "a"), nên tham số chỉ được là
  // đường dẫn bắt đầu bằng test/public/ (có thể có tiền tố backend/ frontend/) hoặc flag (giá trị không có "/", "..").
  // Đoạn lệnh của pnpm/npx/… có chuỗi trong nháy hay "$" cũng phải khớp mẫu (chặn `pnpm "test:pri"vate`, `pnpm $X`).
  const JS_TOOL = /^(pnpm|pnpx|npx|npm|yarn|bunx?|vitest|tsc)$/;
  const ARG = String.raw`(--|--?[\w.-]+(=(?![^\s]*\.\.)[\w.:,@+*-]+)?|((backend|frontend)\/)?test\/public\/[\w./-]*)`;
  const STRICT_TEST = new RegExp(
    String.raw`^pnpm(\s+--filter[\s=](backend|frontend))?(\s+run)?\s+(test|typecheck|typecheck:test|ci:local)(\s+${ARG})*$`,
  );
  const segments = ops.split(/&&|\|\||\$\(|[;&|\n()`]/).map((s) => s.trim()).filter(Boolean);
  let testSegments = 0;
  for (const seg of segments) {
    const words = seg.replace(/^((\w+=\S*|time|command|exec|nice|nohup|sudo)\s+)+/, "").split(/\s+/);
    const prog = path.basename(words[0] || "");
    const testLike =
      (JS_TOOL.test(prog) && (/\b(test|typecheck|vitest|tsc)\b/.test(seg) || /''|\$/.test(seg) || prog === "vitest" || prog === "tsc")) ||
      (prog === "node" && /\b(vitest|tsc)\b/.test(seg));
    if (!testLike) continue;
    if (!STRICT_TEST.test(seg)) {
      block(`Lệnh test / typecheck không đúng mẫu: \`${seg}\`. Chỉ dùng \`pnpm [--filter backend|frontend] test|typecheck|typecheck:test|ci:local [test/public/…] [--flag]\`.`);
    }
    testSegments++;
  }
  if (segments.length === 1 && testSegments === 1) allow();

  const writes = /(\bsed\s+-i|>|\brm\b|\brmdir\b|\bmv\b|\bcp\b|\btee\b|\btouch\b|\bmkdir\b|\bchmod\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv|clean)\b)/;
  if (!writes.test(ops)) allow();

  // test-writer được xoá đúng MỘT file test trong vùng của nó (vd test vô nghĩa theo review), không nối lệnh khác
  const TEST_RM =
    /^\s*(git\s+)?rm\s+(-f\s+)?((backend|frontend)\/test\/public|frontend\/test\/e2e)\/[\w./-]+\.test\.tsx?\s*$/;
  if (agent === "test-writer" && TEST_RM.test(cmd) && !cmd.includes("..")) allow();

  if (/(^|[\s/'"=])test\//.test(cmd)) block("Không được sửa/tạo/xoá file trong test/ bằng Bash.");
  if (/(^|[\s'"=])private-tests\//.test(cmd)) {
    if (agent === "main") ask("Session chính muốn sửa private-tests/ (test private đã mã hoá) bằng Bash.");
    block(`${who} không được sửa private-tests/.`);
  }
  if (/\b(backend\/src|frontend\/src|frontend\/public)\b/.test(cmd) && agent !== "code-writer") {
    block(`${who} không được sửa code production bằng Bash. Chỉ code-writer được sửa.`);
  }
  // Cờ i: CLAUDE.md phải khớp cả sau fold
  if (/(^|[\s'"=])(\.claude\/|\.github\/|ci\/|k8s\/(?!agents\/(tasks|logs)\/)|CLAUDE\.md)/i.test(cmd)) {
    if (agent === "main") ask("Session chính muốn sửa file harness bằng Bash.");
    block(`${who} không được sửa file harness.`);
  }
  allow();
}

allow();
