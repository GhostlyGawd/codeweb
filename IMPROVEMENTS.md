# codeweb — Product Improvement Discovery

**Date:** 2026-07-20 · **Scope:** every product surface — engine, CLI, MCP, hooks, report.html, VS Code extension, website/docs, CI action — through 12 lenses (UI, UX, onboarding, friendliness, helpfulness, feedback, retention, engagement, community, synergies, debt, reach).

**Method:** read-only discovery. Five parallel deep audits (report UI · CLI/MCP · plugin/hooks/skills · site/docs/.github · editor/tests/bench) plus dogfood runs: full pipeline on codeweb itself (1,168 nodes, 12 domains, 2s), `hotspots`/`deadcode`/`campaign`/`brief`/`find`/`explain` on the self-map, the full test suite (499 tests), npm-registry and VS Code Marketplace reachability checks, and GitHub issue/PR review. Every claim below carries `path:line` evidence from this working tree.

---

## What changed since the last review

`PRODUCT-REVIEW.md` (2026-07-18; archived during implementation to `docs/product-review-2026-07-18.md`) was the previous discovery pass. Its verdict has aged remarkably well — **its entire P0→P3 roadmap shipped** in v0.8.0/v0.9.0 and re-measured honestly (`docs/product-review-2026-07-18.md:231-273`, `CHANGELOG.md:14-116`): budgeted MCP responses, `mcpServers` auto-registration, role tagging with product-scoped overlap, staleness detection + auto-refresh, the pre-edit card, report a11y/deep-links/editor-links, 24 tools, six languages of AST dispatch, and the budgeted pilot re-run (+0.31 recall at equal cost). Specs K–P landed after v0.9.0 (scale receipts, LSH overlap, stage memoization, daemon NO-GO → 52ms sidecar).

Three consequences frame this report:

1. **The old review is now itself stale product copy.** Its body still says "plugin.json wires only hooks — no mcpServers … the #1 adoption cliff" and "20 tools" (`docs/product-review-2026-07-18.md:23,97`) — both fixed. It reads as current at repo root; it should be archived the way `paper/` was (precedent: commit `c423b83`). *(Done during implementation: `docs/product-review-2026-07-18.md`.)*
2. **The easy wins moved.** The interface-layer problems of July 18 are gone; what's left is a *consistency* layer: the role model, the shared CLI harness, the gate digest, and the staleness system each exist but are wired into only some of the surfaces that need them.
3. **Two engine debts are already on the team's own books** — Spec Q (flask Python import edges, `docs/specs/flask-python-import-edges.md`) and the 4.2s post-edit hook at 16k symbols (`docs/decisions/fastpath-daemon.md:49-54`). This report ranks them rather than re-discovers them.

---

## 1. Product snapshot

codeweb is a zero-dependency, deterministic call/import-graph engine that ships five ways: a Claude Code plugin (3 hooks + `/codeweb` command + skill), an npm CLI (`npx @ghostlygawd/codeweb` — live at 0.9.0, verified against the registry), a 24-tool MCP stdio server for any agent, a self-contained interactive `report.html` for humans, and a CodeLens VS Code extension (release-attached `.vsix`; Marketplace publish still token-gated — the Marketplace URL 404s today). Its users are coding agents first — the pitch is "your agent greps; codeweb knows" — and the humans reviewing those agents second. The journey: install plugin or npx → `/codeweb` maps a repo in seconds → agents get budgeted structural answers (callers/impact/context/explain) with staleness auto-refresh, humans get the map, findings, treemap, and matrix → hooks make it ambient (session brief with a monthly value receipt, a ~52ms pre-edit blast-radius card, a post-edit regression check) → `ci-gate` turns it into a team-wide PR gate. The engineering culture is exceptional — pre-registered benchmarks as CI gates (`bench/budgets.json`), nulls published, decision receipts for every NO-GO — and the remaining product gap is not capability but *evenness*: each good idea (roles, budgets, staleness, the shared CLI harness, the gate digest) is fully applied on one surface and absent on its siblings.

---

## 2. Opportunity map (impact × effort)

