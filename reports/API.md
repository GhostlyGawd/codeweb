# API contract review — 2026-07-24

First run (no prior `API.md`). This repo has no HTTP API; its **contracts** are (1) the 27 MCP
tools served by `scripts/mcp-server.mjs` over stdio JSON-RPC, (2) the CLI fleet
(`scripts/*.mjs` front doors + the four `bin/` shims), (3) the workspace data contract
(`graph.json` + `.codeweb/*` sidecars), and (4) the three Claude Code hooks (`hooks/*.mjs`).
Method: every surface was read in full and the load-bearing claims **executed** — the MCP server
was driven over real stdio (error shapes, pagination, validation edges, `codeweb_map` failure
paths), all three hooks were fed real hook-protocol payloads, and the gate divergence was
reproduced head-to-head on a scratch workspace. Builds on `DOCS.md` (D1/D2, Gaps 1–5) and
`COPY.md` (worst-10 #2/#5/#8/#9); confirmations are cited, not restated.

Verdict up front: the machinery is unusually disciplined — one flag loop, one graph loader, one
payload assembler per tool ("one truth, two transports"), atomic writes, versioned sidecars,
additive-only tool evolution pinned by `check-consistency`. The contract debt is concentrated in
four places: **the regression gate means three different things**, **exit codes fork at the
edges**, **pagination speaks four dialects**, and **the MCP transport silently swallows argument
mistakes the CLI rejects loudly**.

---

## 1. Surface inventory

### 1a. MCP tools (`scripts/mcp-server.mjs`, stdio JSON-RPC; protocols 2024-11-05 / 2025-03-26 / 2025-06-18)

Consumers: Claude Code plugin agents (highest volume), any MCP client. `graph` optional
everywhere (arg → `CODEWEB_WS` → nearest `.codeweb/graph.json` walk-up). R/W = queued writer.

| Tool | Required | Optional | Budget default | Backing CLI | Notes |
|---|---|---|---|---|---|
| codeweb_callers | symbol | graph, limit, offset, full | limit 20 | query.mjs --callers | in-process fast path |
| codeweb_callees | symbol | graph, limit, offset, full | limit 20 | query.mjs --callees | |
| codeweb_impact | symbol | graph, limit, offset, full | limit 20 | query.mjs --impact | |
| codeweb_cycles | — | graph, limit, offset, full | limit 15 | query.mjs --cycles | |
| codeweb_orphans | — | graph, limit, offset, full | limit 25 | query.mjs --orphans | |
| codeweb_tests | symbol | graph, limit, offset, full | limit 20 | query.mjs --tests | |
| codeweb_find | query | graph, limit, offset, full | limit 10 | find.mjs | |
| codeweb_explain | symbol | graph | — | explain.mjs | |
| codeweb_context | symbol | graph, limit, window, full | limit 12 | context-pack.mjs | `full` overloaded (F5) |
| codeweb_brief | — | graph | — | brief.mjs | |
| codeweb_diff | before, after | — | — | diff.mjs | graphless; in-process + spawn fallback |
| codeweb_refresh | — | graph | — | refresh.mjs | **writer** |
| codeweb_find_similar | signature\|body | graph, structural | — | find-similar.mjs | no k/limit on MCP |
| codeweb_placement | calls | graph | — | placement.mjs | no --name/--body on MCP |
| codeweb_review | changed | graph, before, gate | — | review.mjs | no --range on MCP |
| codeweb_fitness | — | graph, rules | — | fitness.mjs | |
| codeweb_risk | — | graph, changed, limit, full, all | limit 15 | risk.mjs | **no offset** |
| codeweb_break_cycles | — | graph, limit, full | limit 10 | break-cycles.mjs | **no offset** |
| codeweb_deadcode | — | graph, limit, full, all | limit 20 | deadcode.mjs | **no offset** |
| codeweb_codemod | merge | graph, into | — | codemod.mjs | plan-only (no --write) — correct |
| codeweb_hotspots | — | graph, limit, full, all | limit 15 | hotspots.mjs | **no offset** |
| codeweb_campaign | — | graph, budget, full, all | budget 25 | campaign.mjs | `budget`, not `limit` |
| codeweb_reading_order | — | graph, scope, value, budget | budget 20 | reading-order.mjs | `budget`, not `limit` |
| codeweb_simulate | delete\|merge\|move | graph, into, to | — | simulate-edit.mjs | |
| codeweb_annotate | suppress\|list | graph, note | — | annotate.mjs | **writer** (annotations.json) |
| codeweb_stats | — | graph | — | stats.mjs | |
| codeweb_map | — | target, out | — | run.mjs | **writer**; progress notifications |

Protocol methods: `initialize` (echoes a supported protocolVersion, else 2025-06-18; verified),
`ping`, `tools/list`, `tools/call`, `notifications/cancelled` (kill/suppress). Batch arrays
fan out with per-line responses (documented deviation). Protocol errors: -32700 parse, -32600
invalid request, -32601 method, -32602 unknown tool. Tool errors: `{content, isError:true}`.
Data verdicts (`found:false`, `ok:false`) are **successes** — verified.

### 1b. CLI fleet

Consumers: humans, CI (`.github/actions/codeweb-gate`), scripts, the MCP server itself
(spawned children with `--json`). Fleet-wide conventions (via `lib/cli.mjs`): one flag loop
(unknown flag → exit 2 + usage; `--help` → 0), `--json` for machine output, exit 0 = ok /
1 = data verdict (not-found, regression, error-severity violation) / 2 = usage/IO. Bins:
`codeweb` (run.mjs), `codeweb-mcp`, `codeweb-query`, `codeweb-diff` — each a Node ≥22 guard
shim (**exit 1** on old Node; see F2). `codeweb-query`/`codeweb-diff` + `run.mjs --serve` /
`--stages` are shipped-but-undocumented (DOCS.md Gap 1). CLI-only capability not on MCP:
`query.mjs --dependents`, `review.mjs --range`, `find-similar --k`, `risk/hotspots
--churn|--git`, `codemod --opportunity/--write`, `placement --name/--body`, `trend`,
`optimize`, `coverage`, `ci-gate`, `serve`, `screenshot`.

### 1c. Workspace data contract (`<target>/.codeweb/`)

| File | Writer | Versioned? | Consumers |
|---|---|---|---|
| graph.json | run/cluster, refresh, coverage | **no** (F8) | every tool, report, hooks, editor ext, users' commits |
| fragment.json | extract | no | cluster, stage memo |
| report.html/.md, overlap.md, optimize.md | build-report/overlap/optimize | no | humans |
| brief.json, index-lite.json, stale-stamps.json | sidecars.mjs (map + refresh) | v1, loader-checked | hooks fast paths |
| similar-index.json | sidecars.mjs | v2, loader rejects v1 | find-similar, review dup-check |
| hook-baseline.json | run/refresh | v1, loader-checked | post-edit hook |
| .stages.json | run.mjs | MEMO_VERSION=1 in key | run.mjs reuse |
| .scan-cache.json | extract | internal | extract, hooks |
| annotations.json, history.jsonl | annotate / run | no version; tolerant loaders | **committed by users** (workspace .gitignore whitelists them) |
| stats.json, flagged.json, unsupported.json | stats/hooks/MCP | no | receipts, dedupe, R11a routing |

### 1d. Hooks (Claude Code → hook stdin JSON; hook stdout JSON)

| Hook | Event | Input consumed | Output | Verified |
|---|---|---|---|---|
| session-brief | SessionStart (startup\|resume\|clear) | `cwd` | `hookSpecificOutput.additionalContext` (~2KB brief) | yes |
| pre-edit-impact | PreToolUse (Edit\|Write\|MultiEdit) | `tool_input.file_path\|filePath` | `permissionDecision:"allow"` + `additionalContext` card | yes — see F10 |
| post-edit-diff | PostToolUse (same matcher) | same | stderr line **and** `additionalContext` (same text twice) | yes |

All three: fail-open exit 0, inert when unmapped (verified).

### 1e. Auth

N/A by design — local stdio server, no network listener except `serve.mjs` (binds 127.0.0.1
only, path-traversal-guarded; verified in source); SECURITY.md's local-only posture holds. The
one permission-adjacent wrinkle is F10 (the pre-edit hook answers the permission system, not
just the transcript).

---

## 2. Inconsistency findings

Ordered by consumer impact. Each: surface(s) · issue · impact · fix (NB = non-breaking, B = breaking).

### F1 — "The gate" is three contracts wearing one name (correctness)
**Surfaces:** `diff.mjs` / `codeweb_diff` / `ci-gate.mjs` / gate action vs `simulate-edit.mjs` /
`codeweb_simulate` / `codemod` projectedGate / post-edit hook vs `review.mjs --gate`.
Three verdict functions ship:
1. `diffGraphs` (graph-ops orphan set): new cycle + new **confirmed** duplication + an existing
   symbol newly *orphaned* — where orphan = no call/import/inherit/ref in-edge **and not
   exported** (`graph-ops.mjs:524-528`).
2. `structuralRegressions`: new cycle + an existing symbol whose **call**-callers drop to zero,
   **exports irrelevant**, import/ref/inherit edges irrelevant (`graph-ops.mjs:554-569`).
3. `review --gate`: (2) **plus** incremental body-confirmed `newDuplications` (`review.mjs:91-95`)
   — and it can fail on duplication alone, without `--before`, which the MCP description doesn't say.
Reproduced live in this review: deleting the only caller of an exported symbol —
`simulate-edit` printed `BLOCK — the gate would reject this edit (exit 1)`; `diff.mjs` on the
real before/after printed `ok — no structural regressions`, exit 0. The divergence has **two
axes** (export exemption AND edge-kind set), plus the duplication axis in (3). DOCS.md D2
documented the two-way split; the review confirms it and adds `review --gate` as a third
semantics and `codemod` as a fourth consumer of (2).
**Impact:** agents running the documented simulate → edit → diff loop (`commands/apply.md`) get
contradictory verdicts on the same edit; CI adopters believe exported symbols losing their last
caller fail the build (they don't).
**Fix:** NB now — each payload names its check (`check: "orphan-gate" | "call-caller-preflight"`)
and the docs state both conditions (DOCS.md's wording); B later — one shared verdict function
with a deprecation path (§5).

### F2 — Exit codes fork exactly where CI reads them (correctness at the edges)
The fleet convention (0/1/2) holds in the middle and breaks at the rims:
- **`bin/*` Node-guard exits 1** on Node < 22 — for `codeweb-diff` that is byte-identical to
  "regression found". A CI wrapper keying on exit 1 reports a *structural regression* on a
  mis-provisioned runner. (`bin/codeweb-diff.mjs:6-9`.)
- **`run.mjs` target-not-found exits 1** (`run.mjs:76`) while its own sibling errors (bad
  `--stages`, missing `--coverage` file) exit 2, and every loadGraph tool uses 2 for
  graph-not-found. 1 is also `run.mjs`'s stage-failure code — a wrong path and a real pipeline
  failure are indistinguishable.
- **`simulate-edit` exits 0 on BLOCK** (verdict only in `projected.ok`), while `diff`, `review
  --gate`, `fitness`, and `ci-gate` all exit 1 on their block condition — so the one tool named
  "the pre-flight for the gate" is the one tool a shell can't gate on. Its text even says
  "(exit 1)" *about a different tool* (COPY.md #2). `codemod` plan-only also exits 0 on a BLOCK
  plan; `--write` refused exits 1.
- **The gate action collapses 1 vs 2**: `continue-on-error: true` + "outcome != success" →
  always the message "reported structural regressions" (`action.yml` final step) — a shallow
  checkout (the documented fetch-depth trap) fails PRs with a *regression* message. `ci-gate.mjs`
  itself carefully distinguishes 1 from 2; the action throws that away.
**Fix:** NB — action branches its message on the gate step's actual exit code; document the
codes per tool in one table (DOCS.md's proposed `docs/cli.md`). B-lite — bins exit 2 (or a new
3) for the env guard; `run.mjs` target-not-found → 2. Wrappers keying on "nonzero" unaffected;
call it out in the CHANGELOG.

### F3 — Pagination speaks four dialects, and the server's own instructions overpromise (agent loops)
Dialect A (query family + find): `limit`+`offset`+`full`, `more:{remaining,nextOffset}`,
`count` = true total. Dialect B (risk, hotspots, break_cycles): `limit`+`full`, `more:{remaining}`
— **no offset param**, so the advertised remainder is unreachable except via `full:true`.
Dialect C (deadcode: `moreSafe`/`moreReview`; context: `moreCallers`/`moreCallees`) — per-tier
keys, no offset. Dialect D (campaign, reading_order): the budget param is named `budget`, and
`reading_order` emits **no** remainder marker at all (truncation is invisible).
Verified: `codeweb_risk {limit:2, offset:50}` returns page 0, **silently** — the MCP handler
forwards `offset` only when the tool's opt list contains it (`mcp-server.mjs:732`), yet the
handshake INSTRUCTIONS say "Pass full:true for the unabridged list, **or limit/offset to page**"
for all budgeted tools. An agent paging risk loops on page 0 forever.
Also: **`find-similar`'s `count` is the capped length** (`find-similar.mjs:103` — `count:
top.length` after `slice(0, k)`), contradicting the "count is the true total" contract every
other tool keeps (and that `codeweb_impact`'s description promises); the true match total is
discarded and there is no `more`.
**Impact:** silent wrong pages (loop hazard), misread totals, invisible truncation.
**Fix:** all NB — wire `--offset` through the B/C tools' `capList` calls and add `offset` to
their MCP opt lists; emit `nextOffset` wherever `remaining` is emitted; reading_order gains
`more`; find-similar gains `total` (+`more`), with `count` fixed to the true total (flag in
CHANGELOG as a bug fix). Until then, soften the INSTRUCTIONS line.

### F4 — The MCP transport swallows the argument mistakes the CLI rejects (silent wrong answers)
The CLI's one flag loop dies loudly on unknown flags (exit 2 + usage). The MCP layer, same
product, opposite policy — verified live:
- Unknown argument names are accepted and ignored (`bogus_arg` probe): a typo'd optional param
  (`offest`, `winow`, `ful`) silently yields default behavior; schemas carry no
  `additionalProperties: false` and the handler never checks.
- `codeweb_reading_order {scope:"domain"}` **without** `value` silently answers the whole-repo
  question (verified: `scope:{kind:"all"}`) — the exact "typo answers a different question" trap
  the CLI hardened against (FORMS F8, `reading-order.mjs:29-31`), resurrected one transport over,
  because `argv()` drops the pair when either half is missing.
- Boolean params are unvalidated truthiness: `full:"false"` (string) → treated as **true**
  (verified: context returned `mode: full-bodies`). The numeric params got exactly this fix
  (FORMS F3); booleans didn't.
**Impact:** agents get plausible wrong answers instead of the correction the CLI would print.
**Fix:** all NB (stricter validation of previously-undefined behavior): reject unknown keys
naming the near-miss; `valid()` on reading_order requiring value-with-scope; one boolean clamp
beside the numeric clamp (accept true/false/"true"/"false", reject the rest).

### F5 — `full` means two things on `codeweb_context` (payload discipline)
Everywhere else `full:true` = "unabridged list". On context it *also* flips caller rendering
from call-site windows to whole caller bodies (`--full-bodies`) — verified (`mode:
full-bodies`). An agent that wants *all* callers as windows cannot ask for it; the closest
request detonates the token budget the tool exists to protect (its own header: 300KB+ packs).
**Fix:** NB — add `bodies: "windows" | "full"` (default windows), keep `full` as the unabridged
switch, deprecate the overload in the description.

### F6 — Error remedies leak across transports (actionability breaks at the seam)
The house rule — every error names a runnable next step — is kept *per transport* but the text
crosses transports; all verified live:
- `codeweb_diff` with a missing `before` returns the CLI's graph-not-found line **plus** the
  server's NO_GRAPH suffix: "pass \`graph\`…" — `codeweb_diff` has no `graph` parameter, and an
  agent that obeys gets its arg silently ignored (F4 compounding).
- `codeweb_map` failure text suggests `--allow-empty` — a run.mjs flag `codeweb_map` cannot pass
  (no such param).
- `codeweb_reading_order` scope errors print `reading-order.mjs`'s CLI usage line (flags an MCP
  agent can't type).
- The post-edit hook's pointer "run \`node scripts/diff.mjs\`" fails verbatim (COPY.md #8 —
  confirmed live in this review's hook run).
**Fix:** all NB — remedy text keyed to transport (spawnedToolReply already owns the seam for the
first case: strip/replace the CLI suffix for graphless tools; map's onSettle can translate
"--allow-empty" to "re-map at the code root, or the /codeweb agent fallback").

### F7 — Graph addressing: five tools opted out of the one loader (consistency + a misdirected write)
`loadGraph` (arg → `CODEWEB_WS` → walk-up, actionable error) is the contract — but `refresh`
requires a positional and hand-rolls a weaker error (COPY.md #9, confirmed; also **no**
`CODEWEB_WS`, no walk-up); `fitness` honors `CODEWEB_WS` but not the walk-up; `codemod` and
`placement` die on usage before `loadGraph` can discover (no walk-up); and `annotate` — the only
sidecar-*mutating* CLI — ignores both, defaulting `--dir` to `./.codeweb` **relative to cwd** and
`mkdir -p`-ing it: a suppression written from the wrong directory lands in a fresh, orphaned
`.codeweb` silently. USAGE strings advertise "(or set CODEWEB_WS)" on some tools and not others.
**Impact:** the "graph is optional everywhere" promise (MCP header comment) is true on MCP,
false for a fifth of the CLI; annotate's default can misplace team judgement (a committed
artifact).
**Fix:** all NB — route the five through `loadGraph`/`findTarget` (annotate: default dir =
`CODEWEB_WS` → nearest `.codeweb` → error, never bare cwd creation).

### F8 — graph.json is the only unversioned artifact, and its schema doc omits the gate's key field (versioning)
Every sidecar carries a `version` its loader checks (similar-index even rejects v1); the stage
memo has `MEMO_VERSION`; the server derives its version from package.json. **graph.json has no
schema/version field** (verified on a real graph) — evolution is implied only by
`normalizeGraph`'s "pre-v7 graphs" back-fill comment. Users commit graphs, CI caches them,
`codeweb_diff` accepts arbitrary snapshots as `before` — cross-version comparisons are silent.
Compounding (extends DOCS.md Gap 5 with the gate-relevant specifics): `graph-schema.md`
documents overlap `severity` but not **`confidence`** — the field `findingBuckets`, `diffGraphs`'
CONFIRMED set, trend's metrics, and the CI gate actually key on (real overlaps carry
`confidence`/`drifted`/`bodySim`). And the two consumers disagree on null: `diffGraphs` treats
`confidence == null` as **confirmed** (gate-relevant) while `findingBuckets` counts it **needs
review** — a fourth mini-fork, invisible until a legacy graph hits the gate.
Also unversioned but committed: `annotations.json`, `history.jsonl` (tolerant loaders today —
keep that tolerance as the stated contract if no version is added).
**Fix:** NB — stamp `meta.schema: <int>` at extract; loaders warn (not die) on mismatch;
document `confidence` (+`role`, `signature`, real `meta` keys per DOCS.md Gap 5); align the
null-confidence policy (pick `findingBuckets`' reading; treating null as confirmed was a
back-compat bridge worth an explicit comment or removal).

### F9 — MCP under-fetch: the loop the server prescribes can't be completed from MCP alone (payload discipline)
- `query.mjs --dependents` — the all-edge-kinds "who do I break?" answer (call ∪ import ∪
  inherit ∪ test ∪ ref) — **has no MCP tool**. Agents get `codeweb_callers` (call-only) +
  `codeweb_tests`; import-only users, subclasses, and instanceof/static users are invisible in
  the pre-edit flow the INSTRUCTIONS prescribe. The extractor grew `ref` edges *specifically* so
  `--dependents` surfaces those users (graph-schema.md) — then the agent surface never exposed it.
- The prescribed post-edit loop ("codeweb_refresh, then codeweb_diff (before vs after)") needs a
  **before snapshot no MCP tool can take** — `apply.md` step 3b is "copy graph.json" with the
  agent's own file tools. A pure-MCP client cannot execute the documented loop.
- Minor same-class gaps: `find_similar` k fixed at 10 via MCP; `review --range` CLI-only;
  hotspots/risk churn CLI-only.
**Fix:** NB — add `codeweb_dependents` (28th tool; count sweeps update mechanically via
check-consistency) or a `kinds` param on callers; teach `codeweb_refresh` a `snapshot: true`
option that writes `graph.prev.json` and let `codeweb_diff` accept `before: "prev"`.

### F10 — The "advisory" pre-edit card rides a permission decision (the auth-lens finding)
`pre-edit-impact.mjs:133-135` returns `permissionDecision: "allow"` with every card — verified
live. In the Claude Code hook contract, "allow" is not advisory: it **bypasses the permission
prompt** for that Edit/Write. Net behavior: edits to *mapped, load-bearing* files are silently
auto-approved wherever a prompt would have appeared, while unmapped files keep normal prompting —
the risk gradient is exactly backwards from the hook's intent, and `hooks.json` labels the hook
"advisory; fail-open". Practical exposure is modest (most sessions already allow edits; the hook
only fires on mapped source), but a permission-affecting output labeled advisory is a contract
mislabel.
**Fix:** NB — drop `permissionDecision` and ship `additionalContext` alone (context injection
does not require a decision); or, if auto-allow is intended, say so in `hooks.json`'s
description. Also minor: the post-edit hook delivers its message twice (stderr + JSON
`additionalContext`) — pick the structured channel.

### F11 — Smaller inconsistencies (cosmetic → mildly confusing)
- **Naming across transports:** MCP `codeweb_simulate` ↔ CLI `simulate-edit.mjs`, `codeweb_context`
  ↔ `context-pack.mjs` — tool↔script names mostly rhyme; these two don't. JSON keys are
  consistently camelCase; params consistently single lowercase words. Display-name forks
  (area/domain, review/judgement-calls) are COPY.md #4/#5 — JSON keys are clean.
- `campaign.mjs` USAGE omits its real `--all` flag (the FORMS F10 class the fleet just fixed).
- `risk.mjs` text mode prints a hard-coded top-15 regardless of `--limit` (JSON honors it).
- `trend.mjs --json` pretty-prints (`null, 2`) where every other tool emits one line.
- `codeweb_review`'s description implies `gate` needs `before`; duplication-only regressions
  gate without it.
- `codeweb_callers` description "call-edge in-neighbors" is accurate; COPY.md's near-miss about
  dependents-vocabulary stands as written there.
- Campaign silently degrades a **crashed advisor to an empty section** (exit codes deliberately
  ignored, `campaign.mjs:34-51`): a plan with zero deletes is indistinguishable from "deadcode
  found nothing". NB fix: a `degraded: ["deadcode"]` field when an advisor returned null.

### Mutation safety (audited, mostly clean — the model here is worth keeping)
Writers are few and disciplined: `run.mjs` (idempotent via content-keyed stage memo +
hash-verified outputs), `refresh` (atomic rename write, sidecar trio rebuilt, drops stamped —
`overlapsDroppedAt` — never silent), `annotate` (idempotent by fingerprint), `codemod --write`
(CLI-only by design; backup → apply → re-extract → re-gate → byte-revert on regression; refuses
ambiguous rewrites at exit 2). The MCP workspace queue (I1–I7) serializes writers per workspace,
orders readers behind earlier writers, caps reader concurrency, and survives cancellation;
autoRefresh is throttled, queue-aware, and fails to a stale-but-annotated answer. Partial
failures leave markers, not lies (`unsupported.json` verified; failed stages abort with prior
artifacts intact and the memo forces full recompute). The two genuine gaps are campaign's
unmarked advisor degradation (F11) and annotate's cwd-relative default (F7).

---

## 3. Proposed conventions (the one-page contract)

**Naming.** Tools: `codeweb_<word>` snake_case; params: single lowercase words; JSON keys:
camelCase; CLI flags: `--kebab-case` of the MCP param name. One concept, one name, both
transports (glossary: COPY.md §3). New tools' CLI file and MCP suffix should match
(`codeweb_simulate` / `simulate-edit.mjs` is the grandfathered exception, not the pattern).

**Errors — three tiers, everywhere.**
1. *Protocol*: JSON-RPC `error` for malformed frames and unknown tools only.
2. *Caller error*: `isError:true` text (MCP) / exit 2 + stderr (CLI). Must name the argument,
   the expected shape, and a next step **runnable in the caller's own transport**.
3. *Data verdict*: success payload with `found:false` / `ok:false` (MCP) / exit 1 + the same
   JSON under `--json` (CLI). Gate-family tools that render a verdict exit 1 on it; pre-flights
   that only *predict* a verdict say whose verdict it is (COPY.md rule) — and if they keep exit
   0, their text never cites an exit code.
Reserve exit 2 for usage/environment (including the bin Node guard), 1 for verdicts, 0 for ok.

**Pagination.** Every list-shaped tool: `limit` + `offset` + `full`; `count` = true total,
always; truncation always visible as `more: {remaining, nextOffset}` (multi-tier tools nest:
`more: {safe: {...}, review: {...}}`). `budget` stays only on plan-shaped tools (campaign,
reading_order) where "N steps" is the domain word — but they carry the same `more` metadata.
Unknown arguments are rejected, not ignored; booleans validate like numerics.

**Payload discipline.** Budgets by default, `full` only widens the *list*; body-size switches
are their own param. Fast path and spawned path stay byte-identical (the existing `lib/*-core`
pattern — keep it).

**Mutation.** Writers declare themselves (WRITER_TOOLS), serialize per workspace, write
atomically, and stamp what they drop (the `overlapsDroppedAt` pattern). Partial degradation is
always a named field, never an empty section.

**Versioning.** serverInfo.version = package.json (existing). `meta.schema` int in graph.json;
sidecars keep loader-checked ints (existing). Evolution is additive-first; tool renames/removals
get one deprecation minor with both names served. `check-consistency` (already in CI) remains
the count/version enforcement point — add new prose surfaces to `PROSE_FILES` as DOCS.md
proposes.

---

## 4. Fix sequence

**Non-breaking, now (no consumer can regress):**
1. F3 pagination unification: `offset` on risk/hotspots/break_cycles/deadcode/context (+ MCP opt
   lists), `nextOffset` beside every `remaining`, `more` on reading_order, `total` on
   find_similar; soften the INSTRUCTIONS paging line until done.
2. F4 validation: unknown-arg rejection, boolean clamp, reading_order value-with-scope.
3. F6 transport-correct error remedies (diff's NO_GRAPH suffix, map's --allow-empty, reading_order usage leak, hook diff pointer).
4. F2a: gate action distinguishes exit 1 vs 2 in its failure message.
5. F1a: `check` discriminator in gate-family payloads + the two-conditions sentence in README /
   ci-gate.md / agent-tools (DOCS.md D2's fix, worded by COPY.md #2).
6. F7 addressing: loadGraph/findTarget in refresh, fitness, codemod, placement, annotate.
7. F8: stamp `meta.schema`, document `confidence`/`role`/`signature`, align null-confidence.
8. F9: `codeweb_dependents` tool; `refresh {snapshot:true}` + `diff {before:"prev"}`.
9. F10: drop `permissionDecision` from the pre-edit hook (or relabel the hook honestly).
10. F5: `bodies` param on context. F11: campaign `degraded`, usage-string fixes, risk text-mode
    limit, trend compact JSON.

**Breaking (each with its migration path):**
1. **Unify the gate verdict (F1).** Release N: one `gateVerdict()` in graph-ops computes the
   union check (new cycles + confirmed-dup delta + surviving symbol losing its last
   call-caller, with the export exemption **as a labeled option, default off**); diff/simulate/
   review/hook/codemod all call it; `diff` payload carries both `ok` (old semantics) and
   `verdict.ok` (new), CHANGELOG + gate action release notes announce the flip. Release N+1:
   `ok` follows `verdict.ok`; the old orphan-set check remains reachable as
   `--legacy-orphan-gate` for one more minor. CI consumers pin `codeweb-ref` (the action
   already supports it) to opt out temporarily.
2. **Exit-code realignment (F2).** Bins' Node guard and `run.mjs` target-not-found → exit 2.
   Announce in CHANGELOG under "breaking"; wrappers keying on nonzero unaffected; the gate
   action needs no change (it inspects the step outcome, and after F2a reports 2 as
   "inconclusive").
3. **find_similar `count` → true total (F3).** Technically observable; ship with `total`
   added one release earlier so consumers migrate onto the unambiguous key first.

---

## 5. The worst offender, redesigned: the regression-gate contract

Today `codeweb_diff`, `codeweb_simulate`, `codeweb_review(gate)`, the post-edit hook, and
`codeweb_codemod` each answer "would the gate block this?" with three different definitions, two
different exit conventions, and error text that names another tool's verdict. The exemplar
redesign — one verdict, five presenters:

```
lib/graph-ops.mjs
  gateVerdict(before, after, {
    duplication = 'confirmed-delta',   // 'off' for edges-only presenters (hook/simulate)
    exemptExported = false,            // the ONE knob, default: strict (today's hook/simulate)
  }) -> {
    ok: boolean,
    checks: {
      newCycles:      [ [fileA, fileB, ...], ... ],
      lostCallers:    [ { id, exported, kinds: ['call'] } ],   // exempted ids listed, flagged
      newDuplications:[ { kind, title, confidence } ],         // absent when duplication:'off'
    },
    scope: 'full' | 'edges-only',      // what this run could see — never implied, always stated
  }
```

Presenters:
- `codeweb_diff` / `diff.mjs`: full delta report + `verdict` (scope 'full'); exit = `verdict.ok
  ? 0 : 1`.
- `codeweb_simulate`: `{ op, target, verdict }`, scope 'edges-only'; text says *"projected:
  BLOCK — new cycle or a symbol losing its last caller (edges-only; stricter than the CI gate
  unless exemptExported)"* — it describes its own check (COPY.md rule) and, because the verdict
  is now the same function, the equivalence claim finally becomes true. Exit stays 0 (it is a
  prediction), and its text stops citing exit codes.
- post-edit hook: same function, scope 'edges-only', unchanged fail-open envelope — pointer
  fixed to `codeweb_diff` / `/codeweb`.
- `codeweb_review`: keeps its review payload, embeds `verdict` verbatim; `--gate` exit =
  `verdict.ok`.
- `codeweb_codemod`: `projectedGate` becomes the same `verdict` object.
Every presenter names the same fields, the same knob, and the same scope label — so "the gate"
finally means one thing, and the strictness difference that remains is a *declared parameter*,
not an undocumented fork.

---
*Read-only review; the only write is this file. Live probes ran against a scratch workspace
(`stage3/` in the session scratchpad), not the repo's own `.codeweb`.*
