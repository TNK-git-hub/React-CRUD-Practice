# States: [entity] ([domain])

<!--
Lifecycle of one entity. Used to find edge cases: EVERY cell in the table must have a value.
- "→ X": moves to state X
- "✗ <reason>": rejected (each reachable ✗ cell needs at least one dimension-5 scenario)
- "= (no-op)": valid but changes nothing (idempotent)
These are AGREED BUSINESS RULES (from the requirement documents), used as the reference.
For behavior the system actually has, see spec.md.
-->

## States

| State | Meaning |
| --- | --- |
| [draft] | [...] |
| [active] | [...] |

## Events

| Event | Triggered by |
| --- | --- |
| [create] | [...] |
| [edit] | [...] |

## Transition table

| State \ Event | [create] | [edit] | [delete] |
| --- | --- | --- | --- |
| (does not exist) | → [draft] | ✗ does not exist | ✗ does not exist |
| [draft] | ✗ already exists | → [draft] | → [deleted] |

## Open questions

- [NEEDS CLARIFICATION: …]
