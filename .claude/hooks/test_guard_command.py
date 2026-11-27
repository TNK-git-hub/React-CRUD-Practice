"""The guard command of .claude/settings.json blocks when guard.mjs cannot run.

Run: python3 -m unittest discover -s .claude/hooks
A PreToolUse hook blocks only on exit 2; any other non-zero exit is a hook error and the tool call goes ahead. So a
guard.mjs with a syntax error, an uncaught exception, or a missing node binary (exit 127) would let every call through.
The command in settings.json ends in "|| exit 2" to turn those into a block. These tests read the exact command from
.claude/settings.json and run it with `sh -c`, as Claude Code does, against a temporary project
(CLAUDE_PROJECT_DIR) whose .claude/hooks/guard.mjs is broken, valid, or the real one.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SH = shutil.which("sh") or "/bin/sh"
NODE = shutil.which("node")
HOOK_INPUT = json.dumps({"tool_name": "Read", "tool_input": {"file_path": "README.md"}, "agent_type": None})


def guard_command() -> str:
    """The one PreToolUse command of .claude/settings.json that runs guard.mjs."""
    settings = json.loads((REPO / ".claude/settings.json").read_text(encoding="utf-8"))
    commands = [h["command"] for entry in settings["hooks"]["PreToolUse"] for h in entry["hooks"]
                if "guard.mjs" in h.get("command", "")]
    assert len(commands) == 1, f"expected one guard command in .claude/settings.json, found {commands}"
    return commands[0]


class GuardCommandTest(unittest.TestCase):
    def setUp(self) -> None:
        # no skip without node: the guard needs it on every machine that runs Claude Code here (CI runners have it)
        self.assertTrue(NODE, "node not found on PATH")
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name).resolve()
        (self.project / ".claude/hooks").mkdir(parents=True)
        self.empty_bin = self.project / "empty-bin"  # a PATH without node
        self.empty_bin.mkdir()

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_command(self, guard_source: str | None, path: str | None = None,
                    hook_input: str = HOOK_INPUT) -> subprocess.CompletedProcess:
        if guard_source is None:  # the real guard, with the real harness.json beside it
            shutil.copy(REPO / ".claude/hooks/guard.mjs", self.project / ".claude/hooks/guard.mjs")
            shutil.copy(REPO / ".claude/harness.json", self.project / ".claude/harness.json")
        else:
            (self.project / ".claude/hooks/guard.mjs").write_text(guard_source, encoding="utf-8")
        env = {**os.environ, "CLAUDE_PROJECT_DIR": str(self.project), "PATH": path or os.environ.get("PATH", "")}
        return subprocess.run([SH, "-c", guard_command()], input=hook_input, capture_output=True, text=True,
                              env=env, cwd=self.project)

    def test_a_syntax_error_in_the_guard_blocks(self) -> None:
        self.assertEqual(self.run_command("const = ;\n").returncode, 2)

    def test_an_uncaught_exception_in_the_guard_blocks(self) -> None:
        self.assertEqual(self.run_command('throw new Error("x");\n').returncode, 2)

    def test_a_guard_that_exits_0_allows(self) -> None:
        self.assertEqual(self.run_command("process.exit(0);\n").returncode, 0)

    def test_node_missing_from_path_blocks(self) -> None:
        self.assertEqual(self.run_command(None, path=str(self.empty_bin)).returncode, 2)

    def test_the_real_guard_keeps_its_decisions(self) -> None:
        # allow stays exit 0, a block stays exit 2 with the guard's own message on stderr
        self.assertEqual(self.run_command(None).returncode, 0)
        blocked = self.run_command(None, hook_input=json.dumps(
            {"tool_name": "Write", "tool_input": {"file_path": "x/test/private/a.test.ts"}, "agent_type": None}))
        self.assertEqual(blocked.returncode, 2)
        self.assertIn("[guard]", blocked.stderr)


if __name__ == "__main__":
    unittest.main()
