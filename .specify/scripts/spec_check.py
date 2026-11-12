#!/usr/bin/env python3
"""CI gate for the spec harness (no LLM, runs in a few seconds).

    python3 .specify/scripts/spec_check.py --change <branch name>

For a change branch (`NNN-<name>`) it fails when:
  1. specs/changes/<change>/ still exists        (change not archived)
  2. specs/archive/<change>/ does not exist      (change not archived)
For every branch it fails when:
  3. specs/capabilities/ still contains ADDED, MODIFIED, REMOVED or RENAMED
  4. a requirement ID appears twice, or an ID from a "Removed IDs" table in history.md is used again
  5. a scenario ID in specs/capabilities/ is not mentioned by any file under tests/

Branches that are not `NNN-<name>` (harness/..., chore/...) only run checks 3–5.
Exit 0 = all checks pass; exit 1 = at least one failure (each printed, also as a GitHub annotation).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

CHANGE_RE = re.compile(r"^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$")
REQ_ID = r"[A-Z]{2,5}-\d{3}"
REQ_HEAD_RE = re.compile(rf"^###\s+({REQ_ID}):")
SCENARIO_RE = re.compile(rf"`({REQ_ID}-S\d+)`")
REMOVED_ROW_RE = re.compile(rf"^\|\s*`?({REQ_ID})`?\s*\|")
DELTA_WORD_RE = re.compile(r"\b(ADDED|MODIFIED|REMOVED|RENAMED)\b")


def default_root() -> Path:
    return Path(__file__).resolve().parents[2]


def strip_comments(text: str) -> str:
    """Drop HTML comments (template samples) but keep line numbers."""
    return re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def check_archived(root: Path, change: str) -> list[str]:
    errors = []
    if (root / "specs/changes" / change).exists():
        errors.append(f"change not archived: specs/changes/{change}/ still exists (run /spec-archive {change})")
    if not (root / "specs/archive" / change).is_dir():
        errors.append(f"change not archived: specs/archive/{change}/ does not exist (run /spec-archive {change})")
    return errors


def check_delta_words(root: Path, files: list[Path]) -> list[str]:
    errors = []
    for f in files:
        for n, line in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
            m = DELTA_WORD_RE.search(line)
            if m:
                errors.append(f"{rel(root, f)}:{n}: delta keyword '{m.group(1)}' left in specs/capabilities/")
    return errors


def collect(root: Path) -> tuple[dict[str, list[str]], dict[str, str], dict[str, str]]:
    """(requirement id -> locations, removed id -> history file, scenario id -> location)."""
    req_locs: dict[str, list[str]] = {}
    removed: dict[str, str] = {}
    scenarios: dict[str, str] = {}
    cap_root = root / "specs/capabilities"
    for spec in sorted(cap_root.glob("*/spec.md")):
        text = strip_comments(spec.read_text(encoding="utf-8"))
        for n, line in enumerate(text.split("\n"), 1):
            m = REQ_HEAD_RE.match(line)
            if m:
                req_locs.setdefault(m.group(1), []).append(f"{rel(root, spec)}:{n}")
            for sid in SCENARIO_RE.findall(line):
                scenarios.setdefault(sid, f"{rel(root, spec)}:{n}")
    for history in sorted(cap_root.glob("*/history.md")):
        in_removed = False
        for line in history.read_text(encoding="utf-8").split("\n"):
            if line.startswith("## "):
                in_removed = line.strip() == "## Removed IDs"
            elif in_removed:
                m = REMOVED_ROW_RE.match(line.strip())
                if m:
                    removed[m.group(1)] = rel(root, history)
    return req_locs, removed, scenarios


def check_ids(req_locs: dict[str, list[str]], removed: dict[str, str]) -> list[str]:
    errors = []
    for rid, locs in sorted(req_locs.items()):
        if len(locs) > 1:
            errors.append(f"requirement {rid} is defined {len(locs)} times: {', '.join(locs)}")
        if rid in removed:
            errors.append(f"requirement {rid} ({locs[0]}) reuses an ID removed in {removed[rid]}")
    return errors


def check_tests(root: Path, scenarios: dict[str, str]) -> list[str]:
    tests_dir = root / "tests"
    corpus = []
    if tests_dir.is_dir():
        for f in sorted(tests_dir.rglob("*")):
            if f.is_file():
                try:
                    corpus.append(f.read_text(encoding="utf-8"))
                except (UnicodeDecodeError, OSError):
                    continue
    text = "\n".join(corpus)
    errors = []
    for sid, loc in sorted(scenarios.items()):
        # PROD-003-S1 must not be satisfied by PROD-003-S10
        if not re.search(rf"(?<![A-Za-z0-9-]){re.escape(sid)}(?!\d)", text):
            errors.append(f"scenario {sid} ({loc}) has no test: no file under tests/ mentions it")
    return errors


def run(root: Path, change: str) -> list[str]:
    errors: list[str] = []
    is_change = bool(CHANGE_RE.match(change))
    if is_change:
        errors += check_archived(root, change)
    cap_files = sorted((root / "specs/capabilities").glob("**/*.md"))
    errors += check_delta_words(root, cap_files)
    req_locs, removed, scenarios = collect(root)
    errors += check_ids(req_locs, removed)
    errors += check_tests(root, scenarios)
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="spec harness CI gate")
    parser.add_argument("--change", required=True, help="branch name, e.g. 001-product-bulk-delete")
    parser.add_argument("--root", type=Path, default=None, help="repo root (default: auto)")
    args = parser.parse_args(argv)
    root = (args.root or default_root()).resolve()
    change = args.change.strip()

    mode = "change" if CHANGE_RE.match(change) else "non-change branch (checks 3-5 only)"
    print(f"spec_check: {change} — {mode}")
    errors = run(root, change)
    github = os.environ.get("GITHUB_ACTIONS") == "true"
    for e in errors:
        print(f"::error title=spec-check::{e}" if github else f"FAIL {e}")
    if errors:
        print(f"spec_check: {len(errors)} problem(s)")
        return 1
    print("spec_check: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
