# States: none (access)

No entity of this domain has a lifecycle: the dealer, the dealer user and the Ops user are fixed sample data
(brief §6). Demo Control reset never deletes them and re-creates any that is missing (decisions D-02).

## States

| State | Meaning |
| --- | --- |
| seeded | The sample account exists |

## Events

| Event | Triggered by |
| --- | --- |
| sign-in | Dealer user or Ops (login or role switch) |

## Transition table

| State \ Event | sign-in |
| --- | --- |
| (does not exist) | ✗ unknown account |
| seeded | = (no-op) the account becomes the current user of the session |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
