# Funnel Friction Audit — codeweb

**Date:** 2026-07-23 · **Scope:** read-only pass over every distribution surface (README.md, site/ → GitHub Pages, docs/demo/, scripts/run.mjs, scripts/mcp-server.mjs, .claude-plugin/, hooks/, skills/, commands/, package.json). No signup exists — codeweb is an MIT tool distributed via GitHub, npm (`@ghostlygawd/codeweb`, verified live at 0.9.0), and a Claude Code plugin — so the audited funnel is **discovery → install → first run → first value → habit**. Steps are counted from the user's fingers: commands typed, paths substituted, waits, restarts, file-opens. First-run timing was measured, not estimated: `node scripts/run.mjs` on a 458-symbol target completes in **6.5 s** on this machine (Node v22.22.2).

---

## 1. The funnel, reconstructed

Four real entry paths exist. Counted end-to-end:

**Path A — Claude Code plugin (the "Recommended" path, README.md:160–165, site/content/start.html:10–16):**
1. Type `/plugin marketplace add GhostlyGawd/codeweb` — **at risk of hard failure: no `.claude-plugin/marketplace.json` exists anywhere in the repo** (verified by search; only `plugin.json` ships). Claude Code's marketplace-add contract requires that manifest.
2. Type `/plugin install codeweb` (+ confirm prompt).
3. **Restart Claude Code** (README.md:165) — kills the current session; full context switch.
4. Type `/codeweb` — the skill runs `scripts/run.mjs` (commands/codeweb.md:49–51); pipeline wait ~3–10 s plus the agent turn around it.
5. **First value (terminal):** the skill ends by reporting artifact paths + top consolidation opportunities (commands/codeweb.md:58–61, skills/codebase-anatomy/SKILL.md:140–142).
6. **First value (the map):** manually copy the printed path and open `report.html` in a browser — auto-open is opt-in `--open` (scripts/run.mjs:181).

→ **4 typed commands + 1 restart + 1 manual file-open = 6 finger-steps, 2 waits**, aha at step 5.

**Path B — npx one-shot (README.md:168–170, start.html card 2):**
1. Paste `npx -y @ghostlygawd/codeweb /path/to/your/project --out-dir /path/to/your/project/.codeweb` — the same path substituted **twice** by hand.
2. Wait (cold npx fetch + 6.5 s pipeline; stage-by-stage progress lines are good — run.mjs:78,89).
3. Find the printed path, open `report.html`.

→ **2 actions + 2 substitutions + 1 wait**, aha at step 3. Traps: bare `npx -y @ghostlygawd/codeweb` exits 2 with usage — no default target (run.mjs:52); omitting `--out-dir` silently buries the output under the **npx cache** (`<package-root>/.codeweb/runs/<slug>`, run.mjs:70), where MCP graph discovery (mcp-server.mjs:83–97) and all three hooks (lib `findTarget` walk-up) can never find it. The usage text even disagrees with the code about the default (`.live/<slug>` at run.mjs:30 vs `.codeweb/runs/<slug>` at run.mjs:9,70).

**Path C — MCP-only, any client (README.md:171–173, 449–457):**
1. `claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp`.
2. Open a session. First codeweb tool call without a graph returns the actionable `NO_GRAPH` error naming `codeweb_map` (mcp-server.mjs:98); the agent self-heals by building the map with progress notifications (mcp-server.mjs:299, 441–466).

→ **1 command + agent self-activation** — the best-engineered path in the product. But it carries no hooks, so no habit loop, and no human ever sees the map unless they separately open `report.html`.

**Path D — clone (README.md:176–179):** `git clone` + `node codeweb/scripts/run.mjs <path> --out-dir …` + open = 3 steps. Required for the site's "Five-minute quickstart" steps 2–4, which all invoke `node scripts/query.mjs|diff.mjs|ci-gate.mjs` (site/content/start.html:45–64) — commands an npx user **cannot run** (package.json:22–25 exposes only the `codeweb` and `codeweb-mcp` bins; query/diff/ci-gate have no bin), so following card 2 (npm) into the quickstart dead-ends on "module not found."

**Where the aha is:** three ahas at different distances. (1) Zero-install: the live axios demo — one click from README.md:56 or the site hero — genuinely excellent funnel design; (2) the printed consolidation summary at first `/codeweb` run; (3) the interactive map, always one manual file-open beyond the run. Hidden gate on every path: **Node ≥ 22** (package.json:37) — Node 20 LTS users get no graceful message from run.mjs itself.

---

## 2. Funnel map

