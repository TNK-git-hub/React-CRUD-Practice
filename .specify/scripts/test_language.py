"""Harness files stay in English: no Vietnamese-only character in any tracked file of the harness.

Run: python3 -m unittest discover -s .specify/scripts

Every file in this repo is written in English (root CLAUDE.md, section Language; constitution, Language rule). This test
checks the harness part of it: the tracked files under SCOPE must not contain a character that only Vietnamese uses,
i.e. one of U+0103 U+00E2 U+0111 U+00EA U+00F4 U+01A1 U+01B0 (a-breve, a/e/o-circumflex, d-stroke, o/u-horn) and their
capitals, or a letter of the Unicode block U+1EA0–U+1EF9 (letters with a dot below, a hook above, …). Letters shared
with other languages (é, à, ñ, …) are not checked: they also appear in English text and in tool code.
Out of scope: docs/requirements/, specs/, bugs/ (their own rules: the constitution, the spec harness, the bug flow).
EXCEPTIONS lists the (file, line regex) pairs that are allowed anyway, each with the reason; keep it empty unless a
harness file must quote product text in another language.
"""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Folders (ending in "/") and files of the harness
SCOPE = (".claude/", ".specify/", "k8s/", "ci/", ".github/", "tools/", "CLAUDE.md", "README.md", ".gitignore")
# Written with escapes so that this file itself holds none of them
VIETNAMESE_ONLY = re.compile("[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]")
# (file, regex the line must match, reason)
EXCEPTIONS: tuple = ()


def in_scope(path: str) -> bool:
    return any(path.startswith(s) if s.endswith("/") else path == s for s in SCOPE)


def harness_files() -> list:
    out = subprocess.run(["git", "-C", str(REPO), "ls-files", "-z"], capture_output=True, text=True, check=True).stdout
    return sorted(p for p in out.split("\0") if p and in_scope(p))


def text_lines(path: str) -> list:
    """The lines of a UTF-8 text file; [] for a binary or non-UTF-8 file (images, archives)."""
    try:
        return (REPO / path).read_text(encoding="utf-8").split("\n")
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        return []


def excepted(path: str, line: str) -> bool:
    return any(f == path and re.search(rx, line) for f, rx, _ in EXCEPTIONS)


class LanguageTest(unittest.TestCase):
    def test_harness_files_have_no_vietnamese(self) -> None:
        found = []
        for path in harness_files():
            for n, line in enumerate(text_lines(path), 1):
                if VIETNAMESE_ONLY.search(line) and not excepted(path, line):
                    found.append(f"{path}:{n}: {line.strip()[:120]}")
        self.assertEqual(found, [], "Vietnamese text in harness files (write them in English):\n" + "\n".join(found))

    def test_the_scope_is_not_empty(self) -> None:
        files = harness_files()
        for must in ("CLAUDE.md", ".claude/CLAUDE.md", ".claude/hooks/guard.mjs", "k8s/agents/run.sh", ".gitignore"):
            self.assertIn(must, files)

    def test_every_exception_is_still_used(self) -> None:
        for path, rx, reason in EXCEPTIONS:
            used = any(re.search(rx, line) and VIETNAMESE_ONLY.search(line) for line in text_lines(path))
            self.assertTrue(used, f"{path} /{rx}/ ({reason}): no Vietnamese line matches any more; remove the exception")

    def test_the_character_class(self) -> None:
        # a sample of the class, as escapes (see VIETNAMESE_ONLY)
        for vi in ("ă", "Â", "đ", "Đ", "ê", "ô", "Ơ", "ư", "ạ", "ệ",
                   "ỹ", "Ấ"):
            self.assertRegex(vi, VIETNAMESE_ONLY)
        for other in ("é", "à", "ñ", "ü", "ç", "—", "→", "≤", "é。"):
            self.assertNotRegex(other, VIETNAMESE_ONLY)

    def test_out_of_scope_folders(self) -> None:
        for path in ("docs/requirements/a.md", "specs/changes/001-x/spec.md", "bugs/20261127-x/report.md", "frontend/src/a.ts"):
            self.assertFalse(in_scope(path), path)
        for path in (".claude/agents/x.md", "CLAUDE.md", ".gitignore", "tools/speckit-level4/preset.yml"):
            self.assertTrue(in_scope(path), path)


if __name__ == "__main__":
    unittest.main()
