// Screenshots of every screen in its main states → docs/claude-code-demo/screens/ (npm run screens).
// Runs its own server in memory (no data/db.json, no SMTP) and drives it with Playwright.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
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
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".png")) rmSync(join(OUT, f)); // keep README.md

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

// Full-page screenshots: bars that stick to the bottom of the window (customer consent / review) would be drawn in the
// middle of a full-page image, so they are put back in the flow for the capture only (the app is unchanged). The dealer
// form's action bar is not sticky (D-63).
const STATIC_BARS = ".gw-actions { position: static !important; }";

async function shot(page: Page, name: string, waitFor?: string): Promise<void> {
  if (waitFor) await page.getByText(waitFor, { exact: false }).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  // wait until any toast has fully faded out (not only lost its "show" class)
  await page
    .waitForFunction(() => {
      const t = document.querySelector("#toast");
      return !t || (!t.classList.contains("show") && getComputedStyle(t).opacity === "0");
    }, undefined, { timeout: 6_000 })
    .catch(() => {});
  const tag = await page.addStyleTag({ content: STATIC_BARS });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  await tag.evaluate((el) => (el as Element).remove());
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
// D-61: the name combobox — arrow on hover; the open list (the hirer's persona is shown as used)
{
  const card = (await dealer.locator(".form-card").boundingBox())!;
  await dealer.locator('[data-f="hirer.name"]').hover();
  await dealer.waitForTimeout(150);
  await dealer.screenshot({ path: join(OUT, "15b-name-field-hover.png"), clip: { x: card.x, y: card.y, width: card.width, height: 200 } });
  console.log("  15b-name-field-hover.png");
  await dealer.evaluate(() => { document.querySelector('[data-combo="guarantor"]')!.scrollIntoView({ block: "start" }); window.scrollBy(0, -120); });
  await dealer.locator('[data-f="guarantor.name"]').click();
  await dealer.locator("#lb-guarantor").waitFor();
  const box = (await dealer.locator('[data-combo="guarantor"]').boundingBox())!;
  const list = (await dealer.locator("#lb-guarantor").boundingBox())!;
  await dealer.screenshot({ path: join(OUT, "15a-combobox-open.png"), clip: { x: card.x, y: box.y - 60, width: card.width, height: list.y + list.height - box.y + 80 } });
  console.log("  15a-combobox-open.png");
  await dealer.keyboard.press("Escape");
  await dealer.mouse.move(5, 5);
}
// D-63: same window as before-combobox/quick-apply-top-1280.png: the form buttons no longer cover the form
{
  await dealer.setViewportSize({ width: 1280, height: 800 });
  await dealer.evaluate(() => window.scrollTo(0, 0));
  await dealer.waitForTimeout(150);
  await dealer.screenshot({ path: join(OUT, "16-quick-apply-top-1280.png") });
  console.log("  16-quick-apply-top-1280.png");
  await dealer.setViewportSize({ width: 1280, height: 900 });
}
await dealer.getByText("Next: Documents").click();
await dealer.locator("#c1").check();
await dealer.locator("#c2").check();
await dealer.locator("#c3").check();
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

// ---- IPA, then AA, on the main application (Change Status on the Ops page) ----
await ops.goto(`${BASE}/ops/applications/${mainRef}`);
await ops.getByText("Singpass Status").waitFor();
await ops.locator("#apply").click();
await ops.getByText("IPA issued by").waitFor();
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
await shot(dealer, "09e-dealer-status-aa-issued", "Approval Advice (final approval) issued");
// sample applications: IPA issued with the guarantor still pending; declined
await dealer.goto(`${BASE}/dealer/applications/VMAF-2026-05117`);
await shot(dealer, "09f-dealer-status-ipa-guarantor-pending", "Still awaiting the guarantor");
await dealer.goto(`${BASE}/dealer/applications/VMAF-2026-05114`);
await shot(dealer, "09g-dealer-status-declined", "unable to proceed");

await ops.goto(`${BASE}/ops`);
await shot(ops, "10-ops-list", "Ops — All Applications");
await ops.goto(`${BASE}/ops?singpass=no&status=Pending`);
await ops.locator("table.list-ops tbody td.ref").first().waitFor();
await shot(ops, "10b-ops-list-filtered", "Ops — All Applications");
await ops.goto(`${BASE}/ops?q=G4440432Q`);
await ops.getByText("VMAF-2026-05117").first().waitFor();
await shot(ops, "10c-ops-list-search-nric", "VMAF-2026-05117");

// ---- the design's "Demo: see …" shortcuts land on a sample in the right state (D-50) ----
async function expectUrl(page: Page, pattern: RegExp, what: string): Promise<void> {
  await page.waitForURL(pattern, { timeout: 10_000 }).catch(() => {
    throw new Error(`${what}: landed on ${page.url()}`);
  });
}
// "Demo: see …" buttons open the SAME application in the other role; samples are opened from Demo Control (D-50)
const shortcutPage = await (await signedIn(dealerCookie)).newPage();
await shortcutPage.goto(`${BASE}/dealer/received/${mainRef}`);
await shortcutPage.getByText("Demo: see what the hirer gets").click(); // the hirer has already shared: nothing opens (D-59)
await shortcutPage.locator("#toast").getByText("no link to open", { exact: false }).waitFor();
await shortcutPage.goto(`${BASE}/dealer/applications/${mainRef}`);
await shortcutPage.getByText("Demo: see the Ops view").click();
await expectUrl(shortcutPage, new RegExp(`/ops/applications/${mainRef}$`), "ops view");
await shortcutPage.getByText("Singpass Status").waitFor();
await shortcutPage.getByText("Demo: see the dealer's view").click();
await expectUrl(shortcutPage, new RegExp(`/dealer/applications/${mainRef}$`), "dealer view");
const log = await api<{ gatewayLog: Array<{ linkId: string; applicationRef: string; event: string }> }>("GET", "/api/demo/state", opsCookie);
const doneLinkId = log.gatewayLog.find((g) => g.applicationRef === mainRef && g.event === "submitted")!.linkId;
const donePage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await donePage.goto(`${BASE}/gateway/${doneLinkId}`);
await donePage.getByText("Demo: see the dealer's view").click();
await expectUrl(donePage, new RegExp(`/dealer/applications/${mainRef}$`), "dealer view from the customer's Done page");
await shortcutPage.goto(`${BASE}/demo`);
await shortcutPage.getByText("Open sample: IPA issued, guarantor pending (VMAF-2026-05117)").click();
await expectUrl(shortcutPage, /\/ops\/applications\/VMAF-2026-05117$/, "Demo Control sample shortcut");
await shortcutPage.getByText("Singpass Status").waitFor();
console.log("  demo buttons (same application) and Demo Control sample shortcuts checked");

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

await api("POST", "/api/demo/clock/reset", opsCookie); // the menu shots without the "Demo time" bar
// ---- left menu (dealer and Ops), 1280 and 1440 px: the current item is a full-width band (GAP_REPORT §9) ----
for (const width of [1280, 1440]) {
  for (const [cookie, path, name] of [[dealerCookie, "/dealer/applications", "dealer"], [opsCookie, "/ops", "ops"]] as const) {
    const c = await browser.newContext({ viewport: { width, height: 520 } });
    const [k, v] = cookie.split("=");
    await c.addCookies([{ name: k!, value: v!, url: BASE }]);
    const p = await c.newPage();
    await p.goto(BASE + path);
    await p.getByRole("navigation").getByText("Application").waitFor();
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(OUT, `14-menu-${name}-${width}.png`) });
    console.log(`  14-menu-${name}-${width}.png`);
    await c.close();
  }
}

await browser.close();
await rt.close();
console.log(`Screenshots in ${OUT}`);
