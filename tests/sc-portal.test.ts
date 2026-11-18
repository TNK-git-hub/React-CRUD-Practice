// Step 2: the customer opens the link on the AutoFinance portal first (/verify/<portalToken>), flow item 4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentLink } from "../server/verification/model.ts";
import { DEALER, H, OPS, applicationInput, harness } from "./helpers.ts";

test("SC-10 open a valid link → OPENED and sent to the gateway URL with the right LinkId", async () => {
  const h = harness();
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  const hirer = app.parties[0]!;
  const link = currentLink(hirer);
  h.clock.advance(H);

  const r = h.service.openLink(link.portalToken);
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.redirectUrl === `https://demo.test/gateway/${link.linkId}`);
  assert.equal(link.status, "OPENED");
  assert.equal(link.openedAt, h.clock.now());
  assert.ok(h.db.audit.some((e) => e.type === "link.opened" && e.partyId === hirer.id));

  // opening again still works and keeps the first opening time
  h.clock.advance(H);
  const again = h.service.openLink(link.portalToken);
  assert.equal(again.ok, true);
  assert.equal(link.openedAt, h.clock.now() - H);
});

test("SC-11 open a link that was replaced by a resend → blocked, no gateway URL", async () => {
  const h = harness();
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  const hirer = app.parties[0]!;
  const oldLink = currentLink(hirer);
  await h.service.resend(app.ref, hirer.id, OPS, "Customer did not receive the email");
  assert.equal(oldLink.status, "REPLACED");

  const r = h.service.openLink(oldLink.portalToken);
  assert.deepEqual(r, { ok: false, reason: "replaced" });
  assert.equal(oldLink.status, "REPLACED");
  assert.ok(h.db.audit.some((e) => e.type === "link.blocked" && e.details.link === oldLink.id));
  // the new link opens
  assert.equal(h.service.openLink(currentLink(hirer).portalToken).ok, true);
});

test("SC-12 open a link more than 72 hours after it was sent → blocked, link EXPIRED", async () => {
  const h = harness();
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  const link = currentLink(app.parties[0]!);

  h.clock.advance(72 * H - 1);
  assert.equal(h.service.openLink(link.portalToken).ok, true); // still valid one ms before
  h.clock.advance(1);
  const r = h.service.openLink(link.portalToken);
  assert.deepEqual(r, { ok: false, reason: "expired" });
  assert.equal(link.status, "EXPIRED");
  assert.ok(h.db.audit.some((e) => e.type === "link.expired" && e.details.link === link.id));
});

test("SC-11b an EXPIRED link kept as history after a resend is not the current link → blocked", async () => {
  const h = harness();
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  const hirer = app.parties[0]!;
  const linkA = currentLink(hirer);
  h.clock.advance(73 * H);
  await h.service.runJob(); // A becomes EXPIRED
  assert.equal(linkA.status, "EXPIRED");

  await h.service.resend(app.ref, hirer.id, OPS, "Link expired");
  const linkB = currentLink(hirer);
  assert.notEqual(linkB.id, linkA.id);
  assert.equal(hirer.currentLinkId, linkB.id);
  assert.equal(linkA.status, "EXPIRED", "history keeps its status (D-19)");
  assert.equal(linkB.status, "SENT");

  assert.deepEqual(h.service.openLink(linkA.portalToken), { ok: false, reason: "replaced" });
  assert.equal(h.service.openLink(linkB.portalToken).ok, true);
});

test("SC-10 unknown or QUEUED links never reach the gateway", async () => {
  const h = harness();
  assert.deepEqual(h.service.openLink("no-such-token"), { ok: false, reason: "unknown" });
  h.gatewaySystem.setAvailable(false);
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  assert.deepEqual(h.service.openLink(currentLink(app.parties[0]!).portalToken), { ok: false, reason: "not-sent" });
});
