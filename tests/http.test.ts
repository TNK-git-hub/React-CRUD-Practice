// Step 3b: the HTTP server runs the main flow on the new service (no old /v/{token} behaviour left).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { AdjustableClock } from "../server/clock.ts";
import { loadConfig } from "../server/config.ts";
import { createRuntime } from "../server/runtime.ts";
import { FakeClock, H, T0 } from "./helpers.ts";

const runtimes: Array<{ close: () => Promise<void> }> = [];
after(async () => {
  for (const r of runtimes) await r.close();
});

async function start() {
  const base = new FakeClock(T0);
  const clock = new AdjustableClock(base);
  const rt = createRuntime({
    config: loadConfig({ PUBLIC_BASE_URL: "http://phone.test" }),
    clock,
    dbFile: null,
    key: randomBytes(32),
    email: { send: async () => ({ delivered: false }) },
    smtpConfigured: false,
  });
  await new Promise<void>((resolve) => rt.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(rt.server.address() as AddressInfo).port}`;
  runtimes.push({ close: () => rt.close() });
  return { rt, url, base };
}

type Started = Awaited<ReturnType<typeof start>>;

interface PartyJson {
  id: string;
  label: string;
  status: string;
  linkStatus: string;
  myinfo: { name: string } | null;
}
interface AppJson {
  ref: string;
  parties: PartyJson[];
  allFulfilled: boolean;
  activity: Array<{ type: string; details: Record<string, string> }>;
}
interface MessageJson {
  channel: string;
  applicationRef: string;
  body: string;
}
interface OpenJson {
  ref: string;
  redirectUrl: string;
  reason: string;
}

async function call<T = Record<string, unknown>>(s: Started, method: string, path: string, cookie = "", body?: unknown) {
  const res = await fetch(s.url + path, {
    method,
    redirect: "manual",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, json, headers: res.headers };
}

async function signIn(s: Started, userId: string): Promise<string> {
  const r = await call(s, "POST", "/api/session", "", { userId });
  assert.equal(r.status, 200);
  return (r.headers.get("set-cookie") ?? "").split(";")[0]!;
}

const input = {
  hirer: { name: "Heng Shi Zheng", nric: "F4440488P", email: "hirer@example.com", mobile: "91234567" },
  guarantor: { name: "Rajesh Kumar", nric: "G4440425M", email: "guarantor@example.com", mobile: "98765432" },
  ltaCode: "A7K29Q",
};

async function portalTokens(s: Started, cookie: string, ref: string): Promise<string[]> {
  const outbox = await call<MessageJson[]>(s, "GET", "/api/demo/outbox", cookie);
  return outbox.json
    .filter((m) => m.channel === "email" && m.applicationRef === ref)
    .map((m) => /\/verify\/([A-Za-z0-9_-]+)/.exec(m.body)![1]!);
}

async function consentOnGateway(s: Started, redirectUrl: string, uinfin: string) {
  const linkId = new URL(redirectUrl).pathname.split("/gateway/")[1]!;
  assert.equal((await call(s, "GET", `/gateway-api/${linkId}`)).status, 200);
  assert.equal((await call(s, "POST", `/gateway-api/${linkId}/login`, "", { uinfin })).status, 200);
  assert.equal((await call(s, "POST", `/gateway-api/${linkId}/agree`)).status, 200);
  assert.equal((await call(s, "POST", `/gateway-api/${linkId}/submit`)).status, 200);
  return linkId;
}

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
  assert.equal(asDealer.json.parties[0]!.myinfo, null, "dealers do not see Myinfo data");
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
  assert.ok(app.activity.some((e) => e.type === "result.rejected" && e.details.reason === "old-link"));
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
