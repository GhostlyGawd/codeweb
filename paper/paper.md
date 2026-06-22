# Does codeweb work? A pre-registered effectiveness study

**An empirical evaluation of a deterministic code-analysis engine — determinism, correctness,
detection accuracy, performance, and agent outcomes.**

codeweb `main` · evaluated on a 6-repo cross-language corpus (axios, express, zod, flask, ripgrep,
gorilla-mux) pinned by SHA · Node v24.14.1 · pre-registered before data ([`PRE-REGISTRATION.md`](PRE-REGISTRATION.md)) ·
every number reproducible via `node paper/run-all.mjs`.

---

## Abstract

codeweb dissects a repository into atomic symbols (functions, classes, methods), wires a call/import
graph, clusters semantic domains, and surfaces cross-domain duplication — then serves that graph as an
interactive map for humans and ~20 deterministic query/advisory tools for coding agents. We asked a
simple question with scientific rigor: **does it actually work?** We decomposed "effectiveness" into
five measurable properties and pre-registered 18 primary hypotheses plus ~15 auxiliary checks — each
with an explicit null, a precise metric, an independent oracle, and a pass criterion fixed *before* any
data was collected.

**Result: 32 of 33 pre-registered checks pass**, most with overwhelming margins:

- **Correctness is exact.** Over **~120,000** comparisons against independently-written oracles, cycle
  detection, blast-radius/impact, callers/callees, test-mapping, and the agent context window produced
  **zero disagreements** (Rule-of-Three 95% bound: error rate < 0.003%). The agent pre-flight guarantee
  (`simulate-edit`) and the consolidation campaign's sequence-safety held over **10,000** and **2,000**
  random trials respectively with **zero** violations.
- **Detection is accurate.** Exact-clone detection scored **F1 = 1.0** (vs 0.67 for a name-match
  baseline); identifier-renamed (Type-2) clone recall was **1.0 structural vs 0.0 lexical**;
  reuse-ranking MRR was **0.99**; the false-hub defense held the fabricated super-hub to in-degree
  **0** (vs 11 under the legacy path).
- **It scales.** End-to-end runtime grows **sub-linearly** (log-log exponent **b = 0.33**, CI
  [0.13, 0.53]); structural queries answer in **~120 ms median** on a 3,201-symbol graph; zero runtime
  dependencies.
- **The testing found real bugs.** Two pre-registered hypotheses initially **failed** because the
  harnesses surfaced genuine, user-visible defects the engine's own 286-test suite missed: the pipeline
  was **not deterministic** (nondeterministic file enumeration leaked into analysis output; a large
  duplicate cluster crashed the overlap stage), and the dead-code "safe-to-delete" tier would have
  **deleted a repo's test helpers**. We fixed both — surgically, behind reproducible A/B levers — and
  re-ran to prove the corrected claims (determinism: 1 distinct output across 20 runs on all 6 repos;
  dead-code safe-tier precision **0.52 → 1.0**).

The single honest miss (H15) is a *characterization*, not a defect: incremental refresh is faster than
a full rebuild for realistic small changes (≤10% of files) but reaches parity at high churn — reported
as the measured curve, not spun as a universal win.

---

## 1. Why test a tool this way

Tools are usually sold on promises. codeweb makes falsifiable claims — "deterministic",
"reproducible byte-for-byte", "body-confirmed", "high-confidence dead code", "predicts the gate" — so we
treated them as hypotheses and tried to break them, applying the same rigor to the *evaluation* that
the project applies to its code: tests written before implementations, independent oracles, adversarial
review, and honest reporting of whatever the data shows.

"Effectiveness" decomposes into five measurable properties:

| Property | Question | Theme |
|---|---|---|
| **Deterministic** | Same input ⇒ same output? Incremental ≡ full? | 1 |
| **Correct** | Do the structural answers equal independent ground truth? | 2 |
| **Accurate** | Do the detectors hit real precision/recall? | 3 |
| **Performant** | Does it scale; is it fast enough for an edit loop? | 4 |
| **Useful** | Do agents edit better *with* it? | 5 (capstone) |

