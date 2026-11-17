# States: Application (applications)

The dealer's tracker shows "Application Submitted → Pending Singpass Verification → Credit Review → IPA Issued → AA"
(brief §3.9). The states below are the ones the brief defines actions for; the Singpass status of each party is a
separate lifecycle (`capabilities/singpass-verification/states.md`).

Tracker steps derived from it (decisions D-14, D-15, D-25): "Pending Singpass Verification" is current while any
party is not Fulfilled and done when every party is; "Credit Review" is current when every party is Fulfilled and
nothing is issued, and done once an IPA or AA is issued. Ops list labels: "Pending", "Credit Review",
"Approved — IPA", "Approved — AA".

## States

| State | Meaning |
| --- | --- |
| submitted | The dealer pressed "Send Singpass Request"; tracker at "Application Submitted" / "Pending Singpass Verification"; Ops list shows "Pending" |
| ipa-issued | Ops issued the In-Principle Approval; tracker shows "IPA Issued"; Ops list shows "Approved — IPA" |
| aa-issued | Ops issued the Approval Advice; tracker shows "AA"; Ops list shows "Approved — AA" |

## Events

| Event | Triggered by |
| --- | --- |
| send-request | Dealer user, "Send Singpass Request" on Review & Submit |
| issue-ipa | Ops, "Issue IPA" on Application Details |
| issue-aa | Ops, "Issue AA" on Application Details (server checks BR-APPL-04) |

## Transition table

| State \ Event | send-request | issue-ipa | issue-aa |
| --- | --- | --- | --- |
| (does not exist) | → submitted | ✗ does not exist | ✗ does not exist |
| submitted | ✗ already exists | → ipa-issued (allowed while Singpass is Pending, BR-APPL-03) | → aa-issued if every party is Fulfilled (no IPA needed, D-11); otherwise ✗ "Cannot issue AA yet" |
| ipa-issued | ✗ already exists | ✗ IPA already issued (Amend is out of scope) | → aa-issued if every party is Fulfilled; otherwise ✗ "Cannot issue AA yet" |
| aa-issued | ✗ already exists | ✗ AA already issued | ✗ AA already issued |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
