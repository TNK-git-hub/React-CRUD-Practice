// Singpass link flow of AutoFinance: issuing links, the auto-verify job, resend, IPA / AA.
// Every gateway call goes through the GatewayAdapter; every time comes from the injected clock.
import { randomBytes, randomUUID } from "node:crypto";
import type { Clock } from "../clock.ts";
import type { AppConfig } from "../config.ts";
import { GatewayUnavailable } from "../gateway/adapter.ts";
import type { GatewayAdapter } from "../gateway/adapter.ts";
import { renderEmail } from "../mail.ts";
import { isValidEmail, isValidNric, maskNric, normalizeNric, nricMatches } from "../nric.ts";
import { formatSgt } from "../time.ts";
import { personaFor } from "../personas.ts";
import type { MyinfoPerson } from "../personas.ts";
import { checkAa } from "./approval.ts";
import type { AaUnmet } from "./approval.ts";
import type { Db } from "./db.ts";
import { ACTIVE_LINK_STATUSES, MAX_GUARANTORS, currentLink, isCurrent, validateParty } from "./model.ts";
import type { Application, ApplicationInput, AuditType, IssueReason, LinkStatus, Party, PartyInput, Role, VerificationLink } from "./model.ts";
import { DEALERS } from "./users.ts";
import type { Actor } from "./users.ts";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  /** delivered = handed to SMTP; false with no error = no SMTP configured (log / outbox only). */
  send(message: EmailMessage): Promise<{ delivered: boolean; error?: string }>;
}

export interface ServiceDeps {
  db: Db;
  gateway: GatewayAdapter;
  clock: Clock;
  config: AppConfig;
  email: EmailSender;
  /** Encrypts a Myinfo person for storage (D-03). */
  seal: (person: MyinfoPerson) => string;
  /** Called after a change of an application (SSE). null = many applications. */
  onChange?: (ref: string | null) => void;
}

export class ServiceError extends Error {
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const SYSTEM = { id: "system", name: "Auto-verify job" } as const;
const CUSTOMER = { id: "customer", name: "Customer (link holder)" } as const;

export type BlockReason = "unknown" | "replaced" | "expired" | "not-sent" | "used";
export type PartyOutcome = "sent" | "fulfilled" | "mismatch" | "expired" | "unchanged" | "unavailable";
export type OpenLinkResult = { ok: true; redirectUrl: string } | { ok: false; reason: BlockReason };

export class VerificationService {
  private readonly db: Db;
  private readonly gateway: GatewayAdapter;
  private readonly clock: Clock;
  private readonly config: AppConfig;
  private readonly email: EmailSender;
  private readonly seal: (person: MyinfoPerson) => string;
  private readonly onChange: (ref: string | null) => void;
  /** Internal ids of links being issued right now: overlapping job runs never issue a link twice. */
  private readonly issuing = new Set<string>();
  /** Internal ids of links whose data is being fetched right now. */
  private readonly polling = new Set<string>();

  constructor(deps: ServiceDeps) {
    this.db = deps.db;
    this.gateway = deps.gateway;
    this.clock = deps.clock;
    this.config = deps.config;
    this.email = deps.email;
    this.seal = deps.seal;
    this.onChange = deps.onChange ?? (() => {});
  }

  // ---------------------------------------------------------------- queries

  getApplication(ref: string): Application {
    const app = this.db.applications.find((a) => a.ref === ref);
    if (!app) throw new ServiceError(404, "Application not found");
    return app;
  }

  party(app: Application, partyId: string): Party {
    const p = app.parties.find((x) => x.id === partyId);
    if (!p) throw new ServiceError(404, "Party not found on this application");
    return p;
  }

  /** portal URL put in the email: AutoFinance first, then the gateway (flow item 4). */
  portalUrl(link: VerificationLink): string {
    return `${this.config.publicBaseUrl}/verify/${link.portalToken}`;
  }

  findByPortalToken(token: string): { app: Application; party: Party; link: VerificationLink } | null {
    if (!token) return null;
    for (const app of this.db.applications)
      for (const party of app.parties)
        for (const link of party.links) if (link.portalToken === token) return { app, party, link };
    return null;
  }

  // ---------------------------------------------------------------- portal link check (flow item 4)

