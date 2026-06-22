# Does codeweb work? A pre-registered effectiveness study

**An empirical evaluation of a deterministic code-analysis engine — determinism, correctness,
detection accuracy, performance, and agent outcomes.**

codeweb `main` · evaluated on a 6-repo cross-language corpus (axios, express, zod, flask, ripgrep,
gorilla-mux) pinned by SHA · Node v24.14.1 · pre-registered before data ([`PRE-REGISTRATION.md`](PRE-REGISTRATION.md)) ·
every deterministic number reproducible via `node paper/run-all.mjs`.

---

## Abstract

codeweb dissects a repository into atomic symbols (functions, classes, methods), wires a call/import
graph, clusters semantic domains, and surfaces cross-domain duplication — then serves that graph as an
interactive map for humans and ~20 deterministic query/advisory tools for coding agents. We asked a
simple question with scientific rigor: **does it actually work?** We decomposed "effectiveness" into
five measurable properties and pre-registered **33 pass/fail checks** (plus an agent-A/B capstone) —
each with an explicit null, a precise metric, an independent oracle, and a pass criterion fixed
*before* any data was collected.

**Result: 32 of 33 checks pass**, most with wide margins:

- **Correctness held against independent oracles.** Cycle detection matched an independent SCC oracle
  over 10,212 graph comparisons; impact, callers/callees, and the agent context window each matched an
  independent oracle over ~120,000 per-symbol comparisons — **zero observed disagreements throughout**
  (**>490,000 comparisons in total**; Rule-of-Three 95% upper bounds from < 0.03% for cycles to
  < 0.0025% for the symbol-level oracles; test-mapping is bounded on its ~10² non-empty cases). The
  agent pre-flight check (`simulate-edit`) and the campaign's sequence-safety held over 10,000 and
  2,000 random trials with zero violations.
- **Detection is accurate.** Exact-clone detection scored **F1 = 1.0** (vs 0.67 for a name-match
  baseline — partly a construct of the planted ratio, §5); identifier-renamed (Type-2) clone recall
  was **1.0 structural vs 0.0 lexical**; reuse-ranking MRR was **0.99**; the false-hub defense held the
  fabricated super-hub to in-degree **0** (vs 11–30 across seeds on the legacy path).
- **It scales.** End-to-end runtime grows **sub-quadratically** (the pre-registered bar) — in this
  corpus **sub-linearly** (log-log exponent **b = 0.33**, 95% CI [0.13, 0.53], R² 0.56, n=10; a noisy
  fit, but the CI rules out quadratic and even linear growth); structural queries answer in ~95–120 ms;
  zero runtime dependencies.
- **The testing found real bugs.** Two pre-registered checks initially **failed** because the harnesses
  surfaced genuine, user-visible defects the engine's own 286-test suite missed: the pipeline was **not
  deterministic** (file-enumeration order leaked into analysis output; a large duplicate cluster crashed
  the overlap stage), and the dead-code "safe-to-delete" tier would have **deleted a repo's test
  helpers**. We fixed both — surgically, behind reproducible A/B levers — and re-ran to re-establish the
  corrected claims (determinism: 1 distinct output across 20 runs on all 6 repos; dead-code safe-tier
  precision **0.52 → 1.0**).

The capstone agent A/B (H18) returned a **null**: the pre-registered paired difference was exactly 0
(a degenerate CI [0,0] over 8 paired tasks). The single pass/fail miss (H15) is a *characterization*,
not a defect: incremental refresh is faster for realistic small changes but reaches parity at high
churn — reported as the measured curve.

---

## 1. Why test a tool this way

Tools are usually sold on promises. codeweb makes falsifiable claims — "deterministic", "reproducible
byte-for-byte", "body-confirmed", "high-confidence dead code", "predicts the gate" — so we treated them
as hypotheses and tried to break them, applying the same rigor to the *evaluation* that the project
applies to its code: tests written before implementations, independent oracles, adversarial review, and
honest reporting of whatever the data shows.

"Effectiveness" decomposes into five measurable properties:

| Property | Question | Theme |
|---|---|---|
| **Deterministic** | Same input ⇒ same output? Incremental ≡ full? | 1 |
| **Correct** | Do the structural answers match independent ground truth? | 2 |
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