| | **S — hours→a day** | **M — days** | **L — a week+** |
|---|---|---|---|
| **High impact** | #1 empty-repo guard · #2 symbol-not-found next step · #3 agent-routing & tool-count doc rot | #6 role-aware rankers + entrypoint-aware deadcode · #11 MCP loop completion + map progress | #13 coverage→symbol pre-flight · #14 Ruby/PHP/Kotlin/Swift dispatch |
| **Medium impact** | #4 red-suite skip guard · #5 CLI front door | #7 VS Code lens truthfulness · #8 report = pipeline truth + shareable state · #10 retention receipt & staleness nudge · #12 Spec Q flask edges · #15 gate-as-reviewer for adopters | — |
| **Lower impact** | (extras: hygiene batch, below) | #9 report inclusivity & polish | — |

---

## 3. Top 5 quick wins (~a day each)

1. **#1 Stop succeeding on empty maps** — an unsupported or wrong path today produces a green "done" and a blank report; say what happened and what to try.
2. **#2 Symbol-not-found should teach `codeweb_find`** — the most common agent error gets a bare `found:false` while graph-not-found gets a helpful pointer; copy the pattern.
3. **#3 One doc-rot sweep + a wider consistency gate** — the command file steers agents off the fast path for 8 of 11 languages, the site still says "20 tools" in six places, README's demo numbers are stale, and `[Unreleased]` is empty despite Specs K–P being on main.
4. **#4 Re-green `npm test` on a fresh clone** — one missing tree-sitter skip guard fails the suite on the zero-dependency path the README celebrates.
5. **#5 CLI front door** — `codeweb --help` currently errors; bare `npm run stats` dies even though the auto-discovery helper sits 30 lines below the loader that ignores it.

## Top 3 big bets

1. **#13 Coverage→symbol mapping + edit pre-flight** — the roadmap's Phase-4 mechanism ("does not exist yet"), turning the pre-edit card and `codeweb_tests` from heuristics into measured "these N tests cover what you're touching."
2. **#14 Finish the dispatch tier for Ruby/PHP/Kotlin/Swift** — the four regex-only languages carry corrupted complexity/hotspot rankings and missing method edges by the spike's own evidence.
3. **#15 Gate-as-reviewer for adopters** — codeweb's own PRs get a sticky structural-review comment; the reusable action gives everyone else only a red ✗. Ship the digest to adopters and every gated PR becomes a codeweb advertisement.

---

## 4. Full list

### #1 · Empty/unsupported target still reports success — **FIX** · Feedback & state
- **Evidence:** `extract-symbols.mjs` has no zero-source guard — it happily emits `0 symbols … from 0 files` (banner at `scripts/extract-symbols.mjs:1305`); `run.mjs` then prints `[run] done` and writes a blank `report.html` (`scripts/run.mjs:99-100`). Pointing codeweb at an empty dir, a COBOL repo, or a typo'd path yields a green run and an empty map.
- **Proposal:** when 0 supported files (or 0 symbols) are found, exit non-zero with: the path scanned, the 11 supported languages (`scripts/lib/cli.mjs:62` `SRC_RE`), and a "is this the right directory?" hint; surface the same message through `codeweb_map`. Add `--allow-empty` for intentional cases.
- **Why it matters:** this is the very first impression for every mis-aimed install, and today it's a silent lie — the exact "trust" failure the rest of the product is engineered against.
- **Effort S · Impact H · Risk:** CI consumers mapping intentionally-sparse dirs — the flag covers it.

### #2 · Symbol-not-found returns a dead end — **IMPROVE** · Helpfulness
- **Evidence:** `scripts/lib/query-core.mjs:40,51,67` return bare `{ found:false }`; the CLI dies with `symbol not found: X` (`scripts/query.mjs:70`). Contrast the graph-missing path, which appends "call codeweb_map" (`scripts/mcp-server.mjs:340`), and staleness, which appends "run codeweb_refresh". The most frequent agent mistake is the one case with no next step.
- **Proposal:** on miss, append `try codeweb_find "<term>"` plus up to 3 near-matches from the existing `byName`/label index — same budget discipline as everything else.
- **Why it matters:** agents retry blind or fall back to grep — the exact behavior codeweb exists to replace. Cheapest agent-UX win left.
- **Effort S · Impact H · Risk:** none meaningful.

