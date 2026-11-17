# Glossary — ValueMax Dealer Portal (Singpass Myinfo demo)

"Brief" in the Source column = `docs/requirements/singpass-demo-brief.md`; "design" = `docs/claude-code-demo/design/`.

| Term | Definition | In code | Do not use | Source |
| --- | --- | --- | --- | --- |
| Application | A hire-purchase loan application keyed in by a dealer through Quick Apply, with one hirer and an optional guarantor | `application` | case, loan, request | brief §3 A |
| Application Ref | Human-readable reference of an application, e.g. `VMAF-2026-05121` | `applicationRef` | application number, case id | brief §3.3; design `Dealer_Received` |
| Quick Apply | The dealer flow that captures an application: Application Details → Review & Submit → Interest Received | `quickApply` | new application wizard | brief §3.1–3.3 |
| Dealer | The car dealer company that submits applications (e.g. Demo Motors Pte Ltd) | `dealer` | merchant, partner | brief §1, §6 |
| Dealer user | A person working for a dealer who uses the Dealer Portal (e.g. Alex Tan) | `dealerUser` | salesman, agent | brief §6 |
| Ops | ValueMax AutoFinance operations staff who review applications from every dealer (e.g. Priya Nair in the design) | `ops` | admin, back office user | brief §3.10–3.11 |
| Hirer | The borrower of the hire-purchase loan; shown as "Applicant" on the Quick Apply form | `hirer` | borrower, customer (in code) | brief §1, §3.1 |
| Guarantor | Optional person who guarantees the loan; added with "Add Guarantor Info" | `guarantor` | co-borrower, surety | brief §1, §3.1 |
| Party | The hirer or the guarantor of an application; each party has its own Singpass verification | `party` (`role`: `hirer` \| `guarantor`) | person, applicant (in code) | brief §5 |
| Customer | A party acting on their own phone (email, link check, simulated Singpass, consent) | — (UI wording only) | user | brief §3 B |
| NRIC / FIN | Singapore identity number of a citizen / PR (NRIC) or foreigner (FIN): prefix letter, 7 digits, checksum letter | `nric` | IC, ID number | brief §3.1, §6 |
| LTA Access Code | Code the dealer enters on Quick Apply; captured as a field only in this demo | `ltaAccessCode` | LTA code | brief §3.1, §12 |
| Singpass request | Sending a party their verification link by email, triggered by "Send Singpass Request" or "Resend Email" | `singpassRequest` | Singpass Verify | brief §3.2, §5 |
| Verification link | One-time URL `/v/{token}` emailed to a party; valid 72 hours; one active link per party | `verificationLink` | invite, magic link | brief §4, §5 |
| Link token | Opaque value in the verification link URL that identifies the link | `token` | link id | brief §4 |
| Singpass status | Status of a party's verification: `Pending`, `Fulfilled`, `Expired`, `Superseded`, `NRIC mismatch`, `Declined` | `singpassStatus` | verification state | brief §5 |
| Fulfilled | The party logged in with the NRIC the dealer entered and submitted their Myinfo data | `fulfilled` | verified, done | brief §1, §5 |
| Superseded | A link replaced by a newer link of the same party (after Resend) | `superseded` | replaced, revoked | brief §5 |
| NRIC mismatch | The NRIC (`uinfin`) returned by Myinfo differs from the NRIC the dealer entered | `nricMismatch` | — | brief §5 |
| Declined | The customer pressed "Cancel" on the consent screen | `declined` | rejected | brief §5 |
| Trigger Date | When the current link of a party was sent | `triggeredAt` | sent date | design `Ops_Detail` |
| Fulfilled Date | When the party became Fulfilled | `fulfilledAt` | — | design `Ops_Detail` |
| Myinfo | Singpass service that shares government-verified personal data with consent; the product used here is Myinfo via Singpass login, not Singpass Verify | `myinfo` | Singpass Verify | brief §5 |
| Myinfo record | The data returned for a party after consent (`uinfin`, name, date of birth, address, employment, CPF, NOA, housing) | `myinfoRecord` | profile | brief §3.8, §6 |
| `uinfin` | Field of the Myinfo data holding the NRIC / FIN of the person who logged in | `uinfin` | — | brief §5 |
| Mock gateway | Module simulating the 3 ValueMax gateway APIs `GetToken`, `GetLinkId`, `person/autofin/{LinkId}`, behind an adapter interface | `myinfoGateway` | Singpass API | brief §4 |
| LinkId | Identifier returned by the gateway's `GetLinkId` (called when the customer taps "Retrieve Myinfo with Singpass") and used by `person/autofin/{LinkId}`; one per verification link | `linkId` | token | brief §4; decisions D-24 |
| Test persona | A Singpass staging test identity (NRIC) with fake Myinfo data, used on the simulated login | `testPersona` | test user | brief §6 |
| Simulated Singpass | The demo's imitation of the Singpass login and Myinfo consent screens, always marked "SIMULATED · DEMO ONLY" | `simulatedSingpass` | Singpass (alone) | brief §3.6, §8 |
| Interest Received | Screen shown to the dealer after "Send Singpass Request", with the Application Ref and link expiry per party | — | confirmation page | brief §3.3 |
| Application stage | Step of the dealer's tracker: "Application Submitted → Pending Singpass Verification → Credit Review → IPA Issued → AA"; the Ops list shows the same lifecycle as "Pending", "Credit Review", "Approved — IPA", "Approved — AA" | `stage` | status (alone) | brief §3.9; decisions D-14, D-15, D-25 |
| IPA | In-Principle Approval; can be issued while Singpass is still Pending | `ipa` | pre-approval | brief §3.11, §5 |
| AA | Approval Advice (final approval); only when every party is Fulfilled | `aa` | final approval (in code) | brief §3.11, §5 |
| Demo Control | Hidden page (e.g. `/demo`) to reset data, create sample applications and force a link to expire | `demoControl` | admin page | brief §3 |
| Public base URL | Base URL put into verification links so a real phone can open them (`PUBLIC_BASE_URL`) | `PUBLIC_BASE_URL` | host | brief §4 |

## Roles

| Role | Description | In code |
| --- | --- | --- |
| Dealer user | Keys in applications with Quick Apply and follows their status | `dealer` |
| Ops | Reviews applications from every dealer, resends Singpass emails, issues IPA and AA | `ops` |
| Customer (link holder) | Hirer or guarantor; not logged in to the portal, acts only through their verification link | `party` (via `token`) |
| Presenter | Person running the live demo who uses Demo Control; not a separate role: any signed-in dealer user or Ops (decisions D-05) | — |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
