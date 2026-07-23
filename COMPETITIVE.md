# Competitive Gap Scan — codeweb

**Date:** 2026-07-23 · **Scope:** codeweb v0.9.0 (repo state: 27 MCP tools, 11 native languages, zero runtime deps, MIT, no accounts) placed against real rivals researched live on the web today. Every rival claim below cites a page actually fetched during this scan; where only search-result snippets were available (G2, CodeSee coverage) that is said explicitly. Repo claims cite files in this working tree. Read-only pass; this file is the only write.

---

## 1. Arena summary

**Category:** structural code intelligence for the AI-agent era — tools that give a coding agent (and the human reviewing it) a queryable map of a codebase: call/import graph, impact, duplication, dead code, visualization. codeweb ships it as Claude Code plugin + 27-tool MCP server + CLI + self-contained HTML map.

**Audience:** individual developers and small teams using Claude Code (or any MCP client), free/local-first, plus anyone wanting codebase-structure visibility without a SaaS.

**The five rivals a prospective user actually compares:**

| Rival | One line | Evidence |
|---|---|---|
| **Serena** (oraios/serena) | The category gorilla: MIT MCP toolkit giving agents LSP-backed *semantic retrieval + editing* (find symbol, references, rename, replace body) in 40+ languages; 26.8k stars; free core, paid JetBrains backend. | [github.com/oraios/serena](https://github.com/oraios/serena) (fetched) |
| **Claude Code native LSP** | The platform itself: since ~Dec 2025 Claude Code ships native LSP support with a community LSP-plugin marketplace — go-to-definition and find-references are now built into codeweb's own host platform. | [HN thread](https://news.ycombinator.com/item?id=46355165) (fetched); [Piebald-AI/claude-code-lsps](https://github.com/Piebald-AI/claude-code-lsps) (via search) |
| **CodeGraphContext** | The biggest dedicated code-graph MCP server: pip-installed, indexes 23 languages into a graph DB (FalkorDB Lite default — Unix-only; Neo4j/Kuzu optional), call chains, dead code, complexity, impact, web viz; 4k+ stars, MIT. | [github.com/CodeGraphContext/CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext) (fetched) |
| **dependency-cruiser** (+ madge) | The incumbent free graph tools for JS/TS: module/file-level dependency validation with custom rules, CI output, dot/mermaid graphs — 7k stars and **2.76M weekly npm downloads** (madge: 10.1k stars, 2.93M/wk). Explicitly *not* function-level; no MCP/agent integration. | [github.com/sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [github.com/pahen/madge](https://github.com/pahen/madge) (fetched); npm API 2026-07-15..21 (fetched) |
| **CodeScene** | The commercial ceiling for "findings": behavioral code analysis — hotspots, CodeHealth, automated PR review, quality gates for AI coding, 30+ languages — at **€18–27/active author/month**, free for open source, ACE auto-refactor via sales. | [codescene.com/pricing](https://codescene.com/pricing) (fetched) |

**Adjacent signals (not primary columns, but shape the arena):**
- **Aider repo-map** — popularized "tree-sitter + graph-ranked repo map under a token budget (default 1k)" as agent context; it's a *feature of an agent*, not a queryable tool surface ([aider.chat/docs/repomap.html](https://aider.chat/docs/repomap.html), [2023 design post](https://aider.chat/2023/10/22/repomap.html), both fetched).
- **Sourcetrail** — the interactive call-graph explorer for humans, **archived Dec 14, 2021 at 16.5k stars** ([github.com/CoatiSoftware/Sourcetrail](https://github.com/CoatiSoftware/Sourcetrail), fetched). Proven demand, abandoned incumbent.
- **CodeSee** — VC-backed codebase-maps SaaS, acquired by GitKraken; the standalone product was sunset (search results incl. [koalr.com/blog/codesee-alternatives](https://koalr.com/blog/codesee-alternatives); not fetched directly). The visual-map vacuum is real on both the OSS and SaaS side.
- **Sourcegraph** — exited the individual-developer market: Cody Free/Pro **discontinued July 23, 2025** (one year ago today), users pointed at Amp; Cody is enterprise-only ([sourcegraph.com blog](https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans), fetched). Individual devs are left to local/OSS tools — codeweb's exact lane.
- A fast-moving long tail of code-graph MCP servers exists (e.g. [sdsrss/code-graph-mcp](https://github.com/sdsrss/code-graph-mcp), fetched: tree-sitter, 19 languages, SQLite + BM25+vector hybrid search, BLAKE3 incremental, ships as a Claude Code plugin — 55 stars, 273 releases). Individually small; collectively they define what "table stakes" means in this category by 2026.

**Pricing & packaging norms (lens 3):** the surviving pattern is *free MIT core, paid only at the edges* — Serena core free / JetBrains backend paid; CodeScene per-active-author SaaS with a free-for-OSS program; Sourcegraph retreated to enterprise-only; the standalone visualization SaaS (CodeSee) died. dependency-cruiser/madge/aider/CodeGraphContext are simply free. codeweb (free, MIT, no accounts) sits exactly on the market norm; any future monetization that adds an account or a server before first value would be off-norm for this arena (input for stage 3).

---

## 2. Comparison table

Sources: the fetched pages cited in §1; codeweb column verified against this repo (file refs inline).

| Capability | **codeweb** | Serena | Claude Code LSP | CodeGraphContext | dep-cruiser / madge | CodeScene |
|---|---|---|---|---|---|---|
| Function-level call graph | ✅ deterministic (`scripts/extract-symbols.mjs`) | ✅ via LSP refs | ✅ direct refs only | ✅ tree-sitter/SCIP | ❌ module-level only (README states) | ✅ (internal) |
| Transitive impact / blast radius | ✅ `codeweb_impact`, one ~1KB call | ⚠️ manual multi-hop | ❌ (HN thread: no such analysis) | ✅ impact analysis | ❌ | ⚠️ change-coupling analytics |
| Duplication detection | ✅ body-confirmed + Type-2 renamed clones (`overlap.mjs`, `skeleton.mjs`) | ❌ | ❌ | ❌ (not listed) | ❌ | ⚠️ inside CodeHealth |
| Dead code | ✅ confidence-tiered (`deadcode.mjs`) | ❌ | ❌ | ✅ (listed) | ⚠️ orphan modules only | ⚠️ |
| Hotspots / complexity ranking | ✅ complexity × fan-in × churn (`hotspots.mjs`) | ❌ | ❌ | ⚠️ complexity metric only | ❌ | ✅ its signature feature |
| Refactor planning (gated merge/campaign/simulate) | ✅ `campaign.mjs`, `simulate-edit.mjs`, `optimize.mjs` | ❌ | ❌ | ❌ | ❌ | ⚠️ ACE, paid add-on |
| Interactive visual map for humans | ✅ self-contained `report.html` + treemap + matrix + live demo | ❌ (web dashboard is logs/config) | ❌ | ⚠️ side-feature web viz | ⚠️ needs Graphviz, static image | ✅ SaaS dashboards |
| MCP tools for agents | ✅ 27, budgeted ~1KB responses, staleness auto-refresh (`mcp-server.mjs`) | ✅ its core | n/a (built-in) | ✅ | ❌ (none mentioned) | ❌ (CI/IDE, not MCP) |
| Agent *editing*/refactoring tools | ❌ deliberate — read-only; `codemod --write` not exposed over MCP (README) | ✅ rename/insert/replace | ⚠️ partial (HN: no refactors) | ❌ | ❌ | ⚠️ ACE |
| CI / PR structural gate | ✅ free: cycles, duplication, lost-callers + GitHub Action (`ci-gate.mjs`) | ❌ | ❌ | ❌ | ✅ rules, module-level | ✅ quality gates (paid) |
| Languages | 11 native, agent fallback for rest (README) | 40+ via LSP | per installed LSP plugin | 23 | JS/TS-family only | 30+ |
| Install / runtime deps | npx or plugin; **zero deps**, Node ≥22 | uv + Python + language servers | built-in | pip + Python + graph DB backend (default Unix-only) | npm (+ Graphviz for pictures) | SaaS/on-prem, accounts |
| Determinism + published benchmarks | ✅ byte-reproducible; CI-gated bench ledger, compiler-graded A/B (`bench/budgets.json`, `bench/results/oracle-ab.json`) | ❌ none published | ❌ | ❌ | ❌ | ⚠️ research-backed metric, closed |
| Price / license | Free, MIT | Free core (MIT); JetBrains backend paid | Free with Claude Code | Free, MIT | Free, MIT | €18–27/author/mo; free for OSS |
| Documented user pain (lens 6) | distribution ~0 (155 npm dl/wk; npm API, fetched) | 30GB memory freeze ([issue #944](https://github.com/oraios/serena/issues/944), open); first-call stalls, MCP timeouts, dashboard auto-opens and breaks headless, "under ~20k LOC, skip it" ([mcp.directory guide](https://mcp.directory/blog/serena-mcp-complete-guide-2026)) | "janky… doesn't support multi-folder projects", no refactoring (HN thread) | build-tool prereqs for C/C++/C# SCIP; default backend Unix-only (README) | module-level ceiling; Graphviz prereq (READMEs) | learning curve, UI heavy on very large repos, FPs from generated/vendored code (G2 pros/cons via WebSearch snippets — G2 not directly fetchable) |

The blunt read: **codeweb already has the widest capability row in the free column** — nothing free combines function-level graph + duplication + dead code + hotspots + visual map + CI gate + MCP. Its losing rows are languages, editing (deliberate), and — overwhelming everything — distribution: 155 weekly downloads vs Serena's 26.8k stars and dep-cruiser's 2.76M weekly downloads.

---

## 3. Table stakes we lack (ranked by user expectation · effort S=hours–day, M=days, L=week+)

1. **Presence where this market compares tools — S.** Serena, CodeGraphContext, and even 55-star code-graph-mcp are listed and reviewed on glama.ai, mcp.directory, and MCP registries (all surfaced repeatedly in this scan's searches); code-graph-mcp ships as a Claude Code plugin with slash commands — codeweb's exact packaging. codeweb appears in none of the comparison surfaces this scan hit, and FUNNEL.md §3 found the plugin-marketplace manifest (`.claude-plugin/marketplace.json`) missing entirely. In a category where users pick from directories, being unlisted *is* a missing feature.
2. **A stated answer to "Claude Code already has LSP" — S.** Since Claude Code shipped native LSP (HN thread, fetched), every prospective user's first objection is "why do I need this?" The true answer is good — LSP does direct references on open projects; it does **not** do transitive impact, duplication, dead code, hotspots, diff-gating, or any of it deterministically (no commenter in the HN thread even asks for those from LSP) — but codeweb never says it: grep of README/site/docs finds **zero** mentions of LSP outside an archived review note (`docs/product-review-2026-07-18.md:195`). Rivals get compared *for* them by directories; codeweb must ship the comparison itself.
3. **C/C++ coverage — L.** Every structural rival covers C/C++: Serena 40+ languages, CodeGraphContext 23 (C/C++ via SCIP/tree-sitter), code-graph-mcp parses C/C++, CodeScene 30+, and archived Sourcetrail was C/C++-first. codeweb's 11 native languages omit C/C++ entirely (README roadmap). The trusted-wasm-grammar provenance gate (`scripts/grammars/PROVENANCE.md`) is the right discipline — but the gap is the single most common "does it support X?" fail for the systems-programming half of the audience.
4. **An installable editor surface — S.** Serena ships a JetBrains backend; CodeScene ships an IDE Code Health Monitor (pricing page). codeweb's VS Code extension exists in-repo (`editor/vscode-codeweb`) but the Marketplace URL 404s — publish is token-gated (`docs/product-review-2026-07-20.md` §1). An extension users can't install is a checkbox rivals get and codeweb doesn't.
5. **Concept-search expectations are being reset by hybrid search — M (respond, don't copy).** code-graph-mcp ships BM25 + vector hybrid search; "semantic search" is becoming assumed vocabulary in MCP directories. codeweb's `codeweb_find` is deliberately deterministic-lexical ("no LLM, no embeddings" — `scripts/lib/find-core.mjs:1-4`). Matching the *expectation* doesn't require embeddings (see do-not-copy #3): it requires documenting the tradeoff loudly and continuing to strengthen stemming/synonym coverage so the deterministic path keeps winning its benchmark.

*Already at or above table stakes (no work needed, worth surfacing in copy):* incremental re-index with cache (rivals tout BLAKE3 Merkle sync; codeweb's per-file edge cache + staleness auto-refresh is equivalent — README, `mcp-server.mjs`), budgeted responses (Aider's token-budget map is the pattern; codeweb budgets every list tool), watch-free freshness, cross-platform zero-dep install (CodeGraphContext's default backend is Unix-only).

**Patterns worth learning (lens 2):** Serena's git-committed project memories (onboarding artifacts reviewable in PRs) and its countermeasure for Claude Code's ~16k-token built-in-tool bias — reminder hooks that keep the model routing to MCP tools (mcp.directory guide). codeweb has hooks already; an explicit routing audit of its 27 tool descriptions against the built-in bias is cheap and directly increases realized value. dependency-cruiser's `--init` config generator is the model for `codeweb.rules.json` adoption. CodeScene's free-for-OSS program is the acquisition move its pricing page leads with.

---

## 4. Differentiation bets (traceable to this repo; exploiting documented rival weaknesses)

**Bet 1 — Be the tool with receipts: publish the head-to-head bench as acquisition content.**
No rival in the table publishes reproducible performance claims: Serena's value case is anecdotal and its pain is documented in its own tracker (30GB memory, issue #944; stalls and timeouts, mcp.directory guide); native LSP's story is "50ms go-to-def" with no coverage claims; CodeGraphContext and CodeScene publish no benchmark harness. codeweb already owns the machinery no one else has — compiler-graded oracle A/B vs grep (`bench/results/oracle-ab.json`), CI-gated budget ledger (`bench/budgets.json`), a frontier-agent A/B (+0.27 recall, −44% tokens, README), and a "run the referee on your own repo" command. The move: extend the existing harness with two columns — **vs native-LSP-style direct references** (show what LSP structurally cannot answer: transitive impact, dup, dead code) and **vs a representative code-graph MCP server** on a pinned corpus — and publish it as the site's comparison page. In a category drowning in unverifiable "8x–120x fewer tokens" claims (see the SEO-farm comparison posts this scan's first search surfaced), being the only tool whose numbers regenerate in CI is a positioning moat that costs a bench extension, not a rewrite.

**Bet 2 — Claim the empty chair: the human-facing map (the Sourcetrail vacuum).**
Sourcetrail died archived at 16.5k stars (fetched); CodeSee's SaaS was acquired and sunset (search); Serena has no visualization; code-graph-mcp has none; CodeGraphContext's viz is a side feature. codeweb's `report.html` — force-directed map, blast-radius click, treemap, coupling matrix, zero-network, one file — plus the live axios demo is already the best human-facing artifact in the free arena, and it's currently positioned as a byproduct ("the byproduct is the part you can see", README:35). The move: lead the human half of the story with it — "the map your agent works from is the map you review" — and make the artifact reach people: `--serve` for remote/headless sessions and an attribution footer on every generated report and the public demo (both already flagged in FUNNEL.md §2 as S–M). Every rival is an agent-only black box; codeweb is the only one where the agent's context and the human's review are the same object. That is the wedge for the "humans reviewing agent work" audience that CodeScene charges €18/author/month to reach.

**Bet 3 — Own "agent-edit safety": the structural regression gate as the lead use case.**
The market's anxiety in 2026 is agents rewriting code at scale; the free tooling answer is thin. dependency-cruiser gates only module-level rules (its README scopes it away from function-level); CodeScene sells "quality gates for AI coding" at €18–27/author/mo (pricing page, fetched); no MCP rival gates anything — Serena, CodeGraphContext, and code-graph-mcp all stop at retrieval. codeweb already ships the whole loop free: pre-edit `codeweb_simulate`, post-edit hook diff, `ci-gate.mjs` + GitHub Action failing PRs on new cycles / new duplication / lost callers, and `fitness.mjs` architecture rules (`codeweb.rules.json`). The move: rename the story from "map your codebase" to *"let agents edit fast — codeweb catches the structural regressions"*, put the CI Action first-class on the site, and let every PR comment the Action posts be the team-facing advert (FUNNEL.md already counted this as a referral surface). This occupies the exact position CodeScene monetizes, from below, free, with function-level resolution dependency-cruiser structurally cannot reach — and it's the one use case native LSP will never absorb, because gating requires a *diffable whole-graph snapshot*, which is codeweb's core data structure.

**Positioning words this implies (lens 5):** rivals own "semantic retrieval and editing" (Serena), "code health" (CodeScene), "validate and visualise dependencies" (dep-cruiser), "repo map" (Aider), "LSP" (the platform). Unowned and matching real capability here: **"blast radius"**, **"structural regression gate"**, **"deterministic / receipts"**, **"the living map"**. All four already appear in codeweb copy; the bets make them the headline instead of the footnote.

---

## 5. Do-not-copy list

1. **Serena's symbolic editing tools (rename/insert/replace-body).** Their strategy needs write-access to justify LSP overhead; codeweb's read-only stance ("never writes source", README; `codemod --write` deliberately unexposed over MCP) is its trust position — the gate can only be a credible reviewer if the tool provably never edits. The platform's native LSP + the agent already cover mechanical edits.
2. **CodeGraphContext's graph-database backends (FalkorDB/Neo4j/Kuzu matrix).** A DB dependency is exactly the install friction codeweb's zero-dep `graph.json` design deletes — and CGC's own default backend being Unix-only (their README) shows the cost. codeweb's plain-JSON graph is a feature, not a to-do.
3. **Embedding/vector "semantic search" (code-graph-mcp's sqlite-vec hybrid).** It breaks the determinism contract that every codeweb claim rests on (`find-core.mjs`: "no LLM, no embeddings"; `minhash.mjs`: "no Math.random, no Date"). Strengthen the lexical path and benchmark it instead (table stake #5).
4. **CodeScene's per-author SaaS packaging and portfolio/team dashboards.** Requires accounts, servers, and org sales motion; CodeSee's standalone visualization SaaS already died in this arena (GitKraken acquisition/sunset, search). codeweb's strictly-local, no-telemetry stance (`scripts/lib/stats.mjs:5-9`) is load-bearing for the agent-era audience.
5. **Serena's 40+-language breadth via external language servers.** That breadth imports the documented pain — first-call stalls, MCP timeouts, unbounded memory (issue #944; mcp.directory guide). Grow languages only on the provenance-pinned grammar path (`scripts/grammars/PROVENANCE.md`), even though it is slower; determinism is the differentiator being protected. (Corollary micro-lesson from the same complaint file: never auto-open a dashboard/browser — Serena's does, and it breaks headless setups.)

---

## Next

Top move candidates for the operator to choose from (each traceable to §3/§4):

1. **Ship the "vs" story (Bet 1 + stakes #1–2):** a comparison page fed by the existing bench harness — codeweb vs grep vs native LSP vs a code-graph MCP server, numbers CI-gated — plus listing codeweb in the MCP directories/registries and shipping the missing `marketplace.json`. Effort S–M; attacks the 155-downloads/week problem directly.
2. **Reposition around the agent-edit safety gate (Bet 3):** site + README lead with simulate → hook → CI Action; the PR comment becomes the referral surface. Effort M; occupies CodeScene's paid position free, in the one lane LSP can't absorb.
3. **Claim the human map (Bet 2):** `--serve` for headless sessions + attribution footer on report/demo; market "the Sourcetrail for the agent era". Effort S–M; converts the arena's only real visualization into an acquisition loop.
4. *(Longer lever, sequenced after 1–3)* **C/C++ on the trusted-grammar path (stake #3)** — closes the loudest "does it support X?" gap against Serena/CGC/CodeScene. Effort L.
