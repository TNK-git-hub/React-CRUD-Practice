#!/usr/bin/env python3
"""CI gate for the spec harness (no LLM, runs in a few seconds).

    python3 .specify/scripts/spec_check.py --change <branch name> [--stage spec|archive]

--stage spec (default) — the SPEC harness gate (handoff, CI):
  1. every open change (specs/changes/*/spec.md) has the structure of the rich delta template:
     frontmatter, all sections in order, requirement headings, nested scenarios `<ID>` (type, Pn) with
     Given / When / Then, NFR table with Change Applies / ADDED / MODIFIED
  2. IDs are unique: requirement IDs in specs/capabilities/, removed IDs never reused, ADDED requirement and
     NFR IDs not already in use (nor added by two open changes), scenario IDs unique, NFR IDs in nfr.md unique
  3. no "(unassigned)" left in an open change
  4. every scenario of an open change, and every NFR row, is listed in its "## Traceability"
  5. no delta keyword (ADDED, MODIFIED, REMOVED, RENAMED) in specs/capabilities/ or specs/_system/nfr.md
--stage archive — after /spec-archive (CODE + TEST harnesses done): all of the above, plus
  6. for a change branch (`NNN-<name>`): specs/changes/<change>/ is gone and specs/archive/<change>/ exists
  7. every scenario ID in specs/capabilities/ is mentioned by some file under tests/

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
DELTA_HEAD_RE = re.compile(rf"^####\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+({REQ_ID})\b")
SCENARIO_HEAD_RE = re.compile(rf"^- `({REQ_ID})-S(\d+)` \(([a-z]+), (P[123])\)\s*$")
NFR_ID_RE = re.compile(r"^NFR-\d{3}$")
TRACE_TOKEN_RE = re.compile(rf"(?<![A-Za-z0-9])(?:({REQ_ID})-)?S(\d+)(?:\s*[–-]\s*(?:{REQ_ID}-)?S(\d+))?")
UNASSIGNED_RE = re.compile(r"\(unassigned\)", re.I)
NFR_CHANGES = ("Applies", "ADDED", "MODIFIED")
SECTIONS = (
    "Overview", "Success Criteria", "Scope", "Requirements", "Non-Functional Requirements",
    "Edge Cases & Error Handling", "Architecture Decisions", "Data Model", "Clarifications", "Assumptions",
    "Open Questions", "Traceability",
)
STAGES = ("spec", "archive")


def default_root() -> Path:
    return Path(__file__).resolve().parents[2]


def strip_comments(text: str) -> str:
    """Drop HTML comments (template samples) but keep line numbers."""
    return re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def strip_fences(lines: list[str]) -> list[str]:
    """Blank out fenced code blocks (JSON samples) but keep line numbers."""
    out, fence = [], False
    for line in lines:
        if line.strip().startswith("```"):
            fence = not fence
            out.append("")
        else:
            out.append("" if fence else line)
    return out


def rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def split_row(line: str) -> list[str]:
    inner = line.strip().strip("|")
    return [c.strip() for c in re.split(r"(?<!\\)\|", inner)]


def sections(lines: list[str]) -> dict[str, tuple[int, int]]:
    """'## name' -> (first body line index, end index exclusive)."""
    heads = [(i, l[3:].strip()) for i, l in enumerate(lines) if l.startswith("## ")]
    out: dict[str, tuple[int, int]] = {}
    for n, (i, name) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        out.setdefault(name, (i + 1, end))
    return out


def table(lines: list[str], start: int, end: int) -> tuple[list[str], list[tuple[int, list[str]]]]:
    """Header and data rows of the first table between start and end."""
    header: list[str] = []
    rows: list[tuple[int, list[str]]] = []
    for i in range(start, end):
        line = lines[i]
        if not line.lstrip().startswith("|"):
            if header and line.strip():
                break
            continue
        if not header:
            header = split_row(line)
        elif not re.fullmatch(r"[\s|:-]+", line):
            rows.append((i, split_row(line)))
    return header, rows


# --------------------------------------------------------------------------- capabilities / nfr.md


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
                errors.append(f"{rel(root, f)}:{n}: delta keyword '{m.group(1)}' left in {rel(root, f.parent)}/")
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


def collect_nfr(root: Path) -> tuple[dict[str, list[str]], dict[str, str]]:
    """(NFR id -> locations in nfr.md, NFR id -> section) from every table whose first column is an NFR ID."""
    path = root / "specs/_system/nfr.md"
    locs: dict[str, list[str]] = {}
    where: dict[str, str] = {}
    if not path.is_file():
        return locs, where
    section = ""
    for n, line in enumerate(strip_comments(path.read_text(encoding="utf-8")).split("\n"), 1):
        if line.startswith("## "):
            section = line[3:].strip()
        elif line.lstrip().startswith("|"):
            first = split_row(line)[0].strip("`")
            if NFR_ID_RE.match(first):
                locs.setdefault(first, []).append(f"specs/_system/nfr.md:{n}")
                where.setdefault(first, section)
    return locs, where


def check_ids(req_locs: dict[str, list[str]], removed: dict[str, str], nfr_locs: dict[str, list[str]]) -> list[str]:
    errors = []
    for rid, locs in sorted(req_locs.items()):
        if len(locs) > 1:
            errors.append(f"requirement {rid} is defined {len(locs)} times: {', '.join(locs)}")
        if rid in removed:
            errors.append(f"requirement {rid} ({locs[0]}) reuses an ID removed in {removed[rid]}")
    for nid, locs in sorted(nfr_locs.items()):
        if len(locs) > 1:
            errors.append(f"{nid} is defined {len(locs)} times: {', '.join(locs)}")
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


# --------------------------------------------------------------------------- open changes


def scenario_types(root: Path) -> set[str]:
    """Backticked words of the catalog's "Scenario types" paragraph (empty set: no catalog, no type check)."""
    catalog = root / "specs/_system/edge-case-catalog.md"
    if not catalog.is_file():
        return set()
    words: set[str] = set()
    inside = False
    for line in catalog.read_text(encoding="utf-8").split("\n"):
        if line.startswith("### Scenario types"):
            inside = True
            continue
        if inside:
            if line.startswith("#") or line.startswith("Example"):
                break
            words |= set(re.findall(r"`([a-z]+)`", line))
    return words


