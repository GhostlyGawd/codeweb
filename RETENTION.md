# Retention & Lifecycle Audit — codeweb

**Date:** 2026-07-23 · **Scope:** read-only trace of every mechanism that brings a user back — the three hooks (`hooks/`), the session brief + value receipt (`scripts/lib/brief-core.mjs`, `scripts/lib/stats.mjs`), MCP staleness + auto-refresh (`scripts/mcp-server.mjs`), `refresh.mjs`, `trend.mjs`, the annotations memory, the re-map path (`scripts/run.mjs`, `commands/codeweb.md`, `skills/codebase-anatomy/SKILL.md`), the CI gate (`scripts/ci-gate.mjs`, `.github/actions/codeweb-gate/`), the VS Code lens (`editor/vscode-codeweb/`), the report shell (`scripts/report-template.html`), and the CHANGELOG/release rhythm. codeweb has no accounts, server, or email: "lifecycle" here means the local machinery that makes the tool part of a working rhythm, and the release channel — the only re-engagement surface an OSS tool owns. FUNNEL.md's habit-stage findings (install friction, the installed-but-never-activated stall, the unmapped-repo nudge) are taken as given and not re-litigated; this audit starts where FUNNEL stopped: **after the first map exists**.

---

## 1. Return-trip map

### Visit rhythm (judged from the job, not from wishes)

A code map earns its keep when the code *changes* — refresh-on-change is the natural habit loop, not any calendar. The real rhythm is four nested loops:

| Loop | Cadence | Surface | Status |
|---|---|---|---|
| **Per-edit** | many times/hour | pre-edit card (`hooks/pre-edit-impact.mjs`), post-edit regression check (`hooks/post-edit-diff.mjs`), CodeLens (`editor/vscode-codeweb/extension.js:66-73`) | built, ambient, fail-open — the strongest loop in the product |
| **Per-session** | daily-ish | SessionStart brief (`hooks/hooks.json:4-17`, `hooks/session-brief.mjs`) — areas, load-bearing symbols, known issues, lifetime receipt | built; staleness nudge fires on the wrong clock (R3) |
| **Per-PR** | per PR | CI gate + sticky structural-review comment (`.github/actions/codeweb-gate/action.yml`, `scripts/lib/gate-md.mjs`) | built; recurs but accrues nothing (R7) |
| **Per-milestone** | weekly-ish | full re-map (`/codeweb`), `trend.mjs`, `campaign.mjs`, `optimize.md` | the weak link: the re-map is amnesiac (R1), history is recomputed and discarded (R8) |

This is the correct shape for the job — nobody should be "brought back" by a notification to a tool whose value is ambient. The retention question is therefore: **does each loop re-arm the next one?** Mostly the answer is no: the per-edit and per-session loops run off a graph that only the per-milestone loop renews, and nothing makes the per-milestone loop happen at the right time or feel like progress when it does.

### What persists between visits (all under `<target>/.codeweb/`)

| Artifact | What it carries | Fate between visits |
|---|---|---|
| `graph.json` + `report.html` + `overlap.md` + `optimize.md` | the map + the ranked findings — the human's reason to return | overwritten in place at re-map (`scripts/run.mjs:100,148-153`); **findings zeroed by any refresh** (`scripts/refresh.mjs:57` — `overlaps: []`) |
| `stats.json` | the lifetime value receipt — "codeweb here since 2026-06: 41 pre-edit card(s) · 2 regression(s) flagged" (`scripts/lib/stats.mjs:94-115`) | accrues forever, monthly buckets; surfaced in every brief and at the end of every run (`scripts/run.mjs:183-188`) — the one true progression mechanic |
| `annotations.json` | human/agent judgements — false-positive suppressions with identity fingerprints (`scripts/lib/annotations.mjs`) | survives re-runs by design, but honored only by `deadcode.mjs` (R5) |
| `pending-card.json` | 30-minute advice-followed correlation state (`scripts/lib/stats.mjs:56-83`) | consumed within a session — clever, working |
| sidecars (`brief.json`, `index-lite.json`, hook baseline, scan cache) | performance floors | rebuilt at map/refresh |
| **Nothing else** | no previous graph, no metric series, no gate history | `trend.mjs --git` recomputes N full pipeline runs into a temp dir and discards the series (`scripts/trend.mjs:96-135`); `diff.mjs` needs user-managed before-snapshots (`*.before` is gitignored at `.gitignore:11`, but nothing ever writes one) |

### The pull back, per audience

