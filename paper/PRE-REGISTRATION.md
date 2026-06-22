# codeweb — Effectiveness Study: Pre-Registration

**Status:** pre-registered. Written **before** experiments are run, against codeweb `main` @ `1186ce0`
(286/286 tests green). This document fixes the hypotheses, metrics, procedures, and pass/fail
criteria *in advance* so that no result can be reverse-engineered into a claim after the fact.

**Why pre-register.** The user's standing bar is "the same rigor we use for coding, applied to
reviewing and verifying scientific results, structure, hypotheses, and writing." Pre-registration is
the scientific analogue of writing the test before the implementation (RED → GREEN): the pass
criterion exists before the data, so a passing result means something.

---

## 0. Methodology commitments (the honesty contract)

1. **Hypotheses before data.** Every primary hypothesis (H1–H18) and its null (H0) is stated here,
   before the corresponding experiment runs. New hypotheses discovered mid-study are labeled
   **exploratory** and reported separately — never promoted to confirmatory.
2. **No HARKing, no cherry-picking.** The corpus (§3) and the agent-A/B task set (H18) are fixed
   before runs. We do not drop repos/tasks after seeing results. If a repo fails to parse, that is
   reported as a result, not silently excluded.
3. **Report null and negative results.** If an experiment fails its pass criterion — including the
   capstone agent A/B (H18) — we report it plainly. A claim that does not survive is dropped from
   the paper or downgraded to a stated limitation.
4. **Raw data is committed.** Every number in the paper traces to a committed machine-readable file
   under `paper/results/`. Figures are generated from those files, never hand-drawn.
5. **One-command reproduction.** `node paper/run-all.mjs` regenerates every deterministic result
   (Themes 1–4) and writes an environment manifest. The agent A/B (Theme 5) is reproducible only up
   to model nondeterminism; its seeds, prompts, task set, and grader are committed.
6. **Independent oracles.** Correctness claims (Theme 2) are checked against a *second, independently
   written* implementation (a naive reference), never against codeweb's own internals. An oracle that
   shares code with the system under test is disclosed as such and treated as weaker evidence.
