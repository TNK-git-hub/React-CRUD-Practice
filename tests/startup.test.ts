// D-03: the server refuses to start without a valid MYINFO_ENCRYPTION_KEY; there is no default key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadKey } from "../server/crypto.ts";

function startServer(key: string | undefined) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", PORT: "0" };
  if (key !== undefined) env.MYINFO_ENCRYPTION_KEY = key;
  return spawnSync(process.execPath, ["server/index.ts"], { env, encoding: "utf8", timeout: 15_000 });
}

test("D-03 missing MYINFO_ENCRYPTION_KEY: clear error, the server does not start", () => {
  const r = startServer(undefined);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /MYINFO_ENCRYPTION_KEY is not set/);
  assert.doesNotMatch(r.stdout, /demo running/);
});

test("D-03 malformed MYINFO_ENCRYPTION_KEY: clear error, the server does not start", () => {
  for (const bad of ["", "abc", "z".repeat(64), "a".repeat(63)]) {
    const r = startServer(bad);
    assert.equal(r.status, 1, `key ${JSON.stringify(bad)}`);
    assert.match(r.stderr, /MYINFO_ENCRYPTION_KEY (is not set|must be 64 hexadecimal characters)/);
    assert.doesNotMatch(r.stdout, /demo running/);
  }
});

test("D-03 loadKey has no fallback key", () => {
  assert.throws(() => loadKey(undefined), /not set/);
  assert.throws(() => loadKey("  "), /not set/);
  assert.throws(() => loadKey("g".repeat(64)), /64 hexadecimal/);
  assert.equal(loadKey("ab".repeat(32)).length, 32);
});
