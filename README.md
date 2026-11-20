# ValueMax AutoFinance — Singpass Myinfo Auto Verify (demo)

Presale demo of the Dealer Portal "auto verify" flow for ValueMax AutoFinance. The dealer submits an application on a
laptop; the hirer and up to two guarantors each get their own link by email (plus an SMS notice); each person opens the
link on their phone, goes through a **simulated** ValueMax Myinfo gateway (Singpass login, consent, review) and shares
their data; AutoFinance picks the data up by **polling** the gateway, checks the NRIC, and the dealer and Ops screens
switch to **Fulfilled** by themselves. The AA is locked on the server until every person is Fulfilled.

Requirements: `docs/requirements/singpass-demo-brief.md`; decisions: `docs/requirements/decisions.md` (D-01 … D-51);
gap report and plan: `docs/claude-code-demo/GAP_REPORT.md`; screenshots: `docs/claude-code-demo/screens/`.

## 1. Run it on a new machine

Requires **Node.js ≥ 22.18** and npm (`engines` in `package.json`). 22.18 is the first Node version that runs the
TypeScript files directly (no build step); it also covers nodemailer 10, which needs Node ≥ 20. Nothing else for the
demo itself.

```bash
git clone <repo-url> singpass-demo && cd singpass-demo
git checkout singpass-2
npm ci
cp .env.example .env
# put a fresh 256-bit key (64 hex characters) into MYINFO_ENCRYPTION_KEY in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   (or: openssl rand -hex 32)
npm start                     # or: npm run dev (restarts on code changes)
```

Shortcut: instead of `cp` + editing the key by hand, `npm run setup` creates `.env` from `.env.example` with a new key
(only if `.env` does not exist yet); `npm start` and `npm run dev` run it first. The server refuses to start without a
valid key (D-03) and says why.

If port 3000 is already used on the machine (an editor or another dev server), set `PORT=3001` (or any free port) in
`.env`. `npm ci` may print `npm audit` warnings; see "Known audit findings" below.

### Known audit findings (2026-11-18)

`npm audit --omit=dev` (what the demo runs): **0 vulnerabilities** (nodemailer upgraded to 10.6). `npm audit` still
reports high-severity findings only in **development tools**: `picomatch` (ReDoS, GHSA-fc5q-39xc-vjpf) pulled in by
`typescript-eslint` → `@typescript-eslint/typescript-estree` → `tinyglobby` / `fdir`, used by `npm run lint` on our own
source files only. `npm audit fix` cannot fix it without `--force`, which would downgrade `typescript-eslint`; it is
accepted until `typescript-eslint` ships a fixed dependency.

Then open:

| URL | What |
| --- | --- |
| http://localhost:3000 | sign in as **Alex Tan — Demo Motors** (dealer) or **Priya Nair — VMAF Ops**; "Switch role" in the header |
| http://localhost:3000/demo | **Demo Control** (presenter): reset, sample applications, gateway on/off, run job now, clock, outbox, gateway log |
| printed at start-up | "Phone links" base URL — what the emails contain (see §4) |

### Tests

```bash
npm test             # service + HTTP tests (node:test)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
# end-to-end (Playwright, one test of the main demo script, D-36) — install Chromium once:
npx playwright install chromium     # downloads ~100 MB once into the user's Playwright cache
#   on a machine behind a company proxy with its own root CA ("unable to verify the first certificate"):
NODE_OPTIONS=--use-system-ca npx playwright install chromium
npm run test:e2e     # starts its own server on :3100 with its own data file; does not touch data/db.json or .env
npm run screens      # regenerates docs/claude-code-demo/screens/*.png (needs Chromium too)
```

## 2. Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MYINFO_ENCRYPTION_KEY` | — (required) | AES-256-GCM key for stored Myinfo data, 64 hex characters (D-03) |
| `PORT` | 3000 | listens on 0.0.0.0 so phones on the same network can reach it |
| `PUBLIC_BASE_URL` | LAN address | base URL put in emails and used for the gateway pages; must be reachable from the phone |
| `LINK_TTL_HOURS` | 72 | link validity, counted from the moment the link is sent (D-24) |
| `POLL_INTERVAL_MS` | 2000 | how often the auto-verify job polls the gateway (D-01) |
| `RESEND_LIMIT` / `RESEND_WINDOW_HOURS` | 3 / 24 | resends per person in a sliding window (D-39) |
| `MYINFO_SHOW_REVIEW` | true | the simulated gateway shows the review screen before "Submit Application" (D-31) |
| `DATA_FILE` | `data/db.json` | where the demo data is kept |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | empty | real email; see below |

