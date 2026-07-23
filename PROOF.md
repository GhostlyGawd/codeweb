# Social Proof & Credibility — codeweb

**Date:** 2026-07-23 · **Scope:** every credibility signal a skeptical stranger meets — README.md, the live GitHub Pages site (index / product / research / start / changelog / demo, all fetched today and verified byte-identical to the committed `docs/` build), the GitHub repo's own signals (stars, contributors, releases, Actions — via API today), the npm registry doc (published 0.9.0 tarball + README), the bench receipts (`bench/`), the axios case study, and the generated `report.html` / gate PR comment as evidence artifacts. Numbers cross-checked against the raw result files a skeptic would open. **Lane:** proof and credibility only — CTA mechanics belong to CRO.md, metadata to SEO.md, install friction to FUNNEL.md; where a surface overlaps, only the proof lens is added here. Read-only pass; this file is the only write. No prior PROOF.md existed.

**The shape of the problem:** codeweb's proof strategy is inverted from a normal 0-star project. Classic social proof is near-zero — 0 stars, 0 forks, 0 watchers, 0 open issues, ~155 npm downloads/week, one `.vsix` release asset with 0 downloads, no testimonials, no named users, unlisted in every directory (SEO.md F1–F3) — while the *evidence* layer is unusually strong: compiler-graded benchmarks, pre-registered checks, published nulls, SHA-pinned corpus, CI-gated budgets, a reproducible case study, and a live demo. The audit question is therefore double: does the evidence survive the scrutiny it invites (mostly yes — with three findings where it currently doesn't), and what real proof can a project this size actually collect (§4).

---

## 1. Proof inventory