class ChangeSpec:
    def __init__(self, root: Path, path: Path) -> None:
        self.root, self.path = root, path
        self.name = path.parent.name
        self.loc = rel(root, path)
        raw = path.read_text(encoding="utf-8")
        self.meta: dict[str, str] = {}
        body = raw
        if raw.startswith("---\n"):
            end = raw.find("\n---", 4)
            if end != -1:
                for line in raw[4:end].split("\n"):
                    m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
                    if m:
                        self.meta[m.group(1)] = re.sub(r"\s+#.*$", "", m.group(2)).strip()
                body = "\n" * raw[: end + 4].count("\n") + raw[end + 4 :]
        self.offset = 0
        self.lines = strip_fences(strip_comments(body).split("\n"))
        self.sections = sections(self.lines)
        self.added: list[str] = []  # ADDED requirement IDs
        self.scenarios: dict[str, int] = {}  # scenario ID -> line
        self.nfr_rows: list[tuple[int, dict[str, str]]] = []

    def at(self, i: int) -> str:
        return f"{self.loc}:{i + 1}"


def check_change(ch: ChangeSpec, types: set[str]) -> list[str]:
    errors: list[str] = []
    meta = ch.meta
    if meta.get("kind", "").strip("\"'") != "delta":
        return [f"{ch.loc}: frontmatter 'kind: delta' is missing"]
    if meta.get("change", "").strip("\"'") != ch.name:
        errors.append(f"{ch.loc}: frontmatter change must be '{ch.name}'")
    caps = [c.strip().strip("\"'") for c in meta.get("capabilities", "").strip("[]").split(",") if c.strip()]
    if not caps:
        errors.append(f"{ch.loc}: frontmatter 'capabilities' is empty")
    if meta.get("primary", "").strip("\"'") not in caps:
        errors.append(f"{ch.loc}: frontmatter 'primary' must be one of capabilities")
    for key in ("status", "source"):
        if key not in meta:
            errors.append(f"{ch.loc}: frontmatter '{key}' is missing")

    # sections, in template order
    present = [l[3:].strip() for l in ch.lines if l.startswith("## ")]
    missing = [s for s in SECTIONS if s not in present]
    for s in missing:
        errors.append(f"{ch.loc}: section '## {s}' is missing")
    order = [s for s in present if s in SECTIONS]
    if not missing and order != list(SECTIONS):
        errors.append(f"{ch.loc}: sections are not in template order ({', '.join(order)})")

    # requirements
    if "Requirements" in ch.sections:
        start, end = ch.sections["Requirements"]
        domains: list[str] = []
        current: tuple[str, str] | None = None  # (op, req id)
        scenario: tuple[str, int, list[str]] | None = None

        def close_scenario() -> None:
            if scenario is not None:
                sid, line, parts = scenario
                text = "\n".join(parts)
                for word in ("**Given**", "**When**", "**Then**"):
                    if word not in text:
                        errors.append(f"{ch.at(line)}: scenario {sid} has no {word}")

        has_scenario: dict[str, bool] = {}
        for i in range(start, end):
            line = ch.lines[i]
            if line.startswith("### "):
                close_scenario()
                scenario, current = None, None
                domains.append(line[4:].strip())
                continue
            if line.startswith("#### "):
                close_scenario()
                scenario = None
                m = DELTA_HEAD_RE.match(line)
                if not m:
                    errors.append(f"{ch.at(i)}: heading must be '#### ADDED|MODIFIED|REMOVED|RENAMED <CODE>-<NNN>: <name>'")
                    current = None
                    continue
                current = (m.group(1), m.group(2))
                if m.group(1) == "ADDED":
                    ch.added.append(m.group(2))
                if m.group(1) in ("ADDED", "MODIFIED"):
                    has_scenario[m.group(2)] = False
                continue
            if current is None:
                continue
            m = SCENARIO_HEAD_RE.match(line)
            if m:
                close_scenario()
                sid = f"{m.group(1)}-S{m.group(2)}"
                scenario = (sid, i, [])
                if m.group(1) != current[1]:
                    errors.append(f"{ch.at(i)}: scenario {sid} inside {current[1]}")
                if sid in ch.scenarios:
                    errors.append(f"{ch.at(i)}: scenario {sid} appears twice")
                ch.scenarios[sid] = i
                has_scenario[current[1]] = True
                if types and m.group(3) not in types:
                    errors.append(f"{ch.at(i)}: scenario {sid} has unknown type '{m.group(3)}'")
                continue
            if line.startswith("- `") and SCENARIO_RE.match(line[2:]):
                errors.append(f"{ch.at(i)}: scenario line must read '- `<ID>-S<n>` (<type>, P1|P2|P3)'")
            for sid in SCENARIO_RE.findall(line):
                if not sid.startswith(current[1] + "-"):
                    errors.append(f"{ch.at(i)}: scenario ID {sid} of another requirement in backticks inside {current[1]}")
            if scenario is not None:
                if line.startswith("  ") or not line.strip():
                    scenario[2].append(line)
                else:
                    close_scenario()
                    scenario = None
        close_scenario()
        for rid, ok in has_scenario.items():
            if not ok:
                errors.append(f"{ch.loc}: {rid} has no scenario")
        if caps and sorted(domains) != sorted(caps):
            errors.append(f"{ch.loc}: '### <domain>' sections {domains} do not match capabilities {caps}")

    # NFR table
    if "Non-Functional Requirements" in ch.sections:
        header, rows = table(ch.lines, *ch.sections["Non-Functional Requirements"])
        if rows:
            for key in ("ID", "Change", "Category", "Requirement", "Verification"):
                if key not in header:
                    errors.append(f"{ch.loc}: Non-Functional Requirements table has no '{key}' column")
        seen: set[str] = set()
        for i, cells in rows:
            row = dict(zip(header, cells))
            nid = row.get("ID", "").strip("`")
            if not NFR_ID_RE.match(nid):
                errors.append(f"{ch.at(i)}: bad NFR ID '{nid}'")
                continue
            if nid in seen:
                errors.append(f"{ch.at(i)}: {nid} appears twice in the NFR table")
            seen.add(nid)
            if row.get("Change") not in NFR_CHANGES:
                errors.append(f"{ch.at(i)}: {nid} Change must be one of {', '.join(NFR_CHANGES)}")
            ch.nfr_rows.append((i, row))

    # (unassigned)
    for i, line in enumerate(ch.lines):
        if UNASSIGNED_RE.search(line):
            errors.append(f"{ch.at(i)}: '(unassigned)' left — run /spec-edge-cases")

    # Traceability
    if "Traceability" in ch.sections:
        start, end = ch.sections["Traceability"]
        listed: set[str] = set()
        mentioned_nfr: set[str] = set()
        for i in range(start, end):
            line = ch.lines[i]
            if not line.lstrip().startswith("|"):
                continue
            cells = split_row(line)
            row_req = re.match(rf"`?({REQ_ID})`?$", cells[0]) if cells else None
            mentioned_nfr |= set(re.findall(r"NFR-\d{3}", line))
            if not row_req or row_req.group(1).startswith("NFR-"):
                continue  # NFR rows: "verified by" cells are not the scenario list
            for m in TRACE_TOKEN_RE.finditer(" ".join(cells[1:])):
                req = m.group(1) or row_req.group(1)
                lo = int(m.group(2))
                hi = int(m.group(3)) if m.group(3) else lo
                for n in range(lo, hi + 1):
                    listed.add(f"{req}-S{n}")
        for sid, i in sorted(ch.scenarios.items()):
            if sid not in listed:
                errors.append(f"{ch.at(i)}: scenario {sid} is not listed in ## Traceability")
        for sid in sorted(listed - set(ch.scenarios)):
            errors.append(f"{ch.loc}: ## Traceability lists {sid}, which is not a scenario of this change")
        for i, row in ch.nfr_rows:
            nid = row.get("ID", "").strip("`")
            if nid not in mentioned_nfr:
                errors.append(f"{ch.at(i)}: {nid} is not listed in ## Traceability")
    return errors