  /**
   * /verify/<portalToken>: only the party's current link, sent and not expired, goes on to the gateway.
   * Anything else stops here (D-17, D-19).
   */
  openLink(portalToken: string): OpenLinkResult {
    const found = this.findByPortalToken(portalToken);
    if (!found) return { ok: false, reason: "unknown" };
    const { app, party, link } = found;
    const block = (reason: BlockReason): OpenLinkResult => {
      this.audit("link.blocked", CUSTOMER, app, party, { link: link.id, reason });
      this.db.save();
      this.onChange(app.ref);
      return { ok: false, reason };
    };
    if (!isCurrent(party, link)) return block("replaced");
    if (link.status === "QUEUED" || !link.customerUrl) return block("not-sent");
    // past expiresAt: blocked here, but only the job sets EXPIRED, after checking for data (D-44)
    if (link.status === "EXPIRED" || this.isPastExpiry(link)) return block("expired");
    if (link.status !== "SENT" && link.status !== "OPENED") return block("used");
    if (link.status === "SENT") {
      link.status = "OPENED";
      link.openedAt = this.clock.now();
      this.audit("link.opened", CUSTOMER, app, party, { link: link.id });
      this.db.save();
      this.onChange(app.ref);
    }
    return { ok: true, redirectUrl: link.customerUrl };
  }

  private isPastExpiry(link: VerificationLink): boolean {
    return link.expiresAt !== undefined && this.clock.now() >= link.expiresAt;
  }

  // ---------------------------------------------------------------- resend (flow item 9)

  /**
   * Ops or the dealer agent who submitted the application (D-04); a reason is required; at most `resendLimit`
   * resends per party in any sliding `resendWindowMs` (D-39); never once FULFILLED (D-18).
   */
  async resend(ref: string, partyId: string, actor: Actor, reason: string): Promise<Application> {
    const app = this.getApplication(ref);
    const party = this.party(app, partyId);
    if (!(actor.kind === "ops" || (actor.kind === "dealer" && actor.id === app.createdById)))
      throw new ServiceError(403, "Only Ops or the dealer agent who submitted the application can resend");
    if (!reason?.trim()) throw new ServiceError(400, "A reason is required to resend");
    if (app.stage === "AA") throw new ServiceError(409, "The AA is issued: no more Singpass links for this application");
    if (currentLink(party).status === "FULFILLED")
      throw new ServiceError(409, `Singpass is already fulfilled for the ${party.label.toLowerCase()}; no resend`);
    const now = this.clock.now();
    const retryAt = this.resendRetryAt(party, now);
    if (retryAt !== null) {
      const hours = Math.round(this.config.resendWindowMs / 3_600_000);
      throw new ServiceError(
        429,
        `Resend limit reached: at most ${this.config.resendLimit} resends in ${hours} hours. Next resend possible at ${formatSgt(retryAt)} (SGT).`,
        { retryAt },
      );
    }
    party.resendsAt.push(now);
    const link = this.newLink(app, party, "resend", actor);
    this.audit("link.resent", actor, app, party, { link: link.id, reason: reason.trim() });
    this.db.save();
    this.onChange(app.ref);
    await this.dispatch(app, party, link);
    return app;
  }

  /** null = a resend is allowed now; otherwise the earliest time it will be (sliding window, D-39). */
  resendRetryAt(party: Party, now: number): number | null {
    const recent = party.resendsAt.filter((t) => t > now - this.config.resendWindowMs).sort((a, b) => a - b);
    if (recent.length < this.config.resendLimit) return null;
    return recent[recent.length - this.config.resendLimit]! + this.config.resendWindowMs;
  }

  /**
   * D-40: Ops corrects a party's NRIC and / or email (reason required, audited). The current link stops being current
   * (an active one becomes REPLACED; FULFILLED / MISMATCH keep their status as history), any previous result stops
   * counting, and a new link is issued for the new details. Not a resend: it does not count towards the limit.
   */
  async correctParty(ref: string, partyId: string, actor: Actor, changes: { nric?: string; email?: string }, reason: string): Promise<Application> {
    if (actor.kind !== "ops") throw new ServiceError(403, "Only Ops can correct a person's NRIC or email");
    const app = this.getApplication(ref);
    const party = this.party(app, partyId);
    if (app.stage === "AA") throw new ServiceError(409, "The AA is issued: the person's details can no longer be changed");
    if (!reason?.trim()) throw new ServiceError(400, "A reason is required to correct the details");
    const nric = changes.nric === undefined ? party.nric : normalizeNric(changes.nric);
    const email = changes.email === undefined ? party.email : changes.email.trim();
    if (!isValidNric(nric)) throw new ServiceError(400, "Invalid NRIC / FIN");
    if (!isValidEmail(email)) throw new ServiceError(400, "Invalid email");
    if (app.parties.some((p) => p !== party && nricMatches(p.nric, nric))) throw new ServiceError(400, "Each person needs a different NRIC (D-28)");
    if (nric === party.nric && email === party.email) throw new ServiceError(400, "Nothing to correct: the NRIC and email are unchanged");

    const details: Record<string, string> = { reason: reason.trim() };
    if (nric !== party.nric) Object.assign(details, { nricFrom: maskNric(party.nric), nricTo: maskNric(nric) });
    if (email !== party.email) Object.assign(details, { emailFrom: maskEmail(party.email), emailTo: maskEmail(email) });

    // email only, already FULFILLED: the verified result stays valid; just record the new address
    if (nric === party.nric && currentLink(party).status === "FULFILLED") {
      party.email = email;
      this.audit("party.corrected", actor, app, party, { ...details, newLink: "no" });
      this.db.save();
      this.onChange(app.ref);
      return app;
    }
    party.nric = nric;
    party.email = email;
    delete party.fulfilledAt;
    delete party.myinfoSealed;
    delete party.mismatchUinfin;
    const link = this.newLink(app, party, "nric-correction", actor);
    this.audit("party.corrected", actor, app, party, { ...details, newLink: "yes", link: link.id });
    this.db.save();
    this.onChange(app.ref);
    await this.dispatch(app, party, link);
    return app;
  }

