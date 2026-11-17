// Mock ValueMax gateway. The simulated Singpass screens (customer side) call `simulateLogin` / `simulateConsent`
// to play the part of Singpass; the backend only ever talks to it through the MyinfoGateway interface.
import { randomBytes } from "node:crypto";
import { personaFor } from "../personas.ts";
import type { GatewayLink, GatewayPersonResult, GatewayToken, MyinfoGateway } from "./types.ts";

interface Session {
  linkId: string;
  loggedInAs?: string;
  outcome?: "agreed" | "declined";
}

export class MockGateway implements MyinfoGateway {
  readonly name = "simulated" as const;
  private sessions = new Map<string, Session>();

  async getToken(): Promise<GatewayToken> {
    return { accessToken: `mock-${randomBytes(12).toString("hex")}`, expiresAt: Date.now() + 10 * 60_000 };
  }

  async getLinkId(_token: GatewayToken, _ref: { applicationRef: string; role: string }): Promise<GatewayLink> {
    const linkId = `LNK-${randomBytes(8).toString("hex").toUpperCase()}`;
    this.sessions.set(linkId, { linkId });
    return { linkId, loginUrl: `/singpass/${linkId}` };
  }

  async getPerson(_token: GatewayToken, linkId: string): Promise<GatewayPersonResult> {
    const s = this.sessions.get(linkId);
    if (!s || !s.outcome || !s.loggedInAs) return s?.outcome === "declined" ? { kind: "declined" } : { kind: "not_ready" };
    if (s.outcome === "declined") return { kind: "declined" };
    return { kind: "ok", person: personaFor(s.loggedInAs) };
  }

  // ---- simulated Singpass side ----
  simulateLogin(linkId: string, uinfin: string): boolean {
    const s = this.sessions.get(linkId);
    if (!s) return false;
    s.loggedInAs = uinfin.trim().toUpperCase();
    return true;
  }

  simulateConsent(linkId: string, outcome: "agreed" | "declined"): boolean {
    const s = this.sessions.get(linkId);
    if (!s) return false;
    s.outcome = outcome;
    return true;
  }

  loggedInAs(linkId: string): string | undefined {
    return this.sessions.get(linkId)?.loggedInAs;
  }

  reset(): void {
    this.sessions.clear();
  }
}
