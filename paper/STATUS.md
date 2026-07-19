# Status: frozen as an artifact (2026-07-19)

The paper did its job: the pre-registered studies found and fixed real engine bugs, produced the
published efficiency numbers (oracle A/B: recall 1.00 / precision 0.94 vs grep at ⅓ the context
cost; 126× on blast radius), and set the honesty discipline — independent referees, frozen task
sets, nulls reported plainly. Everything in `paper/` remains reproducible exactly as committed.

**No further paper-first work.** The evidence program now lives where users can see it:

- **`codeweb bench`** — the flagship study as a product command anyone runs on their own repo
  (same engine as `paper/results/oracle-ab.json`, byte-identical reproduction verified).
- **The local outcome ledger** (`scripts/stats.mjs`, counters written by the hooks + MCP server)
  — evidence from real use with a real denominator, per workspace, never transmitted.
- **The evidence ledger** on the site (`site/data/product.json`) — every public claim with its
  number, sample size, and source script. New results land there and in the CHANGELOG's
  Research notes, not in a manuscript.
- **Two funded instruments, ready when wanted** (in evidence-strength order):
  1. `replay-ab` — replays MINED historical caller-breakages with a built-in answer key
     (`replay-bench.README.md`). Preferred: no invented tasks, no floor effect.
  2. `agent-ab2` — the pre-registered field-study rerun (`agent-ab2.README.md`). Weakest
     instrument (model nondeterminism); reserve for an external-facing headline.

The discipline stays; the document format retires.
