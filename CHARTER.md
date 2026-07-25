# codeweb — Charter (DRAFT — questions, not yet the contract)

**Date:** 2026-07-25 · **Status: DRAFT.** This run was unattended, and a charter written from
guesses would be the drift it exists to prevent. Below are the seven decisions only the operator
can make, each with evidence-backed candidates. Nothing is ratified. Answer Q1–Q9; the next pass
rewrites this file as the one-page contract from those answers, and unanswered questions stay
open here — never silently filled in.

**Evidence read:** README / site / npm copy · `docs/ROADMAP.md` (North-Star Science Roadmap,
status dated 2026-06-27) · CHANGELOG v0.1.0 (2026-06-22) → v0.10.0 (2026-07-23) + [Unreleased] ·
`reports/` growth + clarity audits (2026-07-22→25) · `docs/decisions/` · `docs/proposals/` ·
`OPERATOR-ACTIONS.md` · the commit arc (engine → science program → v0.3–0.9 product burst →
growth playbook → clarity program → brand redesign).

## 1 · Problem — Q1: which pain is the one this exists to remove?
- **(a) Coding agents break code they can't see** — they miss callers and edit blind. Backed by
  the measured 44%→74% caller-recall receipts, the pre-edit hooks, and the npm headline.
- **(b) Humans can't see a codebase's structure** — duplication, dead code, and tangles stay
  invisible until they bite. Backed by the findings engine, treemap/matrix, the "living map"
  tagline, and reports/COMPETITIVE.md Bet 2 (the Sourcetrail vacuum).
- **(c) (a) leads; (b) is the visible byproduct** — what today's README does implicitly.

## 2 · User — Q2: who is the ONE primary user? (a charter with three users has none)
- **(a) The agent-heavy individual developer** (Claude Code / Cursor) on their own repo — the
  plugin, hooks, npx trial, and MCP-registry push all serve them first.
- **(b) The team lead gating agent-written PRs** — the CI gate Action, fitness rules, and trend;
  the buyer reports/REVENUE.md names — yet every shipped feature is single-machine today.
- **(c) The adopter vetting third-party code** (external mode) — shipped, promoted in the
  README, never measured or audited.

## 3 · The job — Q3: the single job, stated once
Two public one-liners disagree today (Contradiction C2):
- **(a) Pre-edit sight for agents** — answer "who calls this, what breaks" before the edit
  (impact / callers / context-pack / hooks): the npm description's job.
- **(b) The structural regression gate** — catch agent-made structural damage on every edit and
  PR (diff verdict, CI Action). reports/COMPETITIVE.md Bet 3 recommends this as the headline.
- **(c) The living map + findings for humans** — the site tagline's job.

**Q3b:** external adoption-review mode — a core second mode (as the README claims) or a feature
note? Evidence shows it's a skill step + verdict appendix that no benchmark or audit touches.

## 4 · Non-goals — Q4: ratify, edit, or strike each (all trace to recorded decisions)
1. No resident daemon (`docs/decisions/fastpath-daemon.md` NO-GO 2026-07-20; revisit triggers recorded).
2. No embeddings / vector search — `find` stays deterministic-lexical (COMPETITIVE do-not-copy).
3. No LLM in the runtime analysis path — agent edges, labeled sidecars, and reviewed build-time
   artifacts only (the AI-IDEAS fence).
4. No accounts, telemetry, or license keys in the local product, ever (REVENUE boundary).
5. No hosted "Teams" build until the distribution trigger fires (>2k downloads/wk or >10
   external repos on the gate Action); publishing the *boundary statement* earlier is allowed.
6. No VS Code Marketplace publish (parked by standing instruction; the .vsix still ships per release).
7. No paid multi-agent bench runs until funded (`docs/proposals/ai-spend-gated.md` P1–P3 parked).
8. No new first-class language without pinned-ABI grammar provenance (Kotlin/Swift dispatch
   blocked on it today; C/C++ not started).
9. The paper program stays archived in `bench/` — **Q4b:** is "publish the study" retired, or
   deferred?

