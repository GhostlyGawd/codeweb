# HOTSPOTS — git hotspot mining

Spring Cleaning · stage 4/4 · brief 22

**Date:** 2026-07-26 · read-only history pass; this file is the only write. Fresh run (no prior
HOTSPOTS.md). Bounded by `CHARTER.md`: recommendations stay inside the invariants (zero deps ·
deterministic · local · small answers · bench machinery is receipts, §9) and the Not-now list.
Cross-referenced, not re-derived: `reports/PRUNE.md` (dead weight), `reports/SIMPLIFY.md`
(restated idioms), `reports/DEBT.md` (churn×complexity, the D1–D9 ledger). This pass adds what
only history shows: fix-magnet specifics, temporal coupling with counts, authorship reality,
trajectory, and the statistical next-bug call — plus one correction to stage 3's numbers.

**The window, honestly:** 91 commits on this branch; the last 3 are this playbook's own report
commits and are excluded from every statistic below. Of the remaining 88: **5 orphan-root
snapshot commits** (342–480 files each — the disconnected-workspace PR flow), 6 merges, and
**77 real change commits** spanning **2026-07-19 → 2026-07-25 — seven days**. This is a young
repo: "old code" does not exist here, fix history is one week deep, and every trend below is a
seven-day trend. Claims are sized accordingly.

## Top findings, ranked (plain words)

1. **The hotspot king is confirmed, and its bug class is named.** `scripts/mcp-server.mjs`:
   13 true edits, **7 of them fix commits (54% fix density)** — highest in the repo — at 883 LOC.
   Five of the seven fixes are one class: CLI↔MCP parity drift. The fixes unified the *runtime*
   behavior; the *declaration* source of the class (each tool's interface stated in 3 places,
   DEBT D1) is still standing. The factory is intact; only its output was cleaned up.
2. **The coupling that should exist, doesn't.** `docs/cli.md` (the hand-written tool tables) was
   edited **once** in the whole history — by `5c5d417` "the docs stop lying" — while the MCP
   server changed **13 times**. Co-change count: **0 of 13**. Meanwhile the couplings that *do*
   exist are the fan-outs: every `brief-core.mjs` change dragged `mcp-server.mjs` (5 of 5), and
   README ↔ site homepage co-changed 15 times. Drift lives exactly where the gate doesn't look.
3. **The fix history is one deliberate wave, not a bug stream.** 21 of 77 commits (27%) are
   subject-level fixes — but 20 of the 21 landed on a single day (07-24, the Clarity program's
   audit-then-fix campaign). Exactly **one organic fix since** (`6bc6b10`, stale severity prose).
   Zero user-reported bugs yet — distribution is days old. The repo finds its own bugs by
   auditing, which means the *classes* those audits found (parity drift, ungated claims) are the
   best available predictor of the next one.
4. **Stage 3's churn numbers were inflated by the repo's own history shape.** The 5 orphan-root
   snapshots credit +1 to every file alive at each snapshot, so naive `--name-only` counts
   overstate long-lived files: mcp-server 20→**13** true edits, site/build 18→**11**, run
   17→**9**, report-template 15→**8**, release-utils 15→**8**, graph-ops 12→**5**,
   extract-symbols 10→**4**. Rankings mostly survive; the one demotion that matters:
   **`extract-symbols.mjs` (1,141 LOC, 4 edits, 0 fixes) is big-and-quiet, not a hotspot.**
5. **Trajectory: concentrating, decisively.** Distinct product-code files touched per phase:
   **68 → 53 → 36 → 6**; product top-3 share of product churn: **8% → 16% → 25% → 67%**. The
   week's energy migrated from code (47% of touches in phase A) to claim-bearing copy surfaces
   (73% of touches in phase D) as the playbooks shifted from engineering to identity. A hardening
   core, not architecture erosion.
6. **Bus factor is 1 by construction, and the mitigations are real.** All 88 commits are agent
   work: 58 authored `Claude <noreply@anthropic.com>`, 30 authored by the operator — every one of
   those a GitHub squash-merge of an agent PR (committer `GitHub`, `Co-Authored-By: Claude` in
   the sampled trailers). The silo question for a solo operator is "which areas would strand a
   fresh session" — and the answer is almost none: the hot areas all carry dedicated test files
   and invariant docs. The two unguarded spots are artifacts, not areas: `docs/cli.md` tables and
   product stdout claim strings (D6).

## 1 · Hotspot ranking (true edits × fix commits × size)

