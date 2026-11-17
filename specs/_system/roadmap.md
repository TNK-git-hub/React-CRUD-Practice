# Change roadmap — ValueMax Dealer Portal (Singpass Myinfo demo)

"Brief" = `docs/requirements/singpass-demo-brief.md`. The repo already has an empty pnpm skeleton (Next.js 16 frontend,
NestJS backend, Vitest, CI via `pnpm ci:local`); change 001 adds the first end-to-end flow on top of it.

| Change | Goal (what the user sees) | Features | Source | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001-dealer-quick-apply | Walking skeleton: the dealer signs in, keys in a hirer (NRIC/FIN, email, mobile validated) and LTA Access Code, ticks both confirmations, presses "Send Singpass Request" and sees Interest Received with the Application Ref and the hirer's link expiry (72 h); the application and one active link are stored | access/sign-in, applications/quick-apply, singpass-verification/verification-links | REQ-01, REQ-02, REQ-03, REQ-17, BR-APPL-01, BR-APPL-02, BR-SPV-01, BR-SPV-03, BR-AUTH-03, BR-APPL-07, BR-APPL-08 | — | planned |
| 002-singpass-email-link-check | The hirer receives a real email with "Verify with Singpass" (SMTP or Mailpit, link in the log, QR fallback on Interest Received), opens it on their phone through `PUBLIC_BASE_URL`, and sees either "Retrieve Myinfo with Singpass" or "This link is no longer valid" | singpass-verification/verification-links, applications/quick-apply | REQ-04, REQ-05, REQ-14, BR-SPV-08, BR-SPV-09, BR-SPV-13 | 001 | planned |
| 003-simulated-myinfo-consent | On the phone the hirer logs in on the simulated Singpass with a test persona, sees the consent list, presses "I Agree" or "Cancel", reviews the Myinfo tabs, presses "Submit Application" and sees "Details shared"; the hirer becomes Fulfilled, NRIC mismatch or Declined | singpass-verification/myinfo-consent | REQ-06, REQ-07, REQ-08, REQ-15, REQ-16, REQ-18, BR-SPV-02, BR-SPV-05, BR-SPV-06, BR-SPV-07, BR-SPV-10, BR-SPV-11, BR-SPV-12, BR-SPV-16, BR-SPV-17, BR-SPV-18 | 002 | planned |
| 004-dealer-status-realtime | The dealer's Application Status screen shows the tracker and the hirer's Singpass status, which turns Fulfilled by itself within about 1 second of the customer's Submit | applications/application-tracking | REQ-09, REQ-13, BR-AUTH-01 | 003 | planned |
| 005-guarantor | The dealer adds a guarantor; hirer and guarantor each get their own link and email and verify independently; Interest Received and the status screen show both | applications/quick-apply, applications/application-tracking, singpass-verification/verification-links | REQ-01 (guarantor part), BR-APPL-05, BR-APPL-06 | 004 | planned |
| 006-ops-review | Ops sign in and see All Applications from every dealer with per-party Singpass columns, and the Application Details with the Singpass Status block, "NRIC matched" mark and dealer-entered vs Myinfo comparison, updating in realtime | access/sign-in, applications/ops-review | REQ-10, REQ-11 (view part), BR-AUTH-02 | 005 | planned |
| 007-ops-resend-and-approvals | Ops resend a party's email (old link becomes Superseded, a result from it is rejected), issue the IPA while Singpass is Pending, and can issue the AA only when every party is Fulfilled ("Cannot issue AA yet" lists what is missing) | applications/ops-review, singpass-verification/verification-links | REQ-11 (actions part), BR-SPV-04, BR-SPV-14, BR-SPV-15, BR-APPL-03, BR-APPL-04 | 006 | planned |
| 008-demo-control | The presenter opens the hidden Demo Control page to reset the data, create sample applications and force a link to expire; the README gives install, `.env`, phone access and the 5-minute demo script | demo/demo-control | REQ-12, REQ-19, BR-DEMO-01, BR-DEMO-02, BR-DEMO-03, BR-DEMO-04, BR-DEMO-05 | 007 | planned |

## Ordering notes

- 001–004 are the vertical slice the brief asks for first: the whole hirer flow from screen 1 to screen 9 (brief §9).
  The guarantor (005), Ops (006, 007) and error-case tooling (008) follow, in the brief's order.
- 002 comes before 003 because the customer can only reach the simulated Singpass through a valid link.
- Expired links are part of 002 (time-based); the Superseded case needs Resend, so it is completed in 007.
- The NRIC mismatch and Declined error cases are produced in 003; Ops' red flag for a mismatch is shown in 006.
- Each change matches the design of the screens it builds (NFR-041), so there is no separate "UI polish" change.

## Open questions

_(none: answered in `docs/requirements/decisions.md` — D-30 email, D-31 review screen on by default, D-32 mock gateway)_
