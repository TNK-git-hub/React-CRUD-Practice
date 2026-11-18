// Step 4: resend (flow item 9), correcting a party's NRIC / email (D-40), expired links list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentLink } from "../server/verification/model.ts";
import type { Actor } from "../server/verification/users.ts";
import { DEALER, H, OPS, T0, applicationInput, auditOf, consent, harness, outboxFor } from "./helpers.ts";
import type { Harness } from "./helpers.ts";

async function submitted(h: Harness = harness()) {
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  return { h, app, hirer: app.parties[0]!, guarantor: app.parties[1]! };
}

const OTHER_AGENT: Actor = { id: "u-other", name: "Other Agent", initials: "OA", kind: "dealer", dealerId: "d-demo", org: "Demo Motors Pte Ltd" };

test("SC-40 resend → old link REPLACED; new link with a new LinkId and token, sent; audit has the reason", async () => {
  const { h, app, hirer } = await submitted();
  const old = currentLink(hirer);
  h.clock.advance(H);

  await h.service.resend(app.ref, hirer.id, OPS, "Customer did not get the email");

  const fresh = currentLink(hirer);
  assert.equal(old.status, "REPLACED");
  assert.equal(fresh.status, "SENT");
  assert.notEqual(fresh.id, old.id);
  assert.ok(fresh.linkId && fresh.linkId !== old.linkId);
  assert.notEqual(fresh.portalToken, old.portalToken);
  assert.equal(fresh.expiresAt, T0 + H + 72 * H);
  assert.equal(outboxFor(h, hirer, "email").length, 2);
  const resent = auditOf(h, "link.resent", hirer.id);
  assert.equal(resent.length, 1);
  assert.equal(resent[0]!.details.reason, "Customer did not get the email");
  assert.equal(resent[0]!.actor, OPS.id);
  assert.equal(auditOf(h, "link.replaced", hirer.id).length, 1);
});

test("SC-40 resend: Ops and the submitting dealer agent may; another agent may not; a reason is required", async () => {
  const { h, app, hirer } = await submitted();
  await h.service.resend(app.ref, hirer.id, DEALER, "Asked by the customer at the showroom");
  assert.equal(auditOf(h, "link.resent", hirer.id)[0]!.actor, DEALER.id);
  await assert.rejects(h.service.resend(app.ref, hirer.id, OTHER_AGENT, "x"), (e: { status: number }) => e.status === 403);
  await assert.rejects(h.service.resend(app.ref, hirer.id, OPS, "   "), (e: { status: number }) => e.status === 400);
  assert.equal(hirer.links.length, 2);
});

test("SC-41 4th resend within 24 hours → refused with the earliest time a resend is allowed", async () => {
  const { h, app, hirer } = await submitted();
  for (let i = 1; i <= 3; i++) {
    h.clock.t = T0 + i * H;
    await h.service.resend(app.ref, hirer.id, OPS, `try ${i}`);
  }
  h.clock.t = T0 + 4 * H;
  const links = hirer.links.length;
  const audit = h.db.audit.length;
  await assert.rejects(h.service.resend(app.ref, hirer.id, OPS, "try 4"), (e: { status: number; details?: { retryAt: number } }) => {
    assert.equal(e.status, 429);
    assert.equal(e.details?.retryAt, T0 + H + 24 * H);
    return true;
  });
  assert.equal(hirer.links.length, links);
  assert.equal(h.db.audit.length, audit);
});

test("SC-42 the sliding window follows the clock: allowed exactly when the first resend leaves the 24-hour window", async () => {
  const { h, app, hirer } = await submitted();
  for (let i = 1; i <= 3; i++) {
    h.clock.t = T0 + i * H;
    await h.service.resend(app.ref, hirer.id, OPS, `try ${i}`);
  }
  h.clock.t = T0 + 25 * H - 1;
  await assert.rejects(h.service.resend(app.ref, hirer.id, OPS, "too early"), /T|resend/i);
  h.clock.t = T0 + 25 * H;
  await h.service.resend(app.ref, hirer.id, OPS, "first one left the window");
  assert.equal(currentLink(hirer).status, "SENT");
  // now resends at +2h, +3h, +25h are inside the window
  await assert.rejects(h.service.resend(app.ref, hirer.id, OPS, "again"), (e: { details?: { retryAt: number } }) => e.details?.retryAt === T0 + 26 * H);
});

