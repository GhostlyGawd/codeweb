# PLAN — Product deep-dive & sequenced improvement plan

**Run date:** 2026-08-16 · **Method:** six parallel read-only area audits (core engine ·
agent surface · verification & evidence · growth surfaces · backlog & decision history ·
languages & integrations), synthesized into one combined report and one sequenced plan.
The codebase was untouched — this report is the only write. Baseline verified before the
run: `sh scripts/check` green at HEAD (895 pass / 0 fail, consistency OK v0.12.0/27 tools,
evals 2/2). Every recommendation is bounded by `CHARTER.md` (ratified 2026-07-25); every
decision the charter reserves is marked **Operator**. This is a standalone run, separate
from the two conductor runs indexed in `reports/INDEX.md`.

Finding ids: `ENG` core engine · `AGT` agent surface (MCP + plugin) · `VER` verification &
evidence · `GRW` growth surfaces · `LNG` languages & integrations · `BKL` backlog ledger
(which also carries forward `D*`/`L*` ids from `reports/DEBT.md` and the FIXLOG follow-ups).

---

## Part I — Combined report

### 1. Verdict in one paragraph

The house is in better shape than its own backlog says: nearly everything recommended
before 2026-07-25 has shipped, the July debt ledger is ~90% paid at HEAD (D1/D2/D3/D6–D9
all verified closed), and the engine's precision discipline is receipts-backed end to end.
The live problems are of a different kind. **Truth drift:** the charter-ruled-fabricated
C7 sponsorship premise still ships on three surfaces the claims gate cannot see, and the
headline receipts are fossilizing (bench results frozen 2026-07-23; the 44%→74% pilot was
measured on v0.9.0). **Loop completeness:** the before/after edit loop the identity
promises is fully wired only for Claude-hook users — pure-MCP clients cannot even complete
the after-edit diff as instructed. **Watchfulness:** no CI of any kind has executed in ~18
days, so the SPEC kill-criteria tripwires are dormant. **Distribution:** the funnel
machinery is built, but at ~79–92 downloads/wk (4.6% of the 2k trigger), 0 stars, and 0
external gate adopters — with the gate-Action trigger arm not even measured — the
bottleneck is announcement and doorway, not polish. The plan sequences accordingly: truth
first, loop second, trigger third, receipts-freshness fourth, and the recall bet plus the
charter's open **Next** pick packaged as decisions for the operator.

### 2. Corrections to the recorded backlog (verified at HEAD)

The audits verified the following as **done**, so no plan item re-proposes them:
D1 tool-interface manifest (`scripts/lib/tool-specs.mjs`, both transports + release gate);
D2 mcp-server split (`lib/mcp-queue.mjs`, `lib/mcp-graphs.mjs`); D3a/b stamped-sidecar
loader + workspace walk-up + in-process hook fallback; D6 stdout claim + claims-in-stdout
gate; D7–D9 (lockfile, LANG_DISPATCH suppressions — including the real deadcode
annotations-dir bug it exposed — PRUNE slate); the 2026-07-23/24 growth & clarity waves
(marketplace.json, server.json + automated MCP-registry publish, robots/sitemap/JSON-LD,
README install chooser, conversion footers, session-brief nudge, C4/C7-compliant
support copy); GitHub topics/description/homepage (live, verified via API this run).
Still open from the old ledgers, carried into Part II: **D4** (risk assembly in-lib +
optimize banner de-scrape), **D5** (codemod watch item — unchanged), **L1–L13**
(FIXLOG follow-ups), and the parked **P1–P3** proposals.

### 3. Distribution reality (the trigger, honestly)

Charter non-goal 5 parks Teams behind **>2k downloads/wk OR >10 external repos on the
gate Action**. Measured this run (2026-08-16, public APIs only):

- npm: ledger rows 310 (release week) → 75 → 79 (`bench/acquisition-ledger.jsonl`); live
  API for 2026-08-08→14: **92/wk — 4.6% of trigger**. Daily shape is release-spike +
  ~8–17/day baseline, i.e. mostly CI/bot retrievals.
