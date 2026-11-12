# Edge Case Catalog

Catalog of the **dimensions** to walk through when writing scenarios for a requirement. Shared by every app.
Agents only READ this file; people (you/the team) extend it when a retro finds a new kind of bug.

Merged sources: `edge-case-discovery` (openagentskills, MIT), `edge-case-coverage`
(skillstack, MIT), `deliver-edge-cases` (pm-skills, Apache-2.0).

## How to use

1. For **each requirement** in the delta spec, go through **each dimension** below, in order.
2. Each dimension yields **one of two** results:
   - one or more scenarios `<CODE>-<NNN>-S<n>` (Given / When / Then), with type and priority; or
   - `N/A — <one-line reason>` (e.g. "requirement takes no numeric input").
3. Every dimension must have a result. Never leave one empty; never write "N/A" without a reason.
4. Error scenarios must have a **user-visible message** and a **recovery path** (dimension 12).
5. Check `capabilities/<domain>/states.md` and `rules.md` for dimensions 5 and 13.
6. Never invent limits or numbers: if the requirement does not say what the limit is,
   write the scenario with `[NEEDS CLARIFICATION: maximum limit?]` instead of picking a number.

### Priority

| Level | When |
| --- | --- |
| **P1** | Data lost or wrong, data leaked / permission bypassed, crash, wrong money |
| **P2** | Wrong behavior without data loss; clearly poor experience |
| **P3** | Rare, small impact; only needs to fail "gracefully" (no crash, a message is shown) |

### Scenario types (in parentheses after the ID)

`happy` · `input` · `boundary` · `missing` · `collection` · `state` · `permission` · `concurrency` ·
`time` · `dependency` · `resource` · `data` · `domain`

Example: `ABC-004-S3 (boundary) [P1] — Given … When … Then … → Recovery: …`

---

## 1. Input and string format

**Applies when:** the requirement takes text typed by the user (name, description, email, search…).

- Empty `""`? Only whitespace / line breaks?
- Over the maximum length? Exactly the maximum length?
- Accented characters (e.g. Vietnamese), emoji, special characters, right-to-left scripts?
- Wrong format (email, phone number, date, code)?
- Strings that look like attacks (`<script>`, `' OR 1=1 --`) — does the system treat them as plain text?
- Strings that look like another type (`"null"`, `"true"`, `"123"`)?
- Leading/trailing whitespace: trimmed or kept? Are two values that differ only in case considered duplicates?

## 2. Numbers and boundary values

**Applies when:** there are quantities, prices, ages, durations, page numbers, limits.

- 0? Negative numbers?
- min − 1, min, max, max + 1 (boundary value analysis)?
- Decimals where only integers are accepted? How is money rounded?
- Very large numbers (overflow, slowness)? For floats: NaN, infinity?

## 3. Missing and empty

**Applies when:** there are forms, request bodies, optional parameters.

- A required field missing? A field present but `null`?
- An optional field omitted → what is the default?
- Unexpected extra fields → ignored or rejected?
- An object only partly filled?

## 4. Collections, lists and pagination

**Applies when:** showing lists, multi-select, import, search, filter.

- 0 items (what does the empty state show)? 1 item? Very many?
- Exactly one page; one item over a page?
- Duplicate items?
- Filter / search with no results?
- Sorting when many items share the same value — is the order stable?
- Multi-select where one item is invalid → whole batch or partial?

## 5. Existence and state

**Applies when:** acting on an object with a lifecycle. Check `states.md`.

- Object does not exist (wrong ID)?
- Object already deleted (per the deletion policy in `nfr.md`)?
- Action not valid for the current state (every ✗ cell in `states.md` needs at least one scenario)?
- Creating a duplicate of a value that must be unique?
- Repeating the same action a second time — is the result the same as the first (idempotent)?

## 6. Permissions and identity

**Applies when:** the requirement constrains who may do what (almost every requirement that writes data).

- Not logged in? Session / token expired?
- Right person but wrong role?
- Accessing another user's resource by changing the ID in the request?
- Client declares its own role / user ID in the body — does the backend ignore it?
- Permission revoked in the middle of an action?
- Denied scenarios must be tested by **calling the backend directly** (constitution, Principle II).

## 7. Concurrency and ordering

**Applies when:** several people edit the same data, there is a submit button, background processing.

- Two people edit at the same time — does the later save overwrite the earlier one's data?
- Submit clicked twice quickly?
- One person deletes while another is editing?
- Events / requests arrive out of order?
- A retry after a timeout creates a duplicate record?

## 8. Time

**Applies when:** there are dates and times, deadlines, schedules, expiry, per-period statistics.

- Time zone: stored and displayed in which zone (local or UTC)?
- Day / month / year boundaries (23:59 → 00:00, end of month, leap year)?
- Expiry exactly at the boundary: 1 second before, at the second, 1 second after?
- User's device clock is wrong?

## 9. External dependencies and infrastructure

**Applies when:** calling external services, sending email, payments, writing to several tables.

- External service fails / times out / returns malformed data?
- Database error or constraint violation?
- Failure halfway: part written, part not → is there a rollback?
- Flaky network while submitting?

## 10. Resource limits

**Applies when:** file uploads, large payloads, bulk operations, public APIs.

- File too large? Wrong type? Empty file?
- Request too large? Too many requests (rate limit)?
- User quota exceeded?

## 11. Data and deletion

**Applies when:** deleting, or editing data that other data depends on. Check the deletion policy in `nfr.md`.

- After deletion, where does the data still appear (lists, search, reports, related data)?
- Can it be restored? Who may restore it?
- Deleting a parent while children still reference it?
- Editing a value other data relies on (e.g. changing a price after invoices exist)?

## 12. Error messages and recovery paths

**Applies to:** every error scenario in the dimensions above (this is a mandatory companion, not a separate dimension that can be N/A).

- What message does the user see? Does it say clearly what to do next?
- Is the data already entered kept so it can be corrected?
- Can the user retry? Does a retry create a duplicate?
- Is the error logged for investigation (without leaking sensitive information in the message)?

## 13. Domain-specific

Business traps specific to each app. Empty in the harness; `/spec-bootstrap` or each app's retro adds
them here (on the app's branch), one question per line.

- _(none yet)_

---

## Coverage table template (`checklists/edge-cases.md`)

```markdown
# Edge cases — <change>

| Requirement | Dimension | Result | Notes |
| --- | --- | --- | --- |
| ABC-004 | 1. Input | S2, S3 | |
| ABC-004 | 2. Numbers and boundaries | N/A | takes no numeric input |
| ABC-004 | 6. Permissions | S4 [P1] | test calls the backend directly |
| ABC-004 | 13. Domain-specific | N/A | no item applies yet |
```

Each requirement × each dimension 1–11 and 13 = one row. Dimension 12 is checked inside each error scenario.
