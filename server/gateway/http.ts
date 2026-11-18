// Gateway adapter that talks to a gateway over HTTP: the mock gateway in mock-gateway/ today, the real ValueMax
// gateway later (change GATEWAY_URL and the credentials; adjust paths here once the real spec, Q&A B1.1, arrives).
//   GetToken                 POST {base}/gw/api/token
//   GetLinkId                POST {base}/gw/api/link            -> { linkId, url, expiresAt }
//   person/autofin/{LinkId}  GET  {base}/gw/api/person/autofin/{linkId}
// The data itself normally arrives by webhook (POST /api/gateway/webhook); getPerson is the pull fallback.
import type { MyinfoPerson } from "../personas.ts";
import type { GatewayLink, GatewayPersonResult, GatewayToken, MyinfoGateway } from "./types.ts";

export interface HttpGatewayOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Where the gateway pushes results (this app's /api/gateway/webhook, reachable from the gateway). */
  webhookUrl: string;
}

export class HttpGateway implements MyinfoGateway {
  readonly name = "http" as const;
  private token: GatewayToken | null = null;
  private readonly opts: HttpGatewayOptions;

  constructor(opts: HttpGatewayOptions) {
    this.opts = { ...opts, baseUrl: opts.baseUrl.replace(/\/$/, "") };
  }

  private async call<T>(method: string, path: string, body?: unknown, token?: GatewayToken): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token.accessToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error(`Myinfo gateway not reachable at ${this.opts.baseUrl}`);
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(`Myinfo gateway ${path}: ${json.error ?? res.status}`);
    return json;
  }

  async getToken(): Promise<GatewayToken> {
    if (this.token && this.token.expiresAt - 30_000 > Date.now()) return this.token;
    const r = await this.call<{ access_token: string; expires_in: number }>("POST", "/gw/api/token", {
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
    });
    this.token = { accessToken: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
    return this.token;
  }

  async getLinkId(token: GatewayToken, ref: { applicationRef: string; role: string }): Promise<GatewayLink> {
    const r = await this.call<{ linkId: string; url: string }>(
      "POST",
      "/gw/api/link",
      { applicationRef: ref.applicationRef, role: ref.role, webhookUrl: this.opts.webhookUrl },
      token,
    );
    return { linkId: r.linkId, loginUrl: r.url };
  }

  async getPerson(token: GatewayToken, linkId: string): Promise<GatewayPersonResult> {
    const r = await this.call<{ status: string; person?: MyinfoPerson }>("GET", `/gw/api/person/autofin/${encodeURIComponent(linkId)}`, undefined, token);
    if (r.status === "submitted" && r.person) return { kind: "ok", person: r.person };
    if (r.status === "declined") return { kind: "declined" };
    return { kind: "not_ready" };
  }

  reset(): void {
    this.token = null;
    void this.getToken()
      .then((t) => this.call("POST", "/gw/api/demo/reset", {}, t))
      .catch(() => undefined);
  }
}
