// Step 3: the auto-verify job (polling, flow items 6, 7, 10, 11) and the manual "Retrieve MyInfo" (item 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decrypt } from "../server/crypto.ts";
import type { MyinfoPerson } from "../server/personas.ts";
import { currentLink } from "../server/verification/model.ts";
import { DEALER, H, OPS, applicationInput, auditOf, consent, harness } from "./helpers.ts";
import type { Harness } from "./helpers.ts";

async function submitted(h: Harness = harness()) {
  const app = await h.service.submitApplication(applicationInput(), DEALER);
  const [hirer, guarantor] = app.parties as [(typeof app.parties)[0], (typeof app.parties)[0]];
  return { h, app, hirer, guarantor };
}

test("SC-20 consent with the right persona → FULFILLED by the job, no Ops action; data stored encrypted", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  const link = currentLink(hirer);
  h.service.openLink(link.portalToken);
  consent(h, link.linkId!, "F4440488P");
  const before = h.changes.length;

  await h.service.runJob();

  assert.equal(link.status, "FULFILLED");
  assert.equal(hirer.fulfilledAt, h.clock.now());
  assert.equal(hirer.mismatchUinfin, undefined);
  assert.ok(hirer.myinfoSealed);
  assert.ok(!hirer.myinfoSealed!.includes("HENG SHI ZHENG"), "stored encrypted, not in clear");
  assert.equal(decrypt<MyinfoPerson>(h.key, hirer.myinfoSealed!).uinfin, "F4440488P");
  assert.equal(auditOf(h, "party.fulfilled", hirer.id).length, 1);
  assert.deepEqual(h.changes.slice(before), [app.ref], "exactly one notification");
  assert.equal(currentLink(guarantor).status, "SENT", "the guarantor is independent");
});

test("SC-21 consent with another persona → MISMATCH, only the uinfin kept apart, Ops warned (D-22)", async () => {
  const { h, hirer } = await submitted();
  const link = currentLink(hirer);
  consent(h, link.linkId!, "F4440489M");

  await h.service.runJob();

  assert.equal(link.status, "MISMATCH");
  assert.equal(hirer.mismatchUinfin, "F4440489M");
  assert.equal(hirer.myinfoSealed, undefined, "no person data attached");
  assert.equal(hirer.fulfilledAt, undefined);
  const warn = auditOf(h, "party.mismatch", hirer.id);
  assert.equal(warn.length, 1);
  assert.equal(warn[0]!.details.returned, "F****489M");
  assert.equal(warn[0]!.details.expected, "F****488P");
  assert.ok(!JSON.stringify(h.db.audit).includes("F4440489M"), "no full NRIC in the audit");
});

test("SC-22 data on the old LinkId after a resend → rejected; the new link stays SENT", async () => {
  const { h, app, hirer } = await submitted();
  const linkA = currentLink(hirer);
  await h.service.resend(app.ref, hirer.id, OPS, "Customer lost the email");
  const linkB = currentLink(hirer);
  // the gateway cannot cancel A: the customer still consents on it
  consent(h, linkA.linkId!, "F4440488P");

  await h.service.runJob();

  assert.equal(linkA.status, "REPLACED");
  assert.equal(linkB.status, "SENT");
  assert.equal(hirer.myinfoSealed, undefined);
  assert.equal(hirer.fulfilledAt, undefined);
  const rejected = auditOf(h, "result.rejected", hirer.id);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]!.details.link, linkA.id);
  assert.equal(rejected[0]!.details.reason, "old-link");
  assert.equal(rejected[0]!.details.linkStatus, "REPLACED");
  assert.equal(rejected[0]!.details.returned, "F****488P");
  assert.equal(rejected[0]!.details.nricMatches, "yes");
  assert.equal(rejected[0]!.details.currentLink, linkB.id);
});

test("SC-22b link A EXPIRED, resend → B; data later on A → rejected, party unchanged, B SENT, audited; /verify A blocked", async () => {
  const { h, app, hirer } = await submitted();
  const linkA = currentLink(hirer);
  h.clock.advance(73 * H);
  await h.service.runJob();
  assert.equal(linkA.status, "EXPIRED");
  await h.service.resend(app.ref, hirer.id, OPS, "Link expired");
  const linkB = currentLink(hirer);

  consent(h, linkA.linkId!, "F4440488P");
  await h.service.runJob();

  assert.equal(linkA.status, "EXPIRED");
  assert.equal(linkB.status, "SENT");
  assert.equal(hirer.myinfoSealed, undefined);
  const rejected = auditOf(h, "result.rejected", hirer.id);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]!.details.link, linkA.id);
  assert.equal(rejected[0]!.details.reason, "old-link");
  assert.deepEqual(h.service.openLink(linkA.portalToken), { ok: false, reason: "replaced" });
});

