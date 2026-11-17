# States: VerificationLink (singpass-verification)

A party's Singpass status is the status of its latest link (brief §5). Resend creates a new link in `pending`
and moves the previous link to `superseded` if it was still `pending` (BR-SPV-04, BR-SPV-15).

## States

| State | Meaning |
| --- | --- |
| pending | Link sent, not expired, latest of the party; shown as "Pending" |
| fulfilled | Customer submitted Myinfo with the dealer-entered NRIC; shown as "Fulfilled" |
| nric-mismatch | Customer submitted Myinfo with another NRIC; shown as "NRIC mismatch", red for Ops |
| declined | Customer pressed "Cancel" on the consent screen; shown as "Declined" |
| expired | 72 hours passed (or Demo Control forced it) while the link was pending; shown as "Expired" |
| superseded | A newer link was sent to the same party; shown as "Superseded" |

## Events

| Event | Triggered by |
| --- | --- |
| send | System on "Send Singpass Request", or on "Resend Email" (for the new link) |
| open | Customer opens `/v/{token}` (link check) |
| submit-match | Customer presses "Submit Application"; `uinfin` equals the dealer-entered NRIC |
| submit-mismatch | Customer presses "Submit Application"; `uinfin` differs |
| cancel | Customer presses "Cancel" on the consent screen |
| expire | 72 hours after `triggeredAt`, or Demo Control "force expiry" |
| resend | Ops "Resend Email" for the party (applies to the party's current link) |

## Transition table

| State \ Event | send | open | submit-match | submit-mismatch | cancel | expire | resend |
| --- | --- | --- | --- | --- | --- | --- | --- |
| (does not exist) | → pending | ✗ "This link is no longer valid" (unknown token) | ✗ does not exist | ✗ does not exist | ✗ does not exist | ✗ does not exist | ✗ does not exist |
| pending | ✗ already exists | = (no-op) shows "Retrieve Myinfo with Singpass" | → fulfilled | → nric-mismatch | → declined | → expired | → superseded (new link → pending) |
| fulfilled | ✗ already exists | ✗ "This link is no longer valid" (D-17) | ✗ already fulfilled | ✗ already fulfilled | ✗ already fulfilled | = (no-op) stays fulfilled (D-20) | ✗ refused: party already Fulfilled (D-18) |
| nric-mismatch | ✗ already exists | ✗ "This link is no longer valid" (D-16) | ✗ link used | ✗ link used | ✗ link used | = (no-op) stays nric-mismatch (D-20) | = (no-op) stays nric-mismatch; new link → pending (D-19) |
| declined | ✗ already exists | ✗ "This link is no longer valid" (D-16) | ✗ link used | ✗ link used | ✗ link used | = (no-op) stays declined (D-20) | = (no-op) stays declined; new link → pending (D-19) |
| expired | ✗ already exists | ✗ "This link is no longer valid" | ✗ link expired, result rejected (D-23) | ✗ link expired, result rejected (D-23) | ✗ link expired | = (no-op) | = (no-op) stays expired; new link → pending (D-19) |
| superseded | ✗ already exists | ✗ "This link is no longer valid" | ✗ old link, result rejected and not attached, phone shows "This link is no longer valid" (BR-SPV-14) | ✗ old link, result rejected and not attached (BR-SPV-14) | ✗ old link | = (no-op) | = (no-op) only the current link is resent |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
