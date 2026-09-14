# codeweb — Charter

**Date:** 2026-07-25 · **ratified** in the operator interview of this date; the one
deliberately-open item (Next) is marked below. **Amended 2026-08-17/18** in a second operator
interview — the four rulings are listed under Amendments and land inline, each dated and
attributed, in the section it changes. Anything this charter doesn't settle goes to
Open questions and is asked to the operator — never guessed. Agents: read this before changing
product behavior, public copy, or claims (`CLAUDE.md`).

## Problem  *(ratified)*
Coding agents edit code they can't see: they miss real callers and break working code, and they
burn outsized tokens grepping toward an understanding the repo could hand them directly.
Receipts: 44%→74% caller recall vs grep; impact answers at a fraction of grep's tokens.

## User  *(ratified)*
The agent-heavy individual developer working their own repo. The whole surface is theirs —
including the CI gate, rules, and the GitHub Action: they gate their own PRs, not just teams
(operator, 2026-07-25). The team lead is the secondary audience, reached through the gate's
PR comments and courted for a later Teams tier.

## The job  *(ratified)*
**"See what your AI edits affect."** — current headline, user-authorized 2026-09-05.
**Descriptor:** Structural checks for AI code changes.
Before an edit, your agents query mapped callers and impact. After an edit, the gate checks
for new dependency cycles, body-confirmed duplication, and lost callers. A passing structural
check does not prove the program works. The human report remains a supporting view.

The earlier headline, “Your agents break less code and burn fewer tokens.”, is historical.
The current pilot supports improved caller discovery at similar total token cost. The 126×
result measures context size against a simulated graph-assisted grep loop, not total session
savings; the edit-quality experiment did not measure an improvement.

## Non-goals
1. No resident daemon (`docs/decisions/fastpath-daemon.md`, NO-GO 2026-07-20; revisit triggers there).
2. No embeddings or vector search — `find` stays deterministic-lexical.
3. No LLM inside the runtime analysis path — agent edges, labeled sidecars, reviewed build-time artifacts only.
4. No accounts, telemetry, or license keys in the local product, ever.
5. ~~No hosted "Teams" build before the distribution trigger (>2k downloads/wk or >10 external
   repos on the gate Action).~~ *(**Struck 2026-08-17 (operator).** The hosted Teams build is
   **green-lit now**; the distribution trigger is superseded and no longer gates it. Rationale —
   **market timing**: the operator rules the paid PR-gate category is being priced and taken
   now, and a trigger that waits for codeweb's own distribution to compound would hand that
   window away; the trigger measured readiness to convert an audience, not the moment the
   category opens. The counters stay instrumented — `gateReposExternal` in the weekly
   acquisition ledger keeps adoption observable — but as evidence, not as a gate. Non-goal 4
   is untouched: the build lives in a separate hosted service, and the local product still
   gets no accounts, no telemetry, no license keys, ever. Boundary and price intent: see the
   Boundary section.)*
6. No VS Code Marketplace publish (standing instruction; the .vsix still ships per release).
   *(**Reviewed and reaffirmed 2026-08-17 (operator)** during the Teams green-light: lifting
   non-goal 5 does not loosen this one. It stands unchanged and live — the release flow builds
   and attaches the .vsix and publishes nothing, and `.github/workflows/release.yml` records
   why the auto-publish step is absent.)*
7. The parked A/B experiments (P1–P3, `docs/proposals/ai-spend-gated.md`) run only on an
   explicit operator go. *(Struck 2026-07-25: the prior wording gated them on sponsorship
   covering "real API money" — the operator confirms they cost no such thing. The cost premise
   was AI-invented and strategy was built on top of it; see C7.)*
