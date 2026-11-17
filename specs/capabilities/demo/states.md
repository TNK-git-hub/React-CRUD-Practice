# States: none (demo)

The demo domain owns no entity; Demo Control acts on the entities of other domains (applications, verification
links). Their lifecycles are in `capabilities/applications/states.md` and `capabilities/singpass-verification/states.md`
(force expiry = event `expire`).

## States

| State | Meaning |
| --- | --- |
| idle | Demo Control has no state of its own |

## Events

| Event | Triggered by |
| --- | --- |
| reset | Presenter, "reset data" |
| seed | Presenter, "create sample applications" |
| force-expire | Presenter, "expire link" (applies event `expire` to a verification link) |

## Transition table

| State \ Event | reset | seed | force-expire |
| --- | --- | --- | --- |
| idle | = (no-op) data hard-deleted (BR-DEMO-04) | = (no-op) missing samples created (BR-DEMO-05) | = (no-op) the chosen pending link → expired |

## Open questions

_(none: answered in `docs/requirements/decisions.md`)_
