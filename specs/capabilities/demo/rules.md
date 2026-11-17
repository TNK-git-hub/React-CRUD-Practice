# Business rules: demo

"Brief" = `docs/requirements/singpass-demo-brief.md`.

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-DEMO-01 | Demo Control is a small hidden page (e.g. `/demo`) not linked from the dealer or Ops navigation | brief §3 |
| BR-DEMO-02 | Demo Control can reset the data, create sample applications, and switch a link to the expired state to present the error cases | brief §3, §10 |
| BR-DEMO-03 | Only a signed-in user (dealer user or Ops) may use Demo Control; the backend refuses its calls otherwise | decisions D-05 |
| BR-DEMO-04 | Reset hard-deletes every application, party, verification link and Myinfo record; sample dealers, users and test personas stay (re-created if missing) | `specs/_system/nfr.md` (Data and deletion policy); decisions D-02 |
| BR-DEMO-05 | "Create sample applications" adds the rows of the Ops list design (`VMAF-2026-05114` to `VMAF-2026-05119`) and skips a reference that already exists | decisions D-29 |

## Decision tables

_(none: no multi-condition rule in this domain)_

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
