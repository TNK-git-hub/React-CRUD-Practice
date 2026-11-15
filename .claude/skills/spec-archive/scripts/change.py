#!/usr/bin/env python3
"""Merge a change's delta spec into the living feature specs, and archive the change.

Part of the spec-archive skill. Pure standard library, works on macOS / Linux / Windows.

    python .claude/skills/spec-archive/scripts/change.py status  --change 001-x
    python .claude/skills/spec-archive/scripts/change.py sync    --change 001-x --dry-run
    python .claude/skills/spec-archive/scripts/change.py sync    --change 001-x
    python .claude/skills/spec-archive/scripts/change.py archive --change 001-x

Layout: specs/capabilities/<domain>/{states.md, rules.md, history.md} are shared by the domain;
specs/capabilities/<domain>/<feature>/spec.md holds the requirements of one feature. There is no spec.md at domain
level. The delta spec lists features in its `capabilities` frontmatter ("<domain>/<feature>") and has one
"### <domain>/<feature>" section per feature under "## Requirements".

`sync` validates EVERYTHING first and writes nothing when any check fails (exit 1).
Operations are matched by requirement ID (never by heading text) and applied one domain at a time in the order
MOVED -> RENAMED -> MODIFIED -> REMOVED -> ADDED. Requirement IDs are unique in the whole domain:
- MODIFIED / RENAMED / REMOVED must find the ID in the feature of their section (after MOVED), else stop;
- MOVED (fields From / To, written under the To feature's section) moves the block between two features of the
  domain, ID and content unchanged;
- ADDED must not exist in any feature of the domain nor in its "Removed IDs"; a declared feature that does not exist
  yet is created (spec.md, Overview = its scope line in the Features table of specs/_system/domain-model.md) and may
  only receive ADDED / MOVED;
- REMOVED adds a row to "Removed IDs" of the domain's history.md; every touched feature gets a row in the
  "## Merged changes" table of its own spec.md.

`sync` also merges the change's "## Non-Functional Requirements" table into
specs/_system/nfr.md: rows marked ADDED are appended to the table of the nfr.md section named
in their Category column (the ID must not exist yet), rows marked MODIFIED replace the row
with that ID (it must exist, in that section), rows marked Applies are ignored. Architecture
Decisions and the rest of the change's spec.md stay in the change folder and go to the archive.

`archive` moves specs/changes/<change>/ to specs/archive/<change>/ (same name, no date
prefix). It never overwrites an existing archive folder and refuses to run while the
capabilities do not reflect the delta (i.e. before `sync`).

Exit codes: 0 ok, 1 validation / usage error.
Ideas (operation order, all-or-nothing validation) come from OpenSpec's specs-apply
(MIT, https://github.com/Fission-AI/OpenSpec); see ../NOTICE.md.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

CHANGE_NAME_RE = re.compile(r"^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$")
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")  # domain and feature names (kebab-case)
REQ_ID = r"[A-Z]{2,5}-\d{3}"
DELTA_HEAD_RE = re.compile(rf"^####\s+(ADDED|MODIFIED|REMOVED|RENAMED|MOVED)\s+({REQ_ID})\b\s*:?\s*(.*?)\s*$")
ANY_H4_RE = re.compile(r"^####\s+")
CAP_HEAD_RE = re.compile(rf"^###\s+({REQ_ID}):\s*(.*?)\s*$")
FIELD_RE = re.compile(r"^\s*-\s+\*\*(From|To|Reason|Migration|Replaced by|Source):\*\*\s*(.*?)\s*$")
FEATURES_HEAD_RE = re.compile(r"^##\s+Features\s+[—–-]+\s+domain\s+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?\s*$")
HISTORY_CODE_RE = re.compile(r"^#\s+History:.*\(([A-Z]{2,5})\)\s*$")
DELTA_WORD_RE = re.compile(r"\b(ADDED|MODIFIED|REMOVED|RENAMED|MOVED)\b")
NONE_YET = "_(none yet)_"
NFR_ID_RE = re.compile(r"^NFR-\d{3}$")
NFR_CHANGES = ("Applies", "ADDED", "MODIFIED")
NFR_KEYS = ("ID", "Change", "Category")  # spec-only columns, never copied into nfr.md
EMPTY_CELLS = ("", "—", "-")
OP_ORDER = ("MOVED", "RENAMED", "MODIFIED", "REMOVED", "ADDED")
# Operations on one ID that may appear together (all in the same feature section).
ALLOWED_COMBOS = ({"RENAMED", "MODIFIED"}, {"MOVED", "MODIFIED"}, {"MOVED", "RENAMED"}, {"MOVED", "RENAMED", "MODIFIED"})
# history.md and the feature specs live in specs/capabilities/ too, so they must not carry the delta keywords.
HISTORY_WORD = {"RENAMED": "renamed", "MODIFIED": "updated", "REMOVED": "dropped", "ADDED": "new", "MOVED": "moved"}
NEW_FEATURE_SPEC = """\
---
kind: capability
domain: "{domain}"
feature: "{feature}"
code: "{code}"
---

# Feature: {domain}/{feature} ({code})

## Overview

{scope}

Domain files: [states.md](../states.md) · [rules.md](../rules.md) · [history.md](../history.md)

## Requirements

_(none yet)_

## Merged changes

