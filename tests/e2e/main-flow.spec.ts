// The main demo script (D-36): the dealer submits; both links are opened from the outbox on a phone; each person
// consents with the right persona; the dealer and Ops screens change by themselves; the AA unlocks and is issued.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

interface Message { channel: string; applicationRef: string; partyId: string; body: string }
interface Party { id: string; role: string }

async function signIn(page: Page, who: RegExp): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: who }).click();
}

test("main demo: submit → open both links from the outbox → consent → statuses update live → AA unlocks", async ({ browser }) => {
  // ---- dealer (laptop) ----
  const dealer = await (await browser.newContext()).newPage();
  await signIn(dealer, /Alex Tan/);
  await dealer.request.post("/api/demo/reset");
  await dealer.goto("/dealer/apply");
  await dealer.getByRole("button", { name: "Fill sample (test personas)" }).click();
  await dealer.locator('[data-f="hirer.email"]').fill("hirer@example.com");
  await dealer.locator('[data-f="guarantor.email"]').fill("guarantor@example.com");
  await dealer.getByRole("button", { name: /Next: Documents/ }).click();
  const send = dealer.getByRole("button", { name: /Send Singpass Request/ });
  await expect(send).toBeDisabled();
  await dealer.locator("#c1").check();
  await dealer.locator("#c2").check();
  await send.click();
  await expect(dealer.getByRole("heading", { name: "Interest Received" })).toBeVisible();
  const ref = new URL(dealer.url()).pathname.split("/").pop()!;
  await dealer.getByRole("link", { name: "View Application Status" }).click();
  await expect(dealer.getByText("Hirer · Pending")).toBeVisible();
  await dealer.evaluate(() => ((window as unknown as { noReload: boolean }).noReload = true));

  // ---- Ops (second laptop tab): AA locked while Singpass is pending ----
  const ops = await (await browser.newContext()).newPage();
  await signIn(ops, /Priya Nair/);
  await ops.goto(`/ops/applications/${ref}`);
  await ops.selectOption("#newstatus", "AA");
  await expect(ops.getByText("Cannot issue AA yet")).toBeVisible();
  await expect(ops.locator("#apply")).toBeDisabled();

  // ---- the two links, from the outbox ----
  const parties = ((await (await dealer.request.get(`/api/applications/${ref}`)).json()) as { parties: Party[] }).parties;
  const outbox = (await (await dealer.request.get("/api/demo/outbox")).json()) as Message[];
  const linkOf = (role: string) => {
    const party = parties.find((p) => p.role === role)!;
    const email = outbox.find((m) => m.channel === "email" && m.applicationRef === ref && m.partyId === party.id)!;
    return /https?:\/\/\S+/.exec(email.body)![0];
  };
  const sms = outbox.filter((m) => m.channel === "sms" && m.applicationRef === ref);
  expect(sms).toHaveLength(2);
  for (const m of sms) expect(m.body).not.toMatch(/https?:\/\//);

  // ---- each person on a phone ----
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  for (const [role, persona, chip] of [
    ["hirer", "F4440488P", "Hirer · Fulfilled"],
    ["guarantor", "G4440425M", "Guarantor · Fulfilled"],
  ] as const) {
    await phone.goto(linkOf(role));
    await expect(phone.getByText("Link valid")).toBeVisible();
    await phone.getByRole("link", { name: /Continue to Singpass/ }).click();
    await expect(phone.getByText("SIMULATED GATEWAY")).toBeVisible();
    await phone.getByRole("button", { name: "Retrieve Myinfo with Singpass" }).click();
    await phone.locator(`[data-nric="${persona}"]`).click();
    await phone.getByRole("button", { name: /I agree/ }).click();
    await phone.getByRole("button", { name: "Submit Application" }).click();
    await expect(phone.getByRole("heading", { name: "Details shared" })).toBeVisible();

    // the dealer's screen changes by itself (auto-verify job + SSE), no reload
    await expect(dealer.getByText(chip)).toBeVisible({ timeout: 10_000 });
    expect(await dealer.evaluate(() => (window as unknown as { noReload?: boolean }).noReload)).toBe(true);
  }

  // ---- Ops: the AA unlocks by itself and is issued ----
  await expect(ops.getByText("Ready to issue AA")).toBeVisible({ timeout: 10_000 });
  await ops.locator("#apply").click();
  await expect(ops.getByText(/AA issued by Priya Nair/)).toBeVisible();
  await expect(dealer.getByText(/Approval Advice issued/)).toBeVisible({ timeout: 10_000 });
});
