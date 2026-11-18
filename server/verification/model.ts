// Domain model of the Singpass link flow (D-38).
import { isValidEmail, isValidMobile, isValidNric } from "../nric.ts";

export type Role = "hirer" | "guarantor";

export type LinkStatus = "QUEUED" | "SENT" | "OPENED" | "FULFILLED" | "MISMATCH" | "EXPIRED" | "REPLACED";
/** A link in one of these states is the party's active link; a new link turns it into REPLACED (D-19). */
export const ACTIVE_LINK_STATUSES: ReadonlySet<LinkStatus> = new Set<LinkStatus>(["QUEUED", "SENT", "OPENED"]);
export const FINAL_LINK_STATUSES: ReadonlySet<LinkStatus> = new Set<LinkStatus>(["FULFILLED", "REPLACED"]);

export type IssueReason = "submit" | "resend" | "nric-correction";

export interface VerificationLink {
  /** Internal id (audit, outbox). */
  id: string;
  /** Random token of the portal URL /verify/<portalToken>; contains no NRIC and no LinkId. */
  portalToken: string;
  status: LinkStatus;
  reason: IssueReason;
  createdAt: number;
  /** Gateway LinkId, set once GetLinkId succeeded. */
  linkId?: string;
  customerUrl?: string;
  sentAt?: number;
  /** sentAt + link TTL (D-24). */
  expiresAt?: number;
  openedAt?: number;
  /** When it reached FULFILLED, MISMATCH, EXPIRED or REPLACED. */
  closedAt?: number;
}

export interface Party {
  id: string;
  role: Role;
  /** "Hirer", "Guarantor", "Guarantor 2". */
  label: string;
  name: string;
  nric: string;
  email: string;
  mobile: string;
  /** When the current link was requested. */
  triggerAt: number;
  fulfilledAt?: number;
  /** Encrypted Myinfo person (AES-256-GCM, D-03). */
  myinfoSealed?: string;
  /** D-22: only the returned uinfin of a mismatch is kept. */
  mismatchUinfin?: string;
  /** Times of resends, for the sliding-window limit (D-39). */
  resendsAt: number[];
  links: VerificationLink[];
}

export type Stage = "Submitted" | "IPA" | "AA" | "Declined";

export interface Application {
  ref: string;
  dealerId: string;
  createdById: string;
  createdByName: string;
  createdAt: number;
  ltaCode: string;
  carPlate: string;
  stage: Stage;
  ipaAt?: number;
  aaAt?: number;
  parties: Party[];
}

export interface PartyInput {
  name: string;
  nric: string;
  email: string;
  mobile: string;
}

export interface ApplicationInput {
  hirer: PartyInput;
  /** At most 2 guarantors. */
  guarantors?: PartyInput[];
  ltaCode: string;
}

export interface OutboxMessage {
  id: string;
  at: number;
  channel: "email" | "sms";
  to: string;
  applicationRef: string;
  partyId: string;
  linkRef: string;
  subject?: string;
  body: string;
  /** sent = handed to SMTP; logged = demo outbox / server log only; failed = SMTP error. */
  status: "sent" | "logged" | "failed";
  error?: string;
}

export type AuditType =
  | "link.queued"
  | "link.sent"
  | "link.opened"
  | "link.blocked"
  | "link.resent"
  | "link.replaced"
  | "link.expired"
  | "result.rejected"
  | "party.fulfilled"
  | "party.mismatch"
  | "nric.viewed"
  | "nric.corrected"
  | "ipa.issued"
  | "aa.issued"
  | "aa.refused";

export interface AuditEvent {
  id: string;
  at: number;
  type: AuditType;
  /** User id, or "system" for the job. */
  actor: string;
  actorName: string;
  applicationRef: string;
  partyId?: string;
  /** Never a full NRIC or person data (D-41). */
  details: Record<string, string | number>;
}

export const MAX_GUARANTORS = 2;

export function currentLink(party: Party): VerificationLink {
  const link = party.links[party.links.length - 1];
  if (!link) throw new Error("party without link");
  return link;
}

export function validateParty(p: PartyInput | undefined, label: string): string[] {
  if (!p) return [`${label}: details are required`];
  const errors: string[] = [];
  if (!p.name?.trim()) errors.push(`${label}: name is required`);
  if (!isValidNric(p.nric ?? "")) errors.push(`${label}: invalid NRIC / FIN`);
  if (!isValidEmail(p.email ?? "")) errors.push(`${label}: invalid email`);
  if (!isValidMobile(p.mobile ?? "")) errors.push(`${label}: mobile must be 8 digits starting with 8 or 9`);
  return errors;
}
