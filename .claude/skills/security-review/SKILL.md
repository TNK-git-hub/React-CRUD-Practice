---
name: security-review
description: Security review of code changes against OWASP Top 10 and OWASP ASVS, focused on high-confidence, exploitable issues (injection, broken access control, secrets, unsafe deserialization, SSRF, crypto misuse, vulnerable dependencies). Use as part of code-review, before merging, or when the user asks for a security check.
---

# Security Review

Based on: Anthropic `claude-code-security-review` / `/security-review` (diff-focused, high-confidence findings, explicit false-positive filtering) and OWASP Top 10 + ASVS checklists.

## Method

1. **Understand the context.** Read `tech-stack.md` (auth mechanism, secrets management, validation library, PII stores) and existing security patterns in the codebase (how auth, validation, and queries are done elsewhere).
2. **Map the attack surface of the diff.** List every new/changed entry point (HTTP routes, message handlers, CLI args, file uploads, webhooks, scheduled jobs) and every sink (DB queries, shell, filesystem, templates/HTML, outbound HTTP, deserialization, logs).
3. **Trace untrusted data** from each entry point to each sink. Check validation, encoding, and authorization along the path.
4. **Run the checklist** below.
5. **Use scanner output from the orchestrator** (`semgrep`, `gitleaks`, dependency audit). You are read-only and do not re-run those tools. Treat output as leads to verify, not final findings. If the brief says a scanner was not installed, record that; do not pretend it ran.
6. **Filter false positives** (below), then report.

## Checklist (OWASP Top 10 mapped)

| Area | Check |
|---|---|
| A01 Broken access control | Every new endpoint/action enforces authn + authz server-side; object-level checks (IDOR: can user A access B's resource by changing an ID?); no trust in client-supplied roles/IDs; CORS not widened |
| A02 Cryptographic failures | No hard-coded keys; strong algorithms (no MD5/SHA1 for passwords, use bcrypt/argon2/scrypt); TLS for external calls; sensitive data encrypted at rest when required; secure randomness for tokens |
| A03 Injection | Parameterized queries / ORM bindings only; no string-built SQL, NoSQL, LDAP, shell, or eval; output encoding / auto-escaping for HTML (XSS); no `dangerouslySetInnerHTML` / `v-html` / `|safe` with user data |
| A04 Insecure design | Rate limiting on auth/expensive endpoints; business-logic abuse (negative quantities, replay, race conditions on balances/stock) |
| A05 Misconfiguration | Debug off in prod config; no verbose stack traces to clients; security headers; safe defaults |
| A06 Vulnerable components | New dependencies are maintained, pinned, and free of known CVEs |
| A07 Auth failures | Session/token expiry and rotation; password policy; no user enumeration via error messages/timing |
| A08 Integrity failures | No unsafe deserialization of untrusted data (pickle, Java serialization, YAML load); webhook signatures verified |
| A09 Logging failures | Security events logged; **no secrets, tokens, or PII in logs** |
| A10 SSRF | Outbound URLs from user input are allow-listed; no access to internal metadata endpoints |
| Secrets | No credentials, API keys, tokens, private keys, or connection strings in code, tests, fixtures, or config committed to git |
| Files | Path traversal on file paths; upload type/size validation; no executing uploaded content |

## False-positive filtering

Report only findings you are **confident are real and exploitable** in this codebase's context. Do not report:
- Theoretical issues with no reachable path from untrusted input.
- Issues in test-only code that never ships (unless it leaks real secrets).
- Generic hardening advice unrelated to the diff (put it under Info if useful).
- DoS through resource exhaustion unless trivially triggerable by an unauthenticated user.
- Problems already mitigated elsewhere (framework auto-escaping, ORM binding, middleware) - verify the mitigation actually applies.

## Finding format

`S-xx | Critical/Major/Minor | OWASP category | file:line | exploit scenario (how an attacker triggers it) | impact | concrete fix (code-level) | confidence (high/medium)`

Any confirmed Critical or Major security finding blocks completion and sends the work back to `tdd-loop`: write a test that demonstrates the vulnerability (e.g. unauthorized request returns 200), fix, re-run.
