# Task brief: "Dealer Portal – Singpass Myinfo Auto Verify" demo for ValueMax

> English translation of `docs/claude-code-demo/TASK_BRIEF.md` (original in Vietnamese). Paths to the reference
> material are relative to `docs/claude-code-demo/`. Where this repo's harness decided differently from the original
> brief (stack, delivery process), the decision is written in a **Harness note**.

## 1. Context

- CMC APAC is bidding for **ValueMax AutoFinance (Singapore)**: extending the AutoFinance system and renewing the
  **Dealer Portal**.
- Highlight of the demo: **auto verification with Singpass Myinfo**. The dealer keys in the customer's details and
  presses send; the system automatically sends a Singpass link to the borrower (**hirer**) and to the **guarantor**.
  The customer opens the link **on their own phone**, logs in with Singpass and presses **"I Agree"** to share their
  data. Only then does the status on the **dealer's computer** (and on the Ops screens) change to "Fulfilled", updating
  by itself without a page refresh (F5).
- Audience: **the ValueMax client**. The demo must run smoothly, look good and be stable when presented live.

## 2. Reference material

| Folder | Content | Used for |
|---|---|---|
| `design/` | 11 design screens (`.dc.html` files, HTML + inline style) and `canvas.json` (screen names and order). | **Primary source** for layout, colors, typography and status labels. Ignore the `<script src="./support.js">` line and the `<x-dc>`, `<helmet>` tags: they belong to the design tool's format. |
| `singpass-reference/` | 5 screenshots of the real Singpass Myinfo screens the client currently uses | Layout of the customer-side screens (steps 4 to 8 below) |
| `prototype-screens/` | 36 screenshots of ValueMax Prototype v54 + `README.txt` captioning each one | Field names, labels and detailed layout of the Dealer and Ops screens |

Main colors (from the design): dark-red header `#7A1C2E`, accent `#A3203A`, background `#F6F6F7`, gold `#D9A33A`,
success green `#1F8A5B`. Font: Inter.

## 3. Scope: 11 screens, in running order

**A. Dealer (desktop)**

1. **Quick Apply – Application Details** (`design/Main.dc.html`): enter the hirer (name, NRIC, email, mobile number);
   toggle "Add Guarantor Info" to enter a guarantor; LTA Access Code. Validate the Singapore NRIC/FIN format
   (including checksum), the email, and an 8-digit mobile number.
2. **Review & Submit** (`design/Dealer_Submit.dc.html`): summary of hirer / guarantor, 2 mandatory confirmation
   checkboxes; the **"Send Singpass Request"** button is enabled only when both are ticked.
3. **Interest Received** (`design/Dealer_Received.dc.html`): the application reference (e.g. `VMAF-2026-05121`) and the
   link expiry time of each person.

**B. Customer (phone, mobile-first)**

4. **Email** (`design/Customer_Email.dc.html`): a real email delivered to the customer's mailbox, with a
   "Verify with Singpass" button, stating the 72-hour validity.
5. **Link check** (`design/Customer_LinkCheck.dc.html`): the server checks that the link has not expired and is the
   latest link of that person. An expired link, or one replaced by a newer link, stops here with the message
   "This link is no longer valid". A valid link shows the **"Retrieve Myinfo with Singpass"** button (as in
   `singpass-reference/1_retrieve-myinfo-button.png`).
6. **Simulated Singpass login** (`design/Customer_Singpass.dc.html` + `singpass-reference/2_singpass-login.png`):
   a QR code (decorative only) and a "Use password" option. Pick a test persona or type a test NRIC to "log in".
7. **Consent screen** (`design/Customer_Consent.dc.html` + `singpass-reference/3_consent-list-top.png`,
   `singpass-reference/4_consent-list-bottom-i-agree.png`): list of the requested data items, **"Cancel"** and
   **"I Agree"** buttons.
8. **Review, then done** (`singpass-reference/5_review-and-submit.png`, then `design/Customer_Done.dc.html`): show the
   Myinfo data in tabs Personal / Employment & Education / Property, a **"Submit Application"** button, then the
   "Details shared" screen. No redirect back to the dealer portal.

**C. Results back on the application (desktop)**

9. **Dealer – Application Status** (`design/Dealer_Status.dc.html`): tracker
   "Application Submitted → Pending Singpass Verification → Credit Review → IPA Issued → AA". The Singpass status of
   each person (**Pending / Fulfilled**) updates in real time.
10. **Ops – All Applications** (`design/Ops_List.dc.html`): list of applications from every dealer, with Singpass
    columns for the hirer and the guarantor, in real time.
11. **Ops – Application Details & Issue AA** (`design/Ops_Detail.dc.html`): a "Singpass Status" block per person
    (Status, Trigger Date, Fulfilled Date, **"Resend Email"** button), an "NRIC matched" mark, a table comparing the data
    the dealer entered with the Myinfo data, and a **"Cannot issue AA yet"** box listing the unmet conditions.
    The "Issue IPA" button can be pressed while Singpass is still Pending. The "Issue AA" button is blocked
    **on the server** until every person is Fulfilled.