| Change | Date | Change in this feature |
| --- | --- | --- |
| _(none yet)_ | | |
"""


class ChangeError(Exception):
    """A validation error: the command must stop without writing."""


# --------------------------------------------------------------------------- helpers


def default_root() -> Path:
    # .claude/skills/spec-archive/scripts/change.py -> repo root is 4 levels up
    return Path(__file__).resolve().parents[4]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def split_frontmatter(text: str) -> tuple[dict[str, str], list[str], list[str]]:
    """Return (simple key->raw value map, frontmatter lines incl. fences, body lines)."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, [], lines
    for end in range(1, len(lines)):
        if lines[end].strip() == "---":
            meta: dict[str, str] = {}
            for line in lines[1:end]:
                m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
                if m:
                    meta[m.group(1)] = re.sub(r"\s+#.*$", "", m.group(2)).strip()
            return meta, lines[: end + 1], lines[end + 1 :]
    raise ChangeError("frontmatter is not closed with '---'")


def parse_list(raw: str) -> list[str]:
    raw = raw.strip()
    if not (raw.startswith("[") and raw.endswith("]")):
        return [raw.strip("\"'")] if raw else []
    return [item.strip().strip("\"'") for item in raw[1:-1].split(",") if item.strip()]


def split_feature(key: str) -> tuple[str, str] | None:
    """'products/filtering' -> ('products', 'filtering'); anything else -> None."""
    parts = key.strip().strip("`").split("/")
    if len(parts) == 2 and all(NAME_RE.match(p) for p in parts):
        return parts[0], parts[1]
    return None


def comment_mask(lines: list[str]) -> list[bool]:
    """True for lines inside (or opening/closing) an HTML comment or a code fence."""
    mask, in_comment, in_fence = [], False, False
    for line in lines:
        stripped = line.strip()
        inside = in_comment or in_fence
        if stripped.startswith("```"):
            in_fence = not in_fence
            inside = True
        elif not in_fence:
            if "<!--" in line and "-->" not in line.split("<!--", 1)[1]:
                in_comment, inside = True, True
            elif in_comment and "-->" in line:
                in_comment, inside = False, True
            elif "<!--" in line:
                inside = True
        mask.append(inside)
    return mask


def section_bounds(lines: list[str], heading: str) -> tuple[int, int]:
    """(start, end) line indexes of the body of `## <heading>`; end is exclusive."""
    mask = comment_mask(lines)
    start = next((i for i, l in enumerate(lines) if not mask[i] and l.strip() == f"## {heading}"), None)
    if start is None:
        raise ChangeError(f"section '## {heading}' not found")
    end = next((i for i in range(start + 1, len(lines)) if not mask[i] and lines[i].startswith("## ")), len(lines))
    return start + 1, end


def trim_blank(lines: list[str]) -> list[str]:
    while lines and not lines[0].strip():
        lines = lines[1:]
    while lines and not lines[-1].strip():
        lines = lines[:-1]
    return lines


def id_num(req_id: str) -> int:
    return int(req_id.rsplit("-", 1)[1])


def split_row(line: str) -> list[str]:
    """Cells of a Markdown table row; '\\|' is an escaped pipe inside a cell."""
    inner = line.strip()
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|") and not inner.endswith("\\|"):
        inner = inner[:-1]
    return [c.strip() for c in re.split(r"(?<!\\)\|", inner)]


def is_separator(line: str) -> bool:
    return bool(re.fullmatch(r"\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?", line.strip()))


def rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


# --------------------------------------------------------------------------- delta parsing


@dataclass
class DeltaOp:
    op: str
    req_id: str
    name: str
    body: list[str]  # lines after the heading
    line: int

    def field(self, key: str) -> str | None:
        for line in self.body:
            m = FIELD_RE.match(line)
            if m and m.group(1) == key:
                return m.group(2)
        return None


@dataclass
class Delta:
    change: str
    meta: dict[str, str]
    capabilities: list[str]  # "<domain>/<feature>", in frontmatter order
    ops: dict[str, list[DeltaOp]]  # "<domain>/<feature>" -> ops in file order
    open_markers: list[str] = field(default_factory=list)