| Stage | Steps today | Friction found | Proposed fix | Expected effect | Effort |
|---|---|---|---|---|---|
| **Entry — GitHub README** | 0 (read) + 1 click to demo | Value prop lands in first 20 lines (README.md:12–19), but ~1,238 words of proof precede `## Install` (README.md:156); ~3.4 MB of PNGs on the landing view (assets/screens: 1.1 MB graph, 952 KB blast-radius, 688 KB treemap…); no downloads badge; anchor nav (line 39) partially compensates | Put a copy-paste one-liner "try it now" block inside the first screenful; compress screens to ~200 KB WebP; add npm-downloads badge | More readers reach an install command before scroll fatigue; faster loads on slow links | S |
| **Entry — site (GitHub Pages)** | 1 click (hero CTA) | Pages are light (index 16 KB + 52 KB css/js; demo 284 KB total) and CTAs match next actions ("Map your repo" → start.html, site/content/index.html:8–9). One 1.1 MB PNG mid-page (index.html:158). VS Code Marketplace URL 404s (docs/product-review-2026-07-20.md §1) | Compress the PNG; fix or remove the dead Marketplace surface | No dead-end entry surfaces | S–M |
| **Install** | Path A: 3 steps + restart · Path B: 1 long cmd, 2 substitutions · Path C: 1 cmd · Path D: 3 steps | **(a) Recommended path's first command has no manifest to satisfy it** — `.claude-plugin/marketplace.json` absent repo-wide, yet `/plugin marketplace add GhostlyGawd/codeweb` is the #1 CTA in README.md:162 and start.html card 1. **(b)** npx default out-dir lands in the npx cache, invisible to MCP/hooks (run.mjs:70 vs mcp-server.mjs:83–97). **(c)** No default target — bare npx exits 2 (run.mjs:52). **(d)** usage text/default mismatch (run.mjs:30 vs :9) | Ship `marketplace.json` (one ~15-line file); default `<SRC>` to `.` and `--out-dir` to `<SRC>/.codeweb`; fix the usage string | Removes a possible hard fail at the very top of the recommended path; npx shrinks from a 2-substitution command to one bare word; forgotten `--out-dir` stops orphaning maps | **S** |
| **First run** | 1 command, wait 3–10 s | Good: per-stage progress, loud empty-target failure with `--allow-empty` escape (run.mjs:33,46), final artifact list + "open report.html" hint + value receipt (run.mjs:175–188) | Print the OS-appropriate open command (`open`/`xdg-open`); default `--open` on interactive TTY | Cuts the last manual step to visual value | S |
| **First value — human (the map)** | 1 manual file-open; impossible on remote/headless | `report.html` never auto-opens; in Claude Code on the web / SSH / devcontainers there is **no way to view it at all** — the wow artifact is unreachable exactly where coding agents increasingly run | A tiny `codeweb serve` (or `--serve`) static server + printed URL for remote sessions | The map becomes reachable from every environment the agent runs in | M |
| **First value — agent (MCP)** | 0 extra (self-healing) | Best stage in the product: `NO_GRAPH` names `codeweb_map` (mcp-server.mjs:98), budgeted responses, staleness self-annotation + auto-refresh (mcp-server.mjs:131–160), symbol-miss teaches `codeweb_find` with near-matches (mcp-server.mjs:590–594) | — (protect with tests) | — | — |
| **Habit** | 0 once mapped (ambient) | Strong loop *once a map exists*: session brief (~2 KB) every session (hooks/hooks.json:4–17), pre-edit blast-radius card, post-edit regression check, lifetime value receipt (scripts/lib/stats.mjs:107–115), CI gate whose PR comment is a team-facing advert (.github/workflows/codeweb-gate.yml). **But everything is inert until the first `/codeweb`** — in an unmapped repo all three hooks exit silently (session-brief.mjs:33), and nothing after plugin install ever tells the human to run `/codeweb` | One-line SessionStart nudge in unmapped repos when the plugin is installed ("codeweb installed — `/codeweb` maps this repo in ~3 s"), throttled once per repo; a staleness nudge when `report.html` is N edits older than the graph | Converts installed-but-idle users — today's largest silent stall — into activated ones | M |
| **Referral loop** | n/a | The generated `report.html` and the public demo carry **zero attribution or CTA** — 0 links to the repo/site in scripts/report-template.html and docs/demo/index.html (verified). A shared map recruits nobody; the demo is a conversion dead end (browser-back is the only exit) | Discreet footer in every report + demo: "mapped by codeweb v0.9.0 — map your repo" → site | Every shared report and demo visit gains a next step; free acquisition surface | S |

---

## 3. The biggest leak

