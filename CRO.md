# Conversion Rate Optimization — codeweb

**Date:** 2026-07-23 · **Scope:** the persuasion layer of every public surface — GitHub README.md (primary landing), the live site (https://ghostlygawd.github.io/codeweb/ — index, start, product, research, /demo/, all fetched live today), the npm package page (registry doc fetched; npmjs.com HTML returns 403 to automation), and the generated `report.html` / gate PR comment as shared artifacts. "Conversion" = a visitor installs and runs the tool; the pricing analog is the install-path choice, the checkout analog is the install command working first try. Judged as a first-time visitor with zero knowledge of codeweb, MCP, or Claude Code. **Lane:** does the copy convince, in what order, with what proof at which decision, and where does a skimmer bounce. Step-counts and install mechanics are FUNNEL.md's territory; metadata/discoverability is SEO.md's; rival positioning is COMPETITIVE.md's — findings below overlap those only where the persuasion lens adds something new, and say so. Read-only pass; this file is the only write.

---

## 1. Funnel map

| # | Surface | Who lands · their question | The one action it must drive | Biggest persuasion leak |
|---|---|---|---|---|
| 1 | **GitHub README.md** | Cold (search, HN, a link) · *"What is this, and is it worth my next 60 seconds?"* | Click the live demo, or copy an install command | The two silent objections — *"what does it cost?"* and *"is my code safe?"* — are answered nowhere: "MIT", "license", and "free" appear **zero** times in the README (grep-verified), and the strongest true safety facts (100% local, zero network, no telemetry) are never stated plainly. Meanwhile the README contradicts itself on its own headline number ("**20 total**" MCP tools at line 572 vs **27** at lines 18/435) under a pitch that literally brags surfaces "can't quietly disagree" (README.md:593–595) |
| 2 | **Site homepage** (`site/content/index.html`) | Cold · *"Same question + is this real?"* | Click **"Map your repo"** (→ start.html) | The interactive hero is the best cold-visitor asset on the property, but the closing section sells the *agent*, not the human ("Make AI coding agents more efficient, effective, and capable", index.html:169), and the paired final CTA "Star on GitHub" (index.html:174) sends a convinced visitor to a page showing **0 stars** — negative proof at the moment of decision |
| 3 | **/demo/** (most-shared URL) | Cold via shares + warm from README/site · *"Would this be useful on MY repo?"* | Convert conviction → "get this for my repo" | **The moment of peak conviction has no ask.** The injected nav is two 12px muted-grey links ("Home", "Research" — docs/demo/index.html, live line 117) that don't even include Get Started; there is no "Map your repo" CTA anywhere on the page |
| 4 | **start.html** (every CTA lands here) | Warm, declared intent · *"Which path is mine, and what do I get?"* | Run one install command successfully | The chooser is labeled by *mechanism* ("As a Claude Code plugin" / "Run it from npm" / "Register the MCP server") not by *who you are*; the page shows zero picture of the payoff and never states the Node version, so the checkout moment is a leap of faith with an unstated requirement that can fail it |
| 5 | **npm package page** | Warm · *"Is this maintained and safe to run?"* | Copy the npx command | The registry description says "**24 MCP tools**" directly above a README that says **27** — a visible self-contradiction at the install decision (SEO.md F4 owns the republish; the trust cost at this surface is new) |
| 6 | **report.html + gate PR comment** (shared artifacts) | Warmest possible — a teammate looking at *their own codebase* mapped · *"What made this?"* | Click through to codeweb | Zero path: the report's wordmark is unlinked plain text (`<b>codeweb</b>`, scripts/report-template.html:148; the only 3 hrefs are vscode:// and `#`), and the PR comment's attribution line "codeweb structural review…" carries no link (scripts/lib/gate-md.mjs:48). The best lead the product will ever generate is handed a dead end |

The overall persuasion *order* on the README is actually right — pain → mechanism → proof table → zero-commitment demo → install — which is rarer than it sounds. The leaks are (a) missing risk-reversal copy at every decision point, (b) a conviction peak (demo/report) with no ask, and (c) self-contradicting numbers under trust-led positioning.

---

## 2. Findings

### C1 · Trust & risk reversal — the offer and the safety story are never stated
- **Lens:** 4 (trust) + 7 (offer) + 6 (objections)
- **Location:** README.md (grep: 0 hits for "MIT", "license", "free" as an offer); site/content/start.html:6 ("codeweb has zero runtime dependencies. You need Node.js…"); the safety facts exist but are scattered and oblique — README.md:154 "codeweb never executes target code" (buried in "Two modes"), index.html:11 hero-note "never executes the code it maps", footer "zero third-party requests on this page" (site/templates/footer.html:37), "STRICTLY LOCAL" only in a code comment (scripts/lib/stats.mjs:5–9)
- **First-time visitor experiences:** a stranger deciding whether to point an unknown tool at their employer's proprietary source code. Their top two objections — *what does it cost / what's the catch?* and *does any of my code leave my machine?* — are never answered where the decision happens. The true answers are the best possible ones (free, MIT, 100% local, zero network, zero telemetry, never executes the target, read-only) and the product never says them as a sentence.
- **Fix:** one reusable trust line, placed (a) under the README tagline, (b) above the install blocks in README `## Install`, (c) on start.html above the three cards, (d) in the report/demo footer (see C3): **"Free & MIT-licensed. Runs entirely on your machine — no account, no server, no telemetry. Reads your code; never executes it."** Add an MIT badge to the README badge row (currently 6 badges, none about license or price — README.md:5–10).
- **Expected lift:** **H** (removes the two highest-frequency silent bounces at every decision point) · **Effort: S**

### C2 · Trust — the copy contradicts itself on the numbers the pitch is built on
- **Lens:** 4 (trust)
- **Location:** README.md:572 "**5 new MCP tools (20 total)**" vs "27 deterministic MCP tools" (README.md:18) and "**27** of codeweb's queries" (README.md:435); site/content/product.html:29 heading "**Five languages, parse-free**" directly above a live-rendered list of **11** languages (JavaScript…Swift — verified on the deployed page today); site/content/index.html:73 pipeline card "per language (**JS/TS/Python/Rust/Go**)" one screen below a lead sentence naming **11** languages (index.html:58); npm registry description "**24 MCP tools**" above a README saying 27 (live registry doc, fetched today; SEO.md F4 owns the republish path)
- **First-time visitor experiences:** the pitch's spine is determinism and receipts — "`check-consistency` runs in CI… the reason this README and the plugin manifest can't quietly disagree about how many tools ship" (README.md:593–595). A skeptical dev (this audience) cross-reads numbers as a reflex, hits 20-vs-27 or five-vs-eleven inside a single page, and the flagship claim collapses: *if the consistency gate misses its own homepage, why trust the graph?* This is disproportionately expensive for trust-led copy — worse than either number being merely wrong.
- **Fix:** one sweep (README.md:572 → "27 total"; product.html:29 → "Eleven languages, parse-free" or "{{langCount}} languages"; index.html:73 → derive from `{{languages_inline}}` or drop the parenthetical), then extend `scripts/check-consistency.mjs` to grep prose surfaces for `\d+ (MCP )?tools` and language counts so the class can't recur — docs/product-review-2026-07-20.md #3 proposed exactly this sweep; these three instances are still live.
- **Expected lift:** **M** (trust repair; compounds with every proof claim) · **Effort: S**

### C3 · The one action — peak conviction has no CTA (demo, report, PR comment)
- **Lens:** 3 (one action) + 4 (trust)
- **Location:** live /demo/ top bar — injected nav is `<b><a href="../index.html">codeweb</a></b>` + "Home" + "Research" at `font-size:12px; color:#9C99A6` (docs/demo/index.html, live line 117) — note it links Home and Research but **not** start.html; generated report: `<b>codeweb</b>` unlinked plain text (scripts/report-template.html:148), total hrefs in the template: one `vscode://` and two `#` anchors; gate PR comment footer: `<sub>codeweb structural review (same verdict as the gate). Reproduce locally: …</sub>` — no link (scripts/lib/gate-md.mjs:48)
- **First-time visitor experiences:** three variants of the same dead end. (a) A cold sharee clicks a demo link from chat, plays with the axios map, is convinced — and the page offers no way to act beyond two grey footnote links. (b) A teammate opens a shared `report.html` of *their own repo* — the warmest lead this product can generate, already looking at proof on their own code — and the artifact never says how to get it. (c) A whole team reads the gate's PR comment; the name "codeweb" appears with no destination. FUNNEL.md §2 counted these as missing referral loops; the persuasion point is sharper: these are the only surfaces where the visitor is *already convinced* — conversion here is harvesting, not persuading, and it currently yields zero.
- **Fix:** (a) demo top bar gets one real CTA button in the accent style: **"Map your repo →"** → `../start.html`; (b) report.html gets a one-line discreet footer: *"Mapped by codeweb v{{version}} — free, MIT, runs locally · get it for your repo →"* (github.com/GhostlyGawd/codeweb); (c) gate-md.mjs links the word "codeweb" in its existing sub line. Nothing larger — see caution flags §4.
- **Expected lift:** **H** (converts existing conviction; compounds with every future share) · **Effort: S**

### C4 · Pricing/offer legibility — the install chooser is labeled by mechanism, not by the visitor's situation
- **Lens:** 7 (offer/plan clarity) + 5 (friction)
- **Location:** README.md:160 "**As a Claude Code plugin:**", :167 "**Or from npm — any repo, any MCP client, no clone:**", :175 "**Or run the engine from a clone:**"; start.html:10–16 card 1 (eyebrow "Recommended") "Registers the `/codeweb` command, the agents, and the skill.", :17–23 card 2 "Run it from npm", :24–30 card 3 "Register the MCP server"
- **First-time visitor experiences:** this is the product's pricing page — the one decision between interest and checkout — and it asks the visitor to already know what a Claude Code plugin, an MCP server, and "the skill" are before they can pick. The "Recommended" tag recommends a path that requires a product the visitor may not have; nothing routes the Cursor user, and nothing says the third card is *for* people who aren't using Claude Code. Card 1's body copy ("the agents, and the skill") is meaningless to a newcomer. Meanwhile the npx command is shown in its heaviest possible form — the same absolute path typed twice (`npx -y @ghostlygawd/codeweb /path/to/your/project --out-dir /path/to/your/project/.codeweb`, README.md:169, start.html:20–21) — which *reads* as expensive even before anyone counts steps (FUNNEL.md owns the default-fixing; this is about the displayed form).
- **Fix:** relabel by situation: **"Using Claude Code?"** → plugin card ("adds `/codeweb`, ambient pre-edit impact cards, and all 27 tools"); **"Using Cursor, Windsurf, or another MCP agent?"** → MCP card; **"Just want the map — no AI involved?"** → npx card. Add one routing line: *"Not sure? Run the npx one-liner — it's the whole map, no install."* Display the npx command in its from-your-project-dir form, which works today with zero code change (`run.mjs` resolves both `<SRC>` and `--out-dir` against the caller's cwd — scripts/run.mjs:66,71): `cd your-project && npx -y @ghostlygawd/codeweb . --out-dir .codeweb`.
- **Expected lift:** **M–H** (the decision point every convinced visitor passes through) · **Effort: S**

### C5 · Checkout — the one hard requirement is never stated, so first-try installs can fail unexplained
- **Lens:** 5 (friction) + 6 (objections)
- **Location:** README.md:181 "Requires Node.js — …" (no version); start.html:6 "You need Node.js" (no version); package.json engines `>=22` locally while the published 0.9.0 tarball declares `>=20` (live registry doc) — FUNNEL.md §1 flagged the hidden Node ≥22 gate and the missing graceful message
- **First-time visitor experiences:** the checkout analog is "the install command works first try." A Node 20 LTS user — a large share of the audience — copies the command in good faith and gets a runtime failure with no explanation, on a product whose pitch is determinism and reliability. The copy set the expectation ("just Node.js", README.md:158) that reality then breaks.
- **Fix:** say **"Node ≥ 22"** in all three places the requirement is implied (README.md:158/181, start.html:6), and reconcile the published `engines` value at the next release. (The runtime version-check message itself is FUNNEL/product territory.)
- **Expected lift:** **M** (prevents silent checkout failures + the trust hit of an unexplained crash) · **Effort: S**

### C6 · Value, not features — after Install, the README becomes a 340-line man page
- **Lens:** 2 (value) + 8 (scannability)
- **Location:** README.md:191–430 — twelve consecutive tool sections ("Query the graph", "Guard agent edits (`diff`)", "Gate every PR", "Advise consolidations (`optimize.mjs`)", "Track duplication over time (`trend.mjs`)", "Find the hotspots", "Plan a whole optimization campaign", "Onboard in dependency order", "Measured coverage", "Agent tools", "Agent capability suite" table, MCP section)
- **First-time visitor experiences:** the value story lands hard by line ~148 (tagline → vite table → demo → proof), then the page switches audience mid-scroll from *evaluator* to *operator*: headers keyed to script filenames, flag lists, exit codes. A skimmer who wasn't yet sold stops reading here; the still-deciding visitor never reaches Versioning's excellent trust content at line 577. The information is good — it's sequenced for a user the page hasn't converted yet.
- **Fix:** compress README.md:191–430 into three job-framed subsections — **"Know before you edit"** (impact/callers/context/find-similar), **"Gate every edit"** (diff/ci-gate/review/fitness), **"Clean up, ranked"** (optimize/deadcode/hotspots/campaign/trend) — each 5–8 lines with one example, linking to `docs/` for full flags. Keep the MCP section (it's the differentiator).
- **Expected lift:** **M** · **Effort: M** — ship with care: the README doubles as the npm page's only documentation, so the cut content must land in linked docs, not vanish (see §4)

### C7 · Clarity above the fold — "MCP" and "Claude Code" are load-bearing and unexplained
- **Lens:** 1 (clarity)
- **Location:** README.md:18 "27 deterministic MCP tools for your agent" — first expansion of MCP is 416 lines later ("Model Context Protocol", README.md:434); "Claude Code" is never explained on any surface; index.html:6 "…and 27 tools for the agents editing alongside you" (clearer — no acronym); the strongest positioning line lives *inside an image* (assets/brand/hero.svg text: "Know what exists, and what an edit breaks — before you write." + "DETERMINISTIC · READ-ONLY · ZERO-DEPENDENCY") where it can't be read by crawlers, screen readers, or skimmed as text on slow loads (alt is just "codeweb — the living map of your codebase")
- **First-time visitor experiences:** under the brief's zero-prior-knowledge rule, the hero paragraph asks the reader to already know two proper nouns. The pitch survives without them ("27 tools your AI coding assistant can call"), but a search-arriving dev who has never used an agent bounces on vocabulary alone. The site's hero handles this better than the README does.
- **Fix:** first-use parenthetical in the README hero — "as **27 deterministic MCP tools** (MCP = the open protocol coding agents like Claude Code, Cursor, and Windsurf use to call tools)" — and repeat the DETERMINISTIC · READ-ONLY · ZERO-DEPENDENCY line as real text near the badges.
- **Expected lift:** L–M · **Effort: S**

### C8 · Scannability/one action — start.html asks for work and never shows the reward
- **Lens:** 8 (scannability) + 2 (value)
- **Location:** site/content/start.html — the whole page is command blocks; zero screenshots, zero mention of the "~3 s" build time (which lives only in README.md:17), no preview of what the terminal will print or what `report.html` looks like; contrast: the homepage spends four screenshot cards on the payoff (product.html:57–61) but the conversion page spends none
- **First-time visitor experiences:** a warm visitor lands on the page whose entire job is "make them run one command" and finds… commands. The motivational fuel (the map they saw on the homepage or demo) is a page behind; nothing here says what they get, how long it takes, or how they'll know it worked ("open `.codeweb/report.html` when it finishes", start.html:22, is the only glimpse).
- **Fix:** add one payoff element above the fold — the axios graph screenshot with caption *"~3 s for 3,000 symbols → this, for your repo"* — and a 3-line expected-output snippet (`[run] done → …/report.html · open it in your browser`, matching scripts/run.mjs:180–183) so success is recognizable.
- **Expected lift:** **M** · **Effort: S**

### C9 · Value framing — the site's closing argument sells the agent, and the star-ask backfires at 0 stars
- **Lens:** 2 (value) + 4 (trust)
- **Location:** site/content/index.html:169–170 — closing h2 "**Make AI coding agents more efficient, effective, and capable**" + lead "…Validated the right way — free of reward hacking."; index.html:173–174 — final CTA row pairs "Install the plugin" with "**Star on GitHub**"; repo shows **0 stars, 0 forks** (live API, today)
- **First-time visitor experiences:** the last thing the homepage says before the ask frames the beneficiary as the *agent* — the human paying attention is left to infer their own outcome — and seals it with research jargon ("reward hacking") that means nothing outside ML circles. Then, of the two buttons offered, one is a favor-ask that (today) leads to a page displaying zero social proof right after the visitor was told every claim is backed by evidence. A star CTA is standard OSS practice *once stars exist*; at 0 it actively manufactures doubt.
- **Fix:** rewrite the closing human-first — e.g. *"Ship bigger changes with fewer surprises — you and your agent finally see the same structure before either of you edits."* — and swap "free of reward hacking" for plain words ("measured against independent referees, nulls published"). Demote the star-ask to the footer until the count is a positive signal.
- **Expected lift:** **M** · **Effort: S**

### C10 · Shareable — every promise says "map"; the demo lands on a table
- **Lens:** 3 (one action) + 8 (scannability)
- **Location:** promises: README.md:55–56 "**click around this exact map yourself**", index.html:9 "See the live demo", index.html:159 "Open the interactive demo →"; landing state: the demo's default-on view is **Findings** — `<button class="tab on" … data-view="findings">` / `<div class="view on" id="view-findings">` (live /demo/, verified today; same default in scripts/report-template.html)
- **First-time visitor experiences:** a cold sharee arrives expecting the force-directed map from every screenshot and unfurl, and gets a findings table titled "codeweb — system map" with axios context reduced to a top-bar label ("axios · internal"). The wow artifact — the thing that made someone share the link — is two tab-clicks away and nothing points at it.
- **Fix (hypothesis — test, don't just ship):** land the demo (not necessarily local reports) on the **Graph** tab, or keep Findings but add a one-time hint chip ("This is [axios](→) mapped · see the Graph →"). Genuine tradeoff: Findings is the fastest *so-what* for skeptics; Graph is the promised visual. Decide with the crude pre/post referrer/traffic snapshot FUNNEL.md §5 proposes, since no A/B infra exists.
- **Expected lift:** M (hypothesis) · **Effort: S**

### C11 · Findable & shareable — the repo one-liner leads with mechanism, not outcome
- **Lens:** 9 (shareable) — *keyword/topic work is SEO.md F1; this is only the persuasion angle of the same string*
- **Location:** live GitHub description (API, today): "**Dissect a codebase into atomic symbols, wire the call/import graph, tag domains, and surface overlap/consolidation opportunities as an interactive HTML map. Claude Code plugin.**"
- **First-time visitor experiences:** this string is the pitch in every repo search result, every pasted repo link's unfurl, and the top of the GitHub page — and it describes the assembly line, not the product. "Atomic symbols", "wire", "tag domains", "overlap/consolidation opportunities" are insider vocabulary; the reader's outcome ("know what breaks before you edit") never appears.
- **Fix:** outcome-first rewrite that also carries SEO.md F1's nouns — e.g. *"See what an edit breaks before you write it — deterministic call-graph map + 27 MCP tools for coding agents. Claude Code plugin, MCP server, zero deps, runs 100% locally."*
- **Expected lift:** M (bundled with SEO F1's minutes-long settings change) · **Effort: S**

---

## 3. Top 5 lifts (leverage order)

1. **C3 — Put a CTA at peak conviction (demo + report footer + gate-comment link).** *Ship first.* Smallest effort on the board; converts visitors who are already convinced instead of manufacturing new conviction; permanent and compounding — every future share of a report, demo link, or gated PR inherits it. Sequencing logic: plug the end of the funnel before driving more traffic into it — every other fix in this report (and in SEO.md/FUNNEL.md) pours visitors toward surfaces that currently end in a dead end.
2. **C1 — The trust/offer line everywhere the ask is made.** "Free & MIT. Runs entirely on your machine — no account, no server, no telemetry. Never executes your code." One sentence, four placements, answers the two objections that silently kill stranger installs.
3. **C4 + C5 — Situation-labeled install chooser + short-form npx + "Node ≥ 22" stated.** The pricing-page moment: let visitors self-select by who they are, show the cheap-looking command (it already works from the project dir), and stop the unexplained first-try failure.
4. **C2 — Kill the three self-contradictions and gate prose counts.** "20 total" (README.md:572), "Five languages" (product.html:29), "(JS/TS/Python/Rust/Go)" (index.html:73), then extend `check-consistency` so trust-led copy can't drift again.
5. **C8 — Show the payoff on start.html.** One screenshot + "~3 s" + expected output; the conversion page finally carries its own motivation.

(For the operator's global queue: FUNNEL.md's `.claude-plugin/marketplace.json` remains the #1 *functional* fix — a CTA that may hard-fail outranks any copy change. The list above ranks persuasion work only.)

---

## 4. Ship vs test

**Ship now — proven best practice, no experiment needed:**
- C1 trust/offer line + MIT badge (stating true license/privacy facts is pure upside)
- C2 consistency sweep + prose gate (truth reconciliation)
- C3 demo CTA, report footer line, gate-comment link (with the caution below)
- C4 situation labels + short npx display form (verified working today against scripts/run.mjs:66,71)
- C5 "Node ≥ 22" statements
- C7 MCP parenthetical; C8 start-page payoff preview; C11 repo-description rewrite (bundle with SEO F1)
- C9 partial: replace "free of reward hacking" with plain words; demote the star-ask

**Test — hypotheses that need evidence (no A/B infra exists; use FUNNEL.md §5's traffic-snapshot ledger as crude pre/post):**
- **C10 demo landing tab** (Findings vs Graph vs hint-chip) — real tradeoff between fastest-so-what and the promised wow
- **C6 README restructure** — editorial judgment call at M effort; do it in one reviewed PR, verify the npm page still documents the product end-to-end
- **README tagline** — "Your coding agent greps. codeweb knows." is strong insider copy; an outcome-first variant ("Know what an edit breaks — before you write it") may widen the top of funnel. Watch bounce via traffic snapshots before committing
- **C9 closing-headline reframe** — human-first framing is near-certain, but which outcome line converts best is a copy test

**Would cost trust, accessibility, or clarity if changed carelessly:**
- **The report/demo CTA must stay one discreet line.** `report.html` gets pasted into PRs and team chats — marketing chrome on a work artifact reads as adware and would burn the exact trust the footer is meant to harvest. One footer line, no banners, no modals.
- **Any element added to report/demo must be keyboard-reachable** — the template's a11y is already thin (the sole `:focus` rule removes the outline; docs/product-review-2026-07-20.md #9); a mouse-only CTA would make that worse.
- **Never sand off the honest-null voice while punching up copy.** The "honest null" callouts (site/content/research.html:64–73) and "32 of 33" framing are the most credible words on the property and the moat COMPETITIVE.md Bet 1 is built on. CRO rewrites that inflate or round up would spend the only differentiator.
- **Do not add fake urgency, invented counts, or a star-beg interstitial.** At 0 stars and ~155 downloads/week, manufactured social proof is detectable and fatal for this audience; the bench receipts are correctly doing proof's job until PROOF-stage work grows real signals.
- **Keep every claim regenerable.** Any new number introduced by copy fixes should come from the same derived sources (`{{toolCount}}`, `{{langCount}}`, package.json) that build.mjs already injects — hardcoding new prose numbers recreates C2.

---

## Next

Top candidates, in ship order: **(1) C3** — CTA at peak conviction: demo top-bar "Map your repo →", one-line report.html attribution footer, link the gate comment (all S, compounding); **(2) C1** — the free/MIT/local trust line at README top, README Install, start.html, and the new report footer; **(3) C4+C5** — situation-labeled install chooser with the short npx form and "Node ≥ 22" stated; **(4) C2** — the 20-vs-27 / five-vs-eleven contradiction sweep plus a prose-count consistency gate. The conductor should pick which to make.
