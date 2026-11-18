// Step 5: IPA any time after submission; AA locked on the server until every party is FULFILLED (flow item 12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentLink } from "../server/verification/model.ts";
import { DEALER, H, OPS, applicationInput, auditOf, consent, harness } from "./helpers.ts";
import type { Harness } from "./helpers.ts";

async function submitted(h: Harness = harness()) {
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  return { h, app, hirer: app.parties[0]!, guarantor: app.parties[1]! };
}

async function verify(h: Harness, party: { links: unknown[] } & Parameters<typeof currentLink>[0], uinfin: string) {
  consent(h, currentLink(party).linkId!, uinfin);
  await h.service.runJob();
  assert.equal(currentLink(party).status, "FULFILLED");
}

type Refusal = { status: number; details?: { missing: Array<{ partyId: string; label: string; status: string }> } };

test("SC-60 IPA with nobody verified yet → issued", async () => {
  const { h, app } = await submitted();
  h.clock.advance(H);
  const after = h.service.issueIpa(app.ref, OPS);
  assert.equal(after.stage, "IPA");
  assert.equal(after.ipaAt, h.clock.now());
  assert.equal(auditOf(h, "ipa.issued").length, 1);
  assert.throws(() => h.service.issueIpa(app.ref, OPS), (e: { status: number }) => e.status === 409, "not twice");
  assert.throws(() => h.service.issueIpa(app.ref, DEALER), (e: { status: number }) => e.status === 403);
});

test("SC-61 AA while the guarantor is not done → refused, with the missing party", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  await verify(h, hirer, "F4440488P");
  assert.throws(() => h.service.issueAa(app.ref, OPS), (e: Refusal) => {
    assert.equal(e.status, 409);
    assert.deepEqual(e.details?.missing.map((m) => [m.partyId, m.label, m.status]), [[guarantor.id, "Guarantor", "SENT"]]);
    return true;
  });
  assert.equal(app.stage, "Submitted");
});

test("SC-62 every party FULFILLED → AA issued (with or without an IPA first)", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  h.service.issueIpa(app.ref, OPS);
  await verify(h, hirer, "F4440488P");
  await verify(h, guarantor, "G4440425M");
  const after = h.service.issueAa(app.ref, OPS);
  assert.equal(after.stage, "AA");
  assert.equal(after.aaAt, h.clock.now());
  assert.ok(after.ipaAt, "the IPA is kept");
  assert.equal(auditOf(h, "aa.issued").length, 1);
  assert.throws(() => h.service.issueAa(app.ref, OPS), (e: { status: number }) => e.status === 409, "not twice");

  const direct = await submitted();
  await verify(direct.h, direct.hirer, "F4440488P");
  await verify(direct.h, direct.guarantor, "G4440425M");
  assert.equal(direct.h.service.issueAa(direct.app.ref, OPS).stage, "AA", "no IPA needed (D-11)");
});

test("SC-63 a party in MISMATCH → AA refused", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  await verify(h, hirer, "F4440488P");
  consent(h, currentLink(guarantor).linkId!, "F4440489M");
  await h.service.runJob();
  assert.throws(() => h.service.issueAa(app.ref, OPS), (e: Refusal) => e.details?.missing[0]?.status === "MISMATCH");
});

test("SC-64 NRIC corrected after an IPA → the IPA stays, the AA is locked again until re-verified", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  await verify(h, hirer, "F4440488P");
  await verify(h, guarantor, "G4440425M");
  h.service.issueIpa(app.ref, OPS);
  const ipaAt = app.ipaAt;

  await h.service.correctParty(app.ref, guarantor.id, OPS, { nric: "G4440427W" }, "Wrong guarantor NRIC on file");

  assert.equal(app.stage, "IPA");
  assert.equal(app.ipaAt, ipaAt);
  assert.throws(() => h.service.issueAa(app.ref, OPS), (e: Refusal) => e.details?.missing[0]?.partyId === guarantor.id);
  await verify(h, guarantor, "G4440427W");
  assert.equal(h.service.issueAa(app.ref, OPS).stage, "AA");
});

test("SC-65 a refused AA lists every missing party with its status and audits the attempt", async () => {
  const { h, app } = await submitted();
  h.clock.advance(73 * H);
  await h.service.runJob(); // both EXPIRED
  assert.throws(() => h.service.issueAa(app.ref, OPS), (e: Refusal & { message: string }) => {
    assert.deepEqual(e.details?.missing.map((m) => [m.label, m.status]), [["Hirer", "EXPIRED"], ["Guarantor", "EXPIRED"]]);
    assert.match(e.message, /Hirer.*Guarantor/);
    return true;
  });
  const refused = auditOf(h, "aa.refused");
  assert.equal(refused.length, 1);
  assert.equal(refused[0]!.actor, OPS.id);
  assert.match(String(refused[0]!.details.missing), /Hirer: EXPIRED/);
  assert.throws(() => h.service.issueAa(app.ref, DEALER), (e: { status: number }) => e.status === 403);
});

test("aaCheck: the readiness Ops see is the same check the server enforces", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  assert.deepEqual(h.service.aaCheck(app).missing.map((m) => m.partyId), [hirer.id, guarantor.id]);
  await verify(h, hirer, "F4440488P");
  await verify(h, guarantor, "G4440425M");
  assert.deepEqual(h.service.aaCheck(app), { ready: true, missing: [] });
});

test("after the AA is issued: no correction and no resend", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  await verify(h, hirer, "F4440488P");
  await verify(h, guarantor, "G4440425M");
  h.service.issueAa(app.ref, OPS);
  const code = (p: Promise<unknown>) => p.then(() => 200, (e: { status: number }) => e.status);
  assert.equal(await code(h.service.correctParty(app.ref, hirer.id, OPS, { email: "x@example.com" }, "late change")), 409);
  assert.equal(await code(h.service.correctParty(app.ref, hirer.id, OPS, { nric: "F4440489M" }, "late change")), 409);
  assert.equal(await code(h.service.resend(app.ref, hirer.id, OPS, "late resend")), 409);
  assert.equal(hirer.email, "hirer@example.com");
  assert.equal(hirer.links.length, 1);
});
