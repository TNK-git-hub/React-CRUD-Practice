# Non-functional requirements — [App name]

<!--
Each item has an ID NFR-NNN and a MEASURABLE NUMBER. The requirement documents do not say → [NEEDS CLARIFICATION], never pick one.
The "Data and deletion policy" section is MANDATORY per the constitution (Principle III):
a change that deletes data cannot be merged while this section still has NEEDS CLARIFICATION.
Do not choose the stack here; the stack is decided by the plan.md of the first change.
-->

## Performance

| ID | Requirement | Number | Source |
| --- | --- | --- | --- |
| NFR-001 | [list page renders within] | [≤ 1 second with N records] | [...] |

## Security and permissions

| ID | Requirement | Source |
| --- | --- | --- |
| NFR-010 | Every permission check happens in the backend (constitution, Principle II) | constitution |
| NFR-011 | [login method, session lifetime] | [...] |

### Permission matrix

| Action \ Role | [Role 1] | [Role 2] |
| --- | --- | --- |
| [create X] | ✓ | ✗ |

## Data and deletion policy (mandatory)

| Data type | Soft / hard delete | Keep deleted data for | Who may restore | Source |
| --- | --- | --- | --- | --- |
| [X] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [...] |

## Availability and operations

| ID | Requirement | Number | Source |
| --- | --- | --- | --- |
| NFR-030 | [uptime, backups] | [...] | [...] |

## User environment

| ID | Requirement | Source |
| --- | --- | --- |
| NFR-040 | [browsers, devices, UI language, time zone] | [...] |

## Open questions

- [NEEDS CLARIFICATION: …]