7. **Adversarial review gate.** Before a claim enters the paper, an independent reviewer attempts to
   **refute** it: does the data support the stated effect, is the oracle truly independent, is there
   leakage or a confound, does the prose match the numbers? Claims that do not survive are revised or
   cut. (This mirrors the project's code-review severity model: CRITICAL/HIGH findings block.)

---

## 1. Purpose & scope

Prove, with testing and benchmarking, that **each codeweb feature is effective** — where
"effective" is decomposed into four measurable properties, plus one end-to-end outcome:

- **Deterministic** (Theme 1) — same input ⇒ byte-identical output; incremental ≡ full.
- **Correct** (Theme 2) — the structural answers equal an independent ground-truth oracle.
- **Accurate** (Theme 3) — detection features hit measured precision/recall vs labeled truth.
- **Performant** (Theme 4) — runtime scales sub-quadratically; queries are sub-second; zero deps.
- **Useful** (Theme 5, capstone) — an agent equipped with codeweb's pre-edit tools produces
  measurably better edits than the same agent without them.

**Non-goals.** We do not claim codeweb finds *all* clones (recall is bounded by design — precision
over recall), nor that it replaces human review. We do not benchmark against commercial tools we
cannot run reproducibly; comparisons are to *stated, reproducible baselines* (e.g. name-match-only).

---

## 2. Environment manifest (recorded at run time)

`run-all.mjs` records, into `paper/results/_env.json`: Node version, OS + release, CPU model + core
count, total RAM, the codeweb commit SHA, the wall-clock date, and the corpus manifest. Every results
file carries the `_env` hash so a figure can never be silently mixed across environments.

---

## 3. Corpus (fixed before runs)

A broad basket spanning all five native languages, pinned by SHA in
[`corpus.manifest.json`](corpus.manifest.json) (cloned by `corpus/clone-corpus.sh`):

| Repo | Lang | Role |
|---|---|---|
| axios | JS | real-world labels (hand-labeled clones, §3.1); headline case study |
| express | JS | second JS point; routing/middleware structure |
| zod | TS | TypeScript extraction + structure |
| flask | Python | Python extraction + structure |
| ripgrep | Rust | Rust extraction; largest repo (scaling point) |
| gorilla-mux | Go | Go extraction (README-validated target) |

Plus **synthetic corpora** generated deterministically (seeded) for the controlled
precision/recall and oracle experiments — these give *known* ground truth that real repos cannot.

### 3.1 Ground-truth labeling protocol

- **Synthetic (primary for precision/recall):** a generator plants `K` known duplicate pairs (exact =
  Type-1; identifier-renamed = Type-2) and `K` known-distinct functions into a clean base. The label
  set is the generator's record — *exact* ground truth, no human judgment. Seeds committed.
- **Real-world (external validity):** for axios, a fixed labeled set of confirmed duplications and
  dismissed false-positives, recorded in `paper/results/labels-axios.json` **before** scoring, with a
  one-line rationale per label. Labels are content-anchored (function body hashes), not line numbers,
  so they survive minor drift. Any post-hoc label change is logged with reason.

---

## 4. Feature → hypothesis coverage matrix

Every shipped feature maps to at least one hypothesis. (Tool names are `scripts/*.mjs`.)

| Feature | Hypotheses |
|---|---|
| `extract-symbols` (JS/TS/Py/Rust/Go) | H1, H2, H14; A-LANG (per-language extraction soundness) |
| `cluster3` (domains, hub-strip) | H1, H12 |
| `overlap` (body-confirmed dup) | H9, H10 |
| `build-report` (report.html/.md) | H1, A-SELFCONTAINED (no network refs), A-TREEMAP (terminates) |
| `query --callers/--callees` | H-CALL (== raw call-edge neighbors oracle) |
| `query --impact` | H4 |
| `query --cycles` | H3 |
| `query --orphans` / `deadcode` | H13 |
| `query --tests` | A-TESTS (== independent test-edge scan) |
| `diff` (post-edit gate) | H5 (it is the verdict simulate-edit predicts) |
| `ci-gate` | A-CIGATE (exits 1 on injected regression, 0 on clean) |
| `trend` | A-TREND (monotone detection of rising dup across commits) |
| `optimize` (consolidation advisor) | H6-adj (ready-tier merges are gate-green) |
| `context-pack` | H-CP (window == blast-radius/impact set, no omissions) |
| `simulate-edit` | H5 |
| `refresh` (incremental) | H2 |
| `find-similar` (lexical + `--structural`) | H10, H11 |
| `placement` | A-PLACE (suggested domain == callee-gravity oracle) |
| `review` | H4 (blast radius == impact oracle) |
| `fitness` | A-FIT (flags injected rule violations; no false flags on clean) |
| `risk` | A-RISK (ranking monotone in its documented inputs) |
| `codemod --write` | H8 (reversible; plan verdict == post-write actual) |
| `break-cycles` | H-CUT (each proposed cut verified to break its cycle) |
| `hotspots` | A-HOT (score == documented complexity×fanIn×churn formula) |
| `campaign` | H6 (sequence stays gate-green at every prefix) |
| `reading-order` | A-READ (foundations-first: callees precede callers, cycles degrade) |
| `annotate` (suppression) | A-SUPP (suppresses by identity; changed fingerprint resurfaces) |
| `mcp-server` (20 tools) | A-MCP (each tool's output == its CLI equivalent; protocol conformance) |
| `lib/shards` | H7 (sharded query == whole-graph query) |
| **whole system, for an agent** | **H18** (the capstone outcome) |

---

## 5. Hypotheses

Notation: each has the **claim**, the **null H0**, the **metric**, the **procedure**, the **dataset**,
the **statistics**, and the **pass criterion**. "Trial" = one seeded random instance.

### Theme 1 — Determinism

**H1 — Byte-deterministic pipeline.**
Claim: `run.mjs` on a fixed input yields byte-identical `graph.json` across repeated runs.
H0: outputs vary across runs. Metric: number of distinct SHA-256 digests over `R=20` runs per repo.
Procedure: run the full pipeline `R` times per corpus repo, hash `graph.json` (after stripping the
`_env`/timestamp fields, which are allowed to vary by design). Dataset: all 6 real repos.
Stats: exact. **Pass:** exactly **1** distinct digest per repo (all 6).

**H2 — Incremental refresh ≡ full rebuild.**
Claim: `extract-symbols --cache` after edits produces output byte-identical to `--full`.
H0: incremental ≠ full. Metric: mismatch count over `T=500` trials. Procedure: per trial, take a repo
snapshot, apply a seeded random edit (touch/modify/delete a source file), run cached vs full, compare
digests. Dataset: 3 repos × seeded edits. Stats: exact + Rule-of-Three upper bound on the true
mismatch rate. **Pass:** **0** mismatches.

### Theme 2 — Correctness vs independent oracle

**H3 — Cycle detection = true SCCs.**
Claim: `query --cycles` (file-level SCCs) equals an independent SCC algorithm. H0: they differ.
Oracle: a from-scratch Kosaraju (two DFS passes) written independently of codeweb's iterative Tarjan.
Metric: set-equality disagreements over `T=10,000` random graphs + 6 real repos. Stats: exact +
Rule-of-Three. **Pass:** **0** disagreements.

**H4 — Impact = exact transitive closure.**
Claim: `query --impact` (+ `review` blast radius) equals independent reverse-reachability BFS over
call edges. H0: they differ. Oracle: naive BFS. Metric: disagreements over `T=10,000` random graphs +
all real-repo symbols. **Pass:** **0**.

**H5 — Pre-flight faithfulness (the agent guarantee).**
Claim: `simulate-edit`'s predicted `{newCycles, lostCallers, ok}` equals the *actual* verdict obtained
by applying the edit (`graph-ops.applyEdit`) and running `diff`. H0: prediction ≠ reality. Oracle: the
independent `naiveApply` in `tests/_proptest.mjs` composed with `diff`. Metric: disagreements over
`T=10,000` (random graph × random delete/merge/move op). **Pass:** **0**.

**H6 — Campaign sequence safety.**
Claim: applying `campaign` steps **in order** never introduces a file cycle absent from the base, at
**any** prefix. H0: some prefix introduces a spurious cycle. Metric: count of prefixes (over all
trials) whose applied graph has a cycle not in the base. Procedure: `T=2,000` random graphs; build
campaign; apply steps cumulatively; after each step compare cycle set to base. **Pass:** **0**.

**H7 — Shard answer-preservation.**
Claim: a query answered over sharded sub-graphs equals the same query over the whole graph. H0: they
differ. Metric: disagreements over `T=2,000` random graphs × query set (callers/callees/impact).
**Pass:** **0**.

**H8 — Codemod reversibility & gate-consistency.**
Claim: (a) the gate verdict in a `codemod` *plan* equals the actual post-`--write` verdict; (b)
applying a merge then its recorded inverse restores the graph (node/edge sets equal). H0: either
fails. Metric: disagreements over `T=2,000` planned merges on random graphs. **Pass:** **0** for both.

### Theme 3 — Detection accuracy (precision/recall vs labeled truth)

**H9 — Type-1 (exact) clone detection.**
Claim: on planted exact clones + distractors, `overlap` achieves precision and recall materially above
the **name-match-only baseline** (cluster purely by identical label, no body confirmation). H0:
codeweb ≤ baseline on F1. Metric: precision, recall, F1 with **Wilson 95% CI**; baseline F1 for
contrast. Procedure: synthetic corpora, `K∈{20,50,100}` planted pairs, 10 seeds each. Also report
axios real-world precision against §3.1 labels. **Pass:** codeweb F1 CI lower bound > baseline F1 CI
upper bound (i.e. a significant, not merely nominal, improvement).

**H10 — Type-2 (renamed) clone recall.**
Claim: `find-similar --structural` (skeleton) recalls identifier-renamed clones that the lexical pass
misses; structural recall > lexical recall. H0: structural recall ≤ lexical recall. Metric: recall of
each on planted Type-2 clones, with the **paired difference** + bootstrap 95% CI. Procedure: synthetic
Type-2 corpora, 10 seeds. **Pass:** paired-difference CI excludes 0 (structural strictly higher).

**H11 — `find-similar` ranking quality.**
Claim: given a planted duplicate's body, the true match ranks at or near the top. H0: true match
ranked no better than a random existing symbol. Metric: **MRR**, **recall@1**, **recall@5** over
planted queries; random-baseline MRR for contrast. **Pass:** MRR ≥ 0.8 **and** CI above the random
baseline.

**H12 — False-hub avoidance (the `byName[0]` fix).**
Claim: on a corpus seeded with many same-named functions (`log`, `parse`, …), codeweb does **not**
fabricate a super-hub: the max false in-degree under the shipped behavior is far below the legacy
fallback's. H0: the fix does not reduce the false hub's in-degree. Metric: in-degree of the
most-inflated ambiguous node, shipped vs `CODEWEB_LEGACY_FALLBACK=1`. Procedure: synthetic corpus +
the golden real target (the documented `discord:log` 127→2). **Pass:** shipped max-false-indeg ≤ ⅓ of
legacy, on every seed.

**H13 — Dead-code precision.**
Claim: `deadcode`'s **safe-to-delete** tier is high-precision against an independent reachability
analysis (orphans that are truly unreachable from entrypoints/tests). H0: precision ≤ 0.5 (coin flip).
Metric: precision of the safe tier with Wilson CI; recall reported alongside to make the deliberate
precision-over-recall tradeoff explicit (not hidden). Procedure: synthetic graphs with planted
orphans + reachable-but-uncalled distractors; real-repo spot-check. **Pass:** safe-tier precision CI
lower bound ≥ 0.95 (the README promises a *candidate* list elsewhere; the *safe* tier must be strict).

### Theme 4 — Performance & scale

**H14 — Sub-quadratic scaling.**
Claim: end-to-end pipeline runtime grows sub-quadratically in symbol count. H0: exponent ≥ 1.7 (toward
quadratic). Metric: fit `log(time) = a + b·log(symbols)`; report `b` (scaling exponent) + R². Dataset:
all 6 repos + size-graded synthetic corpora (to densify the curve). Stats: OLS on log-log, CI on `b`.
**Pass:** `b` CI upper bound < 1.5.

**H15 — Incremental speedup.**
Claim: `refresh --cache` is faster than a full rebuild, increasingly so as the changed fraction
shrinks. H0: no speedup (ratio ≥ 1). Metric: `time(cache, p)/time(full)` for changed fraction `p ∈
{1%,5%,10%,25%,50%}`, median over 5 reps. **Pass:** ratio < 1 for all `p`, and monotone-ish (smaller
`p` ⇒ larger speedup) — report the curve regardless.

**H16 — Zero runtime dependencies.**
Claim: the engine runs with an empty `node_modules` on stock Node. H0: it needs an install. Metric:
binary — run the full pipeline in a sandbox with no installed deps. **Pass:** succeeds; also assert
`dependencies` in `package.json` is empty.

**H17 — Sub-second query latency.**
Claim: structural queries answer fast enough to sit in an agent's edit loop. H0: median > 1 s. Metric:
median + p95 latency of `callers/callees/impact/cycles/orphans/context-pack/simulate-edit` on the
largest real graph, 30 reps each. **Pass:** median < 250 ms, p95 < 1 s (report all).

### Theme 5 — Agent outcome (capstone, pre-registered)

**H18 — Agents edit better with codeweb.**
Claim: a coding agent given codeweb's pre-edit tools (`find-similar`, `placement`, `impact`,
`simulate-edit`) on a fixed task set produces edits with **fewer structural regressions** and **less
new duplication** than the *same agent, same tasks, without those tools*. H0: no difference.
Design (fixed now):
- **Task set:** `N` pre-registered tasks (add-a-function / refactor / fix), each on a corpus repo,
  with a known good answer or a measurable structural criterion. Committed before runs.
- **Conditions:** `control` (no codeweb) vs `treatment` (codeweb MCP tools available). Same base model,
  same prompts modulo the tool list, same seeds where the harness allows.
- **Primary metrics, per task:** (1) structural-regression count from `diff` (new cycle / new dup /
  lost-all-callers) on the agent's diff; (2) new-duplication count; (3) placement correctness (did a
  newly added symbol land in the domain the oracle says it belongs to). Secondary: task pass/fail,
  tokens, wall-clock.
