"""Tests for lint-changed.mjs (PostToolUse hook), run with node in a throwaway project with a fake `pnpm` on PATH.

Run: python3 -m unittest discover -s .claude/hooks
The fake logs its arguments and working folder, so the tests check the exact command line of the TS profile
(the one the hook ran before the stack profile: `pnpm exec eslint --quiet <file>` in frontend/).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
NODE = shutil.which("node")
FAKE_PNPM = """#!/bin/sh
printf '%s\\n' "$(pwd)|$*" >> "$FAKE_PNPM_LOG"
echo "fake lint output"
exit "${FAKE_PNPM_EXIT:-0}"
"""


@unittest.skipIf(NODE is None, "node is not installed")
class LintChangedTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name).resolve()
        self.root = base / "repo"
        for d in (".claude", "frontend/src", "backend/src"):  # the hook runs the linter in the package folder
            (self.root / d).mkdir(parents=True)
        shutil.copy(REPO / ".claude/harness.json", self.root / ".claude/harness.json")
        self.bin = base / "bin"
        self.bin.mkdir()
        (self.bin / "pnpm").write_text(FAKE_PNPM)
        (self.bin / "pnpm").chmod(0o755)
        self.log = base / "pnpm.log"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_hook(self, file_path: str, pnpm_exit: int = 0) -> tuple[int, str]:
        env = {**os.environ, "CLAUDE_PROJECT_DIR": str(self.root), "FAKE_PNPM_LOG": str(self.log),
               "FAKE_PNPM_EXIT": str(pnpm_exit), "PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}"}
        payload = {"tool_name": "Edit", "tool_input": {"file_path": file_path}, "cwd": str(self.root)}
        r = subprocess.run([NODE, str(REPO / ".claude/hooks/lint-changed.mjs")], input=json.dumps(payload),
                           env=env, capture_output=True, text=True)
        return r.returncode, r.stderr

    def calls(self) -> list[str]:
        return self.log.read_text().splitlines() if self.log.exists() else []

    def set_lint(self, lint: object) -> None:
        p = self.root / ".claude/harness.json"
        cfg = json.loads(p.read_text())
        cfg["stack"]["commands"]["lintFile"] = lint
        p.write_text(json.dumps(cfg))

    def test_ts_runs_eslint_on_the_file_in_the_frontend(self) -> None:
        self.assertEqual(self.run_hook("frontend/src/app/page.tsx"), (0, ""))
        self.assertEqual(self.calls(), [f"{self.root / 'frontend'}|exec eslint --quiet src/app/page.tsx"])

    def test_absolute_path(self) -> None:
        self.run_hook(str(self.root / "frontend/src/a.mjs"))
        self.assertEqual(self.calls(), [f"{self.root / 'frontend'}|exec eslint --quiet src/a.mjs"])

    def test_errors_block_with_the_same_message(self) -> None:
        code, err = self.run_hook("frontend/src/a.ts", pnpm_exit=1)
        self.assertEqual(code, 2)
        self.assertIn("eslint reports errors in frontend/src/a.ts; fix them before going on:", err)
        self.assertIn("fake lint output", err)

    def test_files_outside_the_scope_are_not_linted(self) -> None:
        # the same scope as before: ^frontend/.+\.(ts|tsx|js|jsx|mjs)$
        for f in ("backend/src/a.ts", "frontend/src/a.css", "frontend/.ts", "frontendx/src/a.ts", "README.md",
                  "frontend/src/a.ts.bak"):
            with self.subTest(f):
                self.assertEqual(self.run_hook(f)[0], 0)
        self.assertEqual(self.calls(), [])

    def test_scope_and_command_come_from_the_profile(self) -> None:
        self.set_lint({"package": "backend", "match": r"\.py$", "argv": ["pnpm", "ruff", "check", "{file}"]})
        self.run_hook("frontend/src/a.ts")
        self.run_hook("backend/src/app/x.py")
        self.assertEqual(self.calls(), [f"{self.root / 'backend'}|ruff check src/app/x.py"])

    def test_no_lint_command_or_bad_config_lints_nothing(self) -> None:
        for lint in (None, {"package": "frontend"}, {"package": "frontend", "match": "(", "argv": ["pnpm"]}):
            with self.subTest(lint=lint):
                self.set_lint(lint)
                self.assertEqual(self.run_hook("frontend/src/a.ts")[0], 0)
        (self.root / ".claude/harness.json").write_text("{not json")
        self.assertEqual(self.run_hook("frontend/src/a.ts")[0], 0)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
