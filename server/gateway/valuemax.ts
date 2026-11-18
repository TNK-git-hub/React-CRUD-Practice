// Adapter for the real ValueMax Myinfo gateway. NOT IMPLEMENTED: the API spec (Q&A B1.1), the credentials (B2.2) and
// the IP whitelist (B1.9) are still pending. It must never be called in the demo.
//
// Reference endpoints (staging, from the proposal):
//   GetToken:  https://myinfo-stg.valuemax.com.sg/Utilities/AutoFin/GetToken
//   GetLinkId: https://myinfo-stg.valuemax.com.sg/Utilities/AutoFin/GetLinkId
//   Person:    https://myinfo-api-stg.valuemax.com.sg/person/autofin/{LinkId}
import type { GatewayAdapter, IssuedLink, PartyRef, PersonResult } from "./adapter.ts";

export interface ValueMaxGatewayOptions {
  tokenUrl: string;
  linkIdUrl: string;
  /** Contains `{LinkId}`. */
  personUrl: string;
  clientId: string;
  clientSecret: string;
}

export class ValueMaxGatewayAdapter implements GatewayAdapter {
  readonly options: ValueMaxGatewayOptions;

  constructor(options: ValueMaxGatewayOptions) {
    this.options = options;
  }

  async issueLink(_party: PartyRef): Promise<IssuedLink> {
    // TODO(B1.1): GetToken (cache until expiry), then GetLinkId with the party reference.
    // TODO(B1.1): map the response to { linkId, customerUrl }; map timeouts / 5xx to GatewayUnavailable.
    throw new Error("ValueMaxGatewayAdapter is not implemented (waiting for the API spec, Q&A B1.1)");
  }

  async fetchPerson(_linkId: string): Promise<PersonResult> {
    // TODO(B1.1): GET person/autofin/{LinkId}; map "no consent yet" to NOT_READY (the gateway does not report a
    // refusal, D-33); map the person payload to MyinfoPerson (at least uinfin); map outages to GatewayUnavailable.
    throw new Error("ValueMaxGatewayAdapter is not implemented (waiting for the API spec, Q&A B1.1)");
  }
}
