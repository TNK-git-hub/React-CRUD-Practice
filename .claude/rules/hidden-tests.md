# Hidden tests (`backend/test/private/`, `frontend/test/private/`): permissions

Applies to every session in this repo: the main session, every subagent, and `claude -p --agent <role>` sessions in the
agent pods. The hook `.claude/hooks/guard.mjs` enforces most of these rules; this file exists so that agents do not try
to get around them in the first place.

## Who may do what
- Only `private-test-writer` (the user's own session: `claude --agent private-test-writer`) may read, create and edit
  hidden tests. Its own rules are in `.claude/agents/private-test-writer.md`; the "Every other agent" section below
  does not apply to it.
- The user commits hidden tests and reviews their diff (`git diff --text`, because `.gitattributes` sets `-diff`).
- CI runs the hidden tests on every PR (job `ci`, step "Hidden tests", `ci/private-tests.sh`). `pnpm test` and
  `ci:local` do not run them; agent pods do not check them out.

## Every other agent (including the main session)
- Hidden tests exist and grade your code, but they are not your business: work from the spec. You neither need nor may
  know what they contain.
- Never locate, read, list, run, edit, delete or infer the content of hidden tests, by any means:
  - no Read / Grep / Glob into those two folders, no `find` / `ls` / `cat` / `node -e` reading them;
  - no getting their content through git: `git show <hash>`, `git show <commit>:<path>`, `git cat-file`, `git ls-tree`
    to look up hashes;
  - no running `test:private`, `typecheck:private`, `ci/private-tests.sh`, or `vitest` on them;
  - no reading the full log of the "Hidden tests" step on GitHub Actions.
- The only information you may get about hidden tests is counts and failing scenario IDs. When told a scenario fails,
  re-read that scenario in the spec.
- If a hook blocks a command, do not look for another way to do the same thing: stop and say so in your answer.
- If you see hidden test content by accident (command output, a diff), do not use it, and say in your answer that you
  saw it and through which command.

## Per role
- `code-writer`: never write code that detects it is running under hidden tests (a `test/private` path in the stack or
  argv, `expect.getState()`, `testPath`, `globalThis.expect` / `it` / `describe`); the `ENV_SNIFF_RE` gate in
  `k8s/agents/run.sh` blocks the PR.
- `test-writer`: never write tests that read, import or run hidden test files; write only to `<package>/test/public` and
  `frontend/test/e2e`.
- `code-reviewer`, `test-critic`: a diff that touches hidden tests, or code / tests that probe for them, is the highest
  severity finding.
- Main session (orchestrator, skill `dispatch-agents`): a fix task sent to an agent contains only counts and failing
  scenario IDs, never a log or any hidden test content.