Product code, ranked by risk (edits and fixes are subject-level, roots/merges excluded; LOC is
today's `wc -l`):

| file | edits | fixes | LOC | last edit | verdict |
|---|---|---|---|---|---|
| `scripts/mcp-server.mjs` | 13 | **7** | 883 | 07-24 | The quadrant king. Not inherently hard — badly *declared* (D1). Refactor earned; sequence below |
| `site/build.mjs` | 11 | 2 | 406 | 07-25 | The only product file hot in **all four phases** (1/4/3/3). Churn tracks the copy era, both fixes were copy-rendering. Watch; brand-sync CI already gates its output |
| `scripts/run.mjs` | 9 | 2 | 345 | 07-24 | Orchestrator; fixes were front-door UX class. Carries the live D6 claim at line 329 — that's a copy correction, not a refactor |
| `scripts/report-template.html` | 8 | 1 | 1,270 | 07-25 | Redesigned on the **final day of history** — there are zero post-redesign days to measure "cooling". A7 stands: watch, no action from history |
| `scripts/release-utils.mjs` | 8 | 1 | 313 | 07-25 | The gate's brain — `check-consistency.mjs` is a thin shim importing it (0 edits itself). Churn = gate growth; healthy co-change with its test (4 of 8). Keep |
| `scripts/codemod.mjs` | 6 | **3** | 200 | 07-24 | 50% fix density on the only source-deleting surface; all 3 fixes were authority/verdict language. DEBT D5 confirmed: highest review bar, no refactor |
| `scripts/optimize.mjs` | 6 | 2 | 166 | 07-24 | Copy-class fixes (blast definition, domain naming). Fine |
| `scripts/lib/cli.mjs` | 5 | 2 | 298 | 07-24 | Shared parser; fixes made it coach better. Fine |
| `scripts/deadcode.mjs` | 5 | 2 | 136 | 07-24 | Copy-class fixes. Fine |
| `scripts/lib/graph-ops.mjs` | 5 | 1 | 780 | 07-24 | Fan-in 17 hub, near-zero fix history — **A4 stability confirmed with cleaner numbers.** Leave it |
| `scripts/extract-symbols.mjs` | 4 | 0 | 1,141 | 07-23 | **Demoted from stage 3's list.** Big-and-quiet (one more real edit hides in orphan-root `d2132a2`, the runExtract refactor). Not a hotspot |

The copy tier above all of this: `docs/changelog.html` 31 · `CHANGELOG.md` 27 · `README.md` 25
(3 fixes) · `docs/index.html` 23 · `docs/start.html` 17 · `site/content/index.html` 17 ·
`docs/research.html` 15 · `docs/product.html` 14 · `site/data/product.json` 12 · `package.json`
11 · `.claude-plugin/plugin.json` 11. **41 of 77 commits (53%) touch built `docs/` pages** —
DEBT A1's accepted GH-Pages model, re-confirmed on clean numbers.

## 2 · Bug magnets — what the fix history actually says

The 21 fix commits decompose into classes, and the classes have addresses:

- **Transport-parity drift (5):** `dd2ddbd` remedies crossing transports · `67e0f9f` pagination
  dialects · `1affe2e` MCP accepting what CLI rejects · `5c81f8b` five gate-verdict presenters ·
  `94238c1` two editDistance copies (caught by codeweb's own gate). **All five land in
  `mcp-server.mjs`.** Verdict: structural, not inherent — the same fact declared in N places, N−1
  of them eventually wrong. D1 is the fix for the class.
- **Copy/claims drift (6):** blast definition (`7ecad5b`), domain naming (`907e5e6`), docs lying
  where the gate can't see (`5c5d417`), literal `undefined` in tool cards (`f63fec1`), stranger's
  first screenful (`cf68b72`), stale severity prose (`6bc6b10` — the only post-wave organic fix).
  Verdict: same disease on prose surfaces; the gate covers listed files and the identity line,
  not everything that states a claim.
- **Authority/error tone (5):** codemod borrowing the gate's voice (`379f8a6`), deadcode hedging
  (`a84711a`), real extractor errors preserved (`d50cdbc`), CI gate not stamping regressions over
  setup failures (`ab3f29b`), pre-edit hook made advisory (`5a01ae7`). Verdict: judgment calls,
  now settled; no structure to fix.
- **Front-door contract (4):** run.mjs stream contract + machine mode (`2254543`), wrong-path vs
  pipeline failure (`34183b5`), parser coaching (`d946ac2`), first unmapped session (`2c502fd`).

Context that keeps this honest: 18 of these were one program (Clarity, 07-24) fixing what its own
audits found — a self-audit culture, not user pain. Body-level mentions suggest ~8 more fixes
hide inside the big squash-merged batch PRs (#54–#63), invisible to subject-level mining.

## 3 · Temporal coupling (co-commit counts on the 77 change commits)

| pair | co-changes | of (a, b) edits | reading · resolution |
|---|---|---|---|
| `CHANGELOG.md` ↔ `docs/changelog.html` | 25 | (27, 31) | Source → built mirror. **Accept** — CI freshness gate already enforces it (A1) |
| `site/content/index.html` ↔ `docs/index.html` | 17 | (17, 23) | Source → built, confidence 1.00 by design. **Accept** |
| `README.md` ↔ `site/content/index.html` | 15 | (25, 17) | **The real finding:** the same pitch maintained twice by hand; only the identity line is gated. This is where copy drift lives — extend the gate's reach (shared claim strings or more gated lines), don't merge the surfaces |
| `scripts/run.mjs` ↔ `scripts/mcp-server.mjs` | 6 | (9, 13) | Two front doors moving together: the transport tax, live. **Resolution: D1 manifest** shrinks what they must agree on |
| `package.json` ↔ `server.json` · `marketplace.json` ↔ `plugin.json` | 6 · 7 | (11,7) · (8,11) | Manifest fan-out. **Accept** — `version-sync.mjs` writes the mechanical parts; gate checks the rest (A5) |
| `scripts/lib/brief-core.mjs` ↔ `scripts/mcp-server.mjs` | 5 | (5, 13) | **Confidence 1.00** — brief-core has never changed without the server changing. The 3-transport fan-out DEBT priced, now measured. D1/D2 shrink the drag |
| `scripts/mcp-server.mjs` ↔ `tests/mcp.test.mjs` | 5 | (13, 5) | Test moves with code. **Healthy — keep** |
| `scripts/release-utils.mjs` ↔ `tests/release-tooling.test.mjs` | 4 | (8, 6) | Same. **Healthy** |
| `scripts/report-template.html` ↔ `scripts/build-report.mjs` | 4 | (8, 5) | Template + injector, natural pair. **Accept** |
| **`scripts/mcp-server.mjs` ↔ `docs/cli.md`** | **0** | (13, 1) | **The anti-pair.** The two places that must state the same interface never co-change; `docs/cli.md`'s own header concedes it ("--help wins and this file has a bug"). Resolution: generate-or-gate the tables from the D1 manifest |

## 4 · Silo map — bus factor 1 by construction

`git log --format='%an %ae'` reality: **58 commits authored Claude, 30 authored the operator
(GhostlyGawd)** — and every operator-authored commit is a GitHub squash-merge of agent work
(committer `GitHub`; sampled trailers carry `Co-Authored-By: Claude Fable 5`). 76 of 91 commits
carry Claude co-author trailers. There is no second human; pairing suggestions are meaningless
here. The silo lens therefore asks: **if a fresh agent session opened any area cold, what
documents it and what pins it?**

| area | mitigation on record | residual risk |
|---|---|---|
| MCP server + reader/writer queue | 5 dedicated test files (`mcp`, `mcp-queue`, `mcp-scenarios`, `mcp-budget`, `mcp-inprocess`) + I1–I7 invariant docs | Low-med — best-pinned hot file in the repo; risk is the declaration triple, not knowledge loss |
| Extraction spine (`extract-symbols`, `ts-engine`, `edge-derive`) | 15+ extract/edge test files, golden suites, grammar `PROVENANCE.md` | Low |
| Release/gate engine (`release-utils` + shim) | `release-tooling.test.mjs` co-changes with it (4 of 8) + the `release-tag` skill documents the ritual | Low |
| Report template + build-report | `report-draw/sim/editor-link/scale-bench` tests + brand-sync CI | Low-med — visual behavior is the hardest thing to pin; 1,270 LOC in one file |
| Bench/measurement machinery | Specs + committed results as receipts (charter §9); parked levers documented | Low |
| **`docs/cli.md` tool tables** | **Nothing** — self-confessed drift zone, 1 edit vs the server's 13 | **High (small blast radius): the silo is an ungated artifact, not a person** |
| **Product stdout claim strings** | **Nothing** — `claims-check.mjs` audits files, not output; D6 proves the gap in shipped v0.12.0 | **High (reputation-class): a ratified-false claim is live today** |

## 5 · Stale foundations — adjusted for an eight-day repo

**197 of 501 tracked files have never been edited since import.** Nothing here is *old* — the
maximum possible age is 8 days — so neither "maturity" nor "fear" can be claimed. What the quiet
set does signal: these interfaces held through three whole-repo programs (perf review, growth,
clarity) while their callers churned. The load-bearing quiet:

- `scripts/lib/edge-derive.mjs` — the call-edge factory on the extraction spine; 0 edits, has
  `tests/edge-derive.test.mjs`. The best foundation story in the repo.
- `scripts/lib/{find-core, hook-baseline, risk, reliance, enclosing, annotations, bench-core,
  claims-check}.mjs`, `scripts/version-sync.mjs`, `scripts/check-consistency.mjs` (thin shim —
  the gate's churn lives in `release-utils.mjs`).
- The 6 grammar `.wasm` binaries — frozen by declared policy (`PROVENANCE.md`, non-goal 8), not
  by neglect.

No action. Re-run this lens when the repo has months; then untouched-and-load-bearing becomes a
real question.

## 6 · Trajectory — concentrating, not spreading

Phases: **A** 07-19→22 (9 change commits; perf/quality + release plumbing) · **B** 07-23 (20;
growth playbook) · **C** 07-24 (35; clarity fix wave + copy) · **D** 07-25 (13; redesign,
charter, v0.11–0.12).

| signal | A | B | C | D |
|---|---|---|---|---|
| distinct product files touched | 68 | 53 | 36 | **6** |
| product top-3 share of product churn | 8% | 16% | 25% | **67%** |
| product share of all file-touches | 47% | 34% | 24% | **6%** |
| copy share of all file-touches | 16% | 39% | 49% | **73%** |

Reading: product-code churn narrowed onto fewer files every phase — a hardening core — while the
week's total energy moved to claim surfaces, by deliberate playbook choice rather than drift.
No erosion signature anywhere (erosion = churn spreading across ever-more files with rising fix
share; the opposite happened). Two per-file curves worth keeping: `mcp-server.mjs` heat was
2 → 4 → 7 → 0 (spiked with the fix wave, silent during pure copy work — it re-heats whenever
product work resumes); `site/build.mjs` was 1 → 4 → 3 → 3, the only product file hot in every
phase including the last.

## 7 · Prediction — where the next bug statistically lands

**Primary: a CLI↔MCP declaration drift surfacing in `scripts/mcp-server.mjs`** (or between its
`TOOLS` table and some script's `parseArgs`) **on the next product batch.** The receipts stack:
54% of its edits were fixes; 5 of those 7 fixes were exactly this class; the class's cause — each
tool's interface declared in 3 places — is still standing (D1 unbuilt); `docs/cli.md` has
co-changed 0 of 13 opportunities; and every product-shipping phase in the repo's history touched
this file (2/4/7 edits in A/B/C). Charter "Next" candidates (measurement batch, edit-quality,
C/C++) all eventually cross this surface, because every brief-visible feature pays the
3-transport tax (A2).
**Preemptive move:** DEBT's D1 manifest — one importable spec per tool consumed by both
transports, starting with the six `QUERY_KIND` tools, with a "table matches specs" assertion in
`check-consistency` and the `docs/cli.md` tables generated-or-gated.

**Secondary: a claim bug on an ungated string surface.** Receipts: D6 is live *right now* —
`scripts/run.mjs:329` still prints the sponsorship premise CHARTER C7 ruled fabricated, in
shipped v0.12.0 (re-confirmed in code today); 6 of 21 fixes were copy/claims class; phase D moved
73% of touches onto claim-bearing surfaces; and the README ↔ site pair co-changed 15 times with
only one gated line between them.
**Preemptive move:** fix the D6 string (operator wording, per `CLAUDE.md`), then hoist
user-facing claim strings into the gate's reach — `lib/claims-check.mjs` already exists and is
stable; teach it (or its callers) to cover stdout claims.

## 8 · Refactor targets earned by history — and anti-targets

Earned (history says the cost is being paid):

1. **D1 — tool-interface manifest** (M): the only refactor here with a named bug-class receipt
   (5 parity fixes) and a measured missing coupling (0/13). Highest expected bug-prevention per
   line changed.
2. **D3a — one stamped-sidecar loader** (S): the newest feature commit (`5a85059`) minted copy
   #5 of the stamp rule — the restatement rate is still positive. Land it before the next
   sidecar ships; it also rehearses D1's motion. (Placement trap documented in DEBT §5.)
3. **D2 — split `mcp-server.mjs`** (M): 13 edits, 7 fixes, 883 LOC, 8 concerns on one review
   surface — but it has been quiet since 07-24, so per the "still changing" rule it queues
   *behind* D1 and fires when product batches resume (which its own history says they will).

Anti-targets (history vetoes what taste might pick):

- **`extract-symbols.mjs`** — 1,141 LOC looks like a target; 4 edits and 0 fixes say leave it.
- **`graph-ops.mjs`** — the fan-in-17 hub is the stablest hot-adjacent file (5 edits, 1 fix); A4
  confirmed.
- **`report-template.html`** — redesigned on the last day of history; zero data on the new
  design's churn. Measure first (A7's trigger).
- **The MCP queue** — 0 fixes since #30–32 landed; scenario tests pin it. SIMPLIFY's Keep list
  holds.

---

**Which target should I address?** (a) **D1** — the tool-interface manifest, starting with the
six QUERY_KIND tools (the statistical next-bug preemption); (b) **D3a first** — the stamped-sidecar
loader as the small rehearsal, then D1; (c) **the claim-string gate** — fix D6's line (operator
wording) and put stdout claims under `check-consistency`; or (d) **none yet** — file this as the
map and let the operator pick Next per the charter?
