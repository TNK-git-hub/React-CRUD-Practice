---
description: Find spots in the harness that were missed when it was last changed (stale paths, names, and rules), and ask which ones to fix.
argument-hint: "[git ref to compare against, e.g. HEAD~3 or main]"
allowed-tools: Read, Edit, Glob, Grep, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git ls-files:*), AskUserQuestion
---

Check the harness for drift: places that still describe the harness as it was before the
latest change. Do not fix anything before the user has chosen what to fix.

## 1. Find what changed

Compare against `$ARGUMENTS` if it was given. Otherwise use the uncommitted changes
(staged, unstaged, untracked, and deleted files); if there are none, use the last commit.

Use `git status`, `git diff --stat`, `git diff`, and `git log` to list:

- files and folders that were added, deleted, moved, or renamed;
- names that changed: commands, headings, terms, file names, folder names;
- rules or steps that changed in meaning (for example, where a file is written, what a
  command reads, which files count as part of the harness).

For each change, write down the old form and the new form. If a change could mean two
things (for example, a folder was deleted and another one added: is it a rename?), ask
the user with AskUserQuestion before going on.

## 2. Search for spots that were missed

The harness files are `.claude/`, `docs/`, `README.md`, and `.gitignore`. Search all of
them, not only the files that changed:

1. **Old references.** Search for every old form from step 1 (paths, names, terms, also
   without the leading `.claude/`). Each hit that still uses the old form is a finding.
2. **Paths that do not exist.** Every path written in the harness files (in backticks,
   in folder trees, in `@` imports, in links) must point to a real file or folder.
3. **Folder trees and lists.** The layout in `.claude/CLAUDE.md` must match the real
   files under `.claude/` and `docs/`. Every command in `.claude/commands/` must be
   listed there.
4. **Indexes.** Every line in a memory index must point to an existing file, and every
   memory file must have a line in the index.
5. **Diagram.** In `docs/BaseHarness.drawio`, read the `value` labels of the cells. Folder,
   file, and command names in the diagram must match the real ones.
6. **Rules that disagree.** Two files must not give different answers to the same
   question (for example, `CLAUDE.md` and a command naming different folders for the
   same thing).

Skip files in `docs/requirements/` other than `README.md`, and the generated constitution
files: they are project content, not harness. If a generated constitution file is
affected, report it, but only change it if the user explicitly asks.

## 3. Report and ask

List the findings, grouped by file. For each one give:
`file:line`, what it says now, what it should say, and which change from step 1 caused it.

If there are none, say so and stop.

Then ask the user with AskUserQuestion, a few findings at a time, what to do with each:

- **Fix** — apply the suggested change;
- **Skip** — leave it as it is;
- **Change was wrong** — the old form is right; note this, and do not touch the spot.

When the right new form is not clear, offer the options you see instead of guessing.

## 4. Apply and report

1. Apply only the fixes the user chose, with the smallest edit that fixes each one. In
   the `.drawio` file, change only the `value` text of the cell.
2. Do not commit.
3. Tell the user: what you fixed, what was skipped, and every finding where the user said
   the change itself was wrong, so they can revert or redo that change.