- **Statistics:** paired by task; effect size (Cliff's δ for counts) + **bootstrap 95% CI**; report
  power/`N` honestly. **Pass (confirmatory):** treatment regression-count CI strictly below control.
  **If null/underpowered:** reported as such; the paper's thesis rests on Themes 1–4, with H18 framed
  as a pilot. **Anti-rigging:** task set + grader are adversarially reviewed before any run; the
  control agent must be competent (sanity-checked), not a strawman.

### Auxiliary checks (every remaining feature; pass = exact agreement / stated bound)

- **A-LANG** — per language (JS/TS/Py/Rust/Go), a fixture with known symbols/edges extracts the
  expected node & edge sets (no missed defs, no fabricated edges).
- **A-CALL** — `query --callers/--callees` == independent raw call-edge neighbor sets (oracle:
  `rawCallers/rawCallees`), `T=10,000` random graphs. Pass: 0 disagreements.
- **A-TESTS** — `query --tests X` == independent scan of test-file references. Pass: 0 disagreements.
- **A-SELFCONTAINED** — `report.html` has no external network references (no `http(s)://` asset/CDN
  fetches). Pass: none found.
- **A-TREEMAP** — the treemap layout terminates on adversarial inputs (dominant item, all-zero,
  large-uniform) — no stack overflow / NaN. Pass: terminates, tiles exactly.
- **A-CIGATE** — exits 1 on an injected regression, 0 on a clean diff, 0 on pure removals. Pass: all.
- **A-TREND** — across synthetic commit series with rising duplication, the reported metric is
  monotone non-decreasing. Pass: monotone.
- **A-CP** — `context-pack` window contains exactly the impact/blast-radius set for the symbol (no
  omissions vs the H4 oracle). Pass: 0 omissions.
- **A-PLACE** — `placement` suggests the domain holding the plurality of the new symbol's callees
  (callee-gravity oracle). Pass: agreement ≥ stated rate on synthetic placements.
- **A-FIT** — `fitness` flags every injected rule violation (forbidden dep, layering, cycle, cap) and
  flags none on a clean graph. Pass: recall 1.0 on injected, 0 false flags on clean.
- **A-RISK** — `risk` score is monotone in each documented input (fan-in, fan-out, loc, blast, churn)
  holding others fixed. Pass: monotone on all five.
- **A-CUT** — for each cycle, applying `break-cycles`' proposed edge cut removes that cycle (verified
  by re-running SCC). Pass: every proposed cut breaks its cycle.
