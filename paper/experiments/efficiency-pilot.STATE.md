# Efficiency pilot — session handoff (state as of 2026-06-23)

Resume point for the "does codeweb measurably improve a coding agent?" workstream. Read this +
the project memory `codeweb-north-star-agent-improvement` to continue cold.

## The goal (north star)
codeweb must **measurably improve a coding agent — including frontier models — on BOTH efficiency
(tokens/steps/latency) and effectiveness (edit quality)**. An accurate engine that adds zero agent
value is "not helpful enough yet." Do NOT regress to "the engine is correct" as the bar.

## Where things stand: the fix LANDED and the result FLIPPED
Background: the effectiveness paper's agent A/B (H18, on `main`) was a NULL. We diagnosed why with a
read-only **discovery micro-benchmark** (find the complete caller set of high-fan-out symbols),
control(grep) vs treatment(codeweb), frontier agents, deterministic recall + step grading.

- **Pilot run 1 (broken engine):** codeweb LOST — recall 0.24 vs grep 0.40. Root cause = EXTRACTION,
  not the query: member-access calls (`util.merge()`) were skipped by the leading-dot guard, and
  default/namespace imports only made a coarse file-anchor edge. `AxiosError` had 76 real dependents;
  `--callers` returned 1. (Meta-finding: the paper's H3/H4 caller/impact oracle is GRAPH-relative, not
  SOURCE-relative, so it never caught this.)
- **Engine fix (commit `670d9d8`):** SCANNER v3 — track namespace/default import bindings, resolve
  `alias.member(...)` / `new Default()` to the specific symbol attributed to the enclosing caller
  (precision-safe: a param `obj.method()` stays unresolved). + new `--dependents` query
  (call ∪ import ∪ inherit ∪ test) with a byKind breakdown. **Suite 286→291 green.**
- **Deterministic proof (immune to oracle noise):** axios `merge` `--callers` **3→6** (recall
  0.43→0.86); `AxiosError` **1→20**.
- **Pilot run 2 (fixed engine):** codeweb WINS — **treatment recall 0.57 vs control 0.50, steps 14.5
  vs 17**. Recall-per-step wins 3/4 tasks. Per-task: merge recall 1.0 (21 steps); AxiosError fast-
  partial 0.61 in 7 steps vs grep 0.85 in 24; AxiosHeaders 0.41 vs 0.22; render_template (Python)
  0.27 vs 0.31 (lost).

**Bottom line:** bar provisionally MET for JS discovery. codeweb beats grep on recall + steps
within-run, with a deterministic mechanism proof.

## Git state
- Branch: `feat/efficiency-pilot`, 2 commits ahead of `origin/main` (`48ad354`):
  - `3693d69` test(pilot): the harness
  - `670d9d8` feat(engine): the import-alias member-access fix + `--dependents`
- NOT pushed to origin (local only). NOT PR'd to main.
- Working tree: clean except untracked `.cwpilot/` scratch (safe to delete) and gitignored
  `.codeweb/pilot/` (prebuilt pilot graphs — keep; or rebuild, see below).

## Key files
- Harness: `paper/experiments/efficiency-pilot.workflow.js` (Workflow script; 4 targets, oracle +
  control + treatment per target).
- Engine fix: `scripts/extract-symbols.mjs` (import bindings + member-access), `scripts/lib/graph-ops.mjs`
  (`dependentsOf`, `importIn`), `scripts/query.mjs` (`--dependents`).
- Test: `tests/import-member-edges.test.mjs`.

## How to re-run / continue
- Rebuild pilot graphs (after any extractor change):
  `node scripts/run.mjs paper/corpus/axios --out-dir .codeweb/pilot/axios`
  `node scripts/run.mjs paper/corpus/flask --out-dir .codeweb/pilot/flask`
- Re-run the agent pilot (multi-agent — needs user opt-in / "ultracode" or explicit ask):
  `Workflow({scriptPath: "D:/GitHub Projects/ecc-test/codeweb/paper/experiments/efficiency-pilot.workflow.js"})`
  (~12 agents, ~15 min, ~0.9M tokens/run; returns means + perTask recall/precision/steps.)
- Quick deterministic tool check (no agents):
  `node scripts/query.mjs .codeweb/pilot/axios/graph.json --dependents lib/utils.js:merge --json`
- Full suite: `npm test` (expect 291 green).

## Next levers (prioritized — pick up here)
1. **Widen the margin (engine):**
   - `--dependents` PRECISION pollution on barrel-export anchors: a namespace import (`import utils
     from './utils.js'`) emits a file-anchor import edge, so `merge` (utils.js's anchor) collects a
     false dep from every utils-importer (e.g. `toFormData`). Fix: redirect namespace/default import
     edges off the anchor SYMBOL (e.g. to the target file's `<module>` node) now that member-access
     creates precise edges. Watch fileCycles/coupling + determinism; suite-gate.
   - **Python import resolution** is unwired (extractor import regexes are JS/TS only) — `from X import
     Y` / `import X` + `X.member()`. This is why `render_template` lagged. Add a Python import pass.
   - `AxiosError` still misses ~16 import/re-export deps — re-export following + attribution.
2. **Make it rigorous (study):** the LLM oracle re-reconciles ground truth each run (merge truth was
   7 then 5; AxiosError 76 then 33) → cross-run absolute recall is noisy; within-run control-vs-
   treatment is valid. **FREEZE a hand-verified truth set** per target, then scale N (more targets,
   more repos incl. a 2nd language, reps) for the end-to-end Theme-5b study + paper section.
3. **Ship it:** PR `feat/efficiency-pilot` to `main` (engine fix is suite-green and net-positive).
   Repo PR convention = merge commits, no attribution trailer.

## Conventions (this repo)
- Strict TDD (tests spawn the real CLI against fixtures). Commit conventional, NO attribution trailer.
- Push needs an explicit prompt. Merge-commit PRs via `gh`.
- Destructive Bash (`rm -rf`, `git checkout --`) trips a Fact-Forcing Gate + auto-mode classifier;
  present files/rollback/instruction and name targets explicitly.
