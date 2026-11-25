---
description: Create the project constitution (mission, tech stack, roadmap) from the templates, for a new or an existing project.
allowed-tools: Read, Write, Glob, Grep, Bash(git ls-files:*), AskUserQuestion
---

Create the project constitution in `.claude/memory/constitution/` from the templates in
`.claude/template/constitution/`.

## 1. Check for an existing constitution

If `.claude/memory/constitution/` already holds `mission.md`, `techstack.md`, or
`roadmap.md`, ask the user with AskUserQuestion whether to overwrite them, update them,
or stop. Do not overwrite without an answer.

## 2. Decide the project type

The harness files are `.claude/`, `docs/`, `README.md`, and `.gitignore`. Any other
tracked or untracked file is project code.

- **Brownfield** (an existing customer repository): there is project code.
  Read all of the project's source code (list it with `git ls-files` plus untracked
  files). Skip only generated or third-party files: dependency folders, build output,
  vendored libraries, lock files, and binaries. Also read every file in
  `docs/requirements/` except `README.md`, if there are any.
- **Greenfield** (a new project): there is no project code.
  Read every file in `docs/requirements/` except `README.md`. If there are none, tell the
  user to put the customer's requirements there, and stop.

If you cannot tell which type it is, ask the user.

## 3. Fill the templates

For each of `mission.md`, `techstack.md`, `roadmap.md`:

1. Read the template. Keep its headings and their order.
2. Under each heading, write what the HTML comment asks for, then remove the comment.
3. Use only facts from the requirements or the code. Do not invent them.
4. In `mission.md`, list the files you used under **Sources**.

When a section cannot be filled from the inputs, collect the open questions and ask the
user with AskUserQuestion, a few at a time, grouped by file. Write the file only after the
questions for it are answered.

For a greenfield project, the tech stack may not be chosen yet: propose options with
their trade-offs and let the user pick.

## 4. Save and report

1. Write the three files to `.claude/memory/constitution/`.
2. Make sure `.claude/memory/MEMORY.md` has a line for the constitution.
3. Tell the user: the project type you found, the files you wrote, and any section that
   is still open.
