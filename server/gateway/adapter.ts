// The only way AutoFinance talks to the Myinfo gateway (brief §4). GetToken is an internal detail of each adapter.
// Implementations: MockGatewayAdapter (simulated.ts) and the ValueMaxGatewayAdapter stub (valuemax.ts).
import type { MyinfoPerson } from "../personas.ts";

export interface PartyRef {
  applicationRef: string;
  partyId: string;
  role: "hirer" | "guarantor";
}

export interface IssuedLink {
  linkId: string;
  /** Where the AutoFinance portal sends the customer once the link check passes. */
  customerUrl: string;
}

export type PersonResult = { status: "NOT_READY" } | { status: "READY"; person: MyinfoPerson };

/** The gateway cannot be reached (network, outage, maintenance). Callers retry later. */
export class GatewayUnavailable extends Error {
  constructor(message = "Myinfo gateway unavailable") {
    super(message);
    this.name = "GatewayUnavailable";
  }
}

export interface GatewayAdapter {
  /** GetToken + GetLinkId. */
  issueLink(party: PartyRef): Promise<IssuedLink>;
  /** person/autofin/{LinkId}: NOT_READY until the customer has consented and submitted. */
  fetchPerson(linkId: string): Promise<PersonResult>;
}