- Gate Action: GitHub code search for `codeweb-gate` outside the home repo: **0 results**.
  The acquisition ledger does not record this arm at all
  (`.github/workflows/acquisition-ledger.yml:20-31`) — the trigger can never be observed
  firing (GRW-F2, LNG-F3).
- Repo: 0 stars, 0 forks, 0 watchers (created 2026-06-21).

Conclusion the plan is built on: conversion machinery is in place and the ahas are ~3s
away, but essentially nobody enters the funnel. The highest-leverage moves are the honest
launch (GRW-F1 — prerequisites verified met), the gate doorway (GRW-F4/LNG-F6), and
making the second trigger arm measurable (GRW-F2) — none of which are product rebuilds.

### 4. Claim-integrity ledger (the standing 150 · Drift Audit list)

Charter invariant: *no claim without a source*. Verified live at HEAD this run:

| # | Surface | Problem | Receipt |
|---|---|---|---|
| C-1 | `scripts/trend.mjs:174` | Prints "sponsoring pays for its benchmarks" — the exact premise charter C7 ruled **fabricated**, on the team-lead surface (5+ snapshots) | verified this run |
| C-2 | `scripts/report-template.html:1267` | Footer tooltip `title="sponsoring funds the benchmarks"` — ships in **every generated report** | verified this run |
| C-3 | `docs/demo/index.html:1280` | Same tooltip on the public demo | verified this run |
| C-4 | `.github/FUNDING.yml` comment | "The site's support page says what sponsorship funds" — stale cost framing | verified this run |
| C-5 | `docs/proposals/ai-spend-gated.md` Trigger | "when sponsorship … covers the bench line item" — funding premise survives under its own correction banner | verified this run |
| C-6 | `README.md:139-141` | "Agents that used grep needed ~5 rounds and 126× tokens" — receipt is a *simulated* grep loop, honestly labeled in the ledger, mis-attributed to agents here (VER-F6a) | audit |
| C-7 | `README.md:136` | 44%→74% carries no "(v0.9.0 pilot)" qualifier that the site headline and ledger carry (VER-F6b) | audit |
| C-8 | `docs/downloads.html:165` | Footer claims "zero third-party requests on this page" while the page fetches api.npmjs.org client-side (GRW-F9) | audit |
| C-9 | `docs/cli.md:55,67` | Env table: `CODEWEB_MCP_TRACE` documented as logging "every JSON-RPC frame" (code logs queue events only); `CODEWEB_BIN` documented as editor-link binary (code: bin-shim entry signal) (AGT-F8) | audit |
| C-10 | `README.md:262-263` | "A stale result identifies its state…" stated unqualified; true only for the orient family, not the spawned advisors (AGT-F3) | audit |
| C-11 | `docs/reference.md:285` | Extractor annotated "(JS/TS/Python/Rust/Go)" — five named where eleven ship (AGT-F11) | audit |
| C-12 | `README.md:3` | Banner alt still carries the retired pre-charter tagline (brand is free-to-change; align on next touch) (GRW-F12) | audit |
| C-13 | `docs/backlog-ast-tree-sitter.md:3-9` | Decision record says six grammars / six dispatch languages; HEAD has eight + Ruby/PHP (LNG-F11) | audit |
| C-14 | `bench/results/replay-tasks.json` | Receipt cites a vanished session-temp path (identity safely in SHAs); `ai-spend-gated.md` cites `bench/replay-ab.workflow.js` (actual: `bench/experiments/…`) (VER-F12) | audit |

Root cause, twice over: the sweep's blind spots. `PROSE_FILES` omits
`report-template.html`, `docs/demo/index.html`, `site/content/{support,case-study,downloads,changelog}.html`,
and `editor/`; the C7 cost-premise regex scans only `scripts/lib/product-copy.mjs`
(`scripts/release-utils.mjs:53-67, 286-290`). Fix the instances **and** the class (Phase 0).

### 5. Combined findings (deduped, ranked)

Impact and effort are the audits' ratings (S≤1d, M≤1wk, L>1wk). "Charter" is the
authorization status: **standing** = existing obligation/ruling covers it · **build** =
in-charter product work that should enter `SPEC.md` as operator-appended ACs ·
**Operator** = only the operator can decide/act.

