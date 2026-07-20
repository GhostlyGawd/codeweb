# Spec M: efficiency-pilot re-run on v0.9.0 — budgeted-surface treatment

## Problem
The strongest end-to-end receipt (8 engine-frozen reps: recall +0.265 ± 0.045, steps −34%,
total tokens −44% vs grep) was measured on engine `c892f50` — **before** the budgeted
response contract, the `ref`-edge work's successors, and everything since v0.3.x. The product
review's addendum still says the budgeted re-run is "blocked on an agent harness". That is
stale: `bench/experiments/efficiency-pilot.workflow.js` IS the harness, the hand-verified
truth set is frozen and committed, and the Workflow runtime that ran reps8 is available. Two
real gaps remain: the harness hardcodes a Windows `ROOT`, and its treatment arm calls
`query.mjs` **unbudgeted** — so no committed run has ever measured the responses agents
actually get by default over MCP (`--limit 20` parity, `count` + `more` cursor).

## Behavior (testable contract)
1. **Portable harness.** `ROOT` comes from `args.root` (default preserved), graphs dir from
   `args.graphs` (default `<root>/.codeweb/pilot`). No other behavior change at defaults.
2. **Budgeted treatment variant.** `args.budgeted: true` switches the treatment prompt to
   MCP-parity consumption: the agent is told the default surface is
   `--dependents <id> --limit 20 --json` (summary + byKind counts + top-20 + `more.remaining`)
   and may page with `--offset` or drop to `--full`-equivalent (no limit) only when it judges
   completeness requires it — exactly the choice a real MCP agent has. Control arm unchanged.
   `usedBudgeted` is recorded in the run config.
3. **Current-engine graphs.** Pilot graphs for axios + flask rebuilt with the CURRENT engine
   at the corpus manifest pins; a deterministic pre-flight compares `--dependents` counts per
   frozen-truth target against truth sizes and records the delta (engine drift is expected —
   it is part of what the re-run measures; the pre-flight just proves the ids still resolve).
4. **The run.** 5 engine-frozen reps via Workflow with `args.truth` (oracle skipped) +
   `args.budgeted` + portable root. Grading identical to reps8 (paired delta mean ± SD at
   symbol level vs frozen truth). Afterward `efficiency-pilot.usage.mjs` joins the run's
   journal + transcripts for tokens/tool-calls — same method as the reps8 usage receipt.
5. **Honest publication, whatever the outcome.** Results → `efficiency-pilot.reps5-v090.json`
   + `efficiency-pilot.usage-v090.json`; STATE.md gains a v0.9.0 section; the PRODUCT-REVIEW
   addendum's "blocked" line is replaced by the measured numbers; the site evidence ledger
   gets the entry. Registered expectation, stated up front: response budgets shrink the
   *response-size* receipt (−91–97%, already measured) but full-recall discovery may show a
   **small** end-to-end token delta vs the unbudgeted baseline — the run exists to measure
   that honestly, not to confirm the >90% guess in the review.

## Tests (TDD — tests/efficiency-pilot-harness.test.mjs, extended)
- **M1 root portability:** stubbed runtime; `args.root` overrides every path in the prompts
  (no `D:/` remnant); defaults unchanged without it.
- **M2 budgeted prompt:** with `args.budgeted`, the treatment prompt contains the `--limit 20`
  parity instruction and the config echoes `usedBudgeted: true`; without it, prompt is
  byte-identical to today's.
- **M3 pre-flight:** the graph pre-flight (plain node script) exits nonzero if a frozen-truth
  symbolId fails to resolve in the rebuilt graph, zero otherwise, and prints per-target
  count-vs-truth deltas.

## Done when
Harness tests pass; suite green; pre-flight clean on rebuilt graphs; the 5-rep budgeted run
completed and committed with usage numbers; STATE/addendum/site updated with measured (not
predicted) figures.
