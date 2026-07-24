# SEO & Discoverability Audit — codeweb

**Date:** 2026-07-23 · **Scope:** the public web surface (site/ → docs/ → https://ghostlygawd.github.io/codeweb/ incl. /demo/) **plus** the channels developers actually search for a tool like this: GitHub search/topics, npm search, the MCP registry, and the Claude Code plugin marketplace. All page checks were made against the **live deployed site** (fetched 2026-07-23) and byte-compared to the committed `docs/` build; channel checks hit the live GitHub API, npm registry API, and registry.modelcontextprotocol.io. Read-only pass; this file is the only write. Prior context: FUNNEL.md (install leak), COMPETITIVE.md (~155 npm downloads/week — the crisis all rankings below are weighted against).

---

## 1. Verdict

**Indexable: yes, but structurally starved. Shareable: yes for the five site pages, no for the demo — the one page people actually share.**

The on-page fundamentals are better than most funded startups ship: every one of the five site pages gets a unique title, meta description, canonical URL, and per-page OG tags from a single data-driven table (site/build.mjs:227–233 → site/templates/base.html), content is fully server-rendered static HTML that needs no JS to read, the OG image is a correct 1200×630 PNG (verified live: 137,881 B), there is no stray noindex, and the deployed site is **byte-identical** to the committed `docs/` build (index, start, demo compared byte-for-byte; changelog size-matched — zero build-vs-deploy drift).

**The single biggest leak is not on the pages — it's that codeweb is absent from every index this audience searches.** Concretely, the sharpest instance: **the GitHub repo has zero topics and a description that never says "MCP"** (`GET /repos/GhostlyGawd/codeweb` → `"topics": []`, homepage field `null`). Live consequence, measured today: GitHub repo search for **"codeweb" returns 830 results and this repo is not in the top 10** — its own name is owned by CodeWebChat (1,384★); search for **"mcp call graph codebase" returns 42 repos, codeweb absent**, while every one of the top 10 rivals (SocratiCode 3,143★, codebase-memory-mcp-pro 203★, better-code-review-graph 66★…) carries 10–20 topics of exactly the kind codeweb lacks (`mcp`, `mcp-server`, `model-context-protocol`, `claude-code`, `call-graph`, `code-analysis`). The same absence repeats on every other shelf: **0 entries in the official MCP registry** (`registry.modelcontextprotocol.io/v0/servers?search=codeweb` → `{"count":0}`), **no `.claude-plugin/marketplace.json`** for the plugin marketplace (FUNNEL.md §3), npm brand search ranks it **#3 of 3 behind two unrelated `@codeweb/*` packages**, and the published npm description still advertises **"24 MCP tools"** against the site's 27. Meanwhile the website itself is a link island: every github.com → ghostlygawd.github.io link is `rel="nofollow"` (verified in the fetched repo HTML), there are **no external inbound links** (0 stars, 0 forks, no directory listings), and the site ships **no sitemap.xml and no robots.txt** (both fetched: 404) — so classic web SEO has almost nothing to crawl in on. For a 155-download/week product, fixing the directory layer (minutes of settings + two small files) is worth more traffic than everything else in this report combined.

---

## 2. Three page checks (live fetches, 2026-07-23)

| Page | What a crawler sees | What a shared link unfurls | Gap |
|---|---|---|---|
| **`/` (homepage)** — 200, 16,358 B HTML | Full static prose without JS: one `h1` ("The living map of your codebase.", site/content/index.html:5), logical h2/h3 outline, descriptive link text, alt on the one content image (index.html:158), canvas demos properly `aria-label`ed/`aria-hidden`. Unique title + 300-char description + canonical `…/codeweb/` + full OG block (verified in live head). `/codeweb` 301→`/codeweb/`; `/codeweb/index.html` duplicate is canonicalized. No JSON-LD. | Correct large card: og:title, og:description, `twitter:card summary_large_image`, og.png 1200×630 (200 OK). | Small: title/description contain zero search phrases anyone types ("call graph", "codebase map", "MCP server" — see F7); no structured data (F10). Otherwise this page passes. |
| **`/demo/` (the most-shared URL — README.md:56 "click around this exact map yourself", nav "Live demo", hero CTA)** — 200, 166,225 B | Title `codeweb — system map` and then **nothing**: 0 meta description, 0 OG/Twitter tags, no canonical, no `h1`, and near-zero indexable text — the entire page is a JS canvas app over inline data (docs/demo/index.html; verified 0 matches for `og:`/`description`/`canonical` in the live file). Doesn't even contain the word "axios" in its title. Self-contained (no external fetches) — loads reliably, says nothing. | **A bare link.** No image, no description; the unfurl is the raw URL plus "codeweb — system map". | **The product's best artifact is its worst share.** Every README reader, HN comment, or DM that passes this link around gets a dead grey card instead of the 1200×630 graph shot. Fix is one head-injection in the existing `injectDemoNav()` pass (F5). |
| **`/start.html` (the conversion page — every CTA lands here)** — 200, 9,271 B | Static, unique title ("Get started — codeweb") + accurate description + canonical + OG (verified live). Install commands are plain indexable `<pre>` text. **No `h1`** — the page opens at `h2` ("Three ways in…", site/content/start.html:5); same for product/research/changelog (grep: index.html is the only content file with an `<h1>`). | Correct large card with the site-wide og.png. | Minor: h1 missing (F9); card image is the generic brand shot on a page whose job is "install" — acceptable. |

---

## 3. Findings

Ranked by traffic at stake (channel findings first — that's where this product's searchers are), then on-page. Effort: S = hours, M = day(s).

**F1 · GitHub topics empty + repo description omits "MCP" + homepage field null — invisible in the #1 discovery channel**
- **Lens:** Crawlability / channel presence
- **Where:** GitHub repo settings (verified live: `"topics": []`, `"homepage": null`, description "Dissect a codebase into atomic symbols… Claude Code plugin." — no "MCP", no "call graph" as searchable phrase)
- **Impact:** codeweb is un-findable exactly where its buyers search. Measured today: absent from top-10 for its **own name** (830 competing "codeweb" repos; CodeWebChat 1,384★ owns the query) and absent from "mcp call graph codebase" (42 repos) where **every** top-10 rival carries `mcp`/`mcp-server`/`claude-code`/`call-graph` topics. Topic pages (github.com/topics/mcp-server etc.) are browsed directories codeweb simply isn't shelved in. Highest-traffic gap in this report.
- **Fix sketch:** In repo settings (zero code): add ~15 topics — `mcp`, `mcp-server`, `model-context-protocol`, `claude-code`, `claude-code-plugin`, `call-graph`, `dependency-graph`, `code-analysis`, `static-analysis`, `code-visualization`, `codebase-map`, `dead-code`, `refactoring`, `developer-tools`, `ai-agents`; set homepage = `https://ghostlygawd.github.io/codeweb/`; rewrite description to lead with the searched nouns: "Deterministic call/import graph of your codebase — 27 MCP tools for coding agents + a self-contained interactive map. Claude Code plugin & MCP server."
- **Effort:** S (minutes)

**F2 · Not in the official MCP registry (0 results) — no `server.json`**
- **Lens:** Channel presence
- **Where:** `registry.modelcontextprotocol.io/v0/servers?search=codeweb` → `{"servers":[],"metadata":{"count":0}}`; no `server.json` anywhere in the repo (verified by find)
- **Impact:** The registry is the canonical MCP shelf and feeds the downstream directories (glama.ai, mcp.directory & co.) where COMPETITIVE.md §3 found every rival listed and codeweb absent. An MCP-first product with 27 tools that is unlisted in the MCP registry forfeits the category's entire browse traffic.
- **Fix sketch:** Add `server.json` (name `io.github.ghostlygawd/codeweb`, the npm package, stdio transport), publish via `mcp-publisher` with GitHub auth; wire into the release skill so it republishes per version.
- **Effort:** S

**F3 · No `.claude-plugin/marketplace.json` — plugin-marketplace shelf missing and the #1 CTA is unverified**
- **Lens:** Channel presence
- **Where:** `.claude-plugin/` contains only `plugin.json`; every install surface leads with `/plugin marketplace add GhostlyGawd/codeweb` (README.md:162, site/content/start.html:13)
- **Impact:** Same defect FUNNEL.md §3 ranked #1 from the install side; from the discoverability side it means codeweb can't be added/browsed as a marketplace, and rivals that ship the manifest (COMPETITIVE.md §1, code-graph-mcp) occupy the shelf.
- **Fix sketch:** One ~15-line `marketplace.json` naming the plugin; verify the add command end-to-end once.
- **Effort:** S

**F4 · npm metadata stale and thin — published description says "24 MCP tools", 8 keywords, loses its own-name search**
- **Lens:** Titles & descriptions (npm is a search engine too)
- **Where:** Live registry doc for `@ghostlygawd/codeweb@0.9.0`: description "…24 MCP tools…" vs 27 everywhere current (package.json:5 already says 27 locally but 0.9.0 is what npm shows and it can't be republished without a version bump); keywords package.json:6–15 miss `mcp-server`, `model-context-protocol`, `code-map`, `impact-analysis`, `static-analysis`, `visualization`, `architecture`
- **Impact:** npm search "codeweb" ranks it **#3 of 3** behind unrelated `@codeweb/postcss` and `@codeweb/compiler-sfc`; absent from top-10 for "mcp call graph" (315k-package query where rival `@astudioplus/codegraph-mcp` places). The stale "24" also quietly undercuts the consistency story the repo gates itself on (scripts/check-consistency.mjs exists precisely to prevent this class of drift — it can't reach already-published npm copy).
- **Fix sketch:** Fold the keyword additions + description into the next version bump (0.9.1); npm re-indexes on publish. Consider adding the npm-downloads badge to README while there (FUNNEL.md §5.2).
- **Effort:** S (rides the next release)

**F5 · Demo page has no meta description, no OG/Twitter card, no canonical, no h1 — the most-shared URL unfurls as a bare link**
- **Lens:** Social unfurls + Indexable content
- **Where:** docs/demo/index.html head (live-verified: title only); generated by the report pipeline, then post-processed by `injectDemoNav()` in site/build.mjs:284–297 which already rewrites this file idempotently behind a `<!--cw-nav-->` marker
- **Impact:** README.md:53–56 and the site hero both push people to share/click this exact URL; every social/chat share renders a grey stub with no image or description while the five brochure pages — which nobody shares — unfurl beautifully. For a 0-star project whose first links will come from shares, this suppresses the only viral loop that exists. Also thin for crawlers: a JS shell with no prose, no canonical, generic title that omits "axios".
- **Fix sketch:** Extend the existing injection pass to also insert a head block: title "Live demo — axios call graph, mapped by codeweb", meta description, canonical `…/codeweb/demo/`, and the standard OG/Twitter block pointing at og.png (or a demo-specific 1200×630 screenshot — assets/screens/05-axios-graph.png cropped). ~15 lines in build.mjs, deterministic, no new files.
- **Effort:** S

**F6 · No sitemap.xml, no robots.txt, and every inbound link is nofollow — the site has no crawl path in**
- **Lens:** Crawlability
- **Where:** `https://ghostlygawd.github.io/codeweb/sitemap.xml` → 404; `/robots.txt` → 404 (both fetched); all three sampled github.com links to the Pages site carry `rel="nofollow"` (fetched repo HTML); no external inbound links exist (0 stars/forks, no directory listings — F1–F3); site age 32 days (repo created 2026-06-21)
- **Impact:** Nothing forbids indexing (no noindex, no x-robots-tag header — verified), but nothing invites it either: discovery relies on Google happening upon a nofollow-only github.io subpath. Indexation could not be confirmed externally (SERP endpoints block automation — DDG returned a 202 challenge); structurally, assume near-zero crawl equity today. A sitemap is also the prerequisite for Search Console submission — the one lever that forces indexation without waiting for links.
- **Fix sketch:** Emit `robots.txt` (allow all + `Sitemap:` line) and `sitemap.xml` (6 URLs: `/`, product, research, start, changelog, `demo/`) from the `PAGES` table already in site/build.mjs:227–233 — ~15 lines, stays deterministic; then verify the property in Google Search Console + Bing Webmaster and submit.
- **Effort:** S

**F7 · Titles and descriptions carry zero search vocabulary — pure brand language on every page**
- **Lens:** Titles & descriptions
- **Where:** site/build.mjs:228–232 — "codeweb — the living map of your codebase", "Product — codeweb", "Research — codeweb", "Get started — codeweb", "Changelog — codeweb"
- **Impact:** Unique and truthful, but nobody searches "living map". The queries with intent — "call graph visualizer", "codebase map", "MCP server code analysis", "dead code finder" — appear in no title and no meta description, so even once indexed the pages compete for nothing. (COMPETITIVE.md §4 flags the same positioning vocabulary issue from the marketing side.)
- **Fix sketch:** Keep the brand, append the category: e.g. index → "codeweb — interactive codebase map & call graph MCP tools for coding agents"; product → "27 MCP tools & CI structural gate — codeweb"; research keeps "evidence" plus "benchmarks". One-line edits in the PAGES table; descriptions similarly front-load "call/import graph", "MCP server", "Claude Code plugin".
- **Effort:** S

**F8 · Internal working documents are publicly served on the product domain; the best SEO content is stranded as raw markdown**
- **Lens:** Crawlability / duplicates (orphans)
- **Where:** docs/ is the Pages root, so it serves everything committed there: live-verified 200 + `text/markdown` for `product-review-2026-07-20.md`, `ROADMAP.md`, `case-study-axios.md`; also present: product-review-2026-07-18.md, perf-quality-review-2026-07-21.md, backlog-ast-tree-sitter.md, agent-tools*.md, tier0-3-spec.md, decisions/, specs/ (ls docs/)
- **Impact:** Two-sided. (a) Orphaned crawlable URLs of internal self-critiques ("product review" files cataloguing defects) sit on the same host as the marketing site — crawl noise at best, awkward SERP snippets at worst. (b) The one genuinely link-worthy story — the axios case study README.md:53 links to — exists only as unstyled raw markdown with no title tag, no meta, no nav, invisible to search and unpleasant to share.
- **Fix sketch:** Move internal docs out of the publish root (repo-level `docs-internal/` or exclude from Pages), or at minimum disallow `*.md`, `decisions/`, `specs/` in the new robots.txt; promote case-study-axios.md into a real built page ("Case study: mapping axios — 3 confirmed duplications in a 50M-download library" — that's a rankable, shareable title) in the PAGES table.
- **Effort:** S for robots exclusion · M for the case-study page
- *Note (out of SEO scope, flagging for the operator):* plugin.json:7 publishes a personal email; the About sidebar/description review in F1 is the moment to decide if that's intended.

**F9 · Four of five site pages (and the demo) have no `h1`**
- **Lens:** Semantics & headings
- **Where:** Only site/content/index.html:5 has an `<h1>`; start/product/research/changelog open at `<h2>` (grep across site/content/, confirmed in live start.html); demo has no headings at all
- **Impact:** Weak page-topic signal on exactly the pages meant to catch "get started/install" and "evidence/benchmarks" queries; harmless to users, cheap ranking hygiene left on the table.
- **Fix sketch:** Promote each page's first heading to a keyworded `h1` ("Get started with codeweb — plugin, npx, or MCP server", "codeweb research & benchmarks", …) — content-file edits only, styling already tolerates it.
- **Effort:** S

**F10 · No structured data anywhere**
- **Lens:** Structured data
- **Where:** site/templates/base.html (no JSON-LD block; verified in live heads)
- **Impact:** codeweb is a textbook `SoftwareApplication`/`SoftwareSourceCode` (free, MIT, version, OS-agnostic, screenshots, repo URL) and emits none of it — forfeits rich-result eligibility and gives engines nothing machine-readable tying the site to the GitHub repo and npm package (`sameAs`). Zero-risk points, currently unclaimed.
- **Fix sketch:** One static JSON-LD block in base.html filled from the same vars the build already has (name, version, description, `codeRepository`, `offers: 0`, `applicationCategory: DeveloperApplication`, `sameAs`: repo + npm URLs). Validate with the Rich Results test once.
- **Effort:** S

**F11 · OG polish — missing `og:image:width/height/alt`**
- **Lens:** Social unfurls
- **Where:** site/templates/base.html:9–15 (image dimensions/alt absent; twitter:title/description correctly fall back to og:*)
- **Impact:** Some scrapers (Slack, LinkedIn first-fetch) render faster/more reliably with declared dimensions; alt is an accessibility nicety on shares. The image itself is correct (1200×630, 200 OK, ~135 KB) — this is trim, not triage.
- **Fix sketch:** Add the three meta lines to base.html.
- **Effort:** S (minutes)

**F12 · Performance signals — pass (site); the heavy surface is the README, not the site**
- **Lens:** Performance
- **Where:** Live weights: homepage 16.4 KB HTML + 32 KB css + 19 KB js, single stylesheet, no fonts, no third-party requests (site/templates/footer.html:38 brags about it, correctly); the 1,061,657 B graph PNG is below the fold with `loading="lazy"` (site/content/index.html:158); demo is one 166 KB self-contained file with zero external fetches; changelog is the heaviest page at 167 KB HTML (fine)
- **Impact:** Core Web Vitals proxies are healthy — static HTML LCP, no layout-shifting embeds, no blocking third-party. Nothing to fix for ranking. The ~3.4 MB of PNGs live in the GitHub README (FUNNEL.md §2 row 1) — that hurts the repo-page experience, not the site's CWV; compress there on its own merits.
- **Effort:** — (no action)

---

## 4. Quick wins (shippable this week, highest reach first)

1. **Set GitHub topics + description + homepage field** (F1) — minutes, no code, immediately enters every topic shelf and repo search it's currently absent from.
2. **Publish `server.json` to the MCP registry** (F2) — hours; puts 27 MCP tools on the canonical MCP shelf and its downstream directories.
3. **Ship `.claude-plugin/marketplace.json`** (F3) — the ~15-line file FUNNEL already demanded; discoverability and the #1 CTA fixed together.
4. **Inject the demo head block** (F5) — ~15 lines in the existing `injectDemoNav()` pass; the most-shared URL starts unfurling with the graph image.
5. **Emit sitemap.xml + robots.txt from the PAGES table and submit to Search Console** (F6) — ~15 lines; creates the site's first real crawl path.
6. **Retitle pages with category vocabulary + add h1s + JSON-LD block** (F7/F9/F10) — one sitting in the PAGES table, content files, and base.html.
7. **Queue npm description/keywords for the 0.9.1 publish** (F4) — rides the next release; fixes the public "24 tools" drift and the keyword gap.

---

## Next

Top candidates, in order of traffic at stake: **(1) F1 GitHub topics/description/homepage** (minutes, unlocks the largest existing search channel), **(2) F2 + F3 registry + marketplace manifests** (the two missing shelf files), **(3) F5 + F6 demo unfurl + sitemap/robots in build.mjs** (one small deterministic build change covering both). F7/F9/F10 (titles, h1s, JSON-LD) bundle naturally into the same build.mjs/content pass if a third work item fits the week.
