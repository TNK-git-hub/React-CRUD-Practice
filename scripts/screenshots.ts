// Screenshots of every screen in its main states → docs/claude-code-demo/screens/ (npm run screens).
// Runs its own server in memory (no data/db.json, no SMTP) and drives it with Playwright.
import { mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { AdjustableClock } from "../server/clock.ts";
import { loadConfig } from "../server/config.ts";
import { renderEmail } from "../server/mail.ts";
import { PERSONAS } from "../server/personas.ts";
import { createRuntime } from "../server/runtime.ts";

const OUT = resolve(import.meta.dirname, "..", "docs", "claude-code-demo", "screens");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// a free port first, so that PUBLIC_BASE_URL (links in emails, gateway redirect) points at this server
const port = await new Promise<number>((done) => {
  const probe = createNetServer().listen(0, "127.0.0.1", () => {
    const p = (probe.address() as AddressInfo).port;
    probe.close(() => done(p));
  });
});
const BASE = `http://127.0.0.1:${port}`;
const rt = createRuntime({
  config: loadConfig({ PUBLIC_BASE_URL: BASE }),
  clock: new AdjustableClock(),
  dbFile: null,
  key: randomBytes(32),
  email: { send: async () => ({ delivered: false }) },
  smtpConfigured: false,
});
await new Promise<void>((r) => rt.server.listen(port, "127.0.0.1", r));

async function api<T = Record<string, unknown>>(method: string, path: string, cookie = "", body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
async function session(userId: string): Promise<string> {
  const res = await fetch(BASE + "/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

interface Party { id: string; label: string }
interface App { ref: string; parties: Party[] }
interface Message { channel: string; applicationRef: string; partyId: string; body: string }

const dealerCookie = await session("u-alex");
const opsCookie = await session("u-priya");

/** The portal path of the latest email to a party (relative to this server). */
async function portalPath(ref: string, partyId: string): Promise<string> {
  const outbox = await api<Message[]>("GET", "/api/demo/outbox", opsCookie);
  const m = outbox.find((x) => x.channel === "email" && x.applicationRef === ref && x.partyId === partyId)!;
  return new URL(/https?:\/\/\S+/.exec(m.body)![0]).pathname;
}
async function gatewayConsent(ref: string, partyId: string, uinfin: string): Promise<void> {
  const open = await api<{ redirectUrl: string }>("POST", `/api/verify/${(await portalPath(ref, partyId)).split("/").pop()}/open`);
  const linkId = new URL(open.redirectUrl).pathname.split("/").pop()!;
  await api("POST", `/gateway-api/${linkId}/login`, "", { uinfin });
  await api("POST", `/gateway-api/${linkId}/agree`);
  await api("POST", `/gateway-api/${linkId}/submit`);
}
const runJob = () => api("POST", "/api/demo/run-job", opsCookie);
const personaName = (nric: string) => PERSONAS.find((p) => p.uinfin === nric)!.name;
const submit = (hirer: string, guarantor: string) =>
  api<App>("POST", "/api/applications", dealerCookie, {
    hirer: { name: personaName(hirer), nric: hirer, email: "hirer@example.com", mobile: "91234567" },
    guarantors: [{ name: personaName(guarantor), nric: guarantor, email: "guarantor@example.com", mobile: "98765432" }],
    ltaCode: "A7K29Q",
  });

const browser: Browser = await chromium.launch();
async function signedIn(cookie: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: BASE }]);
  return ctx;
}
const dealer = await (await signedIn(dealerCookie)).newPage();
const ops = await (await signedIn(opsCookie)).newPage();
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();

async function shot(page: Page, name: string, waitFor?: string): Promise<void> {
  if (waitFor) await page.getByText(waitFor, { exact: false }).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  await page.waitForFunction(() => !document.querySelector("#toast.show"), undefined, { timeout: 5_000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log(`  ${name}.png`);
}
async function opsDetail(ref: string, name: string, waitFor: string, issue?: "AA"): Promise<void> {
  await ops.goto(`${BASE}/ops/applications/${ref}`);
  await ops.getByText("Singpass Status").waitFor();
  if (issue) await ops.selectOption("#newstatus", issue);
  await shot(ops, name, waitFor);
}

await api("POST", "/api/demo/seed", opsCookie);

// ---- dealer: Quick Apply → Review & Submit → Interest Received (screens 1–3) ----
await dealer.goto(`${BASE}/dealer/apply`);
await dealer.getByText("Fill sample").click();
await dealer.locator('[data-f="hirer.email"]').fill("hirer@example.com");
await dealer.locator('[data-f="guarantor.email"]').fill("guarantor@example.com");
await shot(dealer, "01-main-quick-apply", "Valid NRIC");
await dealer.getByText("Next: Documents").click();
await dealer.locator("#c1").check();
await dealer.locator("#c2").check();
await shot(dealer, "02-dealer-submit", "Send Singpass Request");
await dealer.getByText("Send Singpass Request").click();
await shot(dealer, "03-dealer-received", "Interest Received");
const mainRef = new URL(dealer.url()).pathname.split("/").pop()!;
const main = await api<App>("GET", `/api/applications/${mainRef}`, opsCookie);
const [hirer, guarantor] = main.parties as [Party, Party];

await dealer.goto(`${BASE}/dealer/applications/${mainRef}`);
await shot(dealer, "09a-dealer-status-pending", "Pending Singpass Verification");
await opsDetail(mainRef, "11a-ops-detail-pending", "Pending");

// ---- customer: email → portal → simulated gateway → done (screens 4–8) ----
const email = renderEmail({ to: "hirer@example.com", name: "HENG SHI ZHENG", role: "hirer", ref: mainRef, dealer: "Demo Motors Pte Ltd", url: BASE + (await portalPath(mainRef, hirer.id)), expiresAt: Date.now() + 72 * 3_600_000, ttlHours: 72 });
await phone.setContent(email.html);
await shot(phone, "04-customer-email", "Verify with Singpass");
await phone.goto(BASE + (await portalPath(mainRef, hirer.id)));
await shot(phone, "05a-customer-linkcheck", "Link valid");
await phone.getByText("Continue to Singpass").click();
await shot(phone, "06a-customer-gateway-retrieve", "Retrieve Myinfo with Singpass");
await phone.locator("#retrieve").click();
await shot(phone, "06b-customer-singpass-login", "Log in with Singpass");
await phone.locator('[data-nric="F4440488P"]').click();
await shot(phone, "07-customer-consent", "I agree");
await phone.locator("#agree").click();
await shot(phone, "08a-customer-review", "Submit Application");
await phone.locator("#submit").click();
await shot(phone, "08b-customer-done", "Details shared");
await runJob();

await dealer.goto(`${BASE}/dealer/applications/${mainRef}`);
await shot(dealer, "09b-dealer-status-hirer-fulfilled", "Fulfilled");
await opsDetail(mainRef, "11b-ops-detail-aa-locked", "Cannot issue AA yet", "AA");

// ---- NRIC mismatch ----
const mm = await submit("G4440427W", "G4440430W");
await gatewayConsent(mm.ref, mm.parties[0]!.id, "G4440431T");
await runJob();
await dealer.goto(`${BASE}/dealer/applications/${mm.ref}`);
await shot(dealer, "09c-dealer-status-nric-mismatch", "NRIC mismatch");
await opsDetail(mm.ref, "11c-ops-detail-nric-mismatch", "NRIC mismatch");

// ---- old link: blocked at the portal; data on the old LinkId rejected ----
const old = await submit("G4440432Q", "G4440433N");
const oldPath = await portalPath(old.ref, old.parties[0]!.id);
const oldOpen = await api<{ redirectUrl: string }>("POST", `/api/verify/${oldPath.split("/").pop()}/open`);
await api("POST", `/api/applications/${old.ref}/parties/${old.parties[0]!.id}/resend`, opsCookie, { reason: "Customer did not receive the email" });
const oldLinkId = new URL(oldOpen.redirectUrl).pathname.split("/").pop()!;
await api("POST", `/gateway-api/${oldLinkId}/login`, "", { uinfin: "G4440432Q" });
await api("POST", `/gateway-api/${oldLinkId}/agree`);
await api("POST", `/gateway-api/${oldLinkId}/submit`);
await runJob();
await phone.goto(BASE + oldPath);
await shot(phone, "05b-customer-linkcheck-blocked", "no longer valid");
await opsDetail(old.ref, "11d-ops-detail-old-link-rejected", "Result rejected");

// ---- AA issued on the main application ----
await gatewayConsent(mainRef, guarantor.id, "G4440425M");
await runJob();
await ops.goto(`${BASE}/ops/applications/${mainRef}`);
await ops.getByText("Singpass Status").waitFor();
await ops.selectOption("#newstatus", "AA");
await ops.getByText("Ready to issue AA").waitFor();
await ops.locator("#apply").click();
await ops.getByText("AA issued by").waitFor();
await shot(ops, "11f-ops-detail-aa-issued", "Approved — AA");
await dealer.goto(`${BASE}/dealer/applications/${mainRef}`);
await shot(dealer, "09e-dealer-status-aa-issued", "Approval Advice issued");

await ops.goto(`${BASE}/ops`);
await shot(ops, "10-ops-list", "Ops — All Applications");

// ---- expired: clock +73 h ----
const exp = await submit("M5004553J", "F4440489M");
await api("POST", "/api/demo/clock", opsCookie, { advanceHours: 73 });
await runJob();
await dealer.goto(`${BASE}/dealer/applications/${exp.ref}`);
await shot(dealer, "09d-dealer-status-expired", "Link expired");
await opsDetail(exp.ref, "11e-ops-detail-expired", "Expired");
await ops.goto(`${BASE}/ops/expired`);
await shot(ops, "12-ops-expired-links", "Expired Singpass links");
await ops.goto(`${BASE}/demo`);
await shot(ops, "13-demo-control", "Demo time: +73 h");

await browser.close();
await rt.close();
console.log(`Screenshots in ${OUT}`);
