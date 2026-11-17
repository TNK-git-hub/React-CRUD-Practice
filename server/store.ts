// Domain model and rules of the demo. Pure logic + JSON-file persistence; no HTTP here.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isValidEmail, isValidMobile, isValidNric, normalizeNric, nricMatches } from "./nric.ts";

export type Role = "hirer" | "guarantor";
export type LinkOutcome = "Fulfilled" | "Superseded" | "NRIC mismatch" | "Declined" | "Rejected";
export type LinkStatus = "Pending" | "Expired" | LinkOutcome;
export type Stage = "Submitted" | "IPA" | "AA" | "Declined";

export interface Link {
  token: string;
  createdAt: number;
  expiresAt: number;
  outcome?: LinkOutcome;
  outcomeAt?: number;
  gatewayLinkId?: string;
}

export interface Party {
  role: Role;
  name: string;
  nric: string;
  email: string;
  mobile: string;
  triggerAt: number;
  fulfilledAt?: number;
  links: Link[];
  myinfoEnc?: string;
  mismatchUinfin?: string;
}

export interface Note {
  at: number;
  tone: "info" | "error";
  text: string;
}

export interface Application {
  ref: string;
  dealerId: string;
  createdBy: string;
  createdAt: number;
  ltaCode: string;
  carPlate: string;
  stage: Stage;
  ipaAt?: number;
  aaAt?: number;
  notes: Note[];
  parties: Party[];
}

export interface OutboxMail {
  at: number;
  to: string;
  subject: string;
  url: string;
  ref: string;
  role: Role;
  delivered: boolean;
  error?: string;
}

export interface User {
  id: string;
  name: string;
  initials: string;
  kind: "dealer" | "ops";
  dealerId?: string;
  org: string;
}

export const DEALERS: Record<string, string> = {
  "d-demo": "Demo Motors Pte Ltd",
  "d-sample": "Sample Auto Pte Ltd",
};

export const USERS: User[] = [
  { id: "u-alex", name: "Alex Tan", initials: "AT", kind: "dealer", dealerId: "d-demo", org: "Demo Motors Pte Ltd" },
  { id: "u-priya", name: "Priya Nair", initials: "PN", kind: "ops", org: "VMAF Ops" },
];

export class AppError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface PartyInput {
  name: string;
  nric: string;
  email: string;
  mobile: string;
}

export interface ApplicationInput {
  hirer: PartyInput;
  guarantor?: PartyInput | null;
  ltaCode: string;
}

interface State {
  applications: Application[];
  outbox: OutboxMail[];
}

const HOUR = 3_600_000;

export function linkStatus(link: Link, now: number): LinkStatus {
  if (link.outcome) return link.outcome;
  return now >= link.expiresAt ? "Expired" : "Pending";
}

export function currentLink(party: Party): Link {
  const link = party.links[party.links.length - 1];
  if (!link) throw new Error("party without link");
  return link;
}

/** Singpass status of a party = status of its latest link. A rejected late result does not change it. */
export function partyStatus(party: Party, now: number): LinkStatus {
  return linkStatus(currentLink(party), now);
}

export function allFulfilled(app: Application, now: number): boolean {
  return app.parties.every((p) => partyStatus(p, now) === "Fulfilled");
}

/** D-25: labels of the Ops list. */
export function opsStatusLabel(app: Application, now: number): string {
  if (app.stage === "Declined") return "Declined";
  if (app.stage === "AA") return "Approved — AA";
  if (app.stage === "IPA") return "Approved — IPA";
  return allFulfilled(app, now) ? "Credit Review" : "Pending";
}

export function validateParty(p: PartyInput, label: string): string[] {
  const errors: string[] = [];
  if (!p.name?.trim()) errors.push(`${label}: name is required`);
  if (!isValidNric(p.nric ?? "")) errors.push(`${label}: invalid NRIC / FIN`);
  if (!isValidEmail(p.email ?? "")) errors.push(`${label}: invalid email`);
  if (!isValidMobile(p.mobile ?? "")) errors.push(`${label}: mobile must be 8 digits starting with 8 or 9`);
  return errors;
}

export class Store {
  private state: State = { applications: [], outbox: [] };
  private readonly file: string | null;
  readonly ttlMs: number;

