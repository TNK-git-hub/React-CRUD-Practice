#!/usr/bin/env node
// PreToolUse hook: phân quyền ghi file theo agent (agent_type trong input của hook).
//   session chính (không có agent_type) -> điều phối: không sửa src/ hay test/
//   code-writer  -> chỉ sửa backend/src, frontend/src, frontend/public
//   test-writer  -> chỉ sửa <package>/test/public, frontend/test/e2e
//   spec-writer, planner -> chỉ sửa specs/changes/, .specify/feature.json (spec harness)
//   spec-writer additionally: append rows to specs/_system/{traceability,glossary,domain-model}.md
//   private-test-writer -> chỉ dùng Read/Grep/Glob/Write; chỉ đọc specs/; chỉ tạo file .ts/.tsx trong
//                          <package>/test/private; không đọc src/, test/public/; không Bash (đường dẫn kiểm cả sau symlink)
//   agent khác   -> không ghi gì
// Bash: subagent (mọi agent_type) không ghi file bằng Bash, chỉ bằng Edit/Write (luật theo agent ở trên). Ngoại lệ hẹp
//   theo agent: lệnh mà skill của agent đó bảo chạy (BASH_WRITE_EXCEPTIONS), test-writer xoá đúng một file test,
//   code-writer rm / git mv / git restore -- đúng file trong vùng src. Subagent không chạy script spec-archive.
//   Session chính: Bash ghi vào specs/ -> hỏi người dùng.
// approval.json và .approved/ (lần duyệt khoá bằng hash): không ai ghi, kể cả session chính; không ai chạy
//   `approval.py approve` qua Claude (chỉ người dùng, trong terminal riêng); `approval.py verify` thì ai cũng chạy được.
// Không ai được đọc <package>/test/private và .env (kể cả private-test-writer: settings.json cũng deny Read).
// Ngoài private-test-writer, không ai được ghi <package>/test/private.
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
// Lần duyệt khoá bằng hash (.specify/scripts/approval.py): approval.json và bản sao trong .approved/ chỉ approval.py ghi,
// khi người dùng chạy approve trong terminal của họ. Không agent nào (kể cả session chính) ghi hay chạy approve.
const APPROVAL = /(^|\/)(approval\.json$|\.approved(\/|$))/;
const APPROVAL_REF = /(^|[\s/'"=<>])(approval\.json|\.approved)(?=$|[\s/'"<>;&|)`])/;
const PRIVATE = /(^|\/)test\/private(\/|$)/;
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
const PTW_WRITABLE = /^(backend|frontend)\/test\/private\/[\w./-]+\.tsx?$/;

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
    // PTW_WRITABLE so trên đường dẫn chưa fold (đúng chữ thường); các luật chặn khác vẫn so trên đường dẫn đã fold
    if (target && ptwPathOk(target, PTW_WRITABLE, { exactCase: true })) allow();
    block(`${PTW} chỉ được tạo file .ts/.tsx trong backend/test/private/ hoặc frontend/test/private/ (không được ghi ${target ? rel(target) : "(không có file_path)"}).`);
  }
  if (!target) allow();
  const r = rel(target);
  if (r.startsWith("../")) allow(); // ngoài project (vd scratchpad)

  if (ENV.test(r)) block("Không ai được sửa file .env.");
  if (PRIVATE.test(r)) block("Không ai được sửa test/private.");
  if (APPROVAL.test(r)) block(`${who} không được sửa ${r}: chỉ người dùng ghi, bằng approval.py approve trong terminal riêng.`);
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
  // Spec harness: spec-writer / planner chỉ ghi spec của change đang làm.
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
  if (target && PRIVATE.test(rel(target))) block("Không được đọc test/private.");
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
  // Duyệt: chỉ người dùng (kể cả khi chuỗi nằm trong nháy hay sau `script`, `bash -c`). approval.py verify thì được.
  if (/approval\.py\s+approve\b/.test(cmd)) {
    block("Chỉ người dùng chạy lệnh này trong terminal riêng: `python3 .specify/scripts/approval.py approve …`. Agent chỉ được chạy `approval.py verify`.");
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

  // ---- Lệnh ghi file bằng Bash ----
  // Như ops, nhưng bỏ nháy quanh chuỗi chỉ gồm ký tự an toàn ("specs/a" -> specs/a, 'rm' -> rm): để đọc được tên lệnh
  // và đường dẫn trong nháy. Chuỗi có khoảng trắng, > ; | & $ ` vẫn thành '' như ops.
  const opsU = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\n|$)/g, "")
    .replace(/'([\w./:@+=,-]*)'|"([\w./:@+=,-]*)"/g, "$1$2")
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/\d?>&\d/g, "")
    .replace(/[\d&]?>>?\s*\/dev\/null/g, "");
  const segsU = opsU.split(/&&|\|\||\$\(|[;&|\n()`]/).map((s) => s.trim()).filter(Boolean);
  const PREFIX = /^((\w+=\S*|time|command|exec|nice|nohup|sudo|env)\s+)+/;
  const WRITE_PROG = /^(rm|rmdir|mv|cp|tee|touch|mkdir|chmod|truncate|ln|install|rsync|dd|patch|eval)$/;
  const GIT_WRITE = /^(checkout|switch|restore|add|commit|rm|mv|clean|reset|stash|apply|am|cherry-pick|revert|merge|rebase|pull)$/;
  const GIT_INDEX_ONLY = /^(add|commit)$/; // không đổi file trong working tree
  const INTERP = /^(node|python[\d.]*|perl|ruby|bash|sh|zsh|dash)$/;
  const FIND_WRITE = /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/;
  const PNPM_WRITE = /^(add|install|i|remove|rm|uninstall|un|update|up|upgrade)$/;
  // git branch / tag / config / worktree là lệnh ghi, trừ các dạng chỉ đọc này (r = tham số sau tên lệnh con)
  const GIT_READ_FORM = {
    branch: (r) => r.length === 0 || (r.length === 1 && r[0] === "--show-current") || r.every((a) => /^(--list|-a|-r|--all|--remotes)$/.test(a)),
    tag: (r) => r.length >= 1 && /^(--list|-l)$/.test(r[0]) && r.slice(1).every((a) => !a.startsWith("-")),
    config: (r) => (r.length === 2 && r[0] === "--get" && !r[1].startsWith("-")) || (r.length === 1 && /^(--list|-l)$/.test(r[0])),
    worktree: () => false,
  };
  const FIX_FLAG = (a) => a === "--fix" || a.startsWith("--fix="); // --fix-dry-run không ghi
  const words = (seg) => seg.replace(PREFIX, "").split(/\s+/).filter(Boolean);
  // Lý do một đoạn lệnh là lệnh ghi, hoặc null. indexOnly=false: git add / commit không tính (chỉ đổi index / lịch sử).
  const bashWrite = (seg, indexOnly = true) => {
    if (seg.includes(">")) return "redirect > / >>";
    const w = words(seg);
    const prog = path.basename(w[0] || "");
    const args = w.slice(1);
    if (!prog) return null;
    if (prog === "''" || /[$\\]/.test(prog)) return "tên lệnh không đọc được";
    if (WRITE_PROG.test(prog)) return prog;
    if ((prog === "sed" || prog === "perl") && args.some((a) => /^-[a-z]*i/.test(a) || a.startsWith("--in-place"))) return `${prog} -i`;
    if (prog === "find" && args.some((a) => FIND_WRITE.test(a))) return "find -delete / -exec / -fprint";
    if (prog === "xargs" && args.some((a) => WRITE_PROG.test(a) || INTERP.test(a) || /^(git|sed|perl|find)$/.test(a))) return "xargs + lệnh ghi";
    if (prog === "git") {
      let sub = "", si = -1;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-c" || args[i] === "-C") i++;
        else if (!args[i].startsWith("-")) { sub = args[i]; si = i; break; }
      }
      if (GIT_READ_FORM[sub]) return GIT_READ_FORM[sub](args.slice(si + 1)) ? null : `git ${sub}`;
      if (GIT_WRITE.test(sub) && (indexOnly || !GIT_INDEX_ONLY.test(sub))) return `git ${sub}`;
      return null;
    }
    if (prog === "eslint" && args.some(FIX_FLAG)) return "eslint --fix";
    if (prog === "prettier" && args.some((a) => a === "--write" || a === "-w")) return "prettier --write";
    // pnpm exec x / pnpm dlx x / npx x: xét lệnh x
    if (/^(pnpm|npm|yarn)$/.test(prog)) {
      // `pnpm lint --fix`, `pnpm lint -- --fix`: script chuyển --fix / --write cho eslint / prettier
      if (args.some((a) => FIX_FLAG(a) || a === "--write")) return `${prog} … --fix / --write`;
      const i = args.findIndex((a) => a === "exec" || a === "dlx");
      if (i >= 0) return bashWrite(args.slice(i + 1).join(" "), indexOnly);
      if (prog === "pnpm") {
        let sub = "";
        for (let j = 0; j < args.length; j++) {
          if (/^(--filter|-f|-c|--dir)$/i.test(args[j])) j++;
          else if (!args[j].startsWith("-")) { sub = args[j]; break; }
        }
        if (PNPM_WRITE.test(sub)) return `pnpm ${sub}`;
      }
      return null;
    }
    // npx [cờ của npx] x …: xét `x …` cùng mọi cờ của x
    if (/^(npx|pnpx|bunx)$/.test(prog)) {
      const j = args.findIndex((a) => !a.startsWith("-"));
      return j >= 0 ? bashWrite(args.slice(j).join(" "), indexOnly) : null;
    }
    if (INTERP.test(prog)) {
      if (args.length === 0 || args.includes("-") || args.some((a) => a.startsWith("<"))) return `${prog} đọc code từ stdin`;
      if (prog === "node" && args.some((a) => /^(-e|-p|-pe|-ep|--eval|--print)(=|$)/.test(a))) return "node -e";
      if (/^python/.test(prog) && args.some((a) => /^-[a-z]*c$/i.test(a))) return `${prog} -c`;
      if (/^(perl|ruby)$/.test(prog) && args.some((a) => /^-[a-z]*e/i.test(a))) return `${prog} -e`;
      if (/^(bash|sh|zsh|dash)$/.test(prog) && args.some((a) => /^-[a-z]*c$/i.test(a))) return `${prog} -c`;
    }
    return null;
  };
  // Ngoại lệ: lệnh ghi mà skill của agent bảo chạy, đúng mẫu.
  //   spec-writer (speckit-specify bước 3, 5): git checkout -b NNN-<kebab>; mkdir -p specs/changes/NNN-<kebab>[/checklists]
  //   planner (speckit-checklist bước 6: "Create FEATURE_DIR/checklists/"): mkdir -p specs/changes/NNN-<kebab>/checklists
  // Đường dẫn có thể tuyệt đối (check-prerequisites.sh trả FEATURE_DIR tuyệt đối), phải nằm đúng chỗ sau khi resolve.
  // cmd đã fold, nên đường dẫn trong lệnh resolve theo root / cwd đã fold (rel() dùng root chưa fold: /Users/… ≠ /users/…)
  const relCmd = (p) => path.relative(fold(root), path.resolve(fold(cwd), p)).split(path.sep).join("/");
  const CHANGE = String.raw`\d{3}-[a-z0-9]+(-[a-z0-9]+)*`;
  const mkdirIn = (re) => (w) => w.length === 3 && w[0] === "mkdir" && w[1] === "-p" && !w[2].includes("..") && re.test(relCmd(w[2]));
  const BASH_WRITE_EXCEPTIONS = {
    "spec-writer": [
      (w) => w.length === 4 && w[0] === "git" && w[1] === "checkout" && w[2] === "-b" && new RegExp(`^${CHANGE}$`).test(w[3]),
      mkdirIn(new RegExp(`^specs/changes/${CHANGE}(/checklists)?/?$`)),
    ],
    planner: [mkdirIn(new RegExp(`^specs/changes/${CHANGE}/checklists/?$`))],
  };

  // Ghi vào approval.json / .approved/ bằng Bash: chặn với mọi agent, kể cả session chính (git add / commit vẫn được)
  if (APPROVAL_REF.test(cmd) && segsU.some((s) => bashWrite(s, false))) {
    block(`${who} không được ghi approval.json hay .approved/ bằng Bash: chỉ người dùng ghi, bằng approval.py approve trong terminal riêng.`);
  }

  // test-writer được xoá đúng MỘT file test trong vùng của nó (vd test vô nghĩa theo review), không nối lệnh khác
  const TEST_RM =
    /^\s*(git\s+)?rm\s+(-f\s+)?((backend|frontend)\/test\/public|frontend\/test\/e2e)\/[\w./-]+\.test\.tsx?\s*$/;
  if (agent === "test-writer" && TEST_RM.test(cmd) && !cmd.includes("..")) allow();

  // code-writer, cũng chỉ một lệnh, không nối lệnh khác, không glob, không "..", mọi đường dẫn trong vùng src:
  //   rm [-f] <một file>; git mv <file> <file>; git restore|checkout -- <file...> (hoàn tác một lần sửa hỏng, bug flow)
  const SRC_FILE = /^(backend\/src|frontend\/src|frontend\/public)\/[^/]/;
  const srcFile = (p) => !/[*?[\]{}~]/.test(p) && !p.includes("..") && SRC_FILE.test(relCmd(p));
  if (agent === "code-writer" && segsU.length === 1 && !segsU[0].includes(">")) {
    const w = words(segsU[0]);
    const ok =
      (w[0] === "rm" && ((w.length === 2 && srcFile(w[1])) || (w.length === 3 && w[1] === "-f" && srcFile(w[2])))) ||
      (w[0] === "git" && w[1] === "mv" && w.length === 4 && srcFile(w[2]) && srcFile(w[3])) ||
      (w[0] === "git" && /^(restore|checkout)$/.test(w[1]) && w[2] === "--" && w.length > 3 && w.slice(3).every(srcFile));
    if (ok) allow();
  }

  // Subagent: không ghi file bằng Bash (allow-list như Edit/Write); chỉ các ngoại lệ ở trên.
  const SPEC_ARCHIVE = ".claude/skills/spec-archive/scripts/change.py";
  if (agent !== "main") {
    for (const seg of segsU) {
      // change.py ghi specs/capabilities/: chỉ session chính chạy (qua /spec-archive)
      if (words(seg).some((t) => relCmd(t) === SPEC_ARCHIVE)) block(`${who} không được chạy ${SPEC_ARCHIVE} (chỉ session chính, qua /spec-archive).`);
      const why = bashWrite(seg);
      if (why && !(BASH_WRITE_EXCEPTIONS[agent] || []).some((ok) => ok(words(seg)))) {
        block(`${who} không được ghi file bằng Bash (${why}: \`${seg}\`). Ghi file bằng Edit/Write, trong phạm vi của agent này.`);
      }
    }
  }

  // Session chính ghi vào specs/ bằng Bash -> hỏi (sau các luật chặn test/ và src/ bên dưới)
  const mentionsSpecs = cmd.split(/[\s'"=<>|;&()`]+/).some((t) => t && /^specs(\/|$)/.test(relCmd(t)));
  const mainSpecsWrite = agent === "main" && mentionsSpecs && segsU.some((s) => bashWrite(s, false));

  const writes = /(\bsed\s+-i|>|\brm\b|\brmdir\b|\bmv\b|\bcp\b|\btee\b|\btouch\b|\bmkdir\b|\bchmod\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv|clean)\b)/;
  if (!writes.test(ops) && !mainSpecsWrite) allow();

  if (/(^|[\s/'"=])test\//.test(cmd)) block("Không được sửa/tạo/xoá file trong test/ bằng Bash.");
  if (/\b(backend\/src|frontend\/src|frontend\/public)\b/.test(cmd) && agent !== "code-writer") {
    block(`${who} không được sửa code production bằng Bash. Chỉ code-writer được sửa.`);
  }
  if (mainSpecsWrite) ask("Session chính muốn ghi vào specs/ bằng Bash.");
  // Cờ i: CLAUDE.md phải khớp cả sau fold
  if (/(^|[\s'"=])(\.claude\/|\.github\/|ci\/|k8s\/(?!agents\/(tasks|logs)\/)|CLAUDE\.md)/i.test(cmd)) {
    if (agent === "main") ask("Session chính muốn sửa file harness bằng Bash.");
    block(`${who} không được sửa file harness.`);
  }
  allow();
}

allow();
