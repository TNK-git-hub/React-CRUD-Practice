// Alignment with the prototype walkthrough (docs/requirements/ui-spec-from-prototype.md, [CORE] screens; D-52 … D-56):
// dealer tracker sentences (Q6), no Myinfo data for dealers (Q8), Ops list search and filters (UI-15), masked LTA
// Access Code, the dealer profile for the Dealer Declaration (Q5), Demo Control sample shortcuts (D-50).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { call, closeAll, consentOnGateway, input, portalTokens, signIn, start } from "./http-helpers.ts";
import type { AppJson, OpenJson } from "./http-helpers.ts";

after(closeAll);

interface Step { key: string; state: string; title: string; desc: string }
interface ListApp { ref: string; dealerId: string; ltaCodeMasked: string; tracker: Step[]; parties: Array<Record<string, unknown>> }

async function seeded() {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/seed", ops);
  return { s, dealer, ops };
}
const refs = (apps: ListApp[]) => apps.map((a) => a.ref).sort();
const tracker = async (s: Awaited<ReturnType<typeof start>>, cookie: string, ref: string) =>
  (await call<ListApp>(s, "GET", `/api/applications/${ref}`, cookie)).json.tracker;

// ---------------------------------------------------------------- Q8: Myinfo data is for Ops only

test("Q8 a dealer never receives Myinfo data, even once the person is Fulfilled; Ops do", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const [tokenH] = (await portalTokens(s, dealer, ref)).reverse();
  const open = await call<OpenJson>(s, "POST", `/api/verify/${tokenH}/open`);
  await consentOnGateway(s, open.json.redirectUrl, "F4440488P");
  await call(s, "POST", "/api/demo/run-job", ops);

  const opsHirer = (await call<ListApp>(s, "GET", `/api/applications/${ref}`, ops)).json.parties[0]!;
  const mi = opsHirer.myinfo as Record<string, string>;
  assert.ok(mi, "Ops see the Myinfo data");
  for (const path of [`/api/applications/${ref}`, "/api/applications"]) {
    const r = await call(s, "GET", path, dealer);
    const text = JSON.stringify(r.json);
    assert.ok(!text.includes('"myinfo"'), `${path}: no myinfo field for a dealer`);
    for (const v of [mi.dob, mi.regAddress, mi.employer]) assert.ok(!text.includes(v!), `${path} leaks ${v}`);
  }
});

// ---------------------------------------------------------------- LTA Access Code masked (Proposal 3.1)

test("the LTA Access Code is masked in every view (no full value), like an NRIC", async () => {
  const { s, dealer, ops } = await seeded();
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  for (const who of [dealer, ops]) {
    const one = (await call<ListApp>(s, "GET", `/api/applications/${ref}`, who)).json;
    assert.equal(one.ltaCodeMasked, "A7****9Q");
    const list = (await call<ListApp[]>(s, "GET", "/api/applications", who)).json;
    const text = JSON.stringify(list) + JSON.stringify(one);
    assert.ok(!text.includes("A7K29Q") && !text.includes("DEMO01"), "full code never sent");
    assert.ok(!text.includes('"ltaCode"'));
  }
  const sample = (await call<ListApp>(s, "GET", "/api/applications/VMAF-2026-05117", ops)).json;
  assert.equal(sample.ltaCodeMasked, "DE****01");
});

// ---------------------------------------------------------------- UI-15: search and filters

test("UI-15 search by hirer name, car plate or application ref (case-insensitive, partial)", async () => {
  const { s, ops } = await seeded();
  const q = async (v: string) => refs((await call<ListApp[]>(s, "GET", `/api/applications?q=${encodeURIComponent(v)}`, ops)).json);
  assert.deepEqual(await q("aisha"), ["VMAF-2026-05117"]);
  assert.deepEqual(await q("Binte Rahman"), ["VMAF-2026-05117"]);
  assert.deepEqual(await q("sla4410"), ["VMAF-2026-05117"]);
  assert.deepEqual(await q("05117"), ["VMAF-2026-05117"]);
  assert.deepEqual(await q("vmaf-2026-0511"), ["VMAF-2026-05114", "VMAF-2026-05115", "VMAF-2026-05116", "VMAF-2026-05117", "VMAF-2026-05118", "VMAF-2026-05119"]);
  assert.deepEqual(await q("nobody here"), []);
  assert.equal((await q("")).length, 6, "an empty search returns everything");
});