Plus a small hidden **Demo Control** page (e.g. `/demo`) to reset the data, create sample applications, and quickly
switch a link to the expired state to present the error cases.

## 4. Multi-device flow (the most important part)

```
Dealer (laptop)            Backend                      Customer (phone)
  Send Singpass Request ─▶ create application, create 1
                           active link per person, 72h
                           send email ─────────────────▶ open email, tap link
                           check link ◀──────────────── open /v/{token}
                           mock gateway: GetToken,
                           GetLinkId ─────────────────▶ simulated Singpass login
                                                         tap I Agree, Submit
                           person/autofin/{LinkId}
                           compare NRIC, store data,
  screen 9 turns Fulfilled ◀─ push realtime event
  Ops screens 10, 11 update ◀─┘
```

Requirements:

- **Realtime**: use WebSocket or Server-Sent Events. Dealer and Ops see the status change within about 1 second after
  the customer presses Submit, without reloading the page.
- **Real email**: sent through SMTP configured in `.env` (e.g. Gmail app password, SendGrid or Mailtrap). If SMTP is not
  configured, use Mailpit running locally and print the link to the log. Screen 3 also has a button that shows a
  **QR code of the link** as a fallback during the presentation.
- **Reachable from a phone**: the link in the email must open on a real phone. Support a `PUBLIC_BASE_URL` variable;
  work over the LAN and through a tunnel (cloudflared or ngrok). Document how to run it in the README.
- **ValueMax mock gateway**: a separate module simulating the 3 APIs ValueMax will provide: `GetToken`, `GetLinkId`,
  `person/autofin/{LinkId}`. The real spec does not exist yet (waiting for ValueMax, Q&A item B1.1), so design the
  interface so that replacing it with the real gateway later only means changing the adapter.

## 5. Business rules (checked against the project documents)

| Rule | Source |
|---|---|
| Submitting an application automatically triggers the Singpass "Retrieve MyInfo" link; the hirer and the guarantor each receive **their own link by email** | AutoFinance_High level requirement.docx |
| The product is **Myinfo via Singpass login**, not Singpass Verify | QnA Filled, B1.3 |
| A link expires after **72 hours**; resend creates a new link and invalidates the old one (1 active link per person) | QnA Filled, A3.3 and B1.5; Proposal v2 §5.4 |
| The returned data contains `uinfin`; the system compares only the **NRIC** to detect mismatches; the rest is stored encrypted | QnA Filled, B1.4 |
| The gateway does **not redirect** the customer back to the portal after consent | QnA Filled, B1.7 |
| Go-live channel is email only (SMS only to notify that it was sent, in a later phase) | QnA Filled, A3.5 |
| The email is generic and needs no signatory | QnA Filled, A3.6 |
| **IPA** can be issued while Singpass is still Pending; **AA** only when Singpass is Fulfilled | Prototype Walkthrough §5.3, §5.6 |

Singpass statuses of each person: `Pending`, `Fulfilled`, `Expired`, `Superseded` (replaced by a newer link),
`NRIC mismatch`, `Declined` (the customer pressed Cancel).

Error cases the demo must be able to show: expired link; old link after Resend; NRIC used to log in differs from the
NRIC the dealer entered (flagged red for Ops, does not turn Fulfilled); customer presses Cancel.

## 6. Sample data

- Test personas (NRICs taken from the staging persona list in QnA B2.2): `F4440488P`, `F4440489M`, `G4440425M`,
  `G4440427W`, `G4440430W`, `G4440431T`, `G4440432Q`, `G4440433N`, `M5004553J`. Create fake Myinfo data for each persona
  (name, date of birth, address, employer, CPF, NOA, housing) following the list of fields in
  `singpass-reference/3_consent-list-top.png` and `singpass-reference/4_consent-list-bottom-i-agree.png`. Example from
  screenshot 5: `F4440488P` = HENG SHI ZHENG.
- **Do not** call the real Singpass; **do not** store or use real staging passwords in the code.
- One sample dealer account (e.g. Demo Motors Pte Ltd, Alex Tan) and one Ops account. A simple login or a role-switch
  button is enough.

## 7. Technology

Not mandated by the brief. The brief suggested: one TypeScript repo, React + Vite + Tailwind frontend, Node backend
(Fastify or Express) + SQLite, realtime with Socket.IO or SSE, email with Nodemailer, a `docker-compose` (app + Mailpit)
and a one-shot run command (`npm run dev` or `docker compose up`).

> **Harness note:** the user decided to keep this repo's stack: pnpm monorepo, Next.js 16 (App Router) + React 19 +
> TanStack Query + Tailwind frontend, NestJS + TypeORM + PostgreSQL + Redis backend, Vitest. `docker-compose.yml`
> provides Postgres, Redis and Mailpit. Realtime (SSE or WebSocket) and email (e.g. Nodemailer) are chosen in the plan
> of the change that needs them.

## 8. Simulated Singpass screens: presentation note

