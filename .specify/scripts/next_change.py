#!/usr/bin/env python3
"""Print the next change number for this spec harness.

The core Spec Kit scripts only scan `specs/` directly, so they never see changes that
live in `specs/changes/` (in progress) or `specs/archive/` (merged). This script scans
both and prints the next 3-digit number.

Usage:
    python .specify/scripts/next_change.py                    # -> 006
    python .specify/scripts/next_change.py --name bulk-delete # -> 006-bulk-delete
    python .specify/scripts/next_change.py --name bulk-delete --json
        # -> {"FEATURE_NUM": "006", "CHANGE_NAME": "006-bulk-delete",
        #     "FEATURE_DIR": "specs/changes/006-bulk-delete"}

Exit codes: 0 ok, 1 invalid input or no number left.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CHANGE_DIR_RE = re.compile(r"^(\d{3})-")
SHORT_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SCANNED = ("specs/changes", "specs/archive")
MAX_NUMBER = 999


def default_root() -> Path:
    # .specify/scripts/next_change.py -> repo root is two levels above .specify/
    return Path(__file__).resolve().parents[2]


def used_numbers(root: Path) -> set[int]:
    numbers: set[int] = set()
    for rel in SCANNED:
        base = root / rel
        if not base.is_dir():
            continue
        for entry in base.iterdir():
            match = CHANGE_DIR_RE.match(entry.name)
            if entry.is_dir() and match:
                numbers.add(int(match.group(1)))
    return numbers


def next_number(root: Path) -> int:
    numbers = used_numbers(root)
    return max(numbers, default=0) + 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--name", help="kebab-case short name, e.g. product-bulk-delete")
    parser.add_argument("--json", action="store_true", help="print JSON instead of plain text")
    parser.add_argument("--root", type=Path, default=None, help="repo root (default: auto)")
    args = parser.parse_args(argv)

    root = (args.root or default_root()).resolve()
    number = next_number(root)
    if number > MAX_NUMBER:
        print(f"ERROR: change numbers exhausted (> {MAX_NUMBER:03d})", file=sys.stderr)
        return 1

    num = f"{number:03d}"
    if args.name is None:
        print(json.dumps({"FEATURE_NUM": num}) if args.json else num)
        return 0

    if not SHORT_NAME_RE.match(args.name):
        print(
            f"ERROR: --name must be kebab-case [a-z0-9-], got {args.name!r}",
            file=sys.stderr,
        )
        return 1

    change = f"{num}-{args.name}"
    if args.json:
        print(json.dumps({
            "FEATURE_NUM": num,
            "CHANGE_NAME": change,
            "FEATURE_DIR": f"specs/changes/{change}",
        }))
    else:
        print(change)
    return 0


if __name__ == "__main__":
    sys.exit(main())
