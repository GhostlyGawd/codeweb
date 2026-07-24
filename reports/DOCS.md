# Documentation audit — 2026-07-24

First run (no prior `DOCS.md` existed). Method: the docs were **executed, not read** — every
install path, CLI invocation, hook, and MCP call below was actually run on this machine
(Node v22.22.2, npm 10.9.7, ripgrep present, ctags absent), against a scratch copy of the
bundled flask corpus and a minimal synthetic project. The repo tree was left untouched; all
generated workspaces went to a scratchpad.

**Scope.** User-facing docs: `README.md`, `CHANGELOG.md`, `SECURITY.md`, `OPERATOR-ACTIONS.md`,
`docs/` (both the .md guides and the built site), `commands/`, `skills/`, `agents/`, `hooks/`
descriptions, `tests/README.md`, `bench/README.md`, `editor/vscode-codeweb/README.md`,
`.claude/skills/release-tag/SKILL.md`, and inline code docs. The twelve root growth/audit
reports (`FUNNEL.md`, `CRO.md`, `SEO.md`, `PROOF.md`, `ACTIVATION.md`, `AI-IDEAS.md`,
`COMPETITIVE.md`, `IMPROVEMENTS.md`, `RETENTION.md`, `REVENUE.md`, `FORMS.md`, `CHECKOUT.md`)
are internal working reports, cited as context only — but see Gap 6 on the shelf-placement
problem they create. `bench/corpus/**` docs are vendored third-party corpus data, not project docs.

**Audiences.** (1) *End user* — a developer running the map/CLI: served by README + the site.
(2) *Coding agent* — the plugin/MCP consumer: served by `commands/`, `skills/`, `agents/`,
the MCP handshake `instructions`, and hook cards. (3) *New contributor*: served by
`tests/README.md`, `docs/specs/*`, CHANGELOG — no CONTRIBUTING doc exists. (4)
*Operator/maintainer*: served by `OPERATOR-ACTIONS.md`, `.claude/skills/release-tag/SKILL.md`,
`SECURITY.md`, `bench/README.md`.

---

## 1. Truth-test log (the README walk, divergences inline)

Steps follow README top-to-bottom. ✅ = ran exactly as documented. ❌ = diverged.

