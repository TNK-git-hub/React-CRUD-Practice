// What the dealer and Ops screens receive. Labels follow D-25 and D-38.
import { STATUS_LABELS, activityFor } from "./activity.ts";
import { decrypt } from "./crypto.ts";
import { isValidNric, maskNric, nricMatches } from "./nric.ts";
import { formatSgt } from "./time.ts";
import type { MyinfoPerson } from "./personas.ts";
import { checkAa } from "./verification/approval.ts";
import { currentLink } from "./verification/model.ts";
import type { Application, AuditEvent, Party } from "./verification/model.ts";
import { DEALERS, USERS } from "./verification/users.ts";
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

export const OPS_STATUS_LABELS = ["Pending", "Credit Review", "Approved — IPA", "Approved — AA", "Declined"] as const;

export interface ListFilters {
  /** Hirer name, car plate or application ref (partial, any case); or a complete NRIC / FIN (exact only). */
  q?: string;
  /** Singpass Fulfilled? yes = every person Fulfilled. */
  singpass?: "all" | "yes" | "no";
  /** One of OPS_STATUS_LABELS, or "all". */
  status?: string;
}

/**
 * UI-15 search and filters. A query that is a valid NRIC / FIN is compared with each person's full NRIC (exact, D-21)
 * and with nothing else, so a part of an NRIC never finds anyone; results still carry masked NRICs only (D-41).
 */
export function matchesFilters(app: Application, f: ListFilters): boolean {
  if (f.singpass === "yes" && !allFulfilled(app)) return false;
  if (f.singpass === "no" && allFulfilled(app)) return false;
  if (f.status && f.status !== "all" && opsStatusLabel(app) !== f.status) return false;
  const q = (f.q ?? "").trim();
  if (!q) return true;
  if (isValidNric(q)) return app.parties.some((p) => nricMatches(p.nric, q));
  const needle = q.toLowerCase();
  const hirer = app.parties.find((p) => p.role === "hirer");
  return [hirer?.name ?? "", app.carPlate, app.ref].some((v) => v.toLowerCase().includes(needle));
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
  // Myinfo data (Q8) and the NRIC returned by a mismatch (someone else's) are for Ops only, masked; a dealer's data has
  // neither field.
  return ops
    ? { ...view, myinfo: myinfo ? { ...myinfo, uinfin: maskNric(myinfo.uinfin) } : null, mismatchUinfin: p.mismatchUinfin ? maskNric(p.mismatchUinfin) : null }
    : view;
}

/** Proposal 3.1: the LTA Access Code is masked on screen like an NRIC: first 2 and last 2 characters (DEMO01 → DE****01). */
export function maskAccessCode(code: string): string {
  const v = code.trim();
  return v.length > 4 ? `${v.slice(0, 2)}****${v.slice(-2)}` : "****";
}

export interface TrackerStep {
  key: "submitted" | "singpass" | "credit" | "decision";
  state: "done" | "current" | "todo" | "bad";
  title: string;
  desc: string;
}

/** "hirer", "hirer and guarantor", "hirer, guarantor 1 and guarantor 2" */
function people(parties: readonly Party[]): string {
  const names = parties.map((p) => p.label.toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

/**
 * The dealer's Application Status tracker (UI-11, Q6): four steps, the last one named after the outcome. Sentences of
 * the prototype, with "on their Singpass app" replaced by the emailed link of the demo flow (one link per person).
 */
export function dealerTracker(app: Application): TrackerStep[] {
  const fulfilled = allFulfilled(app);
  const waiting = app.parties.filter((p) => currentLink(p).status !== "FULFILLED");
  const decided = app.stage !== "Submitted"; // IPA, AA or Declined
  let singpass: string;
  if (fulfilled)
    singpass = app.parties.length === 1 ? "Hirer's Singpass MyInfo has been retrieved" : `Singpass MyInfo has been retrieved for the ${people(app.parties)}`;
  else if (decided)
    singpass = waiting.length === 1
      ? `Still awaiting the ${people(waiting)}'s Singpass approval — an AA (final approval) needs this to complete first`
      : `Still awaiting Singpass approval from the ${people(waiting)} — an AA (final approval) needs this to complete first`;
  else
    singpass = waiting.length === 1
      ? `Awaiting the ${people(waiting)}'s approval through the Singpass link emailed to them`
      : `Awaiting approval from the ${people(waiting)} through the Singpass link emailed to each of them`;

  let decision: TrackerStep;
  if (app.stage === "AA") decision = { key: "decision", state: "done", title: "Approved — AA", desc: `Approval Advice (final approval) issued ${app.aaAt ? formatSgt(app.aaAt) : ""}`.trim() };
  else if (app.stage === "IPA") decision = { key: "decision", state: "done", title: "IPA Issued", desc: "In-Principle Approval — click below to view the notice" };
  else if (app.stage === "Declined") decision = { key: "decision", state: "bad", title: "Application Declined", desc: "See the message below" };
  else decision = { key: "decision", state: "todo", title: "Awaiting ValueMax Decision", desc: "IPA, AA, a request for more documents, or a decline will appear here once ValueMax Ops completes its review." };

  return [
    { key: "submitted", state: "done", title: "Application Submitted", desc: "Application details submitted by the dealer" },
    { key: "singpass", state: fulfilled ? "done" : "current", title: "Pending Singpass Verification", desc: singpass },
    {
      key: "credit",
      state: decided ? "done" : fulfilled ? "current" : "todo",
      title: "Credit Review",
      desc: decided ? "ValueMax Ops has completed its review" : "ValueMax Ops is reviewing the submitted documents",
    },
    decision,
  ];
}

export function applicationView(app: Application, ctx: ViewContext, audit: readonly AuditEvent[]) {
  return {
    ref: app.ref,
    dealer: DEALERS[app.dealerId] ?? app.dealerId,
    createdBy: app.createdByName,
    createdById: app.createdById,
    createdAt: app.createdAt,
    dealerId: app.dealerId,
    /** D-59: the demo dealer user who may see this application, for "Demo: see the dealer's view"; null when another
     * dealer owns it or Ops keyed it in (manual entry). */
    dealerUserId: USERS.some((u) => u.id === app.createdById && u.kind === "ops") ? null : (USERS.find((u) => u.kind === "dealer" && u.dealerId === app.dealerId)?.id ?? null),
    ltaCodeMasked: maskAccessCode(app.ltaCode),
    carPlate: app.carPlate,
    stage: app.stage,
    ipaAt: app.ipaAt ?? null,
    aaAt: app.aaAt ?? null,
    opsStatus: opsStatusLabel(app),
    allFulfilled: allFulfilled(app),
    /** The server's AA check (same as issueAa): Ops show its reasons in "Cannot issue AA yet". */
    aaCheck: checkAa(app),
    /** Created At or the latest recorded event, whichever is later (Ops "Last Modified"). */
    lastModifiedAt: audit.reduce((m, e) => (e.applicationRef === app.ref && e.at > m ? e.at : m), app.createdAt),
    /** The dealer's Application Status steps (UI-11). */
    tracker: dealerTracker(app),
    parties: app.parties.map((p) => partyView(p, ctx)),
    /** Activity log for Ops, newest first, in plain sentences. Dealers get none. */
    activity: ctx.user.kind === "ops" ? activityFor(app, audit) : [],
  };
}
