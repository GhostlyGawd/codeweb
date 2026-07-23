# Monetization Map — codeweb

**Date:** 2026-07-23 · **Scope:** read-only pass over every surface money could touch — package.json, LICENSE, site/ (footer, product, start), README.md, .github/ (workflows, actions, no FUNDING.yml), scripts/ (ci-gate, trend, stats, gate-md, annotate, context-pack, run), hooks/, editor/, docs/ROADMAP.md — plus the two sibling audits (COMPETITIVE.md, FUNNEL.md) for market pricing and funnel evidence. This file is the only write. No prior REVENUE.md existed.

**Framing constraint honored throughout:** codeweb is MIT (`LICENSE`, © 2026 GhostlyGawd), solo-maintained, local-first, no-accounts, no-telemetry ("STRICTLY LOCAL… never transmitted," `scripts/lib/stats.mjs:5-9`; "zero third-party requests on this page," `site/templates/footer.html`). Community trust is the principal asset and COMPETITIVE.md §1 shows the market norm is *free MIT core, paid only at the edges*. Every proposal below therefore monetizes things a fork of the MIT code cannot copy — maintainer time, SLAs, hosting, and cross-repo aggregated state — and never moves an existing local feature behind a gate.

---

## 1. Current model snapshot

**What exists: one tier — everything, free.** The entire product surface ships free under MIT: the Claude Code plugin (3 hooks + `/codeweb` + skill), the npm CLI (`@ghostlygawd/codeweb` 0.9.0, bins `codeweb`/`codeweb-mcp`, `package.json`), the 27-tool MCP server (`scripts/mcp-server.mjs`), the self-contained `report.html`, the VS Code extension (`.vsix` attached to releases; Marketplace publish still token-gated — `.github/workflows/release.yml:135-164`), and — notably — the full CI regression gate as a reusable GitHub Action with sticky PR-comment review (`.github/actions/codeweb-gate/action.yml`, `docs/ci-gate.md`). No trials, no tiers, no paid anything.

**Billing code: none.** Grep across scripts/site/plugin/hooks/editor for `stripe|paddle|lemonsqueezy|license.key|paywall|premium|pricing|subscription` returns only incidental comment matches (a masking-test example in `scripts/lib/masking.mjs:174`, a `actions/checkout` hit). There are no accounts, no license checks, no entitlements, no enforcement of anything — nothing to enforce.

**Donation/sponsorship plumbing: also none.** No `.github/FUNDING.yml` (`.github/` contains only `actions/` and `workflows/`), no Sponsors button, zero sponsor/donate links in README.md or the site footer (`site/templates/footer.html` links Product/Proof/Project only). **A user who wants to give this project money today has no mechanism to do it.** Payment friction is not high — it is infinite.

**What is expensive to serve — and none of it is gated:**
- *Runtime serving cost: ~zero by design.* Everything executes on the user's machine; the site and demo are static GitHub Pages; npm hosting is free. There is no marginal cost per user to gate.
- *The real costs are the maintainer's:* (a) support/issue time on a 5-surface product (engine, CLI, MCP, report, extension) across 11 languages; (b) the trusted-wasm grammar provenance work each new language requires (`scripts/grammars/PROVENANCE.md` discipline; Kotlin/Swift already blocked on it); (c) **the research program's cash burn** — ROADMAP Phases 2–4 explicitly require "moderate" to "**heavy multi-agent spend**" (`docs/ROADMAP.md:47,77,99`) — frontier-agent A/B benchmarks are paid API tokens out of one person's pocket. The bench receipts that COMPETITIVE.md Bet 1 calls the positioning moat have a real, recurring, currently unfunded dollar cost. This is the most honest "what does money buy" story the project can tell.
- *One cost pushed onto users:* the CI gate builds two full graphs per PR on the consumer's Actions minutes (`scripts/ci-gate.mjs:42-60` — before/after full `run.mjs` pipelines). Fine at small scale; at monorepo scale, an incremental/cached hosted gate is genuinely cheaper and faster than the DIY action — that delta is a sellable service, not a lock.

