# The pre-registered checks — the on-main receipt

The headline stat "**32 / 32 pre-registered checks pass**" needs a source you can open without
archaeology. This page is it: every check, its pre-registered pass criterion, its verdict, and the
result file that backs it.

**Timestamp proof.** The full pre-registration (hypotheses H1–H18, metrics, procedures, pass/fail
criteria) was frozen against engine `1186ce0` *before* any experiment ran, and is preserved verbatim
in git history — last at tag `v0.8.0`:

```
git show v0.8.0:paper/PRE-REGISTRATION.md   # the frozen registration (503 lines)
git show v0.8.0:paper/paper.md              # the full study write-up
```

Git history is the registry: the registration commit predates every result commit, and tags are
immutable. The runnable harnesses and current result files live in this directory
(`bench/experiments/`, `bench/results/`); the full study re-runs with `node bench/run-all.mjs`,
and CI re-measures the standing performance budgets on every PR (`npm run bench:all -- --gate`).

**Why 32 and not 33.** The registration froze 33 checks. One of them, **H7** (sharded-subgraph
query equivalence), measured `scripts/lib/shards.mjs` — deliberately deleted on 2026-07-19 in
`8b6cfd4`, by a measured decision recorded in `bench/results/scale-typescript.json` →
`previous.shardsDecision`. A check whose subject no longer ships cannot pass or fail; retiring it
with its feature is the honest disposition, and it is recorded as such rather than dropped:
`bench/results/edit-safety.json` carries it under `retiredHypotheses` with the decision source.
The 32 checks below are the ones that measure code that still ships, and **all 32 pass**. The
public feature claim the deleted code backed was withdrawn in the same accounting (charter C9).

Counting the retired check as a standing failure would have overstated the miss; dropping it
silently would have overstated the pass. It is listed, with its reason, at the bottom of this page.

## The 32 checks

**Theme 1 — Determinism (2 checks · `bench/results/determinism.json`)**

| # | Check | Pre-registered criterion | Verdict |
|---|---|---|---|
| 1 | H1 byte-deterministic pipeline | same input ⇒ byte-identical graph/report across runs & path orders (6 repos × 20 runs) | **PASS** — after finding and fixing a real bug (unsorted file enumeration + an O(n²) spread that crashed express); reported, not hidden |
| 2 | H2 incremental ≡ full | refresh output byte-equal to a cold rebuild (360 comparisons) | **PASS** |

**Theme 2 — Correctness vs independent oracles (5 checks · `bench/results/correctness-query.json`)**

| # | Check | Comparisons | Disagreements | Verdict |
|---|---|---|---|---|
| 3 | H3 `--cycles` == independent Kosaraju SCC | 10,212 | 0 | **PASS** |
| 4 | H4 `--impact` == independent reverse-BFS | 121,913 | 0 | **PASS** |
| 5 | A-CALL `--callers/--callees` == raw edge neighbors | 121,913 | 0 | **PASS** |
| 6 | A-TESTS `--tests` == independent test-edge scan | 121,913 | 0 | **PASS** |
| 7 | A-CP `context-pack` window ⊇ impact set | 121,913 | 0 | **PASS** |

(497,864 comparisons total across the families — the "0 disagreements across ~490k" stat is the sum
of rows 3–7; each symbol-level family alone is ~122k.)

**Theme 2 (cont.) — Edit-safety & pre-flight (5 checks · `bench/results/edit-safety.json`)**

| # | Check | Trials | Violations | Verdict |
|---|---|---|---|---|
| 8 | H5 `simulate-edit` predicted verdict == actual gate verdict | 10,000 | 0 | **PASS** |
| 9 | H6 campaign prefixes never add a cycle | 2,000 | 0 | **PASS** |
| 10 | H8 codemod plan == post-write actual; merge↔inverse restores | 2,000 | 0 | **PASS** |
| 11 | A-CUT every break-cycles cut removes its cycle | 2,000 | 0 | **PASS** |
| 12 | A-READ reading-order lists callees before callers | 2,000 | 0 | **PASS** |

(The "0 violations over 18,000 trials" stat sums rows 8–12.)

**Theme 3 — Detection accuracy (5 checks · `bench/results/detection-accuracy.json`)**

