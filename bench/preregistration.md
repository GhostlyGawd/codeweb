# The 33 pre-registered checks — the on-main receipt

The headline stat "**32 / 33 pre-registered checks pass**" needs a source you can open without
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

## The 33 checks

**Theme 1 — Determinism (2 checks · `bench/results/determinism.json`)**

| # | Check | Pre-registered criterion | Verdict |
|---|---|---|---|
| 1 | H1 byte-deterministic pipeline | same input ⇒ byte-identical graph/report across runs & path orders | **PASS** — after finding and fixing a real bug (unsorted file enumeration + an O(n²) spread that crashed express); reported, not hidden |
| 2 | H2 incremental ≡ full | refresh output byte-equal to a cold rebuild | **PASS** |

**Theme 2 — Correctness vs independent oracles (5 checks · `bench/results/correctness-query.json`)**

| # | Check | Comparisons | Disagreements | Verdict |
|---|---|---|---|---|
| 3 | H3 `--cycles` == independent Kosaraju SCC | 10,212 | 0 | **PASS** |
| 4 | H4 `--impact` == independent reverse-BFS | 120,454 | 0 | **PASS** |
| 5 | A-CALL `--callers/--callees` == raw edge neighbors | 120,454 | 0 | **PASS** |
| 6 | A-TESTS `--tests` == independent test-edge scan | 120,454 (eff. ~10² non-empty) | 0 | **PASS** |
| 7 | A-CP `context-pack` window ⊇ impact set | 120,454 | 0 | **PASS** |

(~490k+ comparisons total across the families — the "0 disagreements across ~490k" stat is the sum
of rows 3–7; each symbol-level family alone is ~120k.)

**Theme 2 (cont.) — Edit-safety & pre-flight (6 checks · `bench/results/edit-safety.json`)**

| # | Check | Trials | Violations | Verdict |
|---|---|---|---|---|
| 8 | H5 `simulate-edit` predicted verdict == actual gate verdict | 10,000 | 0 | **PASS** |
| 9 | H6 campaign prefixes never add a cycle | 2,000 | 0 | **PASS** |
| 10 | H7 sharded query == whole-graph query | 2,000 | 0 | **PASS** |
| 11 | H8 codemod plan == post-write actual; merge↔inverse restores | 2,000 | 0 | **PASS** |
| 12 | A-CUT every break-cycles cut removes its cycle | 2,000 | 0 | **PASS** |
| 13 | A-READ reading-order lists callees before callers | 2,000 | 0 | **PASS** |

(The "0 violations over 20,000 trials" stat sums rows 8–13.)

**Theme 3 — Detection accuracy (5 checks · `bench/results/detection-accuracy.json`)**

| # | Check | Result | Verdict |
|---|---|---|---|
| 14 | H9 Type-1 clone P/R/F1 | 1.0 / 1.0 / 1.0 (F1 CI lo 0.998); axios precision 0.98 | **PASS** |
| 15 | H10 Type-2 (renamed) clone recall | structural 1.0 vs lexical 0.0 | **PASS** |
| 16 | H11 find-similar ranking | MRR 0.99, r@1 0.975, r@5 1.0 | **PASS** |
| 17 | H12 false-hub in-degree | 0 (legacy fabricated 11–30) | **PASS** |
| 18 | H13 dead-code safe-tier precision | 1.0 (legacy 0.52) | **PASS** — after finding and fixing a second real bug |

**Theme 4 — Performance & scale (4 checks · `bench/results/performance.json`)**

| # | Check | Result | Verdict |
|---|---|---|---|
| 19 | H14 sub-quadratic scaling | b = 0.33, CI [0.13, 0.53] — quadratic rejected | **PASS** |
| 20 | H15 incremental speedup at *every* churn fraction | faster ≤10% churn; parity at 25–50% | **MISS** — the one failed check, reported as a measured curve, not a slogan |
| 21 | H16 zero required dependencies | runs on empty `node_modules` | **PASS** |
| 22 | H17 sub-second query latency | median ~95–117 ms, p95 264 ms | **PASS** (run-variance disclosed) |

**Auxiliary feature coverage (11 checks · `bench/results/auxiliary.json`)**

| # | Check | Verdict |
|---|---|---|
| 23 | per-language extraction parity (original 5 languages) | **PASS** 5/5 |
| 24 | report self-contained (zero network refs) | **PASS** |
| 25 | treemap termination on adversarial input | **PASS** |
| 26 | CI gate exit codes | **PASS** |
| 27 | duplication-trend monotonicity | **PASS** |
| 28 | placement gravity | **PASS** 200/200 |
| 29 | fitness-rule detection | **PASS** recall 1.0, 0 false flags |
| 30 | risk monotonicity | **PASS** 0/10,000 violations |
| 31 | hotspots formula | **PASS** 0/460 mismatch |
| 32 | suppression identity | **PASS** |
| 33 | MCP↔CLI parity across all tools | **PASS** |

**Score: 32 / 33.** The miss is #20 (H15), kept as a miss — the criterion demanded a speedup at
*every* churn fraction and refresh only wins for realistic small changes.

## Plus the capstone (outside the 33, reported anyway)

**H18 — agents edit better with codeweb:** pre-registered, frozen task set, adversarially screened —
**null** (paired difference exactly 0; a floor effect on clean tasks, not a power result;
`bench/results/agent-ab.json`). The later *discovery* pilots are separate, post-registration studies
with their own frozen truth (`bench/experiments/efficiency-pilot.truth.json`): the current run
(v0.9.0, budgeted responses) found recall **+0.310 ± 0.039 at equal token cost**
(`efficiency-pilot.reps5-v090.json`), and an earlier run's step/token savings that did not replicate
are reported beside it (`efficiency-pilot.reps8.json`).