**Email.** Without `SMTP_HOST` emails are not sent: each link is printed in the server log and listed in Demo Control →
Outbox (enough for a demo on one laptop). Local inbox: `docker compose up -d mailpit`, then `SMTP_HOST=localhost`,
`SMTP_PORT=1025`, inbox at http://localhost:8025. Real mailbox (Gmail): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
`SMTP_SECURE=true`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>`, `MAIL_FROM=you@gmail.com`.
SMS is never sent: the SMS notice ("we have emailed you…", no link) appears only in the outbox (D-13).

## 3. Reset the data

Demo Control → **Reset all data** hard-deletes every application, link, Myinfo record, message and audit event, clears
the simulated gateway and puts the clock back to real time (D-02). **Create sample applications** adds
`VMAF-2026-05114` … `05119` (test personas only, D-29). Stopping the server and deleting `data/db.json` does the same
as a reset.

## 4. Let a phone open the links

- **Same Wi-Fi:** leave `PUBLIC_BASE_URL` empty; the server prints the LAN address it uses (`http://192.168.x.x:3000`).
  Allow incoming connections for Node if the macOS firewall asks.
- **Any network (tunnel):** `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`), set
  `PUBLIC_BASE_URL=https://<tunnel-host>` in `.env`, restart.
- **Fallback:** Demo Control → Links → "QR (presenter only)" shows a QR of any link.
- **Hosted (Render):** see §4.1; links use the `https://<service>.onrender.com` URL.

### 4.1 Deploy on Render (free plan)

Needs a long-running Node process (SSE, auto-verify job), so serverless hosts (Vercel, Netlify) will not work. The
repo ships a `Dockerfile` and a Render Blueprint (`render.yaml`, free plan).

1. Render Dashboard → **New → Blueprint** → choose this repo, branch `singpass-2-k-deploy`.
2. Fill `MYINFO_ENCRYPTION_KEY` (`openssl rand -hex 32`). Email is optional (see below). `PUBLIC_BASE_URL` is not
   needed: the app falls back to Render's `RENDER_EXTERNAL_URL`.
3. Deploy, then open `https://<service>.onrender.com` (and `/demo` for Demo Control).

Free-plan limits: the service sleeps after 15 idle minutes (first request takes ~1 min, so open it before a demo),
`data/` resets on every restart/deploy (use Demo Control to create sample applications), and outbound SMTP on ports
25/465/587 is blocked. For real email use a relay on port 2525 (e.g. Brevo: `SMTP_HOST=smtp-relay.brevo.com`,
`SMTP_PORT=2525`), or leave `SMTP_HOST` empty and open links from Demo Control → Outbox / the QR codes.

## 5. Demo scripts

