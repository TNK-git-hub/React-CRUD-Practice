// Mock ValueMax Myinfo gateway: a standalone service that stands in for the gateway ValueMax will provide.
// It is the Myinfo client of MockPass (Singpass + Myinfo v3 mock), hosts the customer's Review / Submit pages and
// pushes the consented data to AutoFinance by signed webhook. AutoFinance only knows this service's HTTP API.
//
//   AutoFinance                      this gateway (:4000)                           MockPass (:5156)
//   POST /gw/api/token        ─▶     access token
//   POST /gw/api/link         ─▶     { linkId, url }   (url = /gw/l/{linkId})
//                                    customer: /gw/l/{linkId} ─▶ /myinfo/v3/authorise ─▶ login + consent
//                                    /gw/callback?code&state ◀───────────────────────────┘ token + person
//                                    /gw/l/{linkId}/review  → "Submit Application"
//   POST {webhookUrl}         ◀─     myinfo.submitted / myinfo.declined (HMAC signed, 3 attempts)
//   GET  /gw/api/person/autofin/{linkId}   pull fallback
//
// Run alone: `npm run gateway`. `npm run dev` (GATEWAY=http) starts it for you.
import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MockPassGateway } from "../server/gateway/mockpass.ts";
import { SIGNATURE_HEADER, signWebhook } from "../server/gateway/webhook.ts";
import type { WebhookEvent, WebhookReply } from "../server/gateway/webhook.ts";
import type { MyinfoPerson } from "../server/personas.ts";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.GW_PORT || 4000);
/** Base URL the customer's browser uses for this gateway (AutoFinance proxies /gw/* so the phone needs one URL). */
const PUBLIC_URL = (process.env.GW_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const MOCKPASS_PORT = Number(process.env.MOCKPASS_PORT || 5156);
const MOCKPASS_URL = `http://127.0.0.1:${MOCKPASS_PORT}`;
const MOCKPASS_DIR = join(ROOT, "node_modules", "@opengovsg", "mockpass");
const MOCKPASS_PREFIXES = ["/myinfo/v3/", "/singpass/", "/consent/", "/mockpass/"];
const CLIENT_ID = process.env.GW_CLIENT_ID || "VMAF-AUTOFIN-DEMO";
const CLIENT_SECRET = process.env.GW_CLIENT_SECRET || "demo-client-secret";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "demo-webhook-secret";
const SHOW_REVIEW = process.env.MYINFO_SHOW_REVIEW !== "false";
const LINK_TTL_MS = Number(process.env.LINK_TTL_HOURS || 72) * 3_600_000;
const TOKEN_TTL_S = 1800;
const log = (...a: unknown[]) => console.log("[gateway]", ...a);

const mockpass = new MockPassGateway({
  internalUrl: MOCKPASS_URL,
  publicUrl: PUBLIC_URL, // MockPass pages are proxied through this service
  appBaseUrl: PUBLIC_URL,
  redirectPath: "/gw/callback",
  clientId: CLIENT_ID,
  mockpassDir: MOCKPASS_DIR,
});

type LinkStatus = "pending" | "retrieved" | "submitted" | "declined" | "rejected";
interface GwLink {
  linkId: string;
  applicationRef: string;
  role: string;
  webhookUrl: string;
  loginUrl: string;
  createdAt: number;
  expiresAt: number;
  status: LinkStatus;
  person?: MyinfoPerson;
  /** Why AutoFinance refused the result (status "rejected"), or the last delivery error. */
  message?: string;
}

const tokens = new Map<string, number>(); // access token -> expiresAt
const links = new Map<string, GwLink>();

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- helpers ----------
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}
function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to });
  res.end();
}
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 100_000) throw new HttpError(413, "Body too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  try {
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
function requireToken(req: IncomingMessage): void {
  const t = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
  const exp = tokens.get(t);
  if (!exp || exp < Date.now()) throw new HttpError(401, "Invalid or expired access token");
}
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const sgd = (n: number) => `SGD ${n.toLocaleString("en-SG")}`;

function linkFor(id: string): GwLink | undefined {
  const l = links.get(id);
  if (l && l.status !== "submitted" && l.status !== "declined" && l.expiresAt < Date.now()) {
    l.status = "rejected";
    l.message = "This link has expired.";
  }
  return l;
}

// ---------- webhook to AutoFinance ----------
type Delivery = { ok: true; reply: WebhookReply } | { ok: false; rejected: boolean; error: string };

async function deliver(link: GwLink, ev: WebhookEvent): Promise<Delivery> {
  const body = JSON.stringify(ev);
  let error = "";
  for (const [attempt, wait] of [0, 500, 1500].entries()) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(link.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signWebhook(body, WEBHOOK_SECRET), "x-gateway-event-id": `${ev.linkId}:${ev.event}` },
        body,
      });
      const reply = (await res.json().catch(() => ({}))) as WebhookReply & { error?: string };
      log(`webhook ${ev.event} ${ev.applicationRef}/${ev.role} -> ${res.status} ${reply.status ?? reply.reason ?? reply.error ?? ""} (attempt ${attempt + 1})`);
      if (res.ok) return { ok: true, reply };
      error = reply.reason ?? reply.error ?? `HTTP ${res.status}`;
      // 4xx (other than timeout / rate limit) = AutoFinance refused it; retrying will not help
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) return { ok: false, rejected: true, error };
    } catch (e) {
      error = `AutoFinance not reachable (${e instanceof Error ? e.message : "network error"})`;
      log(`webhook ${ev.event} ${ev.applicationRef}/${ev.role} failed: ${error} (attempt ${attempt + 1})`);
    }
  }
  return { ok: false, rejected: false, error };
}

