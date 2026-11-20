// Demo buttons and the Ops list (2026-11-20): "Demo: see …" buttons always open the SAME application in the other
// role (D-50 changed); sample shortcuts live in Demo Control; the Ops list has search and filters (UI-15).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

interface Message { channel: string; applicationRef: string; partyId: string; body: string }
interface Party { id: string; role: string }

async function signIn(page: Page, who: RegExp): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: who }).click();
}
const application = {
  hirer: { name: "HENG SHI ZHENG", nric: "F4440488P", email: "hirer@example.com", mobile: "91234567" },
  guarantors: [{ name: "RAJESH KUMAR S/O MURUGAN", nric: "G4440425M", email: "guarantor@example.com", mobile: "98765432" }],
  ltaCode: "A7K29Q",
};

test("the 'Demo: see …' buttons open the same application in the other role, never a sample", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, /Alex Tan/);
  await page.request.post("/api/demo/reset");
  await page.request.post("/api/demo/seed"); // samples exist, so a wrong jump to VMAF-2026-05117 would be possible
  const ref = ((await (await page.request.post("/api/applications", { data: application })).json()) as { ref: string }).ref;

  // dealer detail of X → Ops view of X
  await page.goto(`/dealer/applications/${ref}`);
  await page.getByRole("button", { name: /Demo: see the Ops view/ }).click();
  await expect(page).toHaveURL(new RegExp(`/ops/applications/${ref}$`));
  await expect(page.getByText("Singpass Status")).toBeVisible();
  await expect(page.locator(".detail-head .ref-badge")).toHaveText(ref);
  await expect(page.getByText(/Priya Nair/).first()).toBeVisible();

  // Ops detail of X → dealer view of X
  await page.getByRole("button", { name: /Demo: see the dealer's view/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dealer/applications/${ref}$`));
  await expect(page.getByText("Pending Singpass Verification")).toBeVisible();
  await expect(page.getByText(new RegExp(`${ref} · Submitted`))).toBeVisible();

  // an application of another dealer: the Ops page has no dealer's-view button
  await page.getByRole("button", { name: /Demo: see the Ops view/ }).click();
  await expect(page).toHaveURL(new RegExp(`/ops/applications/${ref}$`));
  await page.goto("/ops/applications/VMAF-2026-05116");
  await expect(page.getByText("Singpass Status")).toBeVisible();
  await expect(page.getByRole("button", { name: /Demo: see the dealer's view/ })).toHaveCount(0);
  await expect(page.getByText(/Open sample/)).toHaveCount(0);

  // Interest Received → this application's hirer link (new tab)
  await page.request.post("/api/session", { data: { userId: "u-alex" } }); // back to the dealer (already signed in)
  const parties = ((await (await page.request.get(`/api/applications/${ref}`)).json()) as { parties: Party[] }).parties;
  const outbox = (await (await page.request.get("/api/demo/outbox")).json()) as Message[];
  const hirerId = parties.find((p) => p.role === "hirer")!.id;
  const hirerLink = /https?:\/\/\S+/.exec(outbox.find((m) => m.channel === "email" && m.partyId === hirerId)!.body)![0];
  await page.goto(`/dealer/received/${ref}`);
  const [tab] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: /Demo: see what the hirer gets/ }).click()]);
  await expect(tab).toHaveURL(new URL(hirerLink).pathname);
  await expect(tab.getByText(ref)).toBeVisible();

  // customer Done page → the dealer's view of this application
  await tab.getByRole("link", { name: /Continue to Singpass/ }).click();
  await tab.getByRole("button", { name: "Retrieve Myinfo with Singpass" }).click();
  await tab.locator('[data-nric="F4440488P"]').click();
  await tab.getByRole("button", { name: /I agree/ }).click();
  await tab.getByRole("button", { name: "Submit Application" }).click();
  await tab.getByRole("button", { name: /Demo: see the dealer's view/ }).click();
  await expect(tab).toHaveURL(new RegExp(`/dealer/applications/${ref}$`));
});

test("Demo Control: sample shortcuts name their state and ref, and open that sample", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, /Alex Tan/);
  await page.request.post("/api/demo/reset");
  await page.goto("/demo");
  // D-59: no sample yet → every "Open sample" is disabled, with the hint; nothing is created by looking
  const samples = page.locator(".samples button");
  await expect(samples).toHaveCount(3);
  for (const b of await samples.all()) await expect(b).toBeDisabled();
  await expect(page.getByText("Create sample applications first")).toHaveCount(3);
  await page.getByRole("button", { name: "Create sample applications" }).click();
  await page.getByRole("button", { name: "Open sample: IPA issued, guarantor pending (VMAF-2026-05117)" }).click();
  await expect(page).toHaveURL(/\/ops\/applications\/VMAF-2026-05117$/);
  await expect(page.getByText("Singpass Status")).toBeVisible();

  await page.goto("/demo");
  await page.getByRole("button", { name: "Open sample: hirer fulfilled, guarantor pending (VMAF-2026-05117)" }).click();
  await expect(page).toHaveURL(/\/dealer\/applications\/VMAF-2026-05117$/);
  await expect(page.getByText("Still awaiting the guarantor's Singpass approval", { exact: false })).toBeVisible();
});