## 2. Methodology

**Pre-registration.** Every hypothesis (H1–H18) and its null, metric, procedure, dataset, and pass
criterion were fixed in [`PRE-REGISTRATION.md`](PRE-REGISTRATION.md) *before* data collection — the
scientific analogue of writing the test before the implementation. Deviations and clarifications are
logged transparently in its §9.

**Corpus.** A broad basket spanning all five native languages, cloned and **pinned by SHA**
([`corpus.manifest.json`](corpus.manifest.json)): axios & express (JS), zod (TS), flask (Python),
ripgrep (Rust), gorilla-mux (Go) — ~923 source files. Controlled, *seeded* synthetic corpora supply
exact ground truth where real repos can only approximate it.

**Independent oracles.** Every correctness claim is checked against a *second, independently written*
implementation (a naive Kosaraju for SCCs, a from-scratch reverse-BFS for impact, a separate
edit-applier for the pre-flight oracle) — never against codeweb's own internals. A circular oracle is
disclosed and treated as weaker evidence.

**Statistics.** One shared, self-tested library ([`lib/stats.mjs`](lib/stats.mjs)): **Wilson** score
intervals for proportions, the **Rule of Three** (`≤ 3/n`) for zero-failure correctness bounds,
**seeded bootstrap** CIs for paired differences, **Cliff's δ** for effect size, and **log-log OLS** for
scaling exponents. No number is reported without its uncertainty.

**Adversarial verification.** Before any claim entered this paper, an independent reviewer re-ran the
harness and tried to *refute* it — checking oracle independence, whether the test can actually fail
(non-vacuity), whether the number meets the pre-registered criterion, and whether the prose overstates
the data. Claims that did not survive were revised or cut.

**Reproducibility.** `bash paper/corpus/clone-corpus.sh && node paper/run-all.mjs` regenerates every
deterministic result and writes an environment manifest; raw data lives in [`results/`](results/);
figures are generated from that data, never hand-drawn.

## 3. Results

### 3.1 Determinism (Theme 1)

| Hyp | Claim | Result | Evidence |
|---|---|---|---|
| **H1** | Byte-deterministic pipeline | **PASS** (after fix) | 1 distinct structural digest per repo across **R=20** runs, all 6 repos — including domain *assignment* |
| **H2** | Incremental refresh ≡ full rebuild | **PASS** | **0** canonical mismatches over **T=360** seeded edits (3 repos); RoT 95% bound ≤ 0.83% |

H1 is the study's first headline — and it began as a **failure**. Initial runs were *not*
byte-deterministic: `rg --files` (and the readdir fallback) enumerate files in a nondeterministic order,
which leaked not just into node-array order but into `cluster3`'s **domain assignment** — i.e. the
*analysis output* changed run to run. Separately, `overlap.mjs` computed `Math.min(...sims)`, spreading
an O(n²) similarity array as call arguments; `express` (1,122 functions named `it`) overflowed the call
stack and crashed **every** run. Two surgical fixes (sort the file list; spread-free `reduce`) — 286
tests stayed green — and the re-run proves H1. See §4.

### 3.2 Correctness vs independent oracles (Theme 2)

This is the backbone of the proof: codeweb's structural answers are **exactly** an independent ground
truth, over a very large number of trials.

| Hyp | What | Comparisons | Disagreements | RoT 95% bound |
|---|---|---|---|---|
| **H3** | `--cycles` == independent Kosaraju SCC | 10,212 | **0** | < 0.029% |
| **H4** | `--impact` == independent reverse-BFS | 120,454 | **0** | < 0.0025% |
| **A-CALL** | `--callers/--callees` == raw call-edge neighbors | 120,454 | **0** | < 0.0025% |
| **A-TESTS** | `--tests` == independent test-edge scan | (eff. ~10²) | **0** | — |
| **A-CP** | `context-pack` window == impact set (no omissions) | 120,454 | **0** | < 0.0025% |