**The Install stage.** Everything downstream of install is unusually well-engineered — a self-healing MCP loop, budgeted responses, ambient hooks, a value receipt — but every unit of that quality is gated behind an install step that is either at risk of hard failure or taxed. The recommended path's *first command*, `/plugin marketplace add GhostlyGawd/codeweb` (README.md:162, start.html card 1, final CTA "Install the plugin" at site/content/index.html:173), depends on a `.claude-plugin/marketplace.json` that does not exist anywhere in the repo — as shipped, the repo cannot satisfy the marketplace-add contract, and neither of the two prior product reviews records ever executing that command successfully. If current Claude Code builds tolerate plugin-only repos the command may still work, but the flagship CTA resting on unverified tolerance is itself the defect: the fix is one ~15-line file. The fallback paths each add their own tax at the same position: the npx command demands the project path typed twice because run.mjs defaults its workspace to the *package* root rather than the target (run.mjs:70) — and a user who drops the `--out-dir` tail gets a map orphaned in the npx cache that MCP discovery and all three hooks can never find, which reads as "codeweb doesn't work." Early-funnel losses compound: a user lost at the install command never sees the demo-quality map, never triggers the self-healing MCP loop, and never enters the habit loop, so a fix here multiplies through every stage below it. The runner-up leak — post-install silence (nothing nudges the human to run `/codeweb`, hooks inert until first map) — is the same failure one step later and shares the fix budget.

---

## 4. Step-count budget

Counting finger-events (typed command = 1, path substitution = 1, restart = 1, manual file-open = 1; waits noted separately):

| Path | To first value today | Achievable minimum | How |
|---|---|---|---|
| Human visual value via npx | **4** (1 cmd + 2 path substitutions + 1 file-open) + 1 wait | **1** (+ same wait) | Default `<SRC>` = `.`, default `--out-dir` = `<SRC>/.codeweb`, auto-open on interactive TTY → bare `npx -y @ghostlygawd/codeweb` from the project dir does everything |
| Agent value via plugin | **5–6** (marketplace add + install + restart + `/codeweb` + read; +1 to open map) — *0 if the marketplace add fails* | **3** (install + restart + one confirm) | Ship marketplace.json; unmapped-repo SessionStart nudge offers to run the first map, so activation rides the restart the platform already forces |
| Agent value via MCP-only | **2** (1 cmd + self-heal on first query) | **2** | Already at minimum — this is the pattern the other paths should copy |
| Site quickstart (steps 2–4) | **∞ for npx users** (scripts not exposed as bins; clone required) | 3 | Label the quickstart "from a clone," or ship `codeweb-query`/`codeweb-diff` bins |

---

## 5. Instrumentation gaps

Today the funnel is **measured for the user and invisible to the maintainer** — a deliberate stance ("zero third-party requests on this page," site/templates/footer.html:38; "STRICTLY LOCAL… never transmitted," scripts/lib/stats.mjs:5–9). The local ledger already counts activation/habit milestones per workspace (`briefInjected`, `cardsDelivered`, `queriesServed`, `regressionsFlagged`, `autoRefreshes` — stats.mjs:41–49), but nothing reports acquisition, and GitHub's traffic data expires after 14 days with nothing archiving it. Today you would not see the drop-off at any stage. Without violating the privacy stance (measure proxies and artifacts, not users):

1. **Acquisition ledger (highest value, zero user impact):** a scheduled GitHub Action snapshotting the GitHub traffic API (views, unique visitors, clones, referrers), stars, npm download counts, and release-asset (.vsix) download counts into a committed ledger — bench/-style, trend-lined by `trend.mjs` conventions. This makes entry-stage drop-off visible for the first time.
2. **Public proxy badges:** npm downloads on README — doubles as social proof.
3. **Stage-transition proxies:** npm downloads (install) vs GitHub Pages demo referrers in the traffic snapshot (entry) vs plugin marketplace installs (once the manifest exists — Anthropic surfaces counts) approximate entry→install→activation conversion without any beacon.
4. **Local milestone timestamps:** add `firstMapAt`, `reportOpened` (bump on `--open`), `mcpFirstQueryAt` to stats.json — still local-only, surfaced in the session brief so *users* see their own progression; an opt-in `codeweb stats --share` printing a paste-able summary converts satisfied users into testimonials without telemetry.
5. **Demo dead-end signal:** once the demo carries a CTA (§2 referral row), its click-through appears in the referrer snapshot — the only conversion event the demo will ever need.

Fixes rejected for adding steps to remove steps: any interactive install wizard, any account/signup, any consent-gated telemetry prompt — each inserts a decision earlier in the funnel than the value it measures.

---

## Next

Top 3 fix candidates, ranked by position × severity (all verified against the files cited above):

1. **Ship `.claude-plugin/marketplace.json`** — one small file; removes the possible hard fail (and the unverified-tolerance risk) at the very first command of the recommended install path.
2. **Fix npx defaults in `scripts/run.mjs`** — default `<SRC>` to `.`, default `--out-dir` to `<SRC>/.codeweb` (aligning with MCP/hook discovery), correct the usage string, auto-open (or print the open command) on interactive TTYs — takes the shortest human path from 4 finger-steps to 1.
3. **Add the referral CTA + unmapped-repo nudge** — a one-line footer link in every generated `report.html` and the public demo, plus a throttled SessionStart line in unmapped repos with the plugin installed — closes the demo dead end and the installed-but-never-activated silent stall.
