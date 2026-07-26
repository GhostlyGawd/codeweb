# CLAUDE.md

**Read `CHARTER.md` before changing product behavior, public copy, or claims.**
It is the contract: problem, user, job, non-goals, invariants, and the current
milestone. If a change contradicts it, stop and ask the operator. If the charter
is silent on something a change decides, add the question to the charter's Open
questions section in the same change — never settle it silently.

Drift audit (150 · Drift Audit): each release, re-check every claim-bearing
surface — README, site copy, npm/plugin descriptions, `docs/ROADMAP.md` —
against `CHARTER.md`, and fix or strike what drifted.

The verification harness is operator-owned and agent-read-only — see
`docs/harness.md` (the contract) and ADR-0001 in `DECISIONS.md` (the
codeweb deviations). `sh scripts/check` is the one gate; if the gate itself
seems wrong, stop and report — the fix belongs to the operator.
