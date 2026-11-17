# Non-functional requirements — ValueMax Dealer Portal (Singpass Myinfo demo)

"Brief" = `docs/requirements/singpass-demo-brief.md`. The stack is the repo's (brief §7, Harness note).

## Performance

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | After the customer presses "Submit Application", the dealer status screen and the Ops screens show the new Singpass status without a page reload | target about 1 second; tests assert ≤ 2 seconds (D-01) | brief §4, §10 | [to be set by the first change] |
| NFR-002 | After "Send Singpass Request", the party receives the email in a real mailbox | within 1 minute | brief §10 | [to be set by the first change] |

## Security and permissions

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-010 | Every permission check happens in the backend (constitution, Principle II) | constitution | denied-case test per protected operation |
| NFR-011 | Sign-in is a simple login or a role-switch button with one sample dealer account and one Ops account; role switch without a password; server-side session cookie until sign-out or browser close (D-08) | brief §6; decisions D-08 | [to be set by the first change] |
| NFR-012 | Myinfo data other than the NRIC comparison result is stored encrypted with AES-256-GCM, key from `MYINFO_ENCRYPTION_KEY`, backend refuses to start without it (D-03) | brief §5; decisions D-03 | [to be set by the first change] |
| NFR-013 | The system never calls the real Singpass and never stores or uses real Singpass staging passwords in the code | brief §6 | [to be set by the first change] |
| NFR-014 | The "Issue AA" action is refused by the server until every party of the application is Fulfilled, whatever the UI shows | brief §3.11 | [to be set by the first change] |
| NFR-015 | A customer reaches only the application and party of their own verification link, and only while the link is valid and the latest one | brief §3.5, §5 | [to be set by the first change] |

### Permission matrix

| Action \ Role | Dealer user | Ops | Customer (link holder) |
| --- | --- | --- | --- |
| Create an application (Quick Apply, "Send Singpass Request") | ✓ | ✗ (manual entry out of scope, brief §12) | ✗ |
| View an application and its Singpass status | ✓ own dealer's only (D-09) | ✓ every dealer | ✗ |
| View All Applications (Ops list) and Ops Application Details | ✗ | ✓ | ✗ |
| Resend Email | ✗ (D-04) | ✓ | ✗ |
| Issue IPA / Issue AA | ✗ | ✓ | ✗ |
| Open link check, simulated Singpass, consent, submit | ✗ | ✗ | ✓ own valid latest link only |
| Use Demo Control (reset, sample data, force expiry) | ✓ signed in (D-05) | ✓ signed in (D-05) | ✗ |

## Data and deletion policy (mandatory)

| Data type | Soft / hard delete | Keep deleted data for | Who may restore | Source |
| --- | --- | --- | --- | --- |
| Applications and parties (Demo Control reset) | hard delete | not kept | nobody (no restore) | brief §3 (Demo Control), §10; decisions D-02 |
| Verification links (Demo Control reset) | hard delete | not kept | nobody (no restore) | brief §3, §10; decisions D-02 |
| Myinfo records (Demo Control reset) | hard delete | not kept | nobody (no restore) | brief §3, §5, §10; decisions D-02 |
| Sample dealers, users, test personas | never deleted (re-created if missing) | — | — | decisions D-02 |

## Availability and operations

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-030 | The demo runs smoothly and stably when presented live | the README demo script runs end to end after a reset without an error (D-07) | brief §1; decisions D-07 | [to be set by the first change] |
| NFR-031 | Verification links use `PUBLIC_BASE_URL` and open from a real phone over the LAN and through a tunnel (cloudflared or ngrok) | — | brief §4 | [to be set by the first change] |
| NFR-032 | Email goes through the SMTP server configured in `.env`; without SMTP configured, it goes to the local Mailpit and the link is printed to the log | — | brief §4 | [to be set by the first change] |
| NFR-033 | The README covers installation, `.env` configuration (SMTP, `PUBLIC_BASE_URL`), how a phone reaches the app, a step-by-step demo script and how to reset the data | demo script about 5 minutes | brief §9 | [to be set by the first change] |
| NFR-034 | The mock gateway is a separate module behind an adapter interface, so the real ValueMax gateway replaces it by changing the adapter only | — | brief §4 | [to be set by the first change] |
| NFR-035 | The app starts with one command (local dev and docker compose with Mailpit) | 1 command | brief §7 | [to be set by the first change] |
| NFR-036 | Automated tests cover at least NRIC/FIN validation, link expiry and replacement, NRIC comparison and the AA lock | — | brief §9 | [to be set by the first change] |

## User environment

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-040 | Dealer and Ops screens target desktop (designed at 1280 px wide); customer screens are mobile-first (designed at 390 px wide) and display well on a real phone | brief §3, §10; `docs/claude-code-demo/design/canvas.json` | [to be set by the first change] |
| NFR-041 | The 11 screens match the design in `docs/claude-code-demo/design/`: colors `#7A1C2E`, `#A3203A`, `#F6F6F7`, `#D9A33A`, `#1F8A5B`, font Inter | brief §2, §10 | [to be set by the first change] |
| NFR-042 | UI language is English, with labels as in the design | design | [to be set by the first change] |
| NFR-043 | Dates and times are shown as in the design (`DD-MM-YYYY HH:mm`, e.g. `10-10-2026 12:03`), stored in UTC, shown in Singapore time (Asia/Singapore) | design `Dealer_Received`, `Ops_Detail`; decisions D-06 | [to be set by the first change] |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