| # | Finding | Source | Impact | Effort | Charter |
|---|---|---|---|---|---|
| 1 | C7 premise still shipping ×5 surfaces + sweep blind spots (Part I §4, C-1…C-5 + class fix) | GRW-F3/F6, VER-F5/F11, LNG-F8 | H | S | standing (charter-mandated) |
| 2 | After-edit gate incompletable over pure MCP: no snapshot step; `refresh` overwrites in place — non-Claude clients cannot run the prescribed loop | AGT-F1 (`mcp-server.mjs:58`, `refresh.mjs:80`, `commands/apply.md:34`) | H | S | build |
| 3 | Completest "who do I break" answer (`--dependents`: call∪import∪inherit∪test∪ref) is CLI-only — agents get call-edge `codeweb_callers` | AGT-F2 (`query.mjs:28`) | H | S | build |
| 4 | Advisors answer stale with full confidence: `AUTOREFRESH_TOOLS` covers orient family only; `simulate`/`deadcode` can plan deletions from a week-old map | AGT-F3 (`mcp-server.mjs:102`) | H | S–M | build |
| 5 | Non-Claude clients get 27 tools but not the loop: no per-client registration blocks, no rules-file equivalent of the hooks; several clients drop MCP `instructions` | AGT-F4/F12 | H | M | build |
| 6 | Gate-Action trigger arm unmeasured — add `gateReposExternal` (code search) to the weekly ledger | GRW-F2, LNG-F3 | H | S | build |
| 7 | Weekly vitals dormant: no CI executed in ~18 days; kill-criteria tripwires cannot trip; branch protection still unset | VER-F1 (`OPERATOR-ACTIONS.md` §7) | H | S | Operator (adopt proposal) |
| 8 | Claim *values* never checked against receipts (only existence + counts); README currently cites zero bench paths, so that leg is vacuous | VER-F4 (`claims-check.mjs:29-44`) | H | M | build |
| 9 | Headline receipts fossilized: bench/results frozen 2026-07-23; 44→74 measured on v0.9.0; no re-derivation rides releases; recall kill-criterion has no sensor | VER-F3, ENG-F4 | H | M | build + Operator (release process) |
| 10 | The honest launch moment: prerequisites (consistent numbers, install path, shelf presence) verified met; repo-side launch kit, operator posts | GRW-F1 (PROOF §4) | H | M (S repo-side) | Operator |
| 11 | JS/TS receiver-type recall ceiling: local instances, typed vars, property receivers untracked — the largest remaining missed-caller class | ENG-F2 (`edge-derive.mjs:250-272`, `ts-engine.mjs:68-82`) | H | L | build (Next-adjacent) |
| 12 | Agent-fallback graphs unlabeled: `meta.engine` never says `agent`, so fallback answers carry deterministic-tier authority ungraded | LNG-F4a (`graph-schema.md:11`) | H (trust) | S | build |
| 13 | Symbol-local honesty: dropped-edge/dynamic-file evidence exists repo-coarse but never reaches the specific answer where an agent decides | ENG-F1 (`extract-symbols.mjs:1081,1133`) | H | M | build |
| 14 | Action stranger-frictions: clones codeweb at `main` (unpinned) by default; sha refs broken as documented; no monorepo guidance; docs recommend `@main` | LNG-F3, GRW-F7 (`action.yml:11-14,33`) | H | S | build |
| 15 | Gate trajectory (`--history`) unreachable by adopters: composite exposes no history input/cache — the retention feature for trigger arm 2 | LNG-F6 (`gate-md.mjs:16-17`, `action.yml:6-22`) | M–H | S–M | build |
| 16 | Gate absent from the product loop: first-run `next:` block and report footer never mention it — the team-lead doorway is docs-only | GRW-F4 (`run.mjs:338-341`) | M–H | S | build |
| 17 | "Claude Code already has LSP" objection answered nowhere (capability comparison needs no new numbers) | GRW-F5 (COMPETITIVE §3.2) | M–H | S | build |
| 18 | `vsce publish` step one secret away from breaching non-goal 6 (guard is secret-absence, not the standing instruction) | LNG-F5 (`release.yml:175-185`) | M | S | build + Operator sign-off |
| 19 | Grammar provenance version-claimed, not verifiable: no content hashes; hardcoded `0.3.1/abi14` stamp off-checklist; Kotlin/Swift/C-C++ "revisit" triggers have no owner | LNG-F2/F7 (`PROVENANCE.md:7-16`, `ts-engine.mjs:101`) | M | S | build |
| 20 | H22 edit-quality leg scoped: `agent-ab2` instrument ready (~0.5M-token smoke / 4–9M full); replay corpus stuck at 1 task after 9 mining runs | VER-F2 | H | M (run) | Operator (Next) |
| 21 | C/C++ scoped: full regex tier + grammar; six-item risk register (preprocessor, macros, .h duality, includes, overloads); decisive cheap check = wasm inventory at pinned ABI; Kotlin/Swift = S once upstream lands | LNG-F1/F7, ENG-F10 | H | L | Operator (Next; non-goal 8 gates) |
| 22 | P1+P3 ready-to-execute (frozen-engine replay harness + oracles + SHA-pinned corpus exist); routing-collision pairs identified (risk↔hotspots, callers↔dependents); `tools/list` = ~21KB ≈ 5.2k tokens, unbudgeted — measure now, trim only under P1 | AGT-F5/F6, VER-F11, LNG-F4b | M–H | S (measure) | Operator (go) |
| 23 | Inherited/interface typed dispatch drops silently — walk the inherit chain for a unique owner | ENG-F3 (`edge-derive.mjs:356-381`) | M | M | build |
| 24 | Monorepo blindness: MCP discovery is cwd-up only (hooks resolve per-file); staleness sweep stats every source per query at scale; cold-extract holds ~2× repo bytes | AGT-F10, ENG-F6/F7 | M | M | build |
| 25 | D4 (last open debt): risk assembly in-lib (unlocks MCP fast path) + optimize banner de-scrape via `--json` | ENG-F5, BKL-D4 (SIMPLIFY §2.4–5) | M | S | standing (recorded debt) |
| 26 | Evals floor is one product case; add 3–5 cheap goldens (cases live outside the protected manifest) | VER-F8 | M | S | build |
| 27 | Requirements dogfood is shelf-ware: zero references since baseline; wire AC-id↔trace parity into check-consistency or mark frozen | VER-F7 | M | S | build (+1-line Operator preference) |
| 28 | External-review verdict cites no commit: record cloned SHA; adoption verdicts currently unreproducible | LNG-F9 (`SKILL.md:39-43`) | M | S | build |
| 29 | Hook residues: post-edit warning delivered twice; hook latency has receipts but no CI budget entry; per-edit node-boot floor undocumented | AGT-F9 | M | S | build |
| 30 | D1 residue: `reading-order` CLI default 40 vs manifest 20 (needs 1-line ruling — BKL-L3); a `TOOL_BEHAVIOR` entry without a spec is silently dead; `campaign` Infinity divergence uncommented | AGT-F7 | M | S | build + Operator (L3) |
| 31 | Impact-closure semantics unstated at the answer (call+inherit only; ref/import users in `dependents`) — one payload sentence; widening waits for evidence | ENG-F8 (`graph-ops.mjs:240-255`) | M | S | standing (doc) |
| 32 | Gate double-runs consistency+evals per edit (pins re-execute what steps 4/5 run); headroom offer to operator | VER-F9 | L–M | S | Operator (harness) |
| 33 | Small batch: `trend --json` NDJSON (L1) · bench orphans ×2 (L4) · report provenance footer (L10) · tarball count at release (L6) · `version-sync`/`screenshot` smoke tests (VER-F10) · invalidation-lattice invariants page (ENG-F9) · graph `schemaVersion` design note (L2) | BKL, VER, ENG | L–M | S each | standing/build |
| 34 | Marketplace mirror repo for the gate Action (root-metadata requirement blocks listing today) — new public surface | GRW-F7 | M | M | Operator |
| 35 | Demo landing tab contradicts the "click the map" promise — editorial call, no measurement | GRW-F11 (CRO C10) | L–M | S | Operator |

