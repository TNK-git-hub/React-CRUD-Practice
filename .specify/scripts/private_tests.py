#!/usr/bin/env python3
"""Find and quarantine hidden (private) tests made stale by a change. Human-only: run it in your own terminal.

    python3 .specify/scripts/private_tests.py stale      --change NNN-<name>
    python3 .specify/scripts/private_tests.py quarantine --change NNN-<name> --kind removed|modified|all
    python3 .specify/scripts/private_tests.py restore    --change NNN-<name>

Every command refuses when stdin or stdout is not a terminal (an agent has none; guard.mjs also blocks any Bash
command naming this script), like approval.py approve. quarantine and restore ask "Proceed? [y/N]", only "y" acts.
Output is paths, IDs, states and counts only: the content of a hidden test is never printed.

Where: the hidden test folders are areas.testPrivate of .claude/harness.json; their `_stale/` folder is skipped.
Which change: the MODIFIED / REMOVED requirement IDs of specs/changes/<change>/spec.md (or specs/archive/<change>/
once archived), read with the heading parser of spec_check.py (`#### MODIFIED <ID>` / `#### REMOVED <ID>`; RENAMED and
MOVED keep the behaviour, so they do not count).
A test file -> the requirements of the scenario IDs in its describe / it / test names (the regex of run.sh's
scenario_gate, harness_config.SCENARIO_TEST_CALL) plus the REQ-ID of its name (`<REQ-ID>[-n].test.ts(x)`). State:
  unaffected  none of them is MODIFIED or REMOVED by the change
  mixed       it touches a MODIFIED / REMOVED requirement AND holds scenarios of more than one requirement
  removed     its only requirement is REMOVED
  modified    its only requirement is MODIFIED
quarantine MOVES (never deletes) the files of the chosen kind (all = removed + modified + mixed) to
<private folder>/_stale/<change>/<path inside the folder> and appends a line to _stale/<change>/MANIFEST.txt
(original path, state, requirement IDs, time). restore moves them back from the MANIFEST and never overwrites a file.
Exit codes: 0 ok; 1 error (no such change, a conflict) or not confirmed; 2 no terminal.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config  # noqa: E402  (the hidden test folders, the test-file pattern, the test-call regex)
import spec_check  # noqa: E402  (the delta heading parser)

STALE_DIR = "_stale"
MANIFEST = "MANIFEST.txt"
SCENARIO_IN_NAME_RE = re.compile(harness_config.SCENARIO_TEST_CALL + rf"(?P<sid>{spec_check.REQ_ID}-S\d+)(?![0-9])")
FILE_REQ_RE = re.compile(rf"^(?P<req>{spec_check.REQ_ID})(-\d+)?\.")
KINDS = {"removed": ("removed",), "modified": ("modified",), "all": ("removed", "modified", "mixed")}


class PrivateTestsError(Exception):
    """A problem the user must see (no such change, bad config, a conflict)."""


@dataclass
class Entry:
    path: str  # relative to the repo root
    state: str  # removed | modified | mixed | unaffected
    reqs: list[str]  # requirement IDs of the file, sorted
    private_root: str  # the hidden test folder it lives in (relative to the repo root)


def default_root() -> Path:
    return Path(__file__).resolve().parents[2]


def delta_spec(root: Path, change: str) -> Path:
    if not spec_check.CHANGE_RE.match(change):
        raise PrivateTestsError(f"invalid change '{change}' (NNN-<name>)")
    for folder in ("specs/changes", "specs/archive"):
        p = root / folder / change / "spec.md"
        if p.is_file():
            return p
    raise PrivateTestsError(f"change {change} not found (no specs/changes/{change}/spec.md nor specs/archive/{change}/spec.md)")


def delta_ids(root: Path, change: str) -> dict[str, set[str]]:
    """MODIFIED and REMOVED requirement IDs of the change (code samples and HTML comments ignored, as spec_check does)."""
    text = delta_spec(root, change).read_text(encoding="utf-8")
    out: dict[str, set[str]] = {"MODIFIED": set(), "REMOVED": set()}
    for line in spec_check.strip_fences(spec_check.strip_comments(text).split("\n")):
        m = spec_check.DELTA_HEAD_RE.match(line)
        if m and m.group(1) in out:
            out[m.group(1)].add(m.group(2))
    return out


def config(root: Path) -> dict:
    try:
        return harness_config.load(root)
    except harness_config.ConfigError as e:
        raise PrivateTestsError(str(e)) from e


def private_roots(root: Path) -> list[str]:
    return harness_config.get(config(root), "areas.testPrivate")


def test_files(root: Path) -> list[tuple[str, Path]]:
    """(hidden test folder, file) of every test file, `_stale/` skipped."""
    test_file = re.compile(config(root)["testFile"])
    out = []
    for proot in private_roots(root):
        base = root / proot
        if not base.is_dir():
            continue
        for f in sorted(base.rglob("*")):
            rel = f.relative_to(base)
            if rel.parts and rel.parts[0] == STALE_DIR:
                continue
            if f.is_file() and test_file.search(f.name):
                out.append((proot, f))
    return out


def file_reqs(f: Path) -> set[str]:
    reqs = {re.sub(r"-S\d+$", "", m.group("sid")) for m in SCENARIO_IN_NAME_RE.finditer(f.read_text(encoding="utf-8", errors="replace"))}
    m = FILE_REQ_RE.match(f.name)
    if m:
        reqs.add(m.group("req"))
    return reqs


def classify(root: Path, change: str) -> list[Entry]:
    ids = delta_ids(root, change)
    changed = ids["MODIFIED"] | ids["REMOVED"]
    entries = []
    for proot, f in test_files(root):
        reqs = file_reqs(f)
        if not reqs & changed:
            state = "unaffected"
        elif len(reqs) > 1:
            state = "mixed"
        elif reqs <= ids["REMOVED"]:
            state = "removed"
        else:
            state = "modified"
        entries.append(Entry(f.relative_to(root).as_posix(), state, sorted(reqs), proot))
    return entries


def related_count(root: Path, change: str) -> int:
    """Number of hidden test files a MODIFIED / REMOVED requirement of the change makes stale (approval.py's reminder)."""
    return sum(1 for e in classify(root, change) if e.state != "unaffected")


def stale_path(root: Path, e: Entry, change: str) -> Path:
    inside = Path(e.path).relative_to(e.private_root)
    return root / e.private_root / STALE_DIR / change / inside


def quarantine(root: Path, change: str, kind: str, now: str | None = None) -> list[Entry]:
    """Move the files of `kind` to _stale/<change>/ and append them to its MANIFEST. Returns the moved entries."""
    picked = [e for e in classify(root, change) if e.state in KINDS[kind]]
    for e in picked:
        if stale_path(root, e, change).exists():
            raise PrivateTestsError(f"{stale_path(root, e, change).relative_to(root).as_posix()} already exists: restore first")
    when = now or datetime.now(timezone.utc).isoformat(timespec="seconds")
    for e in picked:
        dst = stale_path(root, e, change)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(root / e.path), str(dst))
        manifest = root / e.private_root / STALE_DIR / change / MANIFEST
        new = not manifest.exists()
        with manifest.open("a", encoding="utf-8") as fh:
            if new:
                fh.write(f"# private_tests.py quarantine of change {change}: path<TAB>state<TAB>requirements<TAB>time (UTC)\n")
            fh.write(f"{e.path}\t{e.state}\t{','.join(e.reqs)}\t{when}\n")
    return picked