def parse_delta(path: Path, change: str) -> Delta:
    meta, _, body = split_frontmatter(read(path))
    if meta.get("kind", "").strip("\"'") != "delta":
        raise ChangeError(f"{path}: frontmatter 'kind: delta' is missing")
    fm_change = meta.get("change", "").strip("\"'")
    if fm_change and fm_change != change:
        raise ChangeError(f"{path}: frontmatter change '{fm_change}' does not match '{change}'")
    capabilities = parse_list(meta.get("capabilities", ""))
    if not capabilities:
        raise ChangeError(f"{path}: frontmatter 'capabilities' is empty")
    bad = [c for c in capabilities if split_feature(c) is None]
    if bad:
        raise ChangeError(f"{path}: capabilities must list features as '<domain>/<feature>', got {bad}")

    start, end = section_bounds(body, "Requirements")
    mask = comment_mask(body)
    ops: dict[str, list[DeltaOp]] = {}
    key: str | None = None
    current: DeltaOp | None = None
    for i in range(start, end):
        line = body[i]
        if mask[i]:
            if current is not None:
                current.body.append(line)
            continue
        if line.startswith("### "):
            current = None
            title = line[4:].strip()
            if title.lower().startswith("edge cases"):
                key = None
                continue
            if split_feature(title) is None:
                raise ChangeError(f"{path}:{i + 1}: section must be '### <domain>/<feature>', got '### {title}'")
            key = "/".join(split_feature(title) or ())
            if key in ops:
                raise ChangeError(f"{path}:{i + 1}: feature section '### {key}' appears twice")
            ops[key] = []
            continue
        if ANY_H4_RE.match(line):
            m = DELTA_HEAD_RE.match(line)
            if key is None:
                raise ChangeError(f"{path}:{i + 1}: requirement outside a '### <domain>/<feature>' section")
            if not m:
                raise ChangeError(
                    f"{path}:{i + 1}: heading must be '#### ADDED|MODIFIED|REMOVED|RENAMED|MOVED <CODE>-<NNN>: <name>'"
                )
            current = DeltaOp(m.group(1), m.group(2), m.group(3), [], i + 1)
            ops[key].append(current)
            continue
        if current is not None:
            current.body.append(line)
        elif key is not None and line.strip():
            raise ChangeError(f"{path}:{i + 1}: text in '### {key}' outside any requirement")

    for op_list in ops.values():
        for op in op_list:
            op.body = trim_blank(op.body)
    delta = Delta(change, meta, capabilities, ops)
    for op_list in ops.values():
        for op in op_list:
            if op.op in ("ADDED", "MODIFIED") and any("[NEEDS CLARIFICATION" in l for l in op.body):
                delta.open_markers.append(op.req_id)
    return delta


def moved_from(delta: Delta) -> dict[str, list[DeltaOp]]:
    """'<domain>/<feature>' a MOVED takes its requirement from -> those MOVED ops ('?' when From is unreadable)."""
    out: dict[str, list[DeltaOp]] = {}
    for key, op_list in delta.ops.items():
        domain = key.split("/")[0]
        for op in op_list:
            if op.op == "MOVED":
                out.setdefault(feature_key(domain, op.field("From")) or "?", []).append(op)
    return out


def feature_key(domain: str, value: str | None) -> str | None:
    """A From / To value ('filtering', '`products/filtering`') -> 'products/filtering' (None if unreadable)."""
    if not value:
        return None
    value = value.strip().strip("`").strip()
    if "/" in value:
        parts = split_feature(value)
        return "/".join(parts) if parts else None
    return f"{domain}/{value}" if NAME_RE.match(value) else None


# --------------------------------------------------------------------------- feature specs


@dataclass
class FeatureSpec:
    domain: str
    feature: str
    code: str
    path: Path
    head: list[str]  # everything up to and including the '## Requirements' line
    pre: list[str]  # lines between '## Requirements' and the first requirement
    blocks: dict[str, tuple[str, list[str]]]  # id -> (name, body lines)
    order: list[str]
    tail: list[str]  # trailing comment / blank lines of the section + following sections (Merged changes)
    is_new: bool = False

    @property
    def key(self) -> str:
        return f"{self.domain}/{self.feature}"


def parse_feature_text(text: str, label: str, domain: str, feature: str, path: Path, is_new: bool = False) -> FeatureSpec:
    meta, fm, body = split_frontmatter(text)
    code = meta.get("code", "").strip("\"'")
    if not re.fullmatch(r"[A-Z]{2,5}", code):
        raise ChangeError(f"{label}: frontmatter 'code' is missing or invalid")
    for k, want in (("domain", domain), ("feature", feature)):
        got = meta.get(k, "").strip("\"'")
        if got and got != want:
            raise ChangeError(f"{label}: frontmatter {k} '{got}' does not match its folder '{want}'")

    start, end = section_bounds(body, "Requirements")
    mask = comment_mask(body)
    heads = [i for i in range(start, end) if not mask[i] and CAP_HEAD_RE.match(body[i])]
    # Section tail = trailing blank / comment lines after the last real content line.
    last = end - 1
    while last >= start and (not body[last].strip() or mask[last]):
        last -= 1
    tail_start = last + 1
    pre = body[start : heads[0]] if heads else body[start:tail_start]
    pre = [l for l in pre if l.strip() != NONE_YET]
    blocks: dict[str, tuple[str, list[str]]] = {}
    order: list[str] = []
    for n, h in enumerate(heads):
        stop = heads[n + 1] if n + 1 < len(heads) else tail_start
        m = CAP_HEAD_RE.match(body[h])
        assert m
        if m.group(1) in blocks:
            raise ChangeError(f"{label}: requirement {m.group(1)} appears twice")
        blocks[m.group(1)] = (m.group(2), trim_blank(body[h + 1 : stop]))
        order.append(m.group(1))
    return FeatureSpec(domain, feature, code, path, fm + body[:start], trim_blank(pre), blocks, order,
                       body[tail_start:], is_new)


def parse_feature(root: Path, domain: str, feature: str) -> FeatureSpec:
    path = root / "specs" / "capabilities" / domain / feature / "spec.md"
    if not path.is_file():
        raise ChangeError(f"feature '{domain}/{feature}' has no {rel(root, path)}")
    return parse_feature_text(read(path), rel(root, path), domain, feature, path)


@dataclass
class DomainState:
    domain: str
    code: str
    history_path: Path
    history_text: str
    removed_ids: set[str]
    features: dict[str, FeatureSpec]  # feature name -> spec (existing ones, plus new ones once declared)

    def locate(self, req_id: str) -> str | None:
        """Feature that currently holds the requirement, or None."""
        return next((name for name, fs in self.features.items() if req_id in fs.blocks), None)


