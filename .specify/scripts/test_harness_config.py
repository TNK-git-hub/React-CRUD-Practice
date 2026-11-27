"""Tests for harness_config.py. Run: python3 -m unittest discover -s .specify/scripts"""

from __future__ import annotations

import io
import json
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config as hc  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
STACKS = REPO / ".claude/stacks"


def profile(name: str) -> dict:
    return json.loads((STACKS / f"{name}.json").read_text(encoding="utf-8"))


TS = profile("ts-pnpm-vitest")
TS["commands"]["lintFile"]["package"] = "web"  # the fixture's packages are api / web
GOOD = {
    "version": 2,
    "packages": ["api", "web"],
    "areas": {
        "src": ["api/src", "web/src", "web/static.files"],
        "testPublic": ["api/test/public", "web/test/public"],
        "testE2e": ["web/test/e2e"],
        "testPrivate": ["api/test/private", "web/test/private"],
    },
    "stack": TS,
}
# The values the harness used before the stack profile (hard-coded in harness_config.py, stop-gate.sh, code-gate.sh,
# red_check.py, dispatch.sh, lint-changed.mjs): the TS profile must give exactly these.
OLD_SCENARIO_TEST_CALL = r"""(describe|it|test)(\.[A-Za-z]+)*(\([^)]*\))?\(\s*['"`]"""
OLD_TEST_FILE = r"\.test\.tsx?$"


class HarnessConfigTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, data: object) -> None:
        p = self.root / hc.CONFIG
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")

    def with_change(self, **changes: object) -> dict:
        """A copy of GOOD with `a__b__c=value` set (value ... deletes the key; list indices as numbers)."""
        data = json.loads(json.dumps(GOOD))
        for dotted, value in changes.items():
            node = data
            *parents, last = dotted.split("__")
            for k in parents:
                node = node[int(k)] if isinstance(node, list) else node[k]
            key = int(last) if isinstance(node, list) else last
            if value is ...:
                del node[key]
            else:
                node[key] = value
        return data

    def cli(self, *args: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = hc.main([*args, "--root", str(self.root)])
        return code, out.getvalue(), err.getvalue()

    def assert_invalid(self, data: object, message: str) -> None:
        self.write(data)
        with self.assertRaises(hc.ConfigError) as ctx:
            hc.load(self.root)
        self.assertIn(message, str(ctx.exception))
        code, _, err = self.cli("get", "packages")
        self.assertEqual(code, 2)
        self.assertIn(message, err)

    # ---- the repo's own file and the profile library ----
    def test_repo_config_is_valid_and_its_stack_is_a_verbatim_profile(self) -> None:
        config = hc.load(REPO)
        self.assertEqual(config["version"], 2)
        self.assertTrue(config["areas"]["src"])
        self.assertEqual(config["stack"], profile(config["stack"]["name"]),
                         f"harness.json stack must be a verbatim copy of .claude/stacks/{config['stack']['name']}.json")

    def test_every_library_profile_is_valid_and_named_like_its_file(self) -> None:
        files = sorted(STACKS.glob("*.json"))
        self.assertEqual([f.stem for f in files], ["python-pytest", "ts-pnpm-vitest"])
        packages = hc.load(REPO)["packages"]
        for f in files:
            data = json.loads(f.read_text(encoding="utf-8"))
            self.assertEqual(data["name"], f.stem)
            hc.check_stack(data, packages)

    def test_ts_profile_keeps_the_old_regexes(self) -> None:
        self.assertEqual(TS["testFile"], OLD_TEST_FILE)
        self.assertEqual(TS["scenarioTestCall"], OLD_SCENARIO_TEST_CALL)

    # ---- schema: top level ----
    def test_missing_file(self) -> None:
        with self.assertRaises(hc.ConfigError) as ctx:
            hc.load(self.root)
        self.assertIn("not found", str(ctx.exception))
        self.assertEqual(self.cli("get", "packages")[0], 2)

    def test_broken_json(self) -> None:
        self.assert_invalid("{not json", "not valid JSON")

    def test_not_an_object(self) -> None:
        self.assert_invalid("[]", "must be a JSON object")

    def test_unknown_key(self) -> None:
        self.assert_invalid(self.with_change(extra=1), "unknown key")

    def test_version(self) -> None:
        self.assert_invalid(self.with_change(version=1), "version must be 2")
        self.assert_invalid(self.with_change(version=3), "version must be 2")

    def test_a_version_1_file_is_invalid(self) -> None:
        v1 = {"version": 1, "packages": GOOD["packages"], "areas": GOOD["areas"], "testFile": OLD_TEST_FILE}
        self.assert_invalid(v1, "unknown key(s) ['testFile']")
        del v1["testFile"]
        self.assert_invalid(v1, "version must be 2")

    def test_packages(self) -> None:
        self.assert_invalid(self.with_change(packages=[]), "packages must be a non-empty list")
        self.assert_invalid(self.with_change(packages=["api", "api"]), "duplicates")
        self.assert_invalid(self.with_change(packages=["a/b"]), "packages must be a non-empty list")

    def test_areas_keys(self) -> None:
        self.assert_invalid(self.with_change(areas__testE2e=...), "areas must have exactly the keys")
        self.assert_invalid(self.with_change(areas__docs=["docs"]), "areas must have exactly the keys")

    def test_area_paths(self) -> None:
        for bad in ("/abs/src", "api/src/", "api/../src", "./api/src", "api//src", "api/s rc", ""):
            self.assert_invalid(self.with_change(areas__src=[bad]), "must be a relative path")

    def test_required_areas_not_empty(self) -> None:
        self.assert_invalid(self.with_change(areas__src=[]), "areas.src must not be empty")
        self.assert_invalid(self.with_change(areas__testPublic=[]), "areas.testPublic must not be empty")
        self.write(self.with_change(areas__testE2e=[]))
        self.assertEqual(hc.load(self.root)["areas"]["testE2e"], [])

    def test_test_areas_inside_a_package(self) -> None:
        self.assert_invalid(self.with_change(areas__testPrivate=["tests/private"]), "is not inside one of the packages")
        self.assert_invalid(self.with_change(areas__testPublic=["other/test/public"]), "is not inside one of the packages")

    # ---- schema: the stack profile ----
    def test_stack_missing_or_not_an_object(self) -> None:
        self.assert_invalid(self.with_change(stack=...), "stack is missing")
        self.assert_invalid(self.with_change(stack="ts-pnpm-vitest"), "stack: must be an object")

    def test_stack_keys(self) -> None:
        self.assert_invalid(self.with_change(stack__runner=...), "missing ['runner']")
        self.assert_invalid(self.with_change(stack__extra=1), "unknown ['extra']")
        self.assert_invalid(self.with_change(stack__commands__lint=["x"]), "stack.commands: must have exactly the keys")
        self.assert_invalid(self.with_change(stack__commands__install=...), "missing ['install']")

    def test_stack_scalars(self) -> None:
        self.assert_invalid(self.with_change(stack__name="TS Stack"), "stack.name: must be a kebab-case name")
        self.assert_invalid(self.with_change(stack__runner="jest"), "stack.runner: must be one of")
        for bad in ("../package.json", "/package.json", "", 3):
            self.assert_invalid(self.with_change(stack__appMarker=bad), "stack.appMarker: must be a relative path")

    def test_stack_regexes(self) -> None:
        self.assert_invalid(self.with_change(stack__testFile="("), "stack.testFile: is not a valid regex")
        self.assert_invalid(self.with_change(stack__testFile=3), "stack.testFile: must be a regex string")
        self.assert_invalid(self.with_change(stack__scenarioTestCall="(["), "stack.scenarioTestCall: is not a valid regex")
        self.assert_invalid(self.with_change(stack__reqFromFileName=r"^([A-Z]+-\d{3})"),
                            "stack.reqFromFileName: must have the named group (?P<req>...)")
        self.assert_invalid(self.with_change(stack__commands__lintFile__match="("), "lintFile.match: is not a valid regex")
        self.assert_invalid(self.with_change(stack__commands__privateTypecheck__errorPattern=""),
                            "privateTypecheck.errorPattern: must be a regex string")

    def test_commands_are_argv_arrays_not_shell_strings(self) -> None:
        cases = [
            (dict(stack__commands__test="pnpm test"), "stack.commands.test: must be a non-empty argv array"),
            (dict(stack__commands__test=[]), "stack.commands.test: must be a non-empty argv array"),
            (dict(stack__commands__test=["pnpm", ""]), "stack.commands.test[1]: must be a non-empty string"),
            (dict(stack__commands__test=["pnpm", "test\nrm -rf /"]), "must be a non-empty string without a newline"),
            (dict(stack__commands__test=["pnpm test"]), "argv[0] 'pnpm test' must be a program"),
            (dict(stack__commands__test=["sh", "-c", "pnpm test"]), "argv[0] 'sh' must be a program, not a shell"),
            (dict(stack__commands__test=["/bin/bash", "x.sh"]), "argv[0] '/bin/bash' must be a program, not a shell"),
            (dict(stack__commands__gate__0__argv=["env", "pnpm", "lint"]), "argv[0] 'env' must be a program"),
            (dict(stack__commands__test=["xargs", "pnpm"]), "argv[0] 'xargs' must be a program"),
            (dict(stack__commands__install=["python3", "-c", "import os"]), "option '-c' of python3 runs inline code"),
            (dict(stack__commands__install=["python3", "-B", "-c", "x"]), "option '-c' of python3 runs inline code"),
            (dict(stack__commands__test=["node", "--eval", "x"]), "option '--eval' of node runs inline code"),
        ]
        for change, message in cases:
            with self.subTest(change=change):
                self.assert_invalid(self.with_change(**change), message)
        # an option after the first non-option argument is the tool's own (pytest -p, -c <file>): allowed
        self.write(self.with_change(stack__commands__test=["python3", "-m", "pytest", "-p", "no:cacheprovider", "-c", "x"]))
        hc.load(self.root)

    def test_placeholders(self) -> None:
        run = TS["commands"]["runFiles"]
        cases = [
            (dict(stack__commands__runFiles=[a for a in run if a != "{files}"]), "must hold the placeholder {files}"),
            (dict(stack__commands__runFiles=[a for a in run if "{report}" not in a]), "must hold the placeholder {report}"),
            (dict(stack__commands__runFiles=[*run, "{files}"]), "{files} may appear only once"),
            (dict(stack__commands__runFiles=[*run, "--x={files}"]), "{files} must be a whole element"),
            (dict(stack__commands__private=[*TS["commands"]["private"], "{secret}"]), "unknown placeholder {secret}"),
            (dict(stack__commands__private=[a for a in TS["commands"]["private"] if a != "{dir}"]),
             "must hold the placeholder {dir}"),
            (dict(stack__commands__test=["pnpm", "test", "{report}"]), "unknown placeholder {report} (allowed here: none)"),
            (dict(stack__commands__lintFile__argv=["pnpm", "exec", "eslint"]), "must hold the placeholder {file}"),
        ]
        for change, message in cases:
            with self.subTest(change=change):
                self.assert_invalid(self.with_change(**change), message)

    def test_gate_lint_and_typecheck(self) -> None:
        self.assert_invalid(self.with_change(stack__commands__gate=[]), "gate: must be a non-empty list")
        self.assert_invalid(self.with_change(stack__commands__gate__0__label=""), "gate[0].label: must be a non-empty")
        self.assert_invalid(self.with_change(stack__commands__gate__0__extra=1), "gate[0]: must have exactly the keys")
        self.assert_invalid(self.with_change(stack__commands__lintFile__package="docs"),
                            "lintFile.package: 'docs' is not one of the packages")
        self.assert_invalid(self.with_change(stack__commands__privateTypecheck__argv="pnpm typecheck:private"),
                            "privateTypecheck.argv: must be a non-empty argv array")
        self.write(self.with_change(stack__commands__install=None, stack__commands__lintFile=None,
                                    stack__commands__privateTypecheck=None))
        hc.load(self.root)  # the optional commands may be null
        self.assert_invalid(self.with_change(stack__commands__test=None), "stack.commands.test: must be a non-empty argv")

    # ---- keys and output ----
    def test_derived_keys(self) -> None:
        self.write(GOOD)
        config = hc.load(self.root)
        self.assertEqual(hc.get(config, "pod.codeWritable"), GOOD["areas"]["src"])
        self.assertEqual(hc.get(config, "pod.testWritable"), GOOD["areas"]["testPublic"])
        self.assertEqual(hc.get(config, "pod.agentAreas"), GOOD["areas"]["src"] + GOOD["areas"]["testPublic"])
        self.assertEqual(hc.get(config, "interactive.testWritable"), GOOD["areas"]["testPublic"] + GOOD["areas"]["testE2e"])

    def test_test_file_and_scenario_call_come_from_the_stack(self) -> None:
        self.write(self.with_change(stack__testFile=r"_test\.py$", stack__scenarioTestCall=r"@mark\("))
        self.assertEqual(self.cli("get", "testFile", "--regex")[1], "_test\\.py$\n")
        self.assertEqual(self.cli("get", "scenarioTestCall", "--regex")[1], "@mark\\(\n")

    def test_regex_output(self) -> None:
        self.write(GOOD)
        code, out, _ = self.cli("get", "pod.codeWritable", "--regex")
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), r"^(api/src|web/src|web/static\.files)/")
        rx = re.compile(out.strip())
        self.assertTrue(rx.match("web/static.files/a.png"))
        self.assertFalse(rx.match("web/staticXfiles/a.png"))  # the dot is escaped
        self.assertFalse(rx.match("api/srcx/a.ts"))
        self.assertEqual(self.cli("get", "testFile", "--regex")[1].strip(), r"\.test\.tsx?$")
        self.assertEqual(self.cli("get", "scenarioTestCall", "--regex")[1].rstrip("\n"), OLD_SCENARIO_TEST_CALL)

    def test_list_and_json_output(self) -> None:
        self.write(GOOD)
        self.assertEqual(self.cli("get", "packages", "--list")[1], "api\nweb\n")
        self.assertEqual(self.cli("get", "packages")[1], "api\nweb\n")
        self.assertEqual(json.loads(self.cli("get", "areas.testPrivate", "--json")[1]), GOOD["areas"]["testPrivate"])

    def test_stack_paths(self) -> None:
        self.write(GOOD)
        self.assertEqual(self.cli("get", "stack.appMarker")[1], "package.json\n")
        self.assertEqual(self.cli("get", "stack.runner")[1], "vitest\n")
        self.assertEqual(self.cli("get", "stack.commands.gate.1.label")[1], "typecheck frontend\n")
        self.assertEqual(self.cli("get", "stack.commands.gate", "--count")[1], "3\n")
        self.assertEqual(self.cli("get", "stack.commands.privateTypecheck.errorPattern")[1], "error TS[0-9]+\n")
        self.assertEqual(json.loads(self.cli("get", "stack.commands.gate.0", "--json")[1]),
                         {"label": "pnpm lint", "argv": ["pnpm", "lint"]})
        self.assertEqual(self.cli("get", "stack.commands.gate")[0], 2)  # a list of objects needs --json
        self.assertEqual(self.cli("get", "stack.commands.gate.3.label")[0], 2)
        self.assertEqual(self.cli("get", "stack.nope")[0], 2)
        self.assertEqual(self.cli("get", "stack.runner", "--count")[0], 2)

    # ---- argv: the TS profile gives exactly the command lines the scripts ran before the stack profile ----
    def test_ts_argv_is_the_same_as_before(self) -> None:
        self.write(GOOD)
        config = hc.load(self.root)
        # stop-gate.sh: `pnpm test`
        self.assertEqual(hc.argv(config, "test"), ["pnpm", "test"])
        # code-gate.sh: run "pnpm lint" pnpm lint; run "typecheck frontend" ...; run "pnpm test" pnpm test
        steps = [(hc.get(config, f"stack.commands.gate.{i}.label"), hc.argv(config, "gate", index=i)) for i in range(3)]
        self.assertEqual(steps, [("pnpm lint", ["pnpm", "lint"]),
                                 ("typecheck frontend", ["pnpm", "--filter", "frontend", "typecheck"]),
                                 ("pnpm test", ["pnpm", "test"])])
        self.assertIsNone(hc.argv(config, "gate", index=3))
        # red_check.py and dispatch.sh run_private: pnpm install --frozen-lockfile --prefer-offline
        self.assertEqual(hc.argv(config, "install"), ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"])
        # red_check.py vitest(): pnpm exec vitest run <files> --reporter=default --reporter=json --outputFile.json=<report>
        self.assertEqual(hc.argv(config, "runFiles", files=["test/public/a.test.ts", "test/public/b.test.tsx"],
                                 values={"report": "/tmp/x/report-api.json"}),
                         ["pnpm", "exec", "vitest", "run", "test/public/a.test.ts", "test/public/b.test.tsx",
                          "--reporter=default", "--reporter=json", "--outputFile.json=/tmp/x/report-api.json"])
        # dispatch.sh run_private: pnpm exec vitest run "$sub" --passWithNoTests --reporter=default --reporter=json
        #   --outputFile.json="$json"; then pnpm typecheck:private
        self.assertEqual(hc.argv(config, "private", values={"dir": "test/private", "report": "/wt/private-api.json"}),
                         ["pnpm", "exec", "vitest", "run", "test/private", "--passWithNoTests", "--reporter=default",
                          "--reporter=json", "--outputFile.json=/wt/private-api.json"])
        self.assertEqual(hc.argv(config, "privateTypecheck"), ["pnpm", "typecheck:private"])
        # lint-changed.mjs: pnpm exec eslint --quiet <file relative to the package>
        self.assertEqual(hc.argv(config, "lintFile", values={"file": "src/app/page.tsx"}),
                         ["pnpm", "exec", "eslint", "--quiet", "src/app/page.tsx"])

    def test_argv_cli(self) -> None:
        self.write(GOOD)
        code, out, _ = self.cli("argv", "private", "--set", "dir=test/private", "--set", "report=/r a.json")
        self.assertEqual(code, 0)
        self.assertEqual(out.split("\n")[:-1], ["pnpm", "exec", "vitest", "run", "test/private", "--passWithNoTests",
                                                "--reporter=default", "--reporter=json", "--outputFile.json=/r a.json"])
        code, out, _ = self.cli("argv", "runFiles", "--set", "report=/r.json", "--files", "a.test.ts", "b.test.ts")
        self.assertEqual(out.split("\n")[4:6], ["a.test.ts", "b.test.ts"])
        self.assertEqual(self.cli("argv", "gate", "--index", "1")[1], "pnpm\n--filter\nfrontend\ntypecheck\n")

    def test_argv_cli_errors(self) -> None:
        self.write(self.with_change(stack__commands__install=None))
        code, out, err = self.cli("argv", "install")
        self.assertEqual((code, out), (3, ""))
        self.assertIn("stack.commands.install is not set", err)
        self.assertEqual(self.cli("argv", "gate", "--index", "3")[0], 3)
        self.assertEqual(self.cli("argv", "gate")[0], 2)  # needs --index
        self.assertEqual(self.cli("argv", "private", "--set", "dir=x")[0], 2)  # {report} missing
        self.assertEqual(self.cli("argv", "runFiles", "--set", "report=r")[0], 2)  # --files missing
        self.assertEqual(self.cli("argv", "private", "--set", "dir=x", "--set", "report")[0], 2)
        self.assertEqual(self.cli("argv", "private", "--set", "dir=a\nb", "--set", "report=r")[0], 2)
        self.assertEqual(self.cli("argv", "nope")[0], 2)

    # ---- --config: a harness.json given as a file or on stdin (collect.sh: the version at base_sha) ----
    def run_main(self, argv: list[str], stdin: str | None = None) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        old = sys.stdin
        try:
            if stdin is not None:
                sys.stdin = io.StringIO(stdin)
            with redirect_stdout(out), redirect_stderr(err):
                code = hc.main(argv)
        finally:
            sys.stdin = old
        return code, out.getvalue(), err.getvalue()

    def test_config_from_stdin(self) -> None:
        code, out, _ = self.run_main(["get", "pod.agentAreas", "--regex", "--config", "-"], stdin=json.dumps(GOOD))
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), r"^(api/src|web/src|web/static\.files|api/test/public|web/test/public)/")

    def test_config_from_file_ignores_the_root(self) -> None:
        self.write(self.with_change(packages=["other"], areas__testPublic=["other/t"], areas__testPrivate=[],
                                    stack__commands__lintFile=None))
        f = self.root / "given.json"
        f.write_text(json.dumps(GOOD), encoding="utf-8")
        code, out, _ = self.run_main(["get", "packages", "--config", str(f)])
        self.assertEqual((code, out), (0, "api\nweb\n"))

    def test_config_is_checked_like_the_file(self) -> None:
        code, _, err = self.run_main(["get", "packages", "--config", "-"], stdin="{not json")
        self.assertEqual(code, 2)
        self.assertIn("not valid JSON", err)
        code, _, err = self.run_main(["get", "packages", "--config", "-"], stdin=json.dumps(self.with_change(version=3)))
        self.assertEqual(code, 2)
        self.assertIn("version must be 2", err)
        code, _, err = self.run_main(["argv", "test", "--config", "-"],
                                     stdin=json.dumps(self.with_change(stack__commands__test=["sh", "-c", "x"])))
        self.assertEqual(code, 2)
        self.assertIn("not a shell", err)
        code, _, err = self.run_main(["get", "packages", "--config", "-"], stdin="")
        self.assertEqual(code, 2)
        code, _, err = self.run_main(["get", "packages", "--config", str(self.root / "nope.json")])
        self.assertEqual(code, 2)
        self.assertIn("cannot be read", err)

    def test_config_and_root_are_exclusive(self) -> None:
        self.assertEqual(self.run_main(["get", "packages", "--config", "-", "--root", str(self.root)], stdin="{}")[0], 2)

    def test_unknown_key_or_option_exits_2(self) -> None:
        self.write(GOOD)
        self.assertEqual(self.cli("get", "areas.docs")[0], 2)
        self.assertEqual(self.cli("get", "packages", "--yaml")[0], 2)


if __name__ == "__main__":
    unittest.main()