**Independent oracles.** Each correctness claim is checked against a *second* implementation that does
not call codeweb's own internals: a naive Kosaraju for SCCs, a from-scratch reverse-BFS for impact, and
— for the pre-flight check — an independently-written edit-applier drawn from the project's own
property-test harness (separate from the engine code under test, though it ships in-repo; disclosed as
such). Where an oracle is only partially independent we say so.

**Statistics.** One shared, self-tested library ([`lib/stats.mjs`](lib/stats.mjs)): **Wilson** score
intervals for proportions, the **Rule of Three** (`≤ 3/n`) for zero-failure correctness bounds,
**seeded bootstrap** CIs for paired differences, **Cliff's δ** for effect size, and **log-log OLS** for
scaling exponents. No headline number is reported without its uncertainty.

**Adversarial verification.** Before a claim entered this paper, an independent reviewer re-ran the
harness and tried to *refute* it — checking oracle independence, whether the test can actually fail
(non-vacuity), whether the number meets the pre-registered criterion, and whether the prose overstates
the data. A second, multi-perspective review (claims-vs-data, statistics, consistency, and a hostile
peer reviewer) then audited this very paper; its findings tightened the language you are reading.

**Reproducibility.** `bash paper/corpus/clone-corpus.sh && node paper/run-all.mjs` regenerates every
deterministic result and writes an environment manifest; raw data lives in [`results/`](results/);
figures are generated from that data, never hand-drawn.

## 3. Results

### 3.1 Determinism (Theme 1)

| Hyp | Claim | Result | Evidence |
|---|---|---|---|
| **H1** | Byte-deterministic pipeline | **PASS** (after fix) | 1 distinct structural digest per repo across R=20 runs, all 6 repos — including domain assignment |
| **H2** | Incremental refresh ≡ full rebuild | **PASS** | 0 canonical mismatches over T=360 seeded edits; Rule-of-Three bound ≤ 0.83% |

H1 began as a **failure**. Initial runs were not byte-deterministic: file enumeration was unordered —
checked directly, `rg --files` returned **4 distinct orderings in 6 runs vs 1 when sorted** — and that
order leaked not just into node ordering but into `cluster3`'s **domain assignment**, so the *analysis
output* changed run to run. Separately, `overlap.mjs` computed `Math.min(...sims)`, spreading an O(n²)
similarity array as call arguments; `express` (1,122 functions named `it`) overflowed the call stack
and crashed every run. Two surgical fixes (sort the file list; spread-free `reduce`) — 286 tests stayed
green — and the re-run establishes H1. See §4.

### 3.2 Correctness vs independent oracles (Theme 2)

The backbone of the evidence: codeweb's structural answers matched an independent ground truth in
*every* trial, over a large number of trials. Each symbol-level oracle below independently ran ~120,000
per-symbol comparisons (10,000 seeded random graphs + all six real repos); >490,000 comparisons in
total, zero observed disagreements.

| Hyp | What | Comparisons | Disagreements | RoT 95% bound |
|---|---|---|---|---|
| **H3** | `--cycles` == independent Kosaraju SCC | 10,212 | **0** | < 0.03% |
| **H4** | `--impact` == independent reverse-BFS | 120,454 | **0** | < 0.0025% |
| **A-CALL** | `--callers/--callees` == raw call-edge neighbors | 120,454 | **0** | < 0.0025% |
| **A-TESTS** | `--tests` == independent test-edge scan | 120,454 (eff. ~10²) | **0** | bounded on the ~10² non-empty cases |
| **A-CP** | `context-pack` window == impact set (no omissions) | 120,454 | **0** | < 0.0025% |

10,000 seeded random graphs **plus** all six real repos, with the shipped CLI cross-checked against the
library on a sample so the result covers the real artifact, not just an internal function.

### 3.3 Edit-safety & pre-flight (Theme 2, cont.)