def load_domain(root: Path, domain: str) -> DomainState:
    folder = root / "specs" / "capabilities" / domain
    if not folder.is_dir():
        raise ChangeError(f"domain '{domain}' has no folder {rel(root, folder)}/")
    if (folder / "spec.md").exists():
        raise ChangeError(f"{rel(root, folder / 'spec.md')}: a domain has no spec.md of its own; "
                          f"requirements live in {rel(root, folder)}/<feature>/spec.md")
    history = folder / "history.md"
    if not history.is_file():
        raise ChangeError(f"domain '{domain}' has no {rel(root, history)}")
    history_text = read(history)
    features: dict[str, FeatureSpec] = {}
    seen: dict[str, str] = {}
    for spec in sorted(folder.glob("*/spec.md")):
        fs = parse_feature(root, domain, spec.parent.name)
        for req_id in fs.order:
            if req_id in seen:
                raise ChangeError(f"requirement {req_id} is in both {domain}/{seen[req_id]} and {fs.key}: "
                                  "IDs are unique in the domain")
            seen[req_id] = fs.feature
        features[fs.feature] = fs
    codes = sorted({fs.code for fs in features.values()})
    if len(codes) > 1:
        raise ChangeError(f"domain '{domain}': its feature specs use different codes {codes}")
    code = codes[0] if codes else ""
    if not code:
        first = history_text.split("\n", 1)[0].strip()
        m = HISTORY_CODE_RE.match(first)
        if not m:
            raise ChangeError(f"domain '{domain}': no feature spec yet and no '(CODE)' in the title of history.md")
        code = m.group(1)
    return DomainState(domain, code, history, history_text, parse_removed_ids(history_text), features)


def parse_features_table(root: Path) -> dict[str, dict[str, str]]:
    """domain -> {feature -> scope} from the '## Features — domain <domain>' tables of domain-model.md."""
    path = root / "specs" / "_system" / "domain-model.md"
    if not path.is_file():
        return {}
    lines = read(path).split("\n")
    mask = comment_mask(lines)
    out: dict[str, dict[str, str]] = {}
    domain: str | None = None
    header: list[str] | None = None
    for i, line in enumerate(lines):
        if mask[i]:
            continue
        m = FEATURES_HEAD_RE.match(line)
        if m:
            domain, header = m.group(1), None
            out.setdefault(domain, {})
            continue
        if line.startswith("#"):
            domain = None
            continue
        if domain is None or not line.lstrip().startswith("|"):
            continue
        if header is None:
            header = split_row(line)
            continue
        if is_separator(line):
            continue
        cells = split_row(line)
        name = cells[0].strip("`")
        if NAME_RE.match(name):
            out[domain][name] = cells[1] if len(cells) > 1 else ""
    return out


def new_feature(root: Path, dom: DomainState, feature: str, scope: str) -> FeatureSpec:
    path = root / "specs" / "capabilities" / dom.domain / feature / "spec.md"
    text = NEW_FEATURE_SPEC.format(domain=dom.domain, feature=feature, code=dom.code, scope=scope)
    return parse_feature_text(text, rel(root, path), dom.domain, feature, path, is_new=True)


def table_rows(text: str, heading: str) -> tuple[list[str], int, int]:
    lines = text.split("\n")
    start, end = section_bounds(lines, heading)
    rows = [i for i in range(start, end) if lines[i].lstrip().startswith("|")]
    if len(rows) < 2:
        raise ChangeError(f"table under '## {heading}' not found")
    return lines, rows[1] + 1, rows[-1] + 1  # first data row index, index after last row


def parse_removed_ids(history_text: str) -> set[str]:
    lines, first, after = table_rows(history_text, "Removed IDs")
    ids = set()
    for line in lines[first:after]:
        m = re.match(rf"^\|\s*`?({REQ_ID})`?\s*\|", line.strip())
        if m:
            ids.add(m.group(1))
    return ids


def append_rows(text: str, heading: str, rows: list[str]) -> str:
    if not rows:
        return text
    lines, first, after = table_rows(text, heading)
    data = [l for l in lines[first:after] if NONE_YET not in l]
    return "\n".join(lines[:first] + data + rows + lines[after:])


def render_feature(fs: FeatureSpec) -> str:
    out = list(fs.head)
    out.append("")
    if fs.pre:
        out += fs.pre + [""]
    if not fs.order:
        out += [NONE_YET, ""]
    for req_id in sorted(fs.order, key=id_num):
        name, body = fs.blocks[req_id]
        out += [f"### {req_id}: {name}", ""] + body + [""]
    tail = trim_blank(fs.tail)
    if tail:
        out += tail + [""]
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).rstrip("\n") + "\n"


# --------------------------------------------------------------------------- sync


def with_source(body: list[str], change: str) -> list[str]:
    body = [l for l in body if not (FIELD_RE.match(l) and FIELD_RE.match(l).group(1) == "Source")]
    return trim_blank(body) + [f"- **Source:** change {change}"]


def check_scenarios(op: DeltaOp, problems: list[str]) -> None:
    ids = re.findall(rf"`({REQ_ID})-S(\d+)`", "\n".join(op.body))
    if not ids:
        problems.append(f"{op.op} {op.req_id}: no scenario `{op.req_id}-S<n>`")
    for rid, _ in ids:
        if rid != op.req_id:
            problems.append(f"{op.op} {op.req_id}: scenario of another requirement ({rid}) inside its block")


