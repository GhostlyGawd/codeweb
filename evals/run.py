#!/usr/bin/env python3
"""Golden-case eval runner (stdlib only). Part of scripts/check.

A case is one JSON file in evals/cases/:
  {
    "id": "human-readable-name",
    "command": "shell command to run",
    "input": "text piped to stdin (optional)",
    "expect_equals": "exact stdout, stripped"      // or:
    "expect_contains": "substring of stdout"       // or:
    "expect_regex": "regex searched in stdout",
    "timeout": 60                                   // seconds, optional
  }

Any failing case exits 1 (and therefore fails the gate, the hooks, and CI).
Zero cases is legal for pure-code products — judgment-shaped output must
have cases, and brief 144 checks that against SPEC.md's Evals section.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check(case: dict, stdout: str):
    if "expect_equals" in case:
        want = case["expect_equals"]
        return stdout.strip() == want, f"expected exactly {want!r}"
    if "expect_contains" in case:
        want = case["expect_contains"]
        return want in stdout, f"expected to contain {want!r}"
    if "expect_regex" in case:
        want = case["expect_regex"]
        return re.search(want, stdout) is not None, f"expected to match /{want}/"
    return False, "case has no expect_equals / expect_contains / expect_regex"


def main() -> int:
    cases = sorted((ROOT / "evals" / "cases").glob("*.json"))
    if not cases:
        print("evals: no cases — legal for pure-code products; "
              "judgment-shaped output needs cases (see SPEC.md · Evals)")
        return 0
    failures = 0
    for path in cases:
        case = json.loads(path.read_text(encoding="utf-8"))
        cid = case.get("id", path.stem)
        try:
            proc = subprocess.run(
                case["command"], shell=True, cwd=ROOT, text=True,
                input=case.get("input", ""), capture_output=True,
                timeout=int(case.get("timeout", 60)))
            ok, why = check(case, proc.stdout)
            if ok and proc.returncode != 0:
                ok, why = False, f"command exited {proc.returncode}"
        except subprocess.TimeoutExpired:
            ok, why = False, "timed out"
        print(f"{'ok  ' if ok else 'FAIL'}  {cid}" + ("" if ok else f" — {why}"))
        failures += 0 if ok else 1
    if failures:
        print(f"evals: {failures} of {len(cases)} case(s) failed")
        return 1
    print(f"evals: all {len(cases)} case(s) passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
