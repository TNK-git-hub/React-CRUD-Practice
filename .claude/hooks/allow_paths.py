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


def decide(rel: str, rules: list[str]) -> tuple[bool, str]:
    denies = [r[1:] for r in rules if r.startswith("!")]
    allows = [r for r in rules if not r.startswith("!")]
    for rule in denies:
        if matches(rel, rule):
            return False, f"'{rel}' matches deny rule '!{rule}'"
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
        ok, reason = decide(rel, rules)
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