# --------------------------------------------------------------------------- NFR


@dataclass
class NfrRow:
    cells: dict[str, str]  # column name -> value
    line: int

    @property
    def nfr_id(self) -> str:
        return self.cells.get("ID", "").strip("`")

    @property
    def change(self) -> str:
        return self.cells.get("Change", "")

    @property
    def category(self) -> str:
        return self.cells.get("Category", "")


def parse_delta_nfrs(path: Path) -> list[NfrRow]:
    """Rows of the first table under '## Non-Functional Requirements' (no section → no rows)."""
    _, _, body = split_frontmatter(read(path))
    try:
        start, end = section_bounds(body, "Non-Functional Requirements")
    except ChangeError:
        return []
    mask = comment_mask(body)
    rows: list[NfrRow] = []
    header: list[str] | None = None
    for i in range(start, end):
        line = body[i]
        if mask[i] or not line.lstrip().startswith("|"):
            if header is not None and rows and not line.strip():
                break  # end of the first table
            continue
        if header is None:
            header = split_row(line)
            continue
        if is_separator(line):
            continue
        cells = split_row(line)
        rows.append(NfrRow(dict(zip(header, cells)), i + 1))
    if header is not None:
        for key in ("ID", "Change", "Category", "Requirement"):
            if key not in header:
                raise ChangeError(f"{path}: Non-Functional Requirements table has no '{key}' column")
    return rows


@dataclass
class NfrTable:
    section: str
    header: list[str]
    header_line: int  # index in lines
    rows: dict[str, int]  # NFR ID -> line index
    last_line: int  # index of the last table line


def parse_nfr_doc(text: str) -> tuple[list[str], dict[str, NfrTable], dict[str, str]]:
    """(lines, section name -> its first table with an 'ID' column, NFR ID -> section)."""
    lines = text.split("\n")
    mask = comment_mask(lines)
    tables: dict[str, NfrTable] = {}
    where: dict[str, str] = {}
    section: str | None = None
    current: NfrTable | None = None
    for i, line in enumerate(lines):
        if mask[i]:
            continue
        if line.startswith("## "):
            section, current = line[3:].strip(), None
            continue
        if line.startswith("#"):
            current = None
            continue
        if not line.lstrip().startswith("|"):
            if line.strip():
                current = None
            continue
        if section is None:
            continue
        if current is None:
            header = split_row(line)
            if header and header[0] == "ID" and section not in tables:
                current = NfrTable(section, header, i, {}, i)
                tables[section] = current
            continue
        current.last_line = i
        if is_separator(line):
            continue
        nfr_id = split_row(line)[0].strip("`")
        if NFR_ID_RE.match(nfr_id):
            current.rows[nfr_id] = i
    for name, table in tables.items():
        for nfr_id in table.rows:
            where[nfr_id] = name
    # IDs in other tables of the same section are still IDs in use
    for i, line in enumerate(lines):
        if not mask[i] and line.lstrip().startswith("|"):
            first = split_row(line)[0].strip("`")
            if NFR_ID_RE.match(first):
                where.setdefault(first, "?")
    return lines, tables, where


def nfr_line(table: NfrTable, row: NfrRow, problems: list[str]) -> str:
    cols = {k.lower(): v for k, v in row.cells.items()}
    for key, value in row.cells.items():
        if key in NFR_KEYS or value in EMPTY_CELLS:
            continue
        if key.lower() not in {h.lower() for h in table.header}:
            problems.append(f"{row.change} {row.nfr_id}: nfr.md section '{table.section}' has no column '{key}'")
    values = [row.nfr_id if h == "ID" else cols.get(h.lower(), "") for h in table.header]
    return "| " + " | ".join(values) + " |"


def build_nfr(root: Path, change: str, rows: list[NfrRow], problems: list[str]) -> tuple[Path, str | None, list[str]]:
    """Return (nfr.md path, new text or None when nothing to write, summary)."""
    path = root / "specs" / "_system" / "nfr.md"
    seen: set[str] = set()
    todo: list[NfrRow] = []
    for row in rows:
        if not NFR_ID_RE.match(row.nfr_id):
            problems.append(f"Non-Functional Requirements line {row.line}: bad NFR ID '{row.nfr_id}'")
            continue
        if row.nfr_id in seen:
            problems.append(f"{row.nfr_id} appears twice in the Non-Functional Requirements table")
        seen.add(row.nfr_id)
        if row.change not in NFR_CHANGES:
            problems.append(f"{row.nfr_id}: Change must be one of {', '.join(NFR_CHANGES)}, not '{row.change}'")
        elif row.change != "Applies":
            todo.append(row)
    if not todo:
        return path, None, []
    if not path.is_file():
        problems.append(f"{rel(root, path)} not found (needed for {', '.join(r.nfr_id for r in todo)})")
        return path, None, []
    lines, tables, where = parse_nfr_doc(read(path))
    inserts: dict[int, list[str]] = {}
    summary: list[str] = []
    for row in todo:
        table = tables.get(row.category)
        if table is None:
            problems.append(f"{row.change} {row.nfr_id}: nfr.md has no section '## {row.category}' with an ID table")
            continue
        new = nfr_line(table, row, problems)
        if row.change == "ADDED":
            if row.nfr_id in where:
                problems.append(f"ADDED {row.nfr_id}: already exists in nfr.md")
                continue
            inserts.setdefault(table.last_line, []).append(new)
        else:  # MODIFIED
            if row.nfr_id not in where:
                problems.append(f"MODIFIED {row.nfr_id}: not found in nfr.md")
                continue
            if where[row.nfr_id] != row.category:
                problems.append(f"MODIFIED {row.nfr_id}: is in nfr.md section '{where[row.nfr_id]}', not '{row.category}'")
                continue
            lines[table.rows[row.nfr_id]] = new
        summary.append(f"{row.change} {row.nfr_id}")
    out: list[str] = []
    for i, line in enumerate(lines):
        if not (NONE_YET in line and line.lstrip().startswith("|") and i in {t.last_line for t in tables.values()}
                and inserts.get(i)):
            out.append(line)
        out += inserts.get(i, [])
    text = "\n".join(out)
    leaked = sorted(set(DELTA_WORD_RE.findall(text)))
    if leaked:
        problems.append(f"_system/nfr.md would contain delta keywords: {', '.join(leaked)}")
    return path, text, summary