def check_changes(root: Path, req_locs: dict[str, list[str]], removed: dict[str, str],
                  nfr_where: dict[str, str]) -> list[str]:
    errors: list[str] = []
    types = scenario_types(root)
    added_req: dict[str, str] = {}
    added_nfr: dict[str, str] = {}
    for path in sorted((root / "specs/changes").glob("*/spec.md")):
        ch = ChangeSpec(root, path)
        errors += check_change(ch, types)
        for rid in ch.added:
            if rid in req_locs:
                errors.append(f"{ch.loc}: ADDED {rid} already exists ({req_locs[rid][0]})")
            if rid in removed:
                errors.append(f"{ch.loc}: ADDED {rid} reuses an ID removed in {removed[rid]}")
            if rid in added_req:
                errors.append(f"{ch.loc}: ADDED {rid} is also added by {added_req[rid]}")
            added_req.setdefault(rid, ch.loc)
        for i, row in ch.nfr_rows:
            nid, kind, cat = row.get("ID", "").strip("`"), row.get("Change"), row.get("Category", "")
            if kind == "ADDED":
                if nid in nfr_where:
                    errors.append(f"{ch.at(i)}: ADDED {nid} already exists in nfr.md")
                if nid in added_nfr:
                    errors.append(f"{ch.at(i)}: ADDED {nid} is also added by {added_nfr[nid]}")
                added_nfr.setdefault(nid, ch.loc)
            elif kind in ("MODIFIED", "Applies") and nfr_where and nid not in nfr_where:
                errors.append(f"{ch.at(i)}: {kind} {nid} is not in nfr.md")
            if nfr_where and kind in ("ADDED", "MODIFIED") and cat not in set(nfr_where.values()):
                errors.append(f"{ch.at(i)}: {nid} Category '{cat}' is not a section of nfr.md with NFR rows")
            if kind == "MODIFIED" and nid in nfr_where and nfr_where[nid] != cat:
                errors.append(f"{ch.at(i)}: MODIFIED {nid} is in nfr.md section '{nfr_where[nid]}', not '{cat}'")
    return errors