Screens 6 to 8 follow the layout of the reference screenshots so the client finds them familiar, but they always show a
small **"SIMULATED · DEMO ONLY"** strip at the top of the page, as in `design/Customer_Singpass.dc.html`, so nobody
mistakes them for the real Singpass page.

## 9. Way of working and delivery

The original brief asked to: (1) read the brief, write `docs/PLAN.md` (architecture, data model, API, screen list) and
commit it before coding; (2) work in vertical slices: the whole hirer flow from screen 1 to 9 first, then the guarantor,
Ops, error cases, and finally polish the UI to match the design; (3) small commits on a separate branch and a Pull
Request into the main branch; (4) minimum tests for: NRIC validation, link expiry and replacement, NRIC comparison,
the AA lock; (5) a README with: installation, `.env` configuration (SMTP, `PUBLIC_BASE_URL`), how to let a phone reach
the app, a **step-by-step demo script** (about 5 minutes), and how to reset the data.

> **Harness note:** the user decided to follow this repo's harness instead of points (1) and (3): `spec.md` + `plan.md`
> of each change replace `docs/PLAN.md`; changes are branches `NNN-<name>` merged by PR into the base branch
> `singpass-demo`. Point (2) becomes the order of the roadmap (first change = the hirer flow, screens 1 to 9).
> Points (4) and (5) still apply.

## 10. Definition of done

- [ ] The dealer sends the request on the laptop; the phone receives a real email within 1 minute.
- [ ] The customer completes the flow on the phone; the dealer and Ops screens switch to Fulfilled by themselves within
      about 1 second.
- [ ] Hirer and guarantor run independently; AA only unlocks when both are Fulfilled.
- [ ] The 4 error cases of section 5 can be demonstrated.
- [ ] The 11 screens match the design in `design/`; the customer screens display well on a phone.
- [ ] Data can be reset from the Demo Control page.

## 11. Points not yet agreed with the client (do not decide; record them)

- [NEEDS CLARIFICATION: Prototype v54 says the request is sent to the **Singpass app**, while the High level
  requirement says a **link is sent by email**. The demo follows email.]
- [NEEDS CLARIFICATION: QnA B1.4 — ValueMax says only the NRIC is shown to check for mismatches, but reference
  screenshot 5 shows the customer all their data before Submit. The demo follows the screenshot, and this screen can be
  turned on/off by configuration.]
- [NEEDS CLARIFICATION: the real spec of the 3 gateway APIs is not available yet (B1.1).]

## 12. Out of scope

Prototype v54 (`prototype-screens/`) shows the whole future Dealer Portal. Only the 11 screens of section 3 and the
Demo Control page are in scope. The following are shown in the prototype but are **out of scope** for this demo; the
screenshots are used only for field names, labels and layout:

- **Home and role views**: the "All" development view (fig. 2.1). A simple login or role switch replaces the real
  Dealer / Ops home pages (fig. 2.2, 2.3).
- **Quick Apply beyond contact details**: product selection (fig. 3.1), the fields unlocked by the LTA Access Code
  (fig. 3.3), vehicle / price / deposit / loan amount / tenure / rate and the live instalment, trade-in and the
  MAS Notice 642 declaration (fig. 3.4), employment details (fig. 3.5), document upload slots (fig. 3.6), the Dealer /
  applicant / guarantor declarations (fig. 3.7). The LTA Access Code is captured as a field only; no LTA or OneMotoring
  lookup is made.
- **My Applications list for dealers** and resuming drafts (fig. 5.1); drafts in general.
- **IPA and AA contents**: indicative terms, instalment and effective-rate calculation, IPA / AA notices, print or save
  as PDF, preview with watermark, locking IPA figures and "Amend" (fig. 5.4, 5.5, 6/5.6, 5.7). In the demo, "Issue IPA"
  and "Issue AA" only change the application stage, subject to the Singpass rule of section 5.
- **Document handling**: requesting documents from the dealer and the dealer's response (fig. 5.6, 5.10), the
  documents list with on-file / missing status (fig. 5.9, 5.3, 5.8), OneMotoring PDF upload and reader (fig. 5.5).
- **Ops case actions other than IPA / AA / Resend Email**: the full edit page (fig. 5.4), Change Status with
  prerequisite checks, FI Review Completed, Decline (and the dealer's decline message, fig. 5.7), Lapse, Save
  (fig. 5.9), the activity log, Ops manual entry of applications received outside the portal (fig. 5.11), copy link,
  search and filters on the Ops list.
- **Read-only full application view for the dealer** (fig. 5.8).
- **System outputs**: `APPLICATION DETAILS.xlsx` workbook, the document requirement list, the output folder with
  renamed files, the prefilled Part B application form (fig. 6.1 to 6.4).
- **Credit review** itself: the "Credit Review" stage of the tracker is shown but no credit assessment is performed.
- **Real integrations**: the real Singpass / Myinfo, the real ValueMax gateway, SMS (later phase per QnA A3.5),
  the Singpass app channel.
- **Real user management and authentication** (the BRD screens for login and user management): one sample dealer
  account and one Ops account only.
