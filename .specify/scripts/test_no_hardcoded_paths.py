"""No agent area is written into the harness scripts: they all read .claude/harness.json.

Run: python3 -m unittest discover -s .specify/scripts

For each script below, every line that is not a comment (and, for Python, not a docstring) must not contain:
an area path of harness.json as written ("backend/src"), with escaped slashes ("backend\\/src"), or the packages
joined as in a regex alternation or a shell list ("backend|frontend", "backend frontend"). The forbidden strings come
from the config itself, so a renamed area is still checked. Tests of the scripts and the docs are not scanned.
EXCEPTIONS lists the lines that are allowed anyway, each with the reason.
"""

from __future__ import annotations

import ast
import io
import re
import sys
import tokenize
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config as hc  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = (
    ".claude/hooks/guard.mjs",
    "k8s/agents/run.sh",
    "k8s/agents/collect.sh",
    "k8s/agents/dispatch.sh",
    ".specify/scripts/approval.py",
    ".specify/scripts/spec_check.py",
)
# (script, regex the line must match, reason). Keep this list short: every entry is a place to edit by hand when the
# folder layout changes.
EXCEPTIONS = (
    ("k8s/agents/run.sh", r"^You may only change files in ",
     "prompt text of the code-writer (RULES_CODE); prompts are not generated from the config (by request)"),
    ("k8s/agents/run.sh", r"^RULES_TEST=\"Follow CLAUDE\.md and the writing-good-tests skill\. You may only create",
     "prompt text of the test-writer (RULES_TEST)"),
    ("k8s/agents/run.sh", r"adapt paths to backend\|frontend/test/public",
     "prompt text of the Spec section given to every agent"),
    ("k8s/agents/run.sh", r"^Only plan Vitest tests in ",
     "prompt text of the test-planner"),
    ("k8s/agents/run.sh", r"DELETE: backend/test/public/foo\.test\.ts",
     "example in the prompt of the test-writer"),
    ("k8s/agents/dispatch.sh", r"^- (Code|New tests|Tests|The paths named in the task lines)",
     "task text generated for the agents by `dispatch.sh … -` (a prompt)"),
)


def forbidden_strings(config: dict) -> list[str]:
    areas = [a for k in hc.AREA_KEYS for a in config["areas"][k]]
    out = []
    for a in areas:
        out += [a, a.replace("/", "\\/")]
    pk = config["packages"]
    if len(pk) > 1:
        out += ["|".join(pk), "|".join(reversed(pk)), " ".join(pk), " ".join(reversed(pk))]
    return sorted(set(out), key=len, reverse=True)


def code_lines(path: Path) -> list[tuple[int, str]]:
    """(line number, text without comments) of every non-comment line; Python docstrings are dropped too."""
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    if path.suffix == ".py":
        skip: set[int] = set()
        for node in ast.walk(ast.parse(text)):
            body = getattr(node, "body", None)
            if isinstance(body, list) and body and isinstance(body[0], ast.Expr) \
                    and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
                skip.update(range(body[0].lineno, body[0].end_lineno + 1))
        cut: dict[int, int] = {}
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type == tokenize.COMMENT:
                cut[tok.start[0]] = tok.start[1]
        return [(i, line[: cut.get(i, len(line))]) for i, line in enumerate(lines, 1)
                if i not in skip and line[: cut.get(i, len(line))].strip()]
    marker = "//" if path.suffix in (".mjs", ".js") else "#"
    return [(i, line) for i, line in enumerate(lines, 1) if line.strip() and not line.strip().startswith(marker)]


def excepted(script: str, line: str) -> bool:
    return any(s == script and re.search(rx, line.strip()) for s, rx, _ in EXCEPTIONS)


class NoHardcodedPathsTest(unittest.TestCase):
    def test_scripts_read_areas_from_the_config(self) -> None:
        bad = forbidden_strings(hc.load(REPO))
        found = []
        for script in SCRIPTS:
            for n, line in code_lines(REPO / script):
                hits = [s for s in bad if s in line]
                if hits and not excepted(script, line):
                    found.append(f"{script}:{n}: {hits[0]!r} in: {line.strip()[:140]}")
        self.assertEqual(found, [], "hardcoded agent areas (read them from .claude/harness.json):\n" + "\n".join(found))

    def test_every_exception_is_still_used(self) -> None:
        # Fails after a layout change too: the excepted prompt lines still name the OLD areas. Then update the prompt
        # text to the new layout (and this list); if the line is gone, remove its entry.
        bad = forbidden_strings(hc.load(REPO))
        for script, rx, reason in EXCEPTIONS:
            used = any(re.search(rx, line.strip()) and any(s in line for s in bad) for _, line in code_lines(REPO / script))
            self.assertTrue(used, f"{script} /{rx}/ ({reason}): no current area on that line. The prompt may still "
                                  "name the old folder layout: update it to .claude/harness.json; if the line is gone, "
                                  "remove this exception")

    def test_forbidden_strings_come_from_the_config(self) -> None:
        config = {"packages": ["api", "web"], "areas": {"src": ["api/src"], "testPublic": ["api/test/public"],
                                                        "testE2e": [], "testPrivate": ["web/test/private"]}}
        bad = forbidden_strings(config)
        for s in ("api/src", "api\\/src", "web/test/private", "api|web", "web api"):
            self.assertIn(s, bad)
        self.assertNotIn("backend/src", bad)


if __name__ == "__main__":
    unittest.main()
