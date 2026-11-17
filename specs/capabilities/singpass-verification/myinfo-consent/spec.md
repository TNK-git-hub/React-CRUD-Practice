---
kind: capability
domain: "singpass-verification"
feature: "myinfo-consent"
code: "SPV"
---

# Feature: singpass-verification/myinfo-consent (SPV)

## Overview

Customer screens 6–8 on the simulated Singpass (test persona login, consent with "Cancel" / "I Agree", review tabs, "Submit Application", "Details shared"), the mock gateway (`GetToken`, `GetLinkId`, `person/autofin/{LinkId}`) behind an adapter, NRIC comparison and the resulting party status, encrypted storage of the Myinfo data. Used by customers on their phone.

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
