// Mapping of MockPass Myinfo v3 person data to the fields shown on the review screen and to Ops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapMyinfoV3 } from "../server/gateway/mockpass.ts";

const personas = JSON.parse(readFileSync("node_modules/@opengovsg/mockpass/static/myinfo/v3.json", "utf8")).personas;

test("maps a MockPass Myinfo v3 persona", () => {
  const p = mapMyinfoV3(personas.S9812379B);
  assert.equal(p.uinfin, "S9812379B");
  assert.equal(p.name, "LIM YONG XIANG");
  assert.equal(p.sex, "MALE");
  assert.equal(p.dob, "1980-10-06");
  assert.equal(p.employer, "HEALTH CARE PTE LTD");
  assert.match(p.regAddress, /123 LORONG 1 TOA PAYOH, #12-22, TOA PAYOH VIEW, Singapore 310123/);
  assert.equal(p.mobile, "+65 97399245");
  assert.equal(p.noaHistory[0]?.amount, 214500);
  assert.ok(p.cpfMonths > 0);
  assert.equal(p.hdbType, "3-ROOM FLAT (HDB)");
  assert.equal(p.hdbOutstandingLoan, 600000);
});

test("every MockPass persona maps without throwing", () => {
  for (const [uinfin, raw] of Object.entries(personas)) assert.equal(mapMyinfoV3(raw as Record<string, unknown>).uinfin, uinfin);
});