---

## Part II — The sequenced plan

Sequencing logic: **truth first** (charter-mandated, cheapest, and everything later points
more eyes at these surfaces), **loop second** (the job line must be completable by every
agent, not just Claude-hook users), **trigger third** (make both arms measurable and open
the doorway *before* the launch brings traffic), **receipts fourth** (so claims stay true
as the product moves), then the **release train**, and the **decision pack** for the
operator throughout. Phases 0–3 are agent-executable under the live gate; each lands as
its own PR the operator reviews. Build items (per §5) should enter `SPEC.md` as
`status: next` ACs **appended by the operator** — proposed AC lines are included below;
this report does not edit `SPEC.md` (`BUILDLOG` discipline: the operator picks work).

### Phase 0 — Truth sweep *(standing obligation; ~1–2 days; no dependencies)*

1. **C7 instance sweep** — route `trend.mjs:174` through `SPONSOR_ASK`
   (`lib/product-copy.mjs`); replace both footer tooltips
   (`report-template.html:1267`, `docs/demo/index.html:1280`) with the ruled framing
   ("sponsoring supports the project"); fix the `FUNDING.yml` comment tail and the
   `ai-spend-gated.md` Trigger sentence (operator gate is the only gate). Final wording
   flagged to the operator in the PR (C7 discipline).
