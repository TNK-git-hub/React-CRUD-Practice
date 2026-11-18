// Step 6 (API level): what each screen receives — masking, no personal data on customer pages, readable activity log,
// link history, demo clock, second guarantor.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { call, closeAll, consentOnGateway, input, portalTokens, signIn, start } from "./http-helpers.ts";
import type { AppJson, OpenJson, Started } from "./http-helpers.ts";

after(closeAll);

const FULL_NRIC = /[STFGM]\d{7}[A-Z]/;

interface ViewParty {
  id: string;
  label: string;
  status: string;
  nricMasked: string;
  mismatchUinfin?: string | null;
  history: Array<{ status: string; current: boolean; label: string }>;
}
interface View {
  ref: string;
  parties: ViewParty[];
  activity: Array<{ time: string; party: string; text: string; tone: string }>;
}

async function mismatchCase() {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const ref = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json.ref;
  const [tokenH] = (await portalTokens(s, dealer, ref)).reverse();
  const open = await call<OpenJson>(s, "POST", `/api/verify/${tokenH}/open`);
  await consentOnGateway(s, open.json.redirectUrl, "F4440489M"); // someone else's Singpass
  await call(s, "POST", "/api/demo/run-job", ops);
  return { s, dealer, ops, ref };
}

test("dealer never receives the NRIC returned by a mismatch; only 'NRIC mismatch'", async () => {
  const { s, dealer, ref } = await mismatchCase();
  for (const path of [`/api/applications/${ref}`, "/api/applications"]) {
    const r = await call(s, "GET", path, dealer);
    const text = JSON.stringify(r.json);
    assert.ok(!text.includes("mismatchUinfin"), `${path} has no mismatchUinfin field`);
    assert.ok(!text.includes("F4440489M") && !text.includes("F****489M"), `${path} never contains the returned NRIC`);
  }
  const view = (await call<View>(s, "GET", `/api/applications/${ref}`, dealer)).json;
  assert.equal(view.parties[0]!.status, "NRIC mismatch");
  assert.deepEqual(view.activity, [], "dealers get no activity log");
});

test("Ops see the returned NRIC masked; the full value needs an explicit, audited request (Ops only)", async () => {
  const { s, dealer, ops, ref } = await mismatchCase();
  const view = (await call<View>(s, "GET", `/api/applications/${ref}`, ops)).json;
  const hirer = view.parties[0]!;
  assert.equal(hirer.mismatchUinfin, "F****489M");
  assert.ok(!FULL_NRIC.test(JSON.stringify(view)), "no full NRIC in the Ops view");

  const base = `/api/applications/${ref}/parties/${hirer.id}/reveal-nric`;
  assert.equal((await call(s, "POST", base, dealer, { which: "returned" })).status, 403);
  const shown = await call<{ nric: string }>(s, "POST", base, ops, { which: "returned" });
  assert.equal(shown.status, 200);
  assert.equal(shown.json.nric, "F4440489M");
  const entered = await call<{ nric: string }>(s, "POST", base, dealer, { which: "entered" });
  assert.equal(entered.json.nric, "F4440488P", "the dealer may see the NRIC they entered, on request");

  const log = (await call<View>(s, "GET", `/api/applications/${ref}`, ops)).json.activity;
  const views = log.filter((e) => /viewed the full NRIC/.test(e.text));
  assert.equal(views.length, 2);
  assert.ok(views.some((e) => e.text === "Priya Nair viewed the full NRIC returned by MyInfo"));
  assert.ok(views.some((e) => e.text === "Alex Tan viewed the full NRIC entered by the dealer"));
});

test("NRICs are masked in every list and detail view, for dealer and Ops", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/applications", dealer, input);
  await call(s, "POST", "/api/demo/seed", ops);
  for (const who of [dealer, ops]) {
    const list = await call<View[]>(s, "GET", "/api/applications", who);
    assert.ok(list.json.length > 0);
    assert.ok(!FULL_NRIC.test(JSON.stringify(list.json)));
    assert.match(list.json[0]!.parties[0]!.nricMasked, /^[STFGM]\*{4}\d{3}[A-Z]$/);
  }
});

test("the customer portal shows no personal information (valid or blocked link)", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const created = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json;
  const [token] = (await portalTokens(s, dealer, created.ref)).reverse();
  const open = await call<Record<string, unknown>>(s, "POST", `/api/verify/${token}/open`);
  assert.deepEqual(Object.keys(open.json).sort(), ["dealer", "expiresAt", "ok", "redirectUrl", "ref", "role"]);
  const personal = [input.hirer.name, input.hirer.name.toUpperCase(), input.hirer.nric, "F****488P", input.hirer.email, input.hirer.mobile];
  for (const v of personal) assert.ok(!JSON.stringify(open.json).includes(v), v);

  await call(s, "POST", `/api/applications/${created.ref}/parties/${created.parties[0]!.id}/resend`, ops, { reason: "test" });
  const blocked = await call<Record<string, unknown>>(s, "POST", `/api/verify/${token}/open`);
  assert.equal(blocked.status, 410);
  assert.deepEqual(Object.keys(blocked.json).sort(), ["error", "reason"]);
});