- **A-HOT** — `hotspots` score equals the documented `0.5·complexity + 0.3·fanIn + 0.2·churn`
  (normalized) — recompute independently and compare. Pass: exact (within fp tolerance).
- **A-READ** — `reading-order` lists every in-scope callee before its caller, except within a cycle
  (where it falls back to fan-in order without crashing). Pass: property holds on `T=2,000` graphs.
- **A-SUPP** — an annotated finding is hidden and counted; mutating its fingerprint resurfaces it.
  Pass: both.
- **A-MCP** — for each of the 20 MCP tools, the JSON result equals the corresponding CLI invocation on
  the same input; protocol conformance (initialize/tools.list/tools.call, error codes). Pass: parity
  on all 20 + conformance.

---

## 6. Statistical methods

- **Zero-failure correctness (Theme 2, auxiliary):** with `T` trials and 0 failures, report the
  **Rule of Three** 95% upper bound on the true failure rate: `≤ 3/T`. E.g. `T=10,000` ⇒ "< 0.03% at
  95% confidence." We never report "0% error" without the bound.
- **Proportions (precision/recall):** **Wilson score** 95% CIs (well-behaved at extremes), not normal
  approximation.
- **Paired differences (H10, H18):** **bootstrap** 95% CI (10,000 resamples, seed committed); effect
  size via **Cliff's δ** for count/ordinal outcomes.