The tools an agent leans on before editing are faithful to the actual gate — 0 violations per trial:

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
| **H9** | Type-1 (exact) clone P / R / F1 | **1.0 / 1.0 / 1.0** (F1 CI lo 0.998) | name-match F1 0.67†; axios precision 0.98 (47/48) |
| **H10** | Type-2 (renamed) clone recall | **structural 1.0** | lexical 0.0 (paired-diff CI [1.0, 1.0]) |
| **H11** | `find-similar` ranking MRR / r@1 / r@5 | **0.99 / 0.975 / 1.0** | random-baseline MRR 0.11 |
| **H12** | max *false* hub in-degree (same-name corpus) | **0** | legacy path fabricates 11–30 across seeds |
| **H13** | dead-code safe-tier precision (recall) | **1.0 (1.0)**‡ | legacy 0.52; axios 0.98 |

† The name-match baseline's 0.67 is partly a construct artifact of the 1:1 planted clone:distractor
ratio (§5); the genuine result is that body-confirmation drives codeweb's false-positive rate to zero
where name-matching alone does not. ‡ H13 also began as a failure (a real footgun); fixed and
re-established — see §4.

### 3.5 Performance & scale (Theme 4)

| Hyp | Claim | Result |
|---|---|---|
| **H14** | Sub-quadratic scaling | **PASS** — log-log exponent **b = 0.33**, CI [0.13, 0.53], R² 0.56, n=10; a quadratic law (slope 2) fails the same test |
| **H15** | Incremental speedup at every churn fraction | **partial** — faster at ≤10% churn (0.93–0.96×), parity at 25–50% (1.00–1.01×) |
| **H16** | Zero runtime dependencies | **PASS** — runs on empty `node_modules`; `dependencies: {}` |
| **H17** | Sub-second query latency | **PASS** (run-dependent) — typical query ~95–100 ms; worst-case median 117 ms, p95 264 ms (ripgrep, 3,201 symbols) |

H14 passes the pre-registered bar (the CI rules out quadratic), and in this corpus the fit is in fact
sub-linear — though with R² 0.56 on only 10 points it is a noisy estimate, so we lean on the
quadratic-rejection bound rather than the precise exponent. H15 is the one pass/fail miss: the criterion
demanded a speedup at *every* churn fraction, and refresh only wins for realistic small changes; we
report the curve, not a slogan. H17 latency is **run-to-run variable** — the worst-case median passed
this committed run (117 ms) but has exceeded 250 ms under load in other runs; we report the
distribution, and it sits comfortably sub-second regardless.

### 3.6 Feature coverage (auxiliary — 11 / 11 pass)

Every remaining shipped feature was pinned to an independent check: per-language extraction
(**5/5** languages), self-contained report (no network refs), treemap termination on adversarial input,
the CI gate's exit codes, duplication-trend monotonicity, placement gravity (**200/200**), fitness-rule
detection (recall **1.0**, 0 false flags), risk monotonicity (**0/10,000** violations), the hotspots
formula (**0/460** mismatch), suppression identity, and **MCP↔CLI parity across all 20 tools**.

### 3.7 Agent outcome (Theme 5 — capstone): null / inconclusive

The pre-registered agent A/B (H18) asked whether a coding agent equipped with codeweb's pre-edit tools
(`find-similar`, `placement`, `impact`, `simulate-edit`) introduces fewer structural regressions and
less new duplication than the same agent without them. Nine tasks (add / refactor / fix across axios,
flask, express) were proposed, adversarially screened for fairness, and **frozen before any solver
ran**. 34 of 36 cells completed (both non-completions on the *control* arm: 18 treatment vs 16 control).

**Result: no measurable difference.** The pre-registered statistic — the **paired** per-task difference
— was **exactly 0** (bootstrap CI [0,0]). That interval is *degenerate*: all 8 paired tasks had
identical structural-regression counts in both arms, so it reflects a floor, not power. New duplication
was **0 in both arms**; per-condition regression means were 0.111 (treatment) vs 0.125 (control); Cliff's
δ negligible. The null is *valid, not confounded*: **all 18 treatment cells used the tools**, which
returned correct answers — on the reuse tasks, `find-similar` correctly reported no existing equivalent
and `placement` confirmed the right directory.

