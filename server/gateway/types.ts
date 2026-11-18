// Adapter interface for the ValueMax Myinfo gateway (brief §4). The real API spec is still pending (Q&A B1.1):
// swapping in the real gateway means writing another class implementing MyinfoGateway.
import type { MyinfoPerson } from "../personas.ts";

export interface GatewayToken {
  accessToken: string;
  expiresAt: number;
}

export interface GatewayLink {
  linkId: string;
  /**
   * Where the customer's browser goes to log in with Singpass.
   * A path ("/...") stays in this app (simulated screens); an absolute URL is an external Myinfo login.
   */
  loginUrl: string;
}

export type GatewayPersonResult =
  | { kind: "ok"; person: MyinfoPerson }
  | { kind: "declined" }
  | { kind: "not_ready" };

export interface MyinfoGateway {
  readonly name: "simulated";
  /** GetToken */
  getToken(): Promise<GatewayToken>;
  /** GetLinkId — one Myinfo session per verification link. */
  getLinkId(token: GatewayToken, reference: { applicationRef: string; role: string }): Promise<GatewayLink>;
  /** person/autofin/{LinkId} — the consented Myinfo data. */
  getPerson(token: GatewayToken, linkId: string): Promise<GatewayPersonResult>;
  reset(): void;
}
