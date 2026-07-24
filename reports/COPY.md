# Copy & voice audit — 2026-07-24

First run (no prior `COPY.md`). Method: every user-visible string surface was read in full —
CLI stdout/stderr (`scripts/*.mjs`, `bin/*.mjs`, the shared emitters in `scripts/lib/cli.mjs`,
`graph-ops.mjs`, `query-core.mjs`), agent surfaces (`scripts/mcp-server.mjs` tool descriptions +
`INSTRUCTIONS` + error text, `hooks/*.mjs` cards, `hooks/hooks.json` descriptions,
`commands/*.md`, `agents/*.md`, skill descriptions), and browser surfaces
(`scripts/report-template.html`, `site/content/*.html` → built `docs/*.html`,
`editor/vscode-codeweb/extension.js` + its `package.json`). **No locale files and no email
templates exist in this repo** — nothing to audit there. The twelve root ALL-CAPS reports are
internal, out of scope as strings. Two copy-adjacent defects already logged in `DOCS.md`
(D1 target-not-found, D2 gate-semantics overstatement) are re-treated here as *strings*, with
the exact rewrites DOCS.md stopped short of.

---

## 1. Voice snapshot

The product speaks in a deadpan, lowercase engineering voice: terse result lines
(`mapped 462 symbols -> 3 actionable finding(s)`), em-dash asides, `(s)` pluralization, and a
striking discipline of honesty — staleness warnings, caveats ("cross-check before deleting"),
and receipts appear wherever confidence could be misplaced. Nearly every error names the next
command (`graph not found: … — build it first (run /codeweb, or: node scripts/run.mjs …)`),
which is the voice's best trait and makes the handful of dead-end messages stand out sharply.
The only drift is decorative: two celebration emoji (🎉) in the report where every sibling
surface is sober, and a few places where the voice's precision slips into unexplained shorthand
("blast 242", "ready/blocked/review") or claims another tool's verdict it cannot back.

## 2. Worst 10, rewritten

Ranked by frequency × confusion. Every "after" is verbatim-usable.

**1. The setup-blocking error with no next step** — `scripts/run.mjs:76`
- Before: `[run] target not found: ${opts.src}`
- After: `[run] target not found: ${opts.src} — pass the path to the code you want mapped (default: the current directory)`
  and, only when the missing path is under `bench/corpus/`, append:
  `\n[run]   the sample corpus is not bundled with a clone — fetch it first: bash bench/corpus/clone-corpus.sh`
- Why: this is the first error a fresh-clone user hits (DOCS.md D1: the README points at a
  gitignored corpus path), and it is the only error in this file that states failure without a
  remedy. Every neighbor (`unknown --stages`, `coverage report not found`) already names one.

**2. The pre-flight that speaks for the gate — falsely** — `scripts/simulate-edit.mjs:87,90`
- Before: `projected gate: PASS — the gate would accept this edit (exit 0)` /
  `projected gate: BLOCK — the gate would reject this edit (exit 1)` /
  `  (structural pre-flight: duplication delta is out of scope — run the full pipeline for that.)`
- After: `projected: PASS — no new cycles; no surviving symbol loses its last caller` /
  `projected: BLOCK — new cycle or a symbol losing its last caller (details below)` /
  `  (checks cycles + lost callers — stricter than the diff.mjs/CI gate, which exempts exported symbols; duplication delta needs the full pipeline.)`
- Why: DOCS.md D2 proved the shipped gate (`diff.mjs`) exempts exported symbols while simulate
  does not — the same edit measured BLOCK here and "ok" there. On the product's central safety
  surface, the copy asserts an equivalence the code does not have. Say what *this* check found;
  let the gate speak for itself.

**3. "blast 242" with no definition, all day, above every symbol** —
`editor/vscode-codeweb/extension.js:75-76`
- Before (tooltip): `codeweb: ${l.id}${mapped} — click to open in the interactive report (re-map: node scripts/run.mjs)`
- After: `codeweb: ${l.id}${mapped} — blast = symbols affected if this changes. Click to open the report. Re-map: npx -y @ghostlygawd/codeweb .`
- Why: the lens title (`76 callers · blast 242`) is the highest-frequency human string in the
  product and "blast" is never defined on this surface; the tooltip's "re-map" command is a
  relative script path that runs nowhere the VS Code user actually is. Title can stay — the
  hover must carry the definition and a runnable command.