8. No new first-class language until its parser grammar can be pinned and verified
   (`scripts/grammars/PROVENANCE.md` discipline). *(**Amended — not struck — 2026-08-18
   (operator).** The bar stands exactly as written: a grammar still ships only vendored,
   sha256-pinned in the `PROVENANCE.md` table, ABI-checked against the pinned
   `web-tree-sitter` runtime, and machine-verified by `tests/grammar-provenance.test.mjs`.
   What the amendment adds is a second **trusted source**: official **tree-sitter org GitHub
   releases** (`github.com/tree-sitter/tree-sitter-<lang>`, a tagged release asset) now count
   alongside `@vscode/tree-sitter-wasm`, provided the vendored bytes carry a recorded sha256
   and a verified ABI. This extends the sourcing list; it weakens nothing — an unpinned or
   ABI-unverified grammar from either source still fails the bar. It unblocks C (the loudest
   gap), whose grammar has no `@vscode/tree-sitter-wasm` build.)*
9. The academic-paper packaging of the research is retired; the measurement machinery stays, and
   its job is receipts behind public claims (operator: "the whole intent was to measure the tool").
10. The human-facing map stays a supporting view of the findings — it does not lead the pitch and
    does not grow into a separate product (operator, this interview).

## Invariants  *(ratified 2026-07-25)*
**Invariant (breaking one breaks the promise):** runs entirely local, no accounts, no telemetry ·
reads code, never executes it · zero required dependencies · deterministic — same code, same map,
no LLM in the analysis loop · everything local is free forever (MIT) · no claim without a
source — numbers trace to measurements, and premises about costs, constraints, or economics
trace to the operator (amended 2026-07-25, after C7) · agent answers stay small (the token half
of the problem).
**Current fact, free to change:** the terminal-editorial brand and all copy (operator: "the brand
is off") · the Node ≥22 floor · the tool count.

## The boundary: free forever / Teams  *(ratified 2026-08-17, operator)*
The line between the free product and the paid one, ratified into this charter so no surface has
to improvise it (it had been drafted in `reports/REVENUE.md` §5 and left unratified; the Teams
green-light of non-goal 5 makes it load-bearing).

**The rule:** *anything that runs on one laptop against one repo is free forever; money buys
hosting, multi-repo aggregation, and human attention.* The paywall sits where the architecture
already draws the line — state that leaves the laptop — so Teams is not a withheld feature, it
is a different thing: a service. Everything shipped today (the map, the MCP tools, the hooks,
the report, the CI gate Action, every future language) stays MIT and free for one human and
their agent on their machine.

**Where billing lives:** only in the hosted service. Accounts, entitlements, seats, and payment
state never enter this repo (non-goal 4, invariant 1). A payment failure degrades the hosted
tier — grace period, then reversion to free behavior with the dashboard read-only — and **never
breaks local tooling or a customer's CI**.

**Price intent (Teams):** ~**€10 per active author per month**, flat-unlimited, an author being
one who committed in the trailing 90 days. Intent, not a live offer — it becomes a public claim
only when the service is real. Anchor: the category is priced at €18–27/active author/mo
(`reports/COMPETITIVE.md`, `reports/REVENUE.md` §2); undercutting it deliberately is the wedge.

**How the free product may point at the paid one** *(ratified 2026-08-24, operator — the
productize-and-launch mission).* The boundary above says what money buys; this says what the free
product is allowed to say about it, because a free tool that nags is a worse tool. Three surfaces
may carry one upgrade line each, and no others: the gate comment's footer (below its attribution,
never in the verdict or the findings), `trend.mjs`'s text rail at five or more snapshots, and the
receipt high point `run.mjs` already throttles. Every line is computed from local counters only —
no accounts, no telemetry, no network, non-goal 4 untouched — and all of them answer
`CODEWEB_NO_PROMO=1` (and the existing `CODEWEB_NO_STATS=1`). Three surfaces are ask-free zones
outright: MCP tool responses (agent-consumed and budgeted — an ask there burns the tokens this
product exists to save), hook cards (mid-work trust surfaces), and every error path (upselling on
a failure reads as ransom). Attribution footers are not upgrade lines: they stay unconditional.
The list is exhaustive by design — a fourth placement is a new ruling, not an extension of this
one. Prior art and the moment-by-moment reasoning: `reports/REVENUE.md` §3.

