// D-61: the Quick Apply name combobox and "Fill sample" use the simulated gateway's own persona list (server/personas.ts),
// served by /api/config; nothing is copied into the frontend.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PERSONAS } from "../server/personas.ts";
import { call, closeAll, start } from "./http-helpers.ts";

after(closeAll);

interface Config {
  personas: Array<{ name: string; nric: string }>;
  samples: Record<"hirer" | "guarantor" | "guarantor2", { name: string; nric: string }>;
}

test("D-61 /api/config lists the 9 Singpass test personas of the simulated gateway (name + NRIC only)", async () => {
  const s = await start();
  const cfg = (await call<Config>(s, "GET", "/api/config")).json;
  assert.deepEqual(cfg.personas, PERSONAS.map((p) => ({ name: p.name, nric: p.uinfin })));
  assert.equal(cfg.personas.length, 9);
  for (const p of cfg.personas) assert.deepEqual(Object.keys(p).sort(), ["name", "nric"], "no other Myinfo data");
});

test("D-61 'Fill sample' people come from the same list: name and NRIC always match, three different people", async () => {
  const s = await start();
  const cfg = (await call<Config>(s, "GET", "/api/config")).json;
  const byNric = new Map(PERSONAS.map((p) => [p.uinfin, p.name]));
  for (const who of ["hirer", "guarantor", "guarantor2"] as const) {
    const p = cfg.samples[who];
    assert.ok(p.name, `${who} has a name`);
    assert.equal(byNric.get(p.nric), p.name, `${who}: name belongs to the NRIC`);
  }
  assert.equal(new Set(Object.values(cfg.samples).map((p) => p.nric)).size, 3);
});
