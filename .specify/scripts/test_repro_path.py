"""Tests for the reproduction-test path check of k8s/agents/dispatch.sh and k8s/agents/run.sh (bug mode): their
self-contained block repro_path, sourced in bash.

Run: python3 -m unittest discover -s .specify/scripts
The check joins stack.testFile into a larger ERE (test area prefix + file name + testFile). testFile must be joined as
a group: with a top-level "|" (\\.test\\.ts$|\\.spec\\.ts$) the second alternative would otherwise match any path
ending in .spec.ts, outside the test area too. The test area regex comes from .claude/harness.json, as in the scripts.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config as hc  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = ("k8s/agents/dispatch.sh", "k8s/agents/run.sh")
BASH = shutil.which("bash") or "/bin/bash"
CONFIG = json.loads((REPO / ".claude/harness.json").read_text(encoding="utf-8"))
TEST_RE = hc.as_regex(hc.get(CONFIG, "pod.testWritable"))
PUBLIC = hc.get(CONFIG, "pod.testWritable")[0]  # a public test area, e.g. "<package>/test/public"
SRC = hc.get(CONFIG, "pod.codeWritable")[0]  # a code area, e.g. "<package>/src"
ALT = r"\.test\.ts$|\.spec\.ts$"
GROUPED = r"\.(test|spec)\.ts$"


def block(script: str) -> str:
    text = (REPO / script).read_text(encoding="utf-8")
    m = re.search(r"^# >>> repro_path\b.*?$(.*?)^# <<< repro_path$", text, re.S | re.M)
    assert m, f"block repro_path not found in {script}"
    return m.group(1)


def accepted(script: str, path: str, test_file: str) -> bool:
    """repro_path_ok of the script's block, in bash, for one path; True when it accepts the path."""
    r = subprocess.run([BASH, "-c", block(script) + '\nrepro_path_ok "$1" "$2" "$3"', "repro", path, TEST_RE, test_file],
                       capture_output=True, text=True)
    return r.returncode == 0


class ReproPathTest(unittest.TestCase):
    def check(self, test_file: str, path: str, want: bool) -> None:
        for script in SCRIPTS:
            with self.subTest(script=script, testFile=test_file, path=path):
                self.assertEqual(accepted(script, path, test_file), want)

    def test_top_level_alternation_cannot_escape_the_test_area(self) -> None:
        self.check(ALT, f"{SRC}/a.spec.ts", False)
        self.check(ALT, f"{SRC}/a.test.ts", False)
        self.check(ALT, "a.spec.ts", False)
        self.check(ALT, f"{SRC}/x {PUBLIC}/a.spec.ts", False)

    def test_top_level_alternation_accepts_both_kinds_of_test_file(self) -> None:
        self.check(ALT, f"{PUBLIC}/a.spec.ts", True)
        self.check(ALT, f"{PUBLIC}/sub/a.test.ts", True)
        self.check(ALT, f"{PUBLIC}/a.ts", False)

    def test_alternation_inside_a_group_still_works(self) -> None:
        self.check(GROUPED, f"{PUBLIC}/a.spec.ts", True)
        self.check(GROUPED, f"{PUBLIC}/a.test.ts", True)
        self.check(GROUPED, f"{SRC}/a.spec.ts", False)

    def test_dot_dot_is_rejected(self) -> None:
        self.check(ALT, f"{PUBLIC}/../../{SRC}/a.spec.ts", False)

    def test_the_profiles_test_files(self) -> None:
        for name, good, bad in (("ts-pnpm-vitest", "a.test.tsx", "a.spec.ts"), ("python-pytest", "abc_test.py", "abc.py")):
            stack = json.loads((REPO / ".claude/stacks" / f"{name}.json").read_text(encoding="utf-8"))
            self.check(stack["testFile"], f"{PUBLIC}/{good}", True)
            self.check(stack["testFile"], f"{PUBLIC}/{bad}", False)
            self.check(stack["testFile"], f"{SRC}/{good}", False)

    def test_both_scripts_hold_the_same_check(self) -> None:
        self.assertEqual(block(SCRIPTS[0]), block(SCRIPTS[1]))


if __name__ == "__main__":
    unittest.main()
