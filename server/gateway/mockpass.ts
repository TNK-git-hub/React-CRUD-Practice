// Gateway adapter backed by MockPass (@opengovsg/mockpass), the open-source Singpass / Myinfo v3 mock.
// Flow: browser -> {publicUrl}/myinfo/v3/authorise -> MockPass login (pick a persona) -> consent (Allow / Deny)
//       -> redirect to {appBaseUrl}/myinfo-callback?code&state -> POST /myinfo/v3/token -> GET /myinfo/v3/person/{uinfin}
// `state` carries our linkId, so the result is attached to the right verification link.
import { createPublicKey, createVerify, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MyinfoPerson } from "../personas.ts";
import type { GatewayLink, GatewayPersonResult, GatewayToken, MyinfoGateway } from "./types.ts";

export const MYINFO_ATTRIBUTES = [
  "uinfin", "name", "aliasname", "sex", "race", "nationality", "dob", "birthcountry", "marital", "email", "mobileno",
  "regadd", "employment", "employmentsector", "occupation", "edulevel", "noahistory", "cpfcontributions",
  "housingtype", "hdbtype", "hdbownership",
];

interface Session {
  createdAt: number;
  result?: GatewayPersonResult;
}

export interface MockPassOptions {
  /** URL the backend uses to call MockPass (e.g. http://localhost:5156). */
  internalUrl: string;
  /** URL the customer's browser uses (this app proxies MockPass, so usually the app's own base URL). */
  publicUrl: string;
  /** This app's base URL, for the OAuth redirect_uri. */
  appBaseUrl: string;
  clientId: string;
  mockpassDir: string;
}

export class MockPassGateway implements MyinfoGateway {
  readonly name = "mockpass" as const;
  private sessions = new Map<string, Session>();
  private readonly opts: MockPassOptions;
  private readonly verifyKey;

  constructor(opts: MockPassOptions) {
    this.opts = opts;
    // MockPass signs its access tokens with this certificate (static/certs/spcp.crt).
    this.verifyKey = createPublicKey(readFileSync(join(opts.mockpassDir, "static", "certs", "spcp.crt")));
  }

  get redirectUri(): string {
    return `${this.opts.appBaseUrl}/myinfo-callback`;
  }

  async getToken(): Promise<GatewayToken> {
    // Myinfo v3 has no client token before the user consents; kept for the adapter interface.
    return { accessToken: "", expiresAt: Date.now() + 10 * 60_000 };
  }

  async getLinkId(_token: GatewayToken, ref: { applicationRef: string; role: string }): Promise<GatewayLink> {
    const linkId = `MP-${randomBytes(12).toString("hex")}`;
    this.sessions.set(linkId, { createdAt: Date.now() });
    const q = new URLSearchParams({
      client_id: this.opts.clientId,
      attributes: MYINFO_ATTRIBUTES.join(","),
      purpose: `Car loan application ${ref.applicationRef} (${ref.role}) — ValueMax AutoFinance demo`,
      state: linkId,
      redirect_uri: this.redirectUri,
    });
    return { linkId, loginUrl: `${this.opts.publicUrl}/myinfo/v3/authorise?${q}` };
  }

  async getPerson(_token: GatewayToken, linkId: string): Promise<GatewayPersonResult> {
    return this.sessions.get(linkId)?.result ?? { kind: "not_ready" };
  }

  async handleCallback(query: URLSearchParams): Promise<{ linkId: string; outcome: "agreed" | "declined" }> {
    const linkId = query.get("state") ?? "";
    const session = this.sessions.get(linkId);
    if (!session) throw new Error("Unknown or expired Myinfo session");
    if (query.get("error") || !query.get("code")) {
      session.result = { kind: "declined" };
      return { linkId, outcome: "declined" };
    }
    const accessToken = await this.exchangeCode(query.get("code") ?? "");
    const uinfin = this.verifyAccessToken(accessToken);
    const raw = await this.fetchPerson(uinfin, accessToken);
    session.result = { kind: "ok", person: mapMyinfoV3(raw) };
    return { linkId, outcome: "agreed" };
  }

