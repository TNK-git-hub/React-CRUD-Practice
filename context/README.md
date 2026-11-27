# context/

Persistent memory for the AI dev workflow. Commit this folder so the whole team (and every agent) shares the same context.

```
context/
├── ACTIVE.json                  # the one feature or bug in progress
├── workflow-version.json        # written by the installer (pack version + tool)
├── metrics/events.jsonl         # append-only phase/gate/loop events (no PII)
├── project/                     # created by /onboard - the project's rules
│   ├── tech-stack.md
│   ├── structure.md             # placement rules enforced by code review
│   ├── conventions.md
│   ├── commands.md
│   └── ui-source.md           # figma | codebase | none
├── features/<YYYYMMDD>-<slug>/  # branch: feat/<id>
│   ├── status.json              # authority: phase, gates, hashes, evidence
│   ├── STATUS.md
│   ├── 01-discussion.md
│   ├── 02-spec.md               # Gate 1
│   ├── 03-plan.md               # Gate 2
│   ├── 04-test-cases.md
│   ├── 05-implementation-log.md
│   └── 06-review.md
└── bugs/<YYYYMMDD>-<slug>/      # branch: fix/<id>
    ├── status.json              # gates.rootCause (not Gate 1/2)
    ├── STATUS.md                # from STATUS-bug.md template
    ├── 01-report.md
    ├── 02-investigation.md
    └── 03-fix.md
```

`status.json` wins if it disagrees with `STATUS.md`. Features approve spec/plan hashes; bugs approve root cause. One item per git branch. Tasks run one at a time.