  /** Parties whose current link is EXPIRED, oldest expiry first (Ops list, flow item 9). */
  expiredLinks(): Array<{ ref: string; partyId: string; label: string; name: string; expiredAt: number; resendRetryAt: number | null }> {
    const now = this.clock.now();
    const rows = [];
    for (const app of this.db.applications)
      for (const party of app.parties) {
        const link = currentLink(party);
        if (link.status !== "EXPIRED") continue;
        rows.push({ ref: app.ref, partyId: party.id, label: party.label, name: party.name, expiredAt: link.closedAt ?? link.expiresAt ?? 0, resendRetryAt: this.resendRetryAt(party, now) });
      }
    return rows.sort((a, b) => a.expiredAt - b.expiredAt);
  }

  /**
   * D-41: the full NRIC on explicit request, audited. "entered" (what the dealer typed): Ops, or the dealer that owns
   * the application. "returned" (the uinfin of a mismatch, someone else's NRIC): Ops only.
   */
  revealNric(ref: string, partyId: string, actor: Actor, which: "entered" | "returned"): string {
    const app = this.getApplication(ref);
    const party = this.party(app, partyId);
    if (actor.kind !== "ops" && !(which === "entered" && actor.kind === "dealer" && actor.dealerId === app.dealerId))
      throw new ServiceError(403, "Not allowed to view this NRIC");
    const value = which === "entered" ? party.nric : party.mismatchUinfin;
    if (!value) throw new ServiceError(404, "No such NRIC for this person");
    this.audit("nric.viewed", actor, app, party, { which });
    this.db.save();
    this.onChange(app.ref);
    return value;
  }

  // ---------------------------------------------------------------- IPA / AA (flow item 12)

  /** IPA: Ops, any time after submission, whatever the Singpass status (SC-60). */
  issueIpa(ref: string, actor: Actor): Application {
    if (actor.kind !== "ops") throw new ServiceError(403, "Only Ops can issue an IPA");
    const app = this.getApplication(ref);
    if (app.stage !== "Submitted") throw new ServiceError(409, `Cannot issue an IPA at stage ${app.stage}`);
    app.stage = "IPA";
    app.ipaAt = this.clock.now();
    this.audit("ipa.issued", actor, app, null);
    this.db.save();
    this.onChange(app.ref);
    return app;
  }

  /** What the AA still needs (same check as issueAa; shown to Ops). */
  aaCheck(app: Application): { ready: boolean; missing: AaUnmet[] } {
    return checkAa(app);
  }

  /** AA: locked on the server until every AA condition holds; a refused attempt is audited (SC-61 … SC-65). */
  issueAa(ref: string, actor: Actor): Application {
    if (actor.kind !== "ops") throw new ServiceError(403, "Only Ops can issue an AA");
    const app = this.getApplication(ref);
    if (app.stage !== "Submitted" && app.stage !== "IPA") throw new ServiceError(409, `Cannot issue an AA at stage ${app.stage}`);
    const { missing } = checkAa(app);
    if (missing.length) {
      const summary = missing.map((m) => `${m.label}: ${m.status}`).join(", ");
      this.audit("aa.refused", actor, app, null, { missing: summary });
      this.db.save();
      this.onChange(app.ref);
      throw new ServiceError(409, `Cannot issue AA yet — Singpass not fulfilled for ${summary}`, { missing });
    }
    app.stage = "AA";
    app.aaAt = this.clock.now();
    this.audit("aa.issued", actor, app, null);
    this.db.save();
    this.onChange(app.ref);
    return app;
  }

