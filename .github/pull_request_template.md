## Change

<!-- Feature change: NNN-<name> and one line on what the user can now do. Harness change: what changed and why. -->

## Checklist

- [ ] Ran `/spec-archive <change>` (feature change): `specs/changes/<change>/` is gone and `specs/archive/<change>/` exists
- [ ] Read the diff of `specs/capabilities/` (requirements, scenarios, `history.md`)
- [ ] Every task in `tasks.md` is ticked
- [ ] Every scenario has a test whose name starts with its scenario ID
- [ ] Two commits: code; spec

<!-- CI must be green: "test" and "spec-check" are required checks on new-project. -->
