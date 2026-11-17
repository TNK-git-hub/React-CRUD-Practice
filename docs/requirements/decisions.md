# Decisions for the demo (2026-11-17)

Answers to the open questions raised by `/spec-bootstrap`. The user delegated these decisions ("decide them
yourself"); they are demo choices, not answers from ValueMax, and can be changed through a later change.
"Brief" = `docs/requirements/singpass-demo-brief.md`.

| ID | Question | Decision |
| --- | --- | --- |
| D-01 | Realtime limit to assert in tests (NFR-001 "about 1 second") | Target about 1 second; automated tests assert ≤ 2 seconds from the customer's "Submit Application" to the event reaching a connected dealer / Ops client |
| D-02 | Demo Control reset: delete type | Hard delete of applications, parties, verification links and Myinfo records; nothing is kept and nothing can be restored. The sample dealers, users and test personas are not deleted (they are re-created if missing) |
| D-03 | Encryption of Myinfo data (NFR-012) | AES-256-GCM; the key comes from the backend environment variable `MYINFO_ENCRYPTION_KEY` (never committed); the backend refuses to start without it |
| D-04 | May a dealer user resend the Singpass email? | No. Only Ops ("Resend Email" exists only on the Ops Application Details design) |
| D-05 | Who may use Demo Control? | Any signed-in user (dealer user or Ops); the backend refuses Demo Control calls without a signed-in session. Customers (link holders) cannot |
| D-06 | Time zone | Times are stored in UTC and shown in Singapore time (Asia/Singapore, UTC+8) in the design's format `DD-MM-YYYY HH:mm` |
| D-07 | Measurable "smooth, stable" demo (NFR-030) | No extra number: the 5-minute demo script of the README runs end to end after a reset without an error |
| D-08 | Sign-in method and session | Role switch without a password: the sign-in page offers "Alex Tan — Demo Motors Pte Ltd" (dealer) and "Priya Nair — VMAF Ops" (Ops); the session is a server-side session cookie that lasts until sign-out or the browser is closed |
| D-09 | Dealer sees only own dealer's applications | Yes (prototype fig. 5.1). A second sample dealer, "Sample Auto Pte Ltd", exists only to own sample applications for the Ops list |
| D-10 | "Mandatory documents accepted" and "FI Review completed" in "Cannot issue AA yet" | Not shown: documents and FI Review are out of scope; the box lists only the Singpass condition of each party |
| D-11 | Can the AA be issued without an IPA? | Yes; the only AA condition is that every party is Fulfilled |
| D-12 | Accepted NRIC/FIN prefixes | S, T (NRIC), F, G (FIN), M (FIN from 2022), each with its official checksum letter; input is trimmed and upper-cased before validation |
| D-13 | Mobile number | Exactly 8 digits, starting with 8 or 9; stored only (no SMS, no WhatsApp) |
| D-14 | When does "Credit Review" change on the tracker? | Derived, no Ops action: it becomes current when every party is Fulfilled and no IPA / AA is issued yet; it is shown done once an IPA or an AA is issued |
| D-15 | Is "Pending Singpass Verification" a state of its own? | No: it is derived — current while any party is not Fulfilled, done when every party is Fulfilled |
| D-16 | Retry after "NRIC mismatch" or "Declined" on the same link | No: the link is used up; the customer needs a new link from Ops ("Resend Email") |
| D-17 | Reopening a Fulfilled link | Shows "This link is no longer valid" like every used, expired or superseded link |
| D-18 | Resend after Fulfilled | Not allowed: the button is disabled and the server refuses it |
| D-19 | Resend of an expired link | Allowed; the old link stays "Expired" (only a pending link becomes "Superseded") |
| D-20 | Expiry of a used link (mismatch / declined / fulfilled) | No change: a link that already has an outcome keeps it after 72 hours |
| D-21 | NRIC comparison | Case-insensitive, after trimming spaces on both sides |
| D-22 | Data of an "NRIC mismatch" result | Only the returned `uinfin` is kept (shown red to Ops next to the dealer-entered NRIC); the rest of the Myinfo data is discarded |
| D-23 | Customer submits through a link that was superseded or expired after they opened it | The result is rejected and not attached; the phone shows "This link is no longer valid"; Ops see the rejection note |
| D-24 | When is the gateway `LinkId` created? | When the customer taps "Retrieve Myinfo with Singpass": the backend calls `GetToken` then `GetLinkId` (brief §4 diagram) and stores the LinkId on the verification link |
| D-25 | Ops list status labels vs the dealer tracker | Same lifecycle, other labels: "Pending" (submitted, Singpass not complete), "Credit Review" (every party Fulfilled, nothing issued), "Approved — IPA", "Approved — AA". "Declined" appears only on sample data (Decline is out of scope) |
| D-26 | Application Ref numbering | `VMAF-<YYYY>-<NNNNN>`: year of submission and a 5-digit running number, next = max(highest existing, `05120`) + 1, so the first is `05121` and sample refs below it never lower the number |
| D-27 | LTA Access Code | Required, trimmed, non-empty; no format check (no LTA lookup in the demo) |
| D-28 | Same NRIC / email for hirer and guarantor | The guarantor's NRIC must differ from the hirer's; the same email is allowed (handy for a live demo with one phone) |
| D-29 | Sample applications of Demo Control | "Create sample applications" adds the rows of the Ops list design (`VMAF-2026-05114` to `VMAF-2026-05119`) with their dealers, parties and statuses; it skips a reference that already exists |
| D-30 | Channel: email vs Singpass app | Email (brief §11) |
| D-31 | Customer review screen before Submit | Shown by default; turned off with the backend setting `MYINFO_SHOW_REVIEW=false` (then "I Agree" submits directly) |
| D-32 | Real gateway spec | Still waiting for ValueMax (B1.1); the demo uses the mock behind an adapter |