## Now / Next / Not-now
**Now — the identity milestone** (operator: "figure out the product's identity before we keep
doing anything else") — **complete 2026-07-25**, all five outcomes ✔; the operator picks Next:
1. Ratify this charter's OPEN items. ✔ (2026-07-25 — complete; Next stays deliberately open
   until this milestone lands.)
2. Write the one identity statement — problem · user · job — in the ratified words.
   ✔ (2026-07-25 — the Problem/User/Job sections above.)
3. Re-align every claim-bearing surface to it: README hero, site tagline
   (`site/data/product.json`), npm description (`package.json`), plugin.json / marketplace.json,
   the support/sponsor copy (C7), and refresh stale `docs/ROADMAP.md` (C1/C5/C6).
   ✔ (2026-07-25 — plus server.json and the GitHub-About settings file.)
4. Enforce it: the identity line joins `check-consistency`, so surface drift fails CI.
   ✔ (2026-07-25 — the gate reads the line from this file.)
5. Then cut the release carrying the redesign plus the realigned copy.
   ✔ (2026-07-25 — v0.11.0: tag + GitHub Release published, npm serving 0.11.0.)

**Next — picked 2026-08-17 (operator)**, closing the item left deliberately open on 2026-07-25:
**productize and launch** — publish the boundary statement above and the Teams price intent,
lead the story with the deterministic regression gate, ship C and C++ under the amended
non-goal 8, and build the hosted Teams service under the struck non-goal 5. Two of the four
parked candidates are taken in this pick; the measurement batch (P1+P3) and edit-quality
science (H22) stay parked, still gated on an explicit operator go per non-goal 7.
*(Superseded by that pick, kept for the record: ~~deliberately open (ruled 2026-07-25) — picked
after the identity milestone lands. Candidates on the table: the measurement batch (P1+P3) ·
edit-quality science (H22) · the next language (C/C++ is the loudest gap) · publish the
free-forever/Teams boundary statement.~~)*

**Not-now:** ~~Teams build~~ *(green-lit 2026-08-17 — non-goal 5)* · VS Code Marketplace
*(reaffirmed 2026-08-17 — non-goal 6)* · daemon · embeddings · paper packaging ·
new languages until their grammars clear provenance *(the bar itself is unchanged; its trusted
sources gained the tree-sitter org releases, 2026-08-18 — non-goal 8)*.

## Amendments

### 2026-09-05 — product clarity implementation *(user-authorized)*
The user requested a specification, task list, independent validation, implementation,
verification, and PR merge for the product and branding review. This authorizes the scoped
headline correction above and a dated qualitative Graphify comparison with primary sources.

The active identity is now “See what your AI edits affect.” with the descriptor “Structural
checks for AI code changes.” Claims must state measured limits. This supersedes the prior
headline only; the individual developer audience, local privacy invariants, agent-first
workflow, existing gate rules, free product boundary, and parked research gates remain.

The ledger of changes to ratified sections. Every entry is dated and attributed; nothing here
was decided silently, and an amendment that only *adds* to a bar says so explicitly.

### 2026-08-17/18 — the productize-and-launch interview *(operator)*
Four rulings. Each lands inline in the section it changes; this is the index.

