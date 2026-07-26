# DEBT — tech debt map

Spring Cleaning · stage 3/4 · brief 13

**Date:** 2026-07-26 · read-only pass; this file is the only write. Fresh run (no prior DEBT.md).
Bounded by `CHARTER.md`: debt taken to honor an invariant (zero deps · deterministic, no LLM in
the loop · local, no telemetry · small agent answers · bench machinery as receipts, §9 · no new
language before grammar provenance) goes to the Accepted register with its section cited, not the
pay-down list. Cross-referenced, not re-derived: `reports/PRUNE.md` owns dead weight,
`reports/SIMPLIFY.md` owns the restated-idiom cluster; this report prices both and adds what an
economist's pass over churn and bug history finds beyond them.

## Top findings, ranked (plain words)

1. **This repo's debt is declaration debt, not the usual kinds.** Zero TODO/FIXME/HACK comments
   in code or prose (the one grep hit is the phrase "anti-reward-hack" in a test comment). Zero
   import cycles across all 41 `scripts/lib` modules (verified by DFS this pass). Near-zero dead
   code (PRUNE). One arg parser, one `die()`, one exit-code discipline across 34 of 40 CLIs
   (the other 6 take no flags or are declared monoliths). What's left is the same fact written in
   N places: each MCP tool's interface in **3** places, the sidecar freshness rule in **5**, the
   workspace walk-up in **4**, the identity copy on **12** surfaces (that one gated).
