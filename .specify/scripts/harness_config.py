#!/usr/bin/env python3
"""The agent areas of the harness, from one file: .claude/harness.json.

    python3 .specify/scripts/harness_config.py get <key> [--regex | --list | --json] [--root R | --config <file>|-]

--config reads that file (or stdin with "-") instead of <root>/.claude/harness.json, with the same checks
(collect.sh: the version at the pod's base commit, `git show <base_sha>:.claude/harness.json`).

Keys:
  packages, areas.src, areas.testPublic, areas.testE2e, areas.testPrivate, testFile
  pod.codeWritable          = areas.src                       (code-writer in the pod)
  pod.testWritable          = areas.testPublic                (test-writer in the pod)
  pod.agentAreas            = areas.src + areas.testPublic    (what a pod branch may change; collect.sh)
  interactive.testWritable  = areas.testPublic + areas.testE2e (test-writer in the interactive session; guard.mjs)

Output: --list (default) one value per line; --json the value as JSON; --regex an ERE / JS / Python regex:
a list -> `^(a|b|c)/` (each entry escaped), testFile -> the regex as written in the file.
Exit codes: 0 ok; 2 harness.json missing or invalid, or an unknown key / option.

Schema (version 1): "packages": non-empty list of names; "areas": exactly src, testPublic, testE2e, testPrivate, each a
list of paths relative to the repo root (no leading or trailing "/", no "." or ".." segment, characters A-Z a-z 0-9 . _ - /);
src and testPublic not empty; every testPublic and testPrivate path inside one of the packages ("<package>/…");
"testFile": a regex. No other key. guard.mjs reads the same file and checks the same rules (fail-closed).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CONFIG = ".claude/harness.json"
AREA_KEYS = ("src", "testPublic", "testE2e", "testPrivate")
NON_EMPTY = ("src", "testPublic")
IN_PACKAGE = ("testPublic", "testPrivate")
PACKAGE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
AREA_RE = re.compile(r"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")
DERIVED = {
    "pod.codeWritable": ("src",),
    "pod.testWritable": ("testPublic",),
    "pod.agentAreas": ("src", "testPublic"),
    "interactive.testWritable": ("testPublic", "testE2e"),
}
KEYS = ("packages", *(f"areas.{k}" for k in AREA_KEYS), "testFile", *DERIVED)


class ConfigError(Exception):
    """harness.json is missing or does not follow the schema."""


def default_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load(root: Path) -> dict:
    """The checked config of the repo at `root` (raises ConfigError)."""
    path = Path(root) / CONFIG
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as e:
        raise ConfigError(f"{CONFIG} not found") from e
    except OSError as e:
        raise ConfigError(f"{CONFIG} cannot be read: {e}") from e
    return loads(text)


def loads(text: str) -> dict:
    """The checked config from the text of a harness.json (e.g. `git show <sha>:.claude/harness.json`)."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ConfigError(f"{CONFIG} is not valid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ConfigError(f"{CONFIG} must be a JSON object")
    extra = set(data) - {"version", "packages", "areas", "testFile"}
    if extra:
        raise ConfigError(f"{CONFIG}: unknown key(s) {sorted(extra)}")
    if data.get("version") != 1:
        raise ConfigError(f"{CONFIG}: version must be 1")
    packages = data.get("packages")
    if not isinstance(packages, list) or not packages or not all(isinstance(p, str) and PACKAGE_RE.match(p) for p in packages):
        raise ConfigError(f"{CONFIG}: packages must be a non-empty list of names")
    if len(set(packages)) != len(packages):
        raise ConfigError(f"{CONFIG}: packages has duplicates")
    areas = data.get("areas")
    if not isinstance(areas, dict) or set(areas) != set(AREA_KEYS):
        raise ConfigError(f"{CONFIG}: areas must have exactly the keys {list(AREA_KEYS)}")
    for key in AREA_KEYS:
        values = areas[key]
        if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
            raise ConfigError(f"{CONFIG}: areas.{key} must be a list of paths")
        if key in NON_EMPTY and not values:
            raise ConfigError(f"{CONFIG}: areas.{key} must not be empty")
        for v in values:
            if not AREA_RE.match(v) or any(seg in (".", "..") for seg in v.split("/")):
                raise ConfigError(f"{CONFIG}: areas.{key}: '{v}' must be a relative path without '.', '..' or a trailing '/'")
            if key in IN_PACKAGE and v.split("/")[0] not in packages:
                raise ConfigError(f"{CONFIG}: areas.{key}: '{v}' is not inside one of the packages {packages}")
    test_file = data.get("testFile")
    if not isinstance(test_file, str) or not test_file:
        raise ConfigError(f"{CONFIG}: testFile must be a regex string")
    try:
        re.compile(test_file)
    except re.error as e:
        raise ConfigError(f"{CONFIG}: testFile is not a valid regex: {e}") from e
    return data


def get(config: dict, key: str) -> list[str] | str:
    if key == "packages":
        return list(config["packages"])
    if key == "testFile":
        return config["testFile"]
    if key.startswith("areas.") and key[len("areas."):] in AREA_KEYS:
        return list(config["areas"][key[len("areas."):]])
    if key in DERIVED:
        out: list[str] = []
        for k in DERIVED[key]:
            out += [v for v in config["areas"][k] if v not in out]
        return out
    raise KeyError(key)


def ere_escape(s: str) -> str:
    """Escape for ERE (bash [[ =~ ]], grep -E), JS and Python alike; areas only hold A-Z a-z 0-9 . _ - /."""
    return re.sub(r"([.\[\]()*+?{}|^$\\])", r"\\\1", s)


def as_regex(value: list[str] | str) -> str:
    if isinstance(value, str):
        return value
    return "^(" + "|".join(ere_escape(v) for v in value) + ")/"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="agent areas from .claude/harness.json")
    sub = parser.add_subparsers(dest="command", required=True)
    g = sub.add_parser("get", help="print one key")
    g.add_argument("key", help=", ".join(KEYS))
    fmt = g.add_mutually_exclusive_group()
    fmt.add_argument("--regex", action="store_true")
    fmt.add_argument("--list", action="store_true")
    fmt.add_argument("--json", action="store_true")
    src = g.add_mutually_exclusive_group()
    src.add_argument("--root", type=Path, default=None, help="repo root whose .claude/harness.json is read (default: auto)")
    src.add_argument("--config", default=None,
                     help="read this harness.json instead ('-' = stdin), e.g. the version at a commit: "
                          "git show <sha>:.claude/harness.json | harness_config.py get <key> --config -")
    try:
        args = parser.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    try:
        if args.config == "-":
            config = loads(sys.stdin.read())
        elif args.config is not None:
            try:
                text = Path(args.config).read_text(encoding="utf-8")
            except OSError as e:
                raise ConfigError(f"{args.config} cannot be read: {e}") from e
            config = loads(text)
        else:
            config = load((args.root or default_root()).resolve())
        value = get(config, args.key)
    except ConfigError as e:
        print(f"harness_config.py: {e}", file=sys.stderr)
        return 2
    except KeyError:
        print(f"harness_config.py: unknown key '{args.key}' (one of: {', '.join(KEYS)})", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(value))
    elif args.regex:
        print(as_regex(value))
    else:
        print("\n".join(value) if isinstance(value, list) else value)
    return 0


if __name__ == "__main__":
    sys.exit(main())
