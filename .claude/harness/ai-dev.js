#!/usr/bin/env node
"use strict";

/**
 * Outer harness CLI for the AI dev workflow.
 * Computational sensors + state mutations that agents/hooks call.
 *
 * Usage:
 *   node .cursor/harness/ai-dev.js <command> ...
 *   node .claude/harness/ai-dev.js <command> ...
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const PHASES_FEATURE = ["ONBOARD", "REQUIRE", "PLAN", "BUILD", "REVIEW", "DELIVER", "DONE"];
const PHASES_BUG = ["BUGFIX", "REVIEW", "DELIVER", "DONE"];

function usage(code = 1) {
  const text = `Usage: ai-dev <command> [args]

Sensors:
  validate [id]              Schema, gates, hashes, loop limits
  assert-build-ready [id]    Ready to enter/continue BUILD (or bug FIX)
  assert-done [id]           Ready to claim DONE
  status [id]                Short human status
  session-context            ACTIVE + phase text for hooks

State:
  claim <id>                 Point context/ACTIVE.json at id
  gate approve <spec|plan|risk|rootCause> [id]
  evidence append [id] --kind <k> --exit <n> --summary <s> [--command <c>] [--cwd <d>]
  phase set <PHASE> [id]

Hooks (stdin JSON -> stdout JSON/text):
  hook cursor-session-start | cursor-before-shell | cursor-subagent-start | cursor-stop
  hook claude-session-start | claude-pre-bash | claude-stop
`;
  console.error(text);
  process.exit(code);
}

function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, "context")) ||
      fs.existsSync(path.join(dir, ".cursor", "harness", "ai-dev.js")) ||
      fs.existsSync(path.join(dir, ".claude", "harness", "ai-dev.js"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function nowIso() {
  return new Date().toISOString();
}

function git(cmd, root) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function activePath(root) {
  return path.join(root, "context", "ACTIVE.json");
}

function readActive(root) {
  const p = activePath(root);
  if (!fs.existsSync(p)) return null;
  try {
    return readJson(p);
  } catch {
    return null;
  }
}

function resolveId(root, idArg) {
  if (idArg) return idArg;
  const active = readActive(root);
  if (active && active.id) return active.id;
  fail("No id given and context/ACTIVE.json is missing or empty");
}

function resolveStatusPath(root, id) {
  const feature = path.join(root, "context", "features", id, "status.json");
  const bug = path.join(root, "context", "bugs", id, "status.json");
  if (fs.existsSync(feature)) return { type: "feature", dir: path.dirname(feature), file: feature };
  if (fs.existsSync(bug)) return { type: "bug", dir: path.dirname(bug), file: bug };
  fail(`status.json not found for id '${id}' under context/features or context/bugs`);
}

function fail(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function ok(msg) {
  if (msg) console.log(msg);
}

function loadStatus(root, id) {
  const loc = resolveStatusPath(root, id);
  let status;
  try {
    status = readJson(loc.file);
  } catch (e) {
    fail(`invalid JSON in ${loc.file}: ${e.message}`);
  }
  return { ...loc, status };
}

function expectedSpecHash(dir) {
  const f = path.join(dir, "02-spec.md");
  if (!fs.existsSync(f)) return null;
  return sha256File(f);
}

function expectedPlanHash(dir) {
  const plan = path.join(dir, "03-plan.md");
  const tc = path.join(dir, "04-test-cases.md");
  if (!fs.existsSync(plan) || !fs.existsSync(tc)) return null;
  return sha256(Buffer.concat([fs.readFileSync(plan), fs.readFileSync(tc)]));
}

function collectIssues(root, id) {
  const issues = [];
  const { type, dir, file, status } = loadStatus(root, id);

  if (!status.id || status.id !== id) {
    issues.push(`status.id must equal folder id '${id}' (got '${status.id}')`);
  }
  if (status.type && status.type !== type) {
    issues.push(`status.type '${status.type}' does not match location (${type})`);
  }
  if (!status.phase) issues.push("missing phase");
  if (!status.branch) issues.push("missing branch");
  if (!status.gates || typeof status.gates !== "object") issues.push("missing gates object");
  if (!status.loops || typeof status.loops !== "object") issues.push("missing loops object");
  if (!Array.isArray(status.evidence)) issues.push("evidence must be an array");

  if (type === "feature") {
    if (!PHASES_FEATURE.includes(status.phase)) {
      issues.push(`invalid feature phase '${status.phase}'`);
    }
    const spec = status.gates && status.gates.spec;
    const plan = status.gates && status.gates.plan;
    if (!spec || !plan) {
      issues.push("feature gates must include spec and plan");
    } else {
      if (spec.state === "approved") {
        if (!spec.sha256) issues.push("gates.spec.approved requires sha256");
        const want = expectedSpecHash(dir);
        if (want && spec.sha256 !== want) {
          issues.push(`gates.spec.sha256 drifted (status has ${spec.sha256.slice(0, 12)}…, file is ${want.slice(0, 12)}…)`);
        }
        if (!fs.existsSync(path.join(dir, "02-spec.md"))) {
          issues.push("gates.spec approved but 02-spec.md missing");
        }
      }
      if (plan.state === "approved") {
        if (!plan.sha256) issues.push("gates.plan.approved requires sha256");
        const want = expectedPlanHash(dir);
        if (want && plan.sha256 !== want) {
          issues.push(`gates.plan.sha256 drifted (status has ${plan.sha256.slice(0, 12)}…, file is ${want.slice(0, 12)}…)`);
        }
        if (!fs.existsSync(path.join(dir, "03-plan.md")) || !fs.existsSync(path.join(dir, "04-test-cases.md"))) {
          issues.push("gates.plan approved but plan/test-case files missing");
        }
      }
    }
    const tdd = Number(status.loops.tddAttempts || 0);
    const rev = Number(status.loops.reviewRounds || 0);
    if (tdd > 5) issues.push(`loops.tddAttempts ${tdd} exceeds limit 5`);
    if (rev > 3) issues.push(`loops.reviewRounds ${rev} exceeds limit 3`);
  } else {
    if (!PHASES_BUG.includes(status.phase)) {
      issues.push(`invalid bug phase '${status.phase}'`);
    }
    const rc = status.gates && status.gates.rootCause;
    if (!rc) issues.push("bug gates must include rootCause");
    const attempts = Number(status.loops.bugFixAttempts || 0);
    const rev = Number(status.loops.reviewRounds || 0);
    if (attempts > 3) issues.push(`loops.bugFixAttempts ${attempts} exceeds limit 3`);
    if (rev > 3) issues.push(`loops.reviewRounds ${rev} exceeds limit 3`);
  }

  for (let i = 0; i < (status.evidence || []).length; i++) {
    const e = status.evidence[i];
    if (!e || typeof e !== "object") {
      issues.push(`evidence[${i}] must be an object`);
      continue;
    }
    if (typeof e.exitCode !== "number") issues.push(`evidence[${i}].exitCode must be a number`);
    if (!e.command) issues.push(`evidence[${i}].command required`);
    if (!e.summary) issues.push(`evidence[${i}].summary required`);
    if (!e.at) issues.push(`evidence[${i}].at required`);
  }

  const active = readActive(root);
  return { type, dir, file, status, issues, active };
}

function cmdValidate(root, idArg) {
  const id = resolveId(root, idArg);
  const { issues, status, type } = collectIssues(root, id);
  if (issues.length) {
    console.error(`validate FAILED for ${type} ${id} (phase=${status.phase})`);
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  ok(`validate OK: ${type} ${id} phase=${status.phase}`);
}

function buildReadyIssues(root, id) {
  const { type, dir, status, issues } = collectIssues(root, id);
  const out = [...issues];

  if (type === "feature") {
    const spec = status.gates.spec;
    const plan = status.gates.plan;
    if (!spec || spec.state !== "approved") out.push("Gate 1 (spec) is not approved");
    if (!plan || plan.state !== "approved") out.push("Gate 2 (plan) is not approved");
    const risk = status.gates.risk;
    if (risk && risk.state === "pending") out.push("risk gate is pending — wait for user approval");
  } else {
    const rc = status.gates.rootCause;
    if (!rc || rc.state !== "approved") out.push("root-cause gate is not approved");
  }

  const branch = git("git branch --show-current", root);
  if (branch && status.branch && branch !== status.branch) {
    out.push(`current branch '${branch}' != status.branch '${status.branch}'`);
  }

  const active = readActive(root);
  if (active && active.id && active.id !== id) {
    out.push(`ACTIVE.json points at '${active.id}', not '${id}'`);
  }

  return { type, dir, status, issues: out };
}

function cmdAssertBuildReady(root, idArg) {
  const id = resolveId(root, idArg);
  const { type, status, issues } = buildReadyIssues(root, id);
  if (issues.length) {
    console.error(`assert-build-ready FAILED for ${type} ${id}`);
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  ok(`assert-build-ready OK: ${type} ${id} phase=${status.phase}`);
}

function reviewHasOpenCriticalMajor(dir) {
  const review = path.join(dir, "06-review.md");
  if (!fs.existsSync(review)) return { missing: true, open: false };
  const text = fs.readFileSync(review, "utf8");
  const resultPass = /\|\s*Result\s*\|\s*PASS\s*\|/i.test(text);
  const openBad = /\|[^|\n]*\|\s*(Critical|Major)\s*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*open\s*\|/i.test(
    text
  );
  // Also match simpler finding rows: | R-01 | Critical | ... | open |
  const openBad2 = /\|\s*(Critical|Major)\s*\|(?:[^|\n]*\|){3,6}\s*open\s*\|/i.test(text);
  return { missing: false, open: openBad || openBad2, resultPass };
}

function latestEvidence(status, kinds) {
  const list = (status.evidence || []).filter((e) => kinds.includes(e.kind));
  if (!list.length) return null;
  return list[list.length - 1];
}

function cmdAssertDone(root, idArg) {
  const id = resolveId(root, idArg);
  const { type, dir, status, issues } = collectIssues(root, id);
  const out = [...issues];

  if (!["DELIVER", "DONE", "REVIEW"].includes(status.phase)) {
    out.push(`phase '${status.phase}' is not far enough for DONE (need REVIEW/DELIVER/DONE)`);
  }

  if (type === "feature") {
    const rev = reviewHasOpenCriticalMajor(dir);
    if (rev.missing && status.phase !== "DONE") {
      out.push("06-review.md missing");
    } else if (!rev.missing) {
      if (rev.open) out.push("06-review.md still has open Critical/Major findings");
      if (!rev.resultPass && status.phase === "DONE") {
        out.push("06-review.md Result is not PASS");
      }
    }
    const workType = status.workType || "code";
    if (workType === "code") {
      const suite = latestEvidence(status, ["suite"]);
      if (!suite) out.push("missing suite evidence");
      else if (suite.exitCode !== 0) out.push(`suite evidence exitCode=${suite.exitCode}`);
    }
  } else {
    const rc = status.gates.rootCause;
    if (!rc || rc.state !== "approved") out.push("root-cause gate not approved");
    const bugEv = latestEvidence(status, ["bug", "suite"]);
    if (!bugEv) out.push("missing bug/suite evidence");
    else if (bugEv.exitCode !== 0) out.push(`evidence exitCode=${bugEv.exitCode}`);
  }

  if (issues.length || out.length > issues.length) {
    // dedupe
    const uniq = [...new Set(out)];
    if (uniq.length) {
      console.error(`assert-done FAILED for ${type} ${id}`);
      for (const i of uniq) console.error(`  - ${i}`);
      process.exit(1);
    }
  }
  ok(`assert-done OK: ${type} ${id} phase=${status.phase}`);
}

function cmdStatus(root, idArg) {
  const id = idArg || (readActive(root) && readActive(root).id);
  if (!id) {
    console.log("No ACTIVE item.");
    return;
  }
  const { type, status, issues } = collectIssues(root, id);
  const branch = git("git branch --show-current", root);
  console.log(
    [
      `id: ${id}`,
      `type: ${type}`,
      `phase: ${status.phase}`,
      `branch: ${status.branch}` + (branch ? ` (current: ${branch})` : ""),
      `workType: ${status.workType || "n/a"}`,
      `gates: ${JSON.stringify(status.gates)}`,
      `loops: ${JSON.stringify(status.loops)}`,
      `evidence: ${(status.evidence || []).length} entries`,
      `validate: ${issues.length ? "FAIL (" + issues.length + ")" : "OK"}`
    ].join("\n")
  );
  if (issues.length) {
    for (const i of issues) console.log(`  - ${i}`);
    process.exitCode = 1;
  }
}

function cmdSessionContext(root) {
  const active = readActive(root);
  if (!active || !active.id) {
    console.log("[ai-dev-workflow] No ACTIVE item. Run /onboard or /feature|/bugfix when starting work.");
    return;
  }
  try {
    const { type, status, issues } = collectIssues(root, active.id);
    const next =
      status.phase === "REQUIRE"
        ? "continue requirement-analysis / Gate 1"
        : status.phase === "PLAN"
          ? "continue planning / Gate 2"
          : status.phase === "BUILD"
            ? "run assert-build-ready then tdd-loop"
            : status.phase === "REVIEW"
              ? "code-review + security-review"
              : status.phase === "DELIVER"
                ? "deliver-pr then assert-done"
                : status.phase === "DONE"
                  ? "done"
                  : "see STATUS.md Next action";
    console.log(
      `[ai-dev-workflow] ACTIVE=${active.id} type=${type} phase=${status.phase} branch=${status.branch} validate=${issues.length ? "FAIL" : "OK"} next=${next}`
    );
    if (issues.length) {
      console.log("[ai-dev-workflow] Issues:\n" + issues.map((i) => `  - ${i}`).join("\n"));
    }
  } catch (e) {
    console.log(`[ai-dev-workflow] ACTIVE=${active.id} (status unreadable: ${e.message})`);
  }
}

function cmdClaim(root, id) {
  if (!id) fail("claim requires <id>");
  const loc = resolveStatusPath(root, id);
  const status = readJson(loc.file);
  writeJson(activePath(root), {
    id,
    type: status.type || loc.type,
    path: path.relative(root, loc.dir).split(path.sep).join("/"),
    updatedAt: nowIso()
  });
  ok(`claimed ACTIVE -> ${id}`);
}

function appendMetric(root, event) {
  const file = path.join(root, "context", "metrics", "events.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: nowIso(), ...event }) + "\n");
}

function cmdGateApprove(root, gateName, idArg) {
  const allowed = ["spec", "plan", "risk", "rootCause"];
  if (!allowed.includes(gateName)) fail(`gate must be one of ${allowed.join("|")}`);
  const id = resolveId(root, idArg);
  const { type, dir, file, status } = loadStatus(root, id);
  status.gates = status.gates || {};

  if (gateName === "spec") {
    if (type !== "feature") fail("spec gate is for features only");
    const hash = expectedSpecHash(dir);
    if (!hash) fail("02-spec.md missing");
    status.gates.spec = { state: "approved", sha256: hash, at: nowIso() };
  } else if (gateName === "plan") {
    if (type !== "feature") fail("plan gate is for features only");
    const hash = expectedPlanHash(dir);
    if (!hash) fail("03-plan.md or 04-test-cases.md missing");
    status.gates.plan = { state: "approved", sha256: hash, at: nowIso() };
  } else if (gateName === "risk") {
    status.gates.risk = {
      state: "approved",
      kinds: (status.gates.risk && status.gates.risk.kinds) || [],
      at: nowIso()
    };
  } else if (gateName === "rootCause") {
    if (type !== "bug") fail("rootCause gate is for bugs only");
    const summary =
      (status.gates.rootCause && status.gates.rootCause.summary) || "approved by user";
    status.gates.rootCause = { state: "approved", summary, at: nowIso() };
  }

  status.updatedAt = nowIso();
  writeJson(file, status);
  appendMetric(root, { id, event: "gate_approve", gate: gateName });
  ok(`gate ${gateName} approved for ${id}`);
}

function parseEvidenceArgs(argv) {
  const out = { kind: null, exitCode: null, summary: null, command: null, cwd: ".", id: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kind") out.kind = argv[++i];
    else if (a === "--exit") out.exitCode = Number(argv[++i]);
    else if (a === "--summary") out.summary = argv[++i];
    else if (a === "--command") out.command = argv[++i];
    else if (a === "--cwd") out.cwd = argv[++i];
    else if (!a.startsWith("-")) rest.push(a);
    else fail(`unknown evidence flag ${a}`);
  }
  out.id = rest[0] || null;
  return out;
}

function cmdEvidenceAppend(root, argv) {
  const opts = parseEvidenceArgs(argv);
  if (!opts.kind) fail("--kind required");
  if (typeof opts.exitCode !== "number" || Number.isNaN(opts.exitCode)) fail("--exit <number> required");
  if (!opts.summary) fail("--summary required");
  if (!opts.command) fail("--command required");
  const id = resolveId(root, opts.id);
  const { file, status } = loadStatus(root, id);
  status.evidence = status.evidence || [];
  status.evidence.push({
    at: nowIso(),
    kind: opts.kind,
    id: opts.kind === "task" ? undefined : undefined,
    command: opts.command,
    cwd: opts.cwd || ".",
    exitCode: opts.exitCode,
    summary: opts.summary
  });
  // clean undefined
  const last = status.evidence[status.evidence.length - 1];
  Object.keys(last).forEach((k) => last[k] === undefined && delete last[k]);
  status.updatedAt = nowIso();
  writeJson(file, status);
  appendMetric(root, { id, event: "evidence", kind: opts.kind, exitCode: opts.exitCode });
  ok(`evidence appended to ${id}`);
}

function cmdPhaseSet(root, phase, idArg) {
  if (!phase) fail("phase set requires <PHASE>");
  const id = resolveId(root, idArg);
  const { type, file, status } = loadStatus(root, id);
  const allowed = type === "feature" ? PHASES_FEATURE : PHASES_BUG;
  if (!allowed.includes(phase)) fail(`invalid phase '${phase}' for ${type}`);
  const prev = status.phase;
  status.phase = phase;
  status.updatedAt = nowIso();
  if (phase === "BUILD" && !status.diffBase) {
    status.diffBase = git("git rev-parse HEAD", root) || null;
  }
  writeJson(file, status);
  appendMetric(root, { id, event: "phase_enter", phase, from: prev });
  ok(`phase ${prev} -> ${phase} for ${id}`);
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseStdinJson() {
  const raw = readStdin();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function harnessBin(root) {
  const cursor = path.join(root, ".cursor", "harness", "ai-dev.js");
  const claude = path.join(root, ".claude", "harness", "ai-dev.js");
  if (fs.existsSync(cursor)) return `node ${cursor}`;
  if (fs.existsSync(claude)) return `node ${claude}`;
  return `node ${__filename}`;
}

function isTestishCommand(cmd) {
  return /\b(npm|pnpm|yarn|bun|pytest|python\s+-m\s+pytest|go\s+test|cargo\s+test|mvn\s+|gradle|./gradlew|dotnet\s+test|phpunit|rspec|make\s+test)\b/i.test(
    cmd
  );
}

function hookCursorSessionStart(root) {
  const chunks = [];
  const capture = [];
  const orig = console.log;
  console.log = (...a) => capture.push(a.join(" "));
  try {
    cmdSessionContext(root);
  } finally {
    console.log = orig;
  }
  const text = capture.join("\n");
  process.stdout.write(
    JSON.stringify({
      additional_context: text,
      env: { AI_DEV_WORKFLOW: "1", AI_DEV_ROOT: root }
    }) + "\n"
  );
}

function hookCursorBeforeShell(root) {
  const input = parseStdinJson();
  const command = input.command || "";
  const active = readActive(root);
  if (!active || !active.id || !isTestishCommand(command)) {
    process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
    return;
  }
  let status;
  try {
    status = loadStatus(root, active.id).status;
  } catch {
    process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
    return;
  }
  // Only gate once past planning for features, or after root-cause for bugs
  const shouldCheck =
    (status.type === "feature" || status.type === undefined) &&
    ["BUILD", "REVIEW", "DELIVER"].includes(status.phase)
      ? true
      : status.type === "bug" && ["BUGFIX", "REVIEW", "DELIVER"].includes(status.phase);

  if (!shouldCheck) {
    process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
    return;
  }

  const { issues } = buildReadyIssues(root, active.id);
  // For bugs in BUGFIX, buildReady requires rootCause — good.
  // For REVIEW/DELIVER, hash drift still matters for features.
  if (!issues.length) {
    process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");
    return;
  }

  const msg = `Harness assert-build-ready failed for ${active.id}:\n` + issues.map((i) => `- ${i}`).join("\n");
  process.stdout.write(
    JSON.stringify({
      permission: "ask",
      user_message: msg,
      agent_message: msg + `\nRun: ${harnessBin(root)} status ${active.id}`
    }) + "\n"
  );
}

function hookCursorSubagentStart(root) {
  const input = parseStdinJson();
  const active = readActive(root);
  let msg = "[ai-dev-workflow] Subagent start.";
  if (active && active.id) {
    try {
      const { status } = loadStatus(root, active.id);
      msg += ` ACTIVE=${active.id} phase=${status.phase}. Keep briefs scoped; reviewers read-only.`;
    } catch {
      msg += ` ACTIVE=${active.id}.`;
    }
  }
  // Cursor subagentStart: allow | deny only
  process.stdout.write(
    JSON.stringify({
      permission: "allow",
      user_message: msg
    }) + "\n"
  );
  // user_message may not inject to agent — that's ok; allow always
  void input;
}

function hookCursorStop(root) {
  const input = parseStdinJson();
  if (input.status && input.status !== "completed") {
    process.stdout.write("{}\n");
    return;
  }
  if ((input.loop_count || 0) > 0) {
    process.stdout.write("{}\n");
    return;
  }
  const active = readActive(root);
  if (!active || !active.id) {
    process.stdout.write("{}\n");
    return;
  }
  let status;
  try {
    status = loadStatus(root, active.id).status;
  } catch {
    process.stdout.write("{}\n");
    return;
  }
  if (status.phase === "DONE") {
    process.stdout.write("{}\n");
    return;
  }
  const { issues } = collectIssues(root, active.id);
  const drift = issues.filter((i) => /drifted|not approved|exceeds limit/.test(i));
  if (!drift.length) {
    process.stdout.write("{}\n");
    return;
  }
  process.stdout.write(
    JSON.stringify({
      followup_message: `Harness sensor: ACTIVE ${active.id} (phase ${status.phase}) has issues:\n${drift
        .map((i) => `- ${i}`)
        .join("\n")}\nFix gates/status before continuing. \`${harnessBin(root)} validate ${active.id}\``
    }) + "\n"
  );
}

function hookClaudeSessionStart(root) {
  cmdSessionContext(root);
}

function hookClaudePreBash(root) {
  const input = parseStdinJson();
  const toolInput = input.tool_input || {};
  const command = typeof toolInput === "string" ? toolInput : toolInput.command || "";
  // Reuse cursor logic into Claude decision format
  const fake = { command };
  // Inline check
  const active = readActive(root);
  if (!active || !active.id || !isTestishCommand(command)) {
    process.exit(0);
  }
  let status;
  try {
    status = loadStatus(root, active.id).status;
  } catch {
    process.exit(0);
  }
  const shouldCheck =
    ((status.type === "feature" || !status.type) && ["BUILD", "REVIEW", "DELIVER"].includes(status.phase)) ||
    (status.type === "bug" && ["BUGFIX", "REVIEW", "DELIVER"].includes(status.phase));
  if (!shouldCheck) process.exit(0);

  const { issues } = buildReadyIssues(root, active.id);
  if (!issues.length) process.exit(0);

  const reason =
    `Harness assert-build-ready failed for ${active.id}:\n` +
    issues.map((i) => `- ${i}`).join("\n") +
    `\nRun: ${harnessBin(root)} status ${active.id}`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason
      }
    }) + "\n"
  );
  void fake;
}

function hookClaudeStop(root) {
  // Claude Stop: exit 0; optional JSON. Keep non-intrusive — print nothing unless drift.
  const active = readActive(root);
  if (!active || !active.id) process.exit(0);
  try {
    const { status, issues } = collectIssues(root, active.id);
    if (status.phase === "DONE") process.exit(0);
    const drift = issues.filter((i) => /drifted|exceeds limit/.test(i));
    if (drift.length) {
      console.log(
        `[ai-dev-workflow] WARNING: ${active.id} validate issues:\n` +
          drift.map((i) => `  - ${i}`).join("\n")
      );
    }
  } catch {
    /* ignore */
  }
  process.exit(0);
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "-h" || argv[0] === "--help") usage(0);

  const root = findRoot(process.env.CLAUDE_PROJECT_DIR || process.env.AI_DEV_ROOT || process.cwd());
  const cmd = argv[0];

  switch (cmd) {
    case "validate":
      cmdValidate(root, argv[1]);
      break;
    case "assert-build-ready":
      cmdAssertBuildReady(root, argv[1]);
      break;
    case "assert-done":
      cmdAssertDone(root, argv[1]);
      break;
    case "status":
      cmdStatus(root, argv[1]);
      break;
    case "session-context":
      cmdSessionContext(root);
      break;
    case "claim":
      cmdClaim(root, argv[1]);
      break;
    case "gate":
      if (argv[1] !== "approve") fail("usage: gate approve <name> [id]");
      cmdGateApprove(root, argv[2], argv[3]);
      break;
    case "evidence":
      if (argv[1] !== "append") fail("usage: evidence append [id] --kind ...");
      cmdEvidenceAppend(root, argv.slice(2));
      break;
    case "phase":
      if (argv[1] !== "set") fail("usage: phase set <PHASE> [id]");
      cmdPhaseSet(root, argv[2], argv[3]);
      break;
    case "hook": {
      const event = argv[1];
      const map = {
        "cursor-session-start": hookCursorSessionStart,
        "cursor-before-shell": hookCursorBeforeShell,
        "cursor-subagent-start": hookCursorSubagentStart,
        "cursor-stop": hookCursorStop,
        "claude-session-start": hookClaudeSessionStart,
        "claude-pre-bash": hookClaudePreBash,
        "claude-stop": hookClaudeStop
      };
      if (!map[event]) fail(`unknown hook event '${event}'`);
      map[event](root);
      break;
    }
    default:
      fail(`unknown command '${cmd}'`);
  }
}

main();
