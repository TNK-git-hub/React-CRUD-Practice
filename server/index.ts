// HTTP server: JSON API, Server-Sent Events, static frontend.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, loadKey } from "./crypto.ts";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { MockGateway } from "./gateway/mock.ts";
import { MockPassGateway } from "./gateway/mockpass.ts";
import type { MyinfoGateway } from "./gateway/types.ts";
import { sendSingpassEmail } from "./mail.ts";
import { isValidNric, maskNric } from "./nric.ts";
import { PERSONAS, personaFor } from "./personas.ts";
import type { MyinfoPerson } from "./personas.ts";
import {
  AppError,
  DEALERS,
  Store,
  USERS,
  allFulfilled,
  currentLink,
  opsStatusLabel,
  partyStatus,
} from "./store.ts";
import type { Application, Party, Role, User } from "./store.ts";

let key: Buffer;
try {
  key = loadKey(process.env.MYINFO_ENCRYPTION_KEY);
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const TTL_HOURS = Number(process.env.LINK_TTL_HOURS || 72);
const SHOW_REVIEW = process.env.MYINFO_SHOW_REVIEW !== "false";
const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");

function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) return i.address;
  return null;
}
const BASE_URL = (process.env.PUBLIC_BASE_URL || `http://${lanAddress() ?? "localhost"}:${PORT}`).replace(/\/$/, "");

const store = new Store({ file: join(ROOT, "data", "db.json"), ttlHours: TTL_HOURS });

// ---------- gateway: "mockpass" (MockPass Myinfo v3) or "simulated" (built-in screens) ----------
const GATEWAY = process.env.GATEWAY === "simulated" ? "simulated" : "mockpass";
const MOCKPASS_PORT = Number(process.env.MOCKPASS_PORT || 5156);
const MOCKPASS_INTERNAL = (process.env.MOCKPASS_URL || `http://127.0.0.1:${MOCKPASS_PORT}`).replace(/\/$/, "");
const MOCKPASS_DIR = join(ROOT, "node_modules", "@opengovsg", "mockpass");
const MOCKPASS_PREFIXES = ["/myinfo/v3/", "/singpass/", "/consent/", "/mockpass/"];
const simulated = new MockGateway();
const mockpass =
  GATEWAY === "mockpass"
    ? new MockPassGateway({
        internalUrl: MOCKPASS_INTERNAL,
        publicUrl: BASE_URL, // MockPass is proxied through this app (see MOCKPASS_PREFIXES)
        appBaseUrl: BASE_URL,
        clientId: process.env.MYINFO_CLIENT_ID || "VMAF-AUTOFIN-DEMO",
        mockpassDir: MOCKPASS_DIR,
      })
    : null;
const gateway: MyinfoGateway = mockpass ?? simulated;

let mockpassChild: ChildProcess | null = null;
async function startMockPass(): Promise<void> {
  if (GATEWAY !== "mockpass" || process.env.MOCKPASS_AUTOSTART === "false") return;
  try {
    await fetch(`${MOCKPASS_INTERNAL}/mockpass/resources/img/favicon.ico`);
    console.log(`[mockpass] already running at ${MOCKPASS_INTERNAL}`);
    return;
  } catch {
    // not running yet
  }
  // cwd = MockPass dir, so its dotenv does not read this app's .env
  mockpassChild = spawn(process.execPath, ["index.js"], {
    cwd: MOCKPASS_DIR,
    env: { PATH: process.env.PATH ?? "", MOCKPASS_PORT: String(MOCKPASS_PORT), SHOW_LOGIN_PAGE: "true", ENCRYPT_MYINFO: "false", MOCKPASS_STATELESS: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  mockpassChild.on("exit", (code) => code && console.error(`[mockpass] exited with code ${code}`));
  console.log(`[mockpass] started on port ${MOCKPASS_PORT}`);
}
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    mockpassChild?.kill();
    process.exit(0);
  });
process.on("exit", () => mockpassChild?.kill());

/** Forward MockPass paths so the phone reaches MockPass through this app's single URL (LAN or tunnel). */
function proxyToMockPass(req: IncomingMessage, res: ServerResponse): void {
  const target = new URL(req.url ?? "/", MOCKPASS_INTERNAL);
  const up = httpRequest(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host, "x-forwarded-host": req.headers.host ?? "" } },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on("error", () => {
    if (!res.headersSent) send(res, 502, { error: "MockPass is not running (npm run dev starts it)" });
  });
  req.pipe(up);
}
const sessions = new Map<string, string>(); // sid -> userId