def manifest_entries(root: Path, change: str) -> list[tuple[str, Path, Path, str]]:
    """(hidden test folder, original path, quarantined path, state) of every MANIFEST line of the change."""
    out = []
    for proot in private_roots(root):
        manifest = root / proot / STALE_DIR / change / MANIFEST
        if not manifest.is_file():
            continue
        for line in manifest.read_text(encoding="utf-8").split("\n"):
            if not line.strip() or line.startswith("#"):
                continue
            original, state = line.split("\t")[:2]
            if ".." in Path(original).parts or not original.startswith(proot + "/"):
                raise PrivateTestsError(f"{manifest.relative_to(root).as_posix()}: bad path '{original}'")
            inside = Path(original).relative_to(proot)
            out.append((proot, root / original, root / proot / STALE_DIR / change / inside, state))
    return out


def restore(root: Path, change: str) -> list[str]:
    """Move every quarantined file of the change back. Nothing moves if one target already exists."""
    items = manifest_entries(root, change)
    if not items:
        raise PrivateTestsError(f"nothing quarantined for change {change}")
    for _, original, quarantined, _ in items:
        if original.exists():
            raise PrivateTestsError(f"{original.relative_to(root).as_posix()} already exists: not overwriting it, nothing was restored")
        if not quarantined.is_file():
            raise PrivateTestsError(f"{quarantined.relative_to(root).as_posix()} is missing, nothing was restored")
    for _, original, quarantined, _ in items:
        original.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(quarantined), str(original))
    for proot in {p for p, *_ in items}:
        folder = root / proot / STALE_DIR / change
        (folder / MANIFEST).unlink(missing_ok=True)
        for d in sorted((p for p in folder.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True) + [folder, folder.parent]:
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()
    return [o.relative_to(root).as_posix() for _, o, _, _ in items]


def print_table(entries: list[Entry]) -> None:
    for e in entries:
        print(f"  {e.state:<11} {e.path}  [{', '.join(e.reqs) or '-'}]")
    counts = {s: sum(1 for e in entries if e.state == s) for s in ("removed", "modified", "mixed", "unaffected")}
    print("  " + ", ".join(f"{n} {s}" for s, n in counts.items()) + f" ({len(entries)} file(s))")


def confirm() -> bool:
    try:
        return input("Proceed? [y/N] ").strip().lower() == "y"
    except EOFError:
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="hidden tests made stale by a change (human-only)")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("stale", "quarantine", "restore"):
        p = sub.add_parser(name)
        p.add_argument("--change", required=True)
        p.add_argument("--root", type=Path, default=None)
        if name == "quarantine":
            p.add_argument("--kind", choices=tuple(KINDS), required=True)
    args = parser.parse_args(argv)
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print("private_tests.py: refused, stdin and stdout must be a terminal. Only the user runs this, in their own "
              "terminal.", file=sys.stderr)
        return 2
    root = (args.root or default_root()).resolve()
    try:
        if args.command == "stale":
            ids = delta_ids(root, args.change)
            print(f"Change {args.change}: MODIFIED {sorted(ids['MODIFIED']) or '-'}, REMOVED {sorted(ids['REMOVED']) or '-'}")
            print_table(classify(root, args.change))
            return 0
        if args.command == "quarantine":
            picked = [e for e in classify(root, args.change) if e.state in KINDS[args.kind]]
            if not picked:
                print(f"No hidden test of kind '{args.kind}' for change {args.change}.")
                return 0
            print(f"To move into <hidden test folder>/{STALE_DIR}/{args.change}/ (kind {args.kind}):")
            print_table(picked)
            if not confirm():
                print("Nothing moved.")
                return 1
            moved = quarantine(root, args.change, args.kind)
            print(f"Moved {len(moved)} file(s); MANIFEST: <hidden test folder>/{STALE_DIR}/{args.change}/{MANIFEST}")
            return 0
        items = manifest_entries(root, args.change)
        if not items:
            raise PrivateTestsError(f"nothing quarantined for change {args.change}")
        print(f"To move back ({len(items)} file(s)):")
        for _, original, _, state in items:
            print(f"  {state:<11} {original.relative_to(root).as_posix()}")
        if not confirm():
            print("Nothing moved.")
            return 1
        restored = restore(root, args.change)
        print(f"Restored {len(restored)} file(s).")
        return 0
    except PrivateTestsError as e:
        print(f"private_tests.py: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
