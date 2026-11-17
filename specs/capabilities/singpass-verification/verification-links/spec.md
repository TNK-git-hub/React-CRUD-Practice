---
kind: capability
domain: "singpass-verification"
feature: "verification-links"
code: "SPV"
---

# Feature: singpass-verification/verification-links (SPV)

## Overview

Creating one active 72-hour link per party, sending it by email (SMTP or Mailpit, link printed to the log), Resend (new link, old one superseded), expiry, and the customer's link check screen 5 ("This link is no longer valid" vs "Retrieve Myinfo with Singpass"). Used by the system on submit, by Ops (Resend) and by customers (link check).

Domain files: [states.md](../states.md) · [rules.md](../rules.md) · [history.md](../history.md)

## Requirements

_(none yet)_

<!-- Shape of one requirement after archive:

### [CODE]-001: [Requirement name]

The system MUST [behavior].

**[Aspect, e.g. API].** [details copied from the change: tables, JSON, messages verbatim]

**Permissions:** [...]

**Scenarios:**

- `[CODE]-001-S1` (happy, P1)
  - **Given** …
  - **When** …
  - **Then** …
- `[CODE]-001-S2` (permission, P1)
  - **Given** …
  - **When** … (calls the backend directly)
  - **Then** …
  - → Recovery: …
  - Covers: [OTHER]-[NNN]
- **Source:** change [NNN-change-name]

The change's NFR rows go to specs/_system/nfr.md; its Architecture Decisions stay in specs/archive/<change>/spec.md.
-->

## Merged changes

<!-- Written by /spec-archive: one row per archived change that touched this feature. Do not edit by hand. -->

| Change | Date | Change in this feature |
| --- | --- | --- |
| _(none yet)_ | | |