**Power users vs casual (inferred from features and data model):** the casual user runs `/codeweb` once and looks at the map. The power surface is unmistakably *team-shaped*: the CI gate on every PR (`docs/ci-gate.md`), architecture fitness rules (`codeweb.rules.json`, `scripts/fitness.mjs`), refactor campaign planning (`scripts/campaign.mjs`, `simulate-edit.mjs`, `codemod.mjs`), structural health over time (`scripts/trend.mjs --git`, "a dashboard you re-open"), and false-positive suppressions (`scripts/annotate.mjs` → `.codeweb/annotations.json`). Every one of these is **single-repo, single-machine, single-person state**: no cross-repo rollup, no shared suppressions, no team-visible history, no hosted map. The line between what ships and what teams need is exactly the line between free-forever and paid.

**What leaks:** nothing leaks cost (there is none). What leaks is *capture*: the gate's PR comment is read by whole teams and carries no link (`scripts/lib/gate-md.mjs` renders delta/blocking/reproduce — no attribution); `report.html` and the public demo carry zero CTA (FUNNEL.md §2, verified); npm sits at ~155 downloads/week (COMPETITIVE.md §2). And the maintainer's bench spend leaks unreimbursed. At this audience size, *revenue capacity is approximately zero today* — which is why every monetization move below is chosen to double as distribution or cost-recovery, and none is allowed to spend trust.

---

## 2. Packaging proposal

Four tiers. The boundary rule that keeps it honest and fork-proof: **anything that runs on your laptop against one repo is free forever; money buys human attention, aggregated multi-repo state, and hosting** — the three things the MIT license cannot leak because they aren't in the repo. No license keys ever enter the codebase (protects zero-dep purity and the determinism story, and removes the fork incentive entirely).