| # | Check | Result | Verdict |
|---|---|---|---|
| 13 | H9 Type-1 clone P/R/F1 | codeweb F1 1.0 vs baseline 0.667; axios precision 1.0 vs 0.706 | **PASS** |
| 14 | H10 Type-2 (renamed) clone recall | structural 1.0 vs lexical 0.0 | **PASS** |
| 15 | H11 find-similar ranking | MRR 0.988, r@1 0.975, r@5 1.0 (random MRR 0.107) | **PASS** |
| 16 | H12 false-hub in-degree | 0 (legacy 11–30) | **PASS** |
| 17 | H13 dead-code safe-tier precision | 1.0 (legacy 0.52) | **PASS** — after finding and fixing a second real bug |

**Theme 4 — Performance & scale (4 checks · `bench/results/performance.json`)**

| # | Check | Result | Verdict |
|---|---|---|---|
| 18 | H14 sub-quadratic scaling | b = 0.342, 95% CI [0.114, 0.570] — quadratic rejected | **PASS** |
| 19 | H15 incremental speedup at *every* churn fraction | ratio < 1 at all of 1/5/10/25/50% (0.55, 0.64, 0.61, 0.84, 0.86) | **PASS** — see the note below |
| 20 | H16 zero required dependencies | runs on empty `node_modules` | **PASS** |
| 21 | H17 sub-second query latency | worst p95 51.89 ms on 3,215 symbols | **PASS** |

**Auxiliary feature coverage (11 checks · `bench/results/auxiliary.json`)**

| # | Check | Verdict |
|---|---|---|
| 22 | per-language extraction parity (original 5 languages) | **PASS** 5/5 |
| 23 | report self-contained (zero network refs) | **PASS** |
| 24 | treemap termination on adversarial input | **PASS** 4/4 |
| 25 | CI gate exit codes | **PASS** |
| 26 | duplication-trend monotonicity | **PASS** |
| 27 | placement gravity | **PASS** 200/200 |
| 28 | fitness-rule detection | **PASS** recall 1.0 (134/134), 0 false flags |
| 29 | risk monotonicity | **PASS** 0/10,000 violations |
| 30 | hotspots formula | **PASS** 0/460 mismatch |
| 31 | suppression identity | **PASS** |
| 32 | MCP↔CLI parity across all tools | **PASS** 27/27 parity tools (28 shipped; `codeweb_map` covered by the MCP suite) |

**Score: 32 / 32.**

### The check that changed verdict, and why

**H15 (row 19) was the study's one published miss, and now passes.** The original criterion demanded
a speedup at *every* churn fraction, and the first run showed parity at 25–50% churn rather than a
win. It was kept as a miss and published as a measured curve rather than a slogan. On the repaired
harness (`5bca205`) the refresh path wins at all five fractions, so the criterion is now met on its
own original terms. The criterion was not moved to fit the result — the numbers above are the
committed ones in `performance.json`, and the curve is still published in full rather than reduced
to a single figure.

### The retired check

| Check | Why it is retired | Where that is recorded |
|---|---|---|
| H7 sharded query == whole-graph query | `scripts/lib/shards.mjs` was deleted 2026-07-19 (`8b6cfd4`) by a measured decision — at 16k symbols the monolithic graph loads in ~200 ms and the shard contract was never wired to any CLI or MCP surface. The subject of the hypothesis no longer ships | `bench/results/edit-safety.json` → `retiredHypotheses`; `CHARTER.md` C9 (the matching feature claim was withdrawn, not quietly kept) |

## Plus the capstone (outside the pre-registered set, reported anyway)

**H18 — agents edit better with codeweb:** pre-registered, frozen task set, adversarially screened —
**null** (paired difference exactly 0; a floor effect on clean tasks, not a power result;
`bench/results/agent-ab.json`). The later *discovery* pilots are separate, post-registration studies
with their own frozen truth (`bench/experiments/efficiency-pilot.truth.json`): the current run
(v0.9.0, budgeted responses) found recall **+0.310 ± 0.039 at equal token cost**
(`efficiency-pilot.reps5-v090.json`), and an earlier run's step/token savings that did not replicate
are reported beside it (`efficiency-pilot.reps8.json`).
