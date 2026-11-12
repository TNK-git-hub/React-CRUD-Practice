#!/usr/bin/env python3
"""Merge a change's delta spec into the living capability specs, and archive the change.

Part of the spec-archive skill. Pure standard library, works on macOS / Linux / Windows.

    python .claude/skills/spec-archive/scripts/change.py status  --change 001-x
    python .claude/skills/spec-archive/scripts/change.py sync    --change 001-x --dry-run
    python .claude/skills/spec-archive/scripts/change.py sync    --change 001-x
    python .claude/skills/spec-archive/scripts/change.py archive --change 001-x

`sync` validates EVERYTHING first and writes nothing when any check fails (exit 1).
Operations are matched by requirement ID (never by heading text) and applied in the
order RENAMED -> MODIFIED -> REMOVED -> ADDED, one domain at a time, following the
`capabilities` frontmatter of the delta spec.

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
REQ_ID = r"[A-Z]{2,5}-\d{3}"
DELTA_HEAD_RE = re.compile(rf"^####\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+({REQ_ID})\b\s*:?\s*(.*?)\s*$")
ANY_H4_RE = re.compile(r"^####\s+")
CAP_HEAD_RE = re.compile(rf"^###\s+({REQ_ID}):\s*(.*?)\s*$")
FIELD_RE = re.compile(r"^\s*-\s+\*\*(From|To|Reason|Migration|Replaced by|Source):\*\*\s*(.*?)\s*$")
DELTA_WORD_RE = re.compile(r"\b(ADDED|MODIFIED|REMOVED|RENAMED)\b")
NONE_YET = "_(none yet)_"
OP_ORDER = ("RENAMED", "MODIFIED", "REMOVED", "ADDED")
# history.md lives in specs/capabilities/ too, so it must not carry the delta keywords either.
HISTORY_WORD = {"RENAMED": "renamed", "MODIFIED": "updated", "REMOVED": "dropped", "ADDED": "new"}


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
    capabilities: list[str]
    ops: dict[str, list[DeltaOp]]  # domain -> ops in file order
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

    start, end = section_bounds(body, "Requirements")
    mask = comment_mask(body)
    ops: dict[str, list[DeltaOp]] = {}
    domain: str | None = None
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
            domain = None if title.lower().startswith("edge cases") else title
            if domain is not None:
                if domain in ops:
                    raise ChangeError(f"{path}:{i + 1}: domain section '### {domain}' appears twice")
                ops[domain] = []
            continue
        if ANY_H4_RE.match(line):
            m = DELTA_HEAD_RE.match(line)
            if domain is None:
                raise ChangeError(f"{path}:{i + 1}: requirement outside a '### <domain>' section")
            if not m:
                raise ChangeError(
                    f"{path}:{i + 1}: heading must be '#### ADDED|MODIFIED|REMOVED|RENAMED <CODE>-<NNN>: <name>'"
                )
            current = DeltaOp(m.group(1), m.group(2), m.group(3), [], i + 1)
            ops[domain].append(current)
            continue
        if current is not None:
            current.body.append(line)
        elif domain is not None and line.strip():
            raise ChangeError(f"{path}:{i + 1}: text in '### {domain}' outside any requirement")

    for op_list in ops.values():
        for op in op_list:
            op.body = trim_blank(op.body)
    delta = Delta(change, meta, capabilities, ops)
    for op_list in ops.values():
        for op in op_list:
            if op.op in ("ADDED", "MODIFIED") and any("[NEEDS CLARIFICATION" in l for l in op.body):
                delta.open_markers.append(op.req_id)
    return delta


# --------------------------------------------------------------------------- capability files


@dataclass
class Capability:
    domain: str
    code: str
    path: Path
    head: list[str]  # everything up to and including the '## Requirements' line
    pre: list[str]  # lines between '## Requirements' and the first requirement
    blocks: dict[str, tuple[str, list[str]]]  # id -> (name, body lines)
    order: list[str]
    tail: list[str]  # trailing comment / blank lines of the section + following sections
    removed_ids: set[str]
    history_path: Path


def parse_capability(root: Path, domain: str) -> Capability:
    folder = root / "specs" / "capabilities" / domain
    spec = folder / "spec.md"
    history = folder / "history.md"
    if not spec.is_file():
        raise ChangeError(f"capability '{domain}' has no {spec.relative_to(root)}")
    if not history.is_file():
        raise ChangeError(f"capability '{domain}' has no {history.relative_to(root)}")
    meta, fm, body = split_frontmatter(read(spec))
    code = meta.get("code", "").strip("\"'")
    if not re.fullmatch(r"[A-Z]{2,5}", code):
        raise ChangeError(f"{spec.relative_to(root)}: frontmatter 'code' is missing or invalid")

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
            raise ChangeError(f"{spec.relative_to(root)}: requirement {m.group(1)} appears twice")
        blocks[m.group(1)] = (m.group(2), trim_blank(body[h + 1 : stop]))
        order.append(m.group(1))
    return Capability(
        domain=domain,
        code=code,
        path=spec,
        head=fm + body[:start],
        pre=trim_blank(pre),
        blocks=blocks,
        order=order,
        tail=body[tail_start:],
        removed_ids=parse_removed_ids(read(history)),
        history_path=history,
    )


def table_rows(text: str, heading: str) -> tuple[list[str], int, int]:
    lines = text.split("\n")
    start, end = section_bounds(lines, heading)
    rows = [i for i in range(start, end) if lines[i].lstrip().startswith("|")]
    if len(rows) < 2:
        raise ChangeError(f"history.md: table under '## {heading}' not found")
    return lines, rows[1] + 1, rows[-1] + 1  # first data row index, index after last row


def parse_removed_ids(history_text: str) -> set[str]:
    lines, first, after = table_rows(history_text, "Removed IDs")
    ids = set()
    for line in lines[first:after]:
        m = re.match(rf"^\|\s*`?({REQ_ID})`?\s*\|", line.strip())
        if m:
            ids.add(m.group(1))
    return ids


def append_rows(history_text: str, heading: str, rows: list[str]) -> str:
    if not rows:
        return history_text
    lines, first, after = table_rows(history_text, heading)
    data = [l for l in lines[first:after] if NONE_YET not in l]
    return "\n".join(lines[:first] + data + rows + lines[after:])


def render_capability(cap: Capability) -> str:
    out = list(cap.head)
    out.append("")
    if cap.pre:
        out += cap.pre + [""]
    if not cap.order:
        out += [NONE_YET, ""]
    for req_id in sorted(cap.order, key=id_num):
        name, body = cap.blocks[req_id]
        out += [f"### {req_id}: {name}", ""] + body + [""]
    tail = trim_blank(cap.tail)
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


@dataclass
class Plan:
    writes: dict[Path, str]
    summary: dict[str, list[str]]  # domain -> ["ADDED PROD-004", ...]


def build_sync(root: Path, change: str, today: str) -> Plan:
    change_dir = root / "specs" / "changes" / change
    spec = change_dir / "spec.md"
    if not spec.is_file():
        raise ChangeError(f"{spec.relative_to(root)} not found")
    delta = parse_delta(spec, change)

    problems: list[str] = []
    declared, sections = set(delta.capabilities), set(delta.ops)
    for d in sorted(declared - sections):
        problems.append(f"domain '{d}' is in 'capabilities' but has no '### {d}' section")
    for d in sorted(sections - declared):
        problems.append(f"section '### {d}' is not listed in frontmatter 'capabilities'")
    if not any(delta.ops.values()):
        problems.append("the delta has no ADDED / MODIFIED / REMOVED / RENAMED requirement")
    for rid in delta.open_markers:
        problems.append(f"{rid}: [NEEDS CLARIFICATION] is still open")
    if problems:
        raise ChangeError("; ".join(problems))

    writes: dict[Path, str] = {}
    summary: dict[str, list[str]] = {}
    seen_ids: dict[str, str] = {}
    for domain in delta.capabilities:
        cap = parse_capability(root, domain)
        ops = delta.ops[domain]
        by_op = {k: [o for o in ops if o.op == k] for k in OP_ORDER}

        for op in ops:
            if not op.req_id.startswith(cap.code + "-"):
                problems.append(f"{op.op} {op.req_id}: domain '{domain}' uses code {cap.code}")
            key = op.req_id
            other = seen_ids.get(key)
            if other and not {other, op.op} == {"RENAMED", "MODIFIED"}:
                problems.append(f"{op.req_id} appears in both {other} and {op.op}")
            seen_ids.setdefault(key, op.op)

        # RENAMED
        for op in by_op["RENAMED"]:
            if op.req_id not in cap.blocks:
                problems.append(f"RENAMED {op.req_id}: not found in {domain}/spec.md")
                continue
            old, new = op.field("From"), op.field("To")
            if not old or not new:
                problems.append(f"RENAMED {op.req_id}: needs '- **From:**' and '- **To:**'")
                continue
            if old != cap.blocks[op.req_id][0]:
                problems.append(
                    f"RENAMED {op.req_id}: From '{old}' does not match current name '{cap.blocks[op.req_id][0]}'"
                )
                continue
            cap.blocks[op.req_id] = (new, cap.blocks[op.req_id][1])
        # MODIFIED
        for op in by_op["MODIFIED"]:
            if op.req_id not in cap.blocks:
                problems.append(f"MODIFIED {op.req_id}: not found in {domain}/spec.md")
                continue
            check_scenarios(op, problems)
            cap.blocks[op.req_id] = (op.name or cap.blocks[op.req_id][0], with_source(op.body, change))
        # REMOVED
        removed_rows = []
        for op in by_op["REMOVED"]:
            if op.req_id not in cap.blocks:
                problems.append(f"REMOVED {op.req_id}: not found in {domain}/spec.md")
                continue
            reason = op.field("Reason")
            if not reason:
                problems.append(f"REMOVED {op.req_id}: needs '- **Reason:**'")
            del cap.blocks[op.req_id]
            cap.order.remove(op.req_id)
            cap.removed_ids.add(op.req_id)
            removed_rows.append(f"| {op.req_id} | {change} | {reason or ''} | {op.field('Replaced by') or '—'} |")
        # ADDED
        for op in by_op["ADDED"]:
            if op.req_id in cap.blocks:
                problems.append(f"ADDED {op.req_id}: already exists in {domain}/spec.md")
                continue
            if op.req_id in cap.removed_ids:
                problems.append(f"ADDED {op.req_id}: ID was removed earlier and is never reissued")
                continue
            if not op.name:
                problems.append(f"ADDED {op.req_id}: heading has no name")
            check_scenarios(op, problems)
            cap.blocks[op.req_id] = (op.name, with_source(op.body, change))
            cap.order.append(op.req_id)

        new_spec = render_capability(cap)
        leaked = sorted(set(DELTA_WORD_RE.findall(new_spec)))
        if leaked:
            problems.append(f"{domain}/spec.md would contain delta keywords: {', '.join(leaked)}")

        done = [f"{o.op} {o.req_id}" for k in OP_ORDER for o in by_op[k]]
        words = [f"{HISTORY_WORD[o.op]} {o.req_id}" for k in OP_ORDER for o in by_op[k]]
        history = read(cap.history_path)
        try:
            history = append_rows(history, "Removed IDs", removed_rows)
            history = append_rows(history, "Merged changes", [f"| {change} | {today} | {'; '.join(words)} |"])
        except ChangeError as exc:
            problems.append(f"{domain}/{exc}")
        leaked = sorted(set(DELTA_WORD_RE.findall(history)))
        if leaked:
            problems.append(f"{domain}/history.md would contain delta keywords: {', '.join(leaked)}")
        writes[cap.path] = new_spec
        writes[cap.history_path] = history
        summary[domain] = done

    if problems:
        raise ChangeError("; ".join(problems))
    return Plan(writes, summary)


def write_lf(path: Path, content: str) -> None:
    """Write UTF-8 with LF line endings (Path.write_text(newline=) needs Python 3.10+)."""
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)


def write_all(writes: dict[Path, str]) -> None:
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
    for domain in delta.capabilities:
        cap = parse_capability(root, domain)
        for op in delta.ops.get(domain, []):
            present = op.req_id in cap.blocks
            if op.op == "REMOVED" and present:
                problems.append(f"{op.req_id} is still in {domain}/spec.md")
            if op.op != "REMOVED" and not present:
                problems.append(f"{op.req_id} is not in {domain}/spec.md")
            if op.op in ("ADDED", "MODIFIED") and present:
                if f"- **Source:** change {change}" not in cap.blocks[op.req_id][1]:
                    problems.append(f"{op.req_id} in {domain}/spec.md is not from change {change}")
    if problems:
        raise ChangeError("capabilities do not reflect the delta yet (run sync first): " + "; ".join(problems))


def archive(root: Path, change: str) -> Path:
    src = root / "specs" / "changes" / change
    dst = root / "specs" / "archive" / change
    if not src.is_dir():
        raise ChangeError(f"{src.relative_to(root)} not found")
    if dst.exists():
        raise ChangeError(f"target {dst.relative_to(root)} already exists; refusing to overwrite")
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
    parser.add_argument("--date", default=None, help="sync: date for history.md (default: today, YYYY-MM-DD)")
    parser.add_argument("--root", type=Path, default=None, help="repo root (default: auto)")
    args = parser.parse_args(argv)
    root = (args.root or default_root()).resolve()

    try:
        if not CHANGE_NAME_RE.match(args.change):
            raise ChangeError(f"change name must look like NNN-<kebab-name>, got {args.change!r}")
        if args.command == "status":
            change_dir = root / "specs" / "changes" / args.change
            if not change_dir.is_dir():
                raise ChangeError(f"{change_dir.relative_to(root)} not found")
            print(json.dumps({"change": args.change, "open_tasks": open_tasks(change_dir)}, ensure_ascii=False))
        elif args.command == "sync":
            plan = build_sync(root, args.change, args.date or dt.date.today().isoformat())
            if not args.dry_run:
                write_all(plan.writes)
            print(json.dumps({
                "change": args.change,
                "dry_run": args.dry_run,
                "applied": plan.summary,
                "files": sorted(str(p.relative_to(root)) for p in plan.writes),
            }, ensure_ascii=False))
        else:
            dst = archive(root, args.change)
            print(json.dumps({"change": args.change, "archived_to": str(dst.relative_to(root))}))
    except ChangeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
