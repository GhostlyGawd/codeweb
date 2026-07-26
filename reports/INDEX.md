# INDEX — All Build Goal Prompts run, 2026-07-26

Conductor run of the **All Build Goal Prompts** playbook: the four Build briefs (141→144) in
sequence, one report per stage, every stage read-only toward the codebase (each stage's only
write is its own report). Run artifacts: branch `claude/all-build-goal-prompts-08cn4y`,
PR #80, one commit per report — recover the whole trail with
`git log --grep "All Build Goal Prompts"`.

**The run's single pending question:** `reports/SCAFFOLD.md` ends at brief 141's mandatory
operator gate — **install** the goal-prompts harness as planned (15-file graft with ratified
rewrites (a)–(d)), **adjust**, or **abort**? Stages 2–4 all nulled on the harness being
absent, so that one answer unblocks the entire pipeline: install → 142 writes the ratified
root `SPEC.md` → 143 builds ACs test-first → 144 re-runs as the real adversarial ship gate.

## Stages

| # | Brief | Report | Result |
|---|---|---|---|
| 1/4 | [141 · Scaffold the Rails](https://goal-prompts.vercel.app/raw/141.md) | `SCAFFOLD.md` | Full audit — 5 ranked findings, gate-stopped |
| 2/4 | [142 · Spec the Product](https://goal-prompts.vercel.app/raw/142.md) | `SPEC.md` | **Null report** (by the brief's own rule) |
| 3/4 | [143 · Implement to Spec](https://goal-prompts.vercel.app/raw/143.md) | `BUILDLOG.md` | **Null report** (by the brief's own rule) |
| 4/4 | [144 · Ship Gate](https://goal-prompts.vercel.app/raw/144.md) | `SHIP-GATE.md` | **Null report** (by the brief's own rule) |

## Reports, one line each

- **`SCAFFOLD.md`** — 5 findings. Next steps: (1) answer the install/adjust/abort gate —
  everything else waits on it; (2) if installing, ratify the four `scripts/check` lines, the
  narrowed PROTECTED/CODEOWNERS manifest (verbatim, the template would lock agents out of
  `scripts/`, which *is* the shipped product), and the npm `files` negations so no harness
  file ships in the tarball; (3) rule the two charter-silent boundaries — root `DECISIONS.md`
  vs `docs/decisions/`, and where the template contract lands (proposal: `docs/harness.md`).
- **`SPEC.md`** — null (0 findings): no `scripts/spec_lint.py`, so no spec can be written
  against the gate's format. Next: answer 141's gate, then re-run 142 to write the real,
  lint-clean `SPEC.md` at the repo root.
- **`BUILDLOG.md`** — null (0 findings): no root `SPEC.md`, `scripts/check`, or
  `DECISIONS.md`; nothing to build against. Notes the product itself is green (918 tests,
  870 pass, 0 fail, 48 env skips). Next: re-run 143 after 142 produces the ratified spec.
- **`SHIP-GATE.md`** — null (0 findings): no bars, ACs, gate, eval floor, or revenue path to
  judge; no ship/hold ruling issued. Notes the repo's own release discipline stands
  (`ci.yml`, `release.yml`, `check-consistency` exit 0). Next: re-run 144 after 143 builds.

## For a session starting cold

Read `reports/SCAFFOLD.md` first — it holds the whole state: the install plan (Phase 3,
steps 1–5), the exact lines awaiting ratification (lens 4 and 5), the operator TODO
checklist, and the gate question. The three nulls only confirm the pipeline is blocked on
that gate. `CHARTER.md` (ratified 2026-07-25) bounds all of it; the plan was checked against
its invariants and keeps them intact.