2. **Kill the class** — extend `PROSE_FILES` with `report-template.html`,
   `docs/demo/index.html`, `site/content/{support,case-study,downloads,changelog}.html`,
   `editor/` strings; widen the cost-premise regex beyond `product-copy.mjs`; add a light
   lint for claim-shaped literals (`\d+%`, `\d+×`) in `scripts/*.mjs` outside
   `product-copy.mjs`. (All in `release-utils.mjs` / `check-consistency.mjs` — product-owned.)
3. **Small-truth batch** — C-8…C-14 from §4: downloads footer honesty (prefer rendering
   from the committed ledger over the live fetch), the two `cli.md` env rows, the
   five-language comment, banner alt, backlog-ast header, replay path nits.
4. **Receipt framing** — add as-of dates beside research-page headline stats; align
   README's 126× sentence with the ledger's "simulated grep loop" labeling and add the
   "(v0.9.0 pilot)" qualifier to 44→74. **Operator:** wording sign-off in PR review
   (public-claim copy).
5. C-10 (unqualified staleness claim) is *deferred to Phase 1.3*, which makes it true
   instead of weakening it.

Exit: gate green · §4 table empty except C-10 · drift-audit class checks in place.

### Phase 1 — Complete the loop for every agent *(build; ~1 week; independent of Phase 0)*

1. **Snapshot diff over MCP** — `codeweb_refresh` gains `snapshot:true` → writes
   `graph.prev.json`; `codeweb_diff` accepts `before:"prev"`; server `instructions`
   updated to the completable loop. (AGT-F1; the fix API.md F9 already specified.)
2. **`codeweb_dependents` (28th tool)** — one manifest entry + behavior via the D1
   machinery; the full union answer agents currently can't get. Tool count is
   charter-free-to-change; count surfaces sync mechanically at release via
   `version-sync`. (AGT-F2)
3. **Staleness parity** — advisors join `AUTOREFRESH_TOOLS`; `spawnedToolReply` attaches
   the server-side staleness verdict. Makes README:262 true (closes C-10). (AGT-F3)
4. **The loop for non-Claude clients** — per-client registration blocks (Cursor /
   Windsurf / Codex / Gemini) on the start page + README; a paste-ready rules snippet
   (`AGENTS.md` / `.cursor/rules`) carrying the before/after loop incl. the snapshot
   step; name the entry tool (`codeweb_explain`, then `codeweb_context`) in the README
   agent section. (AGT-F4/F12)
5. **Label the fallback** — `meta.engine:'agent'` stamped by the skill/schema; downstream
   surfaces (lens tooltip, advisors, gate comment) show a one-word provenance caveat.
   No operator go needed — this is labeling, not grading. (LNG-F4a)
6. **Hook & review residues** — drop the post-edit stderr duplicate; add a hook-latency
   entry to `bench/budgets.json` (product-owned); external-review verdicts record the
   cloned SHA. (AGT-F9, LNG-F9)