- **Scaling (H14):** OLS on log-log with CI on the slope; report R² and residual plot.
- **Multiplicity:** Themes 2 & auxiliary are pass/fail at 0 failures (no inflation). Where multiple
  proportions are compared (Theme 3), we note the family and avoid over-interpreting marginal CIs.

---

## 7. Threats to validity (general; per-experiment threats live with each H)

- **Construct:** "regression" is defined operationally by `diff` (new cycle / new dup /
  lost-all-callers); it is a *structural* proxy for "harm," not a semantic correctness oracle. Stated.
- **Internal — oracle independence:** Theme 2 oracles must not share code with the system. The naive
  appliers/BFS/Kosaraju are written separately and themselves unit-tested. Disclosed where an oracle
  is only *partially* independent.
- **External:** synthetic corpora give exact labels but an artificial distribution; real repos give
  realistic distribution but approximate labels. We report both and let them triangulate.
- **Timing:** single-machine wall-clock is environment-bound; we report relative ratios (H15) and
  log-log slope (H14), which are more portable than absolute ms, plus the full `_env`.
- **Agent A/B (H18):** model nondeterminism, task-set bias, prompt sensitivity. Mitigated by pairing,
  pre-registration, adversarial design review, and a competent (not strawman) control. Residual risk
  is disclosed; H18 is explicitly the *weakest-evidence* theme and is not load-bearing for the thesis.

---

## 8. Deliverables & reproduction

- `paper/experiments/*.mjs` — one harness per hypothesis cluster, each emitting JSON to
  `paper/results/`. Deterministic (seeded), zero-dependency, runnable standalone.
