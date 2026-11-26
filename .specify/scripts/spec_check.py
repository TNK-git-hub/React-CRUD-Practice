#!/usr/bin/env python3
"""CI gate for the spec harness (no LLM, runs in a few seconds).

    python3 .specify/scripts/spec_check.py --change <branch name> [--stage spec|archive]

--stage spec (default) — the SPEC harness gate (handoff, CI):
  1. every open change (specs/changes/*/spec.md) has the structure of the rich delta template:
     frontmatter, all sections in order, requirement headings, nested scenarios `<ID>` (type, Pn) with
     Given / When / Then, NFR table with Change Applies / ADDED / MODIFIED
  2. IDs are unique: requirement IDs in the whole domain (every specs/capabilities/<domain>/<feature>/spec.md),
     removed IDs never reused, ADDED requirement and NFR IDs not already in use (nor added by two open changes),
     scenario IDs unique, NFR IDs in nfr.md unique
  2b. feature layout: no spec.md at domain level (specs/capabilities/<domain>/spec.md); an open change lists
     features as "<domain>/<feature>", each one exists (folder with spec.md) or is new (its section holds only
     ADDED / MOVED) and, when domain-model.md has a Features table for its domain, is listed there;
     MODIFIED / RENAMED / REMOVED IDs are in the feature of their section; MOVED has From / To, To is its
     section's feature, From is another declared feature of the same domain that holds the ID
  3. no "(unassigned)" left in an open change; each plan placeholder line, while still there, appears exactly
     once in the file (the planner replaces it by Edit, which needs a unique match)
  3b. spec.md and plan.md of an open change are self-contained: no pointer instead of content
     ("as for change 001", "as in change 001", "same as change 001", "see research R2", "research.md") and no
     reference into specs/archive/ (an archived change is history, not a source)
  4. every scenario of an open change, and every NFR row, is listed in its "## Traceability"
  5. no delta keyword (ADDED, MODIFIED, REMOVED, RENAMED, MOVED) in specs/capabilities/ or specs/_system/nfr.md
  5b. approvals (approval.py, approved by the user in a terminal) of every open change: any frontmatter status other
     than the pre-approval one (`draft`; the template lists draft | approved | implementing | archived) needs a gate
     spec that matches; plan.md + tasks.md present needs a gate plan that matches
--stage archive — after /spec-archive (CODE + TEST harnesses done): all of the above, plus
  6. for a change branch (`NNN-<name>`): specs/changes/<change>/ is gone and specs/archive/<change>/ exists
  7. every scenario ID in specs/capabilities/ is mentioned by some file under tests/ or a public / e2e test area of
     .claude/harness.json (areas.testPublic, areas.testE2e)

Exit 0 = all checks pass; exit 1 = at least one failure (each printed, also as a GitHub annotation).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import approval  # noqa: E402  (same folder: the gate hashes live in one place)
import harness_config  # noqa: E402  (same folder: the agent areas of .claude/harness.json)

CHANGE_RE = re.compile(r"^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$")
REQ_ID = r"[A-Z]{2,5}-\d{3}"
REQ_HEAD_RE = re.compile(rf"^###\s+({REQ_ID}):")
SCENARIO_RE = re.compile(rf"`({REQ_ID}-S\d+)`")
REMOVED_ROW_RE = re.compile(rf"^\|\s*`?({REQ_ID})`?\s*\|")
DELTA_WORD_RE = re.compile(r"\b(ADDED|MODIFIED|REMOVED|RENAMED|MOVED)\b")
DELTA_HEAD_RE = re.compile(rf"^####\s+(ADDED|MODIFIED|REMOVED|RENAMED|MOVED)\s+({REQ_ID})\b")
NAME = r"[a-z0-9]+(?:-[a-z0-9]+)*"
FEATURE_KEY_RE = re.compile(rf"^({NAME})/({NAME})$")
MOVE_FIELD_RE = re.compile(r"^\s*-\s+\*\*(From|To):\*\*\s*(.*?)\s*$")
FEATURES_HEAD_RE = re.compile(rf"^##\s+Features\s+[—–-]+\s+domain\s+`?({NAME})`?\s*$")
# A spec / plan states its content; it never points to another change or to research instead (archive merges only
# the requirement blocks, and a change has no research.md). A source in parentheses ("change 001-x") is fine.
POINTER_RE = re.compile(
    r"\b(?:as|like)\s+(?:for|in|of|with|per)\s+(?:[\w-]+\s+){0,5}?(?:in\s+)?change\s+\d{3}\b"
    r"|\b(?:same\s+as|as)\s+(?:in\s+)?change\s+\d{3}\b"
    r"|\bresearch\s+(?:note\s+)?R\d+\b|\bR\d+\s+(?:of|in)\s+(?:the\s+)?research\b|\bresearch\.md\b",
    re.I,
)
# An archived change is history, not a source: valid sources are an ID in a capability, a file of specs/_system/, a
# code path or docs/requirements/. A rule found only in the archive means the capability is missing it.
ARCHIVE_RE = re.compile(r"specs[/\\]+archive(?:[/\\]|\b)", re.I)
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
# Status a spec has before the user approves it (spec-template.md: draft | approved | implementing | archived).
# Every other value, unknown ones included, comes after the approval and needs a matching gate spec.
PRE_APPROVAL_STATUSES = ("draft",)
PLAN_PLACEHOLDERS = (
    "_(Architecture Decisions: filled by /speckit-plan)_",
    "_(Data Model: filled by /speckit-plan)_",
)


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


class Capabilities:
    """What specs/capabilities/ and the Features tables of domain-model.md hold today."""

    def __init__(self) -> None:
        self.req_locs: dict[str, list[str]] = {}  # requirement id -> locations
        self.req_feature: dict[str, str] = {}  # requirement id -> "<domain>/<feature>" (first location)
        self.removed: dict[str, str] = {}  # removed id -> history file
        self.scenarios: dict[str, str] = {}  # scenario id -> location
        self.features: set[str] = set()  # existing "<domain>/<feature>" (folder with spec.md)
        self.domains: set[str] = set()  # existing domain folders
        self.features_table: dict[str, set[str]] = {}  # domain -> features listed in domain-model.md


def check_layout(root: Path) -> list[str]:
    """Requirements live in <domain>/<feature>/spec.md; a domain has no spec.md of its own."""
    return [f"{rel(root, spec)}: a domain has no spec.md of its own; move its requirements into "
            f"{rel(root, spec.parent)}/<feature>/spec.md"
            for spec in sorted((root / "specs/capabilities").glob("*/spec.md"))]


def features_table(root: Path) -> dict[str, set[str]]:
    """domain -> features of its '## Features — domain <domain>' table in specs/_system/domain-model.md."""
    path = root / "specs/_system/domain-model.md"
    out: dict[str, set[str]] = {}
    if not path.is_file():
        return out
    domain: str | None = None
    header = False
    for line in strip_fences(strip_comments(path.read_text(encoding="utf-8")).split("\n")):
        m = FEATURES_HEAD_RE.match(line)
        if m:
            domain, header = m.group(1), False
            out.setdefault(domain, set())
            continue
        if line.startswith("#"):
            domain = None
            continue
        if domain is None or not line.lstrip().startswith("|"):
            continue
        if not header:
            header = True
            continue
        if re.fullmatch(r"[\s|:-]+", line):
            continue
        name = split_row(line)[0].strip("`")
        if re.fullmatch(NAME, name):
            out[domain].add(name)
    return out


def collect(root: Path) -> Capabilities:
    caps = Capabilities()
    req_locs, removed, scenarios = caps.req_locs, caps.removed, caps.scenarios
    cap_root = root / "specs/capabilities"
    caps.domains = {d.name for d in cap_root.iterdir() if d.is_dir()} if cap_root.is_dir() else set()
    caps.features_table = features_table(root)
    for spec in sorted(cap_root.glob("*/*/spec.md")):
        key = f"{spec.parent.parent.name}/{spec.parent.name}"
        caps.features.add(key)
        text = strip_comments(spec.read_text(encoding="utf-8"))
        for n, line in enumerate(text.split("\n"), 1):
            m = REQ_HEAD_RE.match(line)
            if m:
                req_locs.setdefault(m.group(1), []).append(f"{rel(root, spec)}:{n}")
                caps.req_feature.setdefault(m.group(1), key)
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
    return caps


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


def test_dirs(root: Path) -> tuple[str, ...]:
    """Folders searched for scenario IDs: "tests" (the harness's own unit tests) + the public and e2e test areas of
    .claude/harness.json. The hidden test folders are never read."""
    config = harness_config.load(root)
    return ("tests", *harness_config.get(config, "areas.testPublic"), *harness_config.get(config, "areas.testE2e"))


def check_tests(root: Path, scenarios: dict[str, str]) -> list[str]:
    try:
        dirs = test_dirs(root)
    except harness_config.ConfigError as e:
        return [f"cannot find the test folders: {e}"]
    corpus = []
    for d in dirs:
        tests_dir = root / d
        if not tests_dir.is_dir():
            continue
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
            errors.append(f"scenario {sid} ({loc}) has no test: no file under {', '.join(dirs)} mentions it")
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
        self.raw = raw
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
        self.ops: list[dict] = []  # {"op", "id", "section", "line", "fields": {"From", "To"}}

    def at(self, i: int) -> str:
        return f"{self.loc}:{i + 1}"


def feature_key(domain: str, value: str | None) -> str | None:
    """A MOVED From / To value ('filtering' or '`products/filtering`') -> 'products/filtering'."""
    value = (value or "").strip().strip("`").strip()
    if FEATURE_KEY_RE.match(value):
        return value
    return f"{domain}/{value}" if re.fullmatch(NAME, value) else None


def check_features(ch: ChangeSpec, caps: list[str], sections: list[str], cap: Capabilities | None) -> list[str]:
    """Features in the frontmatter against the sections, the capabilities and the MOVED operations."""
    errors: list[str] = []
    bad = [c for c in caps if not FEATURE_KEY_RE.match(c)]
    if bad:
        return [f"{ch.loc}: capabilities must list features as '<domain>/<feature>', got {bad}"]
    cap = cap or Capabilities()
    moved_in: set[tuple[str, str]] = set()
    sources: set[str] = set()
    for op in ch.ops:
        if op["op"] != "MOVED" or op["section"] is None:
            continue
        rid, key, at = op["id"], op["section"], ch.at(op["line"])
        domain = key.split("/")[0]
        src, dst = feature_key(domain, op["fields"].get("From")), feature_key(domain, op["fields"].get("To"))
        if not src or not dst:
            errors.append(f"{at}: MOVED {rid} needs '- **From:** <feature>' and '- **To:** <feature>'")
            continue
        sources.add(src)
        if dst != key:
            errors.append(f"{at}: MOVED {rid}: To '{dst}' must be the feature of its section '{key}'")
        elif src.split("/")[0] != domain:
            errors.append(f"{at}: MOVED {rid}: From '{src}' is in another domain; IDs never leave their domain")
        elif src == dst:
            errors.append(f"{at}: MOVED {rid}: From and To are the same feature")
        else:
            if src not in caps:
                errors.append(f"{at}: MOVED {rid}: From feature '{src}' must be listed in capabilities")
            where = cap.req_feature.get(rid)
            if where != src:
                errors.append(f"{at}: MOVED {rid}: is in {where or 'no feature'}, not in its From feature '{src}'")
            moved_in.add((rid, key))
    for key in caps:
        if key not in sections and key not in sources:
            errors.append(f"{ch.loc}: feature '{key}' is in capabilities but has no '### {key}' section")
    for key in sections:
        if key not in caps:
            errors.append(f"{ch.loc}: section '### {key}' is not listed in capabilities")
    for key in caps:
        domain, feature = key.split("/")
        if domain not in cap.domains:
            errors.append(f"{ch.loc}: feature '{key}': domain folder specs/capabilities/{domain}/ does not exist")
            continue
        table = cap.features_table.get(domain)
        if table is not None and feature not in table:
            errors.append(f"{ch.loc}: feature '{key}' is not in the Features table of specs/_system/domain-model.md")
        if key not in cap.features:
            for op in ch.ops:
                if op["section"] == key and op["op"] not in ("ADDED", "MOVED"):
                    errors.append(f"{ch.at(op['line'])}: {op['op']} {op['id']}: feature '{key}' does not exist yet; "
                                  "a new feature may only hold ADDED / MOVED")
            if key in sources:
                errors.append(f"{ch.loc}: feature '{key}' does not exist, so nothing can be MOVED from it")
    for op in ch.ops:
        if op["op"] not in ("MODIFIED", "RENAMED", "REMOVED") or op["section"] is None:
            continue
        rid, key = op["id"], op["section"]
        if (rid, key) in moved_in or key not in cap.features:
            continue
        where = cap.req_feature.get(rid)
        if where is None:
            errors.append(f"{ch.at(op['line'])}: {op['op']} {rid} is not in specs/capabilities/")
        elif where != key:
            errors.append(f"{ch.at(op['line'])}: {op['op']} {rid} is in {where}, not in its section's feature '{key}'")
    return errors


def check_change(ch: ChangeSpec, types: set[str], cap: Capabilities | None = None) -> list[str]:
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
        sections_seen: list[str] = []
        section: str | None = None
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
                title = line[4:].strip()
                section = title if FEATURE_KEY_RE.match(title) else None
                if section is None:
                    errors.append(f"{ch.at(i)}: section must be '### <domain>/<feature>', got '### {title}'")
                elif section in sections_seen:
                    errors.append(f"{ch.at(i)}: feature section '### {section}' appears twice")
                sections_seen.append(title)
                continue
            if line.startswith("#### "):
                close_scenario()
                scenario = None
                m = DELTA_HEAD_RE.match(line)
                if not m:
                    errors.append(f"{ch.at(i)}: heading must be '#### ADDED|MODIFIED|REMOVED|RENAMED|MOVED <CODE>-<NNN>: <name>'")
                    current = None
                    continue
                current = (m.group(1), m.group(2))
                ch.ops.append({"op": m.group(1), "id": m.group(2), "section": section, "line": i, "fields": {}})
                if m.group(1) == "ADDED":
                    ch.added.append(m.group(2))
                if m.group(1) in ("ADDED", "MODIFIED"):
                    has_scenario[m.group(2)] = False
                continue
            if current is None:
                continue
            fm = MOVE_FIELD_RE.match(line)
            if fm and ch.ops:
                ch.ops[-1]["fields"].setdefault(fm.group(1), fm.group(2))
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
        errors += check_features(ch, caps, [s for s in sections_seen if FEATURE_KEY_RE.match(s)], cap)

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

    # plan placeholders: absent (filled) or exactly once, counted in the raw file incl. comments
    for placeholder in PLAN_PLACEHOLDERS:
        count = ch.raw.count(placeholder)
        if count > 1:
            errors.append(f"{ch.loc}: placeholder '{placeholder}' appears {count} times; it must appear exactly once")

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


def check_pointers(root: Path) -> list[str]:
    """spec.md and plan.md of every open change: no 'as for change NNN' / 'research Rn' instead of content."""
    errors: list[str] = []
    for change_dir in sorted(p for p in (root / "specs/changes").glob("*") if p.is_dir()):
        for name in ("spec.md", "plan.md"):
            path = change_dir / name
            if not path.is_file():
                continue
            text = strip_comments(path.read_text(encoding="utf-8"))
            for n, line in enumerate(text.split("\n"), 1):
                for m in POINTER_RE.finditer(line):
                    errors.append(f"{rel(root, path)}:{n}: '{m.group(0)}' points elsewhere instead of stating the "
                                  "content; write the behavior / decision itself (a source in parentheses is fine)")
                if ARCHIVE_RE.search(line):
                    errors.append(f"{rel(root, path)}:{n}: points into specs/archive/; cite a capability ID, a "
                                  "specs/_system/ file, a code path or docs/requirements/ instead. A rule that exists "
                                  "only in the archive means the capability is missing it: stop and report")
    return errors


def check_changes(root: Path, cap: Capabilities, nfr_where: dict[str, str]) -> list[str]:
    errors: list[str] = []
    req_locs, removed = cap.req_locs, cap.removed
    types = scenario_types(root)
    added_req: dict[str, str] = {}
    added_nfr: dict[str, str] = {}
    for path in sorted((root / "specs/changes").glob("*/spec.md")):
        ch = ChangeSpec(root, path)
        errors += check_change(ch, types, cap)
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


def check_approvals(root: Path) -> list[str]:
    """Open changes only (not specs/archive/, not bugs/): an approved spec / a plan must match its approval.json gate."""
    errors: list[str] = []
    for path in sorted((root / "specs/changes").glob("*/spec.md")):
        folder, loc = path.parent, rel(root, path)
        fix = f"the user runs `python3 .specify/scripts/approval.py approve --change {folder.name} --gate {{gate}}`" \
              f"; diff: `python3 .specify/scripts/approval.py verify --change {folder.name}`"
        wanted = []
        status = ChangeSpec(root, path).meta.get("status", "")
        if status and status not in PRE_APPROVAL_STATUSES:
            wanted.append(("spec", f"status is {status}"))
        if (folder / "plan.md").is_file() and (folder / "tasks.md").is_file():
            wanted.append(("plan", "plan.md and tasks.md exist"))
        for gate, why in wanted:
            code, reason, _ = approval.check_gate(root, folder, gate)
            if code != approval.OK:  # PENDING and ERROR both fail the check
                errors.append(f"{loc}: {why} but {reason} ({fix.format(gate=gate)})")
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
    errors += check_layout(root)
    cap = collect(root)
    scenarios = cap.scenarios
    nfr_locs, nfr_where = collect_nfr(root)
    errors += check_ids(cap.req_locs, cap.removed, nfr_locs)
    errors += check_changes(root, cap, nfr_where)
    errors += check_pointers(root)
    errors += check_approvals(root)
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
