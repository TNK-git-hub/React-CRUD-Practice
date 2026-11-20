// Quick Apply (UI-04): the name fields are comboboxes over the Singpass test personas (D-61); the form's action bar is
// a normal row under the form, not stuck to the window (D-63); the menu shows two groups (D-62).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function freshForm(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: /Alex Tan/ }).click();
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/dealer/apply");
  await expect(page.getByText("Section A — Applicant Details")).toBeVisible();
}
const nameBox = (page: Page, who = "hirer") => page.locator(`[data-f="${who}.name"]`);
const nricBox = (page: Page, who = "hirer") => page.locator(`[data-f="${who}.nric"]`);
const listOf = (page: Page, who = "hirer") => page.locator(`#lb-${who}`);

test("D-61 focusing the name opens the persona list; picking one fills name + NRIC only", async ({ page }) => {
  await freshForm(page);
  await page.locator('[data-f="hirer.email"]').fill("me@example.com");
  await page.locator('[data-f="hirer.mobile"]').fill("91234567");
  const box = nameBox(page);
  await expect(box).toHaveAttribute("role", "combobox");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await box.click();
  await expect(box).toHaveAttribute("aria-expanded", "true");
  const list = listOf(page);
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("role", "listbox");
  await expect(list.getByText("Singpass test personas")).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(9);
  await expect(list.getByRole("option").first()).toHaveText("HENG SHI ZHENG · F4440488P");

  await list.getByRole("option", { name: "WANG XIAO LING · F4440489M" }).click();
  await expect(box).toHaveValue("WANG XIAO LING");
  await expect(nricBox(page)).toHaveValue("F4440489M");
  await expect(page.locator("#h-hirer-nric")).toHaveText("Valid NRIC / FIN");
  await expect(list).toBeHidden();
  await expect(page.locator('[data-f="hirer.email"]')).toHaveValue("me@example.com");
  await expect(page.locator('[data-f="hirer.mobile"]')).toHaveValue("9123 4567"); // formatted when leaving the field, not changed by the pick

  // the NRIC can still be edited by hand afterwards
  await nricBox(page).fill("F4440488P");
  await expect(nricBox(page)).toHaveValue("F4440488P");
  await expect(box).toHaveValue("WANG XIAO LING");
});

test("D-61 typing filters by name or NRIC; a free name is kept and the NRIC is left alone", async ({ page }) => {
  await freshForm(page);
  await nricBox(page).fill("S1234567D");
  const box = nameBox(page);
  const options = listOf(page).getByRole("option");
  await box.fill("kumar");
  await expect(options).toHaveText(["RAJESH KUMAR S/O MURUGAN · G4440425M"]);
  await box.fill("G444043");
  await expect(options).toHaveCount(4);
  await box.fill("John Doe");
  await expect(options).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(listOf(page)).toBeHidden();
  await expect(box).toHaveValue("JOHN DOE");
  await expect(nricBox(page)).toHaveValue("S1234567D");
});

test("D-61 keyboard: ↓ / ↑ move, Enter picks, Esc closes, a click outside closes", async ({ page }) => {
  await freshForm(page);
  const box = nameBox(page);
  await box.focus();
  await expect(listOf(page)).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  const active = await box.getAttribute("aria-activedescendant");
  await expect(page.locator(`#${active}`)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("WANG XIAO LING");
  await expect(nricBox(page)).toHaveValue("F4440489M");
  await expect(listOf(page)).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await expect(listOf(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(listOf(page)).toBeHidden();
  await box.click();
  await expect(listOf(page)).toBeVisible();
  await page.getByText("Section A — Applicant Details").click();
  await expect(listOf(page)).toBeHidden();
});

test("D-61 a persona already used for another person in the application cannot be picked (D-28)", async ({ page }) => {
  await freshForm(page);
  await nameBox(page).click();
  await listOf(page).getByRole("option", { name: /HENG SHI ZHENG/ }).click();
  await page.locator("#gtoggle").click();
  await nameBox(page, "guarantor").click();
  const used = listOf(page, "guarantor").getByRole("option", { name: /HENG SHI ZHENG/ });
  await expect(used).toHaveAttribute("aria-disabled", "true");
  await used.click({ force: true });
  await expect(nameBox(page, "guarantor")).toHaveValue("");
  await expect(nricBox(page, "guarantor")).toHaveValue("");
  await listOf(page, "guarantor").getByRole("option", { name: /RAJESH KUMAR/ }).click();
  await expect(nricBox(page, "guarantor")).toHaveValue("G4440425M");
});

test("D-61 the dropdown arrow shows only on hover or while the list is open", async ({ page }) => {
  await freshForm(page);
  const caret = page.locator('[data-caret="hirer"]');
  await expect(caret).toBeHidden();
  await nameBox(page).hover();
  await expect(caret).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(caret).toBeHidden();
  await nameBox(page).focus();
  await page.mouse.move(5, 5);
  await expect(caret).toBeVisible(); // list open
});

test("D-61 'Fill sample' fills every visible person's name and matching NRIC, also a second guarantor", async ({ page }) => {
  await freshForm(page);
  await page.locator("#gtoggle").click();
  await page.locator("#g2toggle").click();
  await page.getByRole("button", { name: "Fill sample (test personas)" }).click();
  for (const [who, name, nric] of [["hirer", "HENG SHI ZHENG", "F4440488P"], ["guarantor", "RAJESH KUMAR S/O MURUGAN", "G4440425M"], ["guarantor2", "MARIA SANTOS REYES", "G4440427W"]] as const) {
    await expect(nameBox(page, who)).toHaveValue(name);
    await expect(nricBox(page, who)).toHaveValue(nric);
  }
});

for (const width of [1280, 1440])
test(`D-63 the action bar is a normal row under the form: out of view at the top, reachable at the bottom (2 guarantors, ${width} px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await freshForm(page);
  await page.locator("#gtoggle").click();
  await page.locator("#g2toggle").click();
  await page.getByRole("button", { name: "Fill sample (test personas)" }).click();
  for (const who of ["hirer", "guarantor", "guarantor2"]) await page.locator(`[data-f="${who}.email"]`).fill(`${who}@example.com`);
  await page.evaluate(() => window.scrollTo(0, 0));
  const bar = page.locator(".actionbar");
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  await expect(bar).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(bar).toBeInViewport();
  await page.getByRole("button", { name: /Next: Documents/ }).click();

  // Review & Submit: same
  await expect(page.getByText("Dealer Declaration")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".actionbar")).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".actionbar")).toBeInViewport();
  for (const id of ["c1", "c2", "c3"]) await page.locator(`#${id}`).check();
  await expect(page.getByRole("button", { name: /Send Singpass Request/ })).toBeEnabled();
});

test("D-62 the menu has two labelled groups, FINANCE and SUPPORT, separated by a line", async ({ page }) => {
  await freshForm(page);
  const groups = page.getByRole("navigation").getByRole("group");
  await expect(groups).toHaveCount(2);
  await expect(page.getByRole("group", { name: "FINANCE" })).toBeVisible();
  await expect(page.getByRole("group", { name: "SUPPORT" })).toBeVisible();
  const border = await page.getByRole("group", { name: "SUPPORT" }).evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(border).toBe("1px");
});
