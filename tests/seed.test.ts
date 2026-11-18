// D-29: Demo Control "Create sample applications".
import { test } from "node:test";
import assert from "node:assert/strict";
import { decrypt } from "../server/crypto.ts";
import { PERSONAS } from "../server/personas.ts";
import type { MyinfoPerson } from "../server/personas.ts";
import { currentLink } from "../server/verification/model.ts";
import { harness } from "./helpers.ts";

const REFS = ["VMAF-2026-05114", "VMAF-2026-05115", "VMAF-2026-05116", "VMAF-2026-05117", "VMAF-2026-05118", "VMAF-2026-05119"];

test("D-29 sample applications: the six Ops-list rows with their stages and Singpass statuses", () => {
  const h = harness();
  assert.equal(h.service.seedSamples(), 6);
  assert.deepEqual(h.db.applications.map((a) => a.ref).sort(), REFS);
  const byRef = (ref: string) => h.db.applications.find((a) => a.ref === ref)!;
  assert.deepEqual(REFS.map((r) => byRef(r).stage), ["Declined", "AA", "Submitted", "IPA", "Submitted", "Submitted"]);
  assert.deepEqual(byRef("VMAF-2026-05118").parties.map((p) => currentLink(p).status), ["FULFILLED", "EXPIRED"]);
  assert.deepEqual(byRef("VMAF-2026-05119").parties.map((p) => currentLink(p).status), ["SENT"]);
  for (const app of h.db.applications)
    for (const p of app.parties) {
      if (currentLink(p).status !== "FULFILLED") continue;
      const person = decrypt<MyinfoPerson>(h.key, p.myinfoSealed!);
      assert.equal(person.uinfin, p.nric, "stored Myinfo data belongs to the party");
      assert.equal(person.name, p.name);
    }
});

test("D-29 running it again creates no duplicates", () => {
  const h = harness();
  h.service.seedSamples();
  assert.equal(h.service.seedSamples(), 0);
  assert.equal(h.db.applications.length, 6);
});

test("D-29 sample data only uses the Singpass test personas' NRICs", () => {
  const h = harness();
  h.service.seedSamples();
  const allowed = new Set(PERSONAS.map((p) => p.uinfin));
  const nrics = h.db.applications.flatMap((a) => a.parties.map((p) => p.nric));
  assert.equal(nrics.length, 8);
  for (const nric of nrics) assert.ok(allowed.has(nric), `${nric} is not a test persona`);
  const json = JSON.stringify(h.db.applications);
  for (const m of json.matchAll(/[STFGM]\d{7}[A-Z]/g)) assert.ok(allowed.has(m[0]), `${m[0]} found in sample data`);
});
