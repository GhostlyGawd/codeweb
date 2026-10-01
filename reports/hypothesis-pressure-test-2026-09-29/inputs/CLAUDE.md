# CLAUDE.md

**Read `CHARTER.md` before changing product behavior, public copy, or claims.**
The charter defines the problem, user, job, non-goals, invariants, and current
milestone.

Stop and ask the operator if a change conflicts with the charter. If the charter
does not cover a decision, add the question to the charter's **Open questions**
section in the same change. Do not make the decision silently.

For each release, run the `150 · Drift Audit`. Compare each claim-bearing
surface with `CHARTER.md`. Check the README, site copy, npm and plugin
descriptions, and `docs/ROADMAP.md`. Correct or remove each claim that drifted.

The operator owns the verification harness, and agents must not change it.
`docs/harness.md` contains the contract. ADR-0001 in `DECISIONS.md` records the
Codeweb deviations.

Run `sh scripts/check` as the single gate. If the gate appears incorrect, stop
and report the problem. The operator must authorize a gate change.
