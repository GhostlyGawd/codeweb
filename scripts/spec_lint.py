#!/usr/bin/env python3
"""Deterministic spec linter — the contract SPEC.md must honor.

Enforced, each as an exit-1 failure with the exact expected grammar:
  1. SPEC.md exists at the repo root and carries every required section.
  2. Every acceptance-criterion line parses:
       - **AC-n** — <criterion> | check: `<command>` | status: next|built|dropped
     AC ids are unique; at least one AC is not dropped.
  3. Every `status: built` AC has a pinning test: `ac_<n>` appears in a
     test name under tests/. Claiming built without a test is a lint
     failure, not a style issue.
  4. If requirements.txt lists a package, DECISIONS.md must name it in an
     ADR — dependencies without a recorded decision fail the gate.

stdlib only. Run: python3 scripts/spec_lint.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECTIONS = ["## Job", "## Non-goals", "## Acceptance criteria",
            "## Interfaces", "## Evals", "## Dependencies", "## Kill criteria"]
AC_GRAMMAR = ("- **AC-n** — <criterion> | check: `<command>` "
              "| status: next|built|dropped")
AC_RE = re.compile(r"^- \*\*AC-(\d+)\*\* — (.+?) \| check: `([^`]+)` "
                   r"\| status: (next|built|dropped)\s*$")


def main() -> int:
    errors = []
    spec_path = ROOT / "SPEC.md"
    if not spec_path.exists():
        print("FAIL  SPEC.md missing at repo root — run brief 142 · Spec the Product")
        return 1
    spec = spec_path.read_text(encoding="utf-8")

    for section in SECTIONS:
        if section not in spec:
            errors.append(f"SPEC.md missing required section '{section}'")

    acs, seen = [], set()
    for line in spec.splitlines():
        if not line.startswith("- **AC-"):
            continue
        m = AC_RE.match(line)
        if not m:
            errors.append(f"AC line does not parse: {line!r}\n"
                          f"        expected grammar: {AC_GRAMMAR}")
            continue
        n, _criterion, _check, status = m.groups()
        if n in seen:
            errors.append(f"duplicate id AC-{n} — ids are never reused "
                          f"(retire with status: dropped instead)")
        seen.add(n)
        acs.append((n, status))

    if not any(status != "dropped" for _n, status in acs):
        errors.append("SPEC.md has no live acceptance criteria — at least one "
                      "AC with status next or built is required")

    test_text = "\n".join(p.read_text(encoding="utf-8")
                          for p in (ROOT / "tests").rglob("*.py")
                          if p.is_file()) if (ROOT / "tests").exists() else ""
    for n, status in acs:
        if status == "built" and not re.search(rf"ac_{n}(?!\d)", test_text):
            errors.append(f"AC-{n} claims status: built but no test under "
                          f"tests/ mentions ac_{n} — write the pinning test "
                          f"or set status back to next")

    req = ROOT / "requirements.txt"
    if req.exists():
        decisions = (ROOT / "DECISIONS.md").read_text(encoding="utf-8") \
            if (ROOT / "DECISIONS.md").exists() else ""
        for raw in req.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            pkg = re.split(r"[<>=!~\[; ]", line)[0]
            if pkg and pkg not in decisions:
                errors.append(f"dependency '{pkg}' in requirements.txt has no "
                              f"ADR in DECISIONS.md naming it — record the "
                              f"decision or remove the package")

    if errors:
        for e in errors:
            print(f"FAIL  {e}")
        return 1
    live = sum(1 for _n, s in acs if s != "dropped")
    built = sum(1 for _n, s in acs if s == "built")
    print(f"OK  SPEC.md: {live} live AC(s), {built} built and test-pinned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