@dataclass
class Plan:
    writes: dict[Path, str]
    summary: dict[str, list[str]]  # "<domain>/<feature>" -> ["ADDED PROD-004", ...]


def check_delta_shape(delta: Delta) -> list[str]:
    """Frontmatter capabilities against the '### <domain>/<feature>' sections (MOVED sources need no section)."""
    problems: list[str] = []
    declared, sections = set(delta.capabilities), set(delta.ops)
    sources = moved_from(delta)
    for key in sorted(declared - sections - set(sources)):
        problems.append(f"feature '{key}' is in 'capabilities' but has no '### {key}' section")
    for key in sorted(sections - declared):
        problems.append(f"section '### {key}' is not listed in frontmatter 'capabilities'")
    for key, ops in sorted(sources.items()):
        if key not in declared:
            for op in ops:
                problems.append(f"MOVED {op.req_id}: From feature '{key}' must be listed in frontmatter 'capabilities'")
    if not any(delta.ops.values()):
        problems.append("the delta has no ADDED / MODIFIED / REMOVED / RENAMED / MOVED requirement")
    for rid in delta.open_markers:
        problems.append(f"{rid}: [NEEDS CLARIFICATION] is still open")
    return problems


def sync_domain(root: Path, change: str, today: str, delta: Delta, domain: str,
                features_table: dict[str, dict[str, str]], problems: list[str],
                writes: dict[Path, str], summary: dict[str, list[str]]) -> None:
    try:
        dom = load_domain(root, domain)
    except ChangeError as exc:
        problems.append(str(exc))
        return
    keys = [k for k in delta.capabilities if k.split("/")[0] == domain]

    # declared features that do not exist yet: created from their Features-table row; ADDED / MOVED only
    for key in keys:
        feature = key.split("/")[1]
        if feature in dom.features:
            continue
        for op in delta.ops.get(key, []):
            if op.op not in ("ADDED", "MOVED"):
                problems.append(f"{op.op} {op.req_id}: feature '{key}' does not exist yet; a new feature may only "
                                "hold ADDED / MOVED")
        if key in moved_from(delta):
            problems.append(f"feature '{key}' does not exist, so nothing can be MOVED from it")
        scope = features_table.get(domain, {}).get(feature)
        if not scope:
            problems.append(f"new feature '{key}' is not in the Features table of specs/_system/domain-model.md "
                            f"('## Features — domain {domain}'); its scope line becomes the feature's Overview")
        dom.features[feature] = new_feature(root, dom, feature, scope or "")

    ops = [(key.split("/")[1], op) for key in keys for op in delta.ops.get(key, [])]
    by_id: dict[str, list[tuple[str, DeltaOp]]] = {}
    for feature, op in ops:
        if not op.req_id.startswith(dom.code + "-"):
            problems.append(f"{op.op} {op.req_id}: domain '{domain}' uses code {dom.code}")
        by_id.setdefault(op.req_id, []).append((feature, op))
    for req_id, uses in by_id.items():
        kinds = [o.op for _, o in uses]
        if len(kinds) > 1 and (len(set(kinds)) != len(kinds) or set(kinds) not in ALLOWED_COMBOS):
            problems.append(f"{req_id} appears in {' and '.join(kinds)}; only RENAMED / MOVED may go with MODIFIED, "
                            "MOVED with RENAMED")
        if len({f for f, _ in uses}) > 1:
            problems.append(f"{req_id}: all its operations must be in one feature section, found "
                            f"{', '.join(sorted({f'{domain}/{f}' for f, _ in uses}))}")

    words: dict[str, list[str]] = {}
    done: dict[str, list[str]] = {}
    removed_rows: list[str] = []

    def in_place(op: DeltaOp, feature: str) -> bool:
        where = dom.locate(op.req_id)
        if where is None:
            problems.append(f"{op.op} {op.req_id}: not found in domain '{domain}'")
            return False
        if where != feature:
            problems.append(f"{op.op} {op.req_id}: is in {domain}/{where}, not {domain}/{feature} "
                            "(write it under its own feature, or MOVED it first)")
            return False
        return True

    for kind in OP_ORDER:
        for feature, op in ops:
            if op.op != kind:
                continue
            fs = dom.features[feature]
            key = fs.key
            if kind == "MOVED":
                src, dst = feature_key(domain, op.field("From")), feature_key(domain, op.field("To"))
                if not src or not dst:
                    problems.append(f"MOVED {op.req_id}: needs '- **From:** <feature>' and '- **To:** <feature>'")
                    continue
                if dst != key:
                    problems.append(f"MOVED {op.req_id}: To '{dst}' must be the feature of its section '{key}'")
                    continue
                if src.split("/")[0] != domain:
                    problems.append(f"MOVED {op.req_id}: From '{src}' is in another domain; IDs never leave their domain")
                    continue
                if src == key:
                    problems.append(f"MOVED {op.req_id}: From and To are the same feature '{key}'")
                    continue
                src_name = src.split("/")[1]
                if src_name not in dom.features or dom.features[src_name].is_new:
                    problems.append(f"MOVED {op.req_id}: From feature '{src}' does not exist")
                    continue
                if not in_place(op, src_name):
                    continue
                source = dom.features[src_name]
                fs.blocks[op.req_id] = source.blocks.pop(op.req_id)
                source.order.remove(op.req_id)
                fs.order.append(op.req_id)
                words.setdefault(src_name, []).append(f"moved {op.req_id} to {feature}")
                words.setdefault(feature, []).append(f"moved {op.req_id} from {src_name}")
                done.setdefault(src, []).append(f"MOVED {op.req_id} -> {key}")
                done.setdefault(key, []).append(f"MOVED {op.req_id} <- {src}")
                continue
            if kind == "ADDED":
                where = dom.locate(op.req_id)
                if where is not None:
                    problems.append(f"ADDED {op.req_id}: already exists in {domain}/{where}")
                    continue
                if op.req_id in dom.removed_ids:
                    problems.append(f"ADDED {op.req_id}: ID was removed earlier and is never reissued")
                    continue
                if not op.name:
                    problems.append(f"ADDED {op.req_id}: heading has no name")
                check_scenarios(op, problems)
                fs.blocks[op.req_id] = (op.name, with_source(op.body, change))
                fs.order.append(op.req_id)
            elif not in_place(op, feature):
                continue
            elif kind == "RENAMED":
                old, new = op.field("From"), op.field("To")
                if not old or not new:
                    problems.append(f"RENAMED {op.req_id}: needs '- **From:**' and '- **To:**'")
                    continue
                if old != fs.blocks[op.req_id][0]:
                    problems.append(
                        f"RENAMED {op.req_id}: From '{old}' does not match current name '{fs.blocks[op.req_id][0]}'"
                    )
                    continue
                fs.blocks[op.req_id] = (new, fs.blocks[op.req_id][1])
            elif kind == "MODIFIED":
                check_scenarios(op, problems)
                fs.blocks[op.req_id] = (op.name or fs.blocks[op.req_id][0], with_source(op.body, change))
            elif kind == "REMOVED":
                reason = op.field("Reason")
                if not reason:
                    problems.append(f"REMOVED {op.req_id}: needs '- **Reason:**'")
                del fs.blocks[op.req_id]
                fs.order.remove(op.req_id)
                dom.removed_ids.add(op.req_id)
                removed_rows.append(
                    f"| {op.req_id} | {feature} | {change} | {reason or ''} | {op.field('Replaced by') or '—'} |")
            words.setdefault(feature, []).append(f"{HISTORY_WORD[kind]} {op.req_id}")
            done.setdefault(key, []).append(f"{kind} {op.req_id}")

    for feature, feature_words in words.items():
        fs = dom.features[feature]
        text = render_feature(fs)
        try:
            text = append_rows(text, "Merged changes", [f"| {change} | {today} | {'; '.join(feature_words)} |"])
        except ChangeError as exc:
            problems.append(f"{rel(root, fs.path)}: {exc}")
        leaked = sorted(set(DELTA_WORD_RE.findall(text)))
        if leaked:
            problems.append(f"{fs.key}/spec.md would contain delta keywords: {', '.join(leaked)}")
        writes[fs.path] = text
        summary[fs.key] = done.get(fs.key, [])
    if removed_rows:
        try:
            history = append_rows(dom.history_text, "Removed IDs", removed_rows)
        except ChangeError as exc:
            problems.append(f"{domain}/history.md: {exc}")
            return
        leaked = sorted(set(DELTA_WORD_RE.findall(history)))
        if leaked:
            problems.append(f"{domain}/history.md would contain delta keywords: {', '.join(leaked)}")
        writes[dom.history_path] = history