7. **D1/D4 residue closure** — `reading-order` default from `budgetOf()` (**Operator:**
   one-line ruling on 40-vs-20, BKL-L3); gate assertion for behavior-without-spec;
   comment `campaign`'s deliberate divergence; D4: move risk assembly into `lib/risk.mjs`
   (unlocks the in-process MCP fast path) and read optimize's `--json` totals in
   `run.mjs`. (AGT-F7, ENG-F5)

Proposed AC lines (operator appends, ids continue from AC-8):

```
- **AC-9** — after an edit, an MCP-only client can complete the gate loop: refresh with snapshot:true preserves the prior graph and diff accepts before:"prev" | check: `node --test tests/mcp-snapshot-diff.test.mjs` | status: next
- **AC-10** — codeweb_dependents returns the union answer (call, import, inherit, test, ref) with true totals within budget | check: `node --test tests/mcp-dependents.test.mjs` | status: next
- **AC-11** — every spawned advisor answer carries a staleness verdict, and stale advisors auto-refresh like the orient family | check: `node --test tests/mcp-staleness-parity.test.mjs` | status: next
- **AC-12** — agent-fallback graphs are labeled meta.engine:'agent' and surfaces caveat them | check: `node --test tests/agent-graph-label.test.mjs` | status: next
```

### Phase 2 — Make the trigger measurable; open the doorway *(build; ~2–3 days; after Phase 0)*

1. **Ledger arm 2** — `gateReposExternal` via one GitHub code-search call in
   `acquisition-ledger.yml`; today's value is 0, and that's the point: the trigger
   becomes observable. (GRW-F2, LNG-F3)
2. **Action honesty & pinning** — fix the sha-ref claim in `action.yml`; docs and README
   examples recommend `@v0.12.0`-style pinning over `@main`; add monorepo (`target`)
   matrix guidance to `docs/ci-gate.md`. (LNG-F3, GRW-F7 docs-half)
3. **Ship the trajectory** — `history` input + `actions/cache` wiring in the composite
   Action; dogfood it in `codeweb-gate.yml`. The retention feature for arm 2 finally
   reaches adopters. (LNG-F6)
4. **Gate into the product loop** — fourth `next:` line when `.github/` exists; one gate
   line in the report footer strip. (GRW-F4)
5. **LSP FAQ** — one sourced capability-comparison block on product.html + two README
   sentences (LSP: direct references on demand · codeweb: transitive impact, duplication,
   dead code, and a diffable whole-graph gate). No invented numbers. (GRW-F5)
6. **Neutralize the marketplace step** — delete `vsce publish` or gate it on an explicit
   `workflow_dispatch` input naming non-goal 6. **Operator:** sign-off (release infra).
   (LNG-F5)
7. **Provenance hardening** — sha256 column + byte-verification test for the vendored
   grammars; add the `ts-engine.mjs:101` version stamp to the refresh checklist; add a
   release-checklist line inventorying `@vscode/tree-sitter-wasm` for kotlin/swift/c/cpp —
   converting two blocked roadmap items into event-driven ones and answering C/C++'s
   gating question every release. (LNG-F2/F7)