# --------------------------------------------------------------------------- main


def run(root: Path, change: str, stage: str = "spec") -> list[str]:
    errors: list[str] = []
    if stage == "archive" and CHANGE_RE.match(change):
        errors += check_archived(root, change)
    files = sorted((root / "specs/capabilities").glob("**/*.md"))
    nfr = root / "specs/_system/nfr.md"
    if nfr.is_file():
        files.append(nfr)
    errors += check_delta_words(root, files)
    req_locs, removed, scenarios = collect(root)
    nfr_locs, nfr_where = collect_nfr(root)
    errors += check_ids(req_locs, removed, nfr_locs)
    errors += check_changes(root, req_locs, removed, nfr_where)
    if stage == "archive":
        errors += check_tests(root, scenarios)
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="spec harness CI gate")
    parser.add_argument("--change", required=True, help="branch name, e.g. 001-product-bulk-delete")
    parser.add_argument("--stage", choices=STAGES, default="spec",
                        help="spec (default): structure, IDs, traceability; archive: + archived change and tests")
    parser.add_argument("--root", type=Path, default=None, help="repo root (default: auto)")
    args = parser.parse_args(argv)
    root = (args.root or default_root()).resolve()
    change = args.change.strip()

    kind = "change" if CHANGE_RE.match(change) else "non-change branch"
    print(f"spec_check: {change} — {kind}, stage {args.stage}")
    errors = run(root, change, args.stage)
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
