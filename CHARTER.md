# codeweb — Charter

**Date:** 2026-07-25 · **ratified** in the operator interview of this date; the one
deliberately-open item (Next) is marked below. Anything this charter doesn't settle goes to
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
**"Your agents break less code and burn fewer tokens."** — the one-liner, operator-picked
2026-07-25; benefit-first and receipts-backed (callers found 44%→74%; impact answers at a
fraction of grep's tokens). The mechanism: before an edit, the agent asks the map — who calls
this, what breaks, does this already exist — and gets exact, small answers; the regression gate
enforces the same sight after the edit. Agent-first: the human-facing report visualizes the
findings and never leads. External review of a third-party repo stays as a feature note, not a second
mode — the capability remains, the "two modes" billing goes (ruled 2026-07-25, C3).

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

## Invariants  *(ratified 2026-07-25)*
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

**Next:** deliberately open (ruled 2026-07-25) — picked after the identity milestone lands.
Candidates on the table: the measurement batch (P1+P3) · edit-quality science (H22) · the next
language (C/C++ is the loudest gap) · publish the free-forever/Teams boundary statement.

**Not-now:** Teams build · VS Code Marketplace · daemon · embeddings · paper packaging ·
new languages until their grammars clear provenance.

## Done looks like  *(one stranger-runnable check per Now outcome)*
1. `CHARTER.md` has no unmarked gaps — every open item is deliberate, and Problem/User/Job
   each carry one ratified sentence. ✔ (this interview)
2. One `grep` finds "Your agents break less code and burn fewer tokens." on all four public
   surfaces (README, product.json, package.json, plugin.json); `npm run check-consistency`
   fails when any of them drifts.
3. `docs/ROADMAP.md` no longer claims the retired program framing or the superseded numbers,
   and no surface still says sponsorship pays for AI benchmarking bills (C7 swept).
4. `npm view @ghostlygawd/codeweb version` prints the release that shipped the realigned copy.
5. `CLAUDE.md` exists and points here first. ✔ (this commit)

## Open questions
None unanswered. New questions are asked **one at a time** (operator's request, 2026-07-25).
Next is deliberately open until the identity milestone lands.
*(Answered 2026-07-25: the job one-liner — "Your agents break less code and burn fewer tokens." ·
the user — the agent-heavy individual dev, the CI gate included in their surface · sponsorship —
supports the project, and sponsors get featured README placement: logo tiers up top, a name
list beneath; no cost claims · external mode — demoted to a feature note · enterprise support —
softened to a one-line email doorway, no price, no SLA claim · the invariant split — ratified
as written · Next — deliberately left open until the identity milestone lands.)*

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
