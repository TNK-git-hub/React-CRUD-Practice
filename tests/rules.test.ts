// Minimum tests required by the brief §9: NRIC validation, link expiry and replacement, NRIC comparison, AA lock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidMobile, isValidNric, nricMatches } from "../server/nric.ts";
import { PERSONAS } from "../server/personas.ts";
import { Store, USERS, partyStatus } from "../server/store.ts";
import type { User } from "../server/store.ts";

const dealer = USERS.find((u) => u.kind === "dealer") as User;
const T0 = Date.UTC(2026, 10, 17, 4, 0);
const H = 3_600_000;

function newApp(store: Store, withGuarantor = true) {
  return store.createApplication(
    {
      hirer: { name: "Heng Shi Zheng", nric: "F4440488P", email: "h@example.com", mobile: "9123 4567" },
      guarantor: withGuarantor ? { name: "Rajesh", nric: "G4440425M", email: "h@example.com", mobile: "98765432" } : null,
      ltaCode: "A7K29Q",
    },
    dealer,
    T0,
  );
}
const ok = (uinfin: string) => ({ kind: "ok" as const, uinfin, sealed: "x" });

test("NRIC/FIN checksum: test personas and S/T/F/G/M prefixes", () => {
  for (const p of PERSONAS) assert.ok(isValidNric(p.uinfin), p.uinfin);
  assert.ok(isValidNric("S8812345Z"));
  assert.ok(isValidNric(" s8812345z ")); // trimmed + upper-cased (D-12)
  assert.ok(!isValidNric("S8812345A"));
  assert.ok(!isValidNric("X1234567A"));
  assert.ok(!isValidNric("S881234Z"));
});

test("mobile: 8 digits starting with 8 or 9 (D-13)", () => {
  assert.ok(isValidMobile("9123 4567"));
  assert.ok(isValidMobile("81234567"));
  assert.ok(!isValidMobile("61234567"));
  assert.ok(!isValidMobile("912345678"));
});

test("application refs start at VMAF-<year>-05121 (D-26)", () => {
  const s = new Store();
  assert.equal(newApp(s).ref, "VMAF-2026-05121");
  assert.equal(newApp(s).ref, "VMAF-2026-05122");
});

test("guarantor NRIC must differ from the hirer's (D-28)", () => {
  const s = new Store();
  assert.throws(() =>
    s.createApplication(
      { hirer: { name: "A", nric: "F4440488P", email: "a@x.io", mobile: "91234567" }, guarantor: { name: "B", nric: "f4440488p", email: "a@x.io", mobile: "91234567" }, ltaCode: "X" },
      dealer,
      T0,
    ),
  );
});

test("link expires after 72 hours", () => {
  const s = new Store({ ttlHours: 72 });
  const app = newApp(s);
  const hirer = app.parties[0]!;
  assert.equal(partyStatus(hirer, T0 + 71 * H), "Pending");
  assert.equal(partyStatus(hirer, T0 + 72 * H), "Expired");
  const token = hirer.links[0]!.token;
  assert.equal(s.checkLink(token, T0 + 73 * H).valid, false);
  assert.throws(() => s.attachResult(token, ok("F4440488P"), T0 + 73 * H), /no longer valid/);
});

test("resend supersedes the pending link; old link is rejected (D-19, D-23)", () => {
  const s = new Store();
  const app = newApp(s);
  const oldToken = app.parties[0]!.links[0]!.token;
  const { link } = s.resend(app.ref, "hirer", T0 + H);
  assert.equal(app.parties[0]!.links[0]!.outcome, "Superseded");
  assert.equal(s.checkLink(oldToken, T0 + 2 * H).valid, false);
  assert.equal(s.checkLink(link.token, T0 + 2 * H).valid, true);
  assert.throws(() => s.attachResult(oldToken, ok("F4440488P"), T0 + 2 * H));
  assert.equal(partyStatus(app.parties[0]!, T0 + 2 * H), "Pending");
  assert.equal(app.notes.length, 1);
});

test("resend after Fulfilled is refused (D-18)", () => {
  const s = new Store();
  const app = newApp(s);
  s.attachResult(app.parties[0]!.links[0]!.token, ok("F4440488P"), T0 + H);
  assert.throws(() => s.resend(app.ref, "hirer", T0 + 2 * H), /already fulfilled/);
});

test("NRIC comparison: match is case-insensitive; mismatch keeps only uinfin (D-21, D-22)", () => {
  const s = new Store();
  const app = newApp(s);
  assert.ok(nricMatches(" f4440488p", "F4440488P "));
  assert.equal(s.attachResult(app.parties[0]!.links[0]!.token, ok(" f4440488p "), T0 + H), "Fulfilled");
  assert.equal(s.attachResult(app.parties[1]!.links[0]!.token, ok("F4440489M"), T0 + H), "NRIC mismatch");
  const g = app.parties[1]!;
  assert.equal(g.mismatchUinfin, "F4440489M");
  assert.equal(g.myinfoEnc, undefined);
  assert.equal(s.checkLink(g.links[0]!.token, T0 + 2 * H).valid, false); // D-16: link used up
});

test("AA is locked on the server until every party is Fulfilled; IPA is not (D-11)", () => {
  const s = new Store();
  const app = newApp(s);
  s.issueIpa(app.ref, T0 + H); // allowed while pending
  assert.throws(() => s.issueAa(app.ref, T0 + H), /Cannot issue AA yet/);
  s.attachResult(app.parties[0]!.links[0]!.token, ok("F4440488P"), T0 + H);
  assert.throws(() => s.issueAa(app.ref, T0 + H), /guarantor/);
  s.attachResult(app.parties[1]!.links[0]!.token, ok("G4440425M"), T0 + H);
  assert.equal(s.issueAa(app.ref, T0 + 2 * H).stage, "AA");
});

test("declined consent ends the link (D-16)", () => {
  const s = new Store();
  const app = newApp(s, false);
  assert.equal(s.attachResult(app.parties[0]!.links[0]!.token, { kind: "declined" }, T0 + H), "Declined");
  assert.throws(() => s.issueAa(app.ref, T0 + H));
});
