# Business rules: applications

"Brief" = `docs/requirements/singpass-demo-brief.md`.

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-APPL-01 | The hirer's (and the guarantor's) NRIC/FIN MUST be a valid Singapore NRIC/FIN including its checksum letter; the email MUST be a valid email address; the phone number MUST be an 8-digit Singapore mobile number. Accepted prefixes: S, T, F, G, M with their official checksum; input is trimmed and upper-cased; the mobile number starts with 8 or 9 (decisions D-12, D-13). Validation is shown as the dealer types ("✓ Valid NRIC / FIN", "✓ Looks good", "✓ Valid Singapore mobile number") | brief §3.1; design `Main` |
| BR-APPL-02 | "Send Singpass Request" is enabled only when both confirmation checkboxes of Review & Submit are ticked | brief §3.2; design `Dealer_Submit` |
| BR-APPL-03 | Ops can issue the IPA while the Singpass status of a party is still Pending | brief §3.11, §5 (Prototype Walkthrough §5.3) |
| BR-APPL-04 | Ops can issue the AA only when every party of the application (the hirer, and the guarantor if there is one) is Fulfilled; the server refuses it otherwise, and the "Cannot issue AA yet" box lists the unmet conditions | brief §3.11, §5 (Prototype Walkthrough §5.6), §10; decisions D-10, D-11 (only the Singpass conditions are listed; no IPA needed first) |
| BR-APPL-05 | The guarantor is optional ("Add Guarantor Info"); when present, the hirer and the guarantor verify independently of each other | brief §3.1, §10 |
| BR-APPL-06 | The guarantor's NRIC must differ from the hirer's; the same email is allowed | decisions D-28 |
| BR-APPL-07 | The LTA Access Code is required (trimmed, non-empty); no format check | decisions D-27 |
| BR-APPL-08 | The Application Ref is `VMAF-<YYYY>-<NNNNN>`: year of submission, next running number = highest existing + 1, first `05121` | decisions D-26 |

## Decision tables

### BR-APPL-04: Issue AA

| Hirer Fulfilled | Has guarantor | Guarantor Fulfilled | Result |
| --- | --- | --- | --- |
| yes | no | — | AA can be issued |
| yes | yes | yes | AA can be issued |
| yes | yes | no | refused; "Cannot issue AA yet" lists the guarantor's Singpass |
| no | no | — | refused; lists the hirer's Singpass |
| no | yes | yes | refused; lists the hirer's Singpass |
| no | yes | no | refused; lists both parties' Singpass |

"Not Fulfilled" covers every other Singpass status: Pending, Expired, Superseded, NRIC mismatch, Declined.

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
