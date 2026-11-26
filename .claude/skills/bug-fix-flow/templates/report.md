# Bug report: <short title>

- **Bug ID:** <YYYYMMDD>-<slug>
- **Reported by:** <user / test / CI run>, <YYYY-MM-DD>
- **Violated scenario:** `<CODE>-<NNN>-S<n>` in `specs/capabilities/<domain>/<feature>/spec.md` (or `specs/changes/NNN-<name>/spec.md`)

## Expected

<What the scenario says must happen: its Given / When / Then, values verbatim from the spec.>

## Actual

<What happens instead: values, message, status code, screen.>

## Steps to reproduce

1. <step>
2. <step>
3. <step>

## Environment

- Branch / commit: <branch> @ <short sha>
- Package: <backend | frontend>
- Runtime: <Node version, browser, OS>
- Data: <seed, records needed, user role>

## Error / log

```
<error message, stack trace, log lines; trimmed to what matters>
```

## Reproduction test

<!-- Written in step c, before the investigation. The root-cause approval hashes this file too. -->
- Path: `<package>/test/public/<file>.test.ts`
- Name: `<scenario ID> ...`

## Open questions

- <what is still missing; ask the user in one turn>