test("SC-22b link A MISMATCH, resend → B; a new consent on A never changes the party; B stays SENT; /verify A blocked", async () => {
  const { h, app, hirer } = await submitted();
  const linkA = currentLink(hirer);
  consent(h, linkA.linkId!, "F4440489M");
  await h.service.runJob();
  assert.equal(linkA.status, "MISMATCH");
  await h.service.resend(app.ref, hirer.id, OPS, "Wrong Singpass account used");
  const linkB = currentLink(hirer);

  consent(h, linkA.linkId!, "F4440488P"); // right persona, but on the old link
  await h.service.runJob();

  assert.equal(linkA.status, "MISMATCH");
  assert.equal(linkB.status, "SENT");
  assert.equal(hirer.myinfoSealed, undefined);
  assert.equal(hirer.fulfilledAt, undefined);
  assert.deepEqual(h.service.openLink(linkA.portalToken), { ok: false, reason: "replaced" });
});

test("SC-23 no data yet, the job runs many times → no status change, no notification, no audit", async () => {
  const { h, app } = await submitted();
  const statuses = () => app.parties.map((p) => currentLink(p).status);
  const before = { statuses: statuses(), changes: h.changes.length, audit: h.db.audit.length };
  for (let i = 0; i < 5; i++) {
    h.clock.advance(H);
    await h.service.runJob();
  }
  assert.deepEqual(statuses(), before.statuses);
  assert.equal(h.changes.length, before.changes);
  assert.equal(h.db.audit.length, before.audit);
  assert.equal(h.fetches.length, 10, "both current links were polled each run");
});

test("SC-24 past 72 hours without data → EXPIRED", async () => {
  const { h, hirer } = await submitted();
  h.clock.advance(72 * H);
  await h.service.runJob();
  assert.equal(currentLink(hirer).status, "EXPIRED");
  assert.equal(auditOf(h, "link.expired", hirer.id).length, 1);
});

test("SC-26 customer declines consent → the link keeps its status until it expires (D-33)", async () => {
  const { h, hirer } = await submitted();
  const link = currentLink(hirer);
  h.service.openLink(link.portalToken);
  h.gatewaySystem.login(link.linkId!, "F4440488P");
  h.gatewaySystem.decline(link.linkId!);
  const before = h.changes.length;

  await h.service.runJob();
  assert.equal(link.status, "OPENED");
  assert.equal(h.changes.length, before, "AutoFinance does not learn about the refusal");
  assert.ok(h.gatewaySystem.log.some((e) => e.linkId === link.linkId && e.event === "declined"), "the gateway records it");

  h.clock.advance(72 * H);
  await h.service.runJob();
  assert.equal(link.status, "EXPIRED");
});

test("SC-27 the job runs again after FULFILLED → no duplicate notification, no further polling", async () => {
  const { h, app, hirer } = await submitted();
  consent(h, currentLink(hirer).linkId!, "F4440488P");
  await h.service.runJob();
  assert.equal(currentLink(hirer).status, "FULFILLED");
  const changes = h.changes.filter((r) => r === app.ref).length;
  const fetchesOfHirer = () => h.fetches.filter((id) => id === currentLink(hirer).linkId).length;
  const polled = fetchesOfHirer();

  await h.service.runJob();
  await h.service.runJob();

  assert.equal(h.changes.filter((r) => r === app.ref).length, changes);
  assert.equal(auditOf(h, "party.fulfilled", hirer.id).length, 1);
  assert.equal(fetchesOfHirer(), polled, "a FULFILLED link is not polled");
});

test("SC-28 manual Retrieve MyInfo gives the same result as the job", async () => {
  async function scenario(run: (h: Harness, ref: string, partyId: string) => Promise<unknown>) {
    const { h, app, hirer, guarantor } = await submitted();
    consent(h, currentLink(hirer).linkId!, "F4440488P");
    consent(h, currentLink(guarantor).linkId!, "F4440489M");
    for (const p of app.parties) await run(h, app.ref, p.id);
    return {
      statuses: app.parties.map((p) => currentLink(p).status),
      fulfilledAt: app.parties.map((p) => p.fulfilledAt ?? null),
      mismatch: app.parties.map((p) => p.mismatchUinfin ?? null),
      person: app.parties.map((p) => (p.myinfoSealed ? decrypt<MyinfoPerson>(h.key, p.myinfoSealed).uinfin : null)),
      audit: h.db.audit
        .filter((e) => !e.type.startsWith("link."))
        .map((e) => {
          const { link: _link, currentLink: _current, ...details } = e.details; // random ids differ between runs
          return `${e.type}:${e.partyId}:${JSON.stringify(details)}`;
        }),
    };
  }
  const byJob = await scenario((h) => h.service.runJob());
  const byOps = await scenario((h, ref, partyId) => h.service.retrieveMyInfo(ref, partyId, OPS));
  assert.deepEqual(byOps, byJob);
  assert.deepEqual(byJob.statuses, ["FULFILLED", "MISMATCH"]);
});

test("SC-28 Retrieve MyInfo is for Ops only; it reports a gateway outage instead of hiding it", async () => {
  const { h, app, hirer } = await submitted();
  await assert.rejects(h.service.retrieveMyInfo(app.ref, hirer.id, DEALER), /Ops/);
  h.gatewaySystem.setAvailable(false);
  await assert.rejects(h.service.retrieveMyInfo(app.ref, hirer.id, OPS), /unavailable/i);
  assert.equal(currentLink(hirer).status, "SENT");
});