// ---------- realtime (SSE) ----------
const clients = new Set<ServerResponse>();
function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
setInterval(() => {
  for (const res of clients) res.write(": ping\n\n");
}, 25_000).unref();

// ---------- helpers ----------
function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 100_000) throw new AppError(413, "Body too large");
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {} as T;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new AppError(400, "Invalid JSON");
  }
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function currentUser(req: IncomingMessage): User | null {
  const sid = cookie(req, "sid");
  const uid = sid ? sessions.get(sid) : undefined;
  return USERS.find((u) => u.id === uid) ?? null;
}

function requireUser(req: IncomingMessage, kind?: User["kind"]): User {
  const u = currentUser(req);
  if (!u) throw new AppError(401, "Please sign in");
  if (kind && u.kind !== kind) throw new AppError(403, `Only ${kind} users can do this`);
  return u;
}

function canSee(user: User, app: Application): boolean {
  return user.kind === "ops" || app.dealerId === user.dealerId;
}

const linkUrl = (token: string) => `${BASE_URL}/v/${token}`;

function partyView(p: Party, now: number, withMyinfo: boolean) {
  const link = currentLink(p);
  let myinfo: MyinfoPerson | null = null;
  if (withMyinfo && p.myinfoEnc) {
    try {
      myinfo = decrypt<MyinfoPerson>(key, p.myinfoEnc);
    } catch {
      myinfo = null;
    }
  }
  return {
    role: p.role,
    name: p.name,
    nric: p.nric,
    email: p.email,
    mobile: p.mobile,
    status: partyStatus(p, now),
    triggerAt: p.triggerAt,
    fulfilledAt: p.fulfilledAt ?? null,
    expiresAt: link.expiresAt,
    linkUrl: linkUrl(link.token),
    mismatchUinfin: p.mismatchUinfin ?? null,
    myinfo,
    history: p.links.map((l) => ({ createdAt: l.createdAt, expiresAt: l.expiresAt, outcome: l.outcome ?? null })),
  };
}

function appView(app: Application, user: User, now: number) {
  return {
    ref: app.ref,
    dealer: DEALERS[app.dealerId] ?? app.dealerId,
    createdBy: app.createdBy,
    createdAt: app.createdAt,
    ltaCode: app.ltaCode,
    carPlate: app.carPlate,
    stage: app.stage,
    ipaAt: app.ipaAt ?? null,
    aaAt: app.aaAt ?? null,
    opsStatus: opsStatusLabel(app, now),
    allFulfilled: allFulfilled(app, now),
    notes: user.kind === "ops" ? app.notes : [],
    parties: app.parties.map((p) => partyView(p, now, user.kind === "ops")),
  };
}

async function emailParty(app: Application, p: Party): Promise<void> {
  const link = currentLink(p);
  const url = linkUrl(link.token);
  const r = await sendSingpassEmail({
    to: p.email,
    name: p.name,
    role: p.role,
    ref: app.ref,
    dealer: DEALERS[app.dealerId] ?? "",
    url,
    expiresAt: link.expiresAt,
    ttlHours: TTL_HOURS,
  });
  store.addOutbox({ at: Date.now(), to: p.email, subject: "Verify your identity for your car loan application", url, ref: app.ref, role: p.role, delivered: r.delivered, ...(r.error ? { error: r.error } : {}) });
  broadcast("outbox", {});
}

