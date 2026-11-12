# Business rules: [domain]

<!--
AGREED business rules from the requirement documents, used as the reference when writing specs and edge cases.
- Each rule has an ID BR-[CODE]-NN and a source (which section of docs/requirements).
- A rule that depends on several conditions → write it as a decision table: list EVERY combination;
  each table row = one scenario when writing the spec.
- Do not add rules that are not in the documents; mark unclear points [NEEDS CLARIFICATION].
-->

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-[CODE]-01 | [one-sentence description] | [docs/requirements/<file>#<section>] |

## Decision tables

### BR-[CODE]-[NN]: [name of multi-condition rule]

| [Condition 1] | [Condition 2] | Result |
| --- | --- | --- |
| yes | yes | [...] |
| yes | no | [...] |
| no | yes | [...] |
| no | no | [...] |

## Open questions

- [NEEDS CLARIFICATION: …]