test("SC-44 resend after FULFILLED → refused, nothing changes", async () => {
  const { h, app, hirer } = await submitted();
  consent(h, currentLink(hirer).linkId!, "F4440488P");
  await h.service.runJob();
  await assert.rejects(h.service.resend(app.ref, hirer.id, OPS, "x"), (e: { status: number }) => e.status === 409);
  assert.equal(hirer.links.length, 1);
  assert.equal(currentLink(hirer).status, "FULFILLED");
});

test("SC-46 correct the NRIC after a MISMATCH → new link for the new NRIC, the party waits again", async () => {
  const { h, app, hirer } = await submitted();
  const first = currentLink(hirer);
  consent(h, first.linkId!, "F4440489M"); // dealer typed the wrong NRIC
  await h.service.runJob();
  assert.equal(first.status, "MISMATCH");

  await h.service.correctParty(app.ref, hirer.id, OPS, { nric: " f4440489m " }, "Dealer typo, checked against NRIC card");

  const fresh = currentLink(hirer);
  assert.equal(hirer.nric, "F4440489M");
  assert.notEqual(fresh.id, first.id);
  assert.equal(fresh.status, "SENT");
  assert.equal(fresh.reason, "nric-correction");
  assert.equal(first.status, "MISMATCH", "history keeps its status (D-19)");
  assert.equal(hirer.mismatchUinfin, undefined, "the old mismatch no longer counts");
  assert.equal(hirer.resendsAt.length, 0, "a correction is not a resend");
  const audit = auditOf(h, "party.corrected", hirer.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.details.reason, "Dealer typo, checked against NRIC card");
  assert.equal(audit[0]!.details.nricFrom, "F****488P");
  assert.equal(audit[0]!.details.nricTo, "F****489M");

  consent(h, fresh.linkId!, "F4440489M");
  await h.service.runJob();
  assert.equal(fresh.status, "FULFILLED");
});

test("D-40 correcting the email → new link sent to the new address", async () => {
  const { h, app, hirer } = await submitted();
  const old = currentLink(hirer);
  await h.service.correctParty(app.ref, hirer.id, OPS, { email: "new.address@example.com" }, "Customer gave a new email");
  assert.equal(old.status, "REPLACED");
  assert.equal(hirer.email, "new.address@example.com");
  const emails = outboxFor(h, hirer, "email");
  assert.equal(emails[0]!.to, "new.address@example.com");
  assert.equal(emails[0]!.linkRef, currentLink(hirer).id);
});

test("D-40 correcting the NRIC of a FULFILLED party invalidates the old result", async () => {
  const { h, app, hirer } = await submitted();
  const first = currentLink(hirer);
  consent(h, first.linkId!, "F4440488P");
  await h.service.runJob();
  assert.ok(hirer.myinfoSealed);

  await h.service.correctParty(app.ref, hirer.id, OPS, { nric: "F4440489M" }, "Wrong NRIC on file");

  assert.equal(first.status, "FULFILLED", "FULFILLED is final; it is only no longer current");
  assert.equal(currentLink(hirer).status, "SENT");
  assert.equal(hirer.fulfilledAt, undefined);
  assert.equal(hirer.myinfoSealed, undefined);
});

