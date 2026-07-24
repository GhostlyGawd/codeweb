# Error-message audit — 2026-07-24

First run (no prior `ERRORS.md`). Method: every user-facing failure string was read at its
emission site — the CLI fleet (`scripts/*.mjs` `die()`/stderr, `scripts/lib/cli.mjs` shared
harness, `bin/*.mjs` guards), the MCP server (`scripts/mcp-server.mjs` `errResult`/`fail`
shapes), the three hooks (`hooks/*.mjs`), the browser surfaces (`scripts/report-template.html`,
`scripts/serve.mjs`, the GitHub Pages site under `docs/`), and the VS Code extension
(`editor/vscode-codeweb/extension.js`) — and the high-traffic failure paths were **executed
live** against scratch workspaces (bad targets, unmapped cwds, missing/near-miss/absent symbols,
corrupt and non-graph JSON, empty maps, malformed MCP frames, missing args, wrong-typed args,
unsupported-language `codeweb_map`, a failing CI gate). Builds on `DOCS.md` (D1/D2),
`COPY.md` (worst-10 #1/#2/#8/#9/#10, voice rules), and `API.md` (F1/F2/F4/F6/F7, error tiers);
prior findings are cited and extended, not restated. This file goes where COPY.md lens 3
didn't: the full inventory, leakage, empty-vs-error, shape consistency, and exit codes as part
of the message.

**Verdict up front.** The shared machinery is the good news: one flag loop (`parseArgs`), one
graph loader (`loadGraph`), one spawned-reply shaper (`spawnedToolReply`), one guard-path error
class (`ExtractError`), an EPIPE handler — so most errors name a cause and a runnable next step,
and **no user-facing surface ever shows a stack trace** (verified across every probe). The bad
news is the inverse of the usual pattern: here it is not one generic handler producing dozens of
bad messages — it is a handful of **opt-outs from the good chokepoints**, each of which silences
or beheads an otherwise-excellent message at exactly the moments trust is decided: first CLI
contact before a map exists, first MCP contact on an unsupported repo, and first CI run with the
default shallow checkout.

---

## 1. Inventory (where errors live, and how often each path fires)

| Surface | Emitters | Shape | Verified live |
|---|---|---|---|
| CLI humans | 73 `die()` sites + ~20 `console.error` sites across `scripts/`, 4 `bin/` Node guards | stderr, exit 0 ok / 1 data verdict / 2 usage-IO (forks at the rims — §6) | yes |
| MCP agents | 18 `errResult` sites + `fail()` protocol errors in `mcp-server.mjs` | JSON-RPC error (protocol) / `{content, isError:true}` (caller error) / `found:false`-`ok:false` success (data verdict) — the API.md §3 three-tier model, held | yes |
| Hooks | 3 hooks, all fail-open silent by contract (`hooks/hooks.json` says so — correct) | one ⚠ stderr+context card on regression only | yes (prior: API.md) |
| Browser | `report-template.html` (1 hard failure + ~8 empty states), `serve.mjs` (403/404/500), site `docs/` (no 404 page), VS Code (1 info toast) | inline HTML / HTTP bodies / toast | read + template probes |

Frequency weighting used throughout: **first-contact errors** (no map yet, wrong dir,
unsupported language, first CI run) and **staleness warnings** (fire on every query once any
mapped file changed — the normal mid-edit state) outrank exotic parse failures.

---

## 2. Worst offenders — ranked by frequency × stuckness

**#1 — The bare-usage wall when no map exists** *(new)* — `scripts/lib/cli.mjs:124`
`if (!graphPath) die(usage || 'usage: <graph.json> required (or set CODEWEB_WS, or run from a mapped repo)', 2)`
The fallback text is fine — but **20 tools** (query, explain, find, brief, stats, risk,
hotspots, deadcode, campaign, context-pack, reading-order, break-cycles, optimize, coverage,
codemod, placement, simulate-edit, find-similar, bench, build-report) pass `{usage: USAGE}`,
which **replaces** the actionable message instead of appending to it. Verified:
`node scripts/query.mjs --cycles` in an unmapped directory prints only
`usage: query.mjs [graph.json] <--callers|…>` — exit 2, nothing else. The user's syntax was
valid; the actual cause (no graph after arg → `CODEWEB_WS` → walk-up) is never stated and the
remedy (build a map) is never named. A usage wall is the grammar of "you typed it wrong" — this
one fires when the user typed it right. This is the first error any CLI user hits before
mapping, and the recurring one whenever they run from outside the mapped tree. One line fixes
all 20 tools (append, don't replace — rewrite R1).

**#2 — `codeweb_map` failure beheads its own best message** *(new)* — `scripts/mcp-server.mjs:486`
`errResult(id, \`codeweb_map failed (exit ${code}): ${(errBuf||'').trim().split('\n').slice(-3).join('\n')}\`)`
The extractor's no-source error is the house's model message — five lines, escapes first
(`wrong directory? Point at the code root. Non-native language? … /codeweb … agent fallback`,
`extract-symbols.mjs:245-249`, ACTIVATION A6's own design note says "the two real escapes
lead"). The MCP wrapper keeps only the **last 3 stderr lines**. Verified live, the agent
receives exactly:
`codeweb_map failed (exit 1): [extract]   (Intentionally sparse target? --allow-empty writes an empty map.)`
+ a blank line + `[run] stage 'extract' failed (exit 1) — aborting`.
Every actionable line was cut; what survives is the one niche flag — which `codeweb_map`
**cannot pass** (no such param; API.md F6 flagged the flag-leak, this is why it's all the agent
sees) — plus an internal pipeline frame. This is the first-contact MCP error for every
unsupported-language or wrong-root repo. The `unsupported.json` marker rescues the *next*
session (`mcp-server.mjs:590` routes it well); the failing session itself is stranded with a
wrong remedy. `slice(-3)` optimizes for tail-is-truth; run.mjs's tail is frames, its head is
truth.

**#3 — The CI gate reports a false verdict over a swallowed cause** *(extends API.md F2)* —
`scripts/ci-gate.mjs:44` + `:92`, `.github/actions/codeweb-gate/action.yml:76`
`buildGraph` runs the pipeline with `stdio: 'ignore'`, so when the before/after build fails, the
catch prints only
`[codeweb] gate error: Command failed: /opt/node22/bin/node /…/run.mjs /…/target --target after --out-dir /tmp/codeweb-gate-XXXX/after`
(verified live) — run.mjs's own good diagnostics are discarded, and what's left is an argv dump
with temp paths (also the leakage list, §4). The action then collapses **any** non-success into
`::error::codeweb gate reported structural regressions (see the PR comment / job log above)` —
so an exit-2 environment error is announced as a structural regression. Frequency is high among
new adopters: `actions/checkout` defaults to a shallow clone, and the shallow-checkout failure
is the gate's documented trap — meaning the *first* run of the gate, for anyone who missed
`fetch-depth: 0`, produces a red X asserting their PR made the structure worse. The worktree
error itself names the fix (`ci-gate.mjs:59` — good), but it's buried under
`continue-on-error: true` while the false annotation is what GitHub surfaces. API.md F2 caught
the action collapse; the new part is that even a fixed action message has nothing to say today,
because `buildGraph` threw the cause away.

**#4 — The most frequent warning in the product names a tool humans can't run** *(new; mirror
image of API.md F6)* — `scripts/query.mjs:92`, `scripts/explain.mjs:66`, `scripts/brief.mjs:31`
`⚠ graph is stale for 1+ file(s) (src/a.mjs…) — run codeweb_refresh` (verified live, text mode).
The staleness advisory fires on every query once any mapped file changed — the normal state
mid-edit, the single highest-frequency advisory string in the product. On the *human* text
transport the remedy is an MCP tool name; the runnable command
(`node scripts/refresh.mjs <graph>`, or re-running `codeweb`) is never given. F6 documented CLI
text leaking into MCP replies; this is the same seam leaking the other way.
`lib/brief-core.mjs:125` already ships the correct dual-audience form
(`refresh with codeweb_refresh (agents) or /codeweb (full rebuild)`) — the model exists, three
surfaces just don't use it. (The `--json` copies of this line — query.mjs:61, explain.mjs:51,
find.mjs:44, context-core.mjs:75 — are fine: that transport's readers can call the tool.)

**#5 — The CLI answers structural questions from a graph that knows nothing** *(new; the
transport fork of the MCP's A7 guard)* — `scripts/query.mjs`, `hotspots.mjs`, every structural
CLI; guard exists only at `mcp-server.mjs:605-609`
Verified: against an `--allow-empty` map (0 nodes) the MCP refuses structural tools with the
honest `the map at <path> is EMPTY … structural answers would be vacuous, not "0 findings"` —
while the **CLI on the same graph prints `0 file-level dependency cycle(s):` and
`0 orphan(s) — no callers and not exported:`, exit 0.** Worse: `normalizeGraph` default-fills
any JSON, so `node scripts/query.mjs ./package.json --orphans` answers `0 orphan(s)`, exit 0 —
and `bump()` writes a `stats.json` ledger beside the file as a side effect (verified; cleaned
up). The extractor's own comment calls a green run over nothing "the kind of silent lie the
rest of the pipeline is engineered against" — the lie survives on the human transport. No error
at all is the stuckest kind of message: confident wrong answers.

**#6 — Deep links to vanished symbols silently no-op** *(new)* —
`scripts/report-template.html:1125` (`st.s && nodeById.has(st.s) ? st.s : null`), `:448`
(`showNode: if (!n) return`)
The VS Code lens click-through and the `copy link` button both mint `#s=<id>` URLs; ids embed
file paths, so every rename, file move, or re-map invalidates old links. A stale link opens the
default findings view with **zero acknowledgment** — the viewer can't tell "symbol gone" from
"link broken" from "report ignored me". Same class in the editor: a corrupt/truncated
graph.json makes all lenses silently vanish (`extension.js:38` catch → null → `[]`) — fail-open
is right for rendering, but nothing anywhere says why the lenses left.

**#7 — `[run] target not found` still has no remedy, and exits with the wrong code**
*(extends COPY.md #1 + API.md F2; rewrite already specified there)* — `scripts/run.mjs:76`
The first error a fresh-clone user hits (DOCS.md D1) states failure without a next step — the
only error in the file that does — **and exits 1**, the same code as a real pipeline failure,
while its sibling errors (`--stages`, `--coverage`) exit 2. A wrapper cannot tell a typo'd path
from a failed stage. COPY.md #1's wording fix stands; add: exit 2.

**#8 — annotate prints success for a write nothing will ever read** *(the message side of
API.md F7)* — `scripts/annotate.mjs:45`
From any unmapped directory, `--suppress abc` creates a fresh orphaned `.codeweb/` and prints
`codeweb annotate: suppressed abc in /wrong/place/.codeweb (1 total). Source untouched.` —
a completed-work message for a suppression no tool will find (annotations are read beside the
*graph*). A success string that is false is worse than an error: nothing prompts the user to
look again until the finding resurfaces, annotated-but-not, at the next map.

**#9 — the timeout dead end** *(new)* — `scripts/mcp-server.mjs:506`
`tool timed out after 120s` — announce-only. No cause candidates (busy workspace queue, a
concurrent map/refresh writer, an oversized `full:true` pack), no retry guidance. Rare per
call, but it's the error most likely to hit on exactly the large repos where each agent loop is
expensive. Related: a timed-out `codeweb_map` reports `codeweb_map failed (exit null): …` —
"exit null" is an internals-flavored way to say "killed at the 300s cap".

**#10 — smaller dead ends** *(new unless marked)*
- `scripts/trend.mjs:169` `[codeweb] no snapshots to chart` — cause (empty/missing history
  ledger) and remedy (full maps append rows; or pass graphs/`--history <file>`) both absent.
- `scripts/serve.mjs:31-35` — HTTP bodies are bare `forbidden` / `not found` / `error`; the 500
  hides everything including from the operator (nothing is logged server-side either).
- The site publishes no `404.html`, so a broken docs link lands on GitHub's generic 404 with no
  route back — the only fully unbranded dead end in the product.
- `scripts/mcp-server.mjs:468` `target not found: <path>` (codeweb_map) — announce-only; should
  say what `target` must be (absolute path to the repo root; default cwd).
- `scripts/find.mjs` no-hit: `"quantum flux capacitor": 0 match(es) across 0 domain(s)` — the
  one lexical-search miss with no "try different words / shorter terms" step, two doors down
  from the house-standard `find-similar` empty state.
- `scripts/codemod.mjs:53` `--merge needs >=2 resolved symbols (got N)` exits 2 when some
  resolved, 1 when none — one message, two exit codes, neither explained.
- COPY.md #2/#8/#9/#10 (simulate-edit speaking the gate's exit codes; the post-edit hook's
  pointer that fails verbatim; refresh's weak errors; the VS Code toast) — all confirmed live
  during this audit, all still shipping; rewrites in COPY.md stand.

---

## 3. Rewrites — current vs better, verbatim-usable

**R1 · loadGraph's no-graph message** — `scripts/lib/cli.mjs:124`: append the usage, never
substitute it.
- Now (20 tools): *the tool's usage string, alone*
- Better:
  `no map found — checked the graph argument, CODEWEB_WS, and every .codeweb/ above <cwd>.`
  `map this repo first: npx -y @ghostlygawd/codeweb <repo root>   (in Claude Code: /codeweb)`
  `then: <the tool's usage line>`
  (mechanically: `die((no-map line) + '\n' + (usage || default), 2)` — one edit, 20 tools cured)

**R2 · codeweb_map failure** — `scripts/mcp-server.mjs:486`
- Now: `codeweb_map failed (exit 1): [extract]   (Intentionally sparse target? --allow-empty writes an empty map.)` + `[run] stage 'extract' failed (exit 1) — aborting`
- Better, no-source case (the regex at `:483` already detects it — reuse the marker path's own
  words): `codeweb_map found no supported source under <target> — wrong directory? pass target: <code root>. Non-native language? the /codeweb command's agent fallback maps it by reading. (marker written: codeweb_map will say this until the marker file is deleted.)`
- Better, generic case: forward stderr from the **first** `[extract]`/error line (cap ~12
  lines), drop `[run] stage … — aborting` frames, and never let a child suggest a flag the tool
  can't pass (strip/translate `--allow-empty`, the F6 rule).

**R3 · staleness, human transport** — `scripts/query.mjs:92`, `explain.mjs:66`, `brief.mjs:31`
- Now: `⚠ graph is stale for 1+ file(s) (src/a.mjs…) — run codeweb_refresh`
- Better: `⚠ graph is stale for 1+ file(s) (src/a.mjs…) — refresh: node scripts/refresh.mjs <graph>   (agents: codeweb_refresh)`
  (or exactly brief-core.mjs:125's dual form, imported rather than re-typed)

**R4 · the CI gate chain** — `scripts/ci-gate.mjs:44,92` + `action.yml:72-77`
- Now: `[codeweb] gate error: Command failed: <full argv>` → `::error::codeweb gate reported structural regressions …`
- Better, ci-gate: capture child stderr (`stdio: ['ignore','ignore','pipe']`) and throw
  `cannot build the <before|after> graph: <last stderr lines>` — run.mjs's diagnostics already
  say the real cause; stop discarding them.
- Better, action: branch the final step on the gate step's exit code —
  1 → `codeweb gate: structural regressions (see the PR comment / job log)`;
  anything else → `codeweb gate could not run — environment or usage error, not a regression (job log has the cause; most common: shallow checkout — use actions/checkout with fetch-depth: 0)`.

**R5 · empty/non-graph maps at the CLI** — one guard at the `loadGraph`/`runQuery` seam
- Now: `0 orphan(s) — no callers and not exported:` (exit 0, on package.json)
- Better (mirror the MCP's A7 line, same vocabulary): `the map at <path> has 0 symbols (empty, or not a codeweb graph) — structural answers would be vacuous, not "0 findings". re-map at the code root: npx -y @ghostlygawd/codeweb .` exit 2. Also: skip the `bump()` receipt write when nodes = 0 — a wrong answer should not leave a ledger.

**R6 · dead deep links** — `report-template.html` hash-restore + `showNode`
- Now: silent fallback to the default view
- Better: use the existing `announce()` live region + one visible line atop the detail panel:
  `this link points at "<id>", which is not in this map — renamed, deleted, or the map was rebuilt since the link was made. search the name, or re-map and copy a fresh link.`
- Same idea, editor: when `loadIndex` fails on a *present* graph.json, show one `setStatusBarMessage`-grade note (`codeweb: graph.json unreadable — re-map to restore lenses`) instead of nothing.

**R7 · annotate misdirection** — `scripts/annotate.mjs`
- Now: `codeweb annotate: suppressed abc in /wrong/.codeweb (1 total). Source untouched.`
- Better: refuse when `--dir` has no `graph.json` beside it: `no map at <dir> — a suppression written here would never be read. run from the mapped repo, pass --dir <target>/.codeweb, or set CODEWEB_WS.` exit 2. (API.md F7's loader unification delivers this for free.)

**R8 · the timeout** — `scripts/mcp-server.mjs:506`
- Now: `tool timed out after 120s`
- Better: `tool timed out after 120s — likely a busy workspace (a map/refresh writer runs first) or an oversized reply. retry in a moment; prefer the default budget over full:true on large graphs.` And for map: replace `(exit null)` with `killed at the 300s cap`.

**R9 · trend's empty ledger** — `scripts/trend.mjs:169`
- Now: `[codeweb] no snapshots to chart`
- Better: `no snapshots to chart — the history ledger is empty (each full map appends one row to <ws>/history.jsonl). run two maps and retry, pass graph snapshots directly (trend.mjs a.json b.json), or --history <file>.`

---

## 4. Leakage — internals shown to end users

The headline is positive: **zero stack traces reach any surface** — the EPIPE handler
(`cli.mjs:19`), the `ExtractError` guard-path class (`extract-symbols.mjs:69`), run.mjs's
"one clean line, not a raw execFileSync stack dump" policy (`run.mjs:118-120`), the report's
top-level catch, and the hooks' fail-open contract all hold under live probing. Remaining leaks,
flagged for fix:

1. **Argv + temp-path dump in CI logs** — `ci-gate.mjs:92` prints the child's full command line
   (`Command failed: /opt/node22/bin/node … --out-dir /tmp/codeweb-gate-XXXX/after`) as the
   *only* explanation of a build failure. Internal detail standing in for a cause. (R4.)
2. **Internal pipeline frames cross the MCP seam** — `[run] stage 'extract' failed (exit 1) —
   aborting` inside `codeweb_map` errResults (verified). Frame lines are for the terminal that
   watched the stages, not an agent reply. (R2.)
3. **`(exit null)`** in the map-timeout errResult — a process-API artifact as user text. (R8.)
4. **Raw `e.message` from JSON.parse** in `invalid JSON in <path>: Unterminated string in JSON
   at position 200…` (`cli.mjs:129` et al.) — a parser internal, but the position is genuinely
   diagnostic, the path is named, and the trigger is a corrupt file. Verdict: keep, it earns
   its place. Same for the report's `Failed to parse graph data: <e.message>`
   (`report-template.html:186`) — acceptable, but it is also the report's only announce-only
   failure: add the next step (`re-map: npx -y @ghostlygawd/codeweb <repo root>`).
5. **Over-redaction is the inverse leak** — `serve.mjs:35`'s bare `error` (HTTP 500) tells the
   user nothing and logs nothing for the operator. Minimum: log the exception server-side.

Absolute workspace paths in errors (`no graph found … <target>/.codeweb/graph.json`, the
`unsupported.json` marker path) are *not* leaks here — local-only tool, and the path is the
actionable content. Consistent with SECURITY.md's local posture.

---

## 5. Empty vs error vs vacuous — the three-way line

House standard (keep; already shipped): `find-similar` — `no similar existing symbol (>=15%) —
looks novel; safe to write.` States what emptiness *means* and blesses the next action.

| State | Good examples (keep) | Failures (fix) |
|---|---|---|
| Empty = verified absence | `0 orphan(s) — no callers and not exported:` (defines the criterion); report's `— (nothing calls this)`; extract's no-source refusal (escapes-first); brief on an empty map (`a map exists here but it is EMPTY…`, both transports) | report chrome's `🎉` twins + bare `—` empties (COPY.md #7 — stands); `find.mjs` 0-match with no next step (§2 #10) |
| Error = the tool couldn't answer | MCP three-tier discipline; `loadGraph`'s not-found/corrupt pair; near-miss suggestions on symbol miss (`symbol not found: alpa — near matches: src/a.mjs:alpha (concept search: find.mjs …)` — verified) | usage wall standing in for "no map" (§2 #1); gate action's false regression verdict (§2 #3) |
| Vacuous = an answer that means nothing | MCP A7 guard refuses structural answers on 0-node maps; `findings not recounted` chip after refresh (never renders dropped findings as "0") | the same 0-node/non-graph maps answering `0 cycles`, exit 0, at the CLI (§2 #5); campaign rendering a crashed advisor as an empty section (API.md F11 — `degraded` field still unshipped) |

The distinction the product already articulates best (`report-template.html:335`: "a refresh
drops findings and stamps the drop — never render that as 0") is the rule to generalize: **an
absent capability must never render as a zero count.**

---

## 6. Consistency — shapes, and exit codes as part of the message

**Shapes.** MCP holds the three-tier model cleanly (verified: `-32700` parse / `-32602` unknown
tool; `isError:true` with typed, non-repeating arg errors — `missing required argument: symbol`,
`argument symbol must be a string (got number)`, `argument limit must be a non-negative number
(got "abc")`; `found:false` successes carrying `hint`). The CLI shares its payload builders, so
misses read identically across transports. Two seams still leak text across transports — CLI
usage into MCP replies (API.md F6, re-verified live: `codeweb_diff`'s double message telling an
agent to pass a `graph` param the tool doesn't have; `reading_order`'s `--scope` usage) and MCP
tool names into human stderr (§2 #4). The rule both need: **remedies are composed per
transport, at the seam that owns the reply** (`spawnedToolReply` / the text renderers), never
baked into shared strings.

**Exit codes.** The 0/1/2 convention is real, documented per tool, and — new confirmation —
holds even for data-verdict text modes (`symbol not found` = 1 with suggestions; usage/IO = 2;
`--help` = 0 everywhere thanks to the one flag loop). The rim forks are API.md F2's
(bin Node-guards exit 1 = the gate's "regression" code; `run.mjs` target-not-found 1 vs its
siblings' 2; the action collapsing 1 vs 2) — all still shipping. The message-side additions:
`simulate-edit` prints exit codes that belong to a *different tool* while itself exiting 0
(COPY.md #2 — the one place text and exit code contradict outright), and `codemod.mjs:53` maps
one message to 2-or-1 depending on how many symbols resolved. Rule: **a message may cite only
its own exit code, and one condition maps to one code.**

**The pattern (curation).** Bad messages here are not a bad generic handler — they are
*defections* from good ones, and the fix list is short: the usage-override in `loadGraph`
(20 tools, §2 #1), `slice(-3)` in the map wrapper (§2 #2), `stdio:'ignore'` in the gate's
buildGraph (§2 #3), the missing A7 guard on the CLI side (§2 #5), and the two hand-rolled
loaders (`refresh`, `fitness` — COPY.md #9/API.md F7). Restore each to its chokepoint and the
fleet's worst errors disappear in about five edits.

---

## 7. Voice guide — the rules for error copy

Grounded in COPY.md's voice rules; these are the error-specific additions this audit earns.

1. **Cause first, in the reader's words; then the exact next command, runnable from where that
   reader stands.** CLI human → a shell line (`npx -y @ghostlygawd/codeweb .`); Claude Code
   agent → a tool name and the arg shape (`codeweb_map`, `pass target: <code root>`); browser →
   a click or a copyable line. "Failure occurred" is not a message; a remedy for a different
   transport is not a remedy.
2. **A usage string answers a syntax mistake — nothing else.** Environment states (no map,
   stale map, empty map) get their own sentence; showing usage for a valid command blames the
   user for the product's state.
3. **Never curate a child's error from the tail, and never re-emit its flags across a
   transport boundary.** Forward from the first error line; strip internal frames
   (`[run] stage … — aborting`); translate or drop options the current surface cannot pass.
4. **Empty, error, and vacuous are three different sentences.** Empty states say what emptiness
   means and the first action (`looks novel; safe to write.` is the standard). Errors name the
   cause. An answer computed over nothing is refused on *every* transport, not one.
5. **Success messages must be true.** Never print a completion line for a write nothing will
   read (annotate), and never let a wrapper assert a verdict the tool didn't reach
   (`gate reported structural regressions` on exit 2).
6. **A message cites only its own exit code, and its own check.** One failure condition, one
   code; pre-flights describe what they checked, never another tool's verdict (COPY.md rule,
   re-confirmed).
7. **No stack traces, no argv dumps, no `(exit null)` — but keep the diagnostic internals that
   earn their place** (JSON parse positions, absolute workspace paths on this local-only tool).
8. **Silence is a contract, not an accident.** Fail-open surfaces (hooks) stay silent by
   documented design; every other surface that catches an error owes the user one line — and
   the operator a log line (`serve.mjs`'s 500).
9. **Deadpan, lowercase, `⚠` only for staleness/regressions** — an error is never the place for
   an exclamation mark, and never the place for cheer.

---

*Read-only audit; the only repo write is this file. All failure probes ran against scratch
workspaces under the session scratchpad (`stage5/`); one incidental `stats.json` created at the
repo root by a live probe (itself finding §2 #5's side-effect) was removed. Prior-stage overlap
is cited inline: DOCS.md D1/D2, COPY.md #1/#2/#7/#8/#9/#10, API.md F2/F6/F7/F11 — everything
else above is new.*