| # | Ruling | Date | Where it landed |
|---|---|---|---|
| A1 | **Non-goal 5 struck** — the hosted Teams build is green-lit; the >2k downloads/wk · >10-external-repos distribution trigger is **superseded**, not met. Rationale: **market timing** — the paid PR-gate category is being priced and taken now, and waiting for codeweb's own distribution to compound would hand the window away. The trigger's counters stay instrumented as evidence (`gateReposExternal`), not as a gate. | 2026-08-17 | Non-goals §5 (struck, with rationale) · Not-now |
| A2 | **Non-goal 8 amended, not struck** — official **tree-sitter org GitHub releases** are ratified as a **second trusted grammar source** alongside `@vscode/tree-sitter-wasm`, on the same terms: vendored bytes, sha256 recorded in `scripts/grammars/PROVENANCE.md`, ABI verified against the pinned runtime, hash machine-checked by `tests/grammar-provenance.test.mjs`. The bar is **extended, never weakened**. Unblocks C. | 2026-08-18 | Non-goals §8 (amended) · Not-now |
| A3 | **The free-forever / Teams boundary is ratified into this charter** — the rule, the billing location, and the ~€10/active-author/mo Teams price intent. Previously drafted in `reports/REVENUE.md` §5 and never ratified; the Teams green-light makes it load-bearing. | 2026-08-17 | New section: The boundary: free forever / Teams |
| A4 | **Non-goal 6 reviewed and reaffirmed** — no VS Code Marketplace publish; the .vsix still ships per release. Lifting non-goal 5 does **not** loosen it. Explicitly re-examined in the same interview so its survival is a decision, not an oversight. | 2026-08-17 | Non-goals §6 (reaffirmed) · Not-now |

**Untouched by the 2026-08-17/18 interview (operator)** — recorded so silence is not read as
consent: non-goals 1–4, 7, 9, 10 · the Problem / User / Job sections and the ratified job line ·
the invariants, including "no accounts, telemetry, or license keys in the local product, ever" —
the Teams build is a separate hosted service precisely so that invariant survives A1 · the C1–C7
contradiction rulings · the 2026-07-27 open question, which stays open (see Open questions).

## Done looks like  *(one stranger-runnable check per Now outcome)*
1. `CHARTER.md` has no unmarked gaps — every open item is deliberate, and Problem/User/Job
   each carry one ratified sentence. ✔ (this interview)
2. One `grep` finds "See what your AI edits affect." on all four public
   surfaces (README, product.json, package.json, plugin.json); `npm run check-consistency`
   fails when any of them drifts.
3. `docs/ROADMAP.md` no longer claims the retired program framing or the superseded numbers,
   and no surface still says sponsorship pays for AI benchmarking bills (C7 swept).
4. `npm view @ghostlygawd/codeweb version` prints the release that shipped the realigned copy.
5. `CLAUDE.md` exists and points here first. ✔ (this commit)