test("D-40 correction rules: Ops only, reason required, valid and distinct NRIC, something must change; not a resend", async () => {
  const { h, app, hirer } = await submitted();
  const status = async (p: Promise<unknown>) => p.then(() => 200, (e: { status: number }) => e.status);
  assert.equal(await status(h.service.correctParty(app.ref, hirer.id, DEALER, { nric: "F4440489M" }, "x")), 403);
  assert.equal(await status(h.service.correctParty(app.ref, hirer.id, OPS, { nric: "F4440489M" }, " ")), 400);
  assert.equal(await status(h.service.correctParty(app.ref, hirer.id, OPS, { nric: "F4440489X" }, "x")), 400);
  assert.equal(await status(h.service.correctParty(app.ref, hirer.id, OPS, { nric: "G4440425M" }, "x")), 400); // the guarantor's
  assert.equal(await status(h.service.correctParty(app.ref, hirer.id, OPS, { email: "not-an-email" }, "x")), 400);
  assert.equal(await status(h.service.correctParty(app.ref, hirer.id, OPS, { nric: "F4440488P", email: "hirer@example.com" }, "x")), 400);
  assert.equal(hirer.links.length, 1);

  // three resends use up the limit; a correction is still allowed and does not count
  for (let i = 1; i <= 3; i++) await h.service.resend(app.ref, hirer.id, OPS, `try ${i}`);
  await h.service.correctParty(app.ref, hirer.id, OPS, { email: "fixed@example.com" }, "typo");
  assert.equal(hirer.resendsAt.length, 3);
  await assert.rejects(h.service.resend(app.ref, hirer.id, OPS, "try 4"), (e: { status: number }) => e.status === 429);
});

for (const kind of ["resend", "correction"] as const) {
  test(`D-46 ${kind} while the gateway is down → old link REPLACED at once, new link QUEUED, sent once when it is back`, async () => {
    const { h, app, hirer } = await submitted();
    const old = currentLink(hirer);
    h.gatewaySystem.setAvailable(false);
    h.clock.advance(H);

    if (kind === "resend") await h.service.resend(app.ref, hirer.id, OPS, "lost email");
    else await h.service.correctParty(app.ref, hirer.id, OPS, { email: "fixed@example.com" }, "typo");

    const fresh = currentLink(hirer);
    assert.equal(old.status, "REPLACED");
    assert.equal(fresh.status, "QUEUED");
    assert.equal(outboxFor(h, hirer, "email").length, 1, "only the first email so far");
    assert.deepEqual(h.service.openLink(old.portalToken), { ok: false, reason: "replaced" });

    h.clock.advance(H);
    h.gatewaySystem.setAvailable(true);
    await Promise.all([h.service.runJob(), h.service.runJob()]);
    await h.service.runJob();

    assert.equal(fresh.status, "SENT");
    assert.equal(fresh.sentAt, T0 + 2 * H);
    assert.equal(fresh.expiresAt, T0 + 2 * H + 72 * H);
    assert.equal(hirer.links.length, 2);
    assert.equal(outboxFor(h, hirer, "email").filter((m) => m.linkRef === fresh.id).length, 1);
  });
}

test("expired links list for Ops (flow item 9): current EXPIRED links, gone once resent", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  assert.deepEqual(h.service.expiredLinks(), []);
  h.clock.advance(73 * H);
  await h.service.runJob();
  const list = h.service.expiredLinks();
  assert.deepEqual(list.map((x) => [x.ref, x.partyId]).sort(), [[app.ref, hirer.id], [app.ref, guarantor.id]].sort());
  assert.equal(list[0]!.expiredAt, T0 + 73 * H);
  await h.service.resend(app.ref, hirer.id, OPS, "expired");
  assert.deepEqual(h.service.expiredLinks().map((x) => x.partyId), [guarantor.id]);
});

test("D-40 correcting only the email of a FULFILLED party → email updated and audited; result kept, no new link", async () => {
  const { h, app, hirer } = await submitted();
  const link = currentLink(hirer);
  consent(h, link.linkId!, "F4440488P");
  await h.service.runJob();
  const sealed = hirer.myinfoSealed;
  const fulfilledAt = hirer.fulfilledAt;
  const emails = outboxFor(h, hirer, "email").length;

  await h.service.correctParty(app.ref, hirer.id, OPS, { email: "updated@example.com" }, "Customer changed email");

  assert.equal(hirer.email, "updated@example.com");
  assert.equal(hirer.links.length, 1);
  assert.equal(currentLink(hirer), link);
  assert.equal(link.status, "FULFILLED");
  assert.equal(hirer.myinfoSealed, sealed);
  assert.equal(hirer.fulfilledAt, fulfilledAt);
  assert.equal(outboxFor(h, hirer, "email").length, emails, "no new email");
  const audit = auditOf(h, "party.corrected", hirer.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.details.emailTo, "up***@example.com");
  assert.equal(audit[0]!.details.newLink, "no");
});