test("Ops list: search (name, plate, ref, exact NRIC) and the two filters", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, /Priya Nair/);
  await page.request.post("/api/demo/reset");
  await page.request.post("/api/demo/seed");
  await page.goto("/ops");
  const refs = page.locator("table.list-ops tbody td.ref");
  await expect(refs).toHaveCount(6);
  await expect(page.getByRole("columnheader", { name: "APPLICATION DATE" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: /Search/ });
  await search.fill("aisha");
  await expect(refs).toHaveText(["VMAF-2026-05117"]);
  await search.fill("SMB2290X");
  await expect(refs).toHaveText(["VMAF-2026-05118"]);
  await search.fill("G4440432");
  await expect(refs).toHaveCount(0);
  await search.fill("G4440432Q");
  await expect(refs).toHaveText(["VMAF-2026-05117"]);
  await expect(page.locator("table.list-ops")).not.toContainText("G4440432Q");
  await search.fill("");
  await expect(refs).toHaveCount(6);

  await page.getByLabel("Singpass Fulfilled?").selectOption("yes");
  await expect(refs).toHaveText(["VMAF-2026-05116", "VMAF-2026-05115", "VMAF-2026-05114"]);
  await page.getByLabel("Filter by status:").selectOption("Approved — AA");
  await expect(refs).toHaveText(["VMAF-2026-05115"]);
  await page.getByLabel("Singpass Fulfilled?").selectOption("no");
  await expect(refs).toHaveCount(0);
  await expect(page.getByText("No application matches")).toBeVisible();

  // the filters survive a live refresh and a reload (kept in the address)
  await page.getByLabel("Singpass Fulfilled?").selectOption("all");
  await page.reload();
  await expect(page.getByLabel("Filter by status:")).toHaveValue("Approved — AA");
  await expect(refs).toHaveText(["VMAF-2026-05115"]);
});

test("D-59 demo buttons never create sample applications: reset → one application → back and forth → one row", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, /Alex Tan/);
  await page.request.post("/api/demo/reset");
  const ref = ((await (await page.request.post("/api/applications", { data: application })).json()) as { ref: string }).ref;
  const outboxSize = async () => ((await (await page.request.get("/api/demo/outbox")).json()) as Message[]).length;
  const sent = await outboxSize();

  for (let i = 0; i < 3; i++) {
    await page.goto(`/dealer/applications/${ref}`);
    await page.getByRole("button", { name: /Demo: see the Ops view/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ops/applications/${ref}$`));
    await expect(page.getByText("Singpass Status")).toBeVisible();
    await page.getByRole("button", { name: /Demo: see the dealer's view/ }).click();
    await expect(page).toHaveURL(new RegExp(`/dealer/applications/${ref}$`));
    await expect(page.getByText("Pending Singpass Verification")).toBeVisible();
    await page.goto(`/dealer/received/${ref}`);
    const [tab] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: /Demo: see what the hirer gets/ }).click()]);
    await expect(tab).toHaveURL(/\/verify\//);
    await expect(tab.getByText(ref)).toBeVisible();
    await tab.close();
  }
  await page.goto("/demo");
  await expect(page.getByText("Create sample applications first")).toHaveCount(3);

  await page.request.post("/api/session", { data: { userId: "u-priya" } });
  await page.goto("/ops");
  await expect(page.locator("table.list-ops tbody td.ref")).toHaveText([ref]);
  expect(await outboxSize()).toBe(sent);
  const activity = ((await (await page.request.get(`/api/applications/${ref}`)).json()) as { activity: Array<{ text: string }> }).activity;
  expect(activity.filter((e) => e.text === "Customer opened the link")).toHaveLength(1);
});

test("D-59 'see what the hirer gets' opens nothing when the hirer has no current link, and says so", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, /Alex Tan/);
  await page.request.post("/api/demo/reset");
  await page.request.post("/api/demo/gateway", { data: { available: false } }); // the link stays QUEUED
  const ref = ((await (await page.request.post("/api/applications", { data: application })).json()) as { ref: string }).ref;
  await page.goto(`/dealer/received/${ref}`);
  let opened = false;
  page.context().on("page", () => (opened = true));
  await page.getByRole("button", { name: /Demo: see what the hirer gets/ }).click();
  await expect(page.locator("#toast")).toContainText("no link to open");
  expect(opened).toBe(false);
  await page.request.post("/api/demo/gateway", { data: { available: true } });
});
