// Simulated ValueMax Myinfo gateway (+ Singpass). It plays a separate system: AutoFinance reaches it only through
// MockGatewayAdapter; the customer reaches it through the /gateway/<LinkId> pages. Like the real gateway it:
//  - accepts consent on any LinkId it issued, also an old one (it cannot cancel links),
//  - never tells AutoFinance that the customer refused (D-33): it only records it in its own log,
//  - does not redirect the customer back to AutoFinance.
import { randomBytes } from "node:crypto";
import type { Clock } from "../clock.ts";
import { maskNric, normalizeNric } from "../nric.ts";
import { personaFor } from "../personas.ts";
import type { MyinfoPerson } from "../personas.ts";
import { GatewayUnavailable } from "./adapter.ts";
import type { GatewayAdapter, IssuedLink, PartyRef, PersonResult } from "./adapter.ts";

interface Session {
  linkId: string;
  party: PartyRef;
  issuedAt: number;
  loggedInAs?: string;
  agreedAt?: number;
  submittedAt?: number;
}

export interface GatewayLogEntry {
  at: number;
  linkId: string;
  applicationRef: string;
  event: "issued" | "login" | "agreed" | "declined" | "submitted" | "fetched";
  /** Masked NRIC of the persona that logged in. */
  who?: string;
}

const TOKEN_TTL_MS = 10 * 60_000;

export class SimulatedGateway {
  private available = true;
  private readonly sessions = new Map<string, Session>();
  private readonly tokens = new Map<string, number>();
  private entries: GatewayLogEntry[] = [];
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  // ---- presenter controls ----
  setAvailable(value: boolean): void {
    this.available = value;
  }

  isAvailable(): boolean {
    return this.available;
  }

  get log(): readonly GatewayLogEntry[] {
    return this.entries;
  }

  issuedLinkCount(): number {
    return this.sessions.size;
  }

  reset(): void {
    this.sessions.clear();
    this.tokens.clear();
    this.entries = [];
    this.available = true;
  }

  // ---- server-to-server API (GetToken, GetLinkId, person/autofin/{LinkId}) ----
  private ensureUp(): void {
    if (!this.available) throw new GatewayUnavailable();
  }

  getToken(): { accessToken: string; expiresAt: number } {
    this.ensureUp();
    const accessToken = `sim-${randomBytes(12).toString("hex")}`;
    const expiresAt = this.clock.now() + TOKEN_TTL_MS;
    this.tokens.set(accessToken, expiresAt);
    return { accessToken, expiresAt };
  }

  private checkToken(accessToken: string): void {
    this.ensureUp();
    const exp = this.tokens.get(accessToken);
    if (!exp || exp <= this.clock.now()) throw new Error("Simulated gateway: invalid or expired access token");
  }

  getLinkId(accessToken: string, party: PartyRef): string {
    this.checkToken(accessToken);
    const linkId = `LNK-${randomBytes(8).toString("hex").toUpperCase()}`;
    this.sessions.set(linkId, { linkId, party, issuedAt: this.clock.now() });
    this.record(linkId, "issued");
    return linkId;
  }

  person(accessToken: string, linkId: string): PersonResult {
    this.checkToken(accessToken);
    const s = this.sessions.get(linkId);
    if (!s?.submittedAt || !s.loggedInAs) return { status: "NOT_READY" };
    this.record(linkId, "fetched");
    return { status: "READY", person: personaFor(s.loggedInAs) };
  }

  // ---- customer side (the /gateway/<LinkId> pages) ----
  session(linkId: string): Readonly<Session> | undefined {
    return this.sessions.get(linkId);
  }

  login(linkId: string, uinfin: string): MyinfoPerson | null {
    const s = this.sessions.get(linkId);
    if (!s) return null;
    s.loggedInAs = normalizeNric(uinfin);
    delete s.agreedAt;
    delete s.submittedAt;
    this.record(linkId, "login");
    return personaFor(s.loggedInAs);
  }

  agree(linkId: string): boolean {
    const s = this.sessions.get(linkId);
    if (!s?.loggedInAs) return false;
    s.agreedAt = this.clock.now();
    this.record(linkId, "agreed");
    return true;
  }

  /** Customer pressed Cancel: recorded here only; the session is back to "not done" (D-33). */
  decline(linkId: string): boolean {
    const s = this.sessions.get(linkId);
    if (!s) return false;
    this.record(linkId, "declined");
    delete s.loggedInAs;
    delete s.agreedAt;
    return true;
  }

  submit(linkId: string): boolean {
    const s = this.sessions.get(linkId);
    if (!s?.loggedInAs || !s.agreedAt) return false;
    s.submittedAt = this.clock.now();
    this.record(linkId, "submitted");
    return true;
  }

  private record(linkId: string, event: GatewayLogEntry["event"]): void {
    const s = this.sessions.get(linkId);
    const entry: GatewayLogEntry = { at: this.clock.now(), linkId, applicationRef: s?.party.applicationRef ?? "", event };
    if (s?.loggedInAs) entry.who = maskNric(s.loggedInAs);
    this.entries.unshift(entry);
    this.entries = this.entries.slice(0, 200);
    if (event === "declined") console.log(`[gateway] ${entry.applicationRef} ${linkId}: customer declined consent (not reported to AutoFinance)`);
  }
}

/** Adapter AutoFinance uses to reach the simulated gateway. GetToken is cached until the gateway rejects it. */
export class MockGatewayAdapter implements GatewayAdapter {
  private token: { accessToken: string; expiresAt: number } | null = null;
  private readonly gateway: SimulatedGateway;
  private readonly baseUrl: string;

  constructor(gateway: SimulatedGateway, publicBaseUrl: string) {
    this.gateway = gateway;
    this.baseUrl = publicBaseUrl.replace(/\/+$/, "");
  }

  private accessToken(): string {
    this.token ??= this.gateway.getToken();
    return this.token.accessToken;
  }

  async issueLink(party: PartyRef): Promise<IssuedLink> {
    const linkId = this.withToken((t) => this.gateway.getLinkId(t, party));
    return { linkId, customerUrl: `${this.baseUrl}/gateway/${encodeURIComponent(linkId)}` };
  }

  async fetchPerson(linkId: string): Promise<PersonResult> {
    return this.withToken((t) => this.gateway.person(t, linkId));
  }

  private withToken<T>(call: (accessToken: string) => T): T {
    try {
      return call(this.accessToken());
    } catch (e) {
      if (e instanceof GatewayUnavailable) throw e;
      // token rejected (expired): get a fresh one once
      this.token = null;
      return call(this.accessToken());
    }
  }
}
