<!-- Sample task file for dispatch.sh. The main session writes one file like this for each task.
     Call: bash k8s/agents/dispatch.sh example-task k8s/agents/tasks/EXAMPLE.md --title "<PR title>" --mode code-only
     Mode full (default) needs the section "Behaviors to test": test-planner/test-writer write the tests from it BEFORE the code exists.
     Concrete example content: _(none yet: fill in when bootstrapping a new system)_ -->

## Goal
<!-- One or two sentences: the behaviour wanted after the task, as seen by the user. -->
_(none yet: fill in when bootstrapping a new system)_

## Behaviors to test
<!-- Only for --mode full. Behaviour observable from outside: input → output. Each line must fail on the current code. -->
- _(none yet: fill in when bootstrapping a new system)_

## Files you may change
- _(none yet: fill in when bootstrapping a new system)_
- Tests: `frontend/test/public/` (test-writer only, --mode full)

## Out of scope
- _(none yet: fill in when bootstrapping a new system)_

## Done when
- _(none yet: fill in when bootstrapping a new system)_
- `pnpm ci:local` prints CI PASSED.
