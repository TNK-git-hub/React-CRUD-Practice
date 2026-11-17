# ValueMax AutoFinance — Singpass Myinfo Auto Verify (demo)

Demo of the Dealer Portal flow from `docs/requirements/singpass-demo-brief.md`: the dealer submits an application on
the laptop, the hirer and guarantor each get a link by email, log in and consent to share Myinfo on their phone through
**MockPass** (the open-source Singpass / Myinfo v3 mock, `@opengovsg/mockpass`), review the data and press
**Submit Application**; the dealer and Ops screens switch to **Fulfilled** live (Server-Sent Events, no refresh).

### Myinfo gateway

`GATEWAY=mockpass` (default) — real OAuth round trip against MockPass, started by `npm run dev` on port 5156 and
proxied through this app, so the phone only needs the app's URL:

```
email link /v/{token} → "Retrieve Myinfo with Singpass" → /myinfo/v3/authorise (MockPass)
  → MockPass login (Login → type a persona NRIC, e.g. S9812379B) → consent page (Allow / Deny → Submit)
  → /myinfo-callback?code&state → backend: POST /myinfo/v3/token, GET /myinfo/v3/person/{uinfin}
  → review screen (Personal / Employment & Education / Property) → Submit Application → NRIC check → Fulfilled
```

MockPass personas (use one as the NRIC the dealer enters): `S9812379B` LIM YONG XIANG, `S9812351B` TAN CHONG HO,
`S9812353I` SONG CHIN YONG, `S9912374E` TIMOTHY TAN CHENG GUAN … (full list:
`node_modules/@opengovsg/mockpass/static/myinfo/v3.json`). "Fill sample" on Quick Apply uses the first two.
`GATEWAY=simulated` switches back to the built-in fake Singpass screens (staging persona list, no MockPass).

The real ValueMax gateway (`myinfo-stg.valuemax.com.sg`) is not wired: its API spec (GetToken, GetLinkId,
person/autofin/{LinkId}) is still pending (Q&A B1.1). It plugs in as another adapter in `server/gateway/`.

> Work in progress: everything runs end to end, but the UI is not yet pixel-matched to `docs/claude-code-demo/design/`.

## Run

Requires Node.js ≥ 22.18 (runs the TypeScript directly, no build step).

```bash
npm install
npm run dev          # creates .env on first run (with a fresh MYINFO_ENCRYPTION_KEY), then starts on :3000
```

- Laptop: http://localhost:3000. Pick **Alex Tan (dealer)** or **Priya Nair (Ops)** — "Switch role" in the header.
- Demo Control: http://localhost:3000/demo (reset data, sample applications, expire a link, outbox, QR codes).
- Tests: `npm test` · type-check: `npm run typecheck`.

### Email

| Option | `.env` |
| --- | --- |
| No SMTP (default) | leave `SMTP_HOST` empty: links are printed in the server log and listed in Demo Control → Outbox |
| Mailpit (local inbox) | `docker compose up -d mailpit`, then `SMTP_HOST=localhost`, `SMTP_PORT=1025`; inbox at http://localhost:8025 |
| Real mailbox (Gmail) | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>` |

### Letting a phone open the link

The link in the email uses `PUBLIC_BASE_URL`.

- **Same Wi-Fi**: leave it empty — the server prints the detected LAN address (`http://192.168.x.x:3000`).
  Allow incoming connections for Node in the macOS firewall if asked.
- **Tunnel** (any network): `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`), then set
  `PUBLIC_BASE_URL=https://<the-tunnel-host>` in `.env` and restart.
- Fallback: screen 3 ("Show QR of the link") and Demo Control show a QR code of each link.

## Demo script (~5 minutes)

1. Demo Control → **Reset all data**, then **Create sample applications** (fills the Ops list).
2. Laptop, as **Alex Tan**: Quick Apply → **Fill sample (test personas)** → type the email address of the phone for
   hirer and guarantor → Next → tick both confirmations → **Send Singpass Request**. Screen 3 shows the reference and
   link expiry; open **View Application Status** and leave it on screen.
3. Phone: open the email → **Verify with Singpass** → **Retrieve Myinfo with Singpass** → MockPass: **Login**, NRIC
   **S9812379B** → Login → **Allow** → Submit → review tabs → **Submit Application** → "Details shared".
   The laptop's hirer chip turns **Fulfilled** within a second.
4. Second tab as **Priya Nair** (Ops): All Applications shows hirer Fulfilled, guarantor Pending. Open it:
   Change Status → **Issue AA** shows "Cannot issue AA yet"; **Issue IPA** works while Singpass is pending.
5. Guarantor link on the phone → MockPass NRIC **S9812351B** → Allow → Submit Application. Both Fulfilled → Issue AA is enabled.
6. Error cases (Demo Control lists them):
   - **NRIC mismatch**: log in to MockPass with a different persona NRIC than the dealer entered → red on Ops.
   - **Cancel**: choose **Deny** on the MockPass consent page → "Declined".
   - **Old link after Resend**: Ops → **Resend Email**, then open the previous link → "This link is no longer valid".
   - **Expired link**: Demo Control → **Make link expired**, then open the link.

Simulated-gateway personas (`GATEWAY=simulated`): `F4440488P`, `F4440489M`, `G4440425M`, `G4440427W`, `G4440430W`,
`G4440431T`, `G4440432Q`, `G4440433N`, `M5004553J`. Any other valid NRIC also logs in with generic test data.

## Structure

```
server/index.ts         HTTP API, SSE (/api/events), static files, sessions
server/store.ts         domain rules: links (72 h, 1 active per person), outcomes, IPA / AA lock, seed / reset
server/gateway/         gateway adapters: types.ts (GetToken, GetLinkId, person/autofin/{LinkId}),
                        mockpass.ts (MockPass Myinfo v3 OAuth), mock.ts (built-in simulated screens)
server/nric.ts          NRIC / FIN checksum, mobile, email checks
server/crypto.ts        AES-256-GCM for stored Myinfo data
server/mail.ts          email (nodemailer)
public/                 frontend (vanilla JS SPA): dealer, Ops, customer phone screens, Demo Control
tests/rules.test.ts     NRIC validation, link expiry / supersede, NRIC comparison, AA lock
data/db.json            demo data (git-ignored); Demo Control → Reset deletes it all
```

Decisions behind the rules: `docs/requirements/decisions.md` (D-01 … D-32).