### #3 · Doc rot that actively mis-routes agents (and the site's headline number) — **FIX** · Helpfulness / Fixes
- **Evidence:** `commands/codeweb.md:46` tells agents to prefer the fast path only for "JavaScript/TypeScript/Python" — the engine natively handles 11 languages (`scripts/extract-symbols.mjs:1271`), so Go/Rust/Java/C#/Ruby/PHP/Kotlin/Swift repos get sent to the slow agent-fallback path. Same file documents `--engine hybrid|read|tools`, `--focus`, `--depth` — none parsed by `run.mjs` (`scripts/run.mjs:28-35`). `skills/codebase-anatomy/references/engine-detection.md:7-10` says 5 languages and omits the shipped tree-sitter tier. The dissector agent's schema omits `complexity`/`maxDepth` (`agents/codeweb-dissector.md:44`). The site still says **"20 tools"** in the hero, product page, start CTA, and two `og:description`s (`site/content/index.html:6,45,110,150`, `site/content/product.html:5,9`, `site/content/start.html:94`, `site/build.mjs:140,209-210`), and the research ledger claims "20 / 20 tools" parity (`site/data/product.json:374`) backed by a receipt that tested 20 of the 24 (`bench/results/auxiliary.json:132`). README's axios headline says 334 symbols/11 areas vs the regenerated demo's 274/8 (`README.md:49` vs `docs/case-study-axios.md:17`). `CHANGELOG.md:10-12` `[Unreleased]` says "Nothing yet" while Specs K–P sit on main — the next `npm run release` would throw "nothing to release" (`scripts/release-utils.mjs:145`). `docs/backlog-ast-tree-sitter.md:4-6` still claims the AST tier is "nothing wired" (it's shipped and default-on).
- **Proposal:** one sweep to fix all of the above, then extend `check-consistency` (`scripts/release-utils.mjs:80-123`) to also grep prose surfaces for `\d+ tools` and the language count, and re-run the parity receipt at 24 — so this class can't recur. Fold in archiving `PRODUCT-REVIEW.md` (done — now `docs/product-review-2026-07-18.md`, with stale-claim header).
- **Why it matters:** the command file is read by every agent on every `/codeweb` run — mis-routing 8 of 11 languages wastes exactly the tokens the product promises to save. And a repo whose ethos is "claims physically can't rot" currently has its headline tool count rotted on its own homepage.
- **Effort S · Impact H · Risk:** none — pure truth reconciliation, gated afterward.

