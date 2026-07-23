# Forms & Validation Audit — codeweb

**Date:** 2026-07-23 · **Scope:** codeweb has no web forms — it is a local CLI + MCP server + Claude Code plugin. Its real "forms" are its input surfaces, and every one was filled out live, mistakes included: 39 malformed/missing/wrong-typed invocations across the CLI entry points (`scripts/*.mjs`), a scripted stdio session against `scripts/mcp-server.mjs` (27 tools; 26 frames including garbage JSON, batch `[]`, wrong types, bogus params), six broken copies of `codeweb.rules.json` fed through both of its consumers, hook stdin fuzzing, and a release-prep dry run in a scratch copy. All test artifacts stayed in scratch; the repo was not touched beyond this file. Lens translation: field economy = required args that could default or be inferred; inline validation = errors at parse time vs deep in the run; error recovery = what a failed run preserves and how actionable the message is; ergonomics = flag consistency and defaults; accessibility = `--help` completeness and discoverability of valid values; submission feedback = progress output, exit codes, double-run safety.

Neighboring reports own adjacent findings and are referenced, not recounted: ACTIVATION.md A6/A7 (Node 20 stack trace; usage string teaching the wrong `--out-dir` default at run.mjs:30 vs :9,70), RETENTION.md R7 (Node pin in CI), FUNNEL.md (npx default out-dir orphaning maps, no-default `<SRC>`).

---

## 1. Form scores

