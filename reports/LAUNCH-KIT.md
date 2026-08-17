# LAUNCH-KIT — the honest launch, prepared

**Drafted 2026-08-17** (PLAN Phase 2.8, executing GRW-F1 / PROOF §4.4). Repo-side prep only:
**posting, timing, and channel are the operator's** — nothing here goes out until you send it.
Every number below traces to a committed receipt; the claim table lists the source beside each.
The `dontClaim` list in `site/data/product.json` binds this document like any other surface.

## Why this story, why now

At ~79–92 downloads/wk (4.6% of the distribution trigger), 0 stars, and 0 external gate
adopters, announcement — not product polish — is the bottleneck (PLAN §3). The one
launch-shaped story this project owns is the **honesty of its evidence**: pre-registered
checks, independent oracles, published nulls. No competitor in the category publishes
reproducible numbers (COMPETITIVE §4). Prerequisites PROOF §4 required — consistent numbers,
a working install path, shelf presence — are verified done; the truth sweep (PLAN Phase 0)
re-verified every claim surface this week.

## The draft post (Show-HN-shaped; operator edits freely)

> **Show HN: codeweb — we pre-registered 33 checks and let the TypeScript compiler referee**
>
> codeweb maps a repo into a deterministic call/import graph (~3s for 3k symbols, no LLM in
> the loop) that coding agents query over MCP — who calls this, what breaks, does this already
> exist — instead of grepping. A CI gate diffs the graph and fails a PR that adds a dependency
> cycle, a duplicate implementation, or orphans a symbol.
>
> The part we think is worth your click: before collecting data we wrote down 33 pass/fail
> checks and graded them against independent oracles (the TypeScript compiler, Kosaraju SCC,
> reverse-BFS, an edit applier) on six SHA-pinned repos. 490k+ comparisons, zero
> disagreements. The efficiency pilot showed +0.31 caller recall at equal token cost — and the
> token-savings claim from an earlier run did **not** replicate, so we published that null and
> lead with the replicated number. The whole ledger, raw data included, is in the repo.
>
> Free, MIT, zero required dependencies, runs entirely local — no accounts, no telemetry.
> `npx -y @ghostlygawd/codeweb .`

## Claim → receipt table (verify before posting; every row must still be true)

| Claim in the post | Receipt | Where |
|---|---|---|
| 33 pre-registered checks, independent oracles | pre-registration + results | `bench/preregistration.md`, `bench/results/`, research page |
| 490k+ comparisons, zero disagreements | correctness suite | `bench/results/correctness-query.json` (frozen 2026-07-23) |
| +0.31 recall at equal cost (v0.9.0 pilot) | efficiency pilot, 5 reps | `bench/experiments/efficiency-pilot.reps5-v090.json` |
| The null, published | H18 + non-replicating token savings | research page "what didn't replicate" section |
| ~3s for 3k symbols | perf fit + planted-quadratic control | `bench/results/performance.json` |
| Deterministic, no LLM | determinism pins + charter invariant | `bench/results/determinism.json`, `CHARTER.md` |
| Zero deps, local, no telemetry | AC-3, package-shape pins | `SPEC.md`, `tests/package-shape.test.mjs` |

Do **not** add: the 126× figure without its "simulated grep loop" framing; any cost/sponsorship
premise (C7); "two modes" external-review billing (C3); price or SLA language (C4).

## Launch-day checklist (operator)

1. **Before**: cut the release carrying Phases 0–3 (`release-tag` skill) so the post points at
   surfaces the widened claims gate just passed; run the `150 · Drift Audit`.
2. **Seed the shelves** (zero-code, `OPERATOR-ACTIONS.md`): Google Search Console verification
   + sitemap submit; directory submissions (glama.ai, mcp.directory, awesome-claude-code —
   the MCP registry listing already exists).
3. **Post** — suggested primary: Show HN (the story above is shaped for it). The research page
   (`…/research.html`) is the landing; it opens with the pre-registration framing.
4. **Day of**: watch issues; answer with receipts (link the ledger row, not adjectives).
   The gate Action and the rules-snippet page are the two "try it deeper" pointers.
5. **After**: the acquisition ledger's next Monday snapshot is the honest scoreboard —
   `npmWeeklyDownloads` and the new `gateReposExternal` column. No other analytics exist,
   by design.

## What success looks like (and what it doesn't)

The distribution trigger (charter non-goal 5) needs >2k downloads/wk **or** >10 external gate
repos. A good launch moves the weekly baseline and seeds the first external gate adopters; it
does not need to hit the trigger in a week. A quiet launch is information too — the next lever
is the measurement batch / edit-quality evidence (the Next pack in `reports/PLAN.md`), not
louder copy.
