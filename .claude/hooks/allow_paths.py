#!/usr/bin/env python3
"""PreToolUse hook: allow a file write only inside the paths given as arguments.

Used by the subagents in .claude/agents/ (hooks.PreToolUse, matcher Write|Edit|MultiEdit|NotebookEdit):

    python3 .claude/hooks/allow_paths.py specs/changes/ .specify/feature.json '!specs/changes/*/spec.md'

Reads the hook JSON from stdin, takes tool_input.file_path (or notebook_path), makes it
relative to the project root and checks it against the rules:

    dir/          the directory and everything below it
    path/file.md  exactly that file
    pattern       glob (* ? [..]); a pattern without "/" only matches files in the repo root
    !rule         deny; any matching deny wins over every allow
    edit-section:<path or glob>:<start heading>:<end heading>
                  section-only edits: a file matching <path or glob> may only be changed by Edit / MultiEdit,
                  and only when every old_string lies entirely between the line <start heading> and the line
                  <end heading> (both lines excluded) and no new_string adds a "## " heading line.
                  Write / NotebookEdit on it are blocked. Decided before (and instead of) the plain allow rules.

Example (planner: change folder, but spec.md only between two headings):

    allow_paths.py specs/changes/ 'edit-section:specs/changes/*/spec.md:## Architecture Decisions:## Clarifications'

Exit 0 = allowed. Exit 2 = blocked, reason on stderr (Claude Code shows it to the agent).
Fails closed: bad input, a path outside the project or any internal error also exits 2.
Project root = $CLAUDE_PROJECT_DIR, else the "cwd" of the hook input, else the current directory.
"""

from __future__ import annotations

import json
import os
import sys
from fnmatch import fnmatchcase
from pathlib import Path, PurePosixPath

GLOB_CHARS = set("*?[")
SECTION_PREFIX = "edit-section:"


def norm(path: str) -> str:
    """Posix form, without leading './', case-folded on Windows."""
    p = PurePosixPath(path.replace("\\", "/")).as_posix()
    while p.startswith("./"):
        p = p[2:]
    return os.path.normcase(p) if os.name == "nt" else p


def matches(rel: str, rule: str) -> bool:
    rule_n = norm(rule)
    if rule.replace("\\", "/").endswith("/"):
        prefix = rule_n.rstrip("/") + "/"
        return rel.startswith(prefix)
    if GLOB_CHARS & set(rule_n):
        if "/" not in rule_n and "/" in rel:
            return False
        if not fnmatchcase(rel, rule_n):
            return False
        # '*' must not cross '/' boundaries: compare segment by segment.
        return len(PurePosixPath(rel).parts) == len(PurePosixPath(rule_n).parts)
    return rel == rule_n


def parse_section_rule(rule: str) -> tuple[str, str, str]:
    parts = rule[len(SECTION_PREFIX):].split(":")
    if len(parts) != 3 or not all(p.strip() for p in parts):
        raise ValueError(f"bad rule '{rule}': expected edit-section:<path>:<start heading>:<end heading>")
    return parts[0], parts[1].strip(), parts[2].strip()


def section_span(text: str, start_heading: str, end_heading: str) -> tuple[int, int] | None:
    """Character range strictly between the start heading line and the end heading line."""
    lines = text.splitlines(keepends=True)
    offset, start, end = 0, None, None
    for line in lines:
        bare = line.rstrip("\r\n").rstrip()
        if start is None and bare == start_heading:
            start = offset + len(line)
        elif start is not None and bare == end_heading:
            end = offset
            break
        offset += len(line)
    if start is None or end is None:
        return None
    return start, end


def check_section_edit(payload: dict, root: Path, rel: str, rule: str) -> tuple[bool, str]:
    _, start_h, end_h = parse_section_rule(rule)
    tool = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}
    if tool == "Edit":
        edits = [tool_input]
    elif tool == "MultiEdit":
        edits = tool_input.get("edits") or []
    else:
        return False, f"'{rel}' may only be changed with Edit, between '{start_h}' and '{end_h}' ({tool or 'unknown tool'} is blocked)"
    target = root / rel
    if not target.is_file():
        return False, f"'{rel}' does not exist; only edits between '{start_h}' and '{end_h}' are allowed"
    text = target.read_text(encoding="utf-8")
    if not edits:
        return False, "no edits in the tool input"
    for edit in edits:
        old, new = edit.get("old_string"), edit.get("new_string")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            return False, "edit without old_string / new_string"
        span = section_span(text, start_h, end_h)
        if span is None:
            return False, f"'{rel}' has no section between '{start_h}' and '{end_h}'"
        positions, i = [], text.find(old)
        while i != -1:
            positions.append(i)
            i = text.find(old, i + 1)
        if not positions:
            return False, "old_string not found in the file"
        if any(p < span[0] or p + len(old) > span[1] for p in positions):
            return False, f"old_string is not entirely between '{start_h}' and '{end_h}' in '{rel}'"
        if any(l.startswith("## ") for l in new.splitlines()):
            return False, f"new_string adds a '## ' heading to '{rel}'"
        if edit.get("replace_all"):
            text = text.replace(old, new)
        else:
            text = text.replace(old, new, 1)
    return True, ""


def decide(rel: str, rules: list[str], payload: dict | None = None, root: Path | None = None) -> tuple[bool, str]:
    denies = [r[1:] for r in rules if r.startswith("!")]
    sections = [r for r in rules if r.startswith(SECTION_PREFIX)]
    allows = [r for r in rules if not r.startswith("!") and not r.startswith(SECTION_PREFIX)]
    for rule in denies:
        if matches(rel, rule):
            return False, f"'{rel}' matches deny rule '!{rule}'"
    for rule in sections:
        if matches(rel, parse_section_rule(rule)[0]):
            if payload is None or root is None:
                return False, f"'{rel}' needs a section check ('{rule}') but no tool input was given"
            return check_section_edit(payload, root, rel, rule)
    for rule in allows:
        if matches(rel, rule):
            return True, ""
    return False, f"'{rel}' is outside the allowed paths: {', '.join(allows) or '(none)'}"


def project_root(payload: dict) -> Path:
    base = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    return Path(base).resolve()


def relative_target(payload: dict) -> str:
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise ValueError("hook input has no tool_input object")
    raw = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("tool_input has no file_path / notebook_path")
    root = project_root(payload)
    target = Path(raw)
    if not target.is_absolute():
        target = Path(payload.get("cwd") or root) / target
    # resolve() follows symlinks and removes '..', so 'specs/changes/../capabilities' cannot sneak through.
    target = target.resolve()
    try:
        rel = target.relative_to(root)
    except ValueError:
        raise ValueError(f"'{raw}' is outside the project ({root})") from None
    return norm(rel.as_posix())


def main(argv: list[str]) -> int:
    rules = argv[1:]
    try:
        payload = json.loads(sys.stdin.read() or "null")
        if not isinstance(payload, dict):
            raise ValueError("hook input is not a JSON object")
        rel = relative_target(payload)
        ok, reason = decide(rel, rules, payload, project_root(payload))
    except Exception as exc:  # fail closed
        print(f"Blocked by allow_paths.py: {exc}", file=sys.stderr)
        return 2
    if ok:
        return 0
    agent = payload.get("agent_type") or "this agent"
    print(
        f"Blocked by allow_paths.py: {reason}. {agent} may only write to: {' '.join(rules)}. "
        "Do not try another way to write this file; report it to the user instead.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