10,000 seeded random graphs **plus** all six real repos, with the shipped CLI cross-checked against the
library on a sample so the proof covers the real artifact. Zero disagreements throughout.

### 3.3 Edit-safety & pre-flight (Theme 2, cont.)

The tools an agent leans on before editing are provably faithful:

| Hyp | Claim | Trials | Violations |
|---|---|---|---|
| **H5** | `simulate-edit`'s predicted gate verdict == the *actual* verdict (apply + `diff`) | 10,000 | **0** |
| **H6** | `campaign` steps applied in order never add a cycle absent from base, at *any* prefix | 2,000 | **0** |
| **H7** | A sharded query == the whole-graph query | 2,000 | **0** |
| **H8** | `codemod` plan verdict == post-`--write` actual; merge↔inverse restores the graph | 2,000 | **0** |
| **A-CUT** | every `break-cycles` cut, applied, removes its cycle | 2,000 | **0** |
| **A-READ** | `reading-order` lists callees before callers (cycles degrade gracefully) | 2,000 | **0** |

### 3.4 Detection accuracy (Theme 3)

| Hyp | Metric | codeweb | Baseline / contrast |
|---|---|---|---|
| **H9** | Type-1 (exact) clone P / R / F1 | **1.0 / 1.0 / 1.0** (F1 CI lo 0.998) | name-match F1 0.67; axios precision 0.98 (47/48) |
| **H10** | Type-2 (renamed) clone recall | **structural 1.0** | lexical 0.0 (paired-diff CI [1.0, 1.0]) |
| **H11** | `find-similar` ranking MRR / r@1 / r@5 | **0.99 / 0.975 / 1.0** | random-baseline MRR 0.11 |
| **H12** | max *false* hub in-degree (same-name corpus) | **0** | legacy path fabricates 11 |
| **H13** | dead-code safe-tier precision (recall) | **1.0** (1.0) (after fix) | legacy 0.52; axios 0.98 |

H13, like H1, began as a **failure** and exposed a real footgun — see §4.

### 3.5 Performance & scale (Theme 4)

| Hyp | Claim | Result |
|---|---|---|
| **H14** | Sub-quadratic scaling | **PASS** — log-log exponent **b = 0.33**, CI [0.13, 0.53], R² 0.56, n=10; a quadratic law (slope 2) would fail the same test |
| **H15** | Incremental speedup at every churn fraction | **partial** — faster at ≤10% churn (0.93–0.96×), parity at 25–50% (1.00–1.01×) |
| **H16** | Zero runtime dependencies | **PASS** — runs on empty `node_modules`; `dependencies: {}` |
| **H17** | Sub-second query latency | **PASS** — median **117 ms**, p95 **264 ms** on the largest graph (ripgrep, 3,201 symbols) |

H15 is the one honest miss: the pre-registered criterion demanded a speedup at *every* churn fraction,
and refresh only wins for realistic small changes. We report the curve, not a slogan. H17 latency is
run-to-run variable (it has flipped a strict single-run threshold before); we report it as a
distribution — comfortably inside an agent's edit loop either way.

### 3.6 Feature coverage (auxiliary — 11 / 11 pass)

Every remaining shipped feature was pinned to an independent check: per-language extraction
(**5/5** languages), self-contained report (no network refs), treemap termination on adversarial input,
the CI gate's exit codes, duplication-trend monotonicity, placement gravity (**200/200**), fitness-rule
detection (recall **1.0**, 0 false flags), risk monotonicity (**0/10,000** violations), the hotspots
formula (**0/460** mismatch), suppression identity, and **MCP↔CLI parity across all 20 tools**.