  // ---------------------------------------------------------------- Retrieve MyInfo (flow item 8)

  /** Ops "Retrieve MyInfo" for one party: exactly the job's processing of that party (processParty). */
  async retrieveMyInfo(ref: string, partyId: string, actor: Actor): Promise<PartyOutcome> {
    if (actor.kind !== "ops") throw new ServiceError(403, "Only Ops can retrieve MyInfo");
    const app = this.getApplication(ref);
    const outcome = await this.processParty(app, this.party(app, partyId));
    if (outcome === "unavailable") throw new ServiceError(503, "The Myinfo gateway is unavailable, try again later");
    return outcome;
  }

  // ---------------------------------------------------------------- submit (flow items 1–3)

  /** D-26 */
  private nextRef(now: number): string {
    const year = new Date(now).getUTCFullYear();
    let max = 5120;
    for (const a of this.db.applications) {
      const n = Number(a.ref.split("-")[2]);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `VMAF-${year}-${String(max + 1).padStart(5, "0")}`;
  }

  async submitApplication(input: ApplicationInput, actor: Actor): Promise<Application> {
    if (actor.kind !== "dealer" || !actor.dealerId) throw new ServiceError(403, "Only dealer users submit applications");
    const guarantors = input.guarantors ?? [];
    const errors = validateParty(input.hirer, "Hirer");
    if (guarantors.length > MAX_GUARANTORS) errors.push(`At most ${MAX_GUARANTORS} guarantors`);
    guarantors.forEach((g, i) => errors.push(...validateParty(g, guarantorLabel(i, guarantors.length))));
    if (!errors.length) {
      const nrics = [input.hirer, ...guarantors].map((p) => normalizeNric(p.nric));
      if (new Set(nrics).size !== nrics.length) errors.push("Each person needs a different NRIC (D-28)");
    }
    if (!input.ltaCode?.trim()) errors.push("LTA Access Code is required");
    if (errors.length) throw new ServiceError(400, errors.join("; "));

    const now = this.clock.now();
    const ref = this.nextRef(now);
    const mk = (role: Role, label: string, p: PartyInput): Party => ({
      id: `${ref}-${label.replace(/\s+/g, "").toLowerCase()}`,
      role,
      label,
      name: p.name.trim().toUpperCase(),
      nric: normalizeNric(p.nric),
      email: p.email.trim(),
      mobile: p.mobile.replace(/\s+/g, ""),
      triggerAt: now,
      resendsAt: [],
      currentLinkId: "",
      links: [],
    });
    const app: Application = {
      ref,
      dealerId: actor.dealerId,
      createdById: actor.id,
      createdByName: actor.name,
      createdAt: now,
      ltaCode: input.ltaCode.trim(),
      carPlate: "",
      stage: "Submitted",
      parties: [mk("hirer", "Hirer", input.hirer), ...guarantors.map((g, i) => mk("guarantor", guarantorLabel(i, guarantors.length), g))],
    };
    this.db.applications.unshift(app);
    for (const party of app.parties) this.newLink(app, party, "submit", actor);
    this.db.save();
    this.onChange(app.ref);

    for (const party of app.parties) await this.dispatch(app, party, currentLink(party));
    return app;
  }

  /**
   * Adds a QUEUED link as the party's current link. Still-active links become REPLACED; EXPIRED and MISMATCH links
   * keep their status as history (D-19, D-20).
   */
  private newLink(app: Application, party: Party, reason: IssueReason, actor: Actor | typeof SYSTEM): VerificationLink {
    const now = this.clock.now();
    for (const old of party.links) {
      if (!ACTIVE_LINK_STATUSES.has(old.status)) continue;
      old.status = "REPLACED";
      old.closedAt = now;
      this.audit("link.replaced", actor, app, party, { link: old.id });
    }
    const link: VerificationLink = {
      id: randomUUID(),
      portalToken: randomBytes(24).toString("base64url"), // 192 bits
      status: "QUEUED",
      reason,
      createdAt: now,
    };
    party.links.push(link);
    party.currentLinkId = link.id;
    party.triggerAt = now;
    this.audit("link.queued", actor, app, party, { link: link.id, reason });
    return link;
  }

  /**
   * QUEUED → SENT: GetLinkId through the adapter, then email + SMS. Leaves the link QUEUED when the gateway is
   * unavailable. Safe when called concurrently or repeatedly for the same link.
   */
  private async dispatch(app: Application, party: Party, link: VerificationLink): Promise<"sent" | "unavailable" | "skipped"> {
    if (link.status !== "QUEUED" || this.issuing.has(link.id)) return "skipped";
    this.issuing.add(link.id);
    try {
      let issued;
      try {
        issued = await this.gateway.issueLink({ applicationRef: app.ref, partyId: party.id, role: party.role });
      } catch (e) {
        if (e instanceof GatewayUnavailable) return "unavailable";
        throw e;
      }
      if (link.status !== "QUEUED") return "skipped"; // replaced while GetLinkId was running
      const now = this.clock.now();
      link.linkId = issued.linkId;
      link.customerUrl = issued.customerUrl;
      link.status = "SENT";
      link.sentAt = now;
      link.expiresAt = now + this.config.linkTtlMs;
      this.audit("link.sent", SYSTEM, app, party, { link: link.id, expiresAt: link.expiresAt });
      this.db.save();
      await this.notify(app, party, link);
      this.onChange(app.ref);
      return "sent";
    } finally {
      this.issuing.delete(link.id);
    }
  }

  /** Email with the portal link, then an SMS that only says the email was sent (D-13). */
  private async notify(app: Application, party: Party, link: VerificationLink): Promise<void> {
    const url = this.portalUrl(link);
    const mail = renderEmail({
      to: party.email,
      name: party.name,
      role: party.role,
      ref: app.ref,
      dealer: DEALERS[app.dealerId] ?? "",
      url,
      expiresAt: link.expiresAt ?? 0,
      ttlHours: Math.round(this.config.linkTtlMs / 3_600_000),
    });
    const r = await this.email.send({ to: party.email, subject: mail.subject, html: mail.html, text: mail.text });
    const base = { applicationRef: app.ref, partyId: party.id, linkRef: link.id };
    this.db.outbox.unshift({
      id: randomUUID(),
      at: this.clock.now(),
      channel: "email",
      to: party.email,
      subject: mail.subject,
      body: mail.text,
      status: r.delivered ? "sent" : r.error ? "failed" : "logged",
      ...(r.error ? { error: r.error } : {}),
      ...base,
    });
    this.db.outbox.unshift({
      id: randomUUID(),
      at: this.clock.now(),
      channel: "sms",
      to: party.mobile,
      body: `ValueMax AutoFinance: we have emailed you a Singpass verification request for application ${app.ref}. Please check your inbox (${maskEmail(party.email)}).`,
      status: "logged",
      ...base,
    });
    this.db.outbox.splice(200);
    this.db.save();
  }

  // ---------------------------------------------------------------- job

  /** One run of the auto-verify job. Idempotent; overlapping runs are safe. */
  async runJob(): Promise<void> {
    for (const app of [...this.db.applications]) for (const party of app.parties) await this.processParty(app, party);
  }

  /**
   * Everything the job does for one party; "Retrieve MyInfo" calls exactly this.
   * 1. current link QUEUED → issue + send it;
   * 2. current link SENT / OPENED → fetchPerson first, then expiry (D-44);
   * 3. late data on REPLACED / EXPIRED links → one result.rejected event each (D-45).
   * QUEUED, FULFILLED and MISMATCH links are never polled.
   */
  private async processParty(app: Application, party: Party): Promise<PartyOutcome> {
    const link = currentLink(party);
    let outcome: PartyOutcome;
    if (link.status === "QUEUED") {
      const r = await this.dispatch(app, party, link);
      outcome = r === "sent" ? "sent" : r === "unavailable" ? "unavailable" : "unchanged";
    } else if (link.status === "SENT" || link.status === "OPENED") {
      outcome = await this.pollCurrent(app, party, link);
    } else {
      outcome = "unchanged";
    }
    if (outcome !== "unavailable") await this.checkLateResults(app, party);
    return outcome;
  }

  private async pollCurrent(app: Application, party: Party, link: VerificationLink): Promise<PartyOutcome> {
    if (!link.linkId || this.polling.has(link.id)) return "unchanged";
    this.polling.add(link.id);
    try {
      let r;
      try {
        r = await this.gateway.fetchPerson(link.linkId);
      } catch (e) {
        if (e instanceof GatewayUnavailable) return "unavailable";
        throw e;
      }
      // the state may have moved while fetchPerson was running (resend, another run)
      if (!isCurrent(party, link) || (link.status !== "SENT" && link.status !== "OPENED")) return "unchanged";
      const now = this.clock.now();
      if (r.status === "READY") {
        link.closedAt = now;
        if (nricMatches(r.person.uinfin, party.nric)) {
          link.status = "FULFILLED";
          party.fulfilledAt = now;
          party.myinfoSealed = this.seal(r.person);
          delete party.mismatchUinfin;
          this.audit("party.fulfilled", SYSTEM, app, party, { link: link.id });
        } else {
          // D-22: only the returned uinfin is kept, the rest of the person data is discarded
          link.status = "MISMATCH";
          party.mismatchUinfin = normalizeNric(r.person.uinfin);
          this.audit("party.mismatch", SYSTEM, app, party, {
            link: link.id,
            returned: maskNric(r.person.uinfin),
            expected: maskNric(party.nric),
          });
        }
      } else if (this.isPastExpiry(link)) {
        link.status = "EXPIRED";
        link.closedAt = now;
        this.audit("link.expired", SYSTEM, app, party, { link: link.id });
      } else {
        return "unchanged";
      }
      this.db.save();
      this.onChange(app.ref);
      return link.status === "FULFILLED" ? "fulfilled" : link.status === "MISMATCH" ? "mismatch" : "expired";
    } finally {
      this.polling.delete(link.id);
    }
  }

  /** D-45: data on a REPLACED / EXPIRED link is never attached; it is recorded once for Ops, then not checked again. */
  private async checkLateResults(app: Application, party: Party): Promise<void> {
    const now = this.clock.now();
    for (const link of party.links) {
      if (link.status !== "REPLACED" && link.status !== "EXPIRED") continue;
      if (!link.linkId || link.lateResultAt !== undefined || this.polling.has(link.id)) continue;
      const windowEnd = (link.expiresAt ?? link.closedAt ?? link.createdAt) + this.config.linkTtlMs;
      if (now >= windowEnd) continue;
      this.polling.add(link.id);
      try {
        let r;
        try {
          r = await this.gateway.fetchPerson(link.linkId);
        } catch (e) {
          if (e instanceof GatewayUnavailable) return;
          throw e;
        }
        if (r.status !== "READY" || link.lateResultAt !== undefined) continue;
        link.lateResultAt = this.clock.now();
        const current = currentLink(party);
        this.audit("result.rejected", SYSTEM, app, party, {
          link: link.id,
          linkStatus: link.status,
          reason: isCurrent(party, link) ? "expired" : "old-link",
          returned: maskNric(r.person.uinfin),
          nricMatches: nricMatches(r.person.uinfin, party.nric) ? "yes" : "no",
          currentLink: current.id,
          currentLinkStatus: current.status,
        });
        this.db.save();
        this.onChange(app.ref);
      } finally {
        this.polling.delete(link.id);
      }
    }
  }

  // ---------------------------------------------------------------- Demo Control

  /**
   * D-29: the rows of the Ops list design (VMAF-2026-05114 … 05119); existing refs are skipped. Only Singpass test
   * personas are used (names and NRICs), so the stored Myinfo data matches the party.
   */
  async seedSamples(): Promise<number> {
    const now = this.clock.now();
    const day = 24 * 3_600_000;
    const at = (d: number) => now - d * day;
    type Sample = { status: "FULFILLED" | "SENT" | "EXPIRED"; role: Role; name: string; nric: string; at: number };
    const party = async (ref: string, s: Sample): Promise<Party> => {
      const label = s.role === "hirer" ? "Hirer" : "Guarantor";
      const partyId = `${ref}-${label.toLowerCase()}`;
      // a pending sample link is a real link of the gateway, so its customer flow works (D-50)
      let issued = { linkId: `LNK-SAMPLE-${randomBytes(4).toString("hex").toUpperCase()}`, customerUrl: `${this.config.publicBaseUrl}/gateway/sample` };
      if (s.status === "SENT") {
        try {
          issued = await this.gateway.issueLink({ applicationRef: ref, partyId, role: s.role });
        } catch (e) {
          if (!(e instanceof GatewayUnavailable)) throw e;
        }
      }
      const sentAt = s.status === "SENT" ? now - 2 * 3_600_000 : s.at;
      const link: VerificationLink = {
        id: randomUUID(),
        portalToken: randomBytes(24).toString("base64url"),
        status: s.status,
        reason: "submit",
        createdAt: sentAt,
        linkId: issued.linkId,
        customerUrl: issued.customerUrl,
        sentAt,
        expiresAt: sentAt + this.config.linkTtlMs,
        ...(s.status === "FULFILLED" ? { closedAt: sentAt + 3 * 3_600_000 } : {}),
        ...(s.status === "EXPIRED" ? { closedAt: sentAt + this.config.linkTtlMs, lateResultAt: sentAt } : {}),
      };
      return {
        id: partyId,
        role: s.role,
        label,
        name: s.name,
        nric: s.nric,
        email: `${s.name.split(" ")[0]?.toLowerCase()}@example.com`,
        mobile: "91234567",
        triggerAt: sentAt,
        resendsAt: [],
        currentLinkId: link.id,
        links: [link],
        ...(s.status === "FULFILLED" ? { fulfilledAt: sentAt + 3 * 3_600_000, myinfoSealed: this.seal(personaFor(s.nric)) } : {}),
      };
    };
    const rows: Array<{ ref: string; dealerId: string; by: [string, string]; created: number; plate: string; stage: Application["stage"]; ipaAt?: number; aaAt?: number; parties: Sample[] }> = [
      { ref: "VMAF-2026-05114", dealerId: "d-demo", by: ["u-alex", "Alex Tan"], created: at(15), plate: "SKS6603L", stage: "Declined", parties: [{ status: "FULFILLED", role: "hirer", name: "WANG XIAO LING", nric: "F4440489M", at: at(15) }] },
      { ref: "VMAF-2026-05115", dealerId: "d-demo", by: ["u-alex", "Alex Tan"], created: at(15), plate: "SNA7781B", stage: "AA", aaAt: at(13), parties: [{ status: "FULFILLED", role: "hirer", name: "MARIA SANTOS REYES", nric: "G4440427W", at: at(15) }, { status: "FULFILLED", role: "guarantor", name: "NGUYEN VAN AN", nric: "G4440430W", at: at(15) }] },
      { ref: "VMAF-2026-05116", dealerId: "d-sample", by: ["u-sample", "Sam Lee"], created: at(14), plate: "SNB9902E", stage: "Submitted", parties: [{ status: "FULFILLED", role: "hirer", name: "KIM MIN JUN", nric: "G4440431T", at: at(14) }] },
      { ref: "VMAF-2026-05117", dealerId: "d-demo", by: ["u-alex", "Alex Tan"], created: at(3), plate: "SLA4410K", stage: "IPA", ipaAt: at(2), parties: [{ status: "FULFILLED", role: "hirer", name: "AISHA BINTE RAHMAN", nric: "G4440432Q", at: at(3) }, { status: "SENT", role: "guarantor", name: "NGUYEN VAN AN", nric: "G4440430W", at: at(3) }] },
      { ref: "VMAF-2026-05118", dealerId: "d-demo", by: ["u-alex", "Alex Tan"], created: at(12), plate: "SMB2290X", stage: "Submitted", parties: [{ status: "FULFILLED", role: "hirer", name: "DAVID TAN JUN HAO", nric: "G4440433N", at: at(12) }, { status: "EXPIRED", role: "guarantor", name: "OLIVIA CHEN YU TING", nric: "M5004553J", at: at(12) }] },
      { ref: "VMAF-2026-05119", dealerId: "d-sample", by: ["u-sample", "Sam Lee"], created: at(11), plate: "SMF1187D", stage: "Submitted", parties: [{ status: "SENT", role: "hirer", name: "WANG XIAO LING", nric: "F4440489M", at: at(11) }] },
    ];
    let added = 0;
    for (const r of rows) {
      if (this.db.applications.some((a) => a.ref === r.ref)) continue;
      this.db.applications.push({
        ref: r.ref,
        dealerId: r.dealerId,
        createdById: r.by[0],
        createdByName: r.by[1],
        createdAt: r.created,
        ltaCode: "DEMO01",
        carPlate: r.plate,
        stage: r.stage,
        ...(r.ipaAt ? { ipaAt: r.ipaAt } : {}),
        ...(r.aaAt ? { aaAt: r.aaAt } : {}),
        parties: await Promise.all(r.parties.map((p) => party(r.ref, p))),
      });
      added++;
    }
    this.db.applications.sort((a, b) => b.ref.localeCompare(a.ref));
    this.db.save();
    this.onChange(null);
    return added;
  }

  /**
   * D-50 (changed 2026-11-20), D-59: Demo Control's "Open sample" shortcuts open a sample application in a given state.
   * They never create anything: only "Create sample applications" (seedSamples) does. hirer-view: the hirer's portal page of a pending link; ops-view: IPA issued, AA
   * still locked; dealer-view: the sample dealer's application where the hirer has shared their details and someone
   * is still pending. The detail pages no longer open samples: their "Demo: see …" buttons open the same application.
   */
  async demoShortcut(kind: DemoShortcutKind): Promise<{ ref: string; url: string; userId?: string }> {
    const found = this.pickSample(kind);
    if (!found) throw new ServiceError(409, this.hasSamples() ? NO_SAMPLE_IN_STATE : "No sample applications yet: Create sample applications first (Demo Control).");
    return { ref: found.app.ref, url: found.url, ...(found.userId ? { userId: found.userId } : {}) };
  }

  /** Demo Control: each shortcut with the state and the ref it opens now (ref null: no sample in that state). */
  demoShortcutList(): Array<{ kind: DemoShortcutKind; ref: string | null; label: string; hint: string }> {
    // "guarantor pending", "guarantor link expired": what each person still missing is waiting for
    const word: Partial<Record<LinkStatus, string>> = { QUEUED: "queued", SENT: "pending", OPENED: "pending", EXPIRED: "link expired", MISMATCH: "NRIC mismatch" };
    const waitingText = (app: Application) => {
      const groups = new Map<string, Party[]>();
      for (const p of this.waiting(app)) {
        const w = word[currentLink(p).status] ?? "pending";
        groups.set(w, [...(groups.get(w) ?? []), p]);
      }
      return [...groups].map(([w, ps]) => `${peopleOf(ps)} ${w}`).join(", ");
    };
    const describe: Record<DemoShortcutKind, (app: Application) => string> = {
      "ops-view": (app) => `IPA issued, ${waitingText(app)}`,
      "dealer-view": (app) => `hirer fulfilled, ${waitingText(app)}`,
      "hirer-view": () => "hirer's link pending, customer page",
    };
    const fallback: Record<DemoShortcutKind, string> = {
      "ops-view": "IPA issued, AA locked",
      "dealer-view": "hirer fulfilled, someone pending",
      "hirer-view": "hirer's link pending, customer page",
    };
    return (["ops-view", "dealer-view", "hirer-view"] as const).map((kind) => {
      const found = this.pickSample(kind);
      return found
        ? { kind, ref: found.app.ref, label: `Open sample: ${describe[kind](found.app)} (${found.app.ref})`, hint: "" }
        : { kind, ref: null, label: `Open sample: ${fallback[kind]}`, hint: this.hasSamples() ? NO_SAMPLE_IN_STATE : "Create sample applications first" };
    });
  }

  private samples(): Application[] {
    return this.db.applications.filter((a) => /^VMAF-2026-0511[4-9]$/.test(a.ref));
  }

  private hasSamples(): boolean {
    return this.samples().length > 0;
  }

  private waiting(app: Application): Party[] {
    return app.parties.filter((p) => currentLink(p).status !== "FULFILLED");
  }

  private pickSample(kind: DemoShortcutKind): { app: Application; url: string; userId?: string } | null {
    const pending = (p: Party) => {
      const l = currentLink(p);
      return (l.status === "SENT" || l.status === "OPENED") && !this.isPastExpiry(l);
    };
    for (const app of this.samples()) {
      const hirer = app.parties[0]!;
      if (kind === "hirer-view" && pending(hirer)) return { app, url: `/verify/${currentLink(hirer).portalToken}` };
      if (kind === "ops-view" && app.stage === "IPA" && !checkAa(app).ready && app.parties.some((p) => currentLink(p).status === "FULFILLED"))
        return { app, url: `/ops/applications/${app.ref}`, userId: "u-priya" };
      if (kind === "dealer-view" && app.dealerId === "d-demo" && currentLink(hirer).status === "FULFILLED" && app.parties.some(pending))
        return { app, url: `/dealer/applications/${app.ref}`, userId: "u-alex" };
    }
    return null;
  }

  // ---------------------------------------------------------------- audit

  private audit(
    type: AuditType,
    actor: Actor | typeof SYSTEM | typeof CUSTOMER,
    app: Application,
    party: Party | null,
    details: Record<string, string | number> = {},
  ): void {
    this.db.audit.unshift({
      id: randomUUID(),
      at: this.clock.now(),
      type,
      actor: actor.id,
      actorName: actor.name,
      applicationRef: app.ref,
      ...(party ? { partyId: party.id } : {}),
      details,
    });
  }
}

export type DemoShortcutKind = "hirer-view" | "ops-view" | "dealer-view";

const NO_SAMPLE_IN_STATE = "No sample in this state any more: Reset all data, then Create sample applications";

/** "guarantor", "hirer and guarantor", "guarantor 1 and guarantor 2" */
function peopleOf(parties: readonly Party[]): string {
  const names = parties.map((p) => p.label.toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "nobody");
}

function guarantorLabel(index: number, count: number): string {
  return count > 1 ? `Guarantor ${index + 1}` : "Guarantor";
}

function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}
