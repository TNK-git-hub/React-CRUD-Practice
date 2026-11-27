#!/usr/bin/env python3
"""The agent areas and the stack profile of the harness, from one file: .claude/harness.json.

    python3 .specify/scripts/harness_config.py get <key> [--regex | --list | --json | --count] [--root R | --config <file>|-]
    python3 .specify/scripts/harness_config.py argv <command> [--index N] [--set NAME=VALUE]... [--files F...]
                                               [--root R | --config <file>|-]

--config reads that file (or stdin with "-") instead of <root>/.claude/harness.json, with the same checks
(collect.sh: the version at the pod's base commit, `git show <base_sha>:.claude/harness.json`).

Keys of `get`:
  packages, areas.src, areas.testPublic, areas.testE2e, areas.testPrivate
  pod.codeWritable          = areas.src                       (code-writer in the pod)
  pod.testWritable          = areas.testPublic                (test-writer in the pod)
  pod.agentAreas            = areas.src + areas.testPublic    (what a pod branch may change; collect.sh)
  interactive.testWritable  = areas.testPublic + areas.testE2e (test-writer in the interactive session; guard.mjs)
  testFile                  = stack.testFile (run.sh, dispatch.sh, red_check.py, private_tests.py, guard.mjs)
  scenarioTestCall          = stack.scenarioTestCall: regex of a test call up to the quote before the scenario ID
                            (run.sh scenario_gate: grep -E "<this><ID>([^0-9]|$)"; private_tests.py)
  stack.<path>              any value of the stack profile, e.g. stack.appMarker, stack.runner,
                            stack.commands.gate.0.label (a list index is a number)

Output of `get`: --list (default) one value per line; --json the value as JSON; --count the length of a list;
--regex an ERE / JS / Python regex: a list -> `^(a|b|c)/` (each entry escaped), a string -> as written in the file.

`argv <command>` prints the argv of a command of the stack profile, one element per line (no element may hold a
newline, so bash 3.2 reads it with `while IFS= read -r a`): install, test, gate (with --index), lintFile, runFiles,
private, privateTypecheck. Placeholders are filled from --set (report, dir, file) and --files (the element "{files}"
becomes the files, one element each); a missing one is an error.

Exit codes: 0 ok; 2 harness.json missing or invalid, or an unknown key / option / missing placeholder;
3 (argv only) the command is null in the profile, or the gate step --index does not exist.

Schema (version 2): "packages": non-empty list of names; "areas": exactly src, testPublic, testE2e, testPrivate, each a
list of paths relative to the repo root (no leading or trailing "/", no "." or ".." segment, characters A-Z a-z 0-9 . _ - /);
src and testPublic not empty; every testPublic and testPrivate path inside one of the packages ("<package>/…");
"stack": the active stack profile, a verbatim copy of .claude/stacks/<stack.name>.json (check_stack below). No other key.
guard.mjs reads the same file and checks the same rules (fail-closed).

A stack profile: exactly the keys name (kebab-case), runner ("vitest" | "pytest"; the report format, see
stack_adapter.py), appMarker (a relative path: the file that means "the app exists"), testFile, scenarioTestCall,
reqFromFileName (regexes; reqFromFileName has the named group "req", which is upper-cased with "_" -> "-" to give the
requirement ID), commands. commands: exactly install (argv or null), test (argv), gate (non-empty list of
{label, argv}), lintFile (null or {package: one of packages, match: regex, argv with {file}}), runFiles (argv with
{files} and {report}), private (argv with {dir} and {report}), privateTypecheck (null or {argv, errorPattern: regex}).
An argv is a non-empty list of non-empty strings without newline; argv[0] is a program, never a shell or a wrapper
(sh, bash, env, xargs, ...), and none of the options right after it is inline code (-c, -e, --eval, -p): commands
are argv arrays, no shell strings. A placeholder other than the ones of its command is an error; "{files}" is a whole element, once.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CONFIG = ".claude/harness.json"
VERSION = 2
TOP_KEYS = ("version", "packages", "areas", "stack")
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
KEYS = ("packages", *(f"areas.{k}" for k in AREA_KEYS), "testFile", "scenarioTestCall", *DERIVED, "stack.<path>")

# ---- stack profile ----
STACK_KEYS = ("name", "runner", "appMarker", "testFile", "scenarioTestCall", "reqFromFileName", "commands")
RUNNERS = ("vitest", "pytest")
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
COMMAND_KEYS = ("install", "test", "gate", "lintFile", "runFiles", "private", "privateTypecheck")
# The placeholders each command must hold (all of them, and no other one)
PLACEHOLDERS = {"install": (), "test": (), "gate": (), "lintFile": ("file",), "runFiles": ("files", "report"),
                "private": ("dir", "report"), "privateTypecheck": ()}
SHELLS = frozenset({"sh", "bash", "zsh", "dash", "ksh", "mksh", "fish", "csh", "tcsh", "busybox", "env", "eval", "exec",
                    "xargs", "nohup", "sudo", "doas", "time", "nice", "cmd", "powershell", "pwsh"})
INLINE_CODE = frozenset({"-c", "-e", "--eval", "--command", "-p", "--print"})
PROGRAM_RE = re.compile(r"^[A-Za-z0-9._+/-]+$")
PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")


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
    extra = set(data) - set(TOP_KEYS)
    if extra:
        raise ConfigError(f"{CONFIG}: unknown key(s) {sorted(extra)}")
    if data.get("version") != VERSION:
        raise ConfigError(f"{CONFIG}: version must be {VERSION} (schema with the stack profile, see .claude/stacks/)")
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
    if "stack" not in data:
        raise ConfigError(f"{CONFIG}: stack is missing (a copy of a profile of .claude/stacks/)")
    check_stack(data["stack"], packages)
    return data


def _err(where: str, message: str) -> ConfigError:
    return ConfigError(f"{CONFIG}: {where}: {message}")


def _check_keys(where: str, value: object, keys: tuple) -> dict:
    if not isinstance(value, dict):
        raise _err(where, f"must be an object with the keys {list(keys)}")
    if set(value) != set(keys):
        missing, extra = sorted(set(keys) - set(value)), sorted(set(value) - set(keys))
        raise _err(where, f"must have exactly the keys {list(keys)}"
                          + (f" (missing {missing})" if missing else "") + (f" (unknown {extra})" if extra else ""))
    return value


def _check_regex(where: str, value: object, group: str | None = None) -> None:
    if not isinstance(value, str) or not value:
        raise _err(where, "must be a regex string")
    try:
        rx = re.compile(value)
    except re.error as e:
        raise _err(where, f"is not a valid regex: {e}") from e
    if group and group not in rx.groupindex:
        raise _err(where, f"must have the named group (?P<{group}>...)")


def _check_text(where: str, value: object) -> None:
    if not isinstance(value, str) or not value or any(c in value for c in "\n\r\0"):
        raise _err(where, "must be a non-empty string without a newline")


def check_argv(where: str, argv: object, command: str) -> None:
    """An argv array of the profile: no shell string, only the placeholders of `command`, all of them."""
    if not isinstance(argv, list) or not argv:
        raise _err(where, "must be a non-empty argv array (list of strings), not a shell string")
    for i, a in enumerate(argv):
        _check_text(f"{where}[{i}]", a)
    prog = argv[0]
    if not PROGRAM_RE.match(prog) or prog.rsplit("/", 1)[-1] in SHELLS:
        raise _err(where, f"argv[0] '{prog}' must be a program, not a shell or a wrapper (no shell strings)")
    for a in argv[1:]:  # the options right after the program (python3 -B -c ..., node --eval ...)
        if not a.startswith("-"):
            break
        if a in INLINE_CODE:
            raise _err(where, f"option '{a}' of {prog} runs inline code (no shell strings)")
    allowed = PLACEHOLDERS[command]
    seen: dict[str, int] = {}
    for a in argv:
        for name in PLACEHOLDER_RE.findall(a):
            if name not in allowed:
                raise _err(where, f"unknown placeholder {{{name}}} (allowed here: "
                                  f"{', '.join('{' + p + '}' for p in allowed) or 'none'})")
            if name == "files" and a != "{files}":
                raise _err(where, "{files} must be a whole element")
            seen[name] = seen.get(name, 0) + 1
    for name in allowed:
        if not seen.get(name):
            raise _err(where, f"must hold the placeholder {{{name}}}")
    if seen.get("files", 0) > 1:
        raise _err(where, "{files} may appear only once")


def check_stack(stack: object, packages: list) -> None:
    """The stack profile (raises ConfigError). guard.mjs checks the same rules (its regexes in JS)."""
    stack = _check_keys("stack", stack, STACK_KEYS)
    if not isinstance(stack["name"], str) or not NAME_RE.match(stack["name"]):
        raise _err("stack.name", "must be a kebab-case name")
    if stack["runner"] not in RUNNERS:
        raise _err("stack.runner", f"must be one of {list(RUNNERS)}")
    marker = stack["appMarker"]
    if not isinstance(marker, str) or not AREA_RE.match(marker) or any(s in (".", "..") for s in marker.split("/")):
        raise _err("stack.appMarker", "must be a relative path without '.', '..' or a trailing '/'")
    _check_regex("stack.testFile", stack["testFile"])
    _check_regex("stack.scenarioTestCall", stack["scenarioTestCall"])
    _check_regex("stack.reqFromFileName", stack["reqFromFileName"], group="req")
    cmds = _check_keys("stack.commands", stack["commands"], COMMAND_KEYS)
    w = "stack.commands"
    if cmds["install"] is not None:
        check_argv(f"{w}.install", cmds["install"], "install")
    check_argv(f"{w}.test", cmds["test"], "test")
    if not isinstance(cmds["gate"], list) or not cmds["gate"]:
        raise _err(f"{w}.gate", "must be a non-empty list of {label, argv}")
    for i, step in enumerate(cmds["gate"]):
        step = _check_keys(f"{w}.gate[{i}]", step, ("label", "argv"))
        _check_text(f"{w}.gate[{i}].label", step["label"])
        check_argv(f"{w}.gate[{i}].argv", step["argv"], "gate")
    lint = cmds["lintFile"]
    if lint is not None:
        lint = _check_keys(f"{w}.lintFile", lint, ("package", "match", "argv"))
        if lint["package"] not in packages:
            raise _err(f"{w}.lintFile.package", f"'{lint['package']}' is not one of the packages {packages}")
        _check_regex(f"{w}.lintFile.match", lint["match"])
        check_argv(f"{w}.lintFile.argv", lint["argv"], "lintFile")
    check_argv(f"{w}.runFiles", cmds["runFiles"], "runFiles")
    check_argv(f"{w}.private", cmds["private"], "private")
    tc = cmds["privateTypecheck"]
    if tc is not None:
        tc = _check_keys(f"{w}.privateTypecheck", tc, ("argv", "errorPattern"))
        check_argv(f"{w}.privateTypecheck.argv", tc["argv"], "privateTypecheck")
        _check_regex(f"{w}.privateTypecheck.errorPattern", tc["errorPattern"])


def get(config: dict, key: str) -> object:
    if key == "packages":
        return list(config["packages"])
    if key == "testFile":
        return config["stack"]["testFile"]
    if key == "scenarioTestCall":
        return config["stack"]["scenarioTestCall"]
    if key.startswith("areas.") and key[len("areas."):] in AREA_KEYS:
        return list(config["areas"][key[len("areas."):]])
    if key in DERIVED:
        out: list[str] = []
        for k in DERIVED[key]:
            out += [v for v in config["areas"][k] if v not in out]
        return out
    if key.startswith("stack."):
        node: object = config["stack"]
        for part in key.split(".")[1:]:
            if isinstance(node, dict) and part in node:
                node = node[part]
            elif isinstance(node, list) and part.isdigit() and int(part) < len(node):
                node = node[int(part)]
            else:
                raise KeyError(key)
        return node
    raise KeyError(key)


def command_argv(stack: dict, command: str, index: int | None = None, files: list | None = None,
                 values: dict | None = None) -> list[str] | None:
    """The argv of a command of the stack profile with its placeholders filled; None when the command is null (or
    the gate step `index` does not exist). Raises ValueError on a missing placeholder value or a bad value."""
    if command not in COMMAND_KEYS:
        raise ValueError(f"unknown command '{command}' (one of: {', '.join(COMMAND_KEYS)})")
    cmd = stack["commands"][command]
    if command == "gate":
        if index is None:
            raise ValueError("gate needs --index")
        if index < 0 or index >= len(cmd):
            return None
        argv = cmd[index]["argv"]
    elif cmd is None:
        return None
    elif isinstance(cmd, dict):
        argv = cmd["argv"]
    else:
        argv = cmd
    values = dict(values or {})
    for name in PLACEHOLDERS[command]:
        if name == "files":
            if files is None:
                raise ValueError(f"{command} needs the files (--files)")
        elif name not in values:
            raise ValueError(f"{command} needs a value for {{{name}}} (--set {name}=...)")
    for v in [*values.values(), *(files or [])]:
        if not isinstance(v, str) or any(c in v for c in "\n\r\0"):
            raise ValueError(f"placeholder value {v!r} must be a string without a newline")
    out: list[str] = []
    for a in argv:
        if a == "{files}":
            out += list(files or [])
        else:
            out.append(PLACEHOLDER_RE.sub(lambda m: values[m.group(1)], a))
    return out


def argv(config: dict, command: str, **kwargs) -> list[str] | None:
    """command_argv of the config's stack profile."""
    return command_argv(config["stack"], command, **kwargs)