8. **Launch kit** *(repo-side)* — draft post + claim→receipt table + launch-day checklist,
   citing only ledgered claims (the Show-HN-shaped "we pre-registered 33 checks, published
   the nulls, let the TypeScript compiler referee" story PROOF §4.4 identified).
   **Operator:** posting, timing, and the zero-code seeding (§ Operator console). (GRW-F1)

### Phase 3 — Keep the receipts alive *(build + operator adoption; ~1 week; after Phase 0)*

1. **Values manifest** — derive the published stats (74/44, 126×, 490k, +0.31, ~3s) from
   `bench/results/*.json` into a small manifest; `check-consistency` compares README,
   site, `product.json`, and the proof-strip values against it. Closes the C6-class gap:
   a moved receipt breaks the build instead of silently diverging. (VER-F4)
2. **Receipts ride releases** — deterministic bench legs re-run at each release cut;
   receipt as-of dates become a 150-audit check; recall-pilot re-runs remain
   operator-triggered agent work. **Operator:** adopt into the release process. (VER-F3, ENG-F4)
3. **Weekly vitals** — draft `weekly-vitals.yml` (check + prove-red + bench gate on main,
   failure notification) as a proposal PR. **Operator:** adoption is a new enforcement
   moment; branch protection (§7, still unset) rides the same decision. (VER-F1)
4. **Evals floor** — 3–5 real golden cases (MCP initialize + tools/list count,
   check-consistency OK line, `codeweb-query --help`, fixed-fixture `brief`), each
   sub-second (every case runs twice per gate until the operator trims the double-run —
   finding 32). (VER-F8)
5. **Release-tooling smoke tests** — `version-sync.mjs` and `screenshot.mjs` wrapper
   paths. (VER-F10)
6. **Requirements dogfood** — wire the cheap AC-id↔trace-record parity check into
   `check-consistency`, or mark the YAML a dated frozen snapshot. **Operator:** one-line
   preference. (VER-F7)
7. **Small batch** — `trend --json` → NDJSON (L1); two bench orphans (L4); report
   provenance footer (L10); `toolsListBytes` measured in `bench:all` (no gate yet —
   AGT-F5); `schemaVersion` design note (L2 — design, not drive-by); invalidation-lattice
   invariants page (ENG-F9); impact-closure sentence in the payload (ENG-F8).

**Release train:** when Phases 0–3 have landed, cut **v0.13.0** (`release-tag` skill):
rides the C7 corrections, the loop completion, the 28th tool (all count surfaces
re-synced), Action pinning docs, and the values manifest. L6 (tarball count check) and
the 150 · Drift Audit run at the cut. **Operator:** the cut itself, then the launch
(Phase 2.8) with the seeding list below. Cutting before the launch is deliberate: the
launch should point at a release whose surfaces just passed the widened claims gate.

### Phase 4 — The recall bet *(candidate build; L; measured before claimed)*

The engine's one big remaining product investment — proposed as a **fifth candidate for
the Next slate**, not started unbidden:

1. **Receiver-type tracking** (JS/TS): single-assignment local instances, typed
   variables/properties, property receivers — resolved under the existing one-owner rule
   inside the vendored-grammar tier. The largest missed-caller class. (ENG-F2)
2. **Inherit-chain dispatch** — walk the receiver's inherit chain for a unique defining
   owner; recovers base-class/interface calls for the Java/C#/PHP/Python tiers. (ENG-F3)
3. **Symbol-local honesty, full** — per-label drop counts + complete dynamic-file list
   stamped into meta/sidecar; "0 callers" answers cite *this file's* evidence. (ENG-F1)
4. **Monorepo/scale batch** — NO_GRAPH lists child maps one level down; staleness-sweep
   prefilter via the per-directory mtime stamps; release text after global passes in
   cold extract; publish a "tested to N files" ceiling. (AGT-F10, ENG-F6/F7)

Measurement rule: per-ecosystem edge-density table (deterministic) before/after
(ENG-F11); **no public recall number changes without a re-run receipt**, and the pilot
re-run is operator-triggered. Rationale for the bet: recall is the identity's first noun,
the bench corpus shows an ~8× edge-density spread by code style, and the fix is
charter-native (deterministic, optional tier, precision-gated).

### The Next decision pack *(Operator — the charter holds this open; nothing below starts without the pick)*

| Candidate | What it is | State of prerequisites | Cost | What it buys |
|---|---|---|---|---|
| **P1+P3 measurement batch** | A/B the 27 tool descriptions (P1); grade the agent fallback against the deterministic oracle (P3) | Instruments exist and are alive (replay harness, oracles, SHA-pinned corpus); Phase 1.5 labeling is P3's prerequisite half; routing-collision pairs pre-identified (risk↔hotspots, callers↔dependents); `tools/list` ≈ 5.2k tokens measured | Session tokens + operator go (C7: no funding precondition may be cited) | Sharper tool routing (the token half); the fallback's first published number (de-risks C/C++ interim) |
| **H22 edit-quality** | The one unproven claim leg: does codeweb context improve agent edit *correctness*? | `agent-ab2` ready: 9 graph-verified tasks × 2 arms × 2 reps; ~0.5M-token smoke, ~4–9M full; replay corpus needs growth (1 task after 9 mining runs); fixed-function oracles only | M (run) + corpus-growth labor | Direct evidence for "break less code" — the pitch's weakest leg becomes its strongest, or an honest null publishes |
| **C/C++** | The loudest missing language | Decisive check now automated each release (Phase 2.7): does the trusted wasm source ship c/cpp at the pinned ABI? Risk register written (preprocessor, macros, .h duality, includes, overloads, package boundaries); full regex tier required first; agent fallback covers interim | L | The most-requested capability; largest single demand generator |
| **Free/Teams boundary statement** | Publish the contract; build nothing | Boundary rule + what-stays-free list drafted (REVENUE §5); triggers at 4.6% and 0/10 argue no urgency; copy + charter amendment | S (copy; operator wording) | Pre-empts "when does this stop being free" objections at launch |
| **Recall & scale batch** *(new, this report)* | Phase 4 above | Scoped with receipts; measurement rule defined | L | Directly moves the published recall number the identity leads with |

Ordering considerations (offered, not decided): the distribution constraint is binding
(§3), and the launch + seeding are process, not build — they can precede any pick. P1+P3
is the cheapest science and pairs naturally with the launch window's attention. H22
strengthens the claim the launch leads with. C/C++ and the recall batch are the two L
investments; the Phase 2.7 inventory line tells you each release whether C/C++ is even
unblocked. New charter questions stay one-at-a-time (the data-format question is already
queued and blocks any YAML/TOML work, not this plan).

### Operator console *(zero-code actions; no agent can do these)*

1. Branch protection: make `check` a required status check (`OPERATOR-ACTIONS.md` §7) —
   the one unchecked enforcement TODO; pairs with adopting the weekly-vitals workflow.
2. Pick **Next** (pack above) and append its ACs to `SPEC.md` as `status: next`.
3. Cut v0.13.0 after Phases 0–3 (release train above), running the 150 · Drift Audit at
   the cut.
4. Launch: post the launch-kit story; seed first — Google Search Console verification
   (§3), directory/awesome-list submissions (MCP registry is done; glama.ai,
   mcp.directory, awesome-claude-code outstanding). (GRW-F1/F8)
5. One-line rulings queued by this plan: L3 (reading-order 40-vs-20) · requirements-YAML
   live-vs-frozen (Phase 3.6) · demo landing tab (CRO C10, editorial) · vsce-step
   removal sign-off (Phase 2.6) · Action marketplace mirror repo (yes/no — finding 34).
6. Standing: the charter's open data-format question (asked 2026-07-27) before any
   YAML/TOML; P1–P3/H22 runs are go/no-go only by your word (non-goal 7).
7. Gate headroom offer (optional): make `test_ac_2`/`test_ac_7` wiring-witnesses instead
   of re-executions — operator-hand edit (finding 32).

### Explicitly not in this plan *(the fences held)*

No resident daemon (staleness and monorepo work stay stamp/prefilter-based) · no
embeddings or vector search · no LLM in the runtime analysis path (the ambiguous-drop
policy is the invariant; Phase 4.3 makes drops visible, never guessed) · no accounts,
telemetry, or analytics anywhere (gate-adoption counting is public-API only) · no hosted
Teams work (4.6% / 0-of-10) · no VS Code Marketplace publish (Phase 2.6 *removes* the
latent path) · no executing target code · no required dependencies (receiver-type work
lives in the optional vendored tier or not at all) · no C/C++ or Kotlin/Swift grammar
shipping before provenance + the operator's pick · no YAML/TOML before the data-format
ruling · no bulk tool-description rewrites before a P1 go (factual fixes only) · no
`codemod --write` over MCP (read-only fence) · no star-begging, manufactured proof,
invented counts, price/SLA claims, or cost-premise sponsor copy · no harness edits — every
harness-adjacent item above is a proposal for the operator's hand · no re-proposing the
settled list (`benchmarks.json` mirror, `docs/agent-tools.md`, aggressive queue variant,
per-author SaaS packaging, LSP-server language fan-out — see BKL §B).

---

*Receipts: findings trace to the six area audits run 2026-08-16 (file:line citations
inline); live numbers (downloads, code search, stars) measured this run via public APIs;
gate baseline green at `c5e04f0`. The five C7 instances in §4 were re-verified directly
in this session before writing this report.*
