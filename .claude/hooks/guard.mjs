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
//   `private_tests.py` (test private lỗi thời): không ai chạy qua Claude, kể cả session chính.
// Không ai được đọc <package>/test/private và .env (kể cả private-test-writer: settings.json cũng deny Read).
// Ngoài private-test-writer, không ai được ghi <package>/test/private.
// Không ai (kể cả session chính) chạy test:private / typecheck:private / tsconfig.private qua Claude (output lộ test);
// lệnh test / typecheck chỉ được theo allow-list chặt (STRICT_TEST bên dưới).
// File harness (.claude/, CLAUDE.md, config test, package.json) -> hỏi người dùng.
// exit 2 = chặn, stderr được gửi lại cho agent.
import fs from "node:fs";
import os from "node:os";
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
const who = agent === "main" ? "Main session" : agent;

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

// ---- Agent areas: .claude/harness.json (the one source of truth; .specify/scripts/harness_config.py reads the same
// file with the same checks). Missing or invalid -> FAIL-CLOSED: every Edit / Write / MultiEdit / NotebookEdit and every
// Bash write is blocked below. Read / Grep / Glob keep the hard test/private rule (PRIVATE), which does not depend on it.
const HARNESS_CONFIG = ".claude/harness.json";
const AREA_KEYS = ["src", "testPublic", "testE2e", "testPrivate"];
const checkConfig = (c) => {
  const isList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("must be a JSON object");
  const extra = Object.keys(c).filter((k) => !["version", "packages", "areas", "testFile"].includes(k));
  if (extra.length) throw new Error(`unknown key(s) ${extra.join(", ")}`);
  if (c.version !== 1) throw new Error("version must be 1");
  if (!isList(c.packages) || !c.packages.length || !c.packages.every((p) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p)) ||
      new Set(c.packages).size !== c.packages.length) throw new Error("packages must be a non-empty list of names");
  const a = c.areas;
  if (!a || typeof a !== "object" || Object.keys(a).sort().join() !== [...AREA_KEYS].sort().join()) {
    throw new Error(`areas must have exactly the keys ${AREA_KEYS.join(", ")}`);
  }
  for (const k of AREA_KEYS) {
    if (!isList(a[k])) throw new Error(`areas.${k} must be a list of paths`);
    if ((k === "src" || k === "testPublic") && !a[k].length) throw new Error(`areas.${k} must not be empty`);
    for (const v of a[k]) {
      if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(v) || v.split("/").some((s) => s === "." || s === "..")) {
        throw new Error(`areas.${k}: '${v}' must be a relative path without '.', '..' or a trailing '/'`);
      }
      if ((k === "testPublic" || k === "testPrivate") && !c.packages.includes(v.split("/")[0])) {
        throw new Error(`areas.${k}: '${v}' is not inside one of the packages`);
      }
    }
  }
  if (typeof c.testFile !== "string" || !c.testFile) throw new Error("testFile must be a regex string");
  new RegExp(c.testFile); // throws on a bad regex
};
let CFG = null;
let CONFIG_ERR = "";
try {
  CFG = JSON.parse(fs.readFileSync(path.join(root, HARNESS_CONFIG), "utf8"));
  checkConfig(CFG);
} catch (e) {
  CFG = null;
  CONFIG_ERR = e && e.code === "ENOENT" ? "file not found" : String((e && e.message) || e);
}
const CONFIG_MSG = `${HARNESS_CONFIG} missing or invalid (${CONFIG_ERR}): every file write is blocked until it is fixed (by hand, outside Claude).`;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const alt = (list) => (list.length ? list.map(reEsc).join("|") : "(?!)"); // empty list -> matches nothing
const areasOf = (...keys) => (CFG ? [...new Set(keys.flatMap((k) => CFG.areas[k]))] : []);
const PACKAGES = CFG ? CFG.packages : [];
const SRC_AREAS = areasOf("src");
const TEST_WRITABLE_AREAS = areasOf("testPublic", "testE2e"); // interactive.testWritable
const PRIVATE_AREAS = areasOf("testPrivate");
// testPublic inside its package ("test/public"): the path arguments a test command may take
const PKG_TEST_DIRS = [...new Set(areasOf("testPublic").map((a) => a.slice(a.indexOf("/") + 1)))];
const TEST_FILE = CFG ? CFG.testFile.replace(/\$$/, "") : "(?!)"; // without its "$", to append \s*$
// Paths and commands are compared folded (see fold above): the regexes are built from folded areas too
const ENV = /(^|\/)\.env(\.[\w-]+)?$/;
// Lần duyệt khoá bằng hash (.specify/scripts/approval.py): approval.json và bản sao trong .approved/ chỉ approval.py ghi,
// khi người dùng chạy approve trong terminal của họ. Không agent nào (kể cả session chính) ghi hay chạy approve.
const APPROVAL = /(^|\/)(approval\.json$|\.approved(\/|$))/;
const APPROVAL_REF = /(^|[\s/'"=<>])(approval\.json|\.approved)(?=$|[\s/'"<>;&|)`])/;
const PRIVATE = /(^|\/)test\/private(\/|$)/;
const TEST_ANY = /(^|\/)test(\/|$)/;
const TEST_WRITABLE = new RegExp(`^(${alt(TEST_WRITABLE_AREAS.map(fold))})(\\/|$)`);
const SRC = new RegExp(`^(${alt(SRC_AREAS.map(fold))})(\\/|$)`);
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
// compared on the unfolded path (exact lowercase on disk, see ptwPathOk): built from the areas as written
const PTW_WRITABLE = new RegExp(`^(${alt(PRIVATE_AREAS)})\\/[\\w./-]+\\.tsx?$`);

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
  block(`${PTW} may only use ${PTW_TOOLS.join(", ")} (no running tests, no Bash).`);
}

// ---------- Edit / Write ----------
if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  if (CONFIG_ERR) block(CONFIG_MSG);
  const target = input.file_path || input.notebook_path || "";
  if (agent === PTW) {
    // PTW_WRITABLE so trên đường dẫn chưa fold (đúng chữ thường); các luật chặn khác vẫn so trên đường dẫn đã fold
    if (target && ptwPathOk(target, PTW_WRITABLE, { exactCase: true })) allow();
    block(`${PTW} may only create .ts/.tsx files in ${PRIVATE_AREAS.map((a) => `${a}/`).join(" or ")} (may not write ${target ? rel(target) : "(no file_path)"}).`);
  }
  if (!target) allow();
  const r = rel(target);
  if (r.startsWith("../")) allow(); // ngoài project (vd scratchpad)

  if (ENV.test(r)) block("Nobody may edit .env files.");
  if (PRIVATE.test(r)) block("Nobody may edit test/private.");
  if (APPROVAL.test(r)) block(`${who} may not edit ${r}: only the user writes it, with approval.py approve in their own terminal.`);
  if (TEST_ANY.test(r)) {
    if (agent === "test-writer" && TEST_WRITABLE.test(r)) allow();
    block(`${who} may not edit ${r}. Only test-writer may write to ${TEST_WRITABLE_AREAS.join(", ")}.`);
  }
  if (SRC.test(r)) {
    if (agent === "code-writer") allow();
    block(`${who} may not edit ${r}. Only code-writer may edit production code.`);
  }
  if (HARNESS.test(r)) {
    if (agent === "main" || agent === "code-writer") ask(`${who} wants to edit the harness file ${r}.`);
    block(`${who} may not edit the harness file ${r}.`);
  }
  // Spec harness: spec-writer / planner chỉ ghi spec của change đang làm.
  // Hook allow_paths.py trong frontmatter của chúng siết thêm (vd planner chỉ được Edit vài mục của spec.md).
  if ((agent === "spec-writer" || agent === "planner") && SPEC_WRITABLE.test(r)) allow();
  if (agent === "spec-writer" && SPEC_SYSTEM_APPEND.test(r)) allow();
  if (agent === "main") allow();
  block(`${who} may not edit ${r} (outside this agent's area).`);
}

