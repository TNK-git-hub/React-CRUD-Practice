// Adapter interface for the ValueMax Myinfo gateway (brief §4). The real API spec is still pending (Q&A B1.1):
// swapping the mock for the real gateway means writing another class implementing MyinfoGateway.
import type { MyinfoPerson } from "../personas.ts";

export interface GatewayToken {
  accessToken: string;
  expiresAt: number;
}

export interface GatewayLink {
  linkId: string;
  /** Where the customer is sent to log in with Singpass. */
  loginUrl: string;
}

export type GatewayPersonResult =
  | { kind: "ok"; person: MyinfoPerson }
  | { kind: "declined" }
  | { kind: "not_ready" };

export interface MyinfoGateway {
  /** GetToken */
  getToken(): Promise<GatewayToken>;
  /** GetLinkId — one Myinfo session per verification link. */
  getLinkId(token: GatewayToken, reference: { applicationRef: string; role: string }): Promise<GatewayLink>;
  /** person/autofin/{LinkId} — the consented Myinfo data. */
  getPerson(token: GatewayToken, linkId: string): Promise<GatewayPersonResult>;
}