/** Customer pressed Submit Application (or Cancel / Deny): push to AutoFinance and record the outcome. */
async function complete(link: GwLink, outcome: "submitted" | "declined"): Promise<void> {
  const base = { linkId: link.linkId, applicationRef: link.applicationRef, role: link.role, at: Date.now() };
  const ev: WebhookEvent =
    outcome === "submitted" && link.person
      ? { ...base, event: "myinfo.submitted", uinfin: link.person.uinfin, person: link.person }
      : { ...base, event: "myinfo.declined" };
  const d = await deliver(link, ev);
  if (d.ok) {
    link.status = outcome;
    delete link.message;
  } else if (d.rejected) {
    link.status = "rejected";
    link.message = d.error;
  } else {
    link.message = d.error; // keep status so the customer can press Submit again
  }
}

// ---------- customer pages ----------
function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/gw/styles.css">
<style>.rvtabs a{padding:8px 12px;border-radius:6px;color:#1E4FD8;font-size:13px;font-weight:600;text-decoration:none}.rvtabs a.on{background:#1E4FD8;color:#fff}
.gwerr{background:#FDECEE;color:#8A1C2B;border-radius:10px;padding:12px 14px;font-size:14px}form{margin:0}</style>
</head><body><div class="phone">
<div class="simbar">MOCK VALUEMAX MYINFO GATEWAY · DEMO ONLY · NOT REAL SINGPASS</div>
${body}</div></body></html>`;
}

function messagePage(title: string, text: string, tone: "ok" | "bad" | "plain"): string {
  const icon =
    tone === "ok"
      ? `<div class="okcircle" style="width:80px;height:80px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div>`
      : "";
  return shell(
    title,
    `<div style="flex:1;padding:32px 24px;display:flex;flex-direction:column;gap:18px;align-items:center;text-align:center;justify-content:center">
      ${icon}<h1 style="font-size:24px;${tone === "bad" ? "color:var(--red)" : ""}">${esc(title)}</h1>
      <p class="para" style="font-size:15px;max-width:320px">${text}</p></div>
    <div class="foot">The gateway does not send the customer back to AutoFinance, so this page is the end of the customer's journey.</div>`,
  );
}

function statusPage(link: GwLink): string {
  if (link.status === "submitted")
    return messagePage("Details shared", `Your MyInfo details were sent to ValueMax AutoFinance for application ${esc(link.applicationRef)}. You can close this page.<br><span class="small muted">Your dealer will contact you about the next step.</span>`, "ok");
  if (link.status === "declined")
    return messagePage("You cancelled", "No details were shared with ValueMax AutoFinance. To continue your application, ask your dealer to send a new link.", "plain");
  return messagePage("This link is no longer valid", `${esc(link.message || "")} Please use the latest email, or ask your dealer to resend.`, "bad");
}

function reviewPage(link: GwLink, tab: string): string {
  const p = link.person!;
  const rows: Record<string, Array<[string, string]>> = {
    personal: [["NRIC/FIN", p.uinfin], ["Full Name", p.name], ["Sex", p.sex], ["Race", p.race], ["Nationality/Citizenship", p.nationality], ["Date of Birth", p.dob], ["Country/Place of Birth", p.birthCountry], ["Marital Status", p.maritalStatus], ["Registered Address", p.regAddress], ["Email Address", p.email], ["Mobile Number", p.mobile]],
    employment: [["Name of Employer", p.employer], ["Employment Sector", p.employmentSector], ["Occupation", p.occupation], ["Highest Education", p.education], ...p.noaHistory.map((n): [string, string] => [`NOA ${n.year}`, sgd(n.amount)]), ["CPF Contribution History", `${p.cpfMonths} months · latest ${sgd(p.cpfLatestAmount)}`]],
    property: [["Type of Housing", p.housingType], ["Type of HDB", p.hdbType], ["HDB Ownership", p.hdbOwnership], ["Date of Purchase", p.hdbPurchaseDate], ["Monthly Loan Instalment", p.hdbMonthlyInstalment ? sgd(p.hdbMonthlyInstalment) : ""], ["Outstanding HDB Loan", p.hdbOutstandingLoan ? sgd(p.hdbOutstandingLoan) : ""]],
  };
  const labels: Record<string, [string, string]> = { personal: ["Personal", "Personal Information"], employment: ["Employment &amp; Education", "Employment &amp; Education"], property: ["Property", "Property"] };
  const t = rows[tab] ? tab : "personal";
  const once = `onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Sending…'"`;
  return shell(
    "Review your details",
    `<div class="pbody sp" style="padding:24px;gap:14px">
      <h1 style="text-align:center;color:#E0702B;font-size:22px">Review</h1>
      <p style="margin:0;text-align:center;font-size:13px;color:var(--sp-2)">Application ${esc(link.applicationRef)}. Review your details below and click "Submit Application".</p>
      ${link.message ? `<div class="gwerr">Could not send your details: ${esc(link.message)}. Please press Submit Application again.</div>` : ""}
      <nav class="rvtabs">${Object.keys(rows).map((k) => `<a href="?tab=${k}" class="${k === t ? "on" : ""}">${labels[k]![0]}</a>`).join("")}</nav>
      <div class="rvhead">${labels[t]![1]}</div>
      <ul class="splist">${rows[t]!.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v || "—")}</b></li>`).join("")}</ul>
      <form method="post" action="/gw/l/${esc(link.linkId)}/submit" ${once}><button class="spbtn" type="submit" style="background:#E0702B">Submit Application</button></form>
      <form method="post" action="/gw/l/${esc(link.linkId)}/cancel" ${once}><button class="spbtn ghost" type="submit">Cancel</button></form>
    </div>`,
  );
}

// ---------- MockPass (child process + proxy) ----------
let mockpassChild: ChildProcess | null = null;
async function startMockPass(): Promise<void> {
  if (process.env.MOCKPASS_AUTOSTART === "false") return;
  try {
    await fetch(`${MOCKPASS_URL}/mockpass/resources/img/favicon.ico`);
    log(`MockPass already running at ${MOCKPASS_URL}`);
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
  mockpassChild.on("exit", (code) => code && console.error(`[gateway] MockPass exited with code ${code}`));
  log(`MockPass started on port ${MOCKPASS_PORT}`);
}
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    mockpassChild?.kill();
    process.exit(0);
  });
process.on("exit", () => mockpassChild?.kill());

function proxyToMockPass(req: IncomingMessage, res: ServerResponse): void {
  const target = new URL(req.url ?? "/", MOCKPASS_URL);
  const up = httpRequest(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => {
    if (!res.headersSent) sendJson(res, 502, { error: "MockPass is not running" });
  });
  req.pipe(up);
}

// ---------- routes ----------
const STYLES = readFileSync(join(ROOT, "public", "styles.css"));

async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const path = url.pathname;
  const m = (re: RegExp) => re.exec(path)?.slice(1).map(decodeURIComponent);
  let p: string[] | undefined;

  if (MOCKPASS_PREFIXES.some((x) => path.startsWith(x))) return proxyToMockPass(req, res);
  if (path === "/gw/health") return sendJson(res, 200, { ok: true, links: links.size });
  if (path === "/gw/styles.css") {
    res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" });
    return void res.end(STYLES);
  }

  // GetToken
  if (path === "/gw/api/token" && req.method === "POST") {
    const b = await readJson<{ client_id?: string; client_secret?: string }>(req);
    if (b.client_id !== CLIENT_ID || b.client_secret !== CLIENT_SECRET) throw new HttpError(401, "Invalid client credentials");
    const t = randomBytes(24).toString("base64url");
    tokens.set(t, Date.now() + TOKEN_TTL_S * 1000);
    return sendJson(res, 200, { access_token: t, token_type: "Bearer", expires_in: TOKEN_TTL_S });
  }

  // GetLinkId
  if (path === "/gw/api/link" && req.method === "POST") {
    requireToken(req);
    const b = await readJson<{ applicationRef?: string; role?: string; webhookUrl?: string }>(req);
    if (!b.applicationRef || !b.role) throw new HttpError(400, "applicationRef and role are required");
    if (!/^https?:\/\//.test(b.webhookUrl ?? "")) throw new HttpError(400, "webhookUrl must be an http(s) URL");
    const mp = await mockpass.getLinkId(await mockpass.getToken(), { applicationRef: b.applicationRef, role: b.role });
    const now = Date.now();
    const link: GwLink = { linkId: mp.linkId, applicationRef: b.applicationRef, role: b.role, webhookUrl: b.webhookUrl!, loginUrl: mp.loginUrl, createdAt: now, expiresAt: now + LINK_TTL_MS, status: "pending" };
    links.set(link.linkId, link);
    log(`GetLinkId ${link.applicationRef}/${link.role} -> ${link.linkId}`);
    return sendJson(res, 201, { linkId: link.linkId, url: `${PUBLIC_URL}/gw/l/${link.linkId}`, expiresAt: link.expiresAt });
  }

  // person/autofin/{LinkId} (pull fallback; data only after the customer submitted)
  if ((p = m(/^\/gw\/api\/person\/autofin\/([^/]+)$/)) && req.method === "GET") {
    requireToken(req);
    const link = linkFor(p[0]!);
    if (!link) throw new HttpError(404, "Unknown LinkId");
    return sendJson(res, 200, { linkId: link.linkId, status: link.status, ...(link.status === "submitted" ? { person: link.person } : {}) });
  }

  if (path === "/gw/api/demo/reset" && req.method === "POST") {
    requireToken(req);
    links.clear();
    mockpass.reset();
    return sendJson(res, 200, { ok: true });
  }

  // Customer: start -> MockPass, or the page for the link's current state
  if ((p = m(/^\/gw\/l\/([^/]+)$/)) && req.method === "GET") {
    const link = linkFor(p[0]!);
    if (!link) return sendHtml(res, 404, messagePage("This link is no longer valid", "We could not find this Myinfo request. Please open the latest link from your email.", "bad"));
    if (link.status === "pending") return redirect(res, link.loginUrl);
    if (link.status === "retrieved") return redirect(res, `/gw/l/${link.linkId}/review`);
    return sendHtml(res, 200, statusPage(link));
  }

  // OAuth redirect back from MockPass
  if (path === "/gw/callback" && req.method === "GET") {
    const link = linkFor(url.searchParams.get("state") ?? "");
    if (!link) return sendHtml(res, 404, messagePage("This link is no longer valid", "This Myinfo session is unknown or has expired.", "bad"));
    if (link.status !== "pending") return redirect(res, `/gw/l/${link.linkId}`);
    try {
      const { outcome } = await mockpass.handleCallback(url.searchParams);
      if (outcome === "declined") {
        await complete(link, "declined");
        return redirect(res, `/gw/l/${link.linkId}`);
      }
      const r = await mockpass.getPerson(await mockpass.getToken(), link.linkId);
      if (r.kind !== "ok") throw new Error("Myinfo returned no data");
      link.person = r.person;
      link.status = "retrieved";
      mockpass.forget(link.linkId);
      log(`Myinfo retrieved for ${link.applicationRef}/${link.role}: ${r.person.uinfin}`);
      if (!SHOW_REVIEW) {
        await complete(link, "submitted");
        return redirect(res, `/gw/l/${link.linkId}`);
      }
      return redirect(res, `/gw/l/${link.linkId}/review`);
    } catch (e) {
      console.error("[gateway] callback", e);
      return sendHtml(res, 502, messagePage("Could not retrieve your Myinfo", `${esc(e instanceof Error ? e.message : "Myinfo error")}. <a href="/gw/l/${esc(link.linkId)}">Try again</a>`, "bad"));
    }
  }

  if ((p = m(/^\/gw\/l\/([^/]+)\/review$/)) && req.method === "GET") {
    const link = linkFor(p[0]!);
    if (!link) return redirect(res, `/gw/l/${encodeURIComponent(p[0]!)}`);
    if (link.status !== "retrieved") return redirect(res, `/gw/l/${link.linkId}`);
    return sendHtml(res, 200, reviewPage(link, url.searchParams.get("tab") ?? "personal"));
  }

  if ((p = m(/^\/gw\/l\/([^/]+)\/(submit|cancel)$/)) && req.method === "POST") {
    await readBody(req);
    const link = linkFor(p[0]!);
    if (link?.status === "retrieved") await complete(link, p[1] === "submit" ? "submitted" : "declined");
    return redirect(res, `/gw/l/${encodeURIComponent(p[0]!)}`);
  }

  throw new HttpError(404, "Not found");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    await handle(req, res, url);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("[gateway]", e);
    if (!res.headersSent) sendJson(res, status, { error: e instanceof Error ? e.message : "Error" });
    else res.end();
  }
});

await startMockPass();
server.listen(PORT, "0.0.0.0", () => log(`Mock ValueMax Myinfo gateway on :${PORT} (customer pages at ${PUBLIC_URL}/gw/…)`));
