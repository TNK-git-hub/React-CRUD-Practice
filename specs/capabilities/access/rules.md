# Business rules: access

"Brief" = `docs/requirements/singpass-demo-brief.md`.

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-AUTH-01 | A dealer user sees only the applications of their own dealer; a second sample dealer "Sample Auto Pte Ltd" owns sample applications only | `docs/claude-code-demo/prototype-screens/README.txt` (fig. 5.1); decisions D-09 |
| BR-AUTH-02 | Ops see the applications of every dealer | brief §3.10 |
| BR-AUTH-03 | There is one sample dealer account (Demo Motors Pte Ltd, Alex Tan) and one Ops account; sign-in is a role switch without a password ("Alex Tan — Demo Motors Pte Ltd", "Priya Nair — VMAF Ops"), kept in a server-side session cookie until sign-out or browser close | brief §6; decisions D-08 |

## Decision tables

_(none: no multi-condition rule in this domain)_

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
