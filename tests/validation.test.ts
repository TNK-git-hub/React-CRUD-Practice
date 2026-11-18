// Rules kept from the first test suite (D-43): NRIC / FIN, mobile number, application refs, distinct NRICs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidMobile, isValidNric, maskNric, nricMatches } from "../server/nric.ts";
import { PERSONAS } from "../server/personas.ts";
import { DEALER, applicationInput, harness } from "./helpers.ts";

test("NRIC/FIN checksum: test personas and S/T/F/G/M prefixes (D-12)", () => {
  for (const p of PERSONAS) assert.ok(isValidNric(p.uinfin), p.uinfin);
  assert.ok(isValidNric("S8812345Z"));
  assert.ok(isValidNric(" s8812345z ")); // trimmed + upper-cased
  assert.ok(!isValidNric("S8812345A"));
  assert.ok(!isValidNric("X1234567A"));
  assert.ok(!isValidNric("S881234Z"));
});

test("NRIC comparison is case-insensitive after trimming; masking keeps first and last characters (D-21, D-41)", () => {
  assert.ok(nricMatches(" f4440488p", "F4440488P "));
  assert.ok(!nricMatches("F4440488P", "F4440489M"));
  assert.equal(maskNric("S8812249H"), "S****249H");
});

test("mobile: 8 digits starting with 8 or 9 (D-13)", () => {
  assert.ok(isValidMobile("9123 4567"));
  assert.ok(isValidMobile("81234567"));
  assert.ok(!isValidMobile("61234567"));
  assert.ok(!isValidMobile("912345678"));
});

test("application refs start at VMAF-<year>-05121 (D-26)", async () => {
  const h = harness();
  assert.equal((await h.service.submitApplication(applicationInput(), DEALER)).ref, "VMAF-2026-05121");
  assert.equal((await h.service.submitApplication(applicationInput(), DEALER)).ref, "VMAF-2026-05122");
});

test("every person on an application needs a different NRIC (D-28); at most 2 guarantors", async () => {
  const h = harness();
  const same = applicationInput();
  same.guarantors![0]!.nric = "f4440488p";
  await assert.rejects(h.service.submitApplication(same, DEALER), /different NRIC/);
  const three = applicationInput();
  three.guarantors = [
    { name: "A", nric: "G4440425M", email: "a@example.com", mobile: "91234567" },
    { name: "B", nric: "G4440427W", email: "b@example.com", mobile: "91234567" },
    { name: "C", nric: "G4440430W", email: "c@example.com", mobile: "91234567" },
  ];
  await assert.rejects(h.service.submitApplication(three, DEALER), /At most 2 guarantors/);
  three.guarantors.pop();
  const app = await h.service.submitApplication(three, DEALER);
  assert.deepEqual(app.parties.map((p) => p.label), ["Hirer", "Guarantor 1", "Guarantor 2"]);
});

test("D-12 all 9 Singpass test personas pass the NRIC/FIN format and checksum, M-series included", () => {
  const personas = ["F4440488P", "F4440489M", "G4440425M", "G4440427W", "G4440430W", "G4440431T", "G4440432Q", "G4440433N", "M5004553J"];
  for (const nric of personas) assert.ok(isValidNric(nric), nric);
  // a wrong check letter fails for every prefix, including M
  for (const nric of personas) assert.ok(!isValidNric(nric.slice(0, 8) + (nric.endsWith("A") ? "B" : "A")), `${nric} with another check letter`);
  assert.ok(isValidNric("M5004553J"));
  assert.ok(!isValidNric("M5004553K"));
});