| Signal | Where it lives | Claim it backs | How credible to a skeptic |
|---|---|---|---|
| **Compiler-graded A/B vs grep** (recall 1.00, precision .943 vs .873, ~727 B vs ~2,142 B/answer, impact 126.3× cheaper) | README.md:21–28 table → `bench/results/oracle-ab.json` | "answers exactly, for about a kilobyte" | **High.** Verified today: every number in the README table matches the receipt; oracle is the TS LanguageService, seed recorded. The rare marketing table that survives opening its source file. |
| **"Run the same referee on your own repo"** (`npm run bench -- <graph>`) | README.md:30–32; `scripts/bench.mjs` | the A/B generalizes beyond vite | **High** — falsifiability offered is the strongest trust move on the property. (Works from a clone only; npm installs don't get the `bench` script.) |
| **Correctness vs independent oracles** ("0 disagreements, >490k comparisons") | README.md:122–123; research.html ledger → `bench/results/correctness-query.json` | determinism/correctness | **High, with friction:** the receipt shows 120,454 comparisons *per check family*; ~490k is the sum across families (H3/H4/callers/tests/context-pack ≈ 602k) — nowhere stated, so the first number a verifier sees looks 4× smaller than the claim. |
| **Detection accuracy** (F1 1.0, Type-2 recall 1.0, MRR 0.99) | README.md:124–126 → `detection-accuracy.json` | "detection is accurate" | **High.** Ledger shows CIs and the honest 0.9875→"0.99" rounding. |
| **Edit-safety** ("0 violations over 20,000 trials") | README.md:123 → `edit-safety.json` | pre-flight predicts the gate | **High, same friction:** README says 20,000 (sum of H5 10k + H6/H7/H8 + A_CUT/A_READ); the site ledger describes the same evidence as "10,000 ops + 120 CLI trials." Two denominators for one claim. |
| **Scale** (sub-quadratic b=0.33; 16k+ symbols) | README.md:126–127; index.html:150 → `performance.json`, `scale-typescript.json` (16,286-symbol TypeScript src, SHA-pinned) | "it scales" | **High.** `scale-typescript.json` even carries an honest `staleNote` about a deferred re-run. |
| **Efficiency pilot** ("+0.27 recall, ~34% fewer tool calls, ~44% fewer tokens") | README.md:34–36, 130–133; index.html:136; research stat strip; "don't-claim" list | "measurably helps a frontier agent" | **Broken under scrutiny — see F1.** The project's own v0.9.0 re-run (published on research.html itself) found recall *better* (+0.31) but the step/token savings **did not replicate** ("equal cost"). Headline surfaces still quote the superseded run. |
| **"32 / 33 pre-registered checks pass"** | README.md:118–120; site stat strip (src: "bench/results"); research meta description | the whole "measured, not claimed" frame | **Medium — see F3.** The pre-registration that defines the 33 checks was retired from `main` (git history, last at v0.8.0 under `paper/` — README.md:139–140). The biggest number on the site has no on-main receipt; its cited source is a directory. |
| **Honest nulls + "what we deliberately don't claim"** | research.html:62–78, 84–92 (H18 null, blind-replay null, bugs-found-first) | epistemic honesty | **Very high.** The most credible copy on the property; verified live today. No rival publishes anything like it (COMPETITIVE.md Bet 1). |
| **CI-gated numbers** (`bench:all --gate`, `check-consistency`) | README.md:135–140, 586–595 → `.github/workflows/ci.yml:107–122`, `bench/budgets.json` | "a change that breaks a published number fails the build" | **Real but overclaimed — see F2.** The gates genuinely run in CI (verified in ci.yml; 308 Actions runs, recent all green). But the gate checks version strings, the tool table, and that cited files *exist* — not prose numbers — and it passes green today while "20 total" sits in the README. |
| **Axios case study** (3 confirmed dups, 12 dismissed, 2 held; cycle-safe merge plans) | docs/case-study-axios.md; linked from README.md:53–56 | precision, "spends its credibility carefully" | **High content, fragile repro — see F4.** The 12-of-17 dismissal framing is exemplary anti-hype. But the repro block clones axios HEAD while the numbers were measured at v1.18.1 (`bench/corpus.manifest.json` pins `a209bfb1`) — the case study never states its version or date. |
| **Live demo** (the actual generated report on axios) | https://ghostlygawd.github.io/codeweb/demo/ (fetched; graph meta: target axios, generatedAt 2026-07-19) | "no mockups" | **High.** It is demonstrably the real artifact. Provenance (version/date/commit) is embedded in the data but never displayed — see F7. |
| **Screenshots-are-real claim** ("regenerate them any time with `node scripts/screenshot.mjs`") | README.md:48–51 | screenshots aren't mockups | **High.** Script exists; checkable claim that passes checking. |
| **Badges** (Claude Code plugin · zero deps · deterministic · MCP · version · changelog) | README.md:5–10 | at-a-glance legitimacy | **Low — see F5.** All six are static `img.shields.io/badge/` shields — self-declared pixels. None of the *externally verified* badges (CI status, npm version, license) is present. |
| **npm provenance attestation** (SLSA v1, signed, `--provenance` publish) | npm registry (verified on 0.9.0); `.github/workflows/release.yml:24` | supply-chain integrity | **High and completely unadvertised** — the one security signal a cautious org can machine-verify, mentioned nowhere. |
| **Repo activity** (repo 32 days old: 9 releases with notes, 58 PRs, 308 CI runs, disciplined CHANGELOG) | GitHub API today | "maintained" | **Medium-high but buried** — a visitor sees 0 stars before any of it; nothing on README/site points at the activity signals. |
| **Author identity** | LICENSE "© 2026 GhostlyGawd"; site footer "© 2026 rhenmcleod"; npm maintainer `rhenmcleod@gmail.com`; contributors: GhostlyGawd + claude (AI co-author trailers) | "who made this" | **Weak — see F6.** Two names for one person split across surfaces, no bio/link anywhere, no stated human anchor. Honest, but unanchored. |
| **Local value receipt** (`npm run stats`, session brief) | README.md:142–147; `scripts/lib/stats.mjs` | value accrues during real work | **High for users, invisible pre-install.** Also the seed of a testimonial mechanism (§4.2). |
| Classic social proof: users, testimonials, logos, stars, reviews, directory listings | — | — | **Absent** (0 across the board — see header). Correctly not faked anywhere. §4 is the earn plan. |

---

## 2. Findings

### F1 · Freshness/honesty — the headline efficiency numbers are superseded by the project's own published re-run, and the two disagree on the same page
- **Lens:** 7 (freshness & honesty) + 1 (proof beside claim)
- **Location:** README.md:34–36 and :130–133 ("+0.27 recall with **~34% fewer tool calls and ~44% fewer tokens**"); site/content/index.html:136 ("+0.27 recall · −34% steps"); research.html stat strip and "don't-claim" item 3 ("cuts discovery steps (~34%)"); site/data/product.json `proof.headline`. Versus: research.html:55–57 re-run callout — "Recall held at **+0.310 ± 0.039** … The token savings the earlier run showed did **not** reappear … runtime tokens and tool-calls are a wash. The honest read is **+0.31 recall at equal cost**." Raw receipts confirm: `bench/experiments/efficiency-pilot.reps5-v090.json` (steps **+0.9 ± 3.7**, i.e. no step savings), `efficiency-pilot.usage-v090.json` (toolCalls +0.95 ± 3.6; totalTokens −84k ± 381k — noise), vs the older `efficiency-pilot.reps8.json` / `usage.json` (steps −6.84 ± 3.3, toolCalls −6.4 ± 3.1, tokens strongly negative — a different run, different base model).
- **The doubt left unanswered:** the product's core promise to agents is *fewer tokens and steps*. Its own most recent, most representative measurement (v0.9.0, the budgeted responses agents actually receive, all 5 reps) found that cost claim doesn't hold on a frugal base agent — and says so, admirably, two screens below a stat strip still advertising "−34%." A skeptic who reads research.html top-to-bottom watches the site disagree with itself; a skeptic who reads only the README never learns of the re-run at all. For a project whose moat is "we publish the nulls," leading with the number the null hit is the one unforced error that can collapse the whole frame. (Note the fix *raises* the headline recall: 0.27 → 0.31.)
- **Fix:** one sweep to the current-evidence claim everywhere the pilot is quoted: **"+0.31 caller-discovery recall at equal cost — all 5 reps positive, on the budgeted responses agents actually get (v0.9.0)"**, with the 8-rep run kept as labeled history ("an earlier run on a different base model also showed large step/token savings; they did not replicate and we say so"). Update README:34–36, README:130–133, index.html:136, product.json headline, and the don't-claim item. The ledger rows themselves are correctly labeled per-file and can stay.
- **Effort:** S

### F2 · Numbers that reassure — three public tool counts (20 / 24 / 27) under a gate the README oversells; the gate passes green today
- **Lens:** 6 (numbers) + 7 (honesty) — *the count sweep is CRO.md C2 and the npm republish is SEO.md F4; the proof-lens addition is the gate-scope overclaim and its verification*
- **Location:** repo README.md:572 "(20 total)" vs :16–19/:435 "27"; live npm registry description "**24 MCP tools**" and npm README body "**24** deterministic MCP tools" *plus* "(20 total)" (both verified in the published readme today) — so the install-decision surface currently shows two wrong counts at once. Meanwhile README.md:592–595 claims `check-consistency` is "the reason this README and the plugin manifest can't quietly disagree about how many tools ship." Ran it today: `node scripts/check-consistency.mjs` → **"OK — v0.9.0, 27 tools, all surfaces aligned"**, exit 0, with the drift live. The script (scripts/check-consistency.mjs:1–11 + scripts/lib/claims-check.mjs) checks version strings, the TOOLS table, CHANGELOG presence, and that cited evidence *files exist* — it never scans prose numbers and cannot reach the already-published npm page.
- **The doubt left unanswered:** the README makes a checkable meta-claim about its own consistency machinery, and the check fails in the reader's hands — worse than the drift itself, because it converts "they made a typo" into "their receipts-culture is a story." This is the contradiction class CRO.md flagged; the proof cost is that it detonates specifically under the "measured, not claimed" banner.
- **Fix:** (a) CRO C2's sweep + prose-count gate extension; (b) reword README:592–595 to what the gate actually gates ("version, tool table, changelog, and that every cited receipt exists — prose is linted for counts"), *after* making that true; (c) republish npm at 0.9.1 so the install surface stops asserting 24/20 (SEO F4 owns the mechanics).
- **Effort:** S

### F3 · Credibility of the source — "32 / 33 pre-registered checks" is the flagship stat, and its defining artifact is not on main
- **Lens:** 5 (credibility of source) + 2 (specific over generic)
- **Location:** README.md:118–120; site stat strip on index + research (source label: "bench/results" — a directory); site/build.mjs:230 bakes "32/33 checks" into the research page's meta description. The pre-registration (H1–H18, the enumeration of the 33 checks and their pass criteria) was "retired from `main` … last at `v0.8.0` under `paper/`" (bench/README.md:31–35, README.md:139–140). README.md:130 still cites "(Theme-5b, **§3.8**)" — a section number of the retired manuscript, a dangling reference for anyone on main. `claims-check.mjs` counts the source valid because the *directory exists*.
- **The doubt left unanswered:** "pre-registered" is the load-bearing anti-reward-hacking word — the claim that the bar was set before the data. A skeptic who clicks through finds 27 result JSONs and no way to count to 33, see the fixed criteria, or confirm the registration predates collection, short of `git checkout v0.8.0 -- paper/`. Proof exists (git history is actually a good timestamped registry!) but the path is archaeology.
- **Fix:** commit a one-page `bench/preregistration.md` — the 33 checks, each with its pre-registered criterion, verdict (32 pass, 1 miss named honestly), and the result file it maps to — plus a link to the frozen original at the v0.8.0 tag for timestamp proof. Point the stat strip's source at it, and fix the §3.8 reference to it.
- **Effort:** S–M

### F4 · Freshness — the case study's repro instructions will produce different numbers than the case study
- **Lens:** 7 (honesty under scrutiny) + 1 (proof beside claim)
- **Location:** docs/case-study-axios.md:59–66 — "Reproduce it: `git clone https://github.com/axios/axios.git` …" (HEAD, unpinned); the document never states which axios version or date its numbers (274 symbols, 17 candidates → 3 confirmed / 12 dismissed / 2 unverified, the 100%/91% body matches) were measured at. The pin exists: `bench/corpus.manifest.json` records axios `a209bfb1` = **v1.18.1**.
- **The doubt left unanswered:** this is the product's only case study and its whole argument is exactness. The one reader who actually runs the repro — the highest-intent skeptic the product will ever have — gets whatever axios shipped that week, sees 281 symbols or 4 dups, and reads the mismatch as fudged numbers. Evidence-led marketing fails hardest when the receipt drifts.
- **Fix:** add to the header "Measured at axios v1.18.1 (`a209bfb1`), 2026-07" and to the repro block `git -C axios checkout a209bfb1`. One honest sentence: "axios moves; at HEAD your counts will differ — the pinned command reproduces these exactly."
- **Effort:** S

### F5 · Numbers that reassure — six badges, all self-declared; the verifiable ones are missing
- **Lens:** 6 (numbers without vanity) + 8 (security signals)
- **Location:** README.md:5–10 — every badge is a static `img.shields.io/badge/...` shield (plugin, zero-deps, deterministic, MCP, version, changelog). Absent: GitHub Actions CI status (the repo has 308 runs, recent all green — verified today), dynamic npm version badge, license/MIT badge (CRO C1 also wants this), and any pointer to the npm **provenance attestation** that 0.9.0 actually carries (SLSA v1, verified on the registry; minted by release.yml:24's `id-token: write` + `--provenance`).
- **The doubt left unanswered:** this audience knows static shields are decoration — six in a row *reads as* proof-shaped filler and slightly cheapens the genuinely verifiable material below. Meanwhile the three signals that are externally attested (CI green on every PR including the bench gate, registry-verified version, registry-verified provenance) go unshown.
- **Fix:** swap in dynamic badges: CI status (`actions/workflows/ci.yml/badge.svg` — this one badge makes "numbers gated in CI" *visibly* true), npm version, license. Keep at most two static shields (MCP server, deterministic). State provenance in one line beside install: "published from CI with npm provenance — verify with `npm audit signatures`." **Deliberately hold the npm-downloads badge** (FUNNEL §5.2 proposed it) until the number stops shrinking under scrutiny — 155/week invites the doubt it's meant to remove; add it when it's four digits.
- **Effort:** S

### F6 · Credibility of the source — the author is two unlinked names and zero footprint
- **Lens:** 5 (credibility of source)
- **Location:** LICENSE "Copyright (c) 2026 **GhostlyGawd**"; site/templates/footer.html "© {{year}} **rhenmcleod**"; npm maintainer `rhenmcleod@gmail.com` / author "rhenmcleod"; GitHub owner **GhostlyGawd** (no bio/blog/name retrievable); contributors strip: GhostlyGawd (152 commits) + **claude** (AI co-author trailers). No "who built this / why" sentence exists on any surface.
- **The doubt left unanswered:** a stranger evaluating "should I point this at my employer's source code" checks the author next after the README. They find a pseudonym in the license, a different name in the footer, an AI as the second contributor, and no human anchor — nothing dishonest, but nothing to hold onto either. For a research-flavored project, an accountable name is itself evidence.
- **Fix:** unify the byline everywhere ("built by rhenmcleod — GhostlyGawd on GitHub", or whichever single name is preferred) across LICENSE-adjacent copy, footer, npm author, and a two-sentence "About/Colophon" on the site: who, why, and the honest AI-assisted build story (the repo's commit trailers already disclose it; owning it in prose converts an oddity into a differentiator: "built with the agents it serves"). Add a contact route (issues welcome + email).
- **Effort:** S

### F7 · Proof beside the claim — the product's best evidence artifacts don't identify themselves
- **Lens:** 1 (proof beside claim) + 7 (freshness) — *the CTA/link on these surfaces is CRO.md C3; this is the provenance layer*
- **Location:** `scripts/report-template.html` — no codeweb version, no generated-at date, no engine line rendered anywhere in the shared artifact (the data exists: demo graph meta carries `generatedAt: 2026-07-19`, target, engine — displayed only as "axios · internal"); gate PR comment ends `<sub>codeweb structural review … Reproduce locally: node scripts/ci-gate.mjs …</sub>` (scripts/lib/gate-md.mjs:48) — a reproduce command with no link to the tool it requires.
- **The doubt left unanswered:** `report.html` pasted in a team chat is the product acting as its own testimonial — on the viewer's own code. Anonymous and undated, it can't serve as evidence ("what made this? when? is it current?"), and RETENTION.md shows staleness already burns trust. The gate comment invites reproduction but strands the reproducer.
- **Fix:** one provenance footer line in report.html and the demo — "generated by codeweb v0.9.0 · 2026-07-19 · engine: deterministic" (+ CRO C3's link does the CTA half); link the word codeweb in gate-md.mjs's existing sub line.
- **Effort:** S

### F8 · Security & transparency — the best-in-class facts exist but not as citable statements; one phrasing is pedant-falsifiable
- **Lens:** 8 (security signals) + 7 (honesty) — *the placement of a trust line is CRO.md C1; this is the verifiability layer*
- **Location:** "zero npm dependencies" (README.md:158) and the "dependencies-zero" badge vs `package.json` `optionalDependencies: { "web-tree-sitter": "0.26.9" }` (also in the published tarball); no SECURITY.md; the "never executes target code" and "strictly local, no telemetry" facts live in scattered prose and a code comment (`scripts/lib/stats.mjs:5–9`); npm provenance unmentioned (F5).
- **The doubt left unanswered:** the pedantic skeptic — this product's exact audience — opens package.json, finds a dependency under a "zero dependencies" badge, and files the whole trust story under "rounds up." The stronger true claim is already in the repo's own vocabulary: zero *required* deps, runs on an empty node_modules (bench-gated by the non-vacuity control in `performance.json`), one optional wasm parser that only sharpens extraction. Separately, an org evaluator looking for a security posture finds no single document to cite.
- **Fix:** (a) standardize on "zero required dependencies — runs on an empty node_modules (CI-verified); one optional wasm grammar" wherever "zero deps" appears; (b) a 15-line SECURITY.md: what codeweb reads (source files), what it writes (`.codeweb/` only), what it never does (execute target code, network calls, telemetry), how releases are attested (provenance), where to report. This is the citable artifact C1's trust line can link.
- **Effort:** S

### F9 · Specific over generic — real usage numbers exist only where nobody looks, and the "used by" story is (correctly) empty
- **Lens:** 2 (specificity) + 3 (proof at decision)
- **Location:** the only public usage signals: npm 155/week (api.npmjs.org, fetched), `.vsix` asset 0 downloads (releases API), 0 registry/directory listings (SEO F1–F3). The repo's genuinely impressive activity evidence — 9 disciplined releases, 58 PRs with the gate commenting on them, 308 green CI runs in 32 days — is visible only to someone who tours the GitHub tabs. The dogfood loop (codeweb's own gate reviewing codeweb's own PRs, e.g. #52–57) is publicly inspectable and *is* a usage receipt: the maintainer trusts it on every change.
- **The doubt left unanswered:** "does anyone use this?" currently answers "no evidence" everywhere the question is asked. Until third parties exist, the honest bridge is self-use made legible — every serious OSS tool's first user story is its own repo.
- **Fix:** surface the dogfood: in the CI-gate docs and site product section, link a real merged PR where the gate commented ("see it reviewing our own PRs"); add the CI badge (F5); one README line "codeweb maps and gates its own codebase on every PR — the receipts are public." Never imply external users before they exist.
- **Effort:** S

---

## 3. Proof at the decision

What should sit within eyeshot at each moment a stranger is asked to act — first item = highest doubt removed. Real, already-owned proof only.

**1. README `## Install` (the primary ask)**
1. CRO C1's trust line (free/MIT/local/never-executes) — the two silent objections.
2. One receipt line: "27 tools — count and benchmark budgets verified in CI on every PR" + CI badge adjacent (F5), *after* F2 makes it airtight.
3. Provenance line: "npm releases are provenance-attested (`npm audit signatures`)" (F8).

**2. start.html (the checkout page — currently zero proof elements)**
1. A three-receipt strip above the cards, each linked: "0 disagreements across ~490k oracle checks" → correctness-query.json · "+0.31 recall at equal cost (v0.9.0 pilot)" → efficiency-pilot · "12 of 17 axios candidates dismissed as false positives" → case study. (CRO C8's payoff screenshot covers the visual half.)
2. The same trust line as README Install.
3. Under the npx card: "you can grade codeweb on your own repo afterwards — `npm run bench` from a clone" — falsifiability at the moment of maximum suspicion.

**3. npm package page (the stalest proof copy is shown at the freshest decision)**
1. Republish so description + README say 27 and carry the F1-corrected numbers (SEO F4 mechanics; the trust cost is this section's concern).
2. The provenance attestation is already rendered by npmjs on this page — reference it in the README install section so its presence reads as intended, not incidental.

**4. /demo/ (peak conviction — CRO C3 owns the missing ask)**
1. Provenance line in the top bar or footer: "the unedited report codeweb generated on axios v1.18.1 · 2026-07-19 · regenerate: one command" (F7 + F4's pin).
2. Then C3's "Map your repo →".

**5. Site index (hero + closing)**
1. The stat strip under the hero is *correctly placed* — fix its contents: F1's current numbers, F3's linked pre-registration.
2. Closing CTA row: replace "Star on GitHub" (0-star page = negative proof; CRO C9) with **"Browse the receipts"** → research.html or "Watch releases" (RETENTION R10) until stars exist.

**6. report.html + gate PR comment (the borrowed-trust surfaces)**
1. F7's provenance footer (version · date), then CRO C3's link. The gate comment links the word "codeweb" beside its reproduce command.

---

## 4. Proof to earn

The credibility this product should collect that it doesn't have — ordered by credibility-per-effort *at ~155 downloads/week*, every item real-only. (Explicitly out of bounds, per the standing rule and CRO §4: invented counts, anonymous quotes, purchased or reciprocal stars, any "used by" logo without a named permission.)

1. **Third-party shelf presence** — the MCP registry (`registry.modelcontextprotocol.io`: currently 0 entries), glama.ai, mcp.directory, awesome-claude-code lists, the plugin marketplace manifest (FUNNEL #1). At this scale, neutral directories are the highest-credibility external signal available — they're how this audience already shortlists (COMPETITIVE stake #1 verified rivals there). Effort S, mostly submissions.
2. **The first five named users, personally earned** — when issues/mentions appear, ask each real user for one quotable sentence with name + repo + what the gate/map caught. The collection mechanism already half-exists: FUNNEL §5.4's opt-in `codeweb stats --share` turns the local value receipt ("41 pre-edit cards · 2 regressions flagged") into a paste-able, *self-verifying* testimonial format — numbers, not adjectives, no telemetry. Publish none until they're real; even two named quotes beat any wall of stars for this audience.
3. **A second, named, permissioned case study** — a draft already exists (PR #58, "external review of goblet/goblet", closed unmerged). One external-repo review with the owner's blessing converts "works on axios" into "works on repos like yours," and the owner becomes the first named endorser. Pin its SHA from day one (F4's lesson).
4. **Stars via one honest launch moment, not on-page begging** — the "we pre-registered, published two nulls, and let the TypeScript compiler referee" story is genuinely Show-HN-shaped; the research page is the landing. Stars earned in one spike make every later surface (and the star CTA) legitimate. Prerequisites first: F1/F2 fixed — HN will run the exact checks this audit ran, and the thread lives or dies on the first commenter who opens `reps5-v090.json`.
5. **VS Code Marketplace publish** (COMPETITIVE stake #4 — currently a 404 with a 0-download .vsix) — an install counter on a neutral platform, plus the missing editor-surface checkbox. Only list it once real.
6. **The org-trust pack** — F8's SECURITY.md + provenance note + "what it reads/writes" table. This is the artifact that lets a lead engineer *cite* codeweb into a security review; its absence is invisible until it silently loses that exact adoption.
7. **Growth receipts infrastructure** — FUNNEL §5.1's scheduled snapshot of GitHub traffic/stars/npm downloads into a committed ledger. GitHub traffic expires in 14 days; whatever growth happens next quarter is unprovable unless archiving starts now. Future social proof ("downloads 10×'d after the gate shipped") requires today's baseline — in this repo's own idiom: no receipt, no claim.
8. **A public "show your numbers" thread** — enable GitHub Discussions with one pinned thread inviting `npm run bench` output from users' own repos. Every reply is user-generated, self-verifying evidence sitting on the repo itself; the referee design makes this uniquely collectable for codeweb.

---

## Next

Top candidates, in ship order: **(1) F1** — sweep the superseded pilot numbers to "+0.31 recall at equal cost (v0.9.0, all reps positive)" across README, index, product.json, and the don't-claim list — it strengthens the headline *and* closes the one contradiction that detonates under scrutiny; **(2) F2** — the 20/24/27 sweep + prose-count gate + reword the gate's own description + npm republish (bundle CRO C2 / SEO F4); **(3) F3** — commit `bench/preregistration.md` so the flagship "32/33 pre-registered" stat has an on-main receipt and the §3.8 dangling citation resolves; **(4) F5+F8** — verifiable badge row (CI/npm/license), provenance line, zero-*required*-deps phrasing, SECURITY.md; **(5) F4** — pin the case study to axios v1.18.1. The conductor should pick which to make.
