# CLI UX audit — 2026-07-24

First run (no prior `CLI.md`). Method: the tool was met the way a stranger meets it — a
terminal, no docs, one goal — and every claim below was **executed live** against a scratch
fixture repo (7-file JS project) mapped into the session scratchpad; the repo's own `.codeweb/`
was never touched. Every invocation's output, exit code (`echo $?`), and stream (stdout vs
stderr) was captured. Builds on `DOCS.md` (D1, Gap 1), `COPY.md` (#1/#2/#5/#9), `API.md`
(F2/F3/F7/F11), and `ERRORS.md` (#1/#4/#5/#7/#8/#10): prior findings that surfaced in the
transcript are **confirmed and cited, not re-argued**; this file goes where they didn't —
help quality, flag grammar, machine mode, stream discipline, and destructive safety.

**Verdict up front.** The middle of this CLI is unusually script-friendly: one flag loop, one
graph loader, `--json` everywhere that matters as valid single-line JSON with data verdicts on
exit 1, a clean EPIPE story, no color (nothing to turn off), and the fleet's one destructive
verb (`codemod --write`) is plan-by-default, gated, and self-reverting. The debt is at the
**edges where a session starts**: help that names files instead of the command you ran and
never shows the fleet, a parser that rejects without coaching (`--version`, `--caller`,
`--limit=5` all die uncoached), the flagship `run.mjs` putting results on stderr and chatter on
stdout with no machine mode at all, and advisory text printed as if it were a result row.

---

## 1. The transcript — a newcomer's first session

Verbatim; `$SP` substitutes the session scratchpad path
(`/tmp/claude-0/…/scratchpad/stage6`) for readability, nothing else edited. Annotations in
*italics*.

```
$ cd $SP/blank && codeweb              # "what does this do?"
[run] extract
[extract] no supported source files under $SP/blank
[extract]   looked for: .js .mjs .cjs .jsx .ts .tsx .mts .cts .py .rs .go .java .cs .rb .php .kt .kts .swift (node_modules, dist, vendor and friends are skipped)
[extract]   wrong directory? Point at the code root. Non-native language? In Claude Code, the
[extract]   /codeweb command falls back to agent-based mapping — no extractor needed.
[extract]   (Intentionally sparse target? --allow-empty writes an empty map.)

[run] stage 'extract' failed (exit 1) — aborting
$ echo $?
1
```
*Bare invocation is an ACTION, not an introduction: it starts mapping the cwd. The extract
error itself is the house's best (escapes first — ERRORS.md #2's beheaded original, intact
here). But the "what is this?" probe already wrote `$SP/blank/.codeweb/` (with a .gitignore)
— a failed hello leaves a directory behind. And the internal `[run] stage … — aborting` frame
is the last word.*

```
$ codeweb --help
usage: run.mjs [<SRC>] [--target <label>] [--out-dir <dir>] [--open] [--full] [--allow-empty]
  <SRC>            path to the codebase to map (default: current directory)
  ...
  --coverage <p>   annotate the graph with a coverage report (lcov or c8 JSON) after mapping
$ echo $?
0
```
*Exit 0, stdout — correct. But: the user typed `codeweb`, the help says `run.mjs` — a file
that is not on their PATH. No sentence says what the tool does. No example. The synopsis line
lists 6 flags while the rows below document 9 (`--serve`, `--stages`, `--coverage` missing
from it). And nothing anywhere mentions that `codeweb-query`, `codeweb-diff`, or ~26 more
tools exist — from the terminal, the fleet is undiscoverable (DOCS.md Gap 1's doc gap is
also a help gap).*

```
$ codeweb help
[run] target not found: $SP/blank/help
$ echo $?
1
$ codeweb --version
unknown flag: --version
usage: run.mjs [<SRC>] [--target <label>] ...
$ echo $?
2
```
*`help` is read as a path to map (exit 1, no remedy — ERRORS.md #7's error, hit via the most
innocent word a newcomer types). `--version` does not exist anywhere in the fleet (`-v`
neither) — the only way to learn your version is the stderr banner of a successful map
(`run.mjs:264`). Two universal CLI reflexes, both punished.*

```
$ cd $SP/fixture && codeweb            # the real task — works, ~1s
[run] extract
[extract] 7 symbols, 3 edges ... from 7 files ...
...
[run] done -> $SP/fixture/.codeweb · codeweb v0.10.0
[run] mapped 7 symbols -> 0 actionable finding(s) — details: optimize.md
[run] next:
[run]   1. see the map: xdg-open $SP/fixture/.codeweb/report.html
[run]   2. live queries in Claude Code: claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp
[run]   3. after edits: re-run codeweb here — the refresh is cache-warm (seconds, not a re-map)
$ echo $?
0
```
*The success path is genuinely good — result first, artifacts named, three next steps. All of
it on **stderr**. What was on stdout? The stages' internal chatter (`hubs stripped
(indeg>=12): 0`, `source: FOUND — body-confirmed`, `[codeweb] wrote …report.html`). Run it
again (memo hit) and stdout is **empty**. `codeweb . 2>/dev/null` — the standard "hide the
noise" move — shows nothing at all. See lens 6.*

```
$ node scripts/query.mjs --callers helper          # from inside the mapped repo
[codeweb] using $SP/fixture/.codeweb/graph.json (nearest .codeweb above cwd)   [stderr]
callers of helper: 1                                                           [stdout]
  src/app.mjs:main
$ echo $?
0
$ cd ../blank && node scripts/query.mjs --cycles   # from an unmapped dir
usage: query.mjs [graph.json] <--callers|--callees|--tests|--dependents|--impact <symbol> | --cycles | --orphans> [--limit N] [--offset N] [--json]
$ echo $?
2
```
*First call: walk-up discovery announced on stderr, results clean on stdout — the fleet at its
best. Second call: valid syntax, unmapped cwd → a bare usage wall, exit 2 — **ERRORS.md #1
confirmed live** (`cli.mjs:124` lets a tool's `usage` replace the actionable no-map message;
20 tools do). The newcomer's correct command is answered with "you typed it wrong."*

```
$ node scripts/query.mjs .codeweb/graph.json --caller helper       # typo: one letter
unknown flag: --caller
usage: query.mjs [graph.json] <--callers|...> [--limit N] [--offset N] [--json]
$ echo $?
2
$ node scripts/query.mjs .codeweb/graph.json --callers helpr       # typo'd symbol
symbol not found: helpr — near matches: src/util.mjs:helper (concept search: find.mjs "<free text>")
$ echo $?
1
```
*The contrast that defines this CLI: typo a **symbol** and you get a near-match plus a next
tool; typo a **flag** (or type `--limit=5`, or `--version`) and you get "unknown flag" plus a
wall. The did-you-mean machinery exists one layer down and the parser knows every valid flag
name — it just never compares (`cli.mjs:50`).*

---

## 2. The command tree (as the terminal presents it)

- **Bins (npm PATH surface): 4** — `codeweb` (map), `codeweb-mcp` (stdio server; run
  interactively it sits silent — no "listening" line, exits 0 on EOF), `codeweb-query`,
  `codeweb-diff`. Each is a Node≥22 guard shim that **exits 1** on old Node
  (`bin/codeweb-diff.mjs:6-9` — the gate's "regression" code; API.md F2).
- **Scripts (clone surface): ~30 entry points** under `scripts/` with no index command, no
  `codeweb help <sub>`, no cross-listing in any `--help`. Depth lives entirely in flags.
- **Global flags in practice:** `--help/-h` (all, via the one parser), `--json` (~25 tools),
  `--limit`/`--offset` (query family), `--out` (write-target on 6 tools). No `--version`, no
  `--quiet` (except `serve.mjs`), no color/no `--no-color` needed.
- **Grammar (one parser, `cli.mjs:39-69`):** space-separated values only — `--limit=5` →
  `unknown flag: --limit=5` (exit 2, no hint that `--limit 5` works); single-dash long flags
  are silently accepted (`-callers helper -json` works — undocumented leniency that forecloses
  ever adding short flags); no `--` end-of-flags separator (`query.mjs g.json -- --cycles` →
  `unknown flag: --`, so dash-leading paths are unaddressable); lone `-` is a positional.

---

## 3. Exit-code table (all observed live; ✔ = scriptable, ✘ = trap)

| Scenario (command) | Exit | Stream used | Scriptable verdict |
|---|---|---|---|
| `codeweb --help` (any tool `--help`) | 0 | usage → stdout | ✔ |
| `codeweb` success (map built / memo reuse) | 0 | result+banner → stderr; stage chatter → stdout | ✘ inverted streams, no `--json` |
| `codeweb <bad-path>` (`codeweb help`) | 1 | stderr | ✘ collides with stage-failure 1; siblings use 2 (ERRORS.md #7, API.md F2) |
| `codeweb` on empty dir (no source) | 1 | stderr | ✔ code; message ends in an internal frame |
| `codeweb --version` / unknown flag anywhere | 2 | stderr | ✔ code; ✘ no version exists at all |
| flag missing its value / `--limit -3` | 2 | stderr, names the flag and floor | ✔ the good pattern |
| query/find/etc. from unmapped cwd | 2 | stderr, bare usage wall | ✘ valid syntax answered as usage error (ERRORS.md #1) |
| `query --callers <hit>` | 0 | results → stdout | ✔ |
| `query --callers <miss>` text | 1 | stderr with near-matches | ✔ |
| `query --callers <miss> --json` | 1 | `{"found":false,…}` → stdout | ✔ model behavior |
| `query <package.json> --orphans` (non-graph JSON) | 0 | "0 orphan(s)" → stdout **+ writes stats.json beside it** | ✘✘ confident wrong answer (ERRORS.md #5 confirmed) |
| `diff <a> <b>` no regression / regression / missing arg | 0 / 1 / 2 | stdout / stdout / stderr | ✔ the contract as documented |
| `simulate-edit --delete <sym>` on a BLOCK | **0** | stdout: "BLOCK — the gate would reject this edit **(exit 1)**" | ✘✘ text cites another tool's code while exiting 0 (API.md F2, COPY.md #2 — verbatim in transcript) |
| `codemod --merge` plan ok / `--write` applied | 0 | stdout | ✔ |
| `codemod --merge` unresolved: 0 resolve / 1 resolves | 1 / 2 | stderr, same message | ✘ one condition, two codes; failing ids never named (ERRORS.md #10) |
| `annotate --suppress x` in unmapped dir | 0 | stdout success line | ✘ false success — writes an orphan `.codeweb/` (ERRORS.md #8 confirmed) |
| `refresh` no args / ok | 2 / 0 | stderr usage / stdout | ✔ codes; ✘ weak error (COPY.md #9) |
| `query … \| head -1` (early pipe close) | 0 | no stack trace | ✔ EPIPE handled (`cli.mjs:19`) |
| bins on Node < 22 | 1 | stderr | ✘ = `codeweb-diff`'s regression code (API.md F2; from source, not executable here) |

---

## 4. Findings by lens

Each: command · quoted output · fix · effort (S/M/L).

### Lens 1 — Help that answers

**1.1 Help names a file the user cannot run, on every surface.** `codeweb --help` →
`usage: run.mjs …`; `codeweb-query --help` → `usage: query.mjs …`; `codeweb-diff --help` →
`usage: diff.mjs …`. The bin name the user actually typed appears in no usage string, so the
copy-paste loop breaks on the first screen (`query.mjs` is not on PATH for an npm install).
Fix: usage strings take the invoked name (`basename(process.argv[1])` or a constant per bin)
— one change in each USAGE constant, or one substitution in `parseArgs`. **S**

**1.2 No help level says what a tool does, and none shows an example.** Every USAGE except
`run.mjs`'s is a single synopsis line (`usage: brief.mjs <graph.json> [--json]`); `run.mjs`
describes flags but never the product ("map your codebase" appears nowhere in `--help`).
The README's excellent per-tool examples (`README.md:254-267`) never made it into the
binaries. Fix: one description line + one example per USAGE string. **M**

**1.3 The fleet is invisible from the terminal.** No index: `--help` on the main bin does not
mention query/diff/optimize/hotspots/…, there is no `codeweb help <sub>`, no `list` command.
A terminal-only user can discover exactly one verb (map). `codeweb help` → `[run] target not
found: …/help`, exit 1. Fix: recognize the word `help` (and no-op positional `commands`) in
`run.mjs` and print the fleet table DOCS.md's proposed `docs/cli.md` would hold; cheapest
version is 15 static lines. **S-M**

**1.4 The synopsis line of the one multi-line help omits a third of its flags.**
`usage: run.mjs [<SRC>] [--target <label>] [--out-dir <dir>] [--open] [--full]
[--allow-empty]` — `--serve`, `--stages`, `--coverage` are documented in the rows below but
absent from the line people copy. Fix: complete the line or shorten it to
`run.mjs [<SRC>] [flags]`. **S**

**1.5 Usage strings misstate the graph argument three different ways.** `query.mjs` says
`[graph.json]` (true: optional), `explain.mjs`/`brief.mjs` say `<graph.json>` (looks
required; isn't), six tools append `(or set CODEWEB_WS)`, the rest don't — while all
loadGraph tools accept the same triple (arg → env → walk-up, `cli.mjs:115-124`). API.md F7
flagged the env-var inconsistency; the brackets inconsistency compounds it: the same
capability is advertised as required, optional, or env-only depending on which tool you ask.
Fix: one suffix, stamped by `parseArgs`/`loadGraph`, e.g. `[graph.json]` + `(graph: arg →
CODEWEB_WS → nearest .codeweb)`. **S**

### Lens 2 — Flag grammar

**2.1 `--flag=value` is rejected as an unknown flag with no hint.**
`--limit=5` → `unknown flag: --limit=5` + usage, exit 2 (`cli.mjs:50`). The GNU form is the
single most common muscle-memory grammar; the message never says "use `--limit 5`". Fix:
split on the first `=` in `parseArgs` before lookup (4 lines) — or at minimum special-case
the error text. **S**

**2.2 Single-dash long flags are silently legal.** `-callers helper -json` behaves exactly
like the double-dash form (`cli.mjs:48`: `t.replace(/^--?/, '')`). Undocumented, inconsistent
with the fleet's otherwise strict rejection posture, and it permanently blocks classic
clustered short flags. Fix: decide and document; if kept, one line in usage; if dropped,
reject with "did you mean --callers". **S**

**2.3 No `--` separator.** `query.mjs g.json -- --cycles` → `unknown flag: --`. Any target
path starting with `-` is unaddressable. Rare but standard grammar. Fix: treat `--` as
end-of-flags in the one loop. **S**

**2.4 Write-target flags: `--out` (file, 6 tools) vs `--out <dir>` (screenshot) vs
`--out-dir` (run.mjs) vs `--md` (ci-gate).** Also the budget word: `--limit` (7 tools) vs
`--k` (find-similar) vs `--budget` (campaign/reading-order, deliberate per API.md F3) vs
`--n` (bench) vs `--last` (trend). And the only negations are `--no-md`/`--no-ctags`. This is
the CLI mirror of API.md F3's four pagination dialects — same concept, five spellings. Fix:
alias `--out` on run.mjs and `--limit` on find-similar/bench (keep old names); document the
budget-vs-limit distinction as intentional. **S-M**

**2.5 The pair flag is coached but odd.** `reading-order.mjs --scope domain` →
`flag --scope needs two values` (exit 2) — the only two-token flag in the fleet
(`--scope <kind> <value>`), a grammar no completion or wrapper expects. Fine to keep; name it
in usage as two tokens explicitly (it does). No action beyond awareness. **S**

### Lens 3 — Errors that coach

**3.1 Flags have no did-you-mean while symbols do.** Transcript: `--caller` → `unknown flag:
--caller` + wall; `helpr` → `near matches: src/util.mjs:helper`. The parser holds
`Object.keys(spec.flags)` at the rejection site (`cli.mjs:50`); a one-edit-distance
suggestion is ~6 lines and would fire on `--caller`, `--imapct`, `--jsno`, `--version`
(→ "codeweb has no --version; the version prints in the map banner"), and `--dry-run`
(→ codemod's plan default). Fix in the one loop, every tool inherits. **S**

**3.2 The no-map usage wall (ERRORS.md #1) — confirmed live, worst first-contact error.**
Transcript above; 20 tools substitute usage for the cause. ERRORS.md R1's append-don't-replace
rewrite stands; it belongs in the same `cli.mjs` patch as 3.1. **S**

**3.3 A missing mode is answered by grammar, not a sentence.** `query.mjs g.json` (no mode
flag) → bare usage, exit 2. Contrast the same file's flag-value error (`flag --callers needs
a value`) which names the problem. Fix: `pick exactly one of --callers/--callees/--tests/
--dependents/--impact/--cycles/--orphans` above the usage (`query.mjs:47`). Same for
`diff.mjs:32` (`need two graphs: <before.json> <after.json>`). **S**

**3.4 codemod's resolution failure hides the culprits.** `--merge copyPasta,nope` →
`--merge needs >=2 resolved symbols (got 1)`, exit 2 (exit 1 when 0 resolve — ERRORS.md #10's
fork, both observed). Which id failed, and the near-matches query.mjs would print, are absent
— on the tool where a wrong id is most consequential. Fix: name unresolved ids + reuse
`suggestSymbols`; one code for one condition. **S**

**3.5 The good pattern to copy, observed:** `flag --limit must be >= 0 (got -3)` — flag,
constraint, actual value, exit 2 (`cli.mjs:59`). And `explain.mjs .codeweb/graph.json` (symbol
forgotten) → `symbol not found: .codeweb/graph.json` — the single positional is assumed to be
the symbol (`explain.mjs:26-28`), so the graph path is reported as a missing *symbol*.
A `.json`-or-exists check would flip the message to "graph given but no symbol". **S**

### Lens 4 — Exit-code contract

Confirmed live: the 0/1/2 convention holds across the middle (table §3) including `--help`=0
everywhere and JSON data verdicts riding exit 1 with `found:false` payloads — a contract a
wrapper can genuinely script against. The rim forks are all prior findings, now with
transcripts: `run.mjs` bad target = 1 alongside its own exit-2 siblings (ERRORS.md #7);
`simulate-edit` prints `(exit 1)` about a different tool while exiting 0 — the one place text
and code contradict outright (API.md F2/COPY.md #2; §1 transcript); codemod's 2-or-1 single
message (3.4); bins' Node guard = 1 = the diff gate's regression code (API.md F2). New here:
**every fork is at a rim that CI or a wrapper reads first** — the fix list is four numbers
(`run.mjs:76` → 2; guard shims → 2; simulate exits its verdict or stops citing codes;
codemod one code), all breaking-lite, all CHANGELOG-worthy per API.md's sequencing. **S**

### Lens 5 — Machine mode

**5.1 The flagship has none.** `run.mjs` — the command every session starts with — has no
`--json` and no `--quiet`; its scriptable facts (symbol count, findings, workspace path,
staleness of reuse) exist only inside a stderr prose banner (`run.mjs:264-309`). A CI wrapper
that wants "where did the map land" must scrape `[run] done -> <path>` off stderr. Fix:
`--json` emitting one line (`{ws, symbols, actionable, reused, version}`) on stdout and
demoting stage chatter; the banner already computes every field. **M**

**5.2 Where `--json` exists, it is right.** Observed: single-line JSON, deterministic keys,
diagnostics kept off stdout (`[codeweb] using …` notice → stderr; `jq` parses every probe),
staleness as a structured `stale` field, `found:false` + exit 1 on misses, EPIPE-safe. Two
blemishes, both prior-flagged, both confirmed: `trend --json` pretty-prints multi-line
(API.md F11 — the one NDJSON hold-out) and `risk --limit 2` in *text* mode prints all rows
(hard-coded `ranked.slice(0, 15)`, `risk.mjs:77` — a flag accepted and silently ignored,
which is worse than rejection; JSON honors it). **S each**

**5.3 The CLI `--json` hints speak MCP.** `{"hint":"no symbol matches … — try codeweb_find
\"<free text>\" …"}` — a shell consumer is told to call an MCP tool (`query-core` shared
string; ERRORS.md #4's seam, the JSON side). ERRORS.md judged the JSON copies acceptable for
agent readers; noting here that `--json` CLI readers are usually shell scripts, the same
per-transport composition rule should eventually cover them. **S, low priority**

### Lens 6 — Stream discipline

**6.1 `run.mjs` is inverted.** Fresh map: stdout carries the stages' internals (`hubs
stripped (indeg>=12): 0`, `[codeweb] wrote …report.html` — inherited child stdout,
`run.mjs:116`), stderr carries the results (banner, artifact list, next steps). Memo-hit map:
stdout is **empty**. Both standard moves fail: `codeweb . 2>/dev/null` shows nothing useful;
`codeweb . | grep mapped` catches nothing. Every other tool in the fleet gets this right,
which is what makes the flagship's inversion surprising. Fix: pipe children's stdout to
stderr (they are progress by definition), print the final banner (or 5.1's JSON) to stdout.
**S-M**

**6.2 Advisories print as result rows.** Text-mode staleness lands on stdout, indented like
data: `  ⚠ graph is stale for 1+ file(s) (src/dupB.mjs…) — run codeweb_refresh`
(`query.mjs:92`, `explain.mjs:66`; pagination's `  … +1 more` line same class,
`query.mjs:91`). `query --orphans | wc -l` counts the warning; `| tail -1` returns it instead
of a result. ERRORS.md #4 rewrote this line's *words* (MCP tool name on the human transport —
confirmed at all three sites); the *placement* is this audit's addition: advisories belong on
stderr in text mode exactly as they already ride a side-channel field in JSON mode. Fix: move
both prints to `console.error`. **S**

**6.3 Small good news.** `serve.mjs` announces its URL on stdout (reasonable — it is the
result) with `--quiet` available; discovery notices are stderr; no progress bars exist to
poison pipes; `| head` never stack-traces (EPIPE handler, `cli.mjs:19`).

### Lens 7 — Destructive safety

**7.1 The dangerous verb is the fleet's best surface.** `codemod` defaults to a plan
(`(plan-only — pass --write to apply, gated + reversible)`), refuses predicted regressions
(exit 1), refuses ambiguous rewrites (exit 2), backs up in-memory, re-extracts, re-gates, and
reverts byte-for-byte on regression (`codemod.mjs:83-183`) — verified live: `--write` applied
cleanly to the scratch fixture and `git status` stayed clean everywhere else. Two gaps:
(a) after `write: APPLIED to 1 file(s)` the workspace graph is now stale and the success line
doesn't say so — the very next query warned `⚠ graph is stale … (src/dupB.mjs…)`; codemod
knows it just invalidated the map and could either refresh it (it already re-extracted!) or
say `re-map/refresh to update the map`. (b) No on-disk undo artifact after success — fine,
but worth one line in the applied message (`revert with git checkout -- <files>`). **S**

**7.2 Bare invocation is a write.** `codeweb` with no args maps the cwd — deliberate
(zero-required-args quickstart), but the failure transcript shows even a "what is this?"
probe in the wrong directory creates `.codeweb/` before knowing whether there is anything to
map (`run.mjs:89` mkdir precedes extract). In `$HOME` it would begin scanning everything
below. Fix: create the workspace only after extract finds sources (or clean it up on the
no-source abort), and name the target in the first output line (`[run] mapping <dir> ->
<ws>`), giving the Ctrl-C reflex something to react to. **S**

**7.3 `--out-dir` seeds any directory, silently.** Pointed at a dir already holding files, it
adds ~13 artifacts beside them without confirmation (verified: existing file untouched —
fixed filenames only, nothing deleted; `.gitignore` contract written). Acceptable, but paired
with 7.2's mkdir-first it means any typo'd `--out-dir` mints workspaces. One
`[run] writing 13 artifacts into non-empty <dir>` stderr note would do. **S**

**7.4 The misdirected write, confirmed.** `annotate --suppress deadbeef123` from an unmapped
dir: `codeweb annotate: suppressed deadbeef123 in $SP/blank/.codeweb (1 total). Source
untouched.` — exit 0, fresh orphan `.codeweb/` created, suppression unreachable by any tool
(ERRORS.md #8 / API.md F7; rewrite R7 stands — refuse without a graph beside the dir). The
only write in the fleet that neither confirms, plans, nor validates its destination. **S**

**7.5 The vacuous read that writes.** `query.mjs ./pkg-copy.json --orphans` → `0 orphan(s)`,
exit 0, **and a `stats.json` appears beside the probed file** (ERRORS.md #5's side effect,
reproduced on a scratch copy). A read-only question against a non-graph both lies and leaves
a ledger. ERRORS.md R5's guard (refuse 0-node/non-graph maps, skip the `bump()`) covers both
halves. **S**

---

## 5. Curation — three roots explain most of it

1. **`lib/cli.mjs` owns the worst minute of every session.** Unknown-flag wall (no
   did-you-mean, no `=` support, no invoked-name) at `:50`, usage-replaces-cause at `:124`,
   `-`/`--` grammar at `:47-48`. One ~30-line patch to the shared parser + loader fixes 3.1,
   3.2, 2.1, 2.2, 2.3, and half of 1.1 for all ~30 tools at once.
2. **`run.mjs` is the only tool that predates the fleet's own conventions.** Streams inverted
   (6.1), no machine mode (5.1), exit-1 bad-target (lens 4), mkdir-before-validate (7.2),
   synopsis drift (1.4), no `help`/`--version` words (1.3). It is also the most-run command.
3. **Advisory text placed as data** (6.2 + 5.3): one decision — "advisories are stderr in
   text mode, fields in JSON mode" — applied at the three staleness sites and the `… +N more`
   line.

Everything else is per-tool trim: risk's dead `--limit` (5.2), codemod's messages (3.4, 7.1),
annotate's destination check (7.4), trend's pretty JSON (5.2), simulate's exit-code line
(lens 4, fix already specified in API.md §5).

---

## 6. The first fix

**Teach `lib/cli.mjs` to coach: did-you-mean on unknown flags, accept `--flag=value`, speak
the invoked command's name, and append — never replace — the no-map cause (ERRORS.md R1
folded in).** Every session that mistypes anything, starts in the wrong directory, or arrives
from the README meets this parser before any tool logic runs, so a ~30-line change to one
shared file upgrades the first minute of all ~30 tools simultaneously — including turning
`--version`, `--caller`, and `--limit=5` from walls into one-line corrections. It is the
highest ratio of sessions-improved to lines-changed anywhere in this audit, and it is pure
addition: no exit code, payload, or documented behavior changes, so nothing scripted against
today can break. The `run.mjs` stream/machine-mode work (roots 2, findings 5.1/6.1) is the
close second and the right follow-up release.

---

*Read-only audit; the only repo write is this file. All maps, workspaces, probes, and the
codemod `--write` ran against scratch fixtures under the session scratchpad (`stage6/`);
`git status --short` on the repo shows only this file. Confirmed-live prior findings are
cited inline (ERRORS.md #1/#4/#5/#7/#8/#10, API.md F2/F3/F7/F11, DOCS.md D1/Gap 1, COPY.md
#2/#5/#9); all other findings above are new.*