async function oldLinkCase() {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const ops = await signIn(s, "u-priya");
  const created = (await call<AppJson>(s, "POST", "/api/applications", dealer, input)).json;
  const [token] = (await portalTokens(s, dealer, created.ref)).reverse();
  const old = await call<OpenJson>(s, "POST", `/api/verify/${token}/open`);
  await call(s, "POST", `/api/applications/${created.ref}/parties/${created.parties[0]!.id}/resend`, ops, { reason: "Customer lost the email" });
  await consentOnGateway(s, old.json.redirectUrl, "F4440488P");
  await call(s, "POST", "/api/demo/run-job", ops);
  return { s, ops, ref: created.ref };
}

test("activity log: readable sentences, SGT time, party, no internal event codes or full NRIC", async () => {
  const { s, ops, ref } = await oldLinkCase();
  const log = (await call<View>(s, "GET", `/api/applications/${ref}`, ops)).json.activity;
  assert.ok(log.length >= 5);
  const rejected = log.find((e) => e.text.startsWith("Result rejected"));
  assert.ok(rejected);
  assert.equal(rejected.text, "Result rejected: the customer used an old link (returned NRIC F****488P, matches)");
  assert.equal(rejected.party, "Hirer");
  assert.equal(rejected.tone, "bad");
  assert.ok(log.some((e) => e.text === "Link resent by Priya Nair — reason: Customer lost the email"));
  for (const e of log) {
    assert.match(e.time, /^\d{2}-\d{2}-\d{4} \d{2}:\d{2} SGT$/);
    assert.doesNotMatch(e.text, /\b(link|party|result|aa|ipa|nric)\.[a-z]+\b/, "no internal code");
    assert.doesNotMatch(e.text, FULL_NRIC);
  }
});

test("link history: links that are no longer current say so, whatever their status", async () => {
  const { s, ops, ref } = await oldLinkCase();
  const hirer = (await call<View>(s, "GET", `/api/applications/${ref}`, ops)).json.parties[0]!;
  assert.deepEqual(
    hirer.history.map((h) => [h.status, h.current, h.label]),
    [
      ["REPLACED", false, "Replaced — no longer valid"],
      ["SENT", true, "Pending"],
    ],
  );

  // a FULFILLED link that is no longer current after an NRIC correction
  const dealer = await signIn(s, "u-alex");
  const tokens = (await portalTokens(s, dealer, ref)).reverse();
  const open = await call<OpenJson>(s, "POST", `/api/verify/${tokens[2]}/open`); // the resent hirer link
  await consentOnGateway(s, open.json.redirectUrl, "F4440488P");
  await call(s, "POST", "/api/demo/run-job", ops);
  await call(s, "POST", `/api/applications/${ref}/parties/${hirer.id}/correct`, ops, { nric: "F4440489M", reason: "Wrong NRIC" });
  const after = (await call<View>(s, "GET", `/api/applications/${ref}`, ops)).json.parties[0]!;
  assert.deepEqual(after.history.map((h) => h.label), ["Replaced — no longer valid", "Fulfilled — no longer valid", "Pending"]);
});

test("demo clock: shown offset and back to real time", async () => {
  const s: Started = await start();
  const ops = await signIn(s, "u-priya");
  await call(s, "POST", "/api/demo/clock", ops, { advanceHours: 73 });
  assert.equal((await call<{ offsetMs: number }>(s, "GET", "/api/demo/state", ops)).json.offsetMs, 73 * 3_600_000);
  const reset = await call<{ offsetMs: number }>(s, "POST", "/api/demo/clock/reset", ops);
  assert.equal(reset.status, 200);
  assert.equal(reset.json.offsetMs, 0);
});

test("second guarantor: up to two guarantors through the API", async () => {
  const s = await start();
  const dealer = await signIn(s, "u-alex");
  const body = {
    hirer: input.hirer,
    guarantors: [input.guarantor, { name: "Maria Santos", nric: "G4440427W", email: "g2@example.com", mobile: "87654321" }],
    ltaCode: "A7K29Q",
  };
  const created = await call<AppJson>(s, "POST", "/api/applications", dealer, body);
  assert.equal(created.status, 201);
  assert.deepEqual(created.json.parties.map((p) => [p.label, p.linkStatus]), [
    ["Hirer", "SENT"],
    ["Guarantor 1", "SENT"],
    ["Guarantor 2", "SENT"],
  ]);
});