Before each script: Demo Control → **Reset all data** → **Create sample applications**. Keep two laptop windows: the
dealer (Alex Tan) and Ops (Priya Nair, private window). "Phone" = a real phone, or a narrow browser window opening the
link from Demo Control → Outbox. Personas on the simulated Singpass login: `F4440488P` HENG SHI ZHENG (hirer of "Fill
sample"), `G4440425M` RAJESH KUMAR (its guarantor) and 7 others.

**Demo buttons (D-50).** A "Demo: see …" button always opens the application you are looking at, in the other role:
"Demo: see the Ops view" on the dealer's Application Status signs this browser in as Ops (Priya Nair) and opens the
same application; "Demo: see the dealer's view" on the Ops details (and on the customer's Done page) signs in as Alex
Tan and opens it as the dealer (shown only for Demo Motors applications); "Demo: see what the hirer gets" on Interest
Received opens this application's hirer link in a new tab. To jump to a sample in a given state, use **Demo Control →
Open a sample**: each button names the state and the ref, e.g. "Open sample: IPA issued, guarantor pending
(VMAF-2026-05117)".

### 5.1 Happy path (~3 min)

| Do | See | Say |
| --- | --- | --- |
| Dealer: Quick Apply → **Fill sample** → type the phone's email for hirer and guarantor → Next → tick the three boxes (Dealer Declaration, applicant declarations, Dealer's Attestation) → **Send Singpass Request** | "Interest Received", one link per person, expiry in 72 h | "Each person gets their own link, valid 72 hours; only one link per person is active." |
| Dealer: **View Application Status** | tracker, both chips "Pending" | "The dealer can now leave this screen open." |
| Phone: open the hirer's email (or Outbox link) → **Continue to Singpass** | AutoFinance first checks the link, then the grey "SIMULATED GATEWAY" pages | "The link opens our portal first: an old or expired link stops here." |
| Phone: **Retrieve Myinfo with Singpass** → pick **HENG SHI ZHENG** → **I agree** → review tabs → **Submit Application** | "Details shared"; no redirect back | "Like the real ValueMax gateway, it does not send the customer back." |
| Watch the dealer screen | Hirer chip turns **Fulfilled** within ~2 s, no refresh | "There is no webhook: AutoFinance polls the gateway every 2 seconds, checks the NRIC, stores the data encrypted, and pushes the change to the screens." |
| Phone: guarantor link → **RAJESH KUMAR** → I agree → Submit | Guarantor **Fulfilled** | |
| Ops: All Applications → View → Change Status → **Issue AA** → Apply | "Ready to issue AA", then "Approved — AA"; the dealer tracker's last step becomes "Approved — AA" | "The AA is locked on the server until everyone is Fulfilled." |

### 5.2 IPA before AA

| Do | See | Say |
| --- | --- | --- |
| Submit an application (as in 5.1), nobody verifies yet. Ops → View → **Issue IPA** → Apply | "Approved — IPA" | "An IPA can be issued any time after submission." |
| Ops: choose **Issue AA** | red box "Cannot issue AA yet ✗ Hirer Singpass pending ✗ Guarantor …", Apply disabled | "The reason comes from the server's own check; an AA attempt that bypasses the screen is refused and audited." |
| Verify both people (5.1) | the box turns "Ready to issue AA" by itself → Apply | |

### 5.3 Wrong person (NRIC mismatch)

| Do | See | Say |
| --- | --- | --- |
| Submit; on the phone, for the hirer, log in as **WANG XIAO LING** (not HENG) → I agree → Submit | Phone: "Details shared". Dealer: "NRIC mismatch — Ops is following up". Ops: red "NRIC mismatch · logged in as F****489M" | "The data came from someone else's Singpass: it is not attached, only the returned NRIC is kept for Ops, masked. The dealer never sees it." |
| Ops: **Show** next to the NRIC; Activity log | full NRIC; "Priya Nair viewed the full NRIC…" | "Viewing a full NRIC is recorded." |
| Ops: **Correct NRIC / email** (reason) or **Resend Email** (reason) | new link, person back to Pending | "A correction issues a new link; the old one stops working." |

### 5.4 Old link (blocked at the portal, data on the old LinkId rejected)

| Do | See | Say |
| --- | --- | --- |
| Submit. Phone: open the hirer link → **Continue to Singpass** → leave this tab open on the gateway page | gateway landing page | |
| Ops: **Resend Email (Hirer)** with a reason | new email in Outbox | "Resend replaces the link: one active link per person." |
| Phone, new tab: open the **first** email's link again | "This link is no longer valid" | "The portal stops an old link before it reaches Singpass." |
| Phone, the gateway tab left open: Retrieve → HENG → I agree → Submit | "Details shared" (the real gateway cannot cancel a link) | |
| Ops: Activity | "Result rejected: the customer used an old link (returned NRIC F****488P, matches)"; hirer still Pending | "Data that arrives on an old link is never attached; the new link is still the one that counts." |

### 5.5 Expired link and resend from the expired list

| Do | See | Say |
| --- | --- | --- |
| Submit. Demo Control → **+73 h (expire links)** | "Demo time: +73 h" bar; within ~2 s both people **Expired** | "After 72 hours without a result, the link expires." |
| Phone: open the link | "This link is no longer valid" | |
| Ops: All Applications → **Expired links (2)** → **Resend link** (reason) | new link in Outbox; the person leaves the list | "Ops (or the dealer who submitted) can resend, with a reason, at most 3 times in 24 hours." |
| Demo Control → **Back to real time** | the bar disappears | |

### 5.6 Gateway outage and recovery without duplicates

| Do | See | Say |
| --- | --- | --- |
| Demo Control → **Switch gateway off** | gateway "unavailable" | |
| Dealer submits | "Interest Received" with "queued — sent automatically once the Singpass gateway is reachable"; Ops: "Queued"; no email in Outbox | "The application is never lost: the link request is queued." |
| Demo Control → **Switch gateway on** | within ~2 s each person gets exactly one email + one SMS notice; expiry counts from now | "The job retries; it is safe to run twice or in parallel and never sends a link twice." |

### 5.7 Customer declines consent

| Do | See | Say |
| --- | --- | --- |
| Phone: open a link → Retrieve → persona → **Cancel** | "You cancelled" | |
| Dealer / Ops | still **Pending**, nothing changes | "The real gateway does not tell us about a refusal, so AutoFinance cannot tell it from 'not done yet'." |
| Demo Control → Gateway log | "declined" recorded on the gateway side | "The link stays valid until it expires; the customer can open it again and agree." |

## 6. What is simulated

- **The ValueMax Myinfo gateway and Singpass** (`server/gateway/simulated.ts`, pages under `/gateway/<LinkId>`):
  GetToken, GetLinkId and person/autofin/{LinkId} behaviour, Singpass login with the 9 staging test personas (no
  passwords), consent, review. Myinfo data of the personas is synthetic (`server/personas.ts`). Every page carries
  "SIMULATED GATEWAY · DEMO ONLY".
- **SMS**: outbox only. **Email**: real only when SMTP is configured.
- **Users**: two sample users and a role switch, no passwords (D-08). **IPA / AA**: only the stage changes; no notice
  contents, no IPA amendment (D-48). **LTA**: the access code is captured only; no LTA or OneMotoring lookup (D-51).
- **Clock**: Demo Control can move it forward (D-42). **Data**: one JSON file (D-37).

## 7. Connecting the real ValueMax gateway

AutoFinance reaches the gateway only through `GatewayAdapter` (`server/gateway/adapter.ts`: `issueLink`,
`fetchPerson`, `GatewayUnavailable`). The real one goes in `server/gateway/valuemax.ts` (`ValueMaxGatewayAdapter`, a stub
with TODOs; it is never called today). Open items before it can be written:

| Item | Needed from ValueMax | Status |
| --- | --- | --- |
| **B1.1** API specification of GetToken, GetLinkId, person/autofin/{LinkId} (request / response fields, "not ready yet" response, errors, token lifetime) | spec | pending |
| **B2.2** staging credentials (client id / secret) for AutoFinance | credentials | pending |
| **B1.9** IP whitelist of the AutoFinance servers on the gateway | whitelisting | pending |
| Staging **person** API (`myinfo-api-stg.valuemax.com.sg/person/autofin/{LinkId}`) | fix | currently fails with a port 60201 error |

Then: implement the two adapter methods (map outages and timeouts to `GatewayUnavailable`, "no consent yet" to
`NOT_READY`, the payload to `MyinfoPerson` with at least `uinfin`); add its settings to `.env.example` (endpoints,
credentials — secrets only from the environment); construct it instead of `MockGatewayAdapter` in
`server/runtime.ts`; run `npm test` (the SC-xx tests run against the adapter interface). Reference endpoints:
`myinfo-stg.valuemax.com.sg/Utilities/AutoFin/GetToken`, `/GetLinkId`, `myinfo-api-stg.valuemax.com.sg/person/autofin/{LinkId}`.

## 8. Structure

```
server/index.ts              entry point: environment → runtime
server/runtime.ts            HTTP API, SSE (/api/events), auto-verify job timer, Demo Control, static files
server/verification/         service.ts (links, job, Retrieve MyInfo, resend, corrections, IPA / AA, demo shortcuts),
                             approval.ts (AA conditions), model.ts, db.ts (JSON file), users.ts
server/gateway/              adapter.ts, simulated.ts (simulated gateway + MockGatewayAdapter), valuemax.ts (stub)
server/views.ts, activity.ts what dealer / Ops screens receive; the activity log sentences
server/nric.ts, crypto.ts    NRIC / FIN checks and masking; AES-256-GCM
server/mail.ts               email template + SMTP sender
public/                      frontend (vanilla JS SPA): dealer, Ops, portal /verify/<token>, gateway /gateway/<LinkId>,
                             Demo Control
tests/                       SC-xx scenario tests (service + HTTP), validation, startup; tests/e2e (Playwright)
scripts/                     setup.ts (.env with a new key), screenshots.ts
```