| Tier | Price | The one-line job | Willingness-to-pay signal |
|---|---|---|---|
| **Free (the product)** | $0, MIT, forever | Everything that exists today — map, 27 tools, hooks, report, CI gate action, all future languages — for one human and their agent on their machine. | COMPETITIVE.md §1: free MIT core is the surviving market norm (Serena, CGC, dep-cruiser); deviating killed goodwill for Sourcegraph. Generosity *is* the acquisition strategy while distribution is the bottleneck. |
| **Sponsors (individual $5–25/mo, org $250/mo)** | GitHub Sponsors | Keep the receipts running: sponsorship visibly funds the bench/multi-agent spend and grammar work; perks are gratitude, not hostages. | Devs already sponsor infra they rely on daily (hooks fire every session — `hooks/hooks.json` makes codeweb ambient); the fundable cost is real and citable (`docs/ROADMAP.md` "heavy multi-agent spend"). Perks: name on site/README, priority issue triage, a vote on the next language (C/C++ is the loudest gap — COMPETITIVE.md stake #3), ≤30-day early access to *new-language prereleases* (time-shifted, never withheld, never fixes/security). **Caution flag:** Sourcetrail went donation-supported and still died archived at 16.5k stars — sponsorship is a bridge and a cost-recovery mechanism, not the destination. |
| **codeweb Teams (hosted, future)** | ~€10–12/active author/mo (min ~5 seats) | The org rollup your local maps can't see: a GitHub App gate (zero YAML, no `fetch-depth: 0` footgun, cached base graphs so checks are faster than the DIY action) + cross-repo trend dashboard + gate-outcome history + team-shared suppressions + access-controlled hosted maps. | **CodeScene charges €18–27/active author/mo for exactly this category** ("quality gates for AI coding", codescene.com/pricing, fetched in COMPETITIVE.md) — the direct WTP anchor; undercut it with function-level resolution CodeScene's own gate lacks. Sourcegraph's retreat to enterprise-only shows orgs pay for code intelligence even when individuals won't. Per-author pricing = expansion path that grows with customer success (more authors → more seats; more repos → more rollup value). |
| **Enterprise support (available now)** | $3–6k/yr flat, cap 3–5 customers | A throat to choke: SLA'd email support, private onboarding, architecture-rules setup (`fitness.mjs` + `codeweb.rules.json` consulting), and paid priority on language/feature work. | The standard paid-support norm for zero-dep OSS (Tidelift-pattern); solo-maintainer capacity is the scarce good, so it must be priced and capped, not given away in issues. An org betting agent workflows on codeweb needs continuity assurance MIT alone doesn't give. |

**Free-tier generosity check (lens 3):** is free too generous? Today, no — and deliberately so. The competitive scan shows codeweb gives away what CodeScene charges €18+/author for (the gate), but with 155 downloads/week the constraint is that nobody knows, not that nobody pays. The free gate is the viral surface (its PR comment advertises to every reviewer); charging for it now would amputate the only growth loop before it spins. The tier boundary is drawn where the architecture already draws it: state that leaves the laptop. That makes the paywall *architecturally honest* — Teams isn't a withheld feature, it's a different thing (a service), which is the only "still generous" story that survives an MIT license.

**Model weighed (per charter):** pure sponsorware — insufficient alone (Sourcetrail precedent); pure hosted SaaS — off-norm and premature (CodeSee's standalone visualization SaaS died; the no-accounts stance is load-bearing per COMPETITIVE.md do-not-copy #4); pure paid-support — real but capacity-capped at solo scale. The recommendation is the sequence: **sponsors + support now (zero trust cost, fund the bench), open-core-at-the-service-edge later (Teams GitHub App), only after the distribution fixes in FUNNEL.md/COMPETITIVE.md have grown an audience worth converting.** Trigger to green-light Teams build: sustained growth signal (e.g. >2k downloads/wk or >10 external repos running the gate action — countable via GitHub code search for `codeweb-gate@`).

---

## 3. Upgrade moment placements

Principles first: prompts appear only at **success high points**, only on **human-facing** surfaces, computed only from **local counters** (`stats.json` — no telemetry), throttled, one line, always suppressible (`CODEWEB_NO_STATS=1` already exists as the pattern). Agent-facing MCP payloads and error paths are ask-free zones.

| # | Moment | Placement (file) | Trigger condition | Copy sketch |
|---|---|---|---|---|
| 1 | **Gate comment footer** — the whole team is reading a review codeweb just wrote | `scripts/lib/gate-md.mjs` `gateComment()` (+ shows on every PR via `.github/actions/codeweb-gate/action.yml` `comment: true`) | Unconditional — it is attribution, not solicitation; one muted line | `— structural review by [codeweb](site) · free & local · [support the project](sponsor)` (later: `· org dashboard →`) |
| 2 | **Value receipt high point** — the run summary just told the user codeweb blocked regressions | `scripts/run.mjs:183-188` (receipt print) and the human line of the session brief (`scripts/lib/brief-core.mjs:91-93`) | Lifetime `regressionsFlagged ≥ 3` OR `queriesServed ≥ 200` (from `lifetimeTotals`, `scripts/lib/stats.mjs:94-100`); throttle: once/month via a `lastAsk` stamp in stats.json | `codeweb has flagged 3 regressions here before they landed. It's free — sponsoring funds the benchmarks: <url>` |
| 3 | **Report footer** — the shareable artifact, currently attribution-free (FUNNEL.md §2) | `scripts/report-template.html` + `docs/demo/index.html` | Unconditional static footer | `mapped by codeweb v0.9.0 · free & MIT · map your repo → site · ♥ sponsor` |
| 4 | **Trend user = the team-lead buyer** — someone graphing structural health over N commits is doing the job Teams sells | `scripts/trend.mjs` after render | Snapshots ≥ 5 rendered; print once per invocation | Now: sponsor line. Post-Teams: `tracking this across every repo, continuously, is what codeweb Teams does → url` |
| 5 | **README + site** | README badges block; `site/templates/footer.html` Project column; a `/support` page | Static | Sponsor badge; footer link `Sponsor`; support page states exactly what money funds (see §4) |
| 6 | **Support-contract doorway** | README "Enterprise" one-liner + site footer | Static | `Running codeweb across an org? Support contracts: <email>` |

**Anti-placements (churn-risk flags, lens: goodwill):** never in MCP tool responses (budgeted, agent-consumed — an ask would burn the tokens the product exists to save and poison agent UX); never in hook cards (pre-edit/post-edit are trust surfaces mid-work); never on failure paths (`NO_GRAPH`, empty-map, symbol-miss — upselling on error reads as ransom); never a nag that repeats within a month; never gating `--full` outputs, languages, or fixes. The moment any existing local capability moves behind a prompt or a payment, the MIT fork story writes itself and the trust asset is spent.

---

## 4. Friction fixes (ranked)

Today the willing payer's path is: *find no button, give up.* Ranked by revenue-per-effort:

1. **Create the payment rail at all: `.github/FUNDING.yml` + GitHub Sponsors profile** (S — an afternoon). Adds the Sponsor button on the repo — the single highest-leverage file in this report. Sponsors handles checkout, VAT, receipts; zero code, zero trust cost.
2. **Write the sponsor tiers as jobs, not amounts** (S). $5 "keep CI + the bench corpus running" · $25 "vote on the next language + prerelease access" · $250 org "logo on site + priority triage." Concrete jobs convert; naked numbers don't.
3. **Publish a funding-receipts note** (S). One page/section: "what sponsorship pays for" with the actual line items (multi-agent bench spend per ROADMAP phase, grammar provenance work) and a tiny running ledger. This repo's whole brand is receipts (`bench/budgets.json`, pre-registered hypotheses); funding transparency in the same voice is a trust *signal*, and it is the pricing page of the sponsorship era.
4. **Ship placements #1–#3 from §3** (S–M). The gate footer and report footer are simultaneously the referral fix FUNNEL.md already ranked top-3 — one change, two audits satisfied.
5. **Enterprise doorway: a mailto + a paragraph** (S). No sales machinery; a stated price range filters tire-kickers and anchors the support tier.
6. **When Teams ships (structural, later): a real pricing page + merchant of record.** Three columns (Free / Teams / Enterprise) on the existing static site; checkout via a merchant-of-record (Polar/Paddle-class) so a solo maintainer never touches VAT; per-active-author metering like CodeScene's; **failed payment = grace period then reversion to free-tier behavior — the local tooling never breaks**, hosted dashboards go read-only. Trust signals on the page: MIT badge, "everything local stays free forever" as the first line, the funding ledger linked.

---

## 5. Quick wins vs structural changes

**Quick wins (days, zero trust risk, do in any order):**
- FUNDING.yml + Sponsors profile + tier copy (§4.1–2) — makes payment possible.
- Funding-receipts page (§4.3) — makes payment *meaningful*.
- Gate-comment, report, demo, site-footer attribution + sponsor links (§3.1/3/5) — capture on surfaces teams already see; doubles as FUNNEL.md's referral fix.
- Receipt-high-point sponsor line with local-counter trigger + monthly throttle (§3.2).
- Enterprise-support mailto + price anchor (§4.5) — costs a paragraph, prices the maintainer's time for the first time.
- Sponsor perk: language-vote + ≤30-day new-language early access (time-shifted, never withheld) — sponsorware with a clean conscience.

**Structural changes (weeks–months, sequenced *after* the distribution fixes land and an audience exists):**
- **codeweb Teams / GitHub App gate** (L): hosted incremental gate (cached base graphs — faster and cheaper than the 2×-full-pipeline DIY action), org-wide install in two clicks, gate-outcome history, cross-repo `trend` dashboard, shared `annotations.json` sync, access-controlled hosted maps. This is the CodeScene €18–27/author lane entered from below, per-author priced, and the only tier that scales past solo capacity.
- **Paid onboarding/services productized** (M): fixed-price "map your org" engagements using `fitness.mjs` rules + campaign planning; feeds Teams demand.
- **C/C++ as a sponsored milestone** (L): fund the loudest capability gap through the sponsorship goal mechanism — monetization and roadmap in one motion.
- **Billing/entitlement plumbing for Teams only** (M): accounts and metering live in the service, never in the MIT repo — the codebase stays zero-dep, deterministic, and lock-free.

**What must stay free forever (the "still generous" contract, stated once, kept always):** the engine, all 27 MCP tools, the hooks, the report, the CLI, the self-hosted CI gate action, every language, every fix. Written into README the day the first paid thing appears.

---

## Next

Top candidates for the operator to choose from (conductor: ask which to make):

1. **Turn payment on: FUNDING.yml + Sponsors tiers + funding-receipts page** (§4.1–3) — infinite→zero friction in a day; funds the bench spend; costs no trust.
2. **Attribution/sponsor footers on gate comment + report + demo + site** (§3.1/3/5) — the same edit FUNNEL.md ranked top-3 for referrals, now also the capture surface for every team that sees a gated PR.
3. **Receipt-high-point sponsor line** (§3.2) — the one honest in-product ask, triggered by local counters at the moment codeweb just proved value.
4. **Enterprise-support doorway with a price** (§4.5) — first real revenue possible this quarter at solo scale.
5. **(Decision, not build) Adopt the Teams boundary now** — publish the "everything local is free forever" contract and the Teams intent (GitHub App gate + org dashboard at ~€10–12/author), build only when the distribution trigger (§2) fires.
