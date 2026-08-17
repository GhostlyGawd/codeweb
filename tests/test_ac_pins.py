"""Pinning tests for SPEC.md's built acceptance criteria (product layer).

`scripts/spec_lint.py` requires every `status: built` AC to have `ac_<n>` in
a test name under tests/ — these are those witnesses. Each pin is CHEAP
(never the full suite, never the full gate): the AC's `check:` command is
what brief 144 runs verbatim; the pin guards the wiring the check depends
on, so a broken claim fails the gate long before the ship gate.
"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))


def _run(cmd, timeout=60):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                          timeout=timeout)


class TestAcPins(unittest.TestCase):
    def test_ac_1_product_suite_is_wired_into_the_gate(self):
        self.assertEqual(PKG["scripts"]["test"],
                         'node --test "tests/**/*.test.mjs"')
        check = (ROOT / "scripts" / "check").read_text(encoding="utf-8")
        self.assertIn("npm test", check)

    def test_ac_2_consistency_gate_green(self):
        proc = _run(["node", "scripts/check-consistency.mjs"])
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("OK", proc.stdout)

    def test_ac_3_zero_runtime_dependencies(self):
        self.assertFalse(PKG.get("dependencies"),
                         "runtime dependencies must stay empty (charter invariant)")
        self.assertIn("web-tree-sitter", PKG.get("optionalDependencies", {}),
                      "the AST tier stays optional, never required")

    def test_ac_4_prove_red_and_hooks_wired(self):
        check = (ROOT / "scripts" / "check").read_text(encoding="utf-8")
        self.assertIn("--prove-red", check)
        self.assertIn("test_canary_prove_red", check)
        settings = json.loads((ROOT / ".claude" / "settings.json")
                              .read_text(encoding="utf-8"))
        self.assertIn("hook-check", json.dumps(settings["hooks"]["PostToolUse"]))
        pre_commit = (ROOT / ".githooks" / "pre-commit").read_text(encoding="utf-8")
        self.assertIn("scripts/check", pre_commit)

    def test_ac_5_tarball_excludes_harness(self):
        files = PKG["files"]
        for negation in ("!scripts/check", "!scripts/spec_lint.py",
                         "!scripts/hook-check", "!scripts/hook-protect"):
            self.assertIn(negation, files)

    def test_ac_6_cli_front_door_answers_help(self):
        proc = _run(["node", "bin/codeweb.mjs", "--help"])
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("usage: codeweb", proc.stdout)

    def test_ac_7_evals_floor_holds(self):
        proc = _run(["python3", "evals/run.py"], timeout=120)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("passed", proc.stdout)

    def test_ac_8_json_tier_wired(self):
        suite = ROOT / "tests" / "json-support.test.mjs"
        self.assertTrue(suite.exists(), "AC-8's check target must exist")
        extractor = (ROOT / "scripts" / "extract-symbols.mjs") \
            .read_text(encoding="utf-8")
        self.assertIn("jsonFiles", extractor,
                      "the extractor enumerates .json into the resolution universe")

    def test_ac_9_snapshot_diff_loop_wired(self):
        suite = ROOT / "tests" / "mcp-snapshot-diff.test.mjs"
        self.assertTrue(suite.exists(), "AC-9's check target must exist")
        refresh = (ROOT / "scripts" / "refresh.mjs").read_text(encoding="utf-8")
        self.assertIn("graph.prev.json", refresh,
                      "refresh --snapshot preserves the pre-refresh graph")
        server = (ROOT / "scripts" / "mcp-server.mjs").read_text(encoding="utf-8")
        self.assertIn("graph.prev.json", server,
                      "codeweb_diff defaults its before side to the snapshot")

    def test_ac_10_dependents_tool_wired(self):
        suite = ROOT / "tests" / "mcp-dependents.test.mjs"
        self.assertTrue(suite.exists(), "AC-10's check target must exist")
        specs = (ROOT / "scripts" / "lib" / "tool-specs.mjs") \
            .read_text(encoding="utf-8")
        self.assertIn("codeweb_dependents", specs,
                      "the union answer is declared once, in the D1 manifest")

    def test_ac_11_staleness_parity_wired(self):
        suite = ROOT / "tests" / "mcp-staleness-parity.test.mjs"
        self.assertTrue(suite.exists(), "AC-11's check target must exist")
        server = (ROOT / "scripts" / "mcp-server.mjs").read_text(encoding="utf-8")
        self.assertIn("staleForReply", server,
                      "spawned advisor replies carry the call-time verdict")

    def test_ac_12_agent_provenance_wired(self):
        suite = ROOT / "tests" / "agent-graph-label.test.mjs"
        self.assertTrue(suite.exists(), "AC-12's check target must exist")
        brief = (ROOT / "scripts" / "lib" / "brief-core.mjs") \
            .read_text(encoding="utf-8")
        self.assertIn("AGENT_ENGINES", brief,
                      "the briefing reads the fallback's provenance stamp")


if __name__ == "__main__":
    unittest.main()