## 5 · Invariants — Q5: mark each **invariant** (survives any change) or **current fact**
1. Runs entirely local — no account, no server, no telemetry ("STRICTLY LOCAL" stats).
2. Reads code; never executes it.
3. Zero required runtime dependencies (CI-verified; one optional wasm grammar).
4. Deterministic — same code, same map, byte-for-byte; no LLM in the analysis loop.
5. Everything that runs locally is free forever (MIT).
6. Every published number is measured and CI-gated (`check-consistency`, `bench/budgets.json`);
   nulls ship in the changelog.
7. Agent answers stay budgeted (small payloads) and staleness-aware.
8. Self-contained artifacts — one-file report, a site with zero third-party requests.
9. The terminal-editorial brand, now CI-enforced — invariant, or just the current design?

## 6 · Now / Next / Not-now — Q6 + Q7
**Q6 — the current milestone (confirm, trim, or replace; ≤5 outcomes).** In flight per evidence:
1. Cut the release carrying the redesign + clarity fixes (the large [Unreleased] block).
2. Finish the operator-only distribution moves still open in `OPERATOR-ACTIONS.md`:
   MCP-registry publish, repo About/topics, Search Console verify + sitemap.
3. Let the acquisition ledger record the funnel baseline (workflow exists; growth claims get
   receipts like everything else).

**Q7 — Next (pick one), rest stays parked:**
- Science Phase 3 — the edit-quality null (H22), the roadmap's open north-star gap; heavy spend.
- The funded bench batch P1+P3 (tool-routing + fallback grading) when sponsorship covers it.
- The next language (C/C++ is the loudest gap per COMPETITIVE.md).
- Publish the free-forever / Teams boundary statement (build stays parked).

**Not-now (follows from §4):** Teams build · VS Code Marketplace · daemon · embeddings · paper.

## 7 · Done looks like — Q8: one stranger-runnable check per chosen Now outcome
- Release shipped → `npm view @ghostlygawd/codeweb version` prints the new version; CHANGELOG
  has its dated section; the live site's changelog page matches.
- Registry listed → `curl 'https://registry.modelcontextprotocol.io/v0/servers?search=codeweb'`
  returns this server.
- Repo settings applied → the GitHub About block shows the topics from `.github/repo-settings.json`.
- Search Console done → property verified and `sitemap.xml` submitted (operator confirms; no
  public check exists).
- Baseline recorded → the acquisition-ledger workflow has committed its first snapshots.
- (If a science outcome wins Q7: its spec is pre-registered under `docs/specs/` before the run,
  results land in `bench/`, and the Research note ships — pass or null.)

## Open questions
Q1–Q8 above, all unresolved. Plus **Q9 — durability wiring:** approve creating the agent entry
file (`CLAUDE.md` — this repo has none today) whose product rule is *"read `CHARTER.md` before
changing product behavior"*, and a recurring Drift Audit (per release, or a cadence you name)
re-checking every public surface against this charter.

## Contradictions found (ruling pending on each)
| # | Claim | Where stated | What the code/history shows | Ruling |
|---|---|---|---|---|
| C1 | "The bar that does not move": verifiable agent lift incl. edit quality | `docs/ROADMAP.md` | The edit-quality leg is still an open NULL; the last ~3 weeks were entirely growth/clarity/brand work; the README's public roadmap says only "more languages" | pending — Q7 |
| C2 | "The living map of your codebase." | `site/data/product.json` | npm leads with "See what an edit breaks before you write it" — two surfaces, two lead jobs | pending — Q3 |
| C3 | "Two modes" — external review as a peer of internal | README | External mode is a skill step + verdict appendix; no benchmark, audit, or growth work touches it | pending — Q3b |
| C4 | Enterprise support "available now", $3–6k/yr | README + REVENUE.md | A mailto doorway; no SLA or contract machinery anywhere in the repo | pending — real offer or placeholder? |
| C5 | Phase 4 "blast-radius pre-flight does not exist yet" | `docs/ROADMAP.md` | Its product half shipped (pre-edit hook + sidecar + impact cards); its science half (H23/H24) never ran | pending — refresh or retire the file |
| C6 | Status table (2026-06-27): efficiency proven as "−44% tokens" | `docs/ROADMAP.md` | The v0.9.0 budgeted re-run reframed the win as +0.31 recall *at equal cost* — "the token-savings guess was wrong" | pending — same fix as C5 |