test("UI-15 search by NRIC: only an exact, complete NRIC matches; the result never shows the full NRIC", async () => {
  const { s, ops } = await seeded();
  const get = (v: string) => call<ListApp[]>(s, "GET", `/api/applications?q=${encodeURIComponent(v)}`, ops);
  const hit = await get("G4440432Q"); // AISHA BINTE RAHMAN, hirer of 05117
  assert.deepEqual(refs(hit.json), ["VMAF-2026-05117"]);
  assert.ok(!JSON.stringify(hit.json).includes("G4440432Q"), "masked in the result");
  assert.deepEqual(refs((await get("  g4440432q ")).json), ["VMAF-2026-05117"], "trimmed, any case (D-21)");
  assert.deepEqual(refs((await get("G4440430W")).json), ["VMAF-2026-05115", "VMAF-2026-05117"], "a guarantor's NRIC too");
  for (const partial of ["G4440432", "4440432Q", "4440432", "432Q", "G****432Q"]) assert.deepEqual((await get(partial)).json, [], `"${partial}" must not match`);
});

test("UI-15 filters: Singpass Fulfilled (Yes = every person) and status, combined with the search", async () => {
  const { s, ops } = await seeded();
  const get = async (qs: string) => refs((await call<ListApp[]>(s, "GET", `/api/applications?${qs}`, ops)).json);
  assert.deepEqual(await get("singpass=yes"), ["VMAF-2026-05114", "VMAF-2026-05115", "VMAF-2026-05116"]);
  assert.deepEqual(await get("singpass=no"), ["VMAF-2026-05117", "VMAF-2026-05118", "VMAF-2026-05119"]);
  assert.deepEqual(await get(`status=${encodeURIComponent("Approved — IPA")}`), ["VMAF-2026-05117"]);
  assert.deepEqual(await get("status=Pending"), ["VMAF-2026-05118", "VMAF-2026-05119"]);
  assert.deepEqual(await get(`status=Pending&singpass=yes`), []);
  assert.deepEqual(await get(`singpass=no&q=wang`), ["VMAF-2026-05119"]);
  assert.deepEqual(await get("singpass=all&status=all"), await get(""));
  assert.equal((await call(s, "GET", "/api/applications?singpass=maybe", ops)).status, 400);
});

test("UI-15 a dealer's search still only returns the dealer's own applications", async () => {
  const { s, dealer } = await seeded();
  const r = await call<ListApp[]>(s, "GET", "/api/applications?q=VMAF", dealer);
  assert.ok(r.json.length > 0);
  for (const a of r.json) assert.equal(a.dealerId, "d-demo");
});

// ---------------------------------------------------------------- Q6: dealer tracker sentences

test("Q6 tracker, just submitted: four steps, the email-link wording, never 'Singpass app'", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const t = await tracker(s, dealer, ref);
  assert.deepEqual(t.map((x) => [x.title, x.state]), [
    ["Application Submitted", "done"],
    ["Pending Singpass Verification", "current"],
    ["Credit Review", "todo"],
    ["Awaiting ValueMax Decision", "todo"],
  ]);
  assert.equal(t[0]!.desc, "Application details submitted by the dealer");
  assert.equal(t[1]!.desc, "Awaiting approval from the hirer and guarantor through the Singpass link emailed to each of them");
  assert.equal(t[2]!.desc, "ValueMax Ops is reviewing the submitted documents");
  assert.equal(t[3]!.desc, "IPA, AA, a request for more documents, or a decline will appear here once ValueMax Ops completes its review.");
  assert.doesNotMatch(JSON.stringify(t), /Singpass app/);
});