- **Agents: best-in-class.** A missing graph returns an actionable error naming `codeweb_map` (`scripts/mcp-server.mjs:98`); stale graphs are annotated *and* ambiently auto-refreshed (`mcp-server.mjs:131-160`); the handshake instructions teach the whole loop — context → edit → refresh → diff-gate (`mcp-server.mjs:51-60`). An agent is never dropped; every dead end names the way back.
- **Humans: weak.** `report.html` never shows its own build date and never asks to be rebuilt (`scripts/report-template.html:323-331` — target + counts only). The brief's refresh note fires at 7 days of age, not on change (`scripts/lib/brief-core.mjs:96-99`). The receipt — the one accruing number — is a single line at the end of a brief mostly consumed by the agent.
- **Teams: one strong surface, stateless.** The gate comment recurs on every PR — codeweb's highest-frequency team-facing impression — but each verdict evaporates with the PR (graphs built in `RUNNER_TEMP`, `scripts/ci-gate.mjs:42-45`), and the footer links nowhere (`scripts/lib/gate-md.mjs:48`).
- **Lapsed users: no path back.** No update signal exists anywhere in the tool; releases come in bursts (eight releases across 2026-07-18/19 after a 25-day silence — CHANGELOG.md); the site asks for a star but never a release-watch (`site/content/index.html:174`).

### The biggest leak

**The second map.** Everything downstream of map #1 is well-oiled; nothing makes map #2 happen at the right time (the human nudge is time-based while the detector for change-based already exists and runs only inside MCP answers) or feel like progress when it does (no "since last map" delta, no stored history). Worse, the ambient auto-refresh — the product's best freshness feature — **silently deletes the duplication findings that are the human's reason to return**, and the staleness advice actively steers toward it. The habit loop closes for agents and quietly starves the human who decides whether codeweb stays installed.

---

## 2. Findings

Effort: S = hours–day · M = days · L = week+. Ranked by compounding value — fixes early in the loop pay on every future visit.

### R1 · Re-map is amnesiac — the return visit is a repeated first visit
- **Lens:** reason to return / saved state as a hook
- **Location:** `scripts/run.mjs` (whole file — the previous `graph.json` is on disk at run start and is overwritten without ever being read; the done banner at :175-188 prints artifact paths + receipt only); `commands/codeweb.md:58-60` and `skills/codebase-anatomy/SKILL.md:140-142` instruct the agent to finish with artifact paths + top consolidation opportunities — the identical first-run script, every run. `scripts/lib/diff-core.mjs` (in-process, already serving `codeweb_diff` at `mcp-server.mjs:506-508`) can compute the delta today.
- **Why users drift:** the second `/codeweb` prints the same page as the first. Consolidation work done since the last map — the user acting on codeweb's own advice — is never acknowledged; dups fixed, cycles broken, orphans deleted all pass in silence. Re-mapping feels like maintenance instead of a progress report, so users stop re-mapping; the map rots; cards and lenses quote stale numbers; trust decays without a single error ever being shown.
- **Fix:** at map start, if `graph.json` exists, hold it in memory; after render, diff and lead the summary with the delta ("since your last map 3 days ago: dups 12→9, cycles 2→2, symbols +41 — 2 of the 3 merges came from optimize.md's ready tier"), and stash the delta into the brief sidecar so the next session opens with it. See §3 — this is the hook to build.
- **Effort:** M

### R2 · Refresh silently zeroes the findings — and the staleness advice points at it
- **Lens:** saved state / churn cliff (value decay)
- **Location:** `scripts/refresh.mjs:57` (`overlaps: []` — "stale after an edit; recompute via the full pipeline when needed"); the ambient auto-refresh fires it on any stale structural/brief/context query (`scripts/mcp-server.mjs:137,146-160`) with `stdio: 'ignore'` (:157) — so the refresh CLI's one honest warning ("overlaps dropped — run the full pipeline to recompute", `refresh.mjs:96`) is discarded; the staleness annotation tells the agent "graph is stale for N+ file(s); **run codeweb_refresh**" (`mcp-server.mjs:576,599`); the brief then counts dups from `graph.overlaps` (`scripts/lib/brief-core.mjs:45,80`) and reports "known issues: **0 duplication finding(s)**"; the refreshed sidecar trio (`refresh.mjs:79-84`) bakes the zero into every subsequent session brief.
- **Why users drift:** the ranked findings are the human pull-back. One ordinary agent session on a slightly-stale graph triggers auto-refresh; the next morning's brief says there is nothing to fix. "0 duplication findings" is indistinguishable from "codeweb has nothing for me" — the exact opposite of the truth ("the count is pending a recount"). A `trend.mjs` run over such a graph reports a false consolidation win (confirmed drops to 0), poisoning the progression story too.
- **Fix:** stamp `meta.overlapsDroppedAt` in `refresh.mjs`; teach `brief-core`/`report`/`trend` to render "duplication: not recounted since refresh — run /codeweb (or codeweb_map) to recount" instead of a hard 0 when the stamp is present. Optionally: after a refresh settles, enqueue the cheap `run.mjs --stages through-overlap` partial (already built for trend, `run.mjs:34-35,58-59`) to recount ambiently.
- **Effort:** S (stamp + honest rendering) · M (ambient recount)