## Open questions
One open (2026-07-27, raised by the JSON-support change): non-goal 8 gates new first-class
*languages* on pinned-grammar provenance, and is silent on data formats. JSON shipped as a
**config-file tier** — imported `.json` files become file-level `<module>` nodes; content is
never parsed, so there is no grammar to pin (`scripts/grammars/PROVENANCE.md` records the
no-parser fact). Does the operator ratify that data formats sit outside non-goal 8's bar, or
should the tier be held to it? To be answered before any second data format (YAML/TOML) is
considered. *(**Still open after the 2026-08-17/18 interview.** Reviewed there and deliberately
left open: the non-goal 8 amendment (A2) changes only the list of trusted grammar **sources**
and says nothing about data formats, so it neither answers nor moots this question. Its trigger
is unchanged — answer it before a second data format is considered. Per the one-at-a-time rule,
it was not asked in that interview, which spent its question on the Teams green-light.)*
New questions are asked **one at a time** (operator's request, 2026-07-25).
~~Next is deliberately open until the identity milestone lands.~~ *(Closed 2026-08-17 — the
operator picked Next: productize and launch. See Now / Next / Not-now.)*
*(Answered 2026-07-25: the job one-liner — "Your agents break less code and burn fewer tokens." ·
the user — the agent-heavy individual dev, the CI gate included in their surface · sponsorship —
supports the project, and sponsors get featured README placement: logo tiers up top, a name
list beneath; no cost claims · external mode — demoted to a feature note · enterprise support —
softened to a one-line email doorway, no price, no SLA claim · the invariant split — ratified
as written · Next — deliberately left open until the identity milestone lands.)*
*(Answered 2026-07-26, at the 141 · Scaffold gate — operator go "Do everything" on
`reports/SCAFFOLD.md`'s proposals. Two boundaries the charter was silent on, decided by the
harness install and recorded in ADR-0001: the ADR split — root `DECISIONS.md` holds harness and
dependency ADRs (the file `scripts/spec_lint.py` greps), `docs/decisions/` keeps product design
history · the harness contract's landing spot — `docs/harness.md`, pointed to from `CLAUDE.md`.)*
*(Answered 2026-08-17/18, the productize-and-launch interview — the four rulings A1–A4 are
recorded in full under Amendments: Teams green-lit, non-goal 5's trigger superseded on market
timing · tree-sitter org releases ratified as a second trusted grammar source, non-goal 8
extended not weakened · the free-forever/Teams boundary ratified, billing only in the hosted
service, Teams price intent ~€10/active author/mo · non-goal 6 reviewed and reaffirmed
unchanged · and Next picked, closing the item left deliberately open on 2026-07-25.)*

## Contradictions found
| # | Claim · where stated | What the code/history shows | Ruling |
|---|---|---|---|
| C1 | "The bar that does not move" — the four-phase science program (`docs/ROADMAP.md`) | Edit-quality leg still an open null; recent weeks all growth/brand work | **Ruled:** the program is retired as the governing plan; measurement stays as the receipts discipline; refresh the file (Now §3) |
| C2 | "The living map of your codebase." (site) vs "See what an edit breaks before you write it" (npm) | Two lead jobs on two public surfaces | **Ruled:** agent-first leads; the map is demoted to supporting view; the tagline changes in realignment |
| C3 | "Two modes" — external review as a peer of internal (README) | A skill step + verdict appendix no benchmark or audit touches | **Ruled:** demoted to a feature note; capability stays, mode billing goes in realignment (2026-07-25) |
| C4 | Enterprise support "available now", $3–6k/yr (README) | A mailto doorway; no SLA or contract machinery in the repo | **Ruled:** softened — drop the price and the SLA claim; keep a one-line doorway ("Running codeweb at an org and want help? Email.") in realignment (2026-07-25) |
| C5 | "Phase 4 blast-radius pre-flight does not exist yet" (`docs/ROADMAP.md`) | Its product half shipped (pre-edit hook, sidecar, impact cards); its science half never ran | **Ruled:** refresh with C1 |
| C6 | Efficiency proven as "−44% tokens" (`docs/ROADMAP.md`, status 2026-06-27) | The v0.9.0 re-run reframed the win: +0.31 recall at equal cost | **Ruled:** refresh with C1 |
| C7 | "Sponsorship funds development — mainly the AI bills from benchmarking" (README Support, site support page; premise repeated in `reports/REVENUE.md` and `docs/proposals/ai-spend-gated.md`) | Operator, 2026-07-25: the benchmarks do not cost actual API money — the cost premise was AI-invented and a funding strategy was built on top of it | **Ruled fabricated:** rewrite in realignment — sponsorship simply supports the project, and sponsors get featured README placement (big logos for big supporters, a name list beneath); no cost claims (operator, 2026-07-25) |
| C8 | "No hosted 'Teams' build before the distribution trigger" restated as live on two mirror surfaces: `SPEC.md` §Non-goals (+ its "Buyer and the first dollar" line, "a paid Teams tier waits behind the distribution trigger") and `docs/ROADMAP.md` (§Not now, and the boundary statement listed as a candidate "parked behind the distribution trigger (charter non-goal 5)") | Amendment A1 (2026-08-17) struck that trigger as superseded and green-lit the build; both files copy the charter's ratified list, so each now states a superseded rule as current | **Ruled drift, recorded not fixed here** (2026-08-17): the amendment lands in this file only, so the mirrors are stale by construction rather than by disagreement. Refresh both in the productize-and-launch work that publishes the boundary statement, and re-check them in the release drift audit (`CLAUDE.md`, 150 · Drift Audit). Until then this row is the marker that the divergence is known, not silent. — **Resolved 2026-08-18**, in the change that published the boundary and pricing pages: `SPEC.md` §Non-goals now carries non-goal 6 alone with the A1 note beside it, and its "Buyer and the first dollar" paragraph names codeweb Teams as the hosted tier instead of a trigger it waits behind; `docs/ROADMAP.md` moved the Teams build and the boundary statement out of "Not now" into the picked Next, with a dated correction recording why. Neither file states the superseded trigger as live any more; `tests/boundary-pricing.test.mjs` pins that |
| C10 | `reports/COMPETITIVE.md` §4 Bet 1 and §Next #1 prescribe the comparison page as "codeweb vs grep vs native LSP vs a code-graph MCP server, numbers CI-gated" — a third-party column with per-rival rows | The ratified restraint in `site/data/product.json` `dontClaim` says the opposite: "We compare only to stated, reproducible baselines … no head-to-head against tools we can't reproduce." A rival column needs numbers measured on someone else's product, which this repo cannot regenerate, and `tests/boundary-pricing.test.mjs` already forbids naming a rival beside a number on the pricing page | **Ruled: `dontClaim` governs** (2026-08-24, in the change that shipped `compare.html` and `lsp.html`). The comparison page compares **approaches** (text search · one-hop symbol lookup · whole-graph artifact) and measured baselines (the grep control in `oracle-ab.json` and the efficiency pilot), names no rival product, and binds every number to a committed receipt by VALUE (`tests/launch-pages.test.mjs`). The scan's §3 stake #2 — answer "Claude Code already has LSP" on the deciding surfaces — is met in full by `lsp.html`; only the rival-column half of Bet 1 is declined. Recorded here rather than silently: if the operator ever wants the third-party column, it needs a reproducible measurement protocol for each rival first, and `dontClaim` amended in the same change |
| C9 | `site/data/product.json` F10 "Sharded subgraphs — Answer queries from one shard + a boundary index, same result as the monolith" (mirrored to `docs/product.html`), and the pre-registered study hypothesis H7 that measured it | `scripts/lib/shards.mjs` was DELETED on 2026-07-19 (`8b6cfd4`), by a measured decision recorded in `bench/results/scale-typescript.json` → `previous.shardsDecision`: at 16k symbols the monolithic graph loads in ~200ms, the contract was never wired to any CLI or MCP surface, so the need did not exist. No shard capability ships; the tier-3 feature line and its receipt outlived the code by more than a month, invisible because `bench/experiments/edit-safety.mjs` still imported the deleted module and crashed before H7 could report | **Ruled drift, recorded not fixed here** (2026-08-24, surfaced by `bench-instruments-repair` when the harness was made runnable again): the repair's scope is the instruments, and retiring H7 in the receipt is inside it — H7 is now recorded as `retiredHypotheses` in `bench/results/edit-safety.json` with the decision source, never silently dropped. Editing a public feature list is claim-bearing copy and belongs to a copy change with the operator's eyes on it, not to a benchmark fix. Decide in that change whether F10 is withdrawn (the code is gone; git history holds it if a 100k+-symbol case appears) or restored, and re-check it in the release drift audit (`CLAUDE.md`, 150 · Drift Audit). Until then this row is the marker that the divergence is known, not silent. — **Resolved 2026-09-02 — F10 WITHDRAWN**, in the release drift audit that cut v0.14.0 (operator ruling): the F10 entry is deleted from `site/data/product.json`'s Tier 3 and from the `docs/product.html` it generates, so no public surface advertises a shard capability. Withdrawn rather than restored because the deletion was deliberate and measured, not an accident — `previous.shardsDecision` records the reasoning, and `8b6cfd4^` holds the implementation if a 100k+-symbol case ever justifies restoring it. Resolved the way C8 was: claim-bearing copy must not ship a feature that does not exist. In the same audit, the `dontClaim` latency line and the sub-quadratic-scaling claim were refreshed from the regenerated `bench/results/performance.json` (they quoted the pre-repair run: p95 264 ms on 3,201 symbols and b=0.33, against a measured worst p95 51.9 ms on 3,215 symbols and b=0.34) — a receipt re-run had moved the truth while the copy kept the old numbers, the C6 class, here in the pessimistic direction |
