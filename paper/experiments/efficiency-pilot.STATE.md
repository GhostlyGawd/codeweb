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

**Bottom line (run 2):** bar provisionally MET for JS discovery. codeweb beats grep on recall + steps
within-run, with a deterministic mechanism proof.

## Run 3 (2026-06-23): widen-the-margin fixes landed → SPLIT result, margin did NOT widen at the mean
Four engine commits (precision pollution + Python imports + docstring masking + default-export
attribution; see "Git state"). Pilot re-run on the rebuilt graphs (`run3.json`):

| target            | truthN | grep recall | **cw recall** | grep prec | **cw prec** | grep steps | **cw steps** |
|-------------------|--------|-------------|---------------|-----------|-------------|------------|--------------|
| axios-AxiosError  | 42     | 0.40        | **0.71** ✅   | 0.59      | **0.67**    | 32         | **27**       |
| flask-render_tmpl | 19     | 0.89        | **0.95** ✅   | 0.89      | **1.00**    | 15         | 16           |
| axios-merge       | 4      | **1.00** ❌ | 0.50          | 0.67      | 0.33        | 14         | 11           |
| axios-AxiosHeaders| 13     | **0.85** ❌ | 0.46          | 0.79      | 0.33        | 26         | 16           |
| **mean**          |        | **0.79**    | 0.66          | **0.74**  | 0.58        | 21.75      | **17.5**     |

- **The two fix targets BOTH flipped to wins.** AxiosError 0.71 (run2 was 0.61) — the default-export
  refinement put importers back on the class + `--dependents` surfaced the test importers grep missed.
  render_template **precision 1.00** — docstring masking removed every false caller (helpers.py phantoms
  gone); recall 0.95 via the clean Python graph + `--tests`/`--dependents`.
- **The two losses are NAMED gaps the fixes didn't touch:**
  - **AxiosHeaders** is used via `AxiosHeaders.from(...)` (static method) + `instanceof AxiosHeaders`.
    codeweb models `.from()` as an edge to the `from` METHOD (not the class) and `instanceof` as NO edge,
    so `--callers`/`--dependents` of the CLASS miss the real per-function users (codeweb `--callers`
    returned 2). This is the dominant drag (−0.39 vs grep).
  - **merge** (n=4, high variance): self-recursion attributed to the innermost closure `assignValue`
    (truth wanted `merge`); `utils.merge.call(...)` (a `.call()` member chain) unresolved → fetch.factory missed.
- **Systematic GRADING artifact understates codeweb:** the oracle grades EXACT symbol, but codeweb's
  attribution (innermost closure / file-anchor / specific test helper) often names a *different valid*
  symbol than the oracle's `<file>:<function>` or `<file>:<module>` label for the SAME real reference —
  scoring one correct file-level find as 0 TP + 1 FP + 1 FN. The oracle's own notes repeatedly say "the
  FILE is correctly identified by codeweb; only the symbol name is mis-attributed." File-level recall
  would be markedly higher (esp. AxiosError/AxiosHeaders).

**Honest read:** the targeted fixes WORKED (both addressed targets now beat grep); the mean fell because
two *other* gaps (instanceof + static-method-on-class resolution; attribution granularity) dominate, and
symbol-exact grading penalizes codeweb's valid-but-different attribution. Margin not widened at the mean —
but the bottleneck is now precisely located.

## Git state
- Branch: `feat/efficiency-pilot`, now **6 commits ahead** of `origin/main` (`48ad354`):
  - `3693d69` test(pilot): the harness · `670d9d8` feat(engine): member-access + `--dependents`
  - `aee5619` fix: coarse module-import edges off the anchor symbol (merge `--dependents` 35→7)
  - `73ea164` feat: Python import resolution (flask import edges 0→84)
  - `4c09a92` fix: mask Python docstrings/comments (flask −36 phantom symbols, −34 fabricated edges)
  - `cb325f4` fix: default-import edges → single-symbol default export (AxiosError importers recovered)
- NOT pushed to origin (local only). NOT PR'd to main. Suite **310 green**. All four engine fixes carry a
  deterministic proof + TDD test; re-extraction byte-identical; full-pipeline nodes+edges identical 2×.
- Working tree: clean except gitignored `.codeweb/` (rebuilt pilot graphs + scratch). `run3.json` committed.

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

## Next levers (prioritized — pick up here, post run 3)
DONE in run 3: barrel-anchor precision (`aee5619`), Python imports (`73ea164`), docstring masking
(`4c09a92`), default-export attribution (`cb325f4`). Run 3 located the NEW bottleneck:

1. **Class-usage resolution (the AxiosHeaders gap — biggest single drag, −0.39):** a class consumed via
   `X.from(...)` / `X.staticMethod(...)` and `obj instanceof X` is a real dependent of X-the-class, but
   codeweb routes `.from()` to the `from` METHOD and emits NO edge for `instanceof`. So `--callers`/
   `--dependents` of the class miss those users. Options: (a) emit a dependency edge to the CLASS for
   `instanceof X` and `new X`/`X.static()` (already have the nsAlias binding); (b) have `--dependents
   <class>` union callers of the class's own static methods. Decide the SEMANTICS (does `instanceof`
   count?) before coding. Precision-gate against the suite.
2. **`.call()`/`.apply()` + member-chain resolution (the merge gap):** `utils.merge.call(...)` and
   `a.b.c()` chains don't resolve (member resolver only handles single-alias `.member()`). Lower value
   (n=4 target), but a real recall hole.
3. **Attribution granularity / grading methodology:** symbol-exact grading penalizes codeweb when it
   names the innermost closure (`assignValue`) or file anchor instead of the oracle's chosen
   `<file>:<function>`/`<file>:<module>` — SAME real reference, different valid label. Either (a) grade
   FILE-level (or symbol-OR-module credit) to measure true dependency-finding, or (b) align codeweb's
   attribution to "nearest enclosing NAMED function" + always surface the file `<module>` node. This is
   the cleanest way to show codeweb's real signal; the engine work above is the way to raise it.
4. **Make it rigorous (study):** the LLM oracle re-reconciles truth each run (merge 4 this run, 5/7
   before; AxiosError 42 vs 33/76) → cross-run absolute recall noisy; within-run control-vs-treatment is
   valid. **FREEZE a hand-verified truth set** per target, then scale N (targets/repos/reps) for Theme-5b.
5. **Ship it:** PR `feat/efficiency-pilot` to `main` — the 4 engine fixes are suite-green, deterministic,
   net-positive on their targets (AxiosError/render_template now beat grep). Repo PR convention = merge
   commits, no attribution trailer. Mean-margin not yet won, but the engine is strictly more correct.

## Conventions (this repo)
- Strict TDD (tests spawn the real CLI against fixtures). Commit conventional, NO attribution trailer.
- Push needs an explicit prompt. Merge-commit PRs via `gh`.
- Destructive Bash (`rm -rf`, `git checkout --`) trips a Fact-Forcing Gate + auto-mode classifier;
  present files/rollback/instruction and name targets explicitly.
