// Singpass link flow of AutoFinance: issuing links, the auto-verify job, resend, IPA / AA.
// Every gateway call goes through the GatewayAdapter; every time comes from the injected clock.
import { randomBytes, randomUUID } from "node:crypto";
import type { Clock } from "../clock.ts";
import type { AppConfig } from "../config.ts";
import { GatewayUnavailable } from "../gateway/adapter.ts";
import type { GatewayAdapter } from "../gateway/adapter.ts";
import { renderEmail } from "../mail.ts";
import { maskNric, normalizeNric, nricMatches } from "../nric.ts";
import type { MyinfoPerson } from "../personas.ts";
import type { Db } from "./db.ts";
import { ACTIVE_LINK_STATUSES, MAX_GUARANTORS, currentLink, isCurrent, validateParty } from "./model.ts";
import type { Application, ApplicationInput, AuditType, IssueReason, Party, PartyInput, Role, VerificationLink } from "./model.ts";
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

  /** Ops or the dealer agent who submitted the application (D-04); a reason is required. */
  async resend(ref: string, partyId: string, actor: Actor, reason: string): Promise<Application> {
    const app = this.getApplication(ref);
    const party = this.party(app, partyId);
    if (!(actor.kind === "ops" || (actor.kind === "dealer" && actor.id === app.createdById)))
      throw new ServiceError(403, "Only Ops or the dealer agent who submitted the application can resend");
    if (!reason?.trim()) throw new ServiceError(400, "A reason is required to resend");
    const now = this.clock.now();
    party.resendsAt.push(now);
    const link = this.newLink(app, party, "resend", actor);
    this.audit("link.resent", actor, app, party, { link: link.id, reason: reason.trim() });
    this.db.save();
    this.onChange(app.ref);
    await this.dispatch(app, party, link);
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

function guarantorLabel(index: number, count: number): string {
  return count > 1 ? `Guarantor ${index + 1}` : "Guarantor";
}

function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}
