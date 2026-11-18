// What the dealer and Ops screens receive. Labels follow D-25 and D-38.
import { STATUS_LABELS, activityFor } from "./activity.ts";
import { decrypt } from "./crypto.ts";
import { maskNric } from "./nric.ts";
import type { MyinfoPerson } from "./personas.ts";
import { checkAa } from "./verification/approval.ts";
import { currentLink } from "./verification/model.ts";
import type { Application, AuditEvent, Party } from "./verification/model.ts";
import { DEALERS } from "./verification/users.ts";
import type { User } from "./verification/users.ts";

export function partyStatusLabel(party: Party): string {
  return STATUS_LABELS[currentLink(party).status];
}

export function allFulfilled(app: Application): boolean {
  return app.parties.every((p) => currentLink(p).status === "FULFILLED");
}

/** D-25 */
export function opsStatusLabel(app: Application): string {
  if (app.stage === "Declined") return "Declined";
  if (app.stage === "AA") return "Approved — AA";
  if (app.stage === "IPA") return "Approved — IPA";
  return allFulfilled(app) ? "Credit Review" : "Pending";
}

export function canSee(user: User, app: Application): boolean {
  return user.kind === "ops" || app.dealerId === user.dealerId;
}

export interface ViewContext {
  user: User;
  key: Buffer;
  portalUrl: (token: string) => string;
}

function partyView(p: Party, ctx: ViewContext) {
  const link = currentLink(p);
  const ops = ctx.user.kind === "ops";
  let myinfo: MyinfoPerson | null = null;
  if (ops && p.myinfoSealed) {
    try {
      myinfo = decrypt<MyinfoPerson>(ctx.key, p.myinfoSealed);
    } catch {
      myinfo = null;
    }
  }
  const view = {
    id: p.id,
    role: p.role,
    label: p.label,
    name: p.name,
    /** D-41: masked everywhere; the full value only through the audited reveal request. */
    nricMasked: maskNric(p.nric),
    email: p.email,
    mobile: p.mobile,
    status: partyStatusLabel(p),
    linkStatus: link.status,
    triggerAt: p.triggerAt,
    sentAt: link.sentAt ?? null,
    expiresAt: link.expiresAt ?? null,
    openedAt: link.openedAt ?? null,
    fulfilledAt: p.fulfilledAt ?? null,
    linkUrl: link.status === "QUEUED" ? null : ctx.portalUrl(link.portalToken),
    myinfo: myinfo ? { ...myinfo, uinfin: maskNric(myinfo.uinfin) } : null,
    resends: p.resendsAt.length,
    /** Every link, oldest first; a link that is not the current one is labelled "no longer valid" whatever its status. */
    history: p.links.map((l) => {
      const current = l.id === p.currentLinkId;
      const label = STATUS_LABELS[l.status];
      return {
        id: l.id,
        status: l.status,
        current,
        label: current ? label : `${label} — no longer valid`,
        reason: l.reason,
        sentAt: l.sentAt ?? null,
        expiresAt: l.expiresAt ?? null,
        closedAt: l.closedAt ?? null,
      };
    }),
  };
  // The NRIC returned by a mismatch belongs to someone else: Ops only, masked; never in a dealer's data.
  return ops ? { ...view, mismatchUinfin: p.mismatchUinfin ? maskNric(p.mismatchUinfin) : null } : view;
}

export function applicationView(app: Application, ctx: ViewContext, audit: readonly AuditEvent[]) {
  return {
    ref: app.ref,
    dealer: DEALERS[app.dealerId] ?? app.dealerId,
    createdBy: app.createdByName,
    createdById: app.createdById,
    createdAt: app.createdAt,
    ltaCode: app.ltaCode,
    carPlate: app.carPlate,
    stage: app.stage,
    ipaAt: app.ipaAt ?? null,
    aaAt: app.aaAt ?? null,
    opsStatus: opsStatusLabel(app),
    allFulfilled: allFulfilled(app),
    /** The server's AA check (same as issueAa): Ops show its reasons in "Cannot issue AA yet". */
    aaCheck: checkAa(app),
    parties: app.parties.map((p) => partyView(p, ctx)),
    /** Activity log for Ops, newest first, in plain sentences. Dealers get none. */
    activity: ctx.user.kind === "ops" ? activityFor(app, audit) : [],
  };
}
