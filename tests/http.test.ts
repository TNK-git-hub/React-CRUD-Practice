// Step 3b: the HTTP server runs the main flow on the new service (no old /v/{token} behaviour left).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { H } from "./helpers.ts";
import { call, closeAll, consentOnGateway, input, portalTokens, signIn, start } from "./http-helpers.ts";
import type { AppJson, MessageJson, OpenJson } from "./http-helpers.ts";

after(closeAll);

test("API main flow: submit → /verify → simulated gateway → job → both Fulfilled, visible to dealer and Ops", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");

  const created = await call<AppJson>(s, "POST", "/api/applications", dealer, input);
  assert.equal(created.status, 201);
  const ref = created.json.ref;
  assert.deepEqual(created.json.parties.map((p) => [p.label, p.linkStatus, p.status]), [
    ["Hirer", "SENT", "Pending"],
    ["Guarantor", "SENT", "Pending"],
  ]);

  const [tokenH, tokenG] = (await portalTokens(s, dealer, ref)).reverse(); // outbox is newest first
  const openH = await call<OpenJson>(s, "POST", `/api/verify/${tokenH}/open`);
  assert.equal(openH.status, 200);
  assert.equal(openH.json.ref, ref);
  assert.match(openH.json.redirectUrl, /^http:\/\/phone\.test\/gateway\/LNK-/);
  await consentOnGateway(s, openH.json.redirectUrl, "F4440488P");

  // nothing changes until the job polls
  assert.equal((await call<AppJson>(s, "GET", `/api/applications/${ref}`, ops)).json.parties[0]!.status, "Pending");
  assert.equal((await call(s, "POST", "/api/demo/run-job", ops)).status, 200);
  const afterJob = await call<AppJson>(s, "GET", `/api/applications/${ref}`, ops);
  assert.equal(afterJob.json.parties[0]!.status, "Fulfilled");
  assert.equal(afterJob.json.parties[0]!.myinfo!.name, "HENG SHI ZHENG");

  // guarantor through Ops "Retrieve MyInfo"
  const openG = await call<OpenJson>(s, "POST", `/api/verify/${tokenG}/open`);
  await consentOnGateway(s, openG.json.redirectUrl, "G4440425M");
  const gId = afterJob.json.parties[1]!.id;
  const retrieved = await call<{ outcome: string }>(s, "POST", `/api/applications/${ref}/parties/${gId}/retrieve`, ops);
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.json.outcome, "fulfilled");

  const asDealer = await call<AppJson>(s, "GET", `/api/applications/${ref}`, dealer);
  assert.deepEqual(asDealer.json.parties.map((p) => p.status), ["Fulfilled", "Fulfilled"]);
  assert.ok(!("myinfo" in asDealer.json.parties[0]!), "dealers do not receive Myinfo data at all (Q8)");
  assert.equal(asDealer.json.allFulfilled, true);
});

test("API: a replaced link is refused at /verify; the gateway still accepts consent on the old LinkId, which is rejected", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const [oldToken] = (await portalTokens(s, dealer, ref)).reverse();
  const old = await call<OpenJson>(s, "POST", `/api/verify/${oldToken}/open`);
  const hirerId = (await call<AppJson>(s, "GET", `/api/applications/${ref}`, ops)).json.parties[0]!.id;

  const resent = await call(s, "POST", `/api/applications/${ref}/parties/${hirerId}/resend`, ops, { reason: "Lost email" });
  assert.equal(resent.status, 200);
  const blocked = await call<OpenJson>(s, "POST", `/api/verify/${oldToken}/open`);
  assert.equal(blocked.status, 410);
  assert.equal(blocked.json.reason, "replaced");

  await consentOnGateway(s, old.json.redirectUrl, "F4440488P");
  await call(s, "POST", "/api/demo/run-job", ops);
  const app = (await call<AppJson>(s, "GET", `/api/applications/${ref}`, ops)).json;
  assert.equal(app.parties[0]!.status, "Pending");
  assert.ok(app.activity.some((e) => e.text.startsWith("Result rejected: the customer used an old link")));
});

test("API: Retrieve MyInfo is Ops only, resend needs a reason, old customer endpoints are gone", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const created = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json;
  const hirerId = created.parties[0]!.id;
  assert.equal((await call(s, "POST", `/api/applications/${created.ref}/parties/${hirerId}/retrieve`, dealer)).status, 403);
  assert.equal((await call(s, "POST", `/api/applications/${created.ref}/parties/${hirerId}/resend`, dealer, { reason: " " })).status, 400);
  assert.equal((await call(s, "GET", "/api/v/anything")).status, 404);
  assert.equal((await call(s, "POST", "/api/demo/run-job")).status, 401, "Demo Control needs a signed-in user (D-05)");
});

