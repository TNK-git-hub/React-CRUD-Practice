"""Tests for allow_paths.py, run as a real subprocess like Claude Code does.

Run: python3 -m unittest discover -s .claude/hooks
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "allow_paths.py"
SPEC_WRITER = ["specs/changes/", ".specify/feature.json"]
PLANNER = ["specs/changes/", "!specs/changes/*/spec.md"]
ROOT_FILES = ["*"]  # generic rule: a pattern without "/" only matches files in the repo root


class AllowPathsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name).resolve()
        for d in ("specs/changes/001-x", "specs/capabilities/products", "src", ".claude"):
            (self.root / d).mkdir(parents=True)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_hook(self, rules: list[str], payload, env_root: bool = True) -> tuple[int, str]:
        env = {k: v for k, v in os.environ.items() if k != "CLAUDE_PROJECT_DIR"}
        if env_root:
            env["CLAUDE_PROJECT_DIR"] = str(self.root)
        stdin = payload if isinstance(payload, str) else json.dumps(payload)
        proc = subprocess.run([sys.executable, str(HOOK), *rules], input=stdin, text=True,
                              capture_output=True, env=env, cwd=self.root)
        return proc.returncode, proc.stderr

    def write(self, rules: list[str], path: str, **extra) -> tuple[int, str]:
        return self.run_hook(rules, {"tool_name": "Write", "cwd": str(self.root),
                                     "tool_input": {"file_path": path, "content": "x"}, **extra})

    # ---- the roadmap check ------------------------------------------------------

    def test_roadmap_example(self) -> None:
        code, err = self.write(["specs/changes/"], "src/a.ts")
        self.assertEqual(code, 2)
        self.assertIn("outside the allowed paths", err)
        self.assertEqual(self.write(["specs/changes/"], "specs/changes/x.md")[0], 0)

    # ---- allow ------------------------------------------------------------------

    def test_absolute_path_inside_dir(self) -> None:
        self.assertEqual(self.write(SPEC_WRITER, str(self.root / "specs/changes/001-x/spec.md"))[0], 0)

    def test_exact_file(self) -> None:
        self.assertEqual(self.write(SPEC_WRITER, ".specify/feature.json")[0], 0)
        self.assertEqual(self.write(SPEC_WRITER, ".specify/feature.json.bak")[0], 2)

    def test_dir_rule_does_not_match_prefix_sibling(self) -> None:
        self.assertEqual(self.write(["src/"], "src2/a.ts")[0], 2)
        self.assertEqual(self.write(["src/"], "src")[0], 2)

    def test_root_glob_only_matches_root_files(self) -> None:
        self.assertEqual(self.write(ROOT_FILES, "package.json")[0], 0)
        self.assertEqual(self.write(ROOT_FILES, ".gitignore")[0], 0)
        self.assertEqual(self.write(ROOT_FILES, ".claude/CLAUDE.md")[0], 2)
        self.assertEqual(self.write(ROOT_FILES, "specs/capabilities/products/spec.md")[0], 2)

    def test_notebook_path(self) -> None:
        payload = {"tool_name": "NotebookEdit", "tool_input": {"notebook_path": "src/a.ipynb"}}
        self.assertEqual(self.run_hook(["src/"], payload)[0], 0)

    def test_root_from_cwd_when_env_missing(self) -> None:
        payload = {"cwd": str(self.root), "tool_input": {"file_path": str(self.root / "src/a.ts")}}
        self.assertEqual(self.run_hook(["src/"], payload, env_root=False)[0], 0)

    # ---- deny -------------------------------------------------------------------

    def test_deny_wins(self) -> None:
        code, err = self.write(PLANNER, "specs/changes/001-x/spec.md")
        self.assertEqual(code, 2)
        self.assertIn("deny rule", err)
        self.assertEqual(self.write(PLANNER, "specs/changes/001-x/tasks.md")[0], 0)

    def test_deny_glob_does_not_cross_directories(self) -> None:
        # '*' is one path segment: a nested spec.md deeper down is not the change spec
        self.assertEqual(self.write(PLANNER, "specs/changes/001-x/contracts/spec.md")[0], 0)

    def test_dotdot_cannot_escape(self) -> None:
        code, err = self.write(SPEC_WRITER, "specs/changes/../capabilities/products/spec.md")
        self.assertEqual(code, 2)
        self.assertIn("specs/capabilities/products/spec.md", err)

    def test_outside_project(self) -> None:
        code, err = self.write(["specs/changes/"], "/etc/passwd")
        self.assertEqual(code, 2)
        self.assertIn("outside the project", err)

    def test_symlink_out_of_allowed_dir(self) -> None:
        link = self.root / "specs/changes/link"
        try:
            link.symlink_to(self.root / "specs/capabilities", target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks not available")
        self.assertEqual(self.write(SPEC_WRITER, "specs/changes/link/products/spec.md")[0], 2)

    # ---- fail closed ------------------------------------------------------------

    def test_bad_json(self) -> None:
        self.assertEqual(self.run_hook(["src/"], "not json")[0], 2)

    def test_missing_file_path(self) -> None:
        self.assertEqual(self.run_hook(["src/"], {"tool_input": {}})[0], 2)

    def test_no_rules(self) -> None:
        self.assertEqual(self.write([], "src/a.ts")[0], 2)

    def test_message_tells_agent_to_report(self) -> None:
        _, err = self.write(SPEC_WRITER, "src/App.tsx", agent_type="spec-writer")
        self.assertIn("spec-writer may only write to: specs/changes/ .specify/feature.json", err)
        self.assertIn("report it to the user", err)


if __name__ == "__main__":
    unittest.main()