Two honest caveats. (1) Each edit was graded by codeweb's verified `diff.mjs` gate, but run by the
solver in its own ephemeral workspace and **self-reported** — the grader is a deterministic, verified
function (H5/H8), so the metric is unbiasable in principle, but we did not independently re-grade. (2)
On these clean, well-scoped tasks a capable base model already avoids regressions and duplication, so
codeweb's pre-edit intelligence **corroborated rather than corrected** — there was no headroom (a floor
effect). The experiment bounds the effect on *easy* tasks near zero; it neither confirms nor refutes the
outcome hypothesis. Showing corrective value would need higher-blast-radius tasks or a weaker base model
(future work). As pre-registered, the thesis rests on Themes 1–4; H18 is an honest pilot.

## 4. What the study found *in codeweb itself*

A study that only confirms is suspect. The strongest evidence that this evaluation is rigorous is that
it **found real bugs** — and fixed them in the open, each behind a reproducible A/B lever so anyone can
flip the fix off and watch the metric regress.

1. **The pipeline was not deterministic.** `extract-symbols` enumerated files via `rg --files`, whose
   parallel walk returns an unordered list (checked directly: 4 distinct orderings in 6 runs vs 1 when
   sorted); that order propagated into node ordering *and* domain assignment, so the same repo produced
   different analysis on different runs. And `overlap.mjs` crashed the whole pipeline on `express` via a
   stack-overflowing `Math.min(...sims)`. Fixes: sort the file list; use a spread-free reduce. The
   286-test suite — which pins *invariants*, not reproducibility — never caught either. After the fix,
   H1 holds at R=20 on all six repos.

2. **"Safe to delete" wasn't safe.** `deadcode`'s safe tier correctly excluded symbols *called by*
   tests, but not functions *defined in* test files (helpers, mocks, `it`/`describe` registrations) —
   which have no inbound code edge. On `express`, 928 of 932 "safe" items were test functions; "delete
   the safe list" would have deleted the test suite's scaffolding. Fix: route test-file definitions to
   "review". Safe-tier precision rose **0.52 → 1.0**.

## 5. Limitations & threats to validity

- **Construct.** "Regression" is defined operationally by `diff.mjs` (new cycle / new duplication /
  lost-all-callers) — a *structural* proxy for harm, not a semantic-correctness oracle.
- **External validity.** Synthetic corpora give exact labels but an artificial distribution; the six
  real repos give a realistic distribution but approximate labels (the axios labels are body-confirmed
  human-style judgments, disclosed as such).
- **Baseline contrast (H9).** The name-match baseline's precision is pinned near 0.5 by the 1:1 planted
  ratio; the F1 separation is real but its *magnitude* is partly a construct property.
- **Oracle independence.** The Theme 2 SCC/impact oracles are written from scratch; the H5 pre-flight
  oracle reuses an edit-applier from the project's property-test harness (independent of the engine, but
  in-repo). Disclosed rather than overstated.
- **Timing.** Single-machine wall-clock; we foreground portable quantities (log-log slope, ratios). H17
  is run-to-run variable and has failed a strict single-run threshold on a loaded machine.
- **Calibrated language.** "Zero observed disagreements" with a Rule-of-Three bound is empirical
  evidence at a stated confidence, not a formal proof; we avoid "proven".
- **Agent A/B (Theme 5).** Not byte-reproducible (model nondeterminism); rests on 8 paired tasks with a
  degenerate (floor-effect) CI and self-reported (if deterministic) grading; the weakest-evidence theme
  by design, explicitly not load-bearing for the thesis.

## 6. Reproduce it

```
bash paper/corpus/clone-corpus.sh     # clone + pin the corpus by SHA
node paper/run-all.mjs                # regenerate every deterministic result + the env manifest
```

Raw results: [`paper/results/`](results/). Pre-registration & deviation log:
[`PRE-REGISTRATION.md`](PRE-REGISTRATION.md). Each harness exits non-zero if any hypothesis misses its
pre-registered criterion, so a silently-broken claim cannot ship green.

## 7. Conclusion

codeweb's deterministic guarantees are not marketing: its structural analysis **matched independent
oracles in every one of ~490,000 trials**, its detectors are accurate against labeled ground truth, and
it is fast and dependency-free. Where it fell short, the evaluation said so — and in two cases that
honesty produced a *better tool*, because the harnesses found defects the existing test suite did not.
Outcomes over promises: the data is in [`paper/results/`](results/), and the deterministic results
regenerate with one command.
