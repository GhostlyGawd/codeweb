# codeweb — Charter

**Date:** 2026-07-25 · first ratification pass (operator interview, this date). Lines marked
**OPEN** are unresolved and stay that way until the operator rules — they are never guessed.
Agents: read this before changing product behavior, public copy, or claims (`CLAUDE.md`).

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
**"Your agents break less code and burn fewer tokens."** — the one-liner, operator-picked
2026-07-25; benefit-first and receipts-backed (callers found 44%→74%; impact answers at a
fraction of grep's tokens). The mechanism: before an edit, the agent asks the map — who calls
this, what breaks, does this already exist — and gets exact, small answers; the regression gate
enforces the same sight after the edit. Agent-first: the human-facing report visualizes the
findings and never leads. **OPEN:** external adoption-review mode — peer mode or feature note (C3).

## Non-goals
1. No resident daemon (`docs/decisions/fastpath-daemon.md`, NO-GO 2026-07-20; revisit triggers there).
2. No embeddings or vector search — `find` stays deterministic-lexical.
3. No LLM inside the runtime analysis path — agent edges, labeled sidecars, reviewed build-time artifacts only.
4. No accounts, telemetry, or license keys in the local product, ever.
5. No hosted "Teams" build before the distribution trigger (>2k downloads/wk or >10 external repos on the gate Action).
6. No VS Code Marketplace publish (standing instruction; the .vsix still ships per release).
7. The parked A/B experiments (P1–P3, `docs/proposals/ai-spend-gated.md`) run only on an
   explicit operator go. *(Struck 2026-07-25: the prior wording gated them on sponsorship
   covering "real API money" — the operator confirms they cost no such thing. The cost premise
   was AI-invented and strategy was built on top of it; see C7.)*
8. No new first-class language until its parser grammar can be pinned and verified
   (`scripts/grammars/PROVENANCE.md` discipline).
9. The academic-paper packaging of the research is retired; the measurement machinery stays, and
   its job is receipts behind public claims (operator: "the whole intent was to measure the tool").
10. The human-facing map stays a supporting view of the findings — it does not lead the pitch and
    does not grow into a separate product (operator, this interview).

## Invariants  *(proposed split — ratify or amend, Q5)*
**Invariant (breaking one breaks the promise):** runs entirely local, no accounts, no telemetry ·
reads code, never executes it · zero required dependencies · deterministic — same code, same map,
no LLM in the analysis loop · everything local is free forever (MIT) · no claim without a
source — numbers trace to measurements, and premises about costs, constraints, or economics
trace to the operator (amended 2026-07-25, after C7) · agent answers stay small (the token half
of the problem).
**Current fact, free to change:** the terminal-editorial brand and all copy (operator: "the brand
is off") · the Node ≥22 floor · the tool count.

## Now / Next / Not-now
**Now — the identity milestone** (operator: "figure out the product's identity before we keep
doing anything else"):
1. Ratify this charter's OPEN items (sponsorship copy, C3, C4, invariant split).
2. Write the one identity statement — problem · user · job — in the ratified words.
3. Re-align every claim-bearing surface to it: README hero, site tagline
   (`site/data/product.json`), npm description (`package.json`), plugin.json / marketplace.json,
   the support/sponsor copy (C7), and refresh stale `docs/ROADMAP.md` (C1/C5/C6).
4. Enforce it: the identity line joins `check-consistency`, so surface drift fails CI.
5. Then cut the release carrying the redesign plus the realigned copy.

**Next:** **OPEN** — candidates: edit-quality science (H22) · the funded bench batch (P1+P3) ·
the next language (C/C++ is the loudest gap) · publish the free-forever/Teams boundary statement.

**Not-now:** Teams build · VS Code Marketplace · daemon · embeddings · paper packaging ·
new languages until their grammars clear provenance.

## Done looks like  *(one stranger-runnable check per Now outcome)*
1. `CHARTER.md` has no unmarked gaps — every **OPEN** is deliberate, and Problem/User/Job each
   carry one ratified sentence.
2. One `grep` finds "Your agents break less code and burn fewer tokens." on all four public
   surfaces (README, product.json, package.json, plugin.json); `npm run check-consistency`
   fails when any of them drifts.
3. `docs/ROADMAP.md` no longer claims the retired program framing or the superseded numbers,
   and no surface still says sponsorship pays for AI benchmarking bills (C7 swept).
4. `npm view @ghostlygawd/codeweb version` prints the release that shipped the realigned copy.
5. `CLAUDE.md` exists and points here first. ✔ (this commit)

## Open questions
Asked **one at a time** (operator's request, 2026-07-25), in this order — future sessions
continue from the first unanswered item:
1. What sponsorship actually funds, now the AI-bills claim is struck (C7) — the support copy
   must say something true, or nothing.
2. External mode: peer mode or feature note (C3).
3. Enterprise support at $3–6k/yr: real offer or placeholder (C4).
4. Invariant split: ratify or amend.
5. Next milestone: pick one candidate (can wait until the identity work lands).
*(Answered 2026-07-25: the job one-liner — "Your agents break less code and burn fewer tokens." ·
the user — the agent-heavy individual dev, the CI gate included in their surface.)*

## Contradictions found
| # | Claim · where stated | What the code/history shows | Ruling |
|---|---|---|---|
| C1 | "The bar that does not move" — the four-phase science program (`docs/ROADMAP.md`) | Edit-quality leg still an open null; recent weeks all growth/brand work | **Ruled:** the program is retired as the governing plan; measurement stays as the receipts discipline; refresh the file (Now §3) |
| C2 | "The living map of your codebase." (site) vs "See what an edit breaks before you write it" (npm) | Two lead jobs on two public surfaces | **Ruled:** agent-first leads; the map is demoted to supporting view; the tagline changes in realignment |
| C3 | "Two modes" — external review as a peer of internal (README) | A skill step + verdict appendix no benchmark or audit touches | **OPEN** |
| C4 | Enterprise support "available now", $3–6k/yr (README) | A mailto doorway; no SLA or contract machinery in the repo | **OPEN** |
| C5 | "Phase 4 blast-radius pre-flight does not exist yet" (`docs/ROADMAP.md`) | Its product half shipped (pre-edit hook, sidecar, impact cards); its science half never ran | **Ruled:** refresh with C1 |
| C6 | Efficiency proven as "−44% tokens" (`docs/ROADMAP.md`, status 2026-06-27) | The v0.9.0 re-run reframed the win: +0.31 recall at equal cost | **Ruled:** refresh with C1 |
| C7 | "Sponsorship funds development — mainly the AI bills from benchmarking" (README Support, site support page; premise repeated in `reports/REVENUE.md` and `docs/proposals/ai-spend-gated.md`) | Operator, 2026-07-25: the benchmarks do not cost actual API money — the cost premise was AI-invented and a funding strategy was built on top of it | **Ruled fabricated:** strike or rewrite in realignment; what sponsorship actually funds is OPEN (Q3) |
