#!/usr/bin/env python3
"""Human-only approvals of the spec harness and the bug flow, locked with sha256.

    python3 .specify/scripts/approval.py approve --change NNN-<name> --gate spec|plan
    python3 .specify/scripts/approval.py approve --bug <id> --gate root-cause --summary "<one line>"
    python3 .specify/scripts/approval.py verify  --change NNN-<name> [--gate spec|plan]   (default: every gate recorded)
    python3 .specify/scripts/approval.py verify  --bug <id>

approve runs only in the user's own terminal: it refuses when stdin or stdout is not a TTY (an agent has none), shows
the gate, the files, the hash and a summary, and writes only after the answer "y" (no flag skips the question).
It records the gate in <folder>/approval.json ({sha256, files, at, by} per gate, + summary for root-cause) and keeps a
normalized copy of what was approved in <folder>/.approved/<gate>/, so that verify can print a diff.
<folder> = specs/changes/<change>/ or bugs/<id>/. Commit approval.json and .approved/ with the change.

What each gate hashes (CRLF read as LF):
  spec        spec.md without the frontmatter `status:` line and without the lines between `## Architecture
              Decisions` and `## Clarifications` (the planner fills those after the spec is approved).
              approve also sets `status: approved` in the frontmatter (the status line is not hashed).
  plan        spec.md (only the `status:` line dropped) + plan.md + tasks.md, in this order, each after a
              "=== <file> ===" line. Approving it needs a gate spec that still matches.
  root-cause  bugs/<id>/report.md + the "Root cause" section of investigation.md (from that heading, named as in
              .claude/skills/bug-fix-flow/templates/investigation.md, up to the next heading of the same or a higher level).

verify: exit 0 when every gate asked for exists and matches; exit 1 with the reason (missing gate / changed) and a
unified diff against the copy in .approved/. spec_check.py --stage spec uses check_gate() for open changes.
Exit codes: 0 ok; 1 not approved, changed, refused or bad input; 2 approve without a TTY.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

CHANGE_RE = re.compile(r"^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$")
BUG_RE = re.compile(r"^\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$")
CHANGE_GATES = ("spec", "plan")
BUG_GATES = ("root-cause",)
APPROVAL_FILE = "approval.json"
COPIES_DIR = ".approved"
TEMPLATE = ".claude/skills/bug-fix-flow/templates/investigation.md"
ROOT_CAUSE_TITLE = "Root cause"
PLAN_START = "## Architecture Decisions"
PLAN_END = "## Clarifications"
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
REQ_HEAD_RE = re.compile(r"^####\s+(ADDED|MODIFIED|REMOVED|RENAMED|MOVED)\s+[A-Z]{2,5}-\d{3}\b")
SCENARIO_RE = re.compile(r"^\s*- `[A-Z]{2,5}-\d{3}-S\d+`")
TASK_RE = re.compile(r"^\s*- \[[ xX]\] T\d+")


class ApprovalError(Exception):
    """Input the gate cannot be computed from (missing file, missing heading, bad id)."""


def default_root() -> Path:
    return Path(__file__).resolve().parents[2]


def read(path: Path) -> str:
    if not path.is_file():
        raise ApprovalError(f"{path} not found")
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def frontmatter_end(lines: list[str]) -> int:
    """Index of the closing '---' of the frontmatter, or -1 when there is none."""
    if not lines or lines[0] != "---":
        return -1
    for i in range(1, len(lines)):
        if lines[i] == "---":
            return i
    return -1


def normalize_spec(text: str, drop_plan_sections: bool = True) -> str:
    """spec.md as hashed: no frontmatter `status:` line; with drop_plan_sections, no lines between the
    '## Architecture Decisions' and '## Clarifications' lines (both heading lines are kept)."""
    lines = text.split("\n")
    end = frontmatter_end(lines)
    keep = [line for i, line in enumerate(lines) if not (0 < i < end and re.match(r"^status:", line))]
    if not drop_plan_sections:
        return "\n".join(keep)
    stripped = [line.rstrip() for line in keep]
    if PLAN_START not in stripped or PLAN_END not in stripped:
        raise ApprovalError(f"spec.md needs the lines '{PLAN_START}' and '{PLAN_END}'")
    start, stop = stripped.index(PLAN_START), stripped.index(PLAN_END)
    if stop < start:
        raise ApprovalError(f"'{PLAN_END}' comes before '{PLAN_START}' in spec.md")
    return "\n".join(keep[: start + 1] + keep[stop:])


def set_status_approved(text: str) -> str:
    lines = text.split("\n")
    end = frontmatter_end(lines)
    if end == -1:
        raise ApprovalError("spec.md has no frontmatter")
    for i in range(1, end):
        if re.match(r"^status:", lines[i]):
            lines[i] = re.sub(r"^(status:\s*)\S*", r"\1approved", lines[i], count=1)
            return "\n".join(lines)
    return "\n".join(lines[:end] + ["status: approved"] + lines[end:])


def headings(text: str) -> list[tuple[int, int, str]]:
    """(line index, level, title) of every markdown heading outside fenced code blocks."""
    out, fenced = [], False
    for i, line in enumerate(text.split("\n")):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        m = None if fenced else HEADING_RE.match(line)
        if m:
            out.append((i, len(m.group(1)), m.group(2)))
    return out


def root_cause_section(root: Path, investigation: str) -> str:
    """The 'Root cause' section of investigation.md, its heading level taken from the template."""
    template = root / TEMPLATE
    levels = [lvl for _, lvl, title in headings(read(template)) if title == ROOT_CAUSE_TITLE]
    if not levels:
        raise ApprovalError(f"{TEMPLATE} has no '{ROOT_CAUSE_TITLE}' heading")
    level = levels[0]
    heads = headings(investigation)
    starts = [i for i, lvl, title in heads if lvl == level and title == ROOT_CAUSE_TITLE]
    if not starts:
        raise ApprovalError(f"investigation.md has no '{'#' * level} {ROOT_CAUSE_TITLE}' heading")
    start = starts[0]
    stop = next((i for i, lvl, _ in heads if i > start and lvl <= level), None)
    lines = investigation.split("\n")
    return "\n".join(lines[start:stop]).rstrip("\n")


def folder_of(root: Path, change: str | None, bug: str | None) -> Path:
    if change is not None:
        if not CHANGE_RE.match(change):
            raise ApprovalError(f"invalid change '{change}' (NNN-<name>)")
        folder = root / "specs/changes" / change
    else:
        if not bug or not BUG_RE.match(bug):
            raise ApprovalError(f"invalid bug id '{bug}' (<YYYYMMDD>-<slug>)")
        folder = root / "bugs" / bug
    if not folder.is_dir():
        raise ApprovalError(f"{folder.relative_to(root)}/ not found")
    return folder


def materials(root: Path, folder: Path, gate: str) -> list[tuple[str, str]]:
    """(label, normalized content) of everything the gate hashes, in a fixed order."""
    rel = folder.relative_to(root).as_posix()
    if gate == "spec":
        return [(f"{rel}/spec.md", normalize_spec(read(folder / "spec.md")))]
    if gate == "plan":
        return [
            (f"{rel}/spec.md", normalize_spec(read(folder / "spec.md"), drop_plan_sections=False)),
            (f"{rel}/plan.md", read(folder / "plan.md")),
            (f"{rel}/tasks.md", read(folder / "tasks.md")),
        ]
    if gate == "root-cause":
        return [
            (f"{rel}/report.md", read(folder / "report.md")),
            (f"{rel}/investigation.md#{ROOT_CAUSE_TITLE}", root_cause_section(root, read(folder / "investigation.md"))),
        ]
    raise ApprovalError(f"unknown gate '{gate}'")


def digest(mats: list[tuple[str, str]]) -> str:
    h = hashlib.sha256()
    for label, content in mats:
        h.update(f"=== {label} ===\n".encode("utf-8"))
        h.update(content.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def copy_name(label: str) -> str:
    """File name of the approved copy: 'spec.md', 'investigation.md#Root cause' -> 'investigation.root-cause.md'."""
    name = label.rsplit("/", 1)[-1]
    if "#" in name:
        base, section = name.split("#", 1)
        name = f"{Path(base).stem}.{section.lower().replace(' ', '-')}.md"
    return name


def load(folder: Path) -> dict:
    path = folder / APPROVAL_FILE
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ApprovalError(f"{path.name} is not valid JSON: {e}") from e
    return data if isinstance(data, dict) else {}


def check_gate(root: Path, folder: Path, gate: str) -> tuple[bool, str, str]:
    """(ok, reason, unified diff against the approved copy). Used by verify and by spec_check.py."""
    try:
        data = load(folder)
        if gate not in data:
            return False, f"gate {gate} is not approved", ""
        mats = materials(root, folder, gate)
    except ApprovalError as e:
        return False, f"gate {gate}: {e}", ""
    if digest(mats) == data[gate].get("sha256"):
        return True, f"gate {gate} matches (sha256 {data[gate]['sha256'][:12]}…)", ""
    diffs = []
    for label, content in mats:
        copy = folder / COPIES_DIR / gate / copy_name(label)
        if not copy.is_file():
            diffs.append(f"(no approved copy of {label} to diff against)\n")
            continue
        diffs += difflib.unified_diff(
            copy.read_text(encoding="utf-8").split("\n"), content.split("\n"),
            fromfile=f"approved: {label}", tofile=f"now: {label}", lineterm="",
        )
    return False, f"gate {gate} changed since approval", "\n".join(diffs)


def summary_of(gate: str, mats: list[tuple[str, str]], summary: str | None) -> str:
    if gate == "spec":
        lines = mats[0][1].split("\n")
        reqs = sum(1 for line in lines if REQ_HEAD_RE.match(line))
        scen = sum(1 for line in lines if SCENARIO_RE.match(line))
        return f"{reqs} requirement(s), {scen} scenario(s)"
    if gate == "plan":
        tasks = sum(1 for line in mats[2][1].split("\n") if TASK_RE.match(line))
        return f"{tasks} task(s)"
    return summary or ""


def approve(root: Path, change: str | None, bug: str | None, gate: str, summary: str | None) -> int:
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print("approval.py approve: refused, stdin and stdout must be a terminal. Only the user runs this, "
              "in their own terminal.", file=sys.stderr)
        return 2
    folder = folder_of(root, change, bug)
    if gate == "plan":
        ok, reason, diff = check_gate(root, folder, "spec")
        if not ok:
            print(f"approval.py approve: refused, {reason}.")
            if diff:
                print(diff)
            print(f"Run first: python3 .specify/scripts/approval.py approve --change {change} --gate spec")
            return 1
    mats = materials(root, folder, gate)
    sha = digest(mats)
    print(f"Gate:    {gate}")
    print("Files:")
    for label, _ in mats:
        print(f"  {label}")
    print(f"sha256:  {sha}")
    print(f"Summary: {summary_of(gate, mats, summary)}")
    try:
        answer = input("Approve? [y/N] ")
    except EOFError:
        answer = ""
    if answer.strip().lower() != "y":
        print("Not approved; nothing written.")
        return 1
    if gate == "spec":
        spec = folder / "spec.md"
        spec.write_text(set_status_approved(read(spec)), encoding="utf-8")
    entry = {
        "sha256": sha,
        "files": [label for label, _ in mats],
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "by": "terminal",
    }
    if gate == "root-cause":
        entry["summary"] = summary
    data = load(folder)
    data[gate] = entry
    (folder / APPROVAL_FILE).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    copies = folder / COPIES_DIR / gate
    shutil.rmtree(copies, ignore_errors=True)
    copies.mkdir(parents=True)
    for label, content in mats:
        (copies / copy_name(label)).write_text(content, encoding="utf-8")
    print(f"Approved gate {gate} ({sha[:12]}…). Commit {APPROVAL_FILE} and {COPIES_DIR}/ with the change.")
    return 0


def verify(root: Path, change: str | None, bug: str | None, gate: str | None) -> int:
    folder = folder_of(root, change, bug)
    if gate:
        gates = [gate]
    elif bug is not None:
        gates = list(BUG_GATES)
    else:
        gates = [g for g in CHANGE_GATES if g in load(folder)]
        if not gates:
            print(f"FAIL {folder.relative_to(root).as_posix()}: no gate approved yet")
            return 1
    failed = 0
    for g in gates:
        ok, reason, diff = check_gate(root, folder, g)
        print(f"{'OK  ' if ok else 'FAIL'} {folder.relative_to(root).as_posix()}: {reason}")
        if diff:
            print(diff)
        failed += not ok
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="human-only approvals locked with sha256")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("approve", "verify"):
        p = sub.add_parser(name)
        who = p.add_mutually_exclusive_group(required=True)
        who.add_argument("--change", help="change folder in specs/changes/, e.g. 001-product-bulk-delete")
        who.add_argument("--bug", help="bug folder in bugs/, e.g. 20261125-price-filter-ignores-max")
        p.add_argument("--gate", choices=CHANGE_GATES + BUG_GATES, required=name == "approve")
        p.add_argument("--root", type=Path, default=None, help="repo root (default: auto)")
        if name == "approve":
            p.add_argument("--summary", help="one line, required for --gate root-cause")
    args = parser.parse_args(argv)
    root = (args.root or default_root()).resolve()
    allowed = BUG_GATES if args.bug is not None else CHANGE_GATES
    if args.gate and args.gate not in allowed:
        print(f"approval.py: --gate {args.gate} does not apply to --{'bug' if args.bug else 'change'}", file=sys.stderr)
        return 1
    try:
        if args.command == "approve":
            summary = (args.summary or "").strip()
            if args.gate == "root-cause" and (not summary or "\n" in summary):
                print("approval.py: --gate root-cause needs --summary \"<one line>\"", file=sys.stderr)
                return 1
            return approve(root, args.change, args.bug, args.gate, summary or None)
        return verify(root, args.change, args.bug, args.gate)
    except ApprovalError as e:
        print(f"approval.py: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