test("Q6 tracker, by state of the sample applications", async () => {
  const { s, dealer, ops } = await seeded();
  // 05119: one hirer, link pending (Sample Auto, so read as Ops)
  const pending = await tracker(s, ops, "VMAF-2026-05119");
  assert.equal(pending[1]!.desc, "Awaiting the hirer's approval through the Singpass link emailed to them");

  // 05117: IPA issued, hirer fulfilled, guarantor pending
  const ipa = await tracker(s, dealer, "VMAF-2026-05117");
  assert.deepEqual(ipa.map((x) => [x.title, x.state]), [
    ["Application Submitted", "done"],
    ["Pending Singpass Verification", "current"],
    ["Credit Review", "done"],
    ["IPA Issued", "done"],
  ]);
  assert.equal(ipa[1]!.desc, "Still awaiting the guarantor's Singpass approval — an AA (final approval) needs this to complete first");
  assert.equal(ipa[2]!.desc, "ValueMax Ops has completed its review");
  assert.equal(ipa[3]!.desc, "In-Principle Approval — click below to view the notice");

  // 05116: everyone fulfilled, nothing issued yet (Credit Review is current)
  const review = await tracker(s, ops, "VMAF-2026-05116");
  assert.deepEqual(review.map((x) => x.state), ["done", "done", "current", "todo"]);
  assert.equal(review[1]!.desc, "Hirer's Singpass MyInfo has been retrieved");
  assert.equal(review[3]!.title, "Awaiting ValueMax Decision");

  // 05115: AA issued, hirer and guarantor fulfilled
  const aa = await tracker(s, dealer, "VMAF-2026-05115");
  assert.deepEqual(aa.map((x) => x.state), ["done", "done", "done", "done"]);
  assert.equal(aa[1]!.desc, "Singpass MyInfo has been retrieved for the hirer and guarantor");
  assert.equal(aa[3]!.title, "Approved — AA");
  assert.match(aa[3]!.desc, /^Approval Advice \(final approval\) issued \d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);

  // 05114: declined
  const declined = await tracker(s, dealer, "VMAF-2026-05114");
  assert.deepEqual([declined[3]!.title, declined[3]!.desc, declined[3]!.state], ["Application Declined", "See the message below", "bad"]);
});

// ---------------------------------------------------------------- Q5: Dealer Declaration, pre-filled from the profile

test("Q5 the signed-in dealer user carries the dealer profile for the Dealer Declaration", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const { user } = (await call<{ user: Record<string, string> }>(s, "GET", "/api/session", dealer)).json;
  assert.deepEqual([user.org, user.orgRegNo, user.name, user.email], ["Demo Motors Pte Ltd", "202612345D", "Alex Tan", "alex.tan@demomotors.sg"]);
});

// ---------------------------------------------------------------- D-50: sample shortcuts live in Demo Control

interface Shortcut { kind: string; ref: string | null; label: string }

test("D-50 Demo Control lists the sample shortcuts with their state and application ref", async () => {
  const { s, ops } = await seeded();
  const list = (await call<Shortcut[]>(s, "GET", "/api/demo/shortcuts", ops)).json;
  assert.deepEqual(list.map((x) => [x.kind, x.ref, x.label]), [
    ["ops-view", "VMAF-2026-05117", "Open sample: IPA issued, guarantor pending (VMAF-2026-05117)"],
    ["dealer-view", "VMAF-2026-05117", "Open sample: hirer fulfilled, guarantor pending (VMAF-2026-05117)"],
    ["hirer-view", "VMAF-2026-05119", "Open sample: hirer's link pending, customer page (VMAF-2026-05119)"],
  ]);
  // each label's ref is where the shortcut really goes
  for (const x of list) {
    const r = await call<{ ref: string }>(s, "GET", `/api/demo/shortcut/${x.kind}`, ops);
    assert.equal(r.json.ref, x.ref, x.kind);
  }
});

test("D-50 a shortcut label says what each missing person is waiting for (pending vs link expired)", async () => {
  const { s, ops } = await seeded();
  await call(s, "POST", "/api/demo/clock", ops, { advanceHours: 73 });
  await call(s, "POST", "/api/demo/run-job", ops);
  const list = (await call<Shortcut[]>(s, "GET", "/api/demo/shortcuts", ops)).json;
  assert.equal(list.find((x) => x.kind === "ops-view")!.label, "Open sample: IPA issued, guarantor link expired (VMAF-2026-05117)");
  assert.equal(list.find((x) => x.kind === "dealer-view")!.ref, null, "no sample with someone still pending");
});

test("D-50 a shortcut with no sample in that state is listed without a ref", async () => {
  const s = await start();
  const ops = await signIn(s, "u-priya");
  const list = (await call<Shortcut[]>(s, "GET", "/api/demo/shortcuts", ops)).json;
  assert.equal(list.length, 3);
  for (const x of list) assert.equal(x.ref, null);
});

test("the application view says which dealer owns it (the Ops page shows the dealer's view only for the demo dealer)", async () => {
  const { s, ops } = await seeded();
  assert.equal((await call<ListApp>(s, "GET", "/api/applications/VMAF-2026-05117", ops)).json.dealerId, "d-demo");
  assert.equal((await call<ListApp>(s, "GET", "/api/applications/VMAF-2026-05116", ops)).json.dealerId, "d-sample");
});