function changed(ref: string): void {
  broadcast("application", { ref });
}

const asRole = (v: string | undefined): Role => {
  if (v === "hirer" || v === "guarantor") return v;
  throw new AppError(400, "role must be hirer or guarantor");
};

// ---------- API ----------
type Handler = (req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void>;
const routes: Array<[string, RegExp, Handler]> = [];
const route = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:[a-z]+/g, "([^/]+)")}$`), h]);

route("GET", "/api/config", async (_req, res) => {
  send(res, 200, {
    baseUrl: BASE_URL,
    ttlHours: TTL_HOURS,
    showReview: SHOW_REVIEW,
    smtp: Boolean(process.env.SMTP_HOST),
    gateway: gateway.name,
    // personas the customer can pick on the login page, used by the dealer's "Fill sample"
    samples:
      gateway === simulated
        ? { hirer: { name: "HENG SHI ZHENG", nric: "F4440488P" }, guarantor: { name: "RAJESH KUMAR S/O MURUGAN", nric: "G4440425M" } }
        : { hirer: { name: "LIM YONG XIANG", nric: "S9812379B" }, guarantor: { name: "TAN CHONG HO", nric: "S9812351B" } },
  });
});

route("GET", "/api/users", async (_req, res) => send(res, 200, USERS));

route("GET", "/api/session", async (req, res) => send(res, 200, { user: currentUser(req) }));

route("POST", "/api/session", async (req, res) => {
  const { userId } = await readJson<{ userId?: string }>(req);
  const user = USERS.find((u) => u.id === userId);
  if (!user) throw new AppError(400, "Unknown user");
  const sid = randomBytes(24).toString("base64url");
  sessions.set(sid, user.id);
  send(res, 200, { user }, { "set-cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
});

route("DELETE", "/api/session", async (req, res) => {
  const sid = cookie(req, "sid");
  if (sid) sessions.delete(sid);
  send(res, 200, { ok: true }, { "set-cookie": "sid=; Path=/; Max-Age=0" });
});

route("GET", "/api/events", async (req, res) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
  res.write("retry: 1500\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

route("GET", "/api/applications", async (req, res) => {
  const user = requireUser(req);
  const now = Date.now();
  send(res, 200, store.applications.filter((a) => canSee(user, a)).map((a) => appView(a, user, now)));
});

route("POST", "/api/applications", async (req, res) => {
  const user = requireUser(req, "dealer");
  const body = await readJson<Parameters<Store["createApplication"]>[0]>(req);
  const app = store.createApplication(body, user, Date.now());
  for (const p of app.parties) await emailParty(app, p);
  changed(app.ref);
  send(res, 201, appView(app, user, Date.now()));
});

route("GET", "/api/applications/:ref", async (req, res, [ref]) => {
  const user = requireUser(req);
  const app = store.get(ref ?? "");
  if (!canSee(user, app)) throw new AppError(404, "Application not found");
  send(res, 200, appView(app, user, Date.now()));
});

route("POST", "/api/applications/:ref/parties/:role/resend", async (req, res, [ref, role]) => {
  const user = requireUser(req, "ops"); // D-04
  const { app, party } = store.resend(ref ?? "", asRole(role), Date.now());
  await emailParty(app, party);
  changed(app.ref);
  send(res, 200, appView(app, user, Date.now()));
});

route("POST", "/api/applications/:ref/ipa", async (req, res, [ref]) => {
  const user = requireUser(req, "ops");
  const app = store.issueIpa(ref ?? "", Date.now());
  changed(app.ref);
  send(res, 200, appView(app, user, Date.now()));
});

route("POST", "/api/applications/:ref/aa", async (req, res, [ref]) => {
  const user = requireUser(req, "ops");
  const app = store.issueAa(ref ?? "", Date.now());
  changed(app.ref);
  send(res, 200, appView(app, user, Date.now()));
});

// ---- customer side (no sign-in: the link token is the credential) ----
function linkInfo(token: string) {
  const now = Date.now();
  const c = store.checkLink(token, now);
  if (!c.valid) return { valid: false, reason: c.reason };
  return {
    valid: true,
    ref: c.app.ref,
    dealer: DEALERS[c.app.dealerId] ?? "",
    role: c.party.role,
    maskedNric: maskNric(c.party.nric),
    expiresAt: c.link.expiresAt,
    showReview: SHOW_REVIEW,
    gateway: gateway.name,
  };
}

function requireValidLink(token: string) {
  const c = store.checkLink(token, Date.now());
  if (!c.valid) throw new AppError(410, "This link is no longer valid");
  return c;
}

route("GET", "/api/v/:token", async (_req, res, [token]) => send(res, 200, linkInfo(token ?? "")));

route("GET", "/api/personas", async (_req, res) => send(res, 200, PERSONAS.map((p) => ({ uinfin: p.uinfin, name: p.name }))));

// D-24: GetToken + GetLinkId when the customer taps "Retrieve Myinfo with Singpass"
route("POST", "/api/v/:token/start", async (_req, res, [token]) => {
  const c = requireValidLink(token ?? "");
  const t = await gateway.getToken();
  const link = await gateway.getLinkId(t, { applicationRef: c.app.ref, role: c.party.role });
  store.setGatewayLinkId(token ?? "", link.linkId);
  send(res, 200, { linkId: link.linkId, loginUrl: link.loginUrl, external: /^https?:/.test(link.loginUrl) });
});

// Simulated gateway only: the built-in "Singpass" login screen
route("POST", "/api/v/:token/login", async (req, res, [token]) => {
  const c = requireValidLink(token ?? "");
  if (gateway !== simulated) throw new AppError(409, "Log in through MockPass");
  const { uinfin } = await readJson<{ uinfin?: string }>(req);
  if (!uinfin || !isValidNric(uinfin)) throw new AppError(400, "Enter a valid test NRIC / FIN");
  if (!c.link.gatewayLinkId) throw new AppError(409, "Start from the link page");
  simulated.simulateLogin(c.link.gatewayLinkId, uinfin);
  send(res, 200, { person: personaFor(uinfin) });
});

// Data the customer reviews before "Submit Application" (5_review-and-submit.png)
route("GET", "/api/v/:token/review", async (_req, res, [token]) => {
  const c = requireValidLink(token ?? "");
  const linkId = c.link.gatewayLinkId;
  if (!linkId) throw new AppError(409, "Start from the link page");
  const r = await gateway.getPerson(await gateway.getToken(), linkId);
  if (r.kind !== "ok") throw new AppError(409, "No Myinfo data yet: log in with Singpass and press Allow first");
  send(res, 200, { person: r.person, ref: c.app.ref, role: c.party.role });
});

async function finish(token: string, outcome: "agreed" | "declined") {
  const c = requireValidLink(token);
  const linkId = c.link.gatewayLinkId;
  if (!linkId) throw new AppError(409, "Start from the link page");
  if (gateway === simulated) simulated.simulateConsent(linkId, outcome);
  const r = outcome === "declined" ? { kind: "declined" as const } : await gateway.getPerson(await gateway.getToken(), linkId); // person/autofin/{LinkId}
  const now = Date.now();
  let status;
  if (r.kind === "ok") status = store.attachResult(token, { kind: "ok", uinfin: r.person.uinfin, sealed: encrypt(key, r.person) }, now);
  else if (r.kind === "declined") status = store.attachResult(token, { kind: "declined" }, now);
  else throw new AppError(409, "Log in with Singpass first");
  changed(c.app.ref);
  return { status, ref: c.app.ref };
}

route("POST", "/api/v/:token/submit", async (_req, res, [token]) => {
  try {
    send(res, 200, await finish(token ?? "", "agreed"));
  } catch (e) {
    const found = store.findByToken(token ?? "");
    if (found) changed(found.app.ref);
    throw e;
  }
});

route("POST", "/api/v/:token/decline", async (_req, res, [token]) => send(res, 200, await finish(token ?? "", "declined")));

/** OAuth redirect back from MockPass (Myinfo v3): fetch the person, then show the review screen. */
async function myinfoCallback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const redirect = (to: string) => {
    res.writeHead(302, { location: to });
    res.end();
  };
  const found = store.findByGatewayLinkId(url.searchParams.get("state") ?? "");
  if (!found || !gateway.handleCallback) return redirect("/v/invalid");
  const token = found.link.token;
  try {
    const { outcome } = await gateway.handleCallback(url.searchParams);
    if (outcome === "declined") {
      await finish(token, "declined");
      return redirect(`/v/${token}?step=declined`);
    }
    if (!SHOW_REVIEW) {
      await finish(token, "agreed");
      return redirect(`/v/${token}?step=done&ref=${encodeURIComponent(found.app.ref)}`);
    }
    return redirect(`/v/${token}?step=review`);
  } catch (e) {
    console.error("[myinfo-callback]", e);
    if (e instanceof AppError && e.status === 410) return redirect(`/v/${token}`);
    return redirect(`/v/${token}?step=error&msg=${encodeURIComponent(e instanceof Error ? e.message : "Myinfo error")}`);
  }
}

// ---- Demo Control (D-05: any signed-in user) ----
route("GET", "/api/demo/outbox", async (req, res) => {
  requireUser(req);
  send(res, 200, store.outbox);
});

route("POST", "/api/demo/reset", async (req, res) => {
  requireUser(req);
  store.reset();
  gateway.reset();
  simulated.reset();
  broadcast("application", { ref: null });
  broadcast("outbox", {});
  send(res, 200, { ok: true });
});

route("POST", "/api/demo/seed", async (req, res) => {
  requireUser(req);
  const added = store.seed(Date.now(), (nric) => encrypt(key, personaFor(nric)));
  broadcast("application", { ref: null });
  send(res, 200, { added });
});

route("POST", "/api/demo/expire/:ref/:role", async (req, res, [ref, role]) => {
  requireUser(req);
  store.expireLink(ref ?? "", asRole(role), Date.now());
  changed(ref ?? "");
  send(res, 200, { ok: true });
});

// ---------- static ----------
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  let file = join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) file = join(PUBLIC_DIR, "index.html");
  try {
    if (!(await stat(file)).isFile()) throw new Error("dir");
  } catch {
    file = join(PUBLIC_DIR, "index.html"); // SPA fallback
  }
  const body = await readFile(file);
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  res.end(req.method === "HEAD" ? undefined : body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (GATEWAY === "mockpass" && MOCKPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return proxyToMockPass(req, res);
    if (url.pathname === "/myinfo-callback" && req.method === "GET") return await myinfoCallback(req, res, url);
    if (url.pathname.startsWith("/api/")) {
      for (const [method, re, h] of routes) {
        const m = re.exec(url.pathname);
        if (m && method === req.method) return await h(req, res, m.slice(1).map(decodeURIComponent));
      }
      throw new AppError(404, "Not found");
    }
    if (req.method !== "GET" && req.method !== "HEAD") throw new AppError(405, "Method not allowed");
    await serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: e instanceof Error ? e.message : "Error" });
    else res.end();
  }
});

await startMockPass();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nValueMax Singpass demo running`);
  console.log(`  Laptop:      http://localhost:${PORT}`);
  console.log(`  Phone links: ${BASE_URL}  (PUBLIC_BASE_URL)`);
  console.log(`  Demo Control: http://localhost:${PORT}/demo`);
  console.log(`  Gateway:     ${GATEWAY === "mockpass" ? `MockPass (Myinfo v3) on :${MOCKPASS_PORT}, proxied via ${BASE_URL}` : "built-in simulated screens"}`);
  console.log(`  Email: ${process.env.SMTP_HOST ? `SMTP ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}` : "SMTP not configured — links printed below"}\n`);
});
