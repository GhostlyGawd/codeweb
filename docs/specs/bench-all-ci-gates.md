# Spec C: bench:all aggregator + CI benchmark gates + session-cost benchmark

## Problem
The claims that survived the paper's retirement live in `bench/results/` as frozen JSON, but
nothing re-runs them routinely, nothing stops a PR from silently regressing a published number,
and the biggest shipped win (budgeted MCP responses) has no standing measurement — the numbers
in PRODUCT-REVIEW.md were one-off. Receipts that can rot are not receipts.

## Behavior (testable contract)
1. **`npm run bench:all`** (`bench/all.mjs`) runs every deterministic, agent-free benchmark
   available in the current environment and writes one `bench/results/benchmarks.json`
   (+ mirror copy to `site/data/benchmarks.json`):
   - **pipeline**: full-run + warm-refresh wall-time on codeweb itself (median of 3);
   - **session-cost**: a scripted representative 12-call MCP session (brief, find, explain,
     context, impact ×2, callers ×2, cycles, hotspots, refresh, diff) against the self graph —
     bytes and ≈tokens per call and total, all responses parsed as valid JSON;
   - **tool-budgets**: every budgeted MCP tool answers within its per-tool byte budget
     (recorded in the file);
   - **ts-engine**: the Spec-A bench when the pinned corpus is present, else
     `{skipped: reason}` — never silently absent.
   Each section carries `ranAt` ISO stamp + environment note. Skips are explicit.
2. **CI gates.** A new `bench` job in `ci.yml` runs `bench:all --gate`, which **exits 1** when:
   any MCP response exceeds its budget, the session total exceeds 20k tokens, any response
   fails to parse, or warm refresh exceeds 2× the regex-extraction baseline. Thresholds live in
   `bench/budgets.json` — changing a promise is a reviewed diff, not drift.
3. **Claims audit.** `check-consistency` gains a claims section: every `source` named in
   `site/data/product.json`'s ledger must exist under `bench/results/`, and the README's
   headline numbers block must cite files that exist. Missing source → consistency failure.
4. **Receipt in the README.** The outcome-ledger receipt (the `npm run stats` one-liner) is
   shown in the README's proof section as a labeled example.

## Tests (BDD — tests/bench-all.test.mjs)
- **B1 given** a fresh self graph **when** `bench:all` runs **then** benchmarks.json contains
  pipeline/session-cost/tool-budgets sections, every response valid JSON, and the site mirror
  is byte-identical.
- **B2 given** a `budgets.json` with one budget lowered below reality **when** `--gate` runs
  **then** exit 1 naming the violated budget (and exit 0 with the real budgets).
- **B3 given** a ledger claim whose source file is missing **when** `check-consistency` runs
  **then** it fails naming the claim (and passes on the real tree).
- **B4 skip honesty:** with the corpus absent, the ts-engine section says skipped+reason.

## Done when
Tests pass; suite + consistency green; the CI `bench` job passes on this branch; committed
`benchmarks.json` holds the first real numbers.