  constructor(opts: { file?: string | null; ttlHours?: number } = {}) {
    this.file = opts.file ?? null;
    this.ttlMs = (opts.ttlHours ?? 72) * HOUR;
    if (this.file && existsSync(this.file)) {
      this.state = JSON.parse(readFileSync(this.file, "utf8")) as State;
    }
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  get applications(): readonly Application[] {
    return this.state.applications;
  }

  get outbox(): readonly OutboxMail[] {
    return this.state.outbox;
  }

  addOutbox(mail: OutboxMail): void {
    this.state.outbox.unshift(mail);
    this.state.outbox = this.state.outbox.slice(0, 50);
    this.save();
  }

  get(ref: string): Application {
    const app = this.state.applications.find((a) => a.ref === ref);
    if (!app) throw new AppError(404, "Application not found");
    return app;
  }

  /** D-26 */
  nextRef(now: number): string {
    const year = new Date(now).getUTCFullYear();
    let max = 5120;
    for (const a of this.state.applications) {
      const n = Number(a.ref.split("-")[2]);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `VMAF-${year}-${String(max + 1).padStart(5, "0")}`;
  }

  private newLink(now: number): Link {
    return { token: randomBytes(18).toString("base64url"), createdAt: now, expiresAt: now + this.ttlMs };
  }

  createApplication(input: ApplicationInput, user: User, now: number): Application {
    if (user.kind !== "dealer" || !user.dealerId) throw new AppError(403, "Only dealer users submit applications");
    const errors = validateParty(input.hirer, "Hirer");
    if (input.guarantor) {
      errors.push(...validateParty(input.guarantor, "Guarantor"));
      if (nricMatches(input.guarantor.nric, input.hirer.nric)) errors.push("Guarantor: NRIC must differ from the hirer's (D-28)");
    }
    if (!input.ltaCode?.trim()) errors.push("LTA Access Code is required");
    if (errors.length) throw new AppError(400, errors.join("; "));

    const mk = (role: Role, p: PartyInput): Party => ({
      role,
      name: p.name.trim().toUpperCase(),
      nric: normalizeNric(p.nric),
      email: p.email.trim(),
      mobile: p.mobile.replace(/\s+/g, ""),
      triggerAt: now,
      links: [this.newLink(now)],
    });
    const parties = [mk("hirer", input.hirer)];
    if (input.guarantor) parties.push(mk("guarantor", input.guarantor));

    const app: Application = {
      ref: this.nextRef(now),
      dealerId: user.dealerId,
      createdBy: user.name,
      createdAt: now,
      ltaCode: input.ltaCode.trim(),
      carPlate: "",
      stage: "Submitted",
      notes: [],
      parties,
    };
    this.state.applications.unshift(app);
    this.save();
    return app;
  }

  party(app: Application, role: Role): Party {
    const p = app.parties.find((x) => x.role === role);
    if (!p) throw new AppError(404, `No ${role} on this application`);
    return p;
  }

  /** Ops "Resend Email": new link, the pending one becomes Superseded (D-18, D-19). */
  resend(ref: string, role: Role, now: number): { app: Application; party: Party; link: Link } {
    const app = this.get(ref);
    const party = this.party(app, role);
    const cur = currentLink(party);
    const status = linkStatus(cur, now);
    if (status === "Fulfilled") throw new AppError(409, "Singpass is already fulfilled for this person");
    if (status === "Pending") {
      cur.outcome = "Superseded";
      cur.outcomeAt = now;
    }
    const link = this.newLink(now);
    party.links.push(link);
    party.triggerAt = now;
    delete party.mismatchUinfin;
    this.save();
    return { app, party, link };
  }

  findByToken(token: string): { app: Application; party: Party; link: Link } | null {
    for (const app of this.state.applications)
      for (const party of app.parties)
        for (const link of party.links) if (link.token === token) return { app, party, link };
    return null;
  }

  /** Link check (screen 5): valid only if it is the latest link of the person and still pending. */
  checkLink(token: string, now: number) {
    const found = this.findByToken(token);
    if (!found) return { valid: false as const, reason: "unknown" };
    const { app, party, link } = found;
    const latest = currentLink(party) === link;
    const status = linkStatus(link, now);
    if (!latest || status !== "Pending") return { valid: false as const, reason: status, app, party, link };
    return { valid: true as const, app, party, link };
  }

  setGatewayLinkId(token: string, linkId: string): void {
    const found = this.findByToken(token);
    if (!found) throw new AppError(404, "Unknown link");
    found.link.gatewayLinkId = linkId;
    this.save();
  }

  /**
   * Attach the gateway result to the link (D-16, D-21, D-22, D-23).
   * Returns the resulting status of the link.
   */
  attachResult(
    token: string,
    result: { kind: "ok"; uinfin: string; sealed: string } | { kind: "declined" },
    now: number,
  ): LinkStatus {
    const check = this.checkLink(token, now);
    if (!check.valid) {
      if (check.app && check.party) {
        check.app.notes.unshift({
          at: now,
          tone: "error",
          text: `A MyInfo result for the ${check.party.role} came from a link that was ${String(check.reason).toLowerCase()} and was not attached.`,
        });
        if (check.link && !check.link.outcome) {
          check.link.outcome = "Rejected";
          check.link.outcomeAt = now;
        }
        this.save();
      }
      throw new AppError(410, "This link is no longer valid");
    }
    const { party, link, app } = check;
    link.outcomeAt = now;
    if (result.kind === "declined") {
      link.outcome = "Declined";
      app.notes.unshift({ at: now, tone: "error", text: `The ${party.role} pressed Cancel on the Singpass consent screen.` });
    } else if (!nricMatches(result.uinfin, party.nric)) {
      link.outcome = "NRIC mismatch";
      party.mismatchUinfin = normalizeNric(result.uinfin);
      app.notes.unshift({ at: now, tone: "error", text: `NRIC mismatch for the ${party.role}: logged in as ${party.mismatchUinfin}, dealer entered ${party.nric}.` });
    } else {
      link.outcome = "Fulfilled";
      party.fulfilledAt = now;
      party.myinfoEnc = result.sealed;
    }
    this.save();
    return link.outcome;
  }

  issueIpa(ref: string, now: number): Application {
    const app = this.get(ref);
    if (app.stage !== "Submitted") throw new AppError(409, `Cannot issue IPA at stage ${app.stage}`);
    app.stage = "IPA";
    app.ipaAt = now;
    this.save();
    return app;
  }

  /** The AA lock lives here, on the server (D-11). */
  issueAa(ref: string, now: number): Application {
    const app = this.get(ref);
    if (app.stage === "AA" || app.stage === "Declined") throw new AppError(409, `Cannot issue AA at stage ${app.stage}`);
    const missing = app.parties.filter((p) => partyStatus(p, now) !== "Fulfilled");
    if (missing.length) {
      throw new AppError(409, `Cannot issue AA yet: Singpass not fulfilled for ${missing.map((p) => p.role).join(", ")}`);
    }
    app.stage = "AA";
    app.aaAt = now;
    this.save();
    return app;
  }

  /** Demo Control: make the current link of a party expired. */
  expireLink(ref: string, role: Role, now: number): void {
    const link = currentLink(this.party(this.get(ref), role));
    if (link.outcome) throw new AppError(409, "This link already has an outcome");
    link.expiresAt = now - 1000;
    this.save();
  }

  /** D-02: hard delete. */
  reset(): void {
    this.state = { applications: [], outbox: [] };
    this.save();
  }

  /** D-29 */
  seed(now: number, sealed: (uinfin: string) => string): number {
    const day = 24 * HOUR;
    const mkLink = (createdAt: number, outcome?: LinkOutcome): Link => ({
      token: randomBytes(18).toString("base64url"),
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      ...(outcome ? { outcome, outcomeAt: createdAt + 3 * HOUR } : {}),
    });
    const p = (role: Role, name: string, nric: string, at: number, outcome?: LinkOutcome): Party => ({
      role,
      name,
      nric,
      email: `${name.split(" ")[0]?.toLowerCase()}@example.com`,
      mobile: "91234567",
      triggerAt: at,
      links: [mkLink(outcome ? at : now - 2 * HOUR, outcome)], // a pending sample link stays valid
      ...(outcome === "Fulfilled" ? { fulfilledAt: at + 3 * HOUR, myinfoEnc: sealed(nric) } : {}),
    });
    const rows: Array<Omit<Application, "notes" | "ltaCode">> = [];
    const at = (d: number) => now - d * day;
    rows.push({ ref: "VMAF-2026-05114", dealerId: "d-demo", createdBy: "Alex Tan", createdAt: at(15), carPlate: "SKS6603L", stage: "Declined", parties: [p("hirer", "CHUA MEI TING", "S8935520F", at(15), "Fulfilled")] });
    rows.push({ ref: "VMAF-2026-05115", dealerId: "d-demo", createdBy: "Alex Tan", createdAt: at(15), carPlate: "SNA7781B", stage: "AA", aaAt: at(13), parties: [p("hirer", "LEE XIN YI", "S9612083D", at(15), "Fulfilled"), p("guarantor", "LEE KOK WAH", "S6512274Z", at(15), "Fulfilled")] });
    rows.push({ ref: "VMAF-2026-05116", dealerId: "d-sample", createdBy: "Priya Nair", createdAt: at(14), carPlate: "SNB9902E", stage: "Submitted", parties: [p("hirer", "MUHAMMAD HAFIZ BIN ISMAIL", "S9023316E", at(14), "Fulfilled")] });
    rows.push({ ref: "VMAF-2026-05117", dealerId: "d-sample", createdBy: "Priya Nair", createdAt: at(13), carPlate: "SLA4410K", stage: "IPA", ipaAt: at(12), parties: [p("hirer", "TAN BEE LENG", "S7834562A", at(13), "Fulfilled")] });
    rows.push({ ref: "VMAF-2026-05118", dealerId: "d-demo", createdBy: "Alex Tan", createdAt: at(12), carPlate: "SMB2290X", stage: "Submitted", parties: [p("hirer", "ONG CHEE KEONG", "S8101234D", at(12), "Fulfilled"), p("guarantor", "ONG SIEW LAN", "S8302345B", at(12), "Declined")] });
    rows.push({ ref: "VMAF-2026-05119", dealerId: "d-sample", createdBy: "Priya Nair", createdAt: at(11), carPlate: "SMF1187D", stage: "Submitted", parties: [p("hirer", "SITI AMINAH BINTE YUSOF", "S8820147G", at(11))] });
    let added = 0;
    for (const r of rows) {
      if (this.state.applications.some((a) => a.ref === r.ref)) continue;
      this.state.applications.push({ ...r, ltaCode: "DEMO01", notes: [] });
      added++;
    }
    this.state.applications.sort((a, b) => b.ref.localeCompare(a.ref));
    this.save();
    return added;
  }
}
