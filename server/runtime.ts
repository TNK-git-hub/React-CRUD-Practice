// Wires the demo together: database, simulated gateway, verification service, HTTP API, SSE and the auto-verify job.
// Two separate "systems" share this HTTP server:
//   AutoFinance  — /api/*, the dealer / Ops / Demo Control pages, the portal page /verify/<token>
//   Simulated ValueMax Myinfo gateway — /gateway/<LinkId> pages and /gateway-api/<LinkId>/*
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import type { AdjustableClock } from "./clock.ts";
import type { AppConfig } from "./config.ts";
import { encrypt } from "./crypto.ts";
import { MockGatewayAdapter, SimulatedGateway } from "./gateway/simulated.ts";
import { GatewayUnavailable } from "./gateway/adapter.ts";
import { isValidNric, maskNric } from "./nric.ts";
import { PERSONAS } from "./personas.ts";
import { applicationView, canSee } from "./views.ts";
import { Db } from "./verification/db.ts";
import type { ApplicationInput, PartyInput } from "./verification/model.ts";
import { ServiceError, VerificationService } from "./verification/service.ts";
import type { EmailSender } from "./verification/service.ts";
import { DEALERS, USERS } from "./verification/users.ts";
import type { User } from "./verification/users.ts";

export interface RuntimeOptions {
  config: AppConfig;
  clock: AdjustableClock;
  /** JSON file for the data; null = in memory only. */
  dbFile: string | null;
  /** MYINFO_ENCRYPTION_KEY (D-03). */
  key: Buffer;
  email: EmailSender;
  smtpConfigured: boolean;
  publicDir?: string;
}