// ---------- Read / Grep / Glob ----------
if (["Read", "Grep", "Glob"].includes(tool)) {
  const target = input.file_path || input.path || "";
  if (agent === PTW) {
    // allow-list: chỉ specs/ => src/, test/public/, test/private/ và mọi chỗ khác đều bị chặn
    if (!target) block(`${PTW} must pass a path inside specs/ (e.g. "specs/changes/NNN-<name>").`);
    if (!ptwPathOk(target, PTW_READABLE)) block(`${PTW} may only read specs/ (may not read ${rel(target)}).`);
    // glob không được thoát ra ngoài path đã kiểm tra
    const globs = [tool === "Glob" ? input.pattern : "", input.glob].map((g) => String(g || ""));
    if (globs.some((g) => g.includes("..") || path.isAbsolute(g) || g.startsWith("~"))) {
      block(`${PTW}: a glob may not contain "..", an absolute path or "~".`);
    }
  }
  if (target && PRIVATE.test(rel(target))) block("Reading test/private is not allowed.");
  if (PRIVATE.test(fold(String(input.pattern || ""))) || PRIVATE.test(fold(String(input.glob || "")))) {
    block("Reading test/private is not allowed.");
  }
  allow();
}

// ---------- Bash ----------
// The guard only reads the command string, never the content of a script file the command runs. The rules on inline
// code (python3 - <<EOF, node -e, bash -c …) are reminders, not a lock: the real locks are approval.py's TTY check,
// the hashes CI checks (spec_check / approval.json) and the gates of k8s/agents/run.sh.
if (tool === "Bash") {
  // fold: `cat …/Private/…` và `PNPM test a` không lọt qua các regex chữ thường bên dưới
  const rawCmd = String(input.command || "");
  const cmd = fold(rawCmd);

  // ---- Text for the PATH rules (test/, test/private, src/, harness, approval.json / .approved/, specs/) ----
  // 1. Heredoc bodies fed to a command that does not run code (cat, tee, git commit -F -, …) are data: dropped.
  //    Bodies fed to an interpreter / shell (directly, through env / npx / pnpm exec, or piped on the same line),
  //    or to xargs / source / eval / a shell loop / patch / git apply|am, are code or file operations: kept.
  // 2. A token that is an absolute path (or starts with ~, or $VAR/ for a VAR set on this line to an absolute path or
  //    to `mktemp -d [abs template]`) is resolved: realpath of its nearest existing ancestor + the rest. Outside the
  //    project (resolved root) -> dropped; inside (also through a symlink from /tmp) -> replaced by that real path.
  //    Relative tokens and unknown variables stay as they are (checked as before).
  const CODE_CONSUMER = /^(node|python[\d.]*|perl|ruby|bash|sh|zsh|dash|deno|bun|tsx|ts-node|eval|source|\.|xargs|while|until|for|do|done|then|else|patch)$/;
  const runsCode = (seg) => {
    let w = seg.trim().replace(/^((\w+=\S*|time|command|exec|nice|nohup|sudo|env)\s+)+/, "").split(/\s+/).filter(Boolean);
    for (let hop = 0; hop < 3 && w.length; hop++) {
      const p = path.basename(w[0]).toLowerCase();
      if (CODE_CONSUMER.test(p)) return true;
      if (p === "git" && w.some((a) => /^(apply|am)$/i.test(a))) return true;
      if (/^(npx|pnpx|bunx)$/.test(p)) {
        const j = w.slice(1).findIndex((a) => !a.startsWith("-"));
        w = j >= 0 ? w.slice(j + 1) : [];
        continue;
      }
      if (/^(pnpm|npm|yarn)$/.test(p)) {
        const j = w.findIndex((a) => a === "exec" || a === "dlx");
        w = j >= 0 ? w.slice(j + 1) : [];
        continue;
      }
      return false;
    }
    return false;
  };
  const stripHeredocs = (text, dropAll) => {
    const START = /(?<!<)<<(-?)\s*(['"]?)(\w+)\2/g;
    let out = "", from = 0, m;
    while ((m = START.exec(text))) {
      const lineEnd = text.indexOf("\n", m.index);
      if (lineEnd === -1) break; // no body
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const term = new RegExp(String.raw`\n${m[1] ? String.raw`\t*` : ""}${m[3]}(?=\n|$)`, "g");
      term.lastIndex = lineEnd;
      const t = term.exec(text);
      const bodyEnd = t ? t.index : text.length;
      const code = text.slice(lineStart, lineEnd).split(/&&|\|\||\$\(|[;&|()`]/).some(runsCode);
      if (dropAll || !code) {
        out += text.slice(from, lineEnd);
        from = bodyEnd;
      }
      START.lastIndex = t ? t.index + t[0].length : text.length;
    }
    return out + text.slice(from);
  };
  const rootReal = (() => {
    try {
      return fs.realpathSync.native(root);
    } catch {
      return path.resolve(root);
    }
  })();
  const realish = (p) => {
    let cur = path.resolve(p);
    const rest = [];
    while (!lexists(cur) && path.dirname(cur) !== cur) {
      rest.unshift(path.basename(cur));
      cur = path.dirname(cur);
    }
    try {
      return path.join(fs.realpathSync.native(cur), ...rest);
    } catch {
      return null; // broken symlink on the way: keep the token as it is
    }
  };
  const vars = {};
  for (const m of rawCmd.matchAll(/(?:^|[\s;&|(])(\w+)=["']?\$\(\s*mktemp\b([^)]*)\)/g)) {
    const a = m[2].trim().split(/\s+/).filter(Boolean);
    const pi = a.indexOf("-p");
    const tpl = a.filter((x, i) => !x.startsWith("-") && !(pi >= 0 && i === pi + 1)).pop();
    if (pi >= 0 && a[pi + 1] && path.isAbsolute(a[pi + 1])) vars[m[1]] = path.join(a[pi + 1], tpl || "tmp.X");
    else if (tpl && path.isAbsolute(tpl)) vars[m[1]] = tpl;
    else if (!tpl || a.includes("-t")) vars[m[1]] = path.join(os.tmpdir(), tpl || "tmp.X");
    // a relative template is relative to an unknown cwd: no value, the token stays as it is
  }
  for (const m of rawCmd.matchAll(/(?:^|[\s;&|(])(\w+)=(["']?)(\/[^\s'";&|)`$]*)\2(?=[\s;&|)]|$)/g)) vars[m[1]] = m[3];
  const rewritePaths = (text) =>
    text.replace(/(^|[\s'"=<>|;&()`])((?:~|\$\{?\w+\}?)?\/[^\s'"<>|;&()`]*)/g, (all, pre, tok) => {
      let p = tok;
      if (p.startsWith("~")) p = os.homedir() + p.slice(1);
      else if (p.startsWith("$")) {
        const v = /^\$\{?(\w+)\}?/.exec(p);
        if (!v || !(v[1] in vars)) return all; // unknown variable: as before
        p = vars[v[1]] + p.slice(v[0].length);
      }
      const real = realish(p);
      if (real === null) return all;
      const r = path.relative(fold(rootReal), fold(real));
      const inside = r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
      return inside ? pre + real : pre;
    });
  const pathText = (dropAll) => fold(rewritePaths(stripHeredocs(rawCmd, dropAll)));
  const pcmd = pathText(false); // data heredoc bodies and paths outside the project removed
  const pcmdBare = pathText(true); // also code heredoc bodies removed: a rule matching pcmd only came from code
  const fromCode = (re) => re.test(pcmd) && !re.test(pcmdBare);
  const HEREDOC_TEST_MSG = "Code in a heredoc mentions test/ (it may read, run or write tests). Run tests with a command of the allowed form (`pnpm [--filter " + PACKAGES.join("|") + "] test [" + PKG_TEST_DIRS.map((d) => `${d}/…`).join(" | ") + "] [-t=<scenario ID>]`); for anything else, ask the user.";
  const HEREDOC_APPROVAL_MSG = "Code in a heredoc may write approval files. Read the approval state with `python3 .specify/scripts/approval.py verify ...`; for anything else, ask the user.";

  // Bỏ nội dung heredoc, chuỗi trong nháy và redirect vô hại: commit message hay chuỗi trong nháy không bị chặn nhầm.
  // Dùng cho mọi kiểm tra bên dưới, trừ kiểm tra đường dẫn test/private (chạy trên lệnh gốc, để `cat "…"` không lọt).
  // stripHeredocs drops only the BODY: the rest of the line that opens it (`| python3`, `> path`) stays visible.
  const ops = stripHeredocs(cmd, true)
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/\d?>&\d/g, "")
    .replace(/[\d&]?>>?\s*\/dev\/null/g, "");

  // Test private: output của vitest / tsc in nguyên code test. Không ai chạy qua Claude, kể cả session chính;
  // người dùng tự chạy trong terminal riêng. Hook chỉ thấy lệnh gốc, nên `bash k8s/agents/dispatch.sh …` vẫn chạy run_private.
  if (/test:private|typecheck:private|tsconfig\.private/.test(ops)) {
    block("Do not run hidden (private) tests through Claude (the output shows the content of the tests). The user runs `pnpm test:private` / `pnpm typecheck:private` in their own terminal.");
  }
  if (/test\/private/.test(pcmd)) block(fromCode(/test\/private/) ? HEREDOC_TEST_MSG : "Reading or running test/private through Claude is not allowed.");
  // Duyệt: chỉ người dùng (kể cả khi chuỗi nằm trong nháy hay sau `script`, `bash -c`). approval.py verify thì được.
  if (/approval\.py\s+approve\b/.test(cmd)) {
    block("Only the user runs this command, in their own terminal: `python3 .specify/scripts/approval.py approve …`. Agents may only run `approval.py verify`.");
  }
  // Hidden tests made stale by a change (private_tests.py reads, moves and lists them): only the user runs it, every
  // agent and the main session included. Blocked when the command RUNS it: the name as a word of its own (not after a
  // letter, digit, _, . or -; quotes allowed) followed by stale|quarantine|restore. Naming it otherwise (a commit
  // message, git grep, test_private_tests.py, --help) is fine. This rule is only a reminder: the real barrier is the
  // TTY check inside private_tests.py (an agent has no terminal).
  if (/(^|[^a-z0-9_.-])["']?private_tests\.py["']?\s+(stale|quarantine|restore)\b/i.test(cmd)) {
    block("Only the user runs this command, in their own terminal: `python3 .specify/scripts/private_tests.py stale|quarantine|restore --change <change>`.");
  }

  // Lệnh test / typecheck: allow-list chặt, không khớp là chặn (không rơi xuống "không ghi thì allow").
  // vitest lọc file theo chuỗi con của đường dẫn (`pnpm test a` chạy cả test private có chữ "a"), nên tham số chỉ được là
  // đường dẫn bắt đầu bằng test/public/ (có thể có tiền tố backend/ frontend/) hoặc flag (giá trị không có "/", "..").
  // Đoạn lệnh của pnpm/npx/… có chuỗi trong nháy hay "$" cũng phải khớp mẫu (chặn `pnpm "test:pri"vate`, `pnpm $X`).
  const JS_TOOL = /^(pnpm|pnpx|npx|npm|yarn|bunx?|vitest|tsc)$/;
  const PKG_ALT = alt(PACKAGES.map(fold));
  const ARG = String.raw`(--|--?[\w.-]+(=(?![^\s]*\.\.)[\w.:,@+*-]+)?|((${PKG_ALT})\/)?(${alt(PKG_TEST_DIRS.map(fold))})\/[\w./-]*)`;
  const STRICT_TEST = new RegExp(
    String.raw`^pnpm(\s+--filter[\s=](${PKG_ALT}))?(\s+run)?\s+(test|typecheck|typecheck:test|ci:local)(\s+${ARG})*$`,
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
      block(`Test / typecheck command not in the allowed form: \`${seg}\`. Use only \`pnpm [--filter ${PACKAGES.join("|")}] test|typecheck|typecheck:test|ci:local [${PKG_TEST_DIRS.map((d) => `${d}/…`).join(" | ")}] [--flag]\`.`);
    }
    testSegments++;
  }
  if (segments.length === 1 && testSegments === 1) allow();

  // ---- Lệnh ghi file bằng Bash ----
  // Như ops, nhưng bỏ nháy quanh chuỗi chỉ gồm ký tự an toàn ("specs/a" -> specs/a, 'rm' -> rm): để đọc được tên lệnh
  // và đường dẫn trong nháy. Chuỗi có khoảng trắng, > ; | & $ ` vẫn thành '' như ops.
  const opsU = stripHeredocs(cmd, true)
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
    if (prog === "''" || /[$\\]/.test(prog)) return "unreadable command name";
    if (WRITE_PROG.test(prog)) return prog;
    if ((prog === "sed" || prog === "perl") && args.some((a) => /^-[a-z]*i/.test(a) || a.startsWith("--in-place"))) return `${prog} -i`;
    if (prog === "find" && args.some((a) => FIND_WRITE.test(a))) return "find -delete / -exec / -fprint";
    if (prog === "xargs" && args.some((a) => WRITE_PROG.test(a) || INTERP.test(a) || /^(git|sed|perl|find)$/.test(a))) return "xargs + a write command";
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
      if (args.length === 0 || args.includes("-") || args.some((a) => a.startsWith("<"))) return `${prog} reads code from stdin`;
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

  // harness.json missing or invalid: no Bash write at all (fail-closed, like Edit / Write above)
  if (CONFIG_ERR && segsU.some((s) => bashWrite(s))) block(CONFIG_MSG);

  // Ghi vào approval.json / .approved/ bằng Bash: chặn với mọi agent, kể cả session chính (git add / commit vẫn được)
  if (APPROVAL_REF.test(pcmd) && segsU.some((s) => bashWrite(s, false))) {
    block(fromCode(APPROVAL_REF)
      ? HEREDOC_APPROVAL_MSG
      : `${who} may not write approval.json or .approved/ with Bash: only the user writes them, with approval.py approve in their own terminal.`);
  }

  // test-writer được xoá đúng MỘT file test trong vùng của nó (vd test vô nghĩa theo review), không nối lệnh khác
  const TEST_RM = new RegExp(
    String.raw`^\s*(git\s+)?rm\s+(-f\s+)?(${alt(TEST_WRITABLE_AREAS.map(fold))})\/[\w./-]+${TEST_FILE}\s*$`,
  );
  if (agent === "test-writer" && TEST_RM.test(cmd) && !cmd.includes("..")) allow();

  // code-writer, cũng chỉ một lệnh, không nối lệnh khác, không glob, không "..", mọi đường dẫn trong vùng src:
  //   rm [-f] <một file>; git mv <file> <file>; git restore|checkout -- <file...> (hoàn tác một lần sửa hỏng, bug flow)
  const SRC_FILE = new RegExp(`^(${alt(SRC_AREAS.map(fold))})\\/[^/]`);
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
      if (words(seg).some((t) => relCmd(t) === SPEC_ARCHIVE)) block(`${who} may not run ${SPEC_ARCHIVE} (main session only, through /spec-archive).`);
      const why = bashWrite(seg);
      if (why && !(BASH_WRITE_EXCEPTIONS[agent] || []).some((ok) => ok(words(seg)))) {
        block(`${who} may not write files with Bash (${why}: \`${seg}\`). Write files with Edit/Write, within this agent's area.`);
      }
    }
  }

  // Session chính ghi vào specs/ bằng Bash -> hỏi (sau các luật chặn test/ và src/ bên dưới)
  const mentionsSpecs = pcmd.split(/[\s'"=<>|;&()`]+/).some((t) => t && /^specs(\/|$)/.test(relCmd(t)));
  const mainSpecsWrite = agent === "main" && mentionsSpecs && segsU.some((s) => bashWrite(s, false));

  const writes = /(\bsed\s+-i|>|\brm\b|\brmdir\b|\bmv\b|\bcp\b|\btee\b|\btouch\b|\bmkdir\b|\bchmod\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv|clean)\b)/;
  if (!writes.test(ops) && !mainSpecsWrite) allow();

  const TEST_DIR_RE = /(^|[\s/'"=])test\//;
  if (TEST_DIR_RE.test(pcmd)) block(fromCode(TEST_DIR_RE) ? HEREDOC_TEST_MSG : "Editing / creating / deleting files in test/ with Bash is not allowed.");
  if (new RegExp(`\\b(${alt(SRC_AREAS.map(fold))})\\b`).test(pcmd) && agent !== "code-writer") {
    block(`${who} may not edit production code with Bash. Only code-writer may edit it.`);
  }
  if (mainSpecsWrite) ask("The main session wants to write to specs/ with Bash.");
  // Cờ i: CLAUDE.md phải khớp cả sau fold
  if (/(^|[\s'"=])(\.claude\/|\.github\/|ci\/|k8s\/(?!agents\/(tasks|logs)\/)|CLAUDE\.md)/i.test(pcmd)) {
    if (agent === "main") ask("The main session wants to edit a harness file with Bash.");
    block(`${who} may not edit harness files.`);
  }
  allow();
}

allow();