### R3 · The human staleness nudge fires on the wrong clock
- **Lens:** well-timed nudges
- **Location:** the brief's only refresh prompt is age-based — `>= 7` days since `generatedAt` (`scripts/lib/brief-core.mjs:96-99`). The change-based detector exists, is cheap, and is capped (`checkStaleness`, `scripts/lib/cli.mjs:220-238` — 64-file cap, directory stamps for new files) but is wired only into MCP answers (`mcp-server.mjs:551,575,598`). The pre-edit card never checks source freshness at all — its sidecar stamp validates against the *graph's* mtime/size, not the tree (`hooks/pre-edit-impact.mjs:38-42`).
- **Why users drift:** the job says refresh-on-change. A repo with 40 commits in two days gets no nudge for five more days while every card and lens quotes wrong blast radii; a 7-day-old map of an untouched repo nags pointlessly. Mis-timed nudges are worse than none: the well-timed one is the single "user would thank you" message this product has.
- **Fix:** `session-brief.mjs` calls `checkStaleness` (it already parses or side-loads the graph; the sweep is 12-17ms at 5k files per `mcp-server.mjs:118-120`) and swaps the age note for "map is behind by N+ changed file(s) — `/codeweb` re-maps in ~3s"; the pre-edit card appends "(map behind for this file)" when the subject file's stamp mismatches. Keep the 7-day note as the fallback for untouched-repo age.
- **Effort:** S

### R4 · The post-edit hook re-flags the same regression forever (plugin-only sessions)
- **Lens:** churn cliff (nudge fatigue)
- **Location:** `hooks/post-edit-diff.mjs:59-88` — regressions are computed against the *map-time* baseline (`side.summary` / `graph.json`); the hook never advances that baseline, and only `refresh.mjs:66-71` or a re-map rewrites it. In MCP sessions auto-refresh moves it forward; in plugin-only sessions (no MCP queries) it never moves.
- **Why users drift:** a user who consciously accepts a flagged tradeoff — or defers it — gets the identical warning on every subsequent edit to the target, indefinitely. Repeated identical warnings train dismissal, and a dismissed advisory channel is dead: the one time the hook catches a real regression, nobody is listening.
- **Fix:** dedupe per finding identity per baseline: record flagged cycle/orphan keys in a small sidecar and surface each once ("still open: the cycle flagged earlier — re-run /codeweb to re-baseline"), resetting when the baseline changes. The fingerprint machinery in `lib/annotations.mjs:17-21` is reusable as-is.
- **Effort:** S–M

### R5 · Suppression memory doesn't reach the surfaces that resurface findings
- **Lens:** saved state as a hook
- **Location:** annotations are honored only by `scripts/deadcode.mjs:93-108`; `overlap.mjs`, `optimize.mjs`, `build-report.mjs`, and `brief-core.mjs` never load `lib/annotations.mjs` (repo-wide grep: importers are `annotate.mjs`, `deadcode.mjs`, the lib itself). `README.md:422` promises more than ships: "`overlap`/`deadcode` then hide that finding and report a `suppressedCount`."
- **Why users drift:** triaging a false positive is the archetypal "user invests, product remembers" moment — the spec even designed identity fingerprints so genuinely new issues can't hide (ANN-IDENTITY-CHANGE-RESURFACES). Today the same refuted duplication reappears in `report.html`, `overlap.md`, the brief's known-issues count, and every gate comment. The invested user learns their judgement doesn't stick; the report cries wolf; wolf-crying reports get closed and not reopened (the skill's own rule: "a report that cries wolf is worse than no report", `SKILL.md:45`).
- **Fix:** apply `applySuppressions` at the overlap-stage output so report/brief/trend/gate all inherit it, and surface `suppressedCount` as the README already claims. One integration point, four surfaces fixed.
- **Effort:** M