test("API Demo Control: gateway off → QUEUED; on + run job → sent; clock moves forward", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  assert.equal((await call(s, "POST", "/api/demo/gateway", dealer, { available: false })).status, 200);
  const created = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json;
  assert.equal(created.parties[0]!.linkStatus, "QUEUED");
  assert.equal(created.parties[0]!.status, "Queued");
  assert.equal((await call<MessageJson[]>(s, "GET", "/api/demo/outbox", dealer)).json.length, 0);

  await call(s, "POST", "/api/demo/gateway", dealer, { available: true });
  await call(s, "POST", "/api/demo/run-job", dealer);
  const after = (await call<AppJson>(s, "GET", `/api/applications/${created.ref}`, dealer)).json;
  assert.equal(after.parties[0]!.linkStatus, "SENT");

  const clock = await call<{ offsetMs: number }>(s, "POST", "/api/demo/clock", dealer, { advanceHours: 73 });
  assert.equal(clock.status, 200);
  assert.equal(clock.json.offsetMs, 73 * H);
  await call(s, "POST", "/api/demo/run-job", dealer);
  const expired = (await call<AppJson>(s, "GET", `/api/applications/${created.ref}`, dealer)).json;
  assert.equal(expired.parties[0]!.status, "Expired");
});

test("API step 4: correct NRIC/email (Ops only), expired links list, resend limit returns retryAt (429)", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const created = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json;
  const hirerId = created.parties[0]!.id;
  const base = `/api/applications/${created.ref}/parties/${hirerId}`;

  assert.equal((await call(s, "POST", `${base}/correct`, dealer, { email: "x@example.com", reason: "typo" })).status, 403);
  const corrected = await call<AppJson>(s, "POST", `${base}/correct`, ops, { email: "x@example.com", reason: "typo" });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.json.parties[0]!.linkStatus, "SENT");

  for (let i = 0; i < 3; i++) assert.equal((await call(s, "POST", `${base}/resend`, dealer, { reason: `r${i}` })).status, 200);
  const limited = await call<{ error: string; retryAt: number }>(s, "POST", `${base}/resend`, dealer, { reason: "r4" });
  assert.equal(limited.status, 429);
  assert.equal(typeof limited.json.retryAt, "number");
  assert.match(limited.json.error, /Next resend possible at/);

  assert.equal((await call(s, "GET", "/api/links/expired", dealer)).status, 403);
  await call(s, "POST", "/api/demo/clock", ops, { advanceHours: 73 });
  await call(s, "POST", "/api/demo/run-job", ops);
  const expired = await call<Array<{ ref: string; partyId: string }>>(s, "GET", "/api/links/expired", ops);
  assert.equal(expired.status, 200);
  assert.deepEqual(expired.json.map((x) => x.partyId).sort(), created.parties.map((p) => p.id).sort());
});

test("API step 5: IPA works while pending; AA refused with the missing parties (409), then issued", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const created = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json;
  const ref = created.ref;
  assert.equal((await call(s, "POST", `/api/applications/${ref}/ipa`, dealer)).status, 403);
  const ipa = await call<AppJson & { stage: string }>(s, "POST", `/api/applications/${ref}/ipa`, ops);
  assert.equal(ipa.status, 200);
  assert.equal(ipa.json.stage, "IPA");

  const refused = await call<{ error: string; missing: Array<{ label: string; status: string }> }>(s, "POST", `/api/applications/${ref}/aa`, ops);
  assert.equal(refused.status, 409);
  assert.deepEqual(refused.json.missing.map((m) => m.label), ["Hirer", "Guarantor"]);
  const view = (await call<AppJson & { aaCheck: { ready: boolean; missing: unknown[] } }>(s, "GET", `/api/applications/${ref}`, ops)).json;
  assert.equal(view.aaCheck.ready, false);
  assert.equal(view.aaCheck.missing.length, 2);

  for (const [i, uinfin] of ["F4440488P", "G4440425M"].entries()) {
    const tokens = (await portalTokens(s, dealer, ref)).reverse();
    const open = await call<OpenJson>(s, "POST", `/api/verify/${tokens[i]}/open`);
    await consentOnGateway(s, open.json.redirectUrl, uinfin);
  }
  await call(s, "POST", "/api/demo/run-job", ops);
  const aa = await call<AppJson & { stage: string }>(s, "POST", `/api/applications/${ref}/aa`, ops);
  assert.equal(aa.status, 200);
  assert.equal(aa.json.stage, "AA");
});
