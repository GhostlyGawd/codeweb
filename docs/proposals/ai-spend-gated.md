# Funded proposals — the spend-gated AI work (NOT run)

Three of AI-IDEAS.md's six ideas cost real benchmark tokens — the exact line item REVENUE.md
aims sponsorship at ("heavy multi-agent spend", docs/ROADMAP.md). Per the standing constraint,
**none of these has been run**; this document is the ready-to-execute proposal for each, so the
moment budget exists the work starts from a plan instead of a blank page. Everything else in
AI-IDEAS (ideas 1/3/4 — /codeweb-apply, the narration sidecar, /codeweb-pitch) shipped as
prompt-only packaging with zero spend.

## P1 — Tool-routing optimization, measured (AI-IDEAS Idea 2)

- **Claim to test:** the 27 MCP tool descriptions + the handshake INSTRUCTIONS are prompts;
  variants change how often a frontier agent picks `codeweb_callers` over grep mid-task.
- **Harness (exists):** `bench/replay-ab.workflow.js` + `bench/replay-mine.mjs` ground-truth
  tasks; usage accounting from `bench/efficiency-pilot.usage.mjs`; engine frozen, descriptions
  varied; publish routing-rate + recall deltas per variant.
- **Gate:** a variant ships only if routing improves at non-inferior recall; numbers pinned in
  `bench/budgets.json` like every other claim. A null publishes as a null.
- **Estimated spend:** moderate (same order as the efficiency pilot's reps5 run).

## P2 — Repo vocabulary sidecar for codeweb_find (AI-IDEAS Idea 5)

- **Claim to test:** a reviewed `.codeweb/vocab.json` (concept -> this repo's identifier tokens)
  merged as LOW-WEIGHT synonym expansions improves find-quality without embeddings.
- **Prerequisite:** a find-quality benchmark (extend the bench harness) — the engine change is
  small (`find-core` weighted expansion, `match: "vocab:"` provenance) but MUST prove itself
  before shipping; `budgets.json` gates it.
- **Estimated spend:** one-time generation per corpus repo (~5-20k tokens each) + the benchmark.

## P3 — Grade the agent fallback path (AI-IDEAS Idea 6)

- **Claim to test:** the dissector/domain-mapper agents — the ONE shipped AI component with no
  published number — score X node/edge precision-recall against the deterministic engine's graph
  on corpus repos the fast path handles (`bench/corpus.manifest.json`, `bench/lib/oracles.mjs`).
- **Output either way:** a published table on the research page; bad numbers ship as an honest
  boundary ("treat orphan/deadcode output as unavailable in fallback mode") plus a follow-up
  rule: fallback graphs get `meta.engine: 'agent'` caveats on advisor output.
- **Estimated spend:** moderate, one-off per prompt revision. Batch with P1 to share setup.

## Trigger

Run P1+P3 as one funded batch when sponsorship or an explicit operator go-ahead covers the
bench line item; P2 waits for its benchmark. Until then: proposals only — nothing here has
been executed, and no number from this document may be quoted as measured.
