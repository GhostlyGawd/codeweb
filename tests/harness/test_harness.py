"""Tests of the harness itself: files present, hooks wired, the protect
hook blocking what it must, and the spec linter honest about bad specs.
This directory is part of the harness layer — operator-owned."""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

HARNESS_FILES = [
    "scripts/check",
    "scripts/spec_lint.py",
    "scripts/hook-check",
    "scripts/hook-protect",
    ".claude/settings.json",
    ".githooks/pre-commit",
    ".github/workflows/check.yml",
    ".github/CODEOWNERS",
]

GOOD_SPEC = """# SPEC — t
## Job
x
## Non-goals
- x
## Acceptance criteria
- **AC-1** — works | check: `true` | status: next
## Interfaces
x
## Evals
x
## Dependencies
- none
## Kill criteria
- x
"""


def _load_spec_lint():
    spec = importlib.util.spec_from_file_location(
        "spec_lint", ROOT / "scripts" / "spec_lint.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestHarnessFiles(unittest.TestCase):
    def test_every_harness_file_exists(self):
        for f in HARNESS_FILES:
            self.assertTrue((ROOT / f).exists(), f"harness file missing: {f}")

    def test_pre_commit_hook_is_executable(self):
        self.assertTrue(os.access(ROOT / ".githooks" / "pre-commit", os.X_OK),
                        ".githooks/pre-commit must be executable or git "
                        "silently skips it")

    def test_hooks_are_wired_in_settings(self):
        settings = json.loads((ROOT / ".claude" / "settings.json")
                              .read_text(encoding="utf-8"))
        hooks = settings["hooks"]
        pre = json.dumps(hooks["PreToolUse"])
        post = json.dumps(hooks["PostToolUse"])
        self.assertIn("hook-protect", pre)
        self.assertIn("hook-check", post)


class TestProtectHook(unittest.TestCase):
    def _run(self, file_path):
        payload = json.dumps(
            {"tool_name": "Edit", "tool_input": {"file_path": file_path}})
        return subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "hook-protect")],
            input=payload, capture_output=True, text=True,
            env={**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)})

    def test_blocks_the_harness_layer(self):
        for path in ("scripts/check", ".claude/settings.json",
                     ".github/workflows/check.yml", ".githooks/pre-commit",
                     "tests/harness/test_harness.py"):
            proc = self._run(str(ROOT / path))
            self.assertEqual(proc.returncode, 2, f"{path} was not blocked")
            self.assertIn("BLOCKED", proc.stderr)

    def test_allows_the_product_layer(self):
        for path in ("src/product.py", "tests/test_smoke.py", "SPEC.md",
                     "DECISIONS.md", "evals/cases/example-upper.json"):
            proc = self._run(str(ROOT / path))
            self.assertEqual(proc.returncode, 0, f"{path} was wrongly blocked")


class TestSpecLint(unittest.TestCase):
    """The linter is only worth trusting if it fails what it must fail."""

    def _lint(self, spec_text, extra=None):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "SPEC.md").write_text(spec_text, encoding="utf-8")
            (tmp / "tests").mkdir()
            for name, text in (extra or {}).items():
                dest = tmp / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(text, encoding="utf-8")
            mod = _load_spec_lint()
            mod.ROOT = tmp
            with contextlib.redirect_stdout(io.StringIO()):
                return mod.main()

    def test_good_spec_passes(self):
        self.assertEqual(self._lint(GOOD_SPEC), 0)

    def test_missing_section_fails(self):
        self.assertEqual(self._lint(GOOD_SPEC.replace("## Kill criteria", "## K")), 1)

    def test_malformed_ac_line_fails(self):
        bad = GOOD_SPEC.replace(
            "- **AC-1** — works | check: `true` | status: next",
            "- **AC-1** — works, trust me | status: next")
        self.assertEqual(self._lint(bad), 1)

    def test_built_without_pinning_test_fails(self):
        built = GOOD_SPEC.replace("status: next", "status: built")
        self.assertEqual(self._lint(built), 1)

    def test_built_with_pinning_test_passes(self):
        built = GOOD_SPEC.replace("status: next", "status: built")
        extra = {"tests/test_x.py": "def test_ac_1_works(): pass\n"}
        self.assertEqual(self._lint(built, extra), 0)

    def test_dependency_without_adr_fails(self):
        extra = {"requirements.txt": "requests==2.32.0\n",
                 "DECISIONS.md": "# DECISIONS\n\n## ADR-0001 — scaffold\n"}
        self.assertEqual(self._lint(GOOD_SPEC, extra), 1)

    def test_dependency_with_adr_passes(self):
        extra = {"requirements.txt": "requests==2.32.0\n",
                 "DECISIONS.md": "## ADR-0002 — add requests for the API client\n"}
        self.assertEqual(self._lint(GOOD_SPEC, extra), 0)


if __name__ == "__main__":
    unittest.main()
