// Webhook signature between the Myinfo gateway and AutoFinance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signWebhook, verifyWebhook } from "../server/gateway/webhook.ts";

const body = JSON.stringify({ event: "myinfo.submitted", linkId: "MP-1", applicationRef: "VMAF-2026-05121", role: "hirer", at: 1 });
const now = Date.UTC(2026, 10, 18, 9, 0, 0);

test("a signed webhook verifies with the same secret", () => {
  assert.equal(verifyWebhook(body, signWebhook(body, "s3cret", now), "s3cret", now), true);
});

test("wrong secret, changed body or missing header is rejected", () => {
  const sig = signWebhook(body, "s3cret", now);
  assert.equal(verifyWebhook(body, sig, "other", now), false);
  assert.equal(verifyWebhook(body.replace("hirer", "guarantor"), sig, "s3cret", now), false);
  assert.equal(verifyWebhook(body, undefined, "s3cret", now), false);
  assert.equal(verifyWebhook(body, "t=1,v1=zz", "s3cret", now), false);
});

test("a signature older than 5 minutes is rejected (replay)", () => {
  const sig = signWebhook(body, "s3cret", now);
  assert.equal(verifyWebhook(body, sig, "s3cret", now + 4 * 60_000), true);
  assert.equal(verifyWebhook(body, sig, "s3cret", now + 6 * 60_000), false);
});
