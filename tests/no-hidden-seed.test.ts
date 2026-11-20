// D-59 (2026-11-20): only "Create sample applications" (POST /api/demo/seed) creates sample applications. Demo
// buttons and shortcuts only switch role and navigate; they never create or change data, except that opening the
// hirer's link through /verify counts as the customer opening it (OPENED + one audit event), as in real life.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { call, closeAll, input, portalTokens, signIn, start } from "./http-helpers.ts";
import type { AppJson, Started } from "./http-helpers.ts";

after(closeAll);

const KINDS = ["ops-view", "dealer-view", "hirer-view"] as const;

/** Applications, links, outbox messages and audit events in the database. */
function counts(s: Started) {
  const db = s.rt.db;
  return {
    applications: db.applications.length,
    links: db.applications.reduce((n, a) => n + a.parties.reduce((m, p) => m + p.links.length, 0), 0),
    outbox: db.outbox.length,
    audit: db.audit.length,
  };
}

test("D-59 after a reset, the sample shortcuts create nothing and say to create the samples first", async () => {
  const s = await start();
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/reset", ops);
  const before = counts(s);
  for (const kind of KINDS) {
    const r = await call<{ error: string }>(s, "GET", `/api/demo/shortcut/${kind}`, ops);
    assert.equal(r.status, 409, kind);
    assert.match(r.json.error, /Create sample applications first/);
  }
  const list = (await call<Array<{ kind: string; ref: string | null; hint: string }>>(s, "GET", "/api/demo/shortcuts", ops)).json;
  for (const x of list) assert.deepEqual([x.ref, x.hint], [null, "Create sample applications first"], x.kind);
  assert.deepEqual(counts(s), before, "nothing created");
  assert.equal(before.applications, 0);
});

test("D-59 the shortcuts work once 'Create sample applications' was used, and then create nothing more", async () => {
  const s = await start();
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/seed", ops);
  const before = counts(s);
  for (const kind of KINDS) assert.equal((await call(s, "GET", `/api/demo/shortcut/${kind}`, ops)).status, 200, kind);
  assert.deepEqual(counts(s), before);
});

test("D-59 a sample state that no sample is in any more says so (samples exist)", async () => {
  const s = await start();
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/seed", ops);
  await call(s, "POST", "/api/demo/clock", ops, { advanceHours: 73 });
  await call(s, "POST", "/api/demo/run-job", ops);
  const before = counts(s);
  const hirer = (await call<Array<{ kind: string; ref: string | null; hint: string }>>(s, "GET", "/api/demo/shortcuts", ops)).json.find((x) => x.kind === "hirer-view")!;
  assert.deepEqual([hirer.ref, hirer.hint], [null, "No sample in this state any more: Reset all data, then Create sample applications"]);
  assert.equal((await call(s, "GET", "/api/demo/shortcut/hirer-view", ops)).status, 409);
  assert.deepEqual(counts(s), before);
});

test("D-59 switching role and viewing the same application from both sides changes no data", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/reset", ops);
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const before = counts(s);
  for (let i = 0; i < 3; i++) {
    // what the "Demo: see …" buttons do: sign in as the other role, read the same application
    const asOps = await signIn(s, "u-priya");
    assert.equal((await call<AppJson>(s, "GET", `/api/applications/${ref}`, asOps)).json.ref, ref);
    const asDealer = await signIn(s, "u-alex");
    assert.equal((await call<AppJson>(s, "GET", `/api/applications/${ref}`, asDealer)).json.ref, ref);
    await call(s, "GET", "/api/demo/shortcuts", asOps);
  }
  assert.deepEqual(counts(s), before);
  assert.equal(s.rt.db.applications.length, 1);
});

test("D-59 'see what the hirer gets' = the customer opening the current link: exactly one 'opened' event, nothing else", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const [token] = (await portalTokens(s, dealer, ref)).reverse();
  const before = counts(s);
  for (let i = 0; i < 3; i++) assert.equal((await call(s, "POST", `/api/verify/${token}/open`)).status, 200);
  assert.deepEqual(counts(s), { ...before, audit: before.audit + 1 });
  assert.equal(s.rt.db.audit[0]!.type, "link.opened");
});

test("D-59 the dealer's view is offered only for an application of the demo dealer that a dealer submitted", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/seed", ops);
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const viewer = async (r: string) => (await call<{ dealerUserId: string | null }>(s, "GET", `/api/applications/${r}`, ops)).json.dealerUserId;
  assert.equal(await viewer(ref), "u-alex");
  assert.equal(await viewer("VMAF-2026-05116"), null, "another dealer (Sample Auto)");
  // an application keyed in by Ops (manual entry, UI-23): no dealer's view
  const app = s.rt.db.applications.find((a) => a.ref === ref)!;
  app.createdById = "u-priya";
  assert.equal(await viewer(ref), null);
});
