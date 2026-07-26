# PRUNE — deletion audit

Spring Cleaning · stage 1/4 · brief 26

**Date:** 2026-07-26 · read-only audit; this file is the only write. Fresh run (no prior PRUNE.md).
Bounded by `CHARTER.md`: the bench/measurement machinery is receipts and stays (§9, non-goal 7
keeps the parked A/B harnesses); zero-dep, deterministic, no-telemetry invariants respected
throughout. Method: import-graph reachability from every entry point (4 bins, 17 npm scripts,
3 hooks, 148 test files, 7 workflows, plugin/skill/command surfaces, site build, editor
extension), cross-referenced by basename against all 498 tracked files, plus a self-map with
codeweb's own pipeline (`run.mjs` + `deadcode.mjs` into a scratch workspace).

## Top findings, ranked (plain words)

1. **The house is clean.** After verifying all 37 reachability candidates, zero tracked modules
   are dead. Recent work (brand-sync commit `a6d4e14`, the reports/ move, the charter interview)
   already swept the big fossils; `spike/` and `.live/` are long gone. The remaining haul is
   small and precise — that is the finding.
2. **Three stale build outputs in `docs/assets/`** — `hero.svg`, `logo-b-wordmark.svg`,
   `logo-c-badge.svg`. Their sources were deleted from `assets/brand/` in `a6d4e14` (the logo
   exploration's losers), but the built copies stayed behind: `site/build.mjs` no longer emits
   them, no page references them, and the "committed site is fresh" CI gate only diffs emitted
   files, so extras linger invisibly. The only provably-dead files in the repo.
3. **`site/data/benchmarks.json` is a write-only mirror.** `bench/all.mjs` writes it on every
   run ("byte-identical mirror for the site", Spec C) and a test asserts the mirroring — but
   nothing consumes it: `site/build.mjs` reads only `product.json`, no page fetches it,
   `check-consistency`/`release`/workflows never touch it. Either a future data-driven research
   page wants it, or the mirror plumbing can go. Charter is silent — operator call.
4. **`package-lock.json` is fossilized at v0.9.0** — old bin map (`codeweb -> scripts/run.mjs`),
   `node >=20` floor, version 0.9.0 against a 0.12.0 tree. Not deletable (CI's `npm ci` needs
   it) but three releases stale; regenerate at the next convenient moment.
5. **codeweb's own deadcode tool reports 29 false positives on itself** — every "safe" hit is a
   `LANG_DISPATCH` table method in `scripts/lib/ts-engine.mjs` (ruby/php/py/rust/go/java-cs
   closures invoked via `LANG_DISPATCH[lang].x(...)`, the documented dynamic-dispatch blind
   spot). Nothing to delete, but the repo's own gate stays noisy until they're suppressed via
   the built-in `annotate.mjs --suppress` flow.

## 1 · Reclaim totals

| class | count |
|---|---|
| Files deletable (safe) | 3 (~5.7 KB, 98 lines) |
| Dead code (safe) | 1 function, 5 LOC (`bench/lib/stats.mjs:stddev`) |
| Files deletable (verify-first) | 2 (~11.6 KB, 299 lines) + ~4 lines of mirror plumbing |
| Unused dependencies | **0** — the single `optionalDependency` (`web-tree-sitter`) is imported and CI-asserted; zero-dep invariant intact |
| Stale feature flags | **0** — all 22 `CODEWEB_*` levers are read, and the "legacy" ones are deliberate A/B levers exercised by `detection-accuracy.mjs`/tests and documented in `docs/cli.md` |
| Commented-out code blocks / .bak files | **0** — scanned every `.mjs/.js`; all long comment runs are prose or ASCII diagrams |

## 2 · Safe deletions (provably unreferenced — one clean commit, in this order)

1. `docs/assets/logo-b-wordmark.svg` — 0 references repo-wide; source deleted in `a6d4e14`;
   not emitted by `site/build.mjs` (its brand copy reads `assets/brand/`, where this no longer exists).
2. `docs/assets/logo-c-badge.svg` — same provenance, 0 references.
3. `docs/assets/hero.svg` — same provenance; only mentions are historical text
   (CHANGELOG/changelog page, `reports/CRO.md`), no live page or stylesheet references it.
4. `bench/lib/stats.mjs` → delete `export function stddev(...)` (lines 36–40) — the name
   appears in no other tracked file, code or prose; the harnesses use the Wilson interval and
   `mean` instead. (Dead code *within* the kept bench machinery — fair game per charter §9.)

Gate check, done: `tests/brand-sync.test.mjs` never enumerates `docs/assets` extras, and the CI
"Committed site is fresh" step (`git diff -- docs` + porcelain) stays green since a rebuild does
not recreate these three. No test references `stddev`.

## 3 · Verify-first list (item · risk · verification step)

| item | risk | one-line verification |
|---|---|---|
| `site/data/benchmarks.json` + the `--site` mirror write in `bench/all.mjs` (default at line 23, write at line 217) + the byte-identical assert in `tests/bench-all.test.mjs` | The mirror was declared in `docs/specs/bench-all-ci-gates.md` — a planned data-driven site block may want it | Ask the operator whether a site consumer is planned; then `grep -rn "site/data/benchmarks" site/ docs/*.html` to re-confirm zero readers before removing file + plumbing together (file alone regenerates on the next `npm run bench:all`) |
| `docs/agent-tools.md` (111 lines) | Deliberately kept as a self-labeled "Historical spec"; linked from `docs/reference.md:206` and listed in `PROSE_FILES` (`scripts/release-utils.mjs:52`), so deletion needs those two edits | Operator taste call: this repo's culture keeps historical records — if it goes, remove the two references in the same commit and re-run `npm run check-consistency` |
| `package-lock.json` staleness (not a deletion) | `npm ci` in ci/gate/release workflows depends on it; today it carries 0.9.0-era metadata | Run `npm install` on a networked machine at the next release prep, commit the regenerated lock (`.claude/skills/release-tag` moment) |
| The 29 `deadcode.mjs` self false-positives | Not deletions — dynamic `LANG_DISPATCH[lang].fn()` dispatch | Optional follow-up: `node scripts/annotate.mjs --suppress <fingerprint> --note "LANG_DISPATCH dynamic dispatch"` per hit so the self-gate reads clean (writes `.codeweb/annotations.json`, a deliberate-memory file) |

## 4 · Flag retirements

None. The flag garden is tended: `CODEWEB_LEGACY_FALLBACK` and `CODEWEB_DEADCODE_LEGACY` look
like retirement bait but are load-bearing A/B levers — the detection-accuracy harness and the
extract/golden tests flip them to prove the shipped fixes matter (H12/H13), and `docs/cli.md`
documents them. `CODEWEB_TIMING`, `CODEWEB_VERBOSE`, `CODEWEB_MCP_TRACE` are documented dev
knobs; the rest (`CODEWEB_WS`, `CODEWEB_ENGINE`, `CODEWEB_NO_STATS`, ...) are exercised by the
pipeline, tests, or bench. No flag evaluates to one value forever.

## 5 · Verified alive (so the next audit doesn't re-litigate)

- All 40+ `scripts/*.mjs` CLIs: every one is spawned by tests via `join(ROOT, 'scripts', ...)`,
  wired into `mcp-server.mjs`/`campaign.mjs`/hooks, or is the documented operator tool in the
  brand pipeline (`screenshot.mjs` re-shoot flow + `stamp-screens.mjs`, enforced by brand-sync B5).
- The whole `bench/` tree: `run-all.mjs` runs the six deterministic study harnesses;
  `agent-ab.workflow.js` reproduces the published "null (honest)" ledger row;
  `agent-ab2-ambient.workflow.js` + `replay-*.js` are the parked P1–P3 experiments
  (charter non-goal 7 — parked, not dead); `bench/results/*.json` and the
  `efficiency-pilot.*` file family are the receipts behind public claims (charter §9).
- `codeweb.rules.json`'s `spike/**` and `.live/**` role overrides: self-documented as
  deliberately retained guards, not orphaned config.
- `docs/` roles are as declared: 8 HTML pages + sitemap/robots/key/assets/demo are build
  output; `docs/demo/axios.graph.json` is the demo's regeneration source (brand-sync B3's
  REGEN recipe); specs/decisions/proposals/reviews are the receipts trail.

## 6 · The great deletion PR

Honest scope — one small, fully-receipted commit rather than a satisfying sweep, because the
sweep already happened before this audit arrived:

1. Delete `docs/assets/hero.svg`, `docs/assets/logo-b-wordmark.svg`, `docs/assets/logo-c-badge.svg`.
2. Delete `stddev` from `bench/lib/stats.mjs`.
3. (If the operator rules the mirror dead) delete `site/data/benchmarks.json`, drop the
   `--site` default + write from `bench/all.mjs`, and the mirror assert from
   `tests/bench-all.test.mjs`.
4. (If the operator wants the historical spec gone) delete `docs/agent-tools.md` + its two
   references.

Net: 3–5 files, ~100–400 lines, 0 dependencies, and a green suite —
verify with `npm test && npm run check-consistency && node site/build.mjs && git status --porcelain -- docs`.

---

**Which deletions should I make?** (a) just the safe four — the docs/assets trio + `stddev`;
(b) safe four + the benchmarks.json site mirror; (c) everything above including the historical
`agent-tools.md`; or (d) name your own subset — and should the lockfile refresh and the 29
deadcode suppressions ride along?
