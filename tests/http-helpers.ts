// HTTP test helpers: a real server (port 0) built from the same runtime as server/index.ts.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { AdjustableClock } from "../server/clock.ts";
import { loadConfig } from "../server/config.ts";
import { createRuntime } from "../server/runtime.ts";
import { FakeClock, T0 } from "./helpers.ts";

const runtimes: Array<{ close: () => Promise<void> }> = [];
/** Register with `after(closeAll)` in each test file. */
export async function closeAll(): Promise<void> {
  for (const r of runtimes.splice(0)) await r.close();
}

export async function start() {
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

export type Started = Awaited<ReturnType<typeof start>>;

export interface PartyJson {
  id: string;
  label: string;
  status: string;
  linkStatus: string;
  myinfo: { name: string } | null;
}
export interface AppJson {
  ref: string;
  parties: PartyJson[];
  allFulfilled: boolean;
  activity: Array<{ type: string; text: string }>;
}
export interface MessageJson {
  channel: string;
  applicationRef: string;
  body: string;
}
export interface OpenJson {
  ref: string;
  redirectUrl: string;
  reason: string;
}

export async function call<T = Record<string, unknown>>(s: Started, method: string, path: string, cookie = "", body?: unknown) {
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

export async function signIn(s: Started, userId: string): Promise<string> {
  const r = await call(s, "POST", "/api/session", "", { userId });
  assert.equal(r.status, 200);
  return (r.headers.get("set-cookie") ?? "").split(";")[0]!;
}

export const input = {
  hirer: { name: "Heng Shi Zheng", nric: "F4440488P", email: "hirer@example.com", mobile: "91234567" },
  guarantor: { name: "Rajesh Kumar", nric: "G4440425M", email: "guarantor@example.com", mobile: "98765432" },
  ltaCode: "A7K29Q",
};

export async function portalTokens(s: Started, cookie: string, ref: string): Promise<string[]> {
  const outbox = await call<MessageJson[]>(s, "GET", "/api/demo/outbox", cookie);
  return outbox.json
    .filter((m) => m.channel === "email" && m.applicationRef === ref)
    .map((m) => /\/verify\/([A-Za-z0-9_-]+)/.exec(m.body)![1]!);
}

export async function consentOnGateway(s: Started, redirectUrl: string, uinfin: string) {
  const linkId = new URL(redirectUrl).pathname.split("/gateway/")[1]!;
  assert.equal((await call(s, "GET", `/gateway-api/${linkId}`)).status, 200);
  assert.equal((await call(s, "POST", `/gateway-api/${linkId}/login`, "", { uinfin })).status, 200);
  assert.equal((await call(s, "POST", `/gateway-api/${linkId}/agree`)).status, 200);
  assert.equal((await call(s, "POST", `/gateway-api/${linkId}/submit`)).status, 200);
  return linkId;
}

