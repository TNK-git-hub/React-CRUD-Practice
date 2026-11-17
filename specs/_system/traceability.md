# Traceability — ValueMax Dealer Portal (Singpass Myinfo demo)

Source document: `docs/requirements/singpass-demo-brief.md` (the brief has no numbering; items are numbered REQ-01…
in order of appearance). Business rules are the `BR-<CODE>-NN` rows of `specs/capabilities/<domain>/rules.md`.

| Requirement item | Summary | Type | Owning change | Requirement ID |
| --- | --- | --- | --- | --- |
| REQ-01 / §3.1 | Quick Apply – Application Details: hirer name, NRIC, email, phone; "Add Guarantor Info"; LTA Access Code; NRIC/FIN checksum, email and 8-digit mobile validation | functional | 001-dealer-quick-apply (hirer); 005-guarantor (guarantor) | |
| REQ-02 / §3.2 | Review & Submit: hirer/guarantor summary, 2 mandatory confirmations, "Send Singpass Request" enabled only when both ticked | functional | 001-dealer-quick-apply | |
| REQ-03 / §3.3 | Interest Received: Application Ref (e.g. `VMAF-2026-05121`), link expiry time per person | functional | 001-dealer-quick-apply | |
| REQ-04 / §3.4, §4 | Real email with "Verify with Singpass" and the 72-hour validity; SMTP from `.env` or Mailpit with the link in the log; QR of the link on Interest Received | functional | 002-singpass-email-link-check | |
| REQ-05 / §3.5 | Link check: expired or replaced link → "This link is no longer valid"; valid link → "Retrieve Myinfo with Singpass" | functional | 002-singpass-email-link-check | |
| REQ-06 / §3.6 | Simulated Singpass login: decorative QR, "Use password", pick a test persona or type a test NRIC | functional | 003-simulated-myinfo-consent | |
| REQ-07 / §3.7 | Consent screen: requested data list, "Cancel" and "I Agree" | functional | 003-simulated-myinfo-consent | |
| REQ-08 / §3.8 | Review Myinfo data in tabs Personal / Employment & Education / Property, "Submit Application", then "Details shared"; no redirect | functional | 003-simulated-myinfo-consent | |
| REQ-09 / §3.9 | Dealer Application Status: tracker, per-person Pending / Fulfilled in realtime | functional | 004-dealer-status-realtime | |
| REQ-10 / §3.10 | Ops All Applications: every dealer, hirer and guarantor Singpass columns, realtime | functional | 006-ops-review | |
| REQ-11 / §3.11 | Ops Application Details: Singpass Status block (Status, Trigger Date, Fulfilled Date, "Resend Email"), "NRIC matched", comparison table, "Cannot issue AA yet", Issue IPA while Pending, Issue AA locked on the server | functional | 006-ops-review (view); 007-ops-resend-and-approvals (Resend, IPA, AA) | |
| REQ-12 / §3 | Hidden Demo Control page: reset data, create sample applications, force a link to expire | functional | 008-demo-control | |
| REQ-13 / §4 | Realtime by WebSocket or SSE; dealer and Ops see the change within about 1 second, no reload | functional | 004-dealer-status-realtime | |
| REQ-14 / §4 | Link opens on a real phone: `PUBLIC_BASE_URL`, LAN and tunnel | functional | 002-singpass-email-link-check | |
| REQ-15 / §4 | Mock gateway module (`GetToken`, `GetLinkId`, `person/autofin/{LinkId}`) behind an adapter | functional | 003-simulated-myinfo-consent | |
| REQ-16 / §6 | Test personas with fake Myinfo data (`F4440488P` = HENG SHI ZHENG, …) | functional | 003-simulated-myinfo-consent | |
| REQ-17 / §6 | One sample dealer account (Demo Motors Pte Ltd, Alex Tan) and one Ops account; simple login or role switch | functional | 001-dealer-quick-apply (dealer); 006-ops-review (Ops) | |
| REQ-18 / §8 | "SIMULATED · DEMO ONLY" strip on simulated Singpass screens | functional | 003-simulated-myinfo-consent | |
| REQ-19 / §9 | README: install, `.env` (SMTP, `PUBLIC_BASE_URL`), phone access, 5-minute demo script, data reset | functional | 008-demo-control | |
| §5 statuses | Singpass statuses `Pending`, `Fulfilled`, `Expired`, `Superseded`, `NRIC mismatch`, `Declined` | business rule | 001 (Pending), 002 (Expired), 003 (Fulfilled, NRIC mismatch, Declined), 007 (Superseded) | |
| §5 error cases | Demo-able error cases: expired link, old link after Resend, NRIC mismatch, Cancel | business rule | 002, 007, 003, 003 | |
| BR-APPL-01 | NRIC/FIN checksum, email, 8-digit mobile validation | business rule | 001-dealer-quick-apply | |
| BR-APPL-02 | "Send Singpass Request" only when both confirmations ticked | business rule | 001-dealer-quick-apply | |
| BR-APPL-03 | IPA can be issued while Singpass is Pending | business rule | 007-ops-resend-and-approvals | |
| BR-APPL-04 | AA only when every party is Fulfilled, enforced by the server | business rule | 007-ops-resend-and-approvals | |
| BR-APPL-05 | Guarantor optional; hirer and guarantor verify independently | business rule | 005-guarantor | |
| BR-APPL-06 | Guarantor NRIC differs from the hirer's; same email allowed | business rule | 005-guarantor | |
| BR-APPL-07 | LTA Access Code required, no format check | business rule | 001-dealer-quick-apply | |
| BR-APPL-08 | Application Ref `VMAF-<YYYY>-<NNNNN>` numbering | business rule | 001-dealer-quick-apply | |
| BR-SPV-01 | Submit sends each party their own link by email | business rule | 001-dealer-quick-apply (link created); 002-singpass-email-link-check (email) | |
| BR-SPV-02 | Myinfo via Singpass login, not Singpass Verify | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-03 | Link expires after 72 hours | business rule | 001-dealer-quick-apply (expiry stored and shown); 002-singpass-email-link-check (enforced) | |
| BR-SPV-04 | Resend creates a new link, old one Superseded; one active link per party | business rule | 007-ops-resend-and-approvals | |
| BR-SPV-05 | Only the NRIC is compared; mismatch → "NRIC mismatch", red for Ops, not Fulfilled | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-06 | Other Myinfo data stored encrypted | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-07 | No redirect back to the portal after consent | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-08 | Email is the only channel (SMS later) | business rule | 002-singpass-email-link-check | |
| BR-SPV-09 | Generic email, no signatory | business rule | 002-singpass-email-link-check | |
| BR-SPV-10 | "Cancel" → Declined | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-11 | Never call the real Singpass; no real staging passwords | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-12 | "SIMULATED · DEMO ONLY" strip | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-13 | Link check decision (expired / not latest → "This link is no longer valid") | business rule | 002-singpass-email-link-check | |
| BR-SPV-14 | Result from an old link rejected, not attached, shown to Ops | business rule | 007-ops-resend-and-approvals | |
| BR-SPV-15 | Resend refused once Fulfilled; only a pending link becomes Superseded | business rule | 007-ops-resend-and-approvals | |
| BR-SPV-16 | A used link keeps its outcome after 72 hours | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-17 | LinkId obtained (`GetToken`, `GetLinkId`) on "Retrieve Myinfo with Singpass" | business rule | 003-simulated-myinfo-consent | |
| BR-SPV-18 | Review screen on by default, `MYINFO_SHOW_REVIEW=false` skips it | business rule | 003-simulated-myinfo-consent | |
| BR-AUTH-01 | Dealer user sees only own dealer's applications | business rule | 004-dealer-status-realtime | |
| BR-AUTH-02 | Ops see every dealer's applications | business rule | 006-ops-review | |
| BR-AUTH-03 | One sample dealer account and one Ops account; simple login or role switch | business rule | 001-dealer-quick-apply (dealer); 006-ops-review (Ops) | |
| BR-DEMO-01 | Demo Control is a hidden page | business rule | 008-demo-control | |
| BR-DEMO-02 | Demo Control: reset, sample applications, force expiry | business rule | 008-demo-control | |
| BR-DEMO-03 | Demo Control only for signed-in users, checked by the backend | business rule | 008-demo-control | |
| BR-DEMO-04 | Reset hard-deletes application data, keeps sample accounts and personas | business rule | 008-demo-control | |
| BR-DEMO-05 | Sample applications = Ops list design rows, skip existing | business rule | 008-demo-control | |
| NFR-001 | Status propagates to dealer and Ops within about 1 second | NFR | 004-dealer-status-realtime | |
| NFR-002 | Email arrives within 1 minute | NFR | 002-singpass-email-link-check | |
| NFR-010 | Permission checks in the backend | NFR | 001-dealer-quick-apply (and every later change) | |
| NFR-011 | Simple login / role switch, sample accounts | NFR | 001-dealer-quick-apply | |
| NFR-012 | Myinfo data stored encrypted | NFR | 003-simulated-myinfo-consent | |
| NFR-013 | No real Singpass calls, no real staging passwords | NFR | 003-simulated-myinfo-consent | |
| NFR-014 | AA refused by the server until every party is Fulfilled | NFR | 007-ops-resend-and-approvals | |
| NFR-015 | Customer reaches only their own valid latest link | NFR | 002-singpass-email-link-check | |
| NFR-030 | Smooth, stable live demo | NFR | 008-demo-control | |
| NFR-031 | `PUBLIC_BASE_URL`, LAN and tunnel | NFR | 002-singpass-email-link-check | |
| NFR-032 | SMTP from `.env`, Mailpit fallback with the link in the log | NFR | 002-singpass-email-link-check | |
| NFR-033 | README contents and 5-minute demo script | NFR | 008-demo-control | |
| NFR-034 | Mock gateway behind an adapter | NFR | 003-simulated-myinfo-consent | |
| NFR-035 | One-command start | NFR | 001-dealer-quick-apply | |
| NFR-036 | Minimum tests: NRIC validation, link expiry and replacement, NRIC comparison, AA lock | NFR | 001 (NRIC validation), 002 (expiry), 003 (NRIC comparison), 007 (replacement, AA lock) | |
| NFR-040 | Desktop dealer/Ops screens, mobile-first customer screens | NFR | 001-dealer-quick-apply (and every later change for its screens) | |
| NFR-041 | Screens match the design (colors, Inter) | NFR | 001-dealer-quick-apply (and every later change for its screens) | |
| NFR-042 | UI language English as in the design | NFR | 001-dealer-quick-apply | |
| NFR-043 | Date/time display as in the design | NFR | 001-dealer-quick-apply | |
| decisions D-01…D-32 | Demo decisions for the open questions (`docs/requirements/decisions.md`) | business rule | the change owning the item each decision refines | |
| §7 | Technology suggestion (Vite, Fastify, SQLite…) replaced by the repo stack | out of scope | out of scope | — |
| §9 (1), (3) | `docs/PLAN.md`, branch `feature/singpass-demo`, PR into main — replaced by the spec harness | out of scope | out of scope | — |
| §12 Home and role views | "All" development view; real Dealer / Ops home pages | out of scope | out of scope | — |
| §12 Quick Apply beyond contact details | Product selection, LTA-unlocked fields, vehicle and loan figures, instalment, trade-in, MAS 642, employment, document uploads, declarations, LTA / OneMotoring lookup | out of scope | out of scope | — |
| §12 My Applications | Dealer list and drafts | out of scope | out of scope | — |
| §12 IPA and AA contents | Terms, calculations, notices, PDF, preview, locking, Amend | out of scope | out of scope | — |
| §12 Documents | Request documents, documents list, OneMotoring PDF reader | out of scope | out of scope | — |
| §12 Other Ops actions | Edit page, Change Status checks, FI Review, Decline, Lapse, Save, activity log, manual entry, copy link, search and filters | out of scope | out of scope | — |
| §12 Dealer read-only view | Full captured application view | out of scope | out of scope | — |
| §12 System outputs | xlsx workbook, document list, output folder, Part B form | out of scope | out of scope | — |
| §12 Credit review | Actual credit assessment | out of scope | out of scope | — |
| §12 Real integrations | Real Singpass / Myinfo, real ValueMax gateway, SMS, Singpass app channel | out of scope | out of scope | — |
| §12 User management | Real authentication and user management (BRD screens) | out of scope | out of scope | — |

## Unassigned

_(none: the §11 points and the Credit Review step are answered in `docs/requirements/decisions.md` D-14, D-30, D-31, D-32)_