class HttpError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | undefined;
  constructor(status: number, message: string, body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void>;

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function createRuntime(opts: RuntimeOptions) {
  const { config, clock, key } = opts;
  const publicDir = opts.publicDir ?? resolve(import.meta.dirname, "..", "public");
  const db = new Db(opts.dbFile);
  const gatewaySystem = new SimulatedGateway(clock);
  const adapter = new MockGatewayAdapter(gatewaySystem, config.publicBaseUrl);

  // ---------- realtime (SSE) ----------
  const clients = new Set<ServerResponse>();
  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  };
  const ping = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 25_000);
  ping.unref();

  const service = new VerificationService({
    db,
    gateway: adapter,
    clock,
    config,
    email: opts.email,
    seal: (person) => encrypt(key, person),
    onChange: (ref) => broadcast("application", { ref }),
  });

  // ---------- sessions (D-08) ----------
  const sessions = new Map<string, string>();
  const cookie = (req: IncomingMessage, name: string) => {
    for (const part of (req.headers.cookie ?? "").split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === name) return decodeURIComponent(v.join("="));
    }
    return undefined;
  };
  const currentUser = (req: IncomingMessage): User | null => {
    const sid = cookie(req, "sid");
    const uid = sid ? sessions.get(sid) : undefined;
    return USERS.find((u) => u.id === uid) ?? null;
  };
  const requireUser = (req: IncomingMessage, kind?: User["kind"]): User => {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, "Please sign in");
    if (kind && u.kind !== kind) throw new HttpError(403, `Only ${kind} users can do this`);
    return u;
  };

  // ---------- helpers ----------
  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const readJson = async <T>(req: IncomingMessage): Promise<T> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 100_000) throw new HttpError(413, "Body too large");
      chunks.push(c as Buffer);
    }
    if (!chunks.length) return {} as T;
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
  };
  const portalUrl = (token: string) => `${config.publicBaseUrl}/verify/${token}`;
  const view = (user: User, ref: string) => {
    const app = service.getApplication(ref);
    if (!canSee(user, app)) throw new HttpError(404, "Application not found");
    return applicationView(app, { user, key, portalUrl }, db.audit);
  };

  // ---------- job ----------
  let jobTimer: NodeJS.Timeout | null = null;
  let jobRunning = false;
  const tick = async () => {
    if (jobRunning) return; // runs are overlap-safe anyway; this only avoids piling up
    jobRunning = true;
    try {
      await service.runJob();
    } catch (e) {
      console.error("[job]", e instanceof Error ? e.message : e);
    } finally {
      jobRunning = false;
    }
  };

  // ---------- routes ----------
  const routes: Array<[string, RegExp, Handler]> = [];
  const route = (method: string, pattern: string, h: Handler) =>
    routes.push([method, new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`), h]);

  route("GET", "/api/config", async (_req, res) =>
    send(res, 200, {
      baseUrl: config.publicBaseUrl,
      ttlHours: config.linkTtlMs / 3_600_000,
      pollIntervalMs: config.pollIntervalMs,
      showReview: config.showReview,
      smtp: opts.smtpConfigured,
      samples: { hirer: { name: "HENG SHI ZHENG", nric: "F4440488P" }, guarantor: { name: "RAJESH KUMAR S/O MURUGAN", nric: "G4440425M" } },
    }),
  );
  route("GET", "/api/users", async (_req, res) => send(res, 200, USERS));
  route("GET", "/api/session", async (req, res) => send(res, 200, { user: currentUser(req) }));
  route("POST", "/api/session", async (req, res) => {
    const { userId } = await readJson<{ userId?: string }>(req);
    const user = USERS.find((u) => u.id === userId);
    if (!user) throw new HttpError(400, "Unknown user");
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

  // ---- applications ----
  route("GET", "/api/applications", async (req, res) => {
    const user = requireUser(req);
    send(res, 200, db.applications.filter((a) => canSee(user, a)).map((a) => applicationView(a, { user, key, portalUrl }, db.audit)));
  });
  route("POST", "/api/applications", async (req, res) => {
    const user = requireUser(req, "dealer");
    const body = await readJson<Partial<ApplicationInput> & { guarantor?: PartyInput | null }>(req);
    const guarantors = body.guarantors ?? (body.guarantor ? [body.guarantor] : []);
    const app = await service.submitApplication({ hirer: body.hirer as PartyInput, guarantors, ltaCode: body.ltaCode ?? "" }, user);
    send(res, 201, view(user, app.ref));
  });
  route("GET", "/api/applications/:ref", async (req, res, [ref]) => send(res, 200, view(requireUser(req), ref ?? "")));
  route("POST", "/api/applications/:ref/parties/:party/resend", async (req, res, [ref, party]) => {
    const user = requireUser(req);
    const { reason } = await readJson<{ reason?: string }>(req);
    view(user, ref ?? ""); // visibility
    await service.resend(ref ?? "", party ?? "", user, reason ?? "");
    send(res, 200, view(user, ref ?? ""));
  });
  route("POST", "/api/applications/:ref/parties/:party/retrieve", async (req, res, [ref, party]) => {
    const user = requireUser(req);
    const outcome = await service.retrieveMyInfo(ref ?? "", party ?? "", user);
    send(res, 200, { outcome, application: view(user, ref ?? "") });
  });
  for (const step of ["ipa", "aa"])
    route("POST", `/api/applications/:ref/${step}`, async () => {
      throw new HttpError(501, "Issuing IPA / AA is being rebuilt (plan step 5)");
    });

  // ---- customer portal (AutoFinance): /verify/<token> ----
  route("POST", "/api/verify/:token/open", async (_req, res, [token]) => {
    const r = service.openLink(token ?? "");
    if (!r.ok) throw new HttpError(410, "This link is no longer valid", { reason: r.reason });
    const found = service.findByPortalToken(token ?? "");
    send(res, 200, {
      ok: true,
      redirectUrl: r.redirectUrl,
      ref: found?.app.ref,
      dealer: found ? (DEALERS[found.app.dealerId] ?? "") : "",
      role: found?.party.label,
      maskedNric: found ? maskNric(found.party.nric) : "",
      expiresAt: found?.link.expiresAt ?? null,
    });
  });

  // ---- simulated ValueMax Myinfo gateway (customer side) ----
  const gatewaySession = (linkId: string) => {
    if (!gatewaySystem.isAvailable()) throw new HttpError(503, "The Myinfo service is temporarily unavailable. Please try again later.");
    const s = gatewaySystem.session(linkId);
    if (!s) throw new HttpError(404, "Unknown Myinfo request");
    return s;
  };
  const gatewayOk = (res: ServerResponse, ok: boolean) => {
    if (!ok) throw new HttpError(409, "Log in with Singpass first");
    send(res, 200, { ok: true });
  };
  route("GET", "/gateway-api/:linkId", async (_req, res, [linkId]) => {
    const s = gatewaySession(linkId ?? "");
    send(res, 200, {
      linkId: s.linkId,
      applicationRef: s.party.applicationRef,
      showReview: config.showReview,
      submitted: Boolean(s.submittedAt),
      personas: PERSONAS.map((p) => ({ uinfin: p.uinfin, name: p.name })),
    });
  });
  route("POST", "/gateway-api/:linkId/login", async (req, res, [linkId]) => {
    gatewaySession(linkId ?? "");
    const { uinfin } = await readJson<{ uinfin?: string }>(req);
    if (!uinfin || !isValidNric(uinfin)) throw new HttpError(400, "Enter a valid test NRIC / FIN");
    send(res, 200, { person: gatewaySystem.login(linkId ?? "", uinfin) });
  });
  route("POST", "/gateway-api/:linkId/agree", async (_req, res, [linkId]) => {
    gatewaySession(linkId ?? "");
    gatewayOk(res, gatewaySystem.agree(linkId ?? ""));
  });
  route("POST", "/gateway-api/:linkId/decline", async (_req, res, [linkId]) => {
    gatewaySession(linkId ?? "");
    gatewayOk(res, gatewaySystem.decline(linkId ?? ""));
  });
  route("POST", "/gateway-api/:linkId/submit", async (_req, res, [linkId]) => {
    gatewaySession(linkId ?? "");
    gatewayOk(res, gatewaySystem.submit(linkId ?? ""));
  });

  // ---- Demo Control (D-05: any signed-in user) ----
  const demoState = () => ({
    now: clock.now(),
    offsetMs: clock.offset,
    gatewayAvailable: gatewaySystem.isAvailable(),
    pollIntervalMs: config.pollIntervalMs,
    gatewayLog: gatewaySystem.log.slice(0, 50),
  });
  route("GET", "/api/demo/state", async (req, res) => {
    requireUser(req);
    send(res, 200, demoState());
  });
  route("GET", "/api/demo/outbox", async (req, res) => {
    requireUser(req);
    send(res, 200, db.outbox);
  });
  route("POST", "/api/demo/gateway", async (req, res) => {
    requireUser(req);
    const { available } = await readJson<{ available?: boolean }>(req);
    gatewaySystem.setAvailable(available !== false);
    broadcast("demo", {});
    send(res, 200, demoState());
  });
  route("POST", "/api/demo/run-job", async (req, res) => {
    requireUser(req);
    await service.runJob();
    send(res, 200, demoState());
  });
  route("POST", "/api/demo/clock", async (req, res) => {
    requireUser(req);
    const { advanceHours } = await readJson<{ advanceHours?: number }>(req);
    const hours = Number(advanceHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) throw new HttpError(400, "advanceHours must be between 0 and 720");
    clock.advance(hours * 3_600_000);
    broadcast("demo", {});
    send(res, 200, demoState());
  });
  route("POST", "/api/demo/reset", async (req, res) => {
    requireUser(req);
    db.reset();
    gatewaySystem.reset();
    clock.resetOffset();
    broadcast("application", { ref: null });
    broadcast("demo", {});
    send(res, 200, { ok: true });
  });
  route("POST", "/api/demo/seed", async (req, res) => {
    requireUser(req);
    send(res, 200, { added: service.seedSamples() });
  });

  // ---------- static frontend (SPA) ----------
  const serveStatic = async (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
    let file = join(publicDir, safe);
    if (!file.startsWith(publicDir)) file = join(publicDir, "index.html");
    try {
      if (!(await stat(file)).isFile()) throw new Error("dir");
    } catch {
      file = join(publicDir, "index.html"); // SPA fallback: /verify/<token>, /gateway/<LinkId>, /dealer/…
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": STATIC_TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : body);
  };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    try {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/gateway-api/")) {
        for (const [method, re, h] of routes) {
          const m = re.exec(url.pathname);
          if (m && method === req.method) return await h(req, res, m.slice(1).map(decodeURIComponent));
        }
        throw new HttpError(404, "Not found");
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
      await serveStatic(req, res, url.pathname);
    } catch (e) {
      let status = 500;
      let body: Record<string, unknown> = { error: "Internal error" };
      if (e instanceof HttpError) [status, body] = [e.status, { error: e.message, ...e.body }];
      else if (e instanceof ServiceError) [status, body] = [e.status, { error: e.message, ...e.details }];
      else if (e instanceof GatewayUnavailable) [status, body] = [503, { error: e.message }];
      else console.error(e);
      if (!res.headersSent) send(res, status, body);
      else res.end();
    }
  });

  return {
    server,
    service,
    db,
    gatewaySystem,
    clock,
    /** Starts the auto-verify job every POLL_INTERVAL_MS (D-01). */
    startJob(): void {
      jobTimer ??= setInterval(tick, config.pollIntervalMs);
    },
    async close(): Promise<void> {
      if (jobTimer) clearInterval(jobTimer);
      clearInterval(ping);
      for (const c of clients) c.end();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