test("SC-29 uinfin in lower case or with spaces still matches the dealer-entered NRIC", async () => {
  const { h, hirer } = await submitted(
    harness({
      wrapGateway: (inner) => ({
        issueLink: (p) => inner.issueLink(p),
        fetchPerson: async (linkId) => {
          const r = await inner.fetchPerson(linkId);
          return r.status === "READY" ? { status: "READY", person: { ...r.person, uinfin: `  ${r.person.uinfin.toLowerCase()} ` } } : r;
        },
      }),
    }),
  );
  consent(h, currentLink(hirer).linkId!, "F4440488P");
  await h.service.runJob();
  assert.equal(currentLink(hirer).status, "FULFILLED");
});

test("SC-30 customer opens the gateway URL directly (not through the portal): SENT → FULFILLED", async () => {
  const { h, hirer } = await submitted();
  const link = currentLink(hirer);
  assert.equal(link.status, "SENT");
  consent(h, link.linkId!, "F4440488P");
  await h.service.runJob();
  assert.equal(link.status, "FULFILLED");
  assert.equal(link.openedAt, undefined);
});

test("D-44 data found in the cycle where the link just expired → FULFILLED", async () => {
  const { h, hirer } = await submitted();
  const link = currentLink(hirer);
  h.clock.advance(71 * H);
  consent(h, link.linkId!, "F4440488P"); // consent in time…
  h.clock.advance(2 * H); // …but the next poll happens after expiresAt
  await h.service.runJob();
  assert.equal(link.status, "FULFILLED");
  assert.equal(auditOf(h, "link.expired", hirer.id).length, 0);
});

test("D-44 data that shows up after the link is already EXPIRED → rejected", async () => {
  const { h, hirer } = await submitted();
  const link = currentLink(hirer);
  h.clock.advance(73 * H);
  await h.service.runJob();
  assert.equal(link.status, "EXPIRED");

  consent(h, link.linkId!, "F4440488P");
  await h.service.runJob();
  await h.service.runJob();

  assert.equal(link.status, "EXPIRED");
  assert.equal(hirer.myinfoSealed, undefined);
  const rejected = auditOf(h, "result.rejected", hirer.id);
  assert.equal(rejected.length, 1, "recorded once");
  assert.equal(rejected[0]!.details.reason, "expired");
  assert.equal(rejected[0]!.details.linkStatus, "EXPIRED");
});

test("D-45 the job never polls QUEUED, FULFILLED or MISMATCH links; an old link stops being checked after its late result or window", async () => {
  const { h, app, hirer, guarantor } = await submitted();
  consent(h, currentLink(hirer).linkId!, "F4440488P");
  consent(h, currentLink(guarantor).linkId!, "F4440489M");
  const polled = (linkId: string | undefined) => h.fetches.includes(linkId ?? "");
  await h.service.runJob();
  h.fetches.length = 0;
  await h.service.runJob();
  assert.deepEqual(h.fetches, [], "FULFILLED and MISMATCH are not polled");

  // old link with a late result: checked until the result is recorded, then never again
  await h.service.resend(app.ref, guarantor.id, OPS, "Wrong account");
  const old = guarantor.links[0]!;
  const fresh = currentLink(guarantor);
  h.fetches.length = 0;
  await h.service.runJob();
  assert.deepEqual(h.fetches, [fresh.linkId], "MISMATCH history is not re-checked");

  // a REPLACED link without data: checked only until its original expiry + TTL
  await h.service.resend(app.ref, guarantor.id, OPS, "Again");
  const replaced = fresh;
  h.fetches.length = 0;
  await h.service.runJob();
  assert.ok(polled(replaced.linkId));
  h.clock.advance(replaced.expiresAt! - h.clock.now() + 72 * H);
  h.fetches.length = 0;
  await h.service.runJob();
  assert.ok(!polled(replaced.linkId), "window over");
  assert.ok(!polled(old.linkId));

  // QUEUED links are not polled (gateway down: they stay queued, nothing is fetched)
  const q = { h: harness() };
  q.h.gatewaySystem.setAvailable(false);
  const queuedApp = await q.h.service.submitApplication(applicationInput(), DEALER);
  await q.h.service.runJob();
  assert.deepEqual(queuedApp.parties.map((p) => currentLink(p).status), ["QUEUED", "QUEUED"]);
  assert.equal(q.h.fetches.length, 0, "QUEUED links are not polled");
});

test("overlapping job runs on the same link → exactly 1 status change, 1 notification, 1 audit event", async () => {
  const { h, app, hirer } = await submitted();
  consent(h, currentLink(hirer).linkId!, "F4440488P");
  const before = h.changes.length;
  const auditBefore = h.db.audit.length;

  await Promise.all([h.service.runJob(), h.service.runJob(), h.service.retrieveMyInfo(app.ref, hirer.id, OPS)]);

  assert.equal(currentLink(hirer).status, "FULFILLED");
  assert.deepEqual(h.changes.slice(before), [app.ref]);
  assert.equal(h.db.audit.length - auditBefore, 1);
  assert.equal(auditOf(h, "party.fulfilled", hirer.id).length, 1);
});
