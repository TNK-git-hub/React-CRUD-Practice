// D-29: Demo Control "Create sample applications".
import { test } from "node:test";
import assert from "node:assert/strict";
import { decrypt } from "../server/crypto.ts";
import { PERSONAS } from "../server/personas.ts";
import type { MyinfoPerson } from "../server/personas.ts";
import { currentLink } from "../server/verification/model.ts";
import { harness } from "./helpers.ts";

const REFS = ["VMAF-2026-05114", "VMAF-2026-05115", "VMAF-2026-05116", "VMAF-2026-05117", "VMAF-2026-05118", "VMAF-2026-05119"];

test("D-29 sample applications: the six Ops-list rows with their stages and Singpass statuses", async () => {
  const h = harness();
  assert.equal(await h.service.seedSamples(), 6);
  assert.deepEqual(h.db.applications.map((a) => a.ref).sort(), REFS);
  const byRef = (ref: string) => h.db.applications.find((a) => a.ref === ref)!;
  assert.deepEqual(REFS.map((r) => byRef(r).stage), ["Declined", "AA", "Submitted", "IPA", "Submitted", "Submitted"]);
  assert.deepEqual(byRef("VMAF-2026-05118").parties.map((p) => currentLink(p).status), ["FULFILLED", "EXPIRED"]);
  assert.deepEqual(byRef("VMAF-2026-05119").parties.map((p) => currentLink(p).status), ["SENT"]);
  assert.deepEqual(byRef("VMAF-2026-05117").parties.map((p) => currentLink(p).status), ["FULFILLED", "SENT"]);
  // a SENT sample link is a real link of the simulated gateway, so the customer flow works end to end
  const sent = currentLink(byRef("VMAF-2026-05119").parties[0]!);
  assert.ok(h.gatewaySystem.session(sent.linkId!), "LinkId known by the gateway");
  for (const app of h.db.applications)
    for (const p of app.parties) {
      if (currentLink(p).status !== "FULFILLED") continue;
      const person = decrypt<MyinfoPerson>(h.key, p.myinfoSealed!);
      assert.equal(person.uinfin, p.nric, "stored Myinfo data belongs to the party");
      assert.equal(person.name, p.name);
    }
});

test("D-29 running it again creates no duplicates", async () => {
  const h = harness();
  await h.service.seedSamples();
  assert.equal(await h.service.seedSamples(), 0);
  assert.equal(h.db.applications.length, 6);
});

test("D-29 sample data only uses the Singpass test personas' NRICs", async () => {
  const h = harness();
  await h.service.seedSamples();
  const allowed = new Set(PERSONAS.map((p) => p.uinfin));
  const nrics = h.db.applications.flatMap((a) => a.parties.map((p) => p.nric));
  assert.equal(nrics.length, 9);
  for (const nric of nrics) assert.ok(allowed.has(nric), `${nric} is not a test persona`);
  const json = JSON.stringify(h.db.applications);
  for (const m of json.matchAll(/[STFGM]\d{7}[A-Z]/g)) assert.ok(allowed.has(m[0]), `${m[0]} found in sample data`);
});

test("D-50 demo shortcuts open a sample application in the right state (creating the samples if missing)", async () => {
  const h = harness();
  assert.equal(h.db.applications.length, 0);

  const hirerView = await h.service.demoShortcut("hirer-view");
  assert.ok(h.db.applications.length >= 6, "samples created on demand");
  const found = h.service.findByPortalToken(hirerView.url.split("/verify/")[1]!)!;
  assert.equal(hirerView.url, `/verify/${currentLink(found.party).portalToken}`);
  assert.equal(found.party.role, "hirer");
  assert.ok(["SENT", "OPENED"].includes(currentLink(found.party).status), "the hirer still has a pending, current link");
  assert.equal(hirerView.userId, undefined, "the customer page needs no sign-in");

  const opsView = await h.service.demoShortcut("ops-view");
  const opsApp = h.service.getApplication(opsView.ref);
  assert.equal(opsView.url, `/ops/applications/${opsView.ref}`);
  assert.equal(opsView.userId, "u-priya");
  assert.equal(opsApp.stage, "IPA");
  assert.equal(h.service.aaCheck(opsApp).ready, false, "IPA issued, AA still locked");
  assert.ok(opsApp.parties.some((p) => currentLink(p).status === "FULFILLED"));

  const dealerView = await h.service.demoShortcut("dealer-view");
  const dealerApp = h.service.getApplication(dealerView.ref);
  assert.equal(dealerView.url, `/dealer/applications/${dealerView.ref}`);
  assert.equal(dealerView.userId, "u-alex");
  assert.equal(dealerApp.dealerId, "d-demo", "visible to the sample dealer user");
  assert.equal(currentLink(dealerApp.parties[0]!).status, "FULFILLED", "the hirer has just shared their details");
  assert.ok(dealerApp.parties.some((p) => currentLink(p).status !== "FULFILLED"), "still waiting for someone");
});

test("D-50 a shortcut with no sample in that state says so", async () => {
  const h = harness();
  await h.service.seedSamples();
  h.clock.advance(73 * 3_600_000);
  await h.service.runJob(); // the pending sample links expire
  await assert.rejects(h.service.demoShortcut("hirer-view"), (e: { status: number; message: string }) => e.status === 409 && /Reset/.test(e.message));
});