- `paper/run-all.mjs` — runs every deterministic harness, writes `_env.json`, fails loud on any
  pass-criterion miss (so the paper can't ship a silently-broken claim).
- `paper/results/*.json` — committed raw data (small).
- `paper/figures/*.svg` — generated from results (committed), brand-consistent.
- `docs/paper/index.html` — the rendered paper, hosted on GitHub Pages.
- `paper/paper.md` — the paper source.
- README **Evidence** section — headline figures + numbers, deep-linking into the paper.

**Reproduce:** `bash paper/corpus/clone-corpus.sh && node paper/run-all.mjs` (Themes 1–4). Theme 5:
`node paper/experiments/agent-ab.mjs` (requires an agent runner; seeds/prompts/grader committed).

---

## 9. Execution log & deviations from pre-registration

Recorded *after* data collection. Every deviation, fix, and criterion clarification is logged here
transparently — that disclosure is what makes the pre-registration meaningful (§0).

### 9.1 Defects the study surfaced, then fixed (find → fix → prove)

Two hypotheses initially **failed** because the harnesses found real, user-visible engine defects.
Per §0.3 we report the failures; per the project's engineering bar we also fixed the defects — each a
genuine product improvement, not a test-passing hack — and re-ran to prove the corrected claim. The
pre-fix failure stands on record, and each fix ships behind a **reproducible A/B lever** so its effect
is independently verifiable (the same pattern as the engine's existing `CODEWEB_LEGACY_FALLBACK` /
`CODEWEB_HUB_INDEG` levers).

- **H1 (determinism) — FAILED → fixed → PASS.** Initial run: the pipeline was *not* byte-deterministic.
  Root causes: (a) `rg --files` (and readdir) enumerate files in a nondeterministic order, which leaked
  into node-array order **and** `cluster3` domain *assignment* (analysis output, not just cosmetics);
  (b) `overlap.mjs` computed `Math.min(...sims)`, spreading an O(n²) array as call args — `express`
  overflowed the stack and crashed every run. Fixes: sort the file list (`extract-symbols.mjs`);
  spread-free `reduce` (`overlap.mjs`). 286 tests stayed green. Re-run (R=20, all 6 repos): **1 distinct
  digest each, express no longer crashes** → H1 PASS.
- **H13 (deadcode safe-tier precision) — FAILED → fixed → PASS.** Initial run: safe-tier precision
  0.519. Root cause: the "safe-to-delete" tier excluded test-edge *targets* but not functions *defined
  in* test files (helpers, mocks, `it`/`describe` registrations) — which have no inbound code edge, so
  they were filed "safe", yet a test runner invokes them (deleting them breaks tests; on `express`,
  928/932 safe items were test-file functions). Fix: route test-file definitions to "review" via the
  already-exported `isTestFile` predicate. New `CODEWEB_DEADCODE_LEGACY` lever restores the old behavior
  for falsifiability. Re-run: **precision 1.0** (legacy ≈ 0.52) → H13 PASS.

### 9.2 Criterion clarifications (no number changed; wording reconciled to the shipped contract)

- **H4 (impact)** — the pre-reg text said "call edges"; codeweb's shipped `impact` is reverse
  reachability over **call *and* inherit** edges. The oracle was matched to the shipped contract; the
  0-disagreement result holds for that contract, which is the semantics we report.
- **A-TESTS** — random graphs emit no `test` edges, so most of the 120,454 comparisons are trivially
  empty-vs-empty; the **effective** non-empty denominator is the real-repo cases (~10²). The
  Rule-of-Three bound is reported on the effective n, not the inflated total.
- **H9 baseline** — the name-match-only baseline's precision is pinned near 0.5 by the 1:1
  planted-clone:distractor ratio. The F1 separation is genuine (codeweb 1.0 vs 0.67), but the
  *magnitude* of the contrast is partly a property of the planted ratio. Stated plainly in the paper.

### 9.3 Honest negatives retained (reported as measured, not spun)

- **H15 (incremental speedup)** — the universal `ratio < 1 for all p` criterion is **not** met:
  `refresh --cache` is faster at low churn but reaches **parity (~1.0×) at p≈25%**. Reported as the
  measured speedup *curve* (a real win for realistic small-change refreshes, not a universal claim).
- **H17 (query latency)** — a single-run threshold is noise-sensitive (it flipped pass/fail across
  runs). Reported as a **distribution** (median / p95 over repeated runs) on the largest real graph,
  not as a binary threshold.

### 9.4 Tooling note

Cloning the corpus into `paper/corpus/` made argless `node --test` discover the corpus repos' own
test files; `npm test` was scoped to `"tests/**/*.test.mjs"` (Node-internal glob — cross-platform). CI
is unaffected (the corpus is never cloned there).