### R6 · The accrued value lives in a directory everyone is told is disposable
- **Lens:** win-back / churn cliff
- **Location:** `stats.json` (the receipt — "since 2026-06") and `annotations.json` (judgements) are written beside `graph.json` (`scripts/lib/stats.mjs:15`, `scripts/lib/annotations.mjs:13,23`) inside `.codeweb/` — which codeweb's own `.gitignore:4-6` labels "per-target runs; **regenerable** via scripts/run.mjs". No doc anywhere tells an adopter whether to commit, ignore, or preserve anything in `.codeweb/` (grep: zero gitignore guidance in README, docs/, site/).
- **Why users drift:** `rm -rf .codeweb` is the natural clean-rebuild move — and it destroys the only two artifacts that are *not* regenerable: the streak ("codeweb here since June") resets to silence, and every triaged false positive resurfaces (compounding R5). A fresh clone or a new teammate starts from zero, so judgement value never compounds across a team — each person re-triages the same findings.
- **Fix:** `run.mjs` writes a `.codeweb/.gitignore` on first map (`*`, `!.gitignore`, `!annotations.json` — optionally `!stats.json`) so the workspace self-declares what is cache and what is memory; one docs paragraph states the contract ("commit `annotations.json` — it's team judgement; `stats.json` stays local"). Never let a rebuild path delete either file (today none does — the risk is the user's own cleanup, which the self-gitignore makes safe to do with git).
- **Effort:** S

### R7 · The gate recurs on every PR but accrues nothing — and its footer recruits nobody, and its Node pin can hard-fail adopters
- **Lens:** habit and progression (team) / churn cliff
- **Location:** `scripts/ci-gate.mjs:42-45` + `.github/actions/codeweb-gate/action.yml:45-49` — base and head graphs are built in `RUNNER_TEMP` and discarded; nothing persists across PRs even though every gate run computes exactly the metrics `trend.mjs` charts. The comment footer (`scripts/lib/gate-md.mjs:48`) says "reproduce locally" but carries no link to the repo/site (the same referral hole FUNNEL found in `report.html`). And `action.yml:29` pins `node-version: '20'` against `package.json:37` `engines: node >=22` — the reusable action runs the engine on a Node it declares unsupported.
- **Why users drift:** per-PR the team sees a verdict but never a trajectory. "overlaps +1" on this PR carries no "you're down 40% this quarter" — and trajectory is what makes a team keep a gate through its first annoying red X instead of deleting the workflow (the quiet team-level churn event). The Node mismatch risks a hard failure on the most-recurring touchpoint the product has. The linkless comment wastes the highest-frequency impression codeweb makes on people who never installed it.
- **Fix:** bump the action to Node 22 (one line); add the footer link ("codeweb structural review — map your own repo"); persist a per-PR metrics row (actions/cache or a committed ledger) and append one trend line to the comment ("confirmed dups on main across the last 5 gated PRs: 12→9", `trend.mjs`'s sparkline renderer is reusable).
- **Effort:** S (node) · S (link) · M (trend line)

### R8 · History exists as a feature but not as data — trend recomputes and discards
- **Lens:** habit and progression
- **Location:** `scripts/trend.mjs:96-135` — `--git` mode runs N full pipeline passes into `mkdtemp` dirs, prints the series, and deletes everything; its own header calls it "a dashboard you re-open" (`trend.mjs:3`) but there is nothing stored to re-open. Not exposed over MCP (27 tools; no `codeweb_trend` — `mcp-server.mjs` TOOLS grep), never mentioned by `run.mjs` output, the brief, or the report.
- **Why users drift:** progression — "duplication is falling" — is the strongest *rational* reason to keep a tool installed, and codeweb's core metric is tailor-made for it. Today seeing it once costs N×pipeline wall-time and is discoverable only by reading the README's §"Track duplication over time". The dopamine of "you fixed 3 dups this month" exists in code and is never delivered.
- **Fix:** append one metrics row per full map — `{date, symbols, confirmedDups, coupling, cycles}` — to `.codeweb/history.jsonl` (free: the graph is already in memory at render time; `metrics()` is 15 lines at `trend.mjs:31-46`). Teach the brief one line ("dups over your last 4 maps: 12→11→9→9"), the report a small sparkline, and `trend.mjs` to read `history.jsonl` instantly (git mode remains for backfill). Pairs with R1 — same write, two payoffs.
- **Effort:** M

### R9 · The report never says its own age; the lens never says the graph's
- **Lens:** the empty return
- **Location:** `scripts/report-template.html:323-331` — `renderMeta` renders target + symbol/edge/area/dup counts; no `generatedAt` anywhere in the template (grep). The CodeLens title is "N callers · blast M" with no staleness variant (`editor/vscode-codeweb/extension.js:66-73`); the file watcher re-renders on graph *change* (:85-88) but nothing marks graph *age*.
- **Why users drift:** the report and the lens are the human's return surfaces, and both present week-old numbers with full confidence. Either the user acts on a stale number and gets burned, or they discover the staleness and stop trusting every future number — the classic dashboard death. The data is already in the file (`G.meta.generatedAt`).
- **Fix:** meta bar gains "mapped 3 days ago" (relative date from `meta.generatedAt`, tooltip = absolute + engine); lens tooltip gains the map date; both name the rebuild command. A live drift check is impossible in a self-contained HTML file — the date alone restores honesty.
- **Effort:** S

### R10 · No path back for the lapsed: bursty releases, no announce channel, old installs never learn
- **Lens:** win-back / well-timed nudges
- **Location:** CHANGELOG.md release dates: 0.1.0 (2026-06-22), 0.2.0 (06-23) — 25 days of silence — 0.3.0 (07-18), then 0.4.0, 0.5.0, 0.6.0, 0.7.0, 0.7.1, 0.8.0, 0.9.0 **all on 07-19**. The site's only subscription CTA is "Star on GitHub" (`site/content/index.html:174`) — stars notify nobody; release-watches do. No surface in the product prints or compares versions for the user beyond the MCP handshake (`mcp-server.mjs:41-45`); plugin updates are manual; there is no update check (correctly — the privacy stance forbids phoning home).
- **Why users drift:** for a local OSS tool, the release note *is* the entire win-back channel. A user who tried 0.2.0 — before the hooks, the budgeted MCP responses, the 27 tools, the gate — formed their opinion on a product that no longer exists, and no channel exists through which they could ever hear otherwise. Eight releases in two days after a month of silence means even watchers got one notification-storm and one silence, the worst cadence for an announce channel.
- **Fix:** add "Watch → Releases" as an explicit CTA beside the star button on site + README ("get the changelog when capabilities land"); batch releases toward a steady rhythm (weekly beats 8-in-2-days for notification value; the `release-tag` skill and `release.yml` already make cutting one cheap); print the running version in `run.mjs`'s done banner and the report footer so users can at least self-diagnose being behind. No network calls.
- **Effort:** S

### R11 · Small cliffs on the failure path (noted, not expanded — activation-stage territory)
- **Lens:** churn cliffs. (a) `codeweb_map` on an unsupported-language repo fails identically in every session with no memory of having failed (`mcp-server.mjs:454` surfaces the last 3 stderr lines; nothing records "tried, unsupported, use the agent fallback"), so MCP-only users hit the same wall each session. (b) Node <22 crashes raw — `engines` (`package.json:37`) is advisory and `run.mjs` has no version guard, so the failure is a syntax stack trace, not a message. Fixes: a one-line `process.version` guard (S); a `.codeweb/unsupported.json` marker the NO_GRAPH error can read to route to the agent fallback (S).

---

## 3. The one hook to build

**"Since last map" — a re-map delta + one appended history row, surfaced everywhere codeweb already speaks.**

The argument:

1. **It sits exactly at the biggest leak.** The natural loop is map → edit (hooks watching) → re-map. The first map is novelty; every later map is where retention is decided — and today it's a repeated first run (R1) reading from a decaying findings list (R2) with no trajectory (R8). One mechanism addresses all three.
2. **It converts maintenance into progress.** "dups 12→9 since Tuesday — 2 of the 3 merges came from optimize.md's ready tier · cycles flat · receipt: 41 cards, 2 regressions caught" is a *report card the user earned*, not a notification invented to fetch them. It resurfaces value the user already created — the brief's own Phase-3 rule — and it is the reward that closes the refresh-on-change habit loop.
3. **It is almost entirely shipped code.** The previous `graph.json` is in hand at run start (`run.mjs:70-71`, before stages overwrite); `diffGraphs` runs in-process and already powers `codeweb_diff` (`lib/diff-core.mjs`, `mcp-server.mjs:506-508`); the metrics row is `trend.mjs:31-46`; the receipt is one import (`lib/stats.mjs`). The marginal cost per map: one JSON read + one in-memory diff + one appended line.
4. **One write re-arms every loop.** The delta prints in `run.mjs`'s done banner (human, terminal); lands in the brief sidecar so the *next session* opens with it (agent + human, per-session loop); appends to `.codeweb/history.jsonl` (feeding `trend.mjs` instantly, the report sparkline, and R7's gate trend line); and gives the gate comment its trajectory. Four surfaces, one mechanism.
5. **It obeys the house rules.** Zero network, deterministic, fail-open (a missing/corrupt previous graph degrades to today's behavior), and honest — it reports measured deltas, never projections.

Sketch: in `run.mjs`, before the stages run, `prev = tryRead(ws/graph.json)`; after render, `delta = diffGraphs(prev, fresh)` + `metricsRow(fresh)`; print 3 delta lines; append the row to `history.jsonl`; stash `{delta, at}` into `brief.json`'s payload; `brief-core.renderBrief` emits one line when present. Effort: M — a day of glue and two renderers over tested parts.

---

## 4. Instrumentation gaps

The stance is set and correct: "STRICTLY LOCAL … never transmitted" (`scripts/lib/stats.mjs:5-9`). Retention must be measured in two ledgers that both respect it — the user's own, locally; the maintainer's, by public proxy. Today neither can answer "did anyone come back?"

**Local (per workspace — lets the *user* read their own retention, and feeds R1/R3/R8):**
1. **Timestamps, not just monthly counters.** `stats.json` cannot currently answer "when did I last map?" — the exact question R3's nudge and R1's delta header need. Add `firstMapAt`, `lastMapAt`, `mapCount`, `lastSessionAt` (dates and integers only; nothing identifying). FUNNEL §5.4 proposed the first of these; shared budget.
2. **Week-granularity session buckets.** `briefInjected` is the session-count proxy, but month buckets (`stats.mjs:16,33-36`) hide the weekly rhythm the product actually lives on. An ISO-week bucket turns `stats.json` into a local retention curve the receipt can render: "sessions/wk here: 9 · 7 · 11 · 4".
3. **`history.jsonl` per map (R8/R1).** date · symbols · confirmed dups · coupling · cycles — the progression axis for brief, report, trend, and gate.
4. **Refresh vs re-map ratio.** `autoRefreshes` already counts one side; add `fullMaps` — a workspace with 200 refreshes and 1 map is R2's decay in numbers, visible locally.

**Maintainer proxies (no beacon — extends FUNNEL §5's acquisition ledger with the retention *shape*):**
5. **npm weekly-downloads series, archived.** Acquisition reads the level; retention reads the shape — a returning-npx population shows as a stable baseline after spikes; pure spike-decay means nobody comes back. (GitHub traffic data expires in 14 days; the scheduled snapshot FUNNEL proposed is the prerequisite.)
6. **Gate adopters — the only countable retained cohort.** A scheduled GitHub code search for `GhostlyGawd/codeweb/.github/actions/codeweb-gate` in third-party workflows counts teams that recur *by construction* on every PR. Trend that count; it is the closest thing to a retention curve this product can ethically have.
7. **Release upgrade rate.** Per-release `.vsix`/asset download deltas ≈ what fraction of the base follows releases — the open-rate of the only win-back channel (R10).
8. **The honest limit, stated.** No cohorts, no per-user curves, ever — by design. Write that into the ledger README so the proxies are never mistaken for user analytics, and so the privacy stance stays a feature rather than an accident.

---

## Next

Top fix candidates, ranked by compounding value (each pays on every future visit):

1. **R2 + R3 — stop the silent value decay and re-time the nudge (S):** stamp `overlapsDroppedAt` and render "not recounted" instead of a false 0; wire `checkStaleness` into the session brief so the refresh nudge fires on change, not on a 7-day timer. Smallest fix protecting the reason-to-return everything else depends on.
2. **The one hook — "since last map" delta + `history.jsonl` (M):** closes R1 and R8 in one mechanism; makes every re-map a progress report and gives brief/report/gate a trajectory.
3. **R6 — protect the accrued value (S):** `run.mjs` writes `.codeweb/.gitignore` whitelisting `annotations.json` (+ optionally `stats.json`); one docs paragraph on commit-vs-ignore. Prevents the streak-and-judgement wipeout that makes leaving free.
4. **R7 — gate: Node 22 + footer link (S), trend line (M):** protects the most-recurring team surface from a hard fail and gives it memory and a referral path.
5. **R5 — suppressions reach overlap/report/brief/gate (M):** makes user judgement compound, as the README already promises.