**4. The report contradicts the tier names the product chose** — `scripts/report-template.html:530`
- Before: `body-confirmed by the overlap pipeline — optimize.md tiers these ready/blocked/review`
- After: `confirmed by comparing bodies — optimize.md tiers these ready / blocked / judgement calls`
- Why: `optimize.mjs` deliberately renamed the `review` tier to "judgement call(s)" everywhere
  humans read it (its own comment: "N review next to the findings triple's needs review M read
  as the same number disagreeing"). The report reintroduces exactly that collision, and adds
  the internal name "overlap pipeline" for good measure.

**5. One concept, two names: domain vs. area — split inside a single message** —
`scripts/lib/brief-core.mjs:76-78`, `scripts/report-template.html:351,429-431,573,172,990`,
`scripts/mcp-server.mjs:213`, `hooks/hooks.json` SessionStart description
- Before (the brief, two lines apart): `…: 462 symbols / 48 files / 8 domains (python)` then `areas:`
- After: header `domains:`; report masthead `' domains'`; matrix heading `Domain coupling`;
  graph legend `● domain — size = symbols, click to expand it`; button `Collapse to domains`;
  detail overview `largest domains`; codeweb_brief description `domains with summaries`;
  hooks.json `(domains, load-bearing symbols, …)`.
- Why: graph.json, all 27 MCP tool descriptions, every CLI output, plugin.json, and the site's
  own glossary card teach **domain**; only the report chrome and the brief's section header say
  "area". The glossary rule — one name, the most-used one — picks domain, and the brief already
  proves the split confuses within one screenful.

**6. A heading that miscounts its own list** — `site/content/start.html:88`
- Before: `Five ideas that make the rest click`
- After: `Six ideas that make the rest click`
- Why: six cards follow (Node & edge, Domain, Overlap, Blast radius, The gate, Severity) on the
  getting-started page — the exact literal-drift class `check-consistency` guards elsewhere but
  does not sweep site content for (see §5).

**7. Celebration emoji vs. bare em-dash: the report's inconsistent empty states** —
`scripts/report-template.html:531,534,538,540`
- Before: `No pipeline findings 🎉` · `No duplication found 🎉` · Hotspots/dead-code empty: `—`
- After: `No confirmed findings — nothing here needs consolidating.` ·
  `No duplication — no function is defined in more than one file.` ·
  Hotspots: `No hotspots — nothing here has in-repo callers yet.` ·
  Dead code: `None — every symbol has a caller or an export.`
- Why: the only two exclamatory beats in an otherwise deadpan product, sitting on the same
  screen as empty states that say nothing at all. `find-similar`'s "looks novel; safe to
  write." is the house standard: state what emptiness means.

**8. A hook pointer that fails when followed verbatim** — `hooks/post-edit-diff.mjs:122`
- Before: `  -> run \`node scripts/diff.mjs\` or re-run /codeweb for the full delta.`
- After: `  -> for the full delta re-run /codeweb (agents: codeweb_map), or codeweb_diff against a saved before-graph.`
- Why: bare `node scripts/diff.mjs` exits 2 with a usage error (it needs `<before> <after>`),
  and the path is relative to the plugin clone, not the mapped repo. The audience of this
  string is an agent mid-session — name the tools it can actually call.

**9. refresh.mjs lags the shared error/next-step standard** — `scripts/refresh.mjs:30,99`
- Before: `graph not found: ${abs}` · `  overlaps dropped (run the full pipeline to recompute). scanned ${n} file(s).`
- After: `graph not found: ${abs} — build it first: /codeweb, or node scripts/run.mjs <target>` ·
  `  overlap findings dropped — re-run /codeweb (or codeweb_map) to recount them. scanned ${n} file(s).`
- Why: refresh hand-rolls graph loading instead of using `lib/cli.mjs loadGraph`, so it lost
  the actionable message every other CLI shares; "the full pipeline" names no runnable thing.

**10. The editor's dead-end info message** — `editor/vscode-codeweb/extension.js:104`
- Before: `codeweb: no report.html beside ${graphPath} — build one with the codeweb pipeline (run.mjs).`
- After: `codeweb: no report.html beside ${graphPath} — rebuild the map to create it: npx -y @ghostlygawd/codeweb <repo root>`
- Why: "the codeweb pipeline (run.mjs)" is an internal component name plus an unrunnable
  fragment; the fix is the same one-liner the site already teaches.

Near-misses (fine to leave, listed for completeness): `codeweb_callers`' description says
"call-edge in-neighbors" while its reply says `N dependent(s) of X (call, import, inherit,
test, ref)` — align the description to "direct dependents (calls, imports, inheritance, tests,
refs)" (`scripts/mcp-server.mjs:189` vs `scripts/lib/query-core.mjs:79`); `[run] stages reused
(fragment unchanged)` could say `(source unchanged)`; the `cx 14` complexity abbreviation in
explain/hotspots is unexplained on first contact.

## 3. Terminology glossary

| Concept | The one name | Retire / rule |
|---|---|---|
| Cluster of related symbols | **domain** | Retire "area" everywhere (report chrome, brief header, hooks.json, codeweb_brief description). |
| Everything `.codeweb/` holds | **the map** | "graph" = graph.json only; "report" = report.html only. Never "map" for graph.json alone. |
| A confirmed duplication result | **finding** | "overlap" stays a mechanism/API word (`overlaps` key, overlap.md) — keep it out of human UI prose. |
| Finding triage | **actionable · needs review · dismissed** | Already canonical via `bucketsLine()` — every surface must render this triple, never a raw overlap count. |
| Optimize tiers | **ready · blocked · judgement calls** (display) | `review` remains the JSON key (API); it is never a display word for this tier. |
| Inbound relationships | **dependents** (all edge kinds); **callers** (call edges only) | Tool names are API and stay; descriptions and summaries must use the word that matches the data returned. |
| Transitive effect of an edit | **blast radius** | "blast" as shorthand only after the surface has defined it once (report and CLI do; the VS Code lens must — worst-10 #3). |
| The pass/fail check | **the gate** | Only the gate's own output claims the gate's verdict; pre-flights describe what they checked (worst-10 #2). |
| A single function/class/method | **symbol** | "node" is reserved for graph-structure contexts (site glossary, schema). Already consistent — codified here. |

## 4. Voice rules

- Every error ends with the next command, runnable verbatim from where that reader is standing
  — never a bare "not found", never a repo-relative script path on a surface outside the repo.
- Never speak for another tool. A message may claim only the check it ran; equivalence claims
  ("same verdict as the gate") are allowed only where the code path is literally shared.
- One display name per concept on every surface. JSON keys are API and may differ from display
  names; two display names for one concept is always a bug.
- Deadpan, lowercase, measured: numbers over adjectives, no exclamation marks, no celebration
  emoji. `⚠` is the only decoration, reserved for staleness and regressions.
- Empty states say what emptiness means and, when one exists, the first action — "no similar
  existing symbol (>=15%) — looks novel; safe to write." is the house standard. Never a bare "—".

## 5. String hygiene

The architecture is scattered-by-file but deliberately de-duplicated at the joints that matter:
the graph-not-found error lives once (`lib/cli.mjs loadGraph`), the findings triple lives once
(`lib/graph-ops.mjs bucketsLine`), and MCP replies reuse the CLI's own summary builders
(`lib/query-core.mjs`, `brief-core`, `explain-core`) — one truth, two transports. Keep that
pattern. Four leaks to close:

1. `report-template.html` hand-copies the `findingBuckets` rule and the tier names into inline
   JS (its own comment admits "mirrors lib/graph-ops.mjs") — which is exactly how worst-10 #4
   happened. Inject shared vocabulary at build time the way `__GRAPH_DATA__` already is.
2. The `review` → "judgement call(s)" display mapping lives only inside `optimize.mjs`. Move it
   beside `bucketsLine()` in `lib/graph-ops.mjs` so report/run/optimize import one name.
3. `scripts/refresh.mjs` hand-rolls graph loading; switching to `loadGraph` deletes its weaker
   error for free (worst-10 #9).
4. `check-consistency` (`scripts/release-utils.mjs` `PROSE_FILES`) does not sweep
   `site/content/*.html`, `report-template.html`, or `editor/` — the "Five ideas"/six-cards
   drift and the tier-name fork lived where the drift-checker doesn't look. Add them.

No centralization beyond that is warranted: there is no i18n surface, and if one ever lands,
the `lib/*-core` summary builders are already the right chokepoint.
