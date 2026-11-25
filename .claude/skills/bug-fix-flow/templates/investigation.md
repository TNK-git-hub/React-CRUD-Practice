# Investigation: <YYYYMMDD>-<slug>

- **Report:** `bugs/<id>/report.md`
- **Reproduction test:** `<package>/test/public/<file>.test.ts`, test `<CODE>-<NNN>-S<n> ...`
- **Run:** `pnpm --filter <package> test -t=<CODE>-<NNN>-S<n>`

## Evidence log

| # | Command / source | What it showed |
| --- | --- | --- |
| 1 | `pnpm --filter <package> test -t=<ID>` | fails: `expected <x>, received <y>` at `<file>:<line>` |
| 2 | `git log -p -- <file>` | <finding> |

## Call chain

1. `<file>:<line>` <entry point (route, handler, component)>
2. `<file>:<line>` <next call>
3. `<file>:<line>` <where the wrong value is produced>

## Hypotheses (ranked)

### H1: <X is the root cause because Y>

- **Supporting evidence:** <evidence #, file:line>
- **Contradicting evidence:** <evidence #, or "none found">
- **Confirming experiment:** <what to run or check> → <result, or "not run yet">
- **Status:** open | confirmed | rejected (<reason>)

### H2: <...>

- **Supporting evidence:**
- **Contradicting evidence:**
- **Confirming experiment:**
- **Status:**

## Root cause

- **Root cause:** <one or two sentences, file:line>
- **Fix direction:** <where to change, in the shared code at the source; no code>
- **Impact:** <callers, features and scenarios that go through this code>
- **Same pattern elsewhere:** <file:line, or "none found">

## Root cause gate

<!-- Not written by hand. The user approves in their own terminal (approval.py approve --bug <id> --gate root-cause
     --summary "<one line>"); it hashes report.md + the "Root cause" section above into bugs/<id>/approval.json.
     Check: python3 .specify/scripts/approval.py verify --bug <id> -->
See `bugs/<id>/approval.json` (gate `root-cause`).

## Stopped after 3 failed attempts

<!-- Only when step f) stops: the 3 attempts (see fix.md) and the options for the user. -->
- Attempts: <1, 2, 3 in one line each>
- Options: <rethink the design | a bigger change | leave as is>