| # | Documented step | Result |
|---|---|---|
| 1 | Prereq "Node.js ≥ 22" | ✅ v22.22.2 accepted; `bin/codeweb.mjs` carries an old-syntax guard that refuses <22 with a sentence, as designed. But see divergence D6: `tests/README.md` says "Requires Node 18+". |
| 2 | Plugin install (`/plugin marketplace add …`) | ⚪ Not executable here (needs Claude Code UI). Verified statically instead: `.claude-plugin/marketplace.json` + `plugin.json` valid, hooks/commands/agents/skill files all present, `mcpServers` entry points at a real server. |
| 3 | `claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp` | ✅ underlying server verified over stdio: `initialize` returns `serverInfo 0.10.0` + non-empty `instructions`; `tools/list` returns **exactly 27 tools** — matches README/plugin.json/server.json/npm description. |
| 4 | `npx -y @ghostlygawd/codeweb .` in a project | ✅ npm registry served v0.10.0; full pipeline (extract → cluster → overlap → optimize → report) in 5.4 s on a 462-symbol Python tree; all six documented artifacts written under `.codeweb/`; prints next-step guidance. |
| 5 | Clone path, generic: `node codeweb/scripts/run.mjs /path/to/project` | ✅ works from a fresh `git clone`. |
| 6 | Clone path, sample: `node codeweb/scripts/run.mjs codeweb/bench/corpus/flask --out-dir /tmp/flask-map` — "kick the tires on **bundled** sample code first (no stakes, ~2s)" | ❌ **D1 — FIRST POINT OF FAILURE.** On a fresh clone: `[run] target not found: …/bench/corpus/flask`, exit 1. The corpus is **gitignored** (`bench/corpus/*/`; `git ls-files bench/corpus` = only `clone-corpus.sh`). Nothing is bundled; the error names no remedy; the remedy (`bench/corpus/clone-corpus.sh`) clones all six corpus repos, hardly "no stakes, ~2s". README.md:200–202. |
| 7 | Outputs table (`graph.json`, `report.html`, `report.md`, `overlap.md`, `optimize.md`, `fragment.json`) | ✅ all six present after every run. (Workspaces also contain undocumented sidecars: `brief.json`, `index-lite.json`, `hook-baseline.json`, `similar-index.json`, `.scan-cache.json`, `.stages.json`, `stats.json`, `history.jsonl` — harmless, but nothing names them; SECURITY.md's "caches and sidecars" umbrella covers them.) |
| 8 | `query.mjs --impact/--callers/--callees/--cycles/--orphans` | ✅ all answer; unknown symbol → exit 1 with near-miss suggestions; `--json` stable; exit codes 0/1/2 as documented. |
| 9 | `diff.mjs` gate: exits 1 on "new cycle, new duplication, or a symbol that **loses all its callers**" | ❌ **D2 — semantics overstated, and two shipped gates disagree.** Measured: an *unexported* symbol losing every incoming edge trips the gate (exit 1) ✔; an **exported** symbol losing all callers does **not** (exit 0) — `diffGraphs` keys on the orphan set (`scripts/lib/graph-ops.mjs:524-528`: no incoming edges of any kind AND `!n.exports`). Meanwhile `simulate-edit`/the post-edit hook use `structuralRegressions` (`graph-ops.mjs:560-563`), which flags ANY surviving symbol whose call-callers drop to zero, exported or not. Reproduced head-to-head on one minimal delete: `simulate-edit` printed **"projected gate: BLOCK — the gate would reject this edit (exit 1)"** while `diff.mjs` on the same before/after printed **"ok — no structural regressions"**, exit 0. Docs asserting the false equivalence: README.md:284-287 and 429-436, `docs/ci-gate.md:3-4`, `docs/agent-tools.md` SC2 ("same shape **and semantics** as the gate"), `diff.mjs:10-12` header, `bin/codeweb-diff.mjs:3` comment, `.github/actions/codeweb-gate/action.yml` description — and simulate-edit's own stdout. |
| 10 | `npm run bench -- <graph>` | ✅ runs, prints context-cost table; degrades exactly as documented when `typescript` is absent ("ungraded — typescript not resolvable … npm i typescript, or set TS_MODULE"). |
| 11 | `npm run stats` receipt | ✅ runs; explains counters accrue via hooks/MCP; names the `CODEWEB_NO_STATS=1` opt-out (which no standalone doc mentions — see Gap 2). |
| 12 | Advisors: `optimize`, `hotspots`, `campaign`, `reading-order`, `deadcode`, `break-cycles`, `risk`, `trend` | ✅ all eight run with the documented invocations and output shapes (ready/blocked/review tiers, weights lines, ROI steps, foundations-first order). |
| 13 | Agent tools: `context-pack`, `simulate-edit`, `find-similar`, `placement`, `review`, `fitness`, `refresh`, `annotate` | ✅ all run as documented (modulo D2 above). Note: README's `fitness` row cites `codeweb.rules.json`, but the repo's own file carries only `roles` config — the tool politely reports "0 rules configured" and how to add them. |
| 14 | Measured coverage: `node --test --experimental-test-coverage --test-reporter=lcov > lcov.info` then `coverage.mjs` | ✅ verbatim commands worked end-to-end on a minimal project: lcov produced, `3/3 instrumented symbols` annotated, `query --tests add` then answers from the recorded run. |
| 15 | MCP behavior claims (nearest-`.codeweb` discovery, budgeted replies, `summary` + true totals) | ✅ `codeweb_impact` answered in 219 bytes with `summary`/`matched`/`count`; `codeweb_brief` in 665 bytes; ledger counters visibly accrued. |
| 16 | Hooks (session brief ~2 KB; one-line pre-edit impact card) | ✅ simulated both with real hook-protocol stdin: SessionStart returned the ~1 KB day-one brief; PreToolUse returned the one-line card with per-file symbol/dependent counts and tool pointers. Fail-open confirmed (unmapped cwd → silent exit 0). |
| 17 | CI gate action (`GhostlyGawd/codeweb/.github/actions/codeweb-gate@main`, inputs `target`, `comment`) | ✅ `action.yml` exists with exactly those inputs (plus undocumented-in-README `codeweb-ref`); pins Node 22; `fetch-depth: 0` requirement stated in both README and `docs/ci-gate.md`. |
| 18 | `npm test` (tests/README) | ✅ **875 tests, 870 pass, 0 fail, 5 skipped** (~95 s) — skips are the documented environment skips (golden target absent, optional typescript). |
| 19 | `npm run check-consistency` / `version-sync` / `build:site` | ✅ check-consistency: "OK — v0.10.0, 27 tools, all surfaces aligned" (version-sync/build:site not run — they write tracked files; their outputs were verified fresh instead: site pages carry 0.10.0 + 27). |
| 20 | Live surfaces | ✅ all 8 GitHub Pages URLs return 200 (index, demo, research, support, start, product, case-study, changelog); site start-page install commands byte-match the README's. npm registry serves 0.10.0 (proved by step 4). All README-cited evidence files exist on disk (`bench/results/oracle-ab.json`, `bench/budgets.json`, `bench/experiments/efficiency-pilot.reps5-v090.json`, `bench/preregistration.md`). |

**Verdict on the walk:** every runnable surface works; the two failures are (D1) a
setup-blocking first-contact lie in the clone path and (D2) a semantic overstatement about the
product's central safety mechanism, which two shipped tools implement differently.

---

## 2. Fix-now list (actively wrong docs — correct or delete)

Ranked by who is blocked. Effort: S = a few lines, M = an hour, L = a design decision.

1. **README "bundled sample" clone command fails on every fresh clone** — `README.md:200-202`.
   `bench/corpus/flask` is gitignored, not bundled (`.gitignore:16`, `git ls-files`). The
   advertised zero-stakes first win exits 1. **Blocks: end user at setup.** Fix (S): make the
   sample self-hosting — `node codeweb/scripts/run.mjs codeweb/scripts --out-dir /tmp/codeweb-map`
   (mapping codeweb's own engine truly ships with the clone) — or document
   `bash codeweb/bench/corpus/clone-corpus.sh` first (honestly: it clones six repos).
   Ideally also teach `run.mjs`'s "target not found" error to mention the corpus script when the
   missing path is under `bench/corpus/`.
2. **Gate semantics: one sentence, three surfaces, two behaviors** — README.md:284-287 & 308-309,
   `docs/ci-gate.md:3-4`, `docs/agent-tools.md` (SC2 + "same subset the post-edit hook enforces"),
   header comments in `scripts/diff.mjs:10-12` and `bin/codeweb-diff.mjs:3`,
   `.github/actions/codeweb-gate/action.yml` description, and `simulate-edit`'s stdout
   ("the gate would reject this edit"). **Blocks: coding agents running the documented
   simulate → edit → gate loop (`commands/apply.md` step 3) with false blocks, and CI adopters
   with false confidence that exported symbols losing their last caller fail the build.**
   Fix (S for docs): state both conditions honestly — *diff/CI gate: symbol becomes an orphan
   (no incoming edges, not exported); hook/simulate: any surviving symbol loses its last
   call-caller — simulate is deliberately stricter than the gate*. Fix (L, optional): unify the
   two conditions in code; that is a product decision, not a doc edit.
3. **`docs/agent-tools.md` header: "the current surface … all exposed over MCP (22 tools)"** —
   27 ship. The file is marked historical yet makes a present-tense count claim. Root cause:
   the prose-count gate (`scripts/release-utils.mjs:49-58 PROSE_FILES`) does not sweep `docs/`,
   `tests/README.md`, or `editor/`. **Blocks: agent-integrators skimming specs.** Fix (S): drop
   the number ("see the README") and add the three files to `PROSE_FILES`.
4. **`tests/README.md`: "Requires Node 18+" and "the 5 tools"** — engines pin ≥22 and every bin
   refuses <22; the MCP suite covers a 27-tool server. A contributor on Node 18/20 following the
   test doc gets engine failures the doc says can't happen. **Blocks: new contributor.** Fix (S).
5. **README self-contradictions about its own pipeline** — prose says "chains five stages"
   (README.md:510) while the image alt text says "four deterministic stages" (README.md:514) and
   the numbered list has four (optimize, which `run.mjs` demonstrably runs and whose
   `optimize.md` output the very next table documents, is missing); `commands/codeweb.md:53-54`
   has it right. Same section's Components tree annotates `extract-symbols.mjs` with
   "(JS/TS/Python/Rust/Go)" (README.md:546) — the extractor handles 11 languages (verified via
   `lang-rules.mjs langOf`). **Blocks: new dev building a mental model.** Fix (S): add stage 4
   "Optimize", renumber render to 5, fix alt text and the tree annotation.
6. **`docs/backlog-ast-tree-sitter.md` links to a removed directory** — `../spike/tree-sitter/`
   and `../spike/tree-sitter/GO-NO-GO.md` (the only 2 broken relative links in all in-scope
   docs; `spike/` was removed in PR #56, and `codeweb.rules.json`'s own comment says so).
   **Blocks: contributor following the AST backlog.** Fix (S): point at git history
   (`git show <sha>:spike/...`), the pattern the repo already uses for the retired paper.
7. **`.claude/skills/release-tag/SKILL.md:33`: "`npm test` passes locally (~590 tests…)"** —
   875 today. A precondition number an operator eyeballs on release day. **Blocks: operator.**
   Fix (S): say "the full suite" or the CI count, not a literal.

**Delete candidates:** none outright — the wrong docs above are each one edit from true, and
everything else earned a pass. The closest call is `docs/agent-tools.md` (superseded spec):
if not fixed, delete it (git history keeps it) rather than let its header mislead.

---

## 3. Gap list (missing docs, ranked by blocked audience)

1. **Shipped-but-invisible CLI surface** — `codeweb-query` and `codeweb-diff` bins exist
   precisely to be the memorable quickstart path (their own headers say so), and `run.mjs`
   accepts `--serve` and `--stages through-overlap`; **zero mentions in README, docs/, site,
   or commands/** (grep-verified). Blocked: end users — these features functionally don't
   exist. One "CLI reference" block in the README fixes all four.
2. **Configuration reference** — shipped code reads **21 env vars**; only `CODEWEB_WS` is
   documented in a user-facing doc. Ten (`CODEWEB_NO_STATS`, `CODEWEB_ENGINE`,
   `CODEWEB_NO_AUTOREFRESH`, `CODEWEB_MCP_TRACE`, `CODEWEB_HOOK_INPROC`,
   `CODEWEB_VERIFY_FRESHNESS`, `CODEWEB_LSH`, `CODEWEB_OPT_SIM`, `CODEWEB_NAME_DELTA`,
   `TS_MODULE`) are findable only inside the 137 KB CHANGELOG; five (`CODEWEB_VERBOSE`,
   `CODEWEB_TIMING`, `CODEWEB_BIN`, `CODEWEB_CHROMIUM`, `CODEWEB_DEADCODE_LEGACY`) appear in
   **no doc at all**. `CODEWEB_NO_STATS` is a privacy lever and deserves a line in SECURITY.md.
   Blocked: operators and power users.
3. **Contributor onboarding** — no CONTRIBUTING.md; no doc says "how to make a change here"
   (branch → tests → check-consistency → the PR gates that CI actually enforces). The
   information exists, scattered across `tests/README.md`, the release skill, and ci.yml.
   Blocked: new contributor (highest-friction audience the project says it welcomes:
   "Issues and questions welcome", README.md:637).
4. **The architecture self-map** — README's Components tree covers `scripts/` well but omits
   `hooks/` (a headline feature), `bin/`, `site/`→`docs/` (the build relationship that explains
   why `docs/` holds HTML), `bench/`, `editor/`, and `.github/actions/`. A new dev cannot draw
   the whole system from docs alone; the biggest unexplained area is the 1,400-line extractor
   orchestrator + its `lib/` decomposition (currently narrated only inside CHANGELOG entries).
5. **`graph-schema.md` is missing fields the product leans on** — real nodes carry `role`
   (product/test/tooling/generated — the basis of report filtering, role-overrides in
   `codeweb.rules.json`, and the SKILL's handoff advice) and `signature`; real `meta` carries
   `root`, `sources`, `dynamic`, `overlapsDroppedAt`, etc. The skill calls this file "the exact
   JSON shape … **Read before dissecting**", and fallback dissector agents writing fragments
   would omit `role` today. Blocked: coding agents on the fallback path + graph.json consumers.
6. **A shelf label for the root reports** — twelve internal growth/ops reports sit beside
   README/SECURITY at the repo root with nothing marking them internal. A newcomer cannot tell
   `PROOF.md` (internal audit) from `SECURITY.md` (user contract) without opening them; two are
   already stale as facts (`CHECKOUT.md` predates `.github/FUNDING.yml`, which now exists).
   One paragraph in each (or a `docs/reports/` move + a README line) restores the signal.

---

## 4. Proposed doc map (what should exist — nothing aspirational)

| Doc | One line |
|---|---|
| `README.md` | The pitch + the three install paths + the three jobs, every command copy-paste-true (fix-now items 1, 2, 5). |
| `docs/cli.md` *(new, small)* | Every bin (`codeweb`, `codeweb-mcp`, `codeweb-query`, `codeweb-diff`), every `run.mjs` flag, every env var, exit codes — one table each (closes Gaps 1–2). |
| `CONTRIBUTING.md` *(new, one page)* | Clone → `npm test` → `npm run check-consistency` → PR; what CI gates; where specs live; link the release skill (closes Gap 3). |
| README Components section (or `docs/architecture.md`) | The full tree including hooks/, bin/, site→docs, bench/, editor/ + the extractor/lib decomposition (closes Gap 4). |
| `docs/ci-gate.md` | Keep — already the best-shaped doc; needs only the D2 honesty sentence. |
| `skills/codebase-anatomy/references/graph-schema.md` | Keep; add `role`, `signature`, and the real `meta` keys (closes Gap 5). |
| `CHANGELOG.md` | Keep exactly as is — 12 releases, dated, honest; the change-history lens passes with distinction. |
| `SECURITY.md` | Keep; add the `CODEWEB_NO_STATS` line. |
| `OPERATOR-ACTIONS.md` + `.claude/skills/release-tag/SKILL.md` | Keep — spot-checked true (server.json 0.10.0, repo-settings.json, FUNDING.yml, indexnow.yml all exist); fix the test-count literal. |
| `docs/agent-tools.md` | Fix header count + gate-equivalence claim, or delete in favor of agent-tools-v2. |
| Root growth reports | Not docs — label or move them so they stop impersonating docs (Gap 6). |

---

## 5. The first doc to write: `docs/cli.md` — the CLI & configuration reference

- **Bins table** — the four `package.json` bins with one-line jobs and one example each
  (`codeweb .`, `codeweb-mcp`, `codeweb-query <graph> --impact <sym>`, `codeweb-diff a b`);
  today two of the four are documented nowhere.
- **`run.mjs` flags table** — `--target`, `--out-dir`, `--open`, `--serve` (localhost report
  server), `--full`, `--allow-empty`, `--stages through-overlap`, `--coverage <lcov>` — source
  of truth `scripts/run.mjs:50-59`; four of eight currently undocumented.
- **Environment variables table** — all 21, grouped: workspace (`CODEWEB_WS`), privacy
  (`CODEWEB_NO_STATS`), engine (`CODEWEB_ENGINE`, `TS_MODULE`, `CODEWEB_LSH`), debug/perf
  (`CODEWEB_VERBOSE`, `CODEWEB_TIMING`, `CODEWEB_MCP_TRACE`, `CODEWEB_HOOK_INPROC`), test-only
  levers (pointer to `tests/README.md`).
- **Exit-code contract** — the 0/1/2 convention every CLI shares, and the two gate conditions
  stated honestly side by side (the D2 sentence lives here once, linked from README/ci-gate).
- **Kept true mechanically** — add this file to `PROSE_FILES` in `scripts/release-utils.mjs` so
  `check-consistency` (already in CI) fails the build when a flag/count drifts, the same way it
  already guards the README.
