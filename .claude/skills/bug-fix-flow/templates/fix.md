# Fix: <YYYYMMDD>-<slug>

- **Approved root cause:** `bugs/<id>/investigation.md`, Root cause gate (<YYYY-MM-DD>)
- **Reproduction test:** `<package>/test/public/<file>.test.ts`, test `<CODE>-<NNN>-S<n> ...`

## Attempts

<!-- One line per attempt by code-writer. Stop after the 3rd failed attempt (skill bug-fix-flow, step f). -->
- Attempt 1: <change, file:line> — <result: reproduction test pass / fail, other tests, output line>

## Files changed

| File | Change |
| --- | --- |
| `<file>` | <what changed and why> |

## Tests

- Reproduction test: `<CODE>-<NNN>-S<n> ...` — <fail before the fix → pass after>
- Review: code-reviewer <findings / none>; test-critic <findings / none>

## Verification

<!-- Outputs that just ran (skill verification-before-completion). -->
```
$ pnpm lint
<output>
$ pnpm --filter frontend typecheck
<output>
$ pnpm test
<output>
```

## Same pattern elsewhere

<!-- Listed only; fixing them is a new decision for the user. -->
- `<file>:<line>` <same mistake, why>
