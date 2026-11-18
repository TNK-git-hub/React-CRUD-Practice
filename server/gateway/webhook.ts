// Webhook the gateway pushes to AutoFinance when the customer presses "Submit Application" (or Cancel / Deny).
// Signed like Stripe webhooks: header `x-gateway-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MyinfoPerson } from "../personas.ts";

export const SIGNATURE_HEADER = "x-gateway-signature";

interface EventBase {
  /** Gateway LinkId returned by GetLinkId. */
  linkId: string;
  applicationRef: string;
  role: string;
  /** ms since epoch, when the customer acted. */
  at: number;
}

export type WebhookEvent =
  | (EventBase & { event: "myinfo.submitted"; uinfin: string; person: MyinfoPerson })
  | (EventBase & { event: "myinfo.declined" });

/** AutoFinance's answer, which the gateway uses to pick the page it shows the customer. */
export interface WebhookReply {
  accepted: boolean;
  /** Resulting Singpass status in AutoFinance (Fulfilled, NRIC mismatch, Declined). */
  status?: string;
  reason?: string;
  duplicate?: boolean;
}

export function signWebhook(body: string, secret: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** True when the signature matches and is at most `toleranceSec` old (replay window). */
export function verifyWebhook(body: string, header: string | undefined, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/.test(v1)) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}
