---
kind: capability
domain: "products"
code: "PROD"
---

# Capability: products (PROD)

## Overview

CI fixture.

## Requirements

### PROD-001: Create product

The system MUST let a stock manager create a product.

- **Permissions:** stock manager; staff are denied
- **Scenarios:**
  - `PROD-001-S1` (happy) [P1] — **Given** a stock manager **When** they create "Shirt" **Then** "Shirt" is listed
  - `PROD-001-S2` (permission) [P1] — **Given** a staff member **When** they call the backend to create **Then** 403 → Recovery: ask a stock manager
- **Source:** change 091-ci-pass
