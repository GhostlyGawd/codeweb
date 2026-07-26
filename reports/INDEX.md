# INDEX — Spring Cleaning run

Spring Cleaning · run index · 4/4 stages complete

**Run date:** 2026-07-26 · **Playbook:** Spring Cleaning (conductor) — delete, simplify, then map
what debt remains. Four read-only audit stages, each executed by a fresh subagent writing one
report into `reports/`; the codebase was untouched — the reports are the only writes. Branch:
`claude/spring-cleaning-conductor-bkzct1`, one commit per report — recover the whole trail with
`git log --grep "Spring Cleaning"`. Every recommendation is bounded by `CHARTER.md`
(ratified 2026-07-25): zero deps · deterministic, no LLM in the analysis loop · local, no
telemetry · bench machinery stays as receipts.

## Stages

| # | Brief | Report | Commit |
|---|-------|--------|--------|
| 1 | [26 · Prune Audit](https://goal-prompts.vercel.app/raw/26.md) | `PRUNE.md` | `e3ecdcd` |
| 2 | [27 · Simplification Pass](https://goal-prompts.vercel.app/raw/27.md) | `SIMPLIFY.md` | `05d1bd4` |
| 3 | [13 · Tech Debt Map](https://goal-prompts.vercel.app/raw/13.md) | `DEBT.md` | `481b0fd` |
| 4 | [22 · Git Hotspot Mining](https://goal-prompts.vercel.app/raw/22.md) | `HOTSPOTS.md` | `17de0ba` |

No null reports — all four stages found signal (stage 4 confirmed full, unshallow history first).

## Reports at a glance

**`PRUNE.md`** — 5 ranked findings: 4 safe deletions · 2 verify-first · 0 stale flags — the house
is clean, near-zero dead code. Next steps: (1) delete the 3 orphaned `docs/assets/` SVGs
(`hero.svg`, `logo-b-wordmark.svg`, `logo-c-badge.svg`) plus the one dead function; (2) get the
operator ruling on the write-only `site/data/benchmarks.json` mirror; (3) regenerate the
fossilized v0.9.0 `package-lock.json` and suppress the 29 `LANG_DISPATCH` deadcode self-gate
false positives via `annotate.mjs --suppress`.

**`SIMPLIFY.md`** — 5 simplifications, ranked by clarity-per-risk; complexity otherwise earned
(zero one-implementation abstractions, zero pass-through layers; keep-list included so nobody
"simplifies" the load-bearing parts later). Next steps: (1) one `loadStamped()` for the 5×
restated sidecar stamp-check (mind the `sidecars.mjs` import-cycle trap); (2) one
`nearestWorkspace()` for the 4× restated `.codeweb` walk-up; (3) stop the pre-edit hook's
fallback from spawning a child that double-parses the multi-MB graph — call `buildCards`
in-process like `index-lite.mjs` already does.

**`DEBT.md`** — 9-item debt inventory (D1–D9, D3 split a/b) · accepted-debt register with
charter citations · sequenced refactor plan · first refactor fully scoped (D3a, tests first).
Next steps: (1) **D1 tool-interface manifest** — each of the 27 MCP tools' interfaces is declared
in 3 places (script `parseArgs`, `mcp-server.mjs` TOOLS table, hand-written `docs/cli.md`) and
every recorded recurring bug is that triplication drifting; replace with one per-tool spec both
transports read, gate-checked, docs generated; (2) **D6** — `scripts/run.mjs:329` still prints
the sponsorship-pays-for-benchmarks premise CHARTER C7 ruled fabricated (2026-07-25), live in
shipped v0.12.0; fix the line (operator owns wording) and extend the claims gate to stdout
strings; (3) run D3a (the stamped-sidecar loader) as the rehearsal refactor.

**`HOTSPOTS.md`** — 5-file hotspot ranking with corrected churn (the repo's 5 orphan-root
snapshots inflated stage-3 counts; e.g. `mcp-server.mjs` 20→13 true edits, still king at 54% fix
density) · coupling pairs including the anti-pair (`mcp-server.mjs`↔`docs/cli.md` co-changed
**0 of 13** opportunities — the coupling that must exist, doesn't) · silo map (bus factor 1 by
construction; the unguarded silos are artifacts — `docs/cli.md` tables and stdout claim strings —
not people) · trajectory: concentrating, not eroding (distinct product files touched per phase
68→53→36→6) · prediction. Next steps: (1) the statistically next bug is CLI↔MCP declaration
drift in `mcp-server.mjs` — preempt with D1, starting at the six QUERY_KIND tools, plus a shape
assertion in `check-consistency`; (2) make `docs/cli.md` generated-or-gated; (3) respect the
anti-targets — `report-template.html` (redesigned on the last day of history, zero post-redesign
data) and `extract-symbols.mjs` (1,141 LOC but 4 edits, 0 fixes: big-and-quiet) earn measurement,
not refactoring.

## The run's verdict in one paragraph

The house is clean — near-zero dead code, zero TODO/FIXME comments, zero import cycles, and
complexity that is overwhelmingly earned. The one structural debt is **declaration debt**: the
same fact stated in N places (each MCP tool's interface ×3, the sidecar freshness rule ×5, the
workspace walk-up ×4), and the repo's own fix history prices it — 5 of `mcp-server.mjs`'s 7 fix
commits are that single drift class, making it both the top debt (D1) and the site of the
predicted next bug. One urgent copy item rides along: the charter-ruled-fabricated sponsorship
claim still printing from `scripts/run.mjs:329` in shipped v0.12.0 (D6), invisible to today's
claims gate. Start from `DEBT.md` §4 (the refactor sequence) and `HOTSPOTS.md` §7–8 (prediction
and history-earned targets); each report ends with its own operator question.