def ere_escape(s: str) -> str:
    """Escape for ERE (bash [[ =~ ]], grep -E), JS and Python alike; areas only hold A-Z a-z 0-9 . _ - /."""
    return re.sub(r"([.\[\]()*+?{}|^$\\])", r"\\\1", s)


def as_regex(value: list[str] | str) -> str:
    if isinstance(value, str):
        return value
    return "^(" + "|".join(ere_escape(v) for v in value) + ")/"


def _read_config(args: argparse.Namespace) -> dict:
    if args.config == "-":
        return loads(sys.stdin.read())
    if args.config is not None:
        try:
            text = Path(args.config).read_text(encoding="utf-8")
        except OSError as e:
            raise ConfigError(f"{args.config} cannot be read: {e}") from e
        return loads(text)
    return load((args.root or default_root()).resolve())


def main(argv_: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="agent areas and stack profile from .claude/harness.json")
    sub = parser.add_subparsers(dest="command", required=True)
    g = sub.add_parser("get", help="print one key")
    g.add_argument("key", help=", ".join(KEYS))
    fmt = g.add_mutually_exclusive_group()
    fmt.add_argument("--regex", action="store_true")
    fmt.add_argument("--list", action="store_true")
    fmt.add_argument("--json", action="store_true")
    fmt.add_argument("--count", action="store_true")
    a = sub.add_parser("argv", help="print the argv of a command of the stack profile, one element per line")
    a.add_argument("name", help=", ".join(COMMAND_KEYS))
    a.add_argument("--index", type=int, default=None, help="the gate step (0, 1, ...)")
    a.add_argument("--set", action="append", default=[], metavar="NAME=VALUE", help="a placeholder value")
    a.add_argument("--files", nargs="*", default=None, help="the files for {files}")
    for p in (g, a):
        src = p.add_mutually_exclusive_group()
        src.add_argument("--root", type=Path, default=None, help="repo root whose .claude/harness.json is read (default: auto)")
        src.add_argument("--config", default=None,
                         help="read this harness.json instead ('-' = stdin), e.g. the version at a commit: "
                              "git show <sha>:.claude/harness.json | harness_config.py get <key> --config -")
    try:
        args = parser.parse_args(argv_)
    except SystemExit as e:
        return 2 if e.code else 0
    try:
        config = _read_config(args)
    except ConfigError as e:
        print(f"harness_config.py: {e}", file=sys.stderr)
        return 2
    if args.command == "argv":
        values = {}
        for item in args.set:
            name, sep, value = item.partition("=")
            if not sep or not name:
                print(f"harness_config.py: --set needs NAME=VALUE, got '{item}'", file=sys.stderr)
                return 2
            values[name] = value
        try:
            out = argv(config, args.name, index=args.index, files=args.files, values=values)
        except ValueError as e:
            print(f"harness_config.py: {e}", file=sys.stderr)
            return 2
        if out is None:
            what = f"gate step {args.index}" if args.name == "gate" else f"stack.commands.{args.name}"
            print(f"harness_config.py: {what} is not set in the stack profile", file=sys.stderr)
            return 3
        print("\n".join(out))
        return 0
    try:
        value = get(config, args.key)
    except KeyError:
        print(f"harness_config.py: unknown key '{args.key}' (one of: {', '.join(KEYS)})", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(value))
    elif args.count:
        if not isinstance(value, list):
            print(f"harness_config.py: {args.key} is not a list (--count)", file=sys.stderr)
            return 2
        print(len(value))
    elif isinstance(value, (dict, bool)) or value is None or (isinstance(value, list) and not all(isinstance(v, str) for v in value)):
        print(f"harness_config.py: {args.key} is not a string or a list of strings (use --json)", file=sys.stderr)
        return 2
    elif args.regex:
        print(as_regex(value))
    else:
        print("\n".join(value) if isinstance(value, list) else value)
    return 0


if __name__ == "__main__":
    sys.exit(main())