2. **The interest on declaration debt is already on the books.** `scripts/mcp-server.mjs` is the
   churn×complexity leader (20 edits × 883 LOC in a 90-commit repo) and the bug-fix hotspot:
   7–8 of its 20 edits are fix commits, and they are all one bug class — CLI↔MCP parity drift
   ("remedies stop crossing transports", "one pagination dialect", "the MCP transport rejects the
   mistakes the CLI rejects", "one gate verdict, five presenters", "one editDistance — codeweb's
   own gate caught the drifted copy"). Each fix unified one drifted *runtime* behavior; the
   *declarations* that keep minting the class are still triplicated (finding D1).
3. **The feature-trace receipt: new features are cheap in lines, wide in surface.** The newest
   sidecar feature (narration, `5a85059`) cost ~40 lines — but spread over 6 files, touched all
   three transports (CLI `brief.mjs`, MCP server, session hook), and minted the **5th** copy of
   the stamp-check loader SIMPLIFY counted. The per-feature tax is transport fan-out plus idiom
   restatement; both are priced below.
4. **One live charter violation is hiding where the gate can't see.** `scripts/run.mjs:329` still
   prints "sponsoring pays for its benchmarks" — the exact premise CHARTER C7 ruled **fabricated**
   on 2026-07-25 — in the shipped v0.12.0 banner. `check-consistency` scans files
   (`PROSE_FILES`, identity surfaces), never product stdout strings. Smallest principal in this
   report, highest urgency (D6).
5. **The rest of the classic lenses come back clean or already-owned:** tangles none;
   pattern inconsistency consolidated by the Clarity-program fixes; dead weight is PRUNE's short
   list; test design is the *opposite* of hostile (116 of 148 test files run in-process; the 31
   spawn-based suites are the declared "what ships is what's tested" trade, `tests/README.md`).
   The honest verdict matches SIMPLIFY's: a well-kept house whose one habit is restating rules
   instead of sharing them.

## 1 · Where debt concentrates

**Churn × complexity** (full-history edit count × current LOC; repo: 90 commits, 2026-07-19 →
2026-07-26, peak 37 commits on 07-24):

| file | edits | LOC | note |
|---|---|---|---|
| `scripts/mcp-server.mjs` | 20 | 883 | 7–8 fix commits — the parity-drift hotspot; 8 concerns in one file |
| `site/data/product.json` / `package.json` / `.claude-plugin/plugin.json` | 18 / 18 / 17 | — | the copy fan-out; version+count auto-synced (`version-sync.mjs`), identity line gated |
| `site/build.mjs` | 18 | 406 | copy-pipeline workhorse; churn tracks copy churn, not rot |
| `scripts/run.mjs` | 17 | 345 | orchestrator; 2–3 fixes; carries the D6 stdout claim |
| `scripts/report-template.html` | 15 | 1,270 | single-file HTML template; churn was the redesign, cooling since |
| `scripts/release-utils.mjs` | 15 | 313 | the sync/gate engine; +11 edits on its test |
| `scripts/lib/graph-ops.mjs` | 12 | 780 | fan-in **17** — the structural hub (highest blast radius in `lib/`) |
| `scripts/extract-symbols.mjs` | 10 | 1,141 | biggest product file; run-on-import monolith with an in-process door (`runExtract`) |
| `scripts/codemod.mjs` | 13 | 200 | 3 fixes — authority-language / gate-coupling class |

**TODO census: 0.** No TODO/FIXME/HACK/XXX in any tracked `.mjs/.js/.md` (single hit is prose).
Debt here is tracked as numbered findings in commit messages and docs (`#30`, `F14c`, `R11a`,
`H12`) — receipts culture instead of comment graffiti. Consequence for this map: nothing was
self-reported; everything below came from churn, history, and structure.

**Feature trace** (Batch 8 narration sidecar, `git show 5a85059`): `lib/narration.mjs` new
(25 LOC, restating the stamp rule), `brief-core.mjs` +6/−1, `brief.mjs` +1, `hooks/session-brief.mjs`
+3, `mcp-server.mjs` +3, `commands/narrate.md` new, plus contract tests. Pattern: any
brief-visible feature pays one line per transport (3×) and any new sidecar re-pays the loader
restatement — the exact two costs items D2/D3 retire.

**Build-output churn** (context for reviewers): 49 of 90 commits (54%) touch committed built
pages under `docs/` (5.1 MB). Deliberate GH-Pages model with a CI freshness gate — priced in the
Accepted register (A1), not the pay-down list.

## 2 · Debt inventory (item · interest paid · principal · evidence)

Lenses with nothing to charge: **tangles** (0 cycles, 41 modules, DFS-verified) ·
**pattern inconsistency** (one parser/one die/one pagination dialect — unified by the fix wave;
residual asymmetry is D4) · **outdated idioms** (ESM + `node:` prefixes throughout; no deprecated
APIs; the CommonJS editor extension is VS Code's requirement; ES5 bin shims are deliberate) ·
**test-hostile design** (in-process majority; the subprocess engine suites are a declared trade —
A3).

**D1 · Tool interfaces declared three times** — *duplication clusters / god files* — NEW this pass.
Every one of the 27 MCP tools states its interface in (a) its script's `parseArgs` spec
(e.g. `scripts/find.mjs` — `limit` default 10), (b) the `TOOLS` table in `mcp-server.mjs`
(`opt: ['graph','limit','offset','full'], budget: {…value: 10}` — same literals restated), and
(c) hand-written tables in `docs/cli.md`, whose header concedes the debt: "when something here
disagrees with `--help`, `--help` wins and this file has a bug."
**Interest:** the entire recorded parity bug class — at least 5 fix commits in week one
(`dd2ddbd`, `67e0f9f`, `1affe2e`, `5c81f8b`, `94238c1`); every new tool re-pays the triple entry;
every budget/default tweak is a 3-file change with drift risk; the gate checks tool *count*, not
tool *shape*.
**Principal:** M — one importable spec per tool (flags, defaults, budget, required args) read by
both the script's `parseArgs` call and the `TOOLS` table; `check-consistency` grows a
"table matches specs" assertion; the `docs/cli.md` flag tables become generated-or-gated.
Convertible tool-by-tool (the six `QUERY_KIND` tools share one shape — start there). Zero-dep,
deterministic, charter-clean.

**D2 · `mcp-server.mjs` is an everything-magnet** — *god files* — 883 LOC holding 8 concerns:
JSON-RPC plumbing, graph discovery, graph cache, staleness cache, auto-refresh policy, the
27-entry TOOLS table + schema generation, the per-workspace reader/writer queue, dispatch plus
two special-case handlers (`handleToolCall` alone spans ~line 604–822).
**Interest:** 20 edits and 7–8 fixes land in one file; every tool addition, budget change, and
queue tweak shares a review surface; the queue's I1–I7 invariants (Keep-listed by SIMPLIFY)
cohabit with copy strings.
**Principal:** M, and it halves after D1 (the table and schemas move out with the manifest;
queue + discovery/cache extract cleanly — `tests/mcp-queue.test.mjs` and
`tests/mcp-scenarios.test.mjs` already pin the queue's interleavings). Target: a ~300-LOC
protocol+dispatch core. The queue machinery itself stays as-is (SIMPLIFY Keep list).

**D3 · The restated infrastructure idioms** — *duplication clusters* — SIMPLIFY's inventory,
priced here: the sidecar stamp-check loader ×5 (`brief-sidecar`, `stale-stamps`, `narration`,
`similar-index`, `hooks/pre-edit-impact.mjs`), the `.codeweb` walk-up ×4 (`lib/cli.mjs:findTarget`,
2× `mcp-server.mjs`, `hooks/session-brief.mjs`), and the pre-edit hook fallback that re-parses the
multi-MB graph and spawns `explain.mjs` to parse it again.
**Interest:** the freshness contract can drift five ways (narration proves new sidecars keep
copying it); "which graph am I talking to" has four answers; the hook's slow path burns 2
processes + 2 full parses for a ~1 KB card.
**Principal:** S — ≈ −60 lines net across three small PRs, already scoped with the placement trap
called out (the shared loader must NOT live in `lib/sidecars.mjs` — that mints a cycle codeweb's
own gate flags). Cheapest real payoff in the ledger; also the rehearsal for D1's motion.

**D4 · `risk.mjs`/`hotspots.mjs` asymmetric split + banner prose-scrape** — *pattern
inconsistency, residue* — SIMPLIFY items 4–5: risk assembles its ranking inline in the CLI while
its sibling keeps `rankHotspots` in `lib/`; `run.mjs:242-249` regex-scrapes optimize's prose
stdout for the banner.
**Interest:** two answers to "where is a ranker ranked"; a wording tweak silently blanks banner
fields; `codeweb_risk` is blocked from an MCP in-process path.
**Principal:** S (move assembly to `lib/risk.mjs`; read optimize's `--json` totals). Opportunistic.

**D5 · Historic hotspot: `codemod.mjs`** — *historic hotspots* — 3 of 13 edits are fixes
(authority language, gate coupling; e.g. `379f8a6`). The only source-deleting surface in the
product.
**Interest:** small but concentrated on the highest-stakes tool.
**Principal:** none proposed — the fixes hold; flagging it as the file where review bar stays
highest. Watch item.

**D6 · A charter-ruled-fabricated claim ships in product stdout** — *drift debt, gate blind spot*
— `scripts/run.mjs:329` prints "codeweb is free — sponsoring pays for its benchmarks", the
premise C7 ruled fabricated (CHARTER, 2026-07-25); SIMPLIFY spotted it, this pass confirms it is
still live and adds the structural cause: `check-consistency` covers listed files, and no gate
covers claim-bearing strings in CLI output.
**Interest:** a ratified-false claim reaches every un-throttled `codeweb .` run in v0.12.0 — the
"no claim without a source" invariant is being violated in the shipped artifact today.
**Principal:** XS for the line (one-string copy fix — wording belongs to the operator / stage-4
drift audit per `CLAUDE.md`); S for the class (hoist user-facing claim strings into a module the
drift audit's surface list includes).

**D7 · Fossil `package-lock.json`** — *outdated idioms* — v0.9.0 metadata, old bin map,
`node >=20` floor, three releases stale (PRUNE finding 4).
**Interest:** 7 workflows `npm ci` against stale metadata; first local `npm install` will rewrite
it as diff noise in some unrelated PR.
**Principal:** XS — regenerate on a networked machine at the next release prep (the
`release-tag` skill moment PRUNE named).

**D8 · The self-gate cries wolf 29 times** — *dead weight adjacent* — `deadcode.mjs` on codeweb
itself reports 29 false positives, all `LANG_DISPATCH` dynamic dispatch in `lib/ts-engine.mjs`
(PRUNE finding 5).
**Interest:** dogfooding surface looks broken to any prospect who runs codeweb on codeweb, and a
noisy gate trains its owner to skim — the exact failure mode the product exists to prevent.
**Principal:** XS–S — the built-in `annotate.mjs --suppress` flow, 29 entries with one shared
note; no code change.

**D9 · PRUNE's deletion slate** — *dead weight* — 3 orphaned SVGs in `docs/assets/`, the 5-line
`stddev`, the write-only `site/data/benchmarks.json` mirror (operator call pending).
**Interest:** near-zero today; priced by PRUNE.
**Principal:** XS — ride PRUNE's commit; not re-sequenced here.

## 3 · Accepted debt register (real debt, deliberately not paid)

| # | debt | why accepted (charter citation) | revisit trigger |
|---|---|---|---|
| A1 | Committed build output: `docs/` (5.1 MB) in 54% of all commits | Serving equals committed — auditable, zero-infra GH Pages; a deploy pipeline adds moving parts against the local/zero-dep culture; CI freshness gate already pins staleness | Clone weight or review noise becomes a complaint; docs/ passes ~20 MB |
| A2 | CLI/MCP dual transports + spawned fallback; every brief-visible feature pays 3 touches | "What ships is what's tested" + measured fast-path wins (SIMPLIFY Keep list); payload parity held by shared `-core` libs | If parity fixes recur *after* D1 lands, the trade is mispriced — re-open |
| A3 | Engine stages (`cluster3`, `overlap`, `optimize`, `build-report`) are run-on-import monoliths, testable only by subprocess | Declared trade (`tests/README.md`): real-artifact testing, no mocks; determinism invariant lives on this spine; `extract-symbols` already grew `runExtract` where a hot path demanded it (#18b) | A hook/MCP path needs an in-process stage, or suite wall time becomes the bottleneck — librarify that stage then, precedent exists |
| A4 | `graph-ops.mjs` fan-in 17 — one hub every query feature leans on | Coherent single domain (graph primitives), directly unit-tested; splitting a true stdlib trades one hub for import sprawl | Fix density on it rises (today: edits 12, fixes ~0 — it is stable) |
| A5 | Copy fan-out across ~12 identity surfaces | Charter Done-looks-like #2 *mandates* the surfaces agree; `version-sync.mjs` writes version+count, the gate checks the rest — detection chosen over generation to keep manifests real files (zero-dep, no build step for package.json) | A copy sweep misses a *gated* surface (today's gap is the ungated stdout class — D6) |
| A6 | Parked A/B experiment harnesses, legacy A/B levers, bench machinery bulk | Charter §9 (receipts) + non-goal 7 (parked, operator-gated); PRUNE verified all 22 levers live | Charter changes the ruling |
| A7 | 1,270-line single-file `report-template.html` | The human report is a supporting view (charter §10 / C2); template churn was the redesign and is cooling; splitting risks the self-contained-artifact property | Sustained post-redesign churn returns |

## 4 · Refactor sequence (each step pays for itself and de-risks the next)

1. **D3a — one stamped-sidecar loader** (S): −35 lines, freshness rule 5→1. Payoff: the next
   sidecar can't drift; rehearses the shared-primitive motion for step 4. Fully scoped in §5.
2. **D3b — one workspace walk-up + in-process hook fallback** (S): −31 lines, one answer to
   "which graph", hook slow path drops a process and a multi-MB parse. Payoff: hook p95;
   `loadGraph` loses its fake-filename anchor trick. (SIMPLIFY items 2–3, with its variant
   preservation notes.)
3. **Chore ride-alongs at the next release** (XS): D7 lockfile regeneration + D8's 29
   suppressions + D9 deletions (PRUNE's slate, operator options pending). Payoff: clean gates and
   a clean gate *reputation* before the bigger diffs land — refactor PRs read pure.
4. **D1 — the tool-interface manifest** (M, the payoff step): per-tool spec consumed by both
   transports, gate-checked, docs tables generated-or-gated. Start with the six `QUERY_KIND`
   tools (one shared shape), then the long tail. Payoff: the week-one bug class loses its
   factory; new tools declare once.
5. **D2 — split `mcp-server.mjs`** (M, cheap *after* step 4): queue module (scenario tests
   already pin interleavings), discovery/cache module, protocol+dispatch core ~300 LOC. Payoff:
   the hotspot file stops being where everything lands; queue invariants get their own review
   surface.
6. **D4 — risk/hotspots symmetry + banner de-scrape** (S, opportunistic): unlocks an in-process
   `codeweb_risk` and retires the last prose coupling.

Standalone, not sequenced: **D6's one-line copy fix** goes to the operator / stage-4 drift audit
now — it is a claim correction, not a refactor, and `CLAUDE.md` routes public-claim wording
through the charter.

## 5 · The first refactor, fully scoped: one stamped-sidecar loader (D3a)

**Change:** add `scripts/lib/sidecar-stamp.mjs` (~15 lines): `loadStamped(absGraphPath, filename,
version)` — read JSON beside the graph, require `version` match and `stamp.graphMtimeMs`/`graphSize`
equal to one `statSync` of the graph, else null, always fail-open. Convert the five sites
(`lib/brief-sidecar.mjs`, `lib/stale-stamps.mjs`, `lib/narration.mjs`, `lib/similar-index.mjs`,
`hooks/pre-edit-impact.mjs:sidecarEntry`) to one-liners that keep their local semantics:
similar-index's `k` guard, the hook's undefined-vs-null contract. SIMPLIFY §4 has the
before/after.

**Placement rule (the one trap):** NOT in `lib/sidecars.mjs` — it imports the four sidecar libs,
so homing the loader there creates the import cycle codeweb's own gate flags. New module (or
`lib/common.mjs`).

**Tests to add first (red before the refactor):**
1. `tests/sidecar-stamp.test.mjs` — unit-pin `loadStamped`: fresh hit · stale mtime · stale size ·
   version mismatch · missing file · malformed JSON → each non-fresh case returns null, never throws.
2. One parity assertion per call site pinning today's behavior through the public surface —
   most exist already (`tests/brief.test.mjs`, `tests/hook-sidecar.test.mjs`,
   `tests/find-similar.test.mjs`, `tests/reach.test.mjs` for narration); add the missing
   stale-stamps case if uncovered.

**Land:** one commit for the module+tests, one per converted site (five small diffs, each
revertable alone).

**Verify:** `npm test` green · `node scripts/query.mjs .codeweb/graph.json --cycles` on a self-map
shows no new lib cycle · `git grep -c graphMtimeMs scripts/ hooks/` drops from 5 call-site
restatements to 1 definition + thin wrappers.

**Payoff story:** the freshness contract — the thing every sidecar's correctness hangs on — goes
from five hand-copies (still multiplying; narration was #5) to one function whose prose spec in
`sidecars.mjs` finally matches the code; and the team has rehearsed the exact motion step 4
scales up to the 27-tool manifest.

---

**Which refactor should I start?** (a) the first-scoped one — the stamped-sidecar loader (D3a),
tests first; (b) the whole idiom arc — steps 1–2 (loader + walk-up + in-process hook fallback);
(c) jump to the payoff — D1's tool-interface manifest, starting with the six QUERY_KIND tools;
(d) chores first — lockfile + 29 suppressions + PRUNE's slate in one clean-gates commit; or
(e) none yet — but rule on D6's one-line stdout claim now, since it violates a ratified charter
ruling in the shipped v0.12.0?
