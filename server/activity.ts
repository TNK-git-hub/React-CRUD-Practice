// The Ops activity log in plain sentences (no internal event codes), times in SGT. Audit details never hold a full
// NRIC (D-41), so neither do these sentences.
import { formatSgt } from "./time.ts";
import type { Application, AuditEvent, LinkStatus } from "./verification/model.ts";

export const STATUS_LABELS: Record<LinkStatus, string> = {
  QUEUED: "Queued",
  SENT: "Pending",
  OPENED: "Pending",
  FULFILLED: "Fulfilled",
  MISMATCH: "NRIC mismatch",
  EXPIRED: "Expired",
  REPLACED: "Replaced",
};

export interface ActivityEntry {
  at: number;
  /** DD-MM-YYYY HH:mm SGT */
  time: string;
  /** Party label ("Hirer", "Guarantor 2"), empty for the application. */
  party: string;
  text: string;
  tone: "ok" | "info" | "bad";
  type: AuditEvent["type"];
}

const str = (v: string | number | undefined) => String(v ?? "");

function sentence(e: AuditEvent): { text: string; tone: ActivityEntry["tone"] } {
  const d = e.details;
  switch (e.type) {
    case "link.queued":
      return { tone: "info", text: `Singpass link requested (${{ submit: "application submitted", resend: "resend", "nric-correction": "details corrected" }[str(d.reason)] ?? str(d.reason)})` };
    case "link.sent":
      return { tone: "info", text: `Link emailed, with an SMS notice; valid until ${formatSgt(Number(d.expiresAt))} SGT` };
    case "link.opened":
      return { tone: "info", text: "Customer opened the link" };
    case "link.blocked":
      return {
        tone: "bad",
        text: {
          replaced: "Customer opened an old link — blocked (a newer link was sent)",
          expired: "Customer opened an expired link — blocked",
          "not-sent": "Customer opened a link that was not sent yet — blocked",
          used: "Customer opened a link that was already used — blocked",
        }[str(d.reason)] ?? "Customer opened a link that is not valid — blocked",
      };
    case "link.resent":
      return { tone: "info", text: `Link resent by ${e.actorName} — reason: ${str(d.reason)}` };
    case "link.replaced":
      return { tone: "info", text: "Previous link cancelled (replaced by a new link)" };
    case "link.expired":
      return { tone: "bad", text: "Link expired without a result" };
    case "result.rejected":
      return {
        tone: "bad",
        text: `Result rejected: ${d.reason === "old-link" ? "the customer used an old link" : "the link had expired"} (returned NRIC ${str(d.returned)}, ${d.nricMatches === "yes" ? "matches" : "does not match"})`,
      };
    case "party.fulfilled":
      return { tone: "ok", text: "MyInfo received, NRIC matches — Fulfilled" };
    case "party.mismatch":
      return { tone: "bad", text: `NRIC mismatch: MyInfo returned ${str(d.returned)}, the dealer entered ${str(d.expected)} — data not attached` };
    case "party.corrected": {
      const changes = [
        d.nricFrom ? `NRIC ${str(d.nricFrom)} → ${str(d.nricTo)}` : "",
        d.emailFrom ? `email ${str(d.emailFrom)} → ${str(d.emailTo)}` : "",
      ].filter(Boolean);
      const after = d.newLink === "no" ? " (verification kept)" : " — new link issued";
      return { tone: "info", text: `Details corrected by ${e.actorName}: ${changes.join(", ")}${after} — reason: ${str(d.reason)}` };
    }
    case "nric.viewed":
      return { tone: "info", text: `${e.actorName} viewed the full NRIC ${d.which === "returned" ? "returned by MyInfo" : "entered by the dealer"}` };
    case "ipa.issued":
      return { tone: "ok", text: `IPA issued by ${e.actorName}` };
    case "aa.issued":
      return { tone: "ok", text: `AA issued by ${e.actorName}` };
    case "aa.refused": {
      const missing = str(d.missing)
        .split(", ")
        .map((m) => {
          const [label, status] = m.split(": ");
          return `${label} (${STATUS_LABELS[status as LinkStatus] ?? status})`;
        })
        .join(", ");
      return { tone: "bad", text: `AA refused — Singpass not complete for ${missing}` };
    }
  }
}

export function activityFor(app: Application, audit: readonly AuditEvent[]): ActivityEntry[] {
  return audit
    .filter((e) => e.applicationRef === app.ref)
    .map((e) => ({
      at: e.at,
      time: `${formatSgt(e.at)} SGT`,
      party: app.parties.find((p) => p.id === e.partyId)?.label ?? "",
      type: e.type,
      ...sentence(e),
    }));
}
