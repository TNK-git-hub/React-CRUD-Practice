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
GOOD = {
    "version": 1,
    "packages": ["api", "web"],
    "areas": {
        "src": ["api/src", "web/src", "web/static.files"],
        "testPublic": ["api/test/public", "web/test/public"],
        "testE2e": ["web/test/e2e"],
        "testPrivate": ["api/test/private", "web/test/private"],
    },
    "testFile": r"\.test\.tsx?$",
}


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
        data = json.loads(json.dumps(GOOD))
        for dotted, value in changes.items():
            node = data
            *parents, last = dotted.split("__")
            for k in parents:
                node = node[k]
            if value is ...:
                del node[last]
            else:
                node[last] = value
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

    # ---- the repo's own file ----
    def test_repo_config_is_valid(self) -> None:
        config = hc.load(REPO)
        self.assertEqual(config["version"], 1)
        self.assertTrue(config["areas"]["src"])

    # ---- schema ----
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
        self.assert_invalid(self.with_change(version=2), "version must be 1")

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

    def test_test_file_regex(self) -> None:
        self.assert_invalid(self.with_change(testFile="("), "testFile is not a valid regex")
        self.assert_invalid(self.with_change(testFile=3), "testFile must be a regex string")

    # ---- keys and output ----
    def test_derived_keys(self) -> None:
        self.write(GOOD)
        config = hc.load(self.root)
        self.assertEqual(hc.get(config, "pod.codeWritable"), GOOD["areas"]["src"])
        self.assertEqual(hc.get(config, "pod.testWritable"), GOOD["areas"]["testPublic"])
        self.assertEqual(hc.get(config, "pod.agentAreas"), GOOD["areas"]["src"] + GOOD["areas"]["testPublic"])
        self.assertEqual(hc.get(config, "interactive.testWritable"), GOOD["areas"]["testPublic"] + GOOD["areas"]["testE2e"])

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

    def test_list_and_json_output(self) -> None:
        self.write(GOOD)
        self.assertEqual(self.cli("get", "packages", "--list")[1], "api\nweb\n")
        self.assertEqual(self.cli("get", "packages")[1], "api\nweb\n")
        self.assertEqual(json.loads(self.cli("get", "areas.testPrivate", "--json")[1]), GOOD["areas"]["testPrivate"])

    def test_unknown_key_or_option_exits_2(self) -> None:
        self.write(GOOD)
        self.assertEqual(self.cli("get", "areas.docs")[0], 2)
        self.assertEqual(self.cli("get", "packages", "--yaml")[0], 2)


if __name__ == "__main__":
    unittest.main()
