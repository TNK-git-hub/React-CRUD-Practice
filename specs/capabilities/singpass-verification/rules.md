# Business rules: singpass-verification

"Brief" = `docs/requirements/singpass-demo-brief.md`.

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-SPV-01 | Submitting an application automatically sends the Singpass "Retrieve MyInfo" link; the hirer and the guarantor each receive their own link by email | brief §5 (AutoFinance_High level requirement.docx) |
| BR-SPV-02 | The product is Myinfo via Singpass login, not Singpass Verify | brief §5 (QnA B1.3) |
| BR-SPV-03 | A verification link expires 72 hours after it was sent | brief §5 (QnA A3.3, B1.5; Proposal v2 §5.4) |
| BR-SPV-04 | Resend creates a new link and invalidates the old one (it becomes Superseded): each party has exactly one active link | brief §5 (QnA A3.3, B1.5) |
| BR-SPV-05 | Only the NRIC is compared, case-insensitive after trimming (D-21): the Myinfo `uinfin` against the NRIC the dealer entered; on a mismatch only `uinfin` is kept and the rest is discarded (D-22); a mismatch sets the party to "NRIC mismatch", is flagged red for Ops, and never sets Fulfilled | brief §5 (QnA B1.4); decisions D-21, D-22 |
| BR-SPV-06 | The Myinfo data other than the NRIC comparison is stored encrypted (AES-256-GCM, key `MYINFO_ENCRYPTION_KEY`) | brief §5 (QnA B1.4); decisions D-03 |
| BR-SPV-07 | After consent the customer is not redirected back to the portal; "Details shared" ends the customer's journey | brief §3.8, §5 (QnA B1.7) |
| BR-SPV-08 | The only channel is email (SMS to notify that the email was sent is a later phase) | brief §5 (QnA A3.5) |
| BR-SPV-09 | The email is generic and has no signatory | brief §5 (QnA A3.6) |
| BR-SPV-10 | A customer who presses "Cancel" on the consent screen sets the party to "Declined" | brief §5 |
| BR-SPV-11 | The system never calls the real Singpass and never stores or uses real staging passwords | brief §6 |
| BR-SPV-12 | Every simulated Singpass screen shows the "SIMULATED · DEMO ONLY" strip at the top | brief §8; design `Customer_Singpass` |
| BR-SPV-13 | Opening a link that is expired, not the party's latest link, or already used (Fulfilled, NRIC mismatch, Declined) stops at "This link is no longer valid"; a valid link shows "Retrieve Myinfo with Singpass" | brief §3.5; design `Customer_LinkCheck`; decisions D-16, D-17 |
| BR-SPV-14 | A Myinfo result that arrives through a superseded or expired link is rejected, not attached to the party; the phone shows "This link is no longer valid" and the rejection is shown to Ops | design `Ops_Detail` ("Rejected …: a MyInfo result for the hirer came from an old link … and was not attached."); decisions D-23 |
| BR-SPV-15 | Resend is refused once the party is Fulfilled; resending makes a pending link Superseded, while an expired or used link keeps its status | decisions D-18, D-19 |
| BR-SPV-16 | A link that already has an outcome (Fulfilled, NRIC mismatch, Declined) keeps it after 72 hours | decisions D-20 |
| BR-SPV-17 | The gateway LinkId is obtained (`GetToken`, then `GetLinkId`) when the customer taps "Retrieve Myinfo with Singpass" | brief §4; decisions D-24 |
| BR-SPV-18 | The customer review screen is shown before "Submit Application" by default; with `MYINFO_SHOW_REVIEW=false`, "I Agree" submits directly | brief §11; decisions D-31 |

## Decision tables

### BR-SPV-13: Link check

| Link expired | Link is the party's latest | Result |
| --- | --- | --- |
| no | yes | valid: "Retrieve Myinfo with Singpass" |
| no | no | "This link is no longer valid" (Superseded) |
| yes | yes | "This link is no longer valid" (Expired) |
| yes | no | "This link is no longer valid" |

### BR-SPV-05 / BR-SPV-10: Customer outcome on a valid link

| Customer pressed | `uinfin` equals the dealer-entered NRIC | Result |
| --- | --- | --- |
| "I Agree" then "Submit Application" | yes | party Fulfilled, Fulfilled Date set, data stored encrypted |
| "I Agree" then "Submit Application" | no | party "NRIC mismatch", flagged red for Ops, not Fulfilled |
| "Cancel" | — | party "Declined" |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