def build_sync(root: Path, change: str, today: str) -> Plan:
    change_dir = root / "specs" / "changes" / change
    spec = change_dir / "spec.md"
    if not spec.is_file():
        raise ChangeError(f"{rel(root, spec)} not found")
    delta = parse_delta(spec, change)

    problems = check_delta_shape(delta)
    if problems:
        raise ChangeError("; ".join(problems))

    writes: dict[Path, str] = {}
    summary: dict[str, list[str]] = {}
    features_table = parse_features_table(root)
    domains = list(dict.fromkeys(k.split("/")[0] for k in delta.capabilities))
    for domain in domains:
        sync_domain(root, change, today, delta, domain, features_table, problems, writes, summary)

    try:
        nfr_rows = parse_delta_nfrs(spec)
    except ChangeError as exc:
        problems.append(str(exc))
        nfr_rows = []
    nfr_path, nfr_text, nfr_done = build_nfr(root, change, nfr_rows, problems)
    if nfr_text is not None:
        writes[nfr_path] = nfr_text
        summary["_system/nfr"] = nfr_done

    if problems:
        raise ChangeError("; ".join(problems))
    return Plan(writes, summary)


def write_lf(path: Path, content: str) -> None:
    """Write UTF-8 with LF line endings (Path.write_text(newline=) needs Python 3.10+)."""
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)