### #4 · `npm test` is red on a fresh zero-dep clone — **FIX** · Fixes & felt debt
- **Evidence:** 499 tests: 460 pass, **1 fail**, 38 skip. The failure: `N6: Signal C near-miss clones` (`tests/overlap-lsh.test.mjs:98`) asserts Type-3 findings, which are AST-tier-only — every sibling AST test carries `{ skip: hasEngine ? false : 'tree-sitter unavailable' }` (`tests/type3-clones.test.mjs:73`); N6 doesn't. Without the optional `web-tree-sitter` (the README's proud "zero dependencies, just Node" path), the suite fails.
- **Proposal:** add the same guard (or make N6's LSH-vs-exact comparison engine-agnostic by asserting equality of the two paths rather than a non-empty finding).
- **Why it matters:** a contributor's first `git clone && npm test` ends red; CI hides it because CI installs the optional dep. Trust artifact for a trust product.
- **Effort S · Impact M · Risk:** none.

### #5 · CLI front door: help, discovery, exit codes, and the missing "now open it" — **IMPROVE** · Friendliness
- **Evidence:** `codeweb --help` → `[run] target not found: …/--help` (unknown tokens become the target, `scripts/run.mjs:34-41`); `--open`/`--full` are parsed but absent from the usage string (`run.mjs:36`). `loadGraph` resolves only explicit arg or `CODEWEB_WS` (`scripts/lib/cli.mjs:44-52`) while `findTarget` — the walk-up auto-discovery the hooks and MCP server use — sits unused 30 lines below (`cli.mjs:66-76`); result: the README-advertised bare `npm run stats` dies with a usage error. Exit codes violate the documented 0/1/2 convention in exactly the three scripts a first-timer touches (`run.mjs:36,41,62`, `extract-symbols.mjs:59,69,71`, `build-report.mjs:37,45,96`). On success, `run.mjs` lists six file paths but never says "open report.html" and never auto-opens without the undocumented `--open` (`run.mjs:99-100`). Each script hand-rolls its own argv loop despite `lib/cli.mjs`'s charter (`cli.mjs:2-3`).
- **Proposal:** shared arg parser + `--help` in `lib/cli.mjs`; `loadGraph` falls back to `findTarget(cwd)` (printing which graph it picked); normalize the three scripts' exit codes; success message ends with `open <ws>/report.html` plus the current stats receipt line.
- **Why it matters:** these are the first five minutes of every non-plugin user's life with the product; the pieces to fix it already exist in the same file.
- **Effort S · Impact M · Risk:** auto-discovery picking an unexpected graph — mitigated by printing the choice.

### #6 · Role-aware rankers + entrypoint-aware deadcode — **IMPROVE** · Synergies / Helpfulness
- **Evidence:** only `overlap.mjs` consumes the role model (grep across `scripts/{hotspots,risk,deadcode,campaign}.mjs` + libs: zero role references). Dogfood proof on codeweb's own map: **hotspots top-10 contains five test helpers** (`tests/helpers.mjs:runNode` fan-in 109, `script` 103, `tmpDir` 94…) and the *generated* website bundle `docs/assets/livemap.js` — despite the repo's own `codeweb.rules.json:3-5` marking `docs/**` as `generated`. `deadcode`'s **"safe to delete" tier lists the VS Code extension's `activate`/`deactivate`/`provideCodeLenses`** (host-invoked API entry points) and live closure helpers (`scripts/lib/cli.mjs:bodyOf`, `scripts/lib/complexity.mjs:strip`); `campaign` inherits all of it as DELETE steps with claimed gate-green ROI (51 of 55 self-steps) — the same false-orphan class the changelog itself had to hand-skip ("the 65 DELETE steps are honestly skipped as false orphans", `CHANGELOG.md:60-64`).
- **Proposal:** (a) rankers default to product scope with `--all` opt-out and an excluded-count line, exactly like overlap already does (`scripts/overlap.mjs:113` `CODEWEB_ALL_ROLES`); (b) deadcode learns *manifest entrypoints* — `package.json` `bin`/`main`/`exports`, VS Code `contributes`/`activationEvents`, `hooks/hooks.json` commands, workflow-invoked scripts — and demotes returned-closure members to review; campaign inherits both.
- **Why it matters:** this is the vite-playground precision lesson (the last review's biggest finding), applied to only 1 of the 5 ranked surfaces. Top-N trust is the product's core promise; today three flagship advisors rank noise first *on codeweb itself*.
- **Effort M · Impact H · Risk:** over-filtering hides real issues — mitigate with the counted-exclusions pattern overlap already established.

### #7 · VS Code lens: stale-by-design and 2 languages short — **FIX** · UI / Reach
- **Evidence:** `editor/vscode-codeweb/README.md:10-11` claims "the lens re-reads the graph on change," but there is no `FileSystemWatcher` and no `onDidChangeCodeLenses` emitter (grep: zero matches) — lenses stay stale after `codeweb_refresh`/re-maps until the file is reopened. The language selector registers 9 languages (`editor/vscode-codeweb/extension.js:61`) vs the engine's 11 — `.rb/.php/.kt/.swift` files never get lenses even when their symbols are in the graph. No hover, no caller peek; the one command opens the report in an external browser (`extension.js:65-72`).
- **Proposal:** watch `.codeweb/graph.json` + fire the CodeLens change event; add the four missing languages; a manual "codeweb: refresh lenses" command. Stretch: a hover card rendering the existing explain data (signature, fan-in, blast, reliance notes) — the engine already computes all of it (`scripts/lib/reliance.mjs`).
- **Why it matters:** the extension is the only ambient *human* surface; a lens that silently shows yesterday's caller counts contradicts the freshness discipline the MCP side just shipped.
- **Effort M · Impact M · Risk:** watcher churn on rapid re-maps — debounce.

### #8 · The report should render the pipeline's own findings — and be shareable — **IMPROVE** · UX / Community
- **Evidence:** the template loads `G.overlaps` and never uses it (`scripts/report-template.html:153`); the Findings tab **recomputes duplicates client-side** (`report-template.html:200-237`), so the tiered, body-confirmed, suppression-aware findings in `overlap.md`/`optimize.md` (ready/blocked/review, dismissed-with-reason) never reach the interactive view — the two surfaces can disagree. Deep links carry only a node (`#s=`, `report-template.html:713-726`) and force the Graph tab — you cannot link "look at the Matrix" or a specific finding; no copy-link/export affordance exists (grep: no `clipboard`/`toBlob`/`download`); a hosted report has no OG/description metadata (`report-template.html:6`).
- **Proposal:** Findings renders `graph.overlaps[]` (tier badges, confidence, suppressed count) as the single truth; hash schema grows to `#tab=…&s=…&roles=…` with a copy-link button; minimal `og:` tags stamped at build time.
- **Why it matters:** the report is where humans decide to act and the natural artifact to paste into a PR or team chat — today the flagship findings aren't in it and the URL loses your place. Shareable findings are the cheapest community loop this product can have.
- **Effort M · Impact M-H · Risk:** template weight — the render caps pattern (`report-template.html:353,364`) already exists to hold the line.

### #9 · Report inclusivity & polish batch — **IMPROVE** · UI & beauty / Friendliness / Reach
- **Evidence:** dark-only — `:root` hardcodes the palette, no `prefers-color-scheme`, no toggle (`report-template.html:14-21`); no `@media print` (only the 760px breakpoint, `:94`). The sole `:focus` rule *removes* the outline (`#gsearch:focus{outline:none}`, `:86`) and there is no `:focus-visible` anywhere, so every hover affordance (`:33,45,56,69,77,89`) has no keyboard equivalent. Matrix cells and treemap boxes are click-only (`:420,486`); tabs lack `role="tabpanel"`/`aria-controls`/arrow-key roving. Small bugs: `var(--hi)` is used but never defined, so the "duplicated" tag silently loses its emphasis (`:326`); the treemap re-renders on every tab visit while siblings cache (`:677`); the search count collides with the shrunken mobile search box (`:110,137`); the editor-root picker is a native `prompt()` (`:276`).
- **Proposal:** light theme via `prefers-color-scheme` + toggle; a print stylesheet; `:focus-visible` parity with every hover rule; keyboard + ARIA completion for matrix/treemap/tabs; the four small fixes.
- **Why it matters:** the report is the product's face in screenshots, demos, and PR links; the last a11y pass got it from zero to real — this closes the half that's left and makes it presentable in light-mode contexts (docs, printouts, projectors).
- **Effort M · Impact M · Risk:** low; pin with the existing `report-scale` bench.

### #10 · Make the value receipt felt (retention) — **IMPROVE** · Retention / Engagement
- **Evidence:** the "codeweb this month" receipt renders only the current calendar-month bucket and hides entirely when empty (`scripts/lib/stats.mjs:87-92`, `scripts/lib/brief-core.mjs:81-89`) — so every new user and every month-start shows nothing. The brief never states graph age (`generatedAt` is captured, never rendered — `brief-core.mjs:51`), and hooks never refresh (auto-refresh is MCP-only, `scripts/mcp-server.mjs:270`) — an edit-only user's map silently drifts for weeks. The post-edit check prints only when a regression fires (`hooks/post-edit-diff.mjs:75-79`); the trust-building "checked, all clear ×N" denominator lives only in the ledger. `queriesServed` counts MCP but not CLI use (`mcp-server.mjs:269`), and nothing after `run.mjs` ever mentions the receipt.
- **Proposal:** rolling-30-days + lifetime receipt line (never empty after first use); brief adds "map built N days ago — `codeweb_refresh`" past a threshold; `run.mjs` success prints the receipt; count CLI queries; consider a `codeweb_stats` MCP tool so agents can cite the receipt.
- **Why it matters:** the retention loop (brief → cards → gate) is genuinely built and instrumented — including the clever advice-followed correlation (`scripts/lib/stats.mjs:44-76`) — but its evidence of value is nearly invisible. Habit needs the receipt to show up where the user already is.
- **Effort M · Impact M · Risk:** noise — keep everything to single lines.

### #11 · Complete the agent loop over MCP + map progress — **IMPROVE** · Helpfulness / Synergies
- **Evidence:** 24 tools ship, but the loop's last steps are CLI-only: `simulate-edit` (pre-flight a delete/merge/move), `annotate` (record a false-positive suppression), `stats`, and `trend` have no MCP counterpart (grep of `scripts/mcp-server.mjs` TOOLS). An agent can *receive* findings but cannot pre-flight its plan or file a suppression without shelling out. `codeweb_map` runs `spawnSync` with a 300s ceiling, discarding the pipeline's stage progress and returning nothing until done (`scripts/mcp-server.mjs:234-236`) — on a big first map the agent stares at a black box (extraction itself prints only a final banner, `scripts/extract-symbols.mjs:1305-1307`). The MCP/CLI parity receipt predates 4 of the 24 tools (`bench/results/auxiliary.json:132` "toolsList=20").
- **Proposal:** add `codeweb_simulate` and `codeweb_annotate` (plan-only discipline like `codemod`); emit MCP progress notifications from `handleMap` stage lines; refresh the parity receipt at 24.
- **Why it matters:** pre-flight-then-edit is the product's own recommended loop (`mcp-server.mjs:45-53` instructions) — today an MCP-only agent literally cannot follow it end to end.
- **Effort M · Impact M-H · Risk:** tool-count creep — keep descriptions budgeted; the count gate already watches the number.

### #12 · Spec Q: flask Python import-edge regression — **FIX** · Fixes & felt debt
- **Evidence:** `docs/specs/flask-python-import-edges.md` (titled "open"): `render_template` resolves 7 dependents vs the frozen truth's 26; module-level `from flask import …` sites, the `__init__.py` re-export, and pytest call sites are missing. It was the only per-task recall loss in the Spec-M pilot and is publicly carried as a caveat on the research page (`site/content/research.html:56`).
- **Proposal:** execute the spec's own contract — bisect `c892f50` vs v0.9.0 first (a "truth got stricter" verdict is a valid close), else TDD the Python import-resolution fix and re-run the pre-flight.
- **Why it matters:** Python is a headline language and this is the one known place the engine under-serves it — with the fix contract already written, it's the highest-confidence engine work available.
- **Effort M · Impact M · Risk:** the bisect may show a re-label, not a bug — the spec explicitly permits that outcome.

### #13 · Coverage→symbol mapping + edit pre-flight (Phase 4) — **NEW** · Helpfulness / Retention
- **Evidence:** `docs/ROADMAP.md:96-100`: Phase 4's blast-radius pre-flight is the "highest upside" item and "coverage→symbol mapping is new" — it doesn't exist. Today `codeweb_tests`/the pre-edit card infer covering tests from `test`-kind call edges (name/path heuristics with documented caveats, `scripts/lib/query-core.mjs:19-28`).
- **Proposal:** optional ingest of lcov/c8 output (`--coverage <file>`, mirroring how `--churn`/`--git` are optional inputs) stamping measured coverage onto nodes; `codeweb_tests`/`explain`/the pre-edit card then say "N tests **measured** to execute this symbol — run these after the edit," with heuristic fallback unchanged. This is the substrate H23/H24 (fewer broken downstream tests, behavioral uptake) need.
- **Why it matters:** it converts the pre-edit card from awareness to *action* ("run exactly these"), directly attacks the north-star gap (edit-quality effectiveness, the one unproven leg — `docs/ROADMAP.md:8-16`), and is the action layer the auto-fix bot needs.
- **Effort L · Impact H · Risk:** coverage formats/staleness vary — treat as optional, provenance-stamped input, never a silent default.

### #14 · Ruby/PHP/Kotlin/Swift join the dispatch tier — **NEW** · Reach / Fixes
- **Evidence:** the AST tier's language key resolves those four to `null` (`scripts/extract-symbols.mjs:592-593`) — no dispatch edges, regex-approximate complexity. The spike's own measurement showed regex complexity diverges on 60% of symbols in both directions ("ranking is corrupted, not just noisy", `spike/tree-sitter/GO-NO-GO.md:32-46`), so hotspot/risk/reading-order rankings for these ecosystems inherit that corruption, and `self.m()`-style calls surface as false orphans. The README roadmap already names this "the next increment" (`README.md:544-548`); grammars exist in the same `@vscode/tree-sitter-wasm` family the vendoring playbook covers (`scripts/grammars/PROVENANCE.md`).
- **Proposal:** four Spec-F-pattern walkers (the Python/Go/Rust dispatch spec is the template, `docs/specs/dispatch-py-go-rust.md`) + the extension selector fix (#7) + verification on the Spec-I corpus repos (sinatra, monolog, okio, Alamofire).
- **Why it matters:** "eleven native languages" is the reach headline; making four of them second-class in exactly the rankings users act on is a quiet trust tax on every Rails/Laravel/Android/iOS repo.
- **Effort L · Impact M-H · Risk:** grammar ABI pinning — the trap is already documented (`PROVENANCE.md`).

### #15 · Gate-as-reviewer for adopters — **NEW** · Community / Synergies
- **Evidence:** codeweb's own repo posts the structural review as a **sticky PR comment** — delta, renames, findings — on every `scripts/**` PR (`.github/workflows/codeweb-gate.yml:5,30-43`, digest from `scripts/lib/gate-md.mjs`, `ci-gate.mjs:72-77` `--md`). The reusable composite action third parties consume (`.github/actions/codeweb-gate/action.yml`) runs the gate only — adopters get a red ✗ with no story.
- **Proposal:** an opt-in `comment: true` input on the composite action that posts/updates the same sticky digest via `GITHUB_TOKEN`; document the needed `pull-requests: write` permission; screenshot it in `docs/ci-gate.md` and the README.
- **Why it matters:** the digest is codeweb's value made visible to a whole team on every PR — reviewers who never installed anything see blast radius and structural deltas. It's the only viral surface the product has, and it's already built for one repo.
- **Effort M · Impact M-H · Risk:** token permissions in consumer repos — opt-in + clear docs; fork PRs get the check-only path automatically.

### Smaller notes (tracked, not counted)
- **Post-edit hook at scale:** 4.2s/edit at 16k symbols, full-target re-extract — already acknowledged with the honest fix named (baseline-fragment reuse) in `docs/decisions/fastpath-daemon.md:49-54`; schedule it behind #6/#11.
- **Publish reach (human-gated):** VS Code Marketplace (`VSCE_PAT`) — and OpenVSX, which Cursor/Windsurf users need — remain unconfigured; prep is done (`.github/workflows/release.yml:111-139`).
- **Community-health files:** no CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates, or CITATION.cff (notable for a research-backed project), and no `sitemap.xml`/`robots.txt` on the site.
- **Repo hygiene:** `spike/tree-sitter/` is complete/superseded (archive like `paper/` → `bench/`); `.live/rust-dissect.mjs` hard-codes a personal `D:/GitHub Projects/…` path and `.live/cli-sketch/` targets a different repo; `codeweb.rules.json` filename is overloaded between two incompatible schemas — extractor roles (`scripts/extract-symbols.mjs:67-68`) vs fitness rules (`scripts/fitness.mjs:32-37`), and running fitness here dies on the repo's own file; the repo dogfoods zero fitness rules.
- **Domain labeling legibility:** call-cohesion clustering shows `scripts/lib/shingles.mjs` under the `tests` domain in `find`/brief output — correct by construction, confusing to read; consider dir-anchored display labels for lib files.
- **`<module>` twin noise:** the self-map's optimize output leads with five `X and <module> call the same N% of helpers` REVIEW findings (ov7–ov12) — module-scope pseudo-nodes probably shouldn't seed twin findings.

---

## 5. Sequence — if only 3 ship first

1. **#3 doc-rot sweep + wider consistency gate** (S): it stops the product from actively mis-routing agents today, fixes the public "20 tools" understatement, unblocks the next release (`[Unreleased]` emptiness), and its gate extension makes the whole class unrepeatable. Highest truth-per-hour available.
2. **#6 role-aware rankers + entrypoint-aware deadcode** (M): top-N trust is the product's core promise, and three of five ranked surfaces currently lead with test helpers, generated bundles, and "delete the extension's entry points" *on codeweb's own map*. Everything downstream (campaign, the report's findings, #15's PR digest) inherits this precision.
3. **#1 + #2 as one first-touch trust bundle** (S): the empty-map lie and the symbol-not-found dead end are the two remaining places a new user or agent hits a wall in the first five minutes; both fixes reuse patterns that already exist (`NO_GRAPH` messaging, `codeweb_find`).

Rationale: all three cut friction on surfaces that already exist rather than adding net-new machinery, and each compounds — #3 routes agents onto the fast path, #6 makes what they find there trustworthy, #1/#2 keep the first session from ending early. The big bets (#13 especially) are where the roadmap's unproven leg gets attacked, but they deserve a dedicated spec cycle rather than the first slot.

---

*Discovery only — no product code was modified. Which items should be built?*
