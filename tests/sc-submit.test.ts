// Step 1: submitting an application issues one link per party; a gateway outage queues the link (D-24, D-13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEALER, H, T0, applicationInput, harness, outboxFor } from "./helpers.ts";

test("SC-01 submit hirer + guarantor: each party gets exactly 1 SENT link, 1 email and 1 SMS without the link", async () => {
  const h = harness();
  const app = await h.service.submitApplication(applicationInput(), DEALER);

  assert.equal(app.parties.length, 2);
  for (const party of app.parties) {
    assert.equal(party.links.length, 1);
    const link = party.links[0]!;
    assert.equal(link.status, "SENT");
    assert.ok(link.linkId, "gateway LinkId stored");
    assert.equal(link.sentAt, T0);
    assert.equal(link.expiresAt, T0 + 72 * H);

    // portal token: random, >= 128 bits, no NRIC and no LinkId inside
    assert.ok(Buffer.from(link.portalToken, "base64url").length >= 16);
    assert.ok(!link.portalToken.toUpperCase().includes(party.nric));
    assert.ok(!link.portalToken.includes(link.linkId!));

    const emails = outboxFor(h, party, "email");
    const sms = outboxFor(h, party, "sms");
    assert.equal(emails.length, 1);
    assert.equal(sms.length, 1);
    assert.equal(emails[0]!.to, party.email);
    assert.ok(emails[0]!.body.includes(`https://demo.test/verify/${link.portalToken}`));
    assert.equal(sms[0]!.to, party.mobile);
    assert.ok(!sms[0]!.body.includes(link.portalToken));
    assert.doesNotMatch(sms[0]!.body, /https?:\/\//);
  }
  assert.equal(h.emails.length, 2, "the mailer was called once per party");
  assert.deepEqual(
    h.db.audit.filter((e) => e.type === "link.sent").map((e) => e.partyId).sort(),
    app.parties.map((p) => p.id).sort(),
  );
});

test("SC-50 gateway down at submit: the application is submitted, links are QUEUED, no email yet", async () => {
  const h = harness();
  h.gatewaySystem.setAvailable(false);
  const app = await h.service.submitApplication(applicationInput(), DEALER);

  assert.ok(app.ref.startsWith("VMAF-2026-"));
  assert.ok(h.db.applications.some((a) => a.ref === app.ref));
  for (const party of app.parties) {
    assert.equal(party.links.length, 1);
    assert.equal(party.links[0]!.status, "QUEUED");
    assert.equal(party.links[0]!.linkId, undefined);
    assert.equal(party.links[0]!.expiresAt, undefined);
  }
  assert.equal(h.db.outbox.length, 0);
  assert.equal(h.emails.length, 0);
});

test("SC-51 gateway back, job runs twice (and concurrently): exactly 1 link and 1 email per party; 72 h counts from sending", async () => {
  const h = harness();
  h.gatewaySystem.setAvailable(false);
  const app = await h.service.submitApplication(applicationInput(), DEALER);

  // still down: the job leaves the links queued
  await h.service.runJob();
  assert.ok(app.parties.every((p) => p.links[0]!.status === "QUEUED"));

  h.clock.advance(5 * H);
  h.gatewaySystem.setAvailable(true);
  await Promise.all([h.service.runJob(), h.service.runJob()]);
  await h.service.runJob();

  for (const party of app.parties) {
    assert.equal(party.links.length, 1);
    const link = party.links[0]!;
    assert.equal(link.status, "SENT");
    assert.equal(link.sentAt, T0 + 5 * H);
    assert.equal(link.expiresAt, T0 + 5 * H + 72 * H);
    assert.equal(outboxFor(h, party, "email").length, 1);
    assert.equal(outboxFor(h, party, "sms").length, 1);
  }
  assert.equal(h.gatewaySystem.issuedLinkCount(), 2, "GetLinkId called once per party");
});