def write_all(writes: dict[Path, str]) -> None:
    for p in writes:
        p.parent.mkdir(parents=True, exist_ok=True)  # a new feature folder
    tmp = {p: p.with_name(p.name + ".spec-archive.tmp") for p in writes}
    try:
        for p, content in writes.items():
            write_lf(tmp[p], content)
        for p in writes:
            os.replace(tmp[p], p)
    finally:
        for t in tmp.values():
            if t.exists():
                t.unlink()


# --------------------------------------------------------------------------- status / archive


def open_tasks(change_dir: Path) -> list[str]:
    tasks = change_dir / "tasks.md"
    if not tasks.is_file():
        return []
    return [l.strip() for l in read(tasks).split("\n") if re.match(r"^\s*[-*]\s+\[ \]", l)]


def verify_synced(root: Path, change: str) -> None:
    delta = parse_delta(root / "specs" / "changes" / change / "spec.md", change)
    problems = []
    domains: dict[str, DomainState] = {}
    for key, ops in delta.ops.items():
        domain, feature = key.split("/")
        if domain not in domains:
            try:
                domains[domain] = load_domain(root, domain)
            except ChangeError as exc:
                problems.append(str(exc))
                continue
        dom = domains[domain]
        for op in ops:
            where = dom.locate(op.req_id)
            if op.op == "REMOVED":
                if where is not None:
                    problems.append(f"{op.req_id} is still in {domain}/{where}/spec.md")
                continue
            if where != feature:
                problems.append(f"{op.req_id} is not in {key}/spec.md")
                continue
            if op.op in ("ADDED", "MODIFIED"):
                if f"- **Source:** change {change}" not in dom.features[feature].blocks[op.req_id][1]:
                    problems.append(f"{op.req_id} in {key}/spec.md is not from change {change}")
    rows = [r for r in parse_delta_nfrs(root / "specs" / "changes" / change / "spec.md") if r.change in ("ADDED", "MODIFIED")]
    if rows:
        nfr = root / "specs" / "_system" / "nfr.md"
        lines, tables, where_nfr = parse_nfr_doc(read(nfr)) if nfr.is_file() else ([], {}, {})
        for row in rows:
            table = tables.get(row.category)
            if row.nfr_id not in where_nfr or table is None or row.nfr_id not in table.rows:
                problems.append(f"{row.nfr_id} is not in nfr.md section '{row.category}'")
                continue
            current = dict(zip(table.header, split_row(lines[table.rows[row.nfr_id]])))
            if current.get("Requirement", "") != row.cells.get("Requirement", ""):
                problems.append(f"{row.nfr_id} in nfr.md does not match the change")
    if problems:
        raise ChangeError("capabilities do not reflect the delta yet (run sync first): " + "; ".join(problems))


def archive(root: Path, change: str) -> Path:
    src = root / "specs" / "changes" / change
    dst = root / "specs" / "archive" / change
    if not src.is_dir():
        raise ChangeError(f"{rel(root, src)} not found")
    if dst.exists():
        raise ChangeError(f"target {rel(root, dst)} already exists; refusing to overwrite")
    verify_synced(root, change)
    spec = src / "spec.md"
    text = read(spec)
    text = re.sub(r"(?m)^(status:\s*)\S+", r"\1archived", text, count=1)
    write_lf(spec, text)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    return dst


# --------------------------------------------------------------------------- CLI


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="spec-archive helper")
    parser.add_argument("command", choices=("status", "sync", "archive"))
    parser.add_argument("--change", required=True, help="change folder name, e.g. 001-product-bulk-delete")
    parser.add_argument("--dry-run", action="store_true", help="sync: validate and show the plan, write nothing")
    parser.add_argument("--date", default=None, help="sync: date for the Merged changes rows (default: today, YYYY-MM-DD)")
    parser.add_argument("--root", type=Path, default=None, help="repo root (default: auto)")
    args = parser.parse_args(argv)
    root = (args.root or default_root()).resolve()

    try:
        if not CHANGE_NAME_RE.match(args.change):
            raise ChangeError(f"change name must look like NNN-<kebab-name>, got {args.change!r}")
        if args.command == "status":
            change_dir = root / "specs" / "changes" / args.change
            if not change_dir.is_dir():
                raise ChangeError(f"{rel(root, change_dir)} not found")
            print(json.dumps({"change": args.change, "open_tasks": open_tasks(change_dir)}, ensure_ascii=False))
        elif args.command == "sync":
            plan = build_sync(root, args.change, args.date or dt.date.today().isoformat())
            if not args.dry_run:
                write_all(plan.writes)
            print(json.dumps({
                "change": args.change,
                "dry_run": args.dry_run,
                "applied": plan.summary,
                "files": sorted(rel(root, p) for p in plan.writes),
            }, ensure_ascii=False))
        else:
            dst = archive(root, args.change)
            print(json.dumps({"change": args.change, "archived_to": rel(root, dst)}))
    except ChangeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