  private async exchangeCode(code: string): Promise<string> {
    const res = await fetch(`${this.opts.internalUrl}/myinfo/v3/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
        client_id: this.opts.clientId,
        client_secret: "mockpass-demo",
      }),
    });
    const body = (await res.json()) as { access_token?: string; message?: string };
    if (!res.ok || !body.access_token) throw new Error(`Myinfo token failed: ${body.message ?? res.status}`);
    return body.access_token;
  }

  /** Verifies the RS256 signature and returns `sub` (the uinfin). */
  private verifyAccessToken(jwt: string): string {
    const [h, p, s] = jwt.split(".");
    if (!h || !p || !s) throw new Error("Malformed access token");
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${p}`);
    if (!v.verify(this.verifyKey, Buffer.from(s, "base64url"))) throw new Error("Access token signature invalid");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    if (!payload.sub) throw new Error("Access token without sub");
    if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error("Access token expired");
    return payload.sub;
  }

  private async fetchPerson(uinfin: string, accessToken: string): Promise<Record<string, unknown>> {
    const q = new URLSearchParams({ attributes: MYINFO_ATTRIBUTES.join(","), client_id: this.opts.clientId });
    const res = await fetch(`${this.opts.internalUrl}/myinfo/v3/person/${encodeURIComponent(uinfin)}/?${q}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Myinfo person failed: ${String(body.message ?? res.status)}`);
    return body;
  }

  reset(): void {
    this.sessions.clear();
  }
}

// ---------- Myinfo v3 person -> our MyinfoPerson ----------
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const val = (v: unknown): string => {
  const o = obj(v);
  const x = o.value ?? o.desc ?? "";
  return typeof x === "string" || typeof x === "number" ? String(x) : "";
};
const desc = (v: unknown): string => {
  const o = obj(v);
  return String(o.desc || o.value || "");
};

function address(v: unknown): string {
  const a = obj(v);
  const block = val(a.block);
  const street = val(a.street);
  const floor = val(a.floor);
  const unit = val(a.unit);
  const building = val(a.building);
  const postal = val(a.postal);
  return [
    [block, street].filter(Boolean).join(" "),
    floor && unit ? `#${floor}-${unit}` : "",
    building,
    postal ? `Singapore ${postal}` : "",
  ].filter(Boolean).join(", ");
}

export function mapMyinfoV3(p: Json): MyinfoPerson {
  const mobile = obj(p.mobileno);
  const noas = (obj(p.noahistory).noas as unknown[] | undefined) ?? [];
  const cpf = (obj(p.cpfcontributions).history as unknown[] | undefined) ?? [];
  const hdb = obj(((p.hdbownership as unknown[] | undefined) ?? [])[0]);
  const lastCpf = obj(cpf[cpf.length - 1]);
  return {
    uinfin: val(p.uinfin),
    name: val(p.name),
    aliasName: val(p.aliasname),
    sex: desc(p.sex),
    race: desc(p.race),
    nationality: desc(p.nationality),
    dob: val(p.dob),
    birthCountry: desc(p.birthcountry),
    maritalStatus: desc(p.marital),
    email: val(p.email),
    mobile: val(mobile.nbr) ? `${val(mobile.prefix)}${val(mobile.areacode)} ${val(mobile.nbr)}` : "",
    regAddress: address(p.regadd),
    employer: val(p.employment),
    employmentSector: val(p.employmentsector),
    occupation: desc(p.occupation),
    education: desc(p.edulevel),
    noaHistory: noas.map((n) => ({ year: Number(val(obj(n).yearofassessment)), amount: Number(val(obj(n).amount)) || 0 })),
    cpfMonths: cpf.length,
    cpfLatestAmount: Number(val(lastCpf.amount)) || 0,
    housingType: desc(p.housingtype) || (desc(p.hdbtype) ? "HDB" : ""),
    hdbType: desc(p.hdbtype),
    hdbOwnership: val(hdb.noofowners) ? `${val(hdb.noofowners)} OWNER(S)` : "",
    hdbPurchaseDate: val(hdb.dateofpurchase),
    hdbMonthlyInstalment: Number(val(hdb.monthlyloaninstalment)) || 0,
    hdbOutstandingLoan: Number(val(hdb.outstandingloanbalance)) || 0,
  };
}