| # | Form (input surface) | Fields | Validation quality | Error recovery | Grade |
|---|---|---|---|---|---|
| 1 | **MCP `tools/call`** — 27 tools (mcp-server.mjs:167–254) | 27 params in shared PROP table; 15/27 tools require zero args; `graph` optional everywhere via walk-up discovery | Required-presence checked; `valid()` hooks give model guidance strings; **but** types never enforced (wrong type reported as "missing", garbage `limit` silently unbudgets, one tool returns empty success on bad symbol) | Excellent on the happy-miss paths: `NO_GRAPH` names `codeweb_map`; unknown symbol returns `found:false` + hint; protocol errors (parse/batch/unknown method) all correct JSON-RPC | **B** |
| 2 | **`run.mjs`** — the main pipeline entry ( `/codeweb`, npx bin, MCP map all funnel here) | 1 required positional + 7 flags | Parse-time rejection of unknown flags/missing values (shared parseArgs, cli.mjs:39–66); `--stages` enumerates its valid value (run.mjs:58); **but** `--coverage` path checked only after all 5 stages run | Superb: per-stage progress + ms timings, artifact list + open hint, memo makes double-runs no-ops (verified: second run prints "stages reused"), atomicWrite means a killed run never leaves torn artifacts (cli.mjs:83–92) | **A-** |
| 3 | **Query CLI family** (`query`, `find`, `explain`, `context-pack`, `diff`) | graph positional (auto-discovered from cwd, cli.mjs:112–128) + 1 mode/symbol | Exactly-one-mode enforced (query.mjs:44–47); flag-shaped symbol rejected; `--limit abc` dies naming flag and value; stopword-only query named (find.mjs:33) | `symbol not found` redirects to concept search; `graph not found` prints the exact build command; JSON `found:false` + exit 1 is scriptable | **A-** |
| 4 | **`codeweb.rules.json` — `roles` section** (read by extract-symbols.mjs:96–99) | 2 keys per entry | Model config validation: index-addressed errors, valid enum listed (`unknown role "generatd" (valid: product\|test\|...)`, graph-ops.mjs:75–84) | Hard exit 2 stops the map — nothing half-built | **A** |
| 5 | **`codeweb.rules.json` — `rules` section** (read by fitness.mjs:34–77) | per-rule: id, type, severity, params | Unknown `type` dies loudly; **but** missing `limit`, typo'd `severity`, and missing `id` are all silently absorbed — the gate passes while checking nothing; and fitness rejects the roles-only variant of its own filename | Message on the dual-schema collision is unhelpful ("rules file must be { \"rules\": [...] }" against a valid roles file) | **C** |
| 6 | **Advisor CLIs** (`deadcode`, `risk`, `hotspots`, `campaign`, `break-cycles`, `review`, `simulate-edit`, `codemod`, `reading-order`) | 0–2 required each | Shared parser everywhere; simulate's exactly-one-mode check with named remedy ("move requires --to <file>"); **but** `--help` hides real flags on four of them, and `reading-order --scope` accepts any kind string silently | simulate-edit's `symbol not found` goes to stderr + exit 1 with empty stdout — which the MCP wrapper converts into an empty success (see F1) | **B-** |
| 7 | **`release.mjs`** (maintainer form) | 1 required mode flag + `--dry-run` | **The one hand-rolled parser left** (release.mjs:20–31): unknown flags silently ignored, `--version=` value unvalidated | Verified in a scratch copy: `--dryrun` (typo) ran the real prep and bumped the version; `--version=banana` wrote `"version": "banana"` into package.json | **D** |
| 8 | **`report.html` UI** (search box, root input, tabs, filters — report-template.html) | 2 text inputs + toggles | Search is live-but-navigational (dim, don't hide), Enter cycles matches and auto-expands collapsed domains ("reveal, don't refuse", :985), Escape clears, count chip narrates "no matches"/"n/N" (:976) | URL hash carries the whole view (tab · filter · selection, :283–284) so state is shareable and never lost; rootInput persists to localStorage; aria-labels + roving-tabindex tabs (:1004–1015) | **A** |
| 9 | **Hooks stdin contract** (session-brief, pre-edit-impact, post-edit-diff) | 1 JSON payload | Garbage stdin → silent exit 0, valid payload → brief JSON (verified all three) | Fail-open by contract — a broken hook can never block the editor loop | **A** |
| 10 | **`ci-gate.mjs`** | 1 required flag (`--base`) + 3 defaults | Missing `--base` → usage; bad ref error explains the CI fix ("need full history — actions/checkout with fetch-depth: 0", :58) | try/finally removes the worktree + temp dir on every failure path | **B+** |

**The pattern to copy** (protect with tests): the shared `parseArgs` policy — unknown flag → die 2 with usage, `--help` everywhere, typed values with the offending value echoed (cli.mjs:39–66) — plus the empty-target extract error (names the 18 extensions it looked for, the skip list, and the `--allow-empty` escape) and the report UI's reveal-don't-refuse search. These are the best "forms" in the product.

---

## 2. Findings

**F1 · MCP `codeweb_simulate` / `codeweb_codemod`-family · unknown symbol returns an empty success — the worst response on the highest-traffic surface.**
Observed live: `tools/call codeweb_simulate {"delete":"nonexistentSymbol"}` → `{"content":[{"type":"text","text":""}]}` — no `isError`, no text. Mechanism: simulate-edit.mjs:44,54 does `die('symbol not found: …', 1)` (stderr + exit 1 + empty stdout), while the server's reply shaper assumes "exit 0 or 1 both emit valid JSON on stdout — pass through" (mcp-server.mjs:470–478). The INSTRUCTIONS tell agents to pre-flight every refactor with this tool; an empty reply reads as "no objections" before a doomed edit. Same trap for `move` misses and for a numeric `delete:123` (spawn stringifies it, symbol "123" not found). **Fix:** make simulate-edit emit the same `found:false` + suggestions JSON on stdout that query/explain already emit (exit 1), or teach `spawnedToolReply` that empty stdout on exit 1 = errResult carrying `errBuf`.

**F2 · MCP required-arg check · wrong type is reported as "missing" — misleading retry guidance.**
`{"symbol":42}` → `missing required argument: symbol` (mcp-server.mjs:522–526 checks `typeof args[k] !== 'string'`). The argument is present; the message invites the agent to re-send the same wrong shape. Empty string gets the same text. **Fix:** three messages — absent → "missing", wrong type → "must be a string (got number)", empty → "must be non-empty".

**F3 · MCP `limit`/`offset` · garbage silently disables the budget; negative values create a pagination trap.**
`codeweb_find {"limit":"abc"}` → `Number("abc")=NaN` → the fast path returns the **unabridged** list (mcp-server.mjs:564–566) — the token budget the tool exists to protect, silently off; on a 16k-symbol repo that is a context-blowing reply. `{"limit":-3}` → `{"results":[],"count":1,"more":{"remaining":1,"nextOffset":0}}` — an agent following `nextOffset:0` loops on empty pages forever. Worse, the behavior is **inconsistent**: on budgeted spawn-path tools the same `"abc"` is forwarded as `--limit abc` and the CLI correctly dies (`flag --limit needs a number (got "abc")`) — so identical bad input yields silence or an error depending on which tool. **Fix:** one clamp at handleToolCall: `Number.isFinite(n) && n >= 0` else errResult naming the param; same for `offset`, `window`, `budget`.

**F4 · fitness rules · a misconfigured rule silently stops gating.**
Verified: `{"type":"max-fan-in"}` with **no `limit`** → "0 violations, ok" (fitness.mjs:66 compares against `undefined`, always false); `"severity":"eror"` (typo) → silently demoted to warning, exit 0 (fitness.mjs:45,79 — anything ≠ `error` is a warning); missing `id` → `ruleId: undefined` in output. Unknown rule *types* die loudly (fitness.mjs:75) — the same rigor is missing one level down. This is an architecture **gate**: its failure mode is passing. **Fix:** per-type param validation at load (max-fan-in/max-symbol-loc need numeric `limit`, forbidden-dependency needs `from`+`to`, layer needs `order[]`), severity enum-checked, `id` required — die 2 listing the broken rule, exactly like unknown-type already does.

**F5 · `codeweb.rules.json` · one filename, two schemas, and the second consumer rejects the first's valid file.**
The same file carries `roles` (extractor, Spec E) and `rules` (fitness). fitness.mjs:34–36 auto-discovers `codeweb.rules.json` beside the graph or in cwd — so running `node scripts/fitness.mjs <graph>` from a repo configured with roles-only (codeweb's own root file!) dies: `rules file must be { "rules": [ ... ] }`, exit 2. The user's file is valid product config; the error says it's malformed. **Fix:** treat a file with `roles` but no `rules` as "0 rules configured" with a pointed note ("this file has `roles` (extractor config); add a `rules: []` section for fitness"), or at minimum name the two sections in the error.

**F6 · target `codeweb.rules.json` · malformed JSON error names no file; a misspelled key is silent.**
Through run.mjs on a target with truncated rules JSON: `[extract] Unexpected end of JSON input` — no path (extract-symbols.mjs:96–99 wraps `e.message` only; contrast fitness's `invalid rules JSON in <path>: …`). And `{"rolez": [...]}` maps successfully with overrides silently unapplied — no unknown-top-level-key warning for a 2-key schema. The *values* are validated superbly (index + enum, graph-ops.mjs:75–84); the envelope is not. **Fix:** prefix the parse error with the filename; warn once on unknown top-level keys.

**F7 · `release.mjs` · the last hand-rolled parser, on the one form where a typo is destructive.**
release.mjs:20–31 scans argv ad hoc: unknown flags are ignored (the exact bug class finding-24 eliminated from the other 30+ scripts) and `--version=X` is written verbatim. Reproduced in a scratch copy: `--patch --dryrun` → ran **non-dry**, package.json bumped; `--version=banana` → `"version": "banana"` accepted and propagated toward plugin.json/SKILL.md/site. **Fix:** move to `parseArgs` (usage + unknown-flag death + `--help` for free) and validate `--version` against `^\d+\.\d+\.\d+(-[\w.]+)?$`.

**F8 · `reading-order --scope` / MCP `scope` · invalid kind silently returns the whole repo.**
`--scope bogus src` → full 7-symbol order with `scope:{kind:"bogus"}` echoed, exit 0 (reading-order.mjs:26 passes any string through; same via MCP). Usage says `domain|file|symbol`. A typo silently answers a different question — the exact failure `run.mjs --stages` was hardened against (run.mjs:58 enumerates and dies). **Fix:** enumerate kinds, die 2 with the valid set.

**F9 · `run.mjs --coverage` · validated five stages too late.**
`run.mjs <target> --coverage /nope.lcov` runs extract→cluster→overlap→optimize→report, *then* fails: `coverage report unreadable: /nope.lcov: ENOENT` (coverage runs last, run.mjs:173). On a large repo that is minutes of work before a pre-checkable path error; the abort framing ("stage 'coverage' failed — aborting") also hides that the map itself succeeded and persists. **Fix:** `existsSync` the coverage path at parse time; on late failure say "map built at <ws>; coverage annotation failed".

**F10 · `--help` hides real flags on four advisors.**
deadcode.mjs:25 usage omits `--limit`, `--show-suppressed`, `--annotations` (all real, per its flag spec); risk.mjs:17 and hotspots.mjs:16 omit `--limit`; find.mjs:15 omits `--full`. The parser rejects unknown flags loudly, so the only discovery channel for these is reading source. **Fix:** sync the five usage strings; a one-line consistency test can diff `flags:{}` keys against the usage text.

**F11 · MCP `codeweb_review` · schema advertises dead params; CLI parity gap.**
tools/list shows `limit` and `full` on codeweb_review, but the tool has no `budget` entry and review.mjs has no such flags — both are silently dropped (mcp-server.mjs:213–215, 655–660). The CLI's `--range <gitref>` mode is also not exposed. An agent tuning `limit` gets no effect and no error. **Fix:** remove the two properties (or wire a real budget) and consider exposing `range`.

**F12 · MCP `codeweb_codemod`/`codeweb_fitness` · required fields the engine can infer.**
`codemod` requires `into` (mcp-server.mjs:226) — but the CLI picks the canonical survivor automatically when `--into` is omitted (verified: "merge 2 -> keep src/util.js:add"). `fitness` requires `rules` (mcp-server.mjs:216) — but the CLI auto-discovers `codeweb.rules.json` beside the graph/cwd (fitness.mjs:34–35). Two required fields that are optional one transport over. **Fix:** demote both to optional with the CLI's inference as default.

**F13 · Near-miss suggestions are case/token-exact only — the net has big holes.**
`suggestSymbols` (graph-ops.mjs:157) tiers on exact-lowercase and token overlap: `Add`→`add` suggests, but `ad`, `helpr`, `mane` return nothing, so the `found:false` hint drops its "or a near-match below" half exactly when a human typo'd. The redirect to concept search keeps this from being a dead end (grade saver), but one edit-distance tier would catch the commonest slip. **Fix:** add a levenshtein≤2 tier over labels, capped at 3, behind the existing tiers.

**F14 · Minor ergonomics.**
(a) `codemod` usage implies `--into` is required (`--merge <ids> --into <id>`, codemod.mjs:21) — it isn't; simulate-edit's usage brackets it correctly. (b) `/codeweb`'s `--engine hybrid|read|tools` (commands/codeweb.md:21) collides with extract's `--engine regex|tree-sitter` — same flag name, disjoint vocabularies one layer apart; the run.mjs fast path rejects `--engine` entirely. (c) `query --limit -5` → `results:[]` + `more:{remaining:3, nextOffset:0}` — same negative-limit nonsense as F3, CLI edition. (d) report.html has zero `<label>` elements — placeholder+aria-label carry both inputs; acceptable, but a visible label on `rootInput` (a path field users must understand) would help. (e) `context.window:"huge"` silently coerces to the default 3 (mcp-server.mjs:618) — benign, but a note in the reply would match the product's usual explicitness.

**Done right (verified, keep):** unknown-flag death with usage everywhere the shared parser is used; `--help` on all 30+ scripts, exit 0; missing flag values named with the flag; number flags echo the bad value; `--stages` enumerates its valid set; empty-target extract error teaches extensions + skip list + escape; `diff` on a missing file prints the exact rebuild command; `NO_GRAPH` self-heal loop (ACTIVATION already crowned it); double-run memo idempotency; atomic writes; per-workspace writer serialization for concurrent maps (mcp-server.mjs I1–I7); JSON-RPC edge handling (parse error, `[]`, unknown method/tool) all to spec; hooks fail-open on any stdin.

---

## 3. Cuts (remove, default, or infer — highest leverage first)

1. **MCP `codemod.into` → infer** (survivor pick already exists in the engine) — F12.
2. **MCP `fitness.rules` → default** to the CLI's beside-graph/cwd discovery — F12.
3. **`codeweb_review.limit`/`full` → remove from schema** (dead today) — F11.
4. **`run.mjs <SRC>` → default `.`** — endorsing FUNNEL/RETENTION's call from the forms side: it is the only required field on the product's main form, and its default is the overwhelmingly common value. With `--out-dir` defaulting to `<SRC>/.codeweb` (FUNNEL), the main form drops to **zero required fields**.
5. **`release.mjs --version` → keep but validate**; the mode flag set collapses into parseArgs — F7.
6. Nothing else is padding: 15 of 27 MCP tools already take zero required args, and `graph` inference via walk-up is field-economy done right.

---

## 4. Priority (by drop-off risk × traffic)

1. **F1 simulate empty-success** — agents are the highest-traffic users; the prescribed pre-refactor check returning silent emptiness is the most dangerous validation gap in the product. Small fix (emit `found:false` JSON), test: MCP scenario asserting non-empty reply for unknown symbol.
2. **F3 + F2 MCP arg validation** — every tool call crosses this gate; garbage `limit` un-budgeting and "missing" for wrong-type mislead the exact users the server was tuned for. One shared validator, ~20 lines.
3. **F4 + F5 fitness rules** — the CI-gate persona trusts this form the most; silent no-op rules and the dual-schema rejection both read as "codeweb is broken" in exactly the place teams evaluate it.
4. **F7 release.mjs** — lowest traffic, highest blast per miss (a typo ships a wrong version); trivially fixed by adopting the house parser.
5. **F8 scope + F9 coverage timing + F6 file-naming** — parse-time strictness catching up to the standard run.mjs already sets.
6. **F10 + F11 help/schema truth** — cheap accuracy fixes that compound trust in `--help` and tools/list as contracts.

## Next

Top candidates: **F1** (simulate-edit found:false JSON + spawnedToolReply empty-stdout guard), **F3/F2** (one numeric/type validator in handleToolCall), **F4/F5** (fitness rule-param validation + roles/rules coexistence). All three are small, testable, and sit on the product's two highest-traffic forms — the MCP tool surface and the fitness gate. Which of these form fixes should be made first?