### 3.7 Agent outcome (Theme 5 — capstone)

> _[Pending — the pre-registered agent A/B field study (H18): does a coding agent equipped with
> codeweb's pre-edit tools introduce fewer structural regressions and less new duplication than the
> same agent without them? Results, effect size, and confidence intervals to be inserted here once the
> run completes. Per the pre-registration this is the weakest-evidence theme; the thesis above rests on
> Themes 1–4.]_

## 4. What the study found *in codeweb itself*

A study that only confirms is suspect. The strongest evidence that this evaluation is rigorous is that
it **found real bugs** — and fixed them in the open:

1. **The pipeline was not deterministic.** `extract-symbols` enumerated files via `rg --files`, whose
   parallel walk returns an unordered list; that order propagated into node ordering *and* domain
   assignment, so the same repo produced different analysis on different runs. And `overlap.mjs`
   crashed the whole pipeline on `express` via a stack-overflowing `Math.min(...sims)`. Fixes: sort the
   file list; use a spread-free reduce. The 286-test suite — which pins *invariants*, not
   reproducibility — never caught either. After the fix: H1 holds at R=20 on all six repos.

2. **"Safe to delete" wasn't safe.** `deadcode`'s safe tier correctly excluded symbols *called by*
   tests, but not functions *defined in* test files (helpers, mocks, `it`/`describe` registrations) —
   which have no inbound code edge. On `express`, 928 of 932 "safe" items were test functions; "delete
   the safe list" would have deleted the test suite's scaffolding. Fix: route test-file definitions to
   "review" via the engine's own `isTestFile` predicate. Safe-tier precision rose **0.52 → 1.0**.

Both fixes ship behind reproducible A/B levers (`CODEWEB_LEGACY_FALLBACK`-style toggles) so anyone can
flip the fix off and watch the metric regress — the fix is *demonstrably* load-bearing, not a
test-passing hack. The pre-fix failures stand on record (PRE-REGISTRATION §9); we did not retroactively
claim a clean first run.

## 5. Limitations & threats to validity

- **Construct.** "Regression" is defined operationally by `diff.mjs` (new cycle / new duplication /
  lost-all-callers) — a *structural* proxy for harm, not a semantic-correctness oracle.
- **External validity.** Synthetic corpora give exact labels but an artificial distribution; the six
  real repos give a realistic distribution but approximate labels. We report both; the axios labels are
  body-confirmed human-style judgments (disclosed as such).
- **Baseline contrast (H9).** The name-match baseline's precision is pinned near 0.5 by the 1:1 planted
  clone:distractor ratio; the F1 separation is genuine but its magnitude is partly a construct property.
- **Timing.** Single-machine wall-clock; we foreground portable quantities (log-log slope, ratios) and
  disclose the full environment. H17 is run-to-run variable.
- **Agent A/B (Theme 5).** Not byte-reproducible (model nondeterminism); the weakest-evidence theme by
  design, and explicitly *not* load-bearing for the thesis.

## 6. Reproduce it

```
bash paper/corpus/clone-corpus.sh     # clone + pin the corpus by SHA
node paper/run-all.mjs                # regenerate every deterministic result + the env manifest
```

Raw results: [`paper/results/`](results/). Pre-registration & deviation log:
[`PRE-REGISTRATION.md`](PRE-REGISTRATION.md). Each harness exits non-zero if any hypothesis misses its
pre-registered criterion, so a silently-broken claim cannot ship green.

## 7. Conclusion

codeweb's deterministic guarantees are not marketing: its structural analysis is **exactly** correct
against independent oracles over ~120k trials, its detectors are **accurate** against labeled ground
truth, and it is **fast** and **dependency-free**. Where it fell short, the evaluation said so — and in
two cases that honesty produced a *better tool*, because the harnesses found defects the existing test
suite did not. Outcomes over promises: the data is in [`paper/results/`](results/), and it regenerates
with one command.
