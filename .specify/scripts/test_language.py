"""Harness files stay in English: no Vietnamese-only character in any harness file of the repo.

Run: python3 -m unittest discover -s .specify/scripts

Every file in this repo is written in English (root CLAUDE.md, section Language; constitution, Language rule). This test
checks the harness part of it: the files under SCOPE must not contain a character that only Vietnamese uses, i.e. one of
U+0103 U+00E2 U+0111 U+00EA U+00F4 U+01A1 U+01B0 (a-breve, a/e/o-circumflex, d-stroke, o/u-horn) and their capitals, or a
letter of the Unicode block U+1EA0-U+1EF9 (letters with a dot below, a hook above, ...). Letters shared with other
languages (e-acute, a-grave, n-tilde, ...) are not checked: they also appear in English text and in tool code.
Files scanned: `git ls-files --cached --others --exclude-standard`, i.e. tracked files AND new files not added yet
(so a check run before `git add` sees them too); gitignored files are skipped.
Out of scope: docs/requirements/, specs/, bugs/ (their own rules: the constitution, the spec harness, the bug flow).
EXCEPTIONS lists the (file, line regex) pairs that are allowed anyway, each with the reason; keep it empty unless a
harness file must quote product text in another language.
This file is pure ASCII: the character class is built from code points.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Folders (ending in "/") and files of the harness
SCOPE = (".claude/", ".specify/", "k8s/", "ci/", ".github/", "tools/", "CLAUDE.md", "README.md", ".gitignore")
# a-breve, a/e/o-circumflex, d-stroke, o/u-horn (small, then capital), then the block U+1EA0-U+1EF9
SINGLE_CODE_POINTS = (0x103, 0xE2, 0x111, 0xEA, 0xF4, 0x1A1, 0x1B0, 0x102, 0xC2, 0x110, 0xCA, 0xD4, 0x1A0, 0x1AF)
BLOCK = (0x1EA0, 0x1EF9)
VIETNAMESE_ONLY = re.compile(
    "[" + "".join(re.escape(chr(c)) for c in SINGLE_CODE_POINTS) + re.escape(chr(BLOCK[0])) + "-" + re.escape(chr(BLOCK[1])) + "]"
)
# (file, regex the line must match, reason)
EXCEPTIONS: tuple = ()


def in_scope(path: str) -> bool:
    return any(path.startswith(s) if s.endswith("/") else path == s for s in SCOPE)


def harness_files(root: Path = REPO) -> list:
    """Tracked and untracked (not ignored) files under SCOPE, relative to root."""
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                         capture_output=True, text=True, check=True).stdout
    return sorted({p for p in out.split("\0") if p and in_scope(p)})


def text_lines(path: str, root: Path = REPO) -> list:
    """The lines of a UTF-8 text file; [] for a binary or non-UTF-8 file, or one deleted from the working tree."""
    try:
        return (root / path).read_text(encoding="utf-8").split("\n")
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        return []


def excepted(path: str, line: str) -> bool:
    return any(f == path and re.search(rx, line) for f, rx, _ in EXCEPTIONS)


def scan(root: Path = REPO) -> list:
    """`<path>:<line>: <text>` for every line of a harness file that holds a Vietnamese-only character."""
    found = []
    for path in harness_files(root):
        for n, line in enumerate(text_lines(path, root), 1):
            if VIETNAMESE_ONLY.search(line) and not excepted(path, line):
                found.append(f"{path}:{n}: {line.strip()[:120]}")
    return found


class LanguageTest(unittest.TestCase):
    def test_harness_files_have_no_vietnamese(self) -> None:
        found = scan()
        self.assertEqual(found, [], "Vietnamese text in harness files (write them in English):\n" + "\n".join(found))

    def test_the_scope_is_not_empty(self) -> None:
        files = harness_files()
        for must in ("CLAUDE.md", ".claude/CLAUDE.md", ".claude/hooks/guard.mjs", "k8s/agents/run.sh", ".gitignore",
                     ".specify/scripts/test_language.py"):
            self.assertIn(must, files)

    def test_every_exception_is_still_used(self) -> None:
        for path, rx, reason in EXCEPTIONS:
            used = any(re.search(rx, line) and VIETNAMESE_ONLY.search(line) for line in text_lines(path))
            self.assertTrue(used, f"{path} /{rx}/ ({reason}): no Vietnamese line matches any more; remove the exception")

    def test_the_character_class(self) -> None:
        vietnamese = [chr(c) for c in SINGLE_CODE_POINTS] + [chr(0x1EA0), chr(0x1EA1), chr(0x1EA4), chr(0x1EC7), chr(0x1EF9)]
        for ch in vietnamese:
            self.assertRegex(ch, VIETNAMESE_ONLY)
        # e-acute, a-grave, n-tilde, u-diaeresis, c-cedilla, em dash, arrow, less-or-equal, ideographic full stop,
        # and the code points just outside the block
        for c in (0xE9, 0xE0, 0xF1, 0xFC, 0xE7, 0x2014, 0x2192, 0x2264, 0x3002, 0x1E9F, 0x1EFA):
            self.assertNotRegex(chr(c), VIETNAMESE_ONLY)
        self.assertNotRegex("plain ASCII text", VIETNAMESE_ONLY)

    def test_out_of_scope_folders(self) -> None:
        for path in ("docs/requirements/a.md", "specs/changes/001-x/spec.md", "bugs/20261127-x/report.md", "frontend/src/a.ts"):
            self.assertFalse(in_scope(path), path)
        for path in (".claude/agents/x.md", "CLAUDE.md", ".gitignore", "tools/speckit-level4/preset.yml"):
            self.assertTrue(in_scope(path), path)

    def test_this_file_is_ascii(self) -> None:
        Path(__file__).read_bytes().decode("ascii")  # raises UnicodeDecodeError on any non-ASCII byte


class ScanRepoTest(unittest.TestCase):
    """scan() on a throw-away repository: tracked, untracked, ignored and out-of-scope files."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name).resolve()
        subprocess.run(["git", "-C", str(self.root), "init", "-q"], check=True)
        self.vi_line = "x " + chr(0x1EA1) + chr(0x103) + " y"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, path: str, text: str) -> None:
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def test_an_untracked_file_in_scope_is_reported(self) -> None:
        self.write(".claude/agents/new.md", "English line\n" + self.vi_line + "\n")
        self.assertEqual(scan(self.root), [".claude/agents/new.md:2: " + self.vi_line])

    def test_a_tracked_file_in_scope_is_reported(self) -> None:
        self.write("k8s/agents/x.sh", "# " + self.vi_line + "\n")
        subprocess.run(["git", "-C", str(self.root), "add", "-A"], check=True)
        self.assertEqual(scan(self.root), ["k8s/agents/x.sh:1: # " + self.vi_line])

    def test_ignored_and_out_of_scope_files_are_not_reported(self) -> None:
        self.write(".gitignore", "*.log\n")
        self.write(".claude/debug.log", self.vi_line + "\n")
        self.write("specs/changes/001-x/spec.md", self.vi_line + "\n")
        self.write("bugs/20261127-x/report.md", self.vi_line + "\n")
        self.write("CLAUDE.md", "English only\n")
        self.assertEqual(scan(self.root), [])


if __name__ == "__main__":
    unittest.main()
