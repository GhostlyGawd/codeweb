# AI Opportunity Scan — codeweb

**Date:** 2026-07-23 · **Scope:** read-only pass over the whole repo (engine `scripts/`, MCP server, hooks, skills/agents/commands, report, bench, docs, site) plus the three sibling audits (FUNNEL.md, COMPETITIVE.md, REVENUE.md). This file is the only write. No prior AI-IDEAS.md existed.

**The framing constraint that rules this report:** codeweb's brand *is* "no LLM in the loop" (README.md:18, `find-core.mjs:2`, case-study-axios.md closing line), COMPETITIVE.md's positioning moat is determinism-with-receipts, and its do-not-copy list already rejects embeddings. So "add AI" here is mostly a trap — except that codeweb is itself a tool *for* AI agents, and an LLM already ships in the box today, twice: the **agent fallback path** (`agents/codeweb-dissector.md` on sonnet, `agents/codeweb-domain-mapper.md` on opus, for languages the extractor can't parse) and the **external-mode adoption verdict** (SKILL.md step 7). The scan therefore applies a hard fence, derived from how the product already draws it:

> **The fence:** deterministic core, agent edges. LLM output may live (1) in the *consuming agent's* workflow (skills/commands/prompts — the agent was already there), (2) in **sidecar files with provenance labels** (the `annotations.json` precedent — never inside `graph.json`, which must stay byte-reproducible), or (3) in **build-time artifacts that are reviewed and committed** (AI authors it once; runtime stays same-input-same-output). LLM output may never sit in a runtime query path, never inside the extract→cluster→overlap→render pipeline, and never author the gate's verdict.

Every idea below states which side of the fence it sits on, and why it beats the boring alternative (a rule, a template, a button).

---

## 1. Raw material summary

**Data the product holds (all local, per workspace `<target>/.codeweb/`):**
- `graph.json` — nodes (id, kind, signature, complexity, maxDepth, role, exports, **`summary: ''` — always empty on the fast path**, extract-symbols.mjs:501), edges (call/import/test kinds), domains (**summaries are templated counts** — "N symbols across M file(s); key: …", cluster3.mjs:97), body-confirmed `overlaps[]`, meta (languages, staleness stamps, coverage).
- Findings artifacts — `overlap.md`, `optimize.md` (ready/blocked/review tiers), plus on-demand deadcode/hotspots/risk/campaign output; `campaign.mjs` already emits an ordered, individually-gated, ROI-ranked worklist with cumulative deltas.
- `stats.json` — the strictly-local outcome ledger (cards delivered, card-named callers followed, regressions flagged, queries served; `lib/stats.mjs`) plus `pending-card.json` advice-followed correlation.
- `annotations.json` — false-positive suppression memory with identity-based fingerprints (the sidecar precedent).
- Trend snapshots (`trend.mjs --git`), CI gate outputs (`diff.mjs --json` → `gate-md.mjs` PR comments), coverage facts (`coverage.mjs`).
- `bench/` — a full referee apparatus: compiler-graded oracle A/B, frozen-engine agent A/B harnesses (`agent-ab.workflow.js`, `replay-ab.workflow.js`), **replay-mine.mjs** (mines git history for ground-truth "missed caller" tasks with built-in answer keys), CI-gated `budgets.json`.

**Tedious multi-step flows traced (real toil):**
1. **Acting on the campaign.** `campaign.mjs`/`optimize.mjs` end at a plan; the README's own words: "the agent (+ the gate) executes each step." Nothing packages that execution. A user who wants the −12 LOC / 2 cycles broken must hand-drive: read step → `codeweb_simulate` → edit (or `codemod.mjs --write`) → `codeweb_refresh` → `codeweb_diff` → `codeweb_tests` subset → commit/revert — per step, ×80 steps on axios.
2. **Judging the "review" tier.** optimize.md deliberately leaves drifted copies and merely-structural matches for "human/agent judgement" — a judgment call the product tiers but never drafts.
3. **Understanding what an area *is*.** On the fast path (the default for all 11 languages) every node summary is empty and every domain summary is a count — the session brief's "areas:" section and the report's domain tree carry no English meaning. The agent-fallback path proves the product *wants* one-sentence summaries (dissector spec requires them); the deterministic path structurally cannot write them.
4. **Convincing other humans.** The axios case study was hand-written and converts (README leads with it); FUNNEL.md found every generated report is a referral dead end; REVENUE.md's buyer for Teams is "someone graphing structural health" who must today assemble their own pitch for a refactor budget.
5. **Trusting the fallback.** C/C++ and every unlisted language route through the LLM dissector agents — the one component with **zero published accuracy numbers** in a product whose entire identity is receipts (32/33 pre-registered checks — none cover the agent path).

**Judgment calls users make that could be drafted:** which drifted duplicate is canonical; whether a review-tier finding is real; what a domain/symbol is *for*; how to justify a consolidation campaign to a team; how to phrase a suppression `--note`.

---

## 2. Ideas

Ratings: value and feasibility each high/medium/low, argued inline.

### Idea 1 — Campaign Copilot: `/codeweb-apply` (execute the gated worklist)

The ROADMAP already names this ("auto-fix refactor bot… the *action* layer" of Phase 4). Ship it as a **skill + command**, not engine code: the consuming agent walks `campaign --json` step-by-step — simulate → apply (via `codemod.mjs --write` for mechanical merges, hand-edit for the rest) → refresh → diff-gate → run the `codeweb_tests` subset → commit, or revert and mark the step blocked. Ready-tier merges first; review-tier items get a drafted judgment (see the fence: the LLM only does what only an LLM can — edit code and judge drifted bodies — while every accept/reject is the deterministic gate's).

- **User moment:** the minute after `/codeweb` prints "top consolidation opportunities — lead with the ready tier" (commands/codeweb.md:58-60). Today that sentence is where the product stops and the toil starts.
- **Data:** all in hand — campaign steps with per-step gate verdicts, `simulate-edit` pre-flights, `codemod` edit plans, test mapping, the diff gate. Nothing to collect.
- **Failure mode:** the agent botches an edit → `codeweb_diff` exits 1 or the test subset fails → revert that step, record it as blocked with the gate's reason, continue the sequence (campaign ordering guarantees later steps stay valid). Worst case is one reverted commit; the fallback is exactly today's behavior (a plan you execute yourself).
- **Cost & latency:** user-initiated, batch; ~10–50k agent tokens per step on the user's own session. Zero codeweb-side cost; tolerance is high (it replaces an afternoon of hand-driving).
- **Build shape:** prompt-only — a `commands/apply.md` + skill section orchestrating existing MCP/CLI tools. Zero engine changes; `codemod --write` stays unexposed over MCP (the trust line holds — the *user's* agent writes, codeweb never does).
- **Beats the boring alternative because:** the boring alternative is `codemod.mjs --write` in a shell loop — it covers only mechanical merges, can't judge drifted copies, can't fix the tests a merge breaks, and can't write the commit. The judgment steps are irreducibly LLM-shaped; the safety steps are already deterministic. This is also the story move COMPETITIVE.md Bet 3 wants: "let agents edit fast — codeweb catches the structural regressions," now demonstrated end-to-end by the product itself.
- **Value: high** (turns advisory output into landed LOC; makes the receipt read "X LOC removed, 0 regressions") · **Feasibility: high** (every primitive exists and is tested).

### Idea 2 — Tool-routing optimization, measured (the 27 tool descriptions are prompts)

codeweb's realized value depends on frontier agents *choosing* `codeweb_callers` over grep mid-task. COMPETITIVE.md already flags Claude Code's documented bias toward built-in tools and Serena's countermeasures. Treat `mcp-server.mjs`'s 27 descriptions + the handshake `INSTRUCTIONS` block as what they are — prompts — and put them under the same discipline as everything else here: A/B description variants through the existing frozen-engine replay harness (`replay-ab.workflow.js`, mined ground-truth tasks) and publish routing-rate + recall deltas per variant, gated in `bench/budgets.json` like every other number.

- **User moment:** invisible and constant — every mid-task moment where an installed agent greps anyway and the user concludes "codeweb doesn't do anything." This is the multiplier on all 155 weekly downloads.
- **Data:** have it — replay-mined tasks with answer keys, the agent-ab workflow, usage accounting from `efficiency-pilot.usage.mjs`.
- **Failure mode:** none user-facing (it's an eval); a variant that wins routing but loses recall is rejected by the same run. The risk is spend on a null — which this repo's culture explicitly ships.
- **Cost & latency:** moderate multi-agent bench spend (the ROADMAP's known line item; REVENUE.md's sponsorship is aimed at exactly this). No runtime cost ever.
- **Build shape:** fine-grained tool use in the bench workflow; product change is text-only (descriptions/instructions).
- **Beats the boring alternative because:** the boring alternative — hand-tuned descriptions — is what exists, and nobody knows if they route. A static reminder hook ("about to grep for callers? codeweb_callers answers in 1KB") is a *rule* and should be built as one (see Gimmick list §4, "boring beats AI"); the AI-shaped part is the measurement loop, which no rule can do.
- **Value: high** (multiplies realized value of every install; produces a marketable "our tool descriptions are benchmarked" receipt no rival has) · **Feasibility: medium** (harness exists; costs real tokens and orchestration care).

### Idea 3 — The narrated map: a docent sidecar for domains and load-bearing symbols

An opt-in `/codeweb narrate` pass where the local agent writes one-sentence summaries for each domain and the top ~20 load-bearing symbols into `.codeweb/narration.json` — a sidecar stamped against the graph (mtime/size, same staleness discipline as `index-lite.json`), rendered with provenance: brief "areas:" lines gain the sentence, `report.html` shows it *marked as agent-written*, `codeweb_brief`/`codeweb_explain` append it as `note (agent-written)`. `graph.json` stays byte-identical; delete the sidecar and you have today.

- **User moment:** the session brief's "areas:" list and the report's domain tree — the first thing both a new agent and a reviewing human read. Today: `core (79): 79 symbols across 12 file(s); key: dispatchRequest, mergeConfig.` The templated line answers "how big"; never "what for."
- **Data:** have the inputs (graph + source, `reading-order` for what to read); must generate the text once per map, regenerate on drift (the stamp makes staleness visible, and stale narration simply drops out of the brief).
- **Failure mode:** a wrong sentence misleads onboarding. Contained by: provenance label on every surface, staleness stamp, one-sentence budget, and the fact that every deterministic number stays separate — narration annotates the map, it never *is* the map. Fallback = the templated count line.
- **Cost & latency:** ~10–30k tokens per repo, on demand only — never at map time, never in CI, never blocking the 3s pipeline promise.
- **Build shape:** prompt + tool use (skill step) writing the sidecar; small deterministic rendering additions in brief-core/report.
- **Beats the boring alternative because:** the boring alternative is the templated summary, which the product already ships and which demonstrably can't say what `adapters` *does*. The dissector agent spec proves per-symbol English summaries were always wanted; the fast path silently lost them when it won. This restores the loss without touching determinism.
- **Value: medium-high** (upgrades the two most-read surfaces; directly serves COMPETITIVE Bet 2, the human-facing map) · **Feasibility: high** (sidecar + staleness patterns exist; rendering is additive).

### Idea 4 — The refactor pitch memo: `/codeweb-pitch` (draft the business case)

A skill that drafts a one-page, review-before-sharing memo from artifacts the user already has: campaign projections (LOC reclaimed, cycles broken, per-step gate verdicts), trend direction, hotspot list, stats.json receipts — in the axios case-study voice, every number pinned to an artifact path. Two audiences, one generator: "fund this refactor" (to a team lead) and "here's what codeweb found in our repo" (the shareable story FUNNEL.md's referral audit wants but the product never writes).

- **User moment:** REVENUE.md's placement #4 — the `trend.mjs` user *is* the team-lead buyer; and the moment after a campaign lands, when a dev wants credit/budget for continuing.
- **Data:** all in hand (campaign/optimize/trend/stats/graph). Nothing collected.
- **Failure mode:** overclaiming in prose. Contained by: the template hard-requires a citation per number (the repo's own claims-check culture, `lib/claims-check.mjs`, is the model), the user reviews before it leaves the machine, nothing is ever auto-published.
- **Cost & latency:** ~5–15k tokens, on demand, seconds — tolerance irrelevant.
- **Build shape:** prompt-only skill over existing JSON outputs.
- **Beats the boring alternative because:** a static template can print the numbers but not the argument — which findings matter *for this team*, what the blocked tier implies, what to sequence first. That selection-and-narrative step is the judgment call users do from scratch today (the axios case study took a human doing exactly this).
- **Value: medium** (retention + referral + the Teams-tier demand signal) · **Feasibility: high** (pure prompt work).

### Idea 5 — Repo vocabulary sidecar for `codeweb_find` (AI authors, runtime stays deterministic)

`codeweb_find` is deliberately lexical (stem + split + weights, `find-core.mjs`), and COMPETITIVE.md's table-stake #5 says: don't copy embeddings — strengthen the deterministic path. The AI-shaped gap is vocabulary: a query for "retry backoff" misses a repo that says `replay`/`reattempt`. Have the agent draft, once, a reviewed `.codeweb/vocab.json` (concept → this repo's identifier tokens, mined from README/docs/identifiers); `find-core` merges it as low-weight synonym expansions (scored below direct label hits, `match` field says `vocab:`). Committed, diffable, deletable. Runtime remains no-LLM, no-embeddings, same-input-same-output — the artifact is data, like a stopword list someone wrote.

- **User moment:** the agent's first orienting call in an unfamiliar repo — `codeweb_find` is the funnel into explain/context; a miss sends the agent back to grep and the value story dies at hello.
- **Data:** have identifiers/docs; must generate the mapping once per repo (and optionally ship a small generic table with the product, reviewed in PR like any code).
- **Failure mode:** a bad synonym surfaces irrelevant symbols — bounded by the low weight (never outranks a real label match), visible in the `match` explanation, fixable by editing one JSON line, removable wholesale. Absent file = exactly today's behavior.
- **Cost & latency:** one-time ~5–20k tokens per repo; zero runtime cost or latency.
- **Build shape:** prompt-only generation + a small engine change (weighted expansion in find-core) that must prove itself against a find-quality benchmark before shipping (extend the bench harness; budgets.json gates it like everything else).
- **Beats the boring alternative because:** the boring alternative is more stemming — which cannot know that this repo calls retries "replays." The *expensive* alternative (embeddings) is on the do-not-copy list for good reason. Build-time AI authorship is the only option that closes the vocabulary gap and keeps the determinism receipt.
- **Value: medium** · **Feasibility: medium** (engine touch + a new benchmark to be honest about it).

### Idea 6 — Receipts for the existing LLM: grade the agent fallback path

The dissector/domain-mapper agents are the one shipped AI component and the only codeweb surface with no published number. Use the deterministic engine as the oracle: run the fallback agents on corpus repos the fast path handles (JS/TS/Go/Rust from `bench/corpus.manifest.json`), score node/edge precision-recall against the engine's graph, publish the table (and the honest gaps) on the research page, and pin prompt regressions the way budgets.json pins everything else.

- **User moment:** "does codeweb support C/C++?" — today's answer is "the agent fallback," with nothing behind it. This is COMPETITIVE.md's loudest capability gap (stake #3, effort L for native grammars); graded-fallback is the bridge that makes the interim answer trustworthy — or honestly bounded.
- **Data:** have everything — corpus, oracle machinery (`bench/lib/oracles.mjs`), agent workflow harnesses.
- **Failure mode:** none user-facing; bad numbers ship as a published boundary ("fallback recall 0.7 on call edges — treat orphan/deadcode output as unavailable in fallback mode"), which is itself a product improvement: today fallback graphs feed the same advisors with no confidence downgrade.
- **Cost & latency:** moderate agent spend, one-off per prompt revision; no runtime impact.
- **Build shape:** fine-grained tool use in bench; possible small product follow-up (fallback graphs get `meta.engine: 'agent'` caveats on advisor output — a rule, not AI).
- **Beats the boring alternative because:** there is no boring alternative to measuring an LLM — the only other options are deleting the fallback (loses 30+ languages) or continuing to ship it ungraded (off-brand in a product whose README's proudest section is "measured, not just claimed").
- **Value: medium** (trust + de-risks the C/C++ interim) · **Feasibility: medium** (spend-gated; harness exists).

---

## 3. Value × feasibility ranking

| # | Idea | Value | Feasibility | Fence position | One-line why |
|---|---|---|---|---|---|
| 1 | Campaign Copilot `/codeweb-apply` | High | High | agent workflow (skill/command) | Completes plan→landed-code; every safety check already deterministic; ROADMAP already names it |
| 2 | Tool-routing optimization, measured | High | Medium | build-time (descriptions as prompts, bench as referee) | Multiplies realized value of every install; no rival benchmarks their own tool prompts |
| 3 | Narrated map (docent sidecar) | Med-High | High | sidecar with provenance | Restores the English meaning the fast path lost; graph.json untouched |
| 4 | Refactor pitch memo `/codeweb-pitch` | Medium | High | agent workflow | Drafts the judgment call (the case for the refactor) users assemble by hand; feeds referral + Teams demand |
| 5 | Vocab sidecar for `codeweb_find` | Medium | Medium | build-time artifact, reviewed | The only embeddings-free answer to the "semantic search" table stake |
| 6 | Grade the LLM fallback | Medium | Medium | eval of existing AI | The one ungraded component in a receipts-first product; bridges the C/C++ gap |

Sequencing note: 1, 3, 4 are pure packaging of existing primitives (no engine risk, no spend); 2 and 6 share the bench-spend budget REVENUE.md wants sponsorship to fund — run them as one funded batch; 5 waits for its benchmark.

---

## 4. Gimmick list (rejected — this list protects the roadmap)

1. **Embedding/vector "semantic search" in `codeweb_find`.** Breaks the load-bearing determinism claim (`find-core.mjs:2`), imports an index build + model dependency into a zero-dep product, and COMPETITIVE.md already rejected it (do-not-copy #3). The boring alternative (lexical + Idea 5's reviewed vocab) keeps the receipt and closes most of the gap.
2. **LLM anywhere in the extract→cluster→overlap pipeline** ("AI-enhanced edge inference," "AI dedup confirmation"). Kills byte-reproducibility — the one property every rival cannot copy and every published benchmark depends on. The existing precision-over-recall edge policy (drop ambiguous calls rather than fabricate) *is* the brand.
3. **Chat-with-your-map** (a chat panel in report.html, or a `codeweb ask` REPL). The MCP client already is the natural-language interface — 27 tools exist precisely so the *host* agent does the talking. An in-product chat duplicates the host, needs API keys/accounts (off-norm per COMPETITIVE §1), and adds latency to answers the graph serves in ~100ms. Lens 4 resolves to: natural-language input is the consuming agent's job; codeweb's job is `codeweb_find`, which is already NL-in, deterministic-out.
4. **LLM-written prose on the gate / PR comment.** `gate-md.mjs` states facts a template can state; the gate is the *trust* surface — the whole pitch is that its verdict is mechanical. A hallucinated explanation on a blocking check is the most expensive wrongness in the product. (Same for `diff`/`fitness` output.)
5. **LLM re-ranking of hotspots/risk/deadcode.** The README sells the opposite: "every row shows its raw components, so the ranking is auditable rather than a black box." A model re-rank converts an auditable formula into vibes, for zero measured lift.
6. **AI "your week" digest of stats.json.** The receipt is ~200 bytes of counters with a fixed template (`monthLine`); summarizing it with a model is latency + cost + paraphrase risk on top of a solved rendering problem.
7. **Unattended auto-fix bot** (auto-merge campaign steps in CI, no human). The gate checks *structure*, not semantics — it cannot judge whether a merged body's behavior drift matters. Idea 1 keeps a human-owned session and the revert path; removing the human removes the fallback that makes the failure mode acceptable.
8. **AI-generated node summaries inline in `graph.json`.** The right idea (see Idea 3) in the one wrong place: graphs must stay byte-identical for the same input ("absent input leaves graphs byte-identical" is an existing documented guarantee). Sidecar or nothing.

**Boring-beats-AI ledger (things that sound like AI features but are rules — build them as rules):** the unmapped-repo SessionStart nudge and staleness nudge (FUNNEL §2 — thresholds, not judgment); a "you're grepping for callers" reminder hook (string match on the Grep/Bash tool call, Serena-pattern); empty-map and symbol-not-found guidance (already templated `hint` strings); auto-`--open` on TTY. None of these should ever grow a model call.

---

## 5. Prototype-this-week pick

**Idea 1, scoped to one day: `/codeweb-apply` for ready-tier merges only.**

Day plan:
1. **(2h)** Write `commands/apply.md` + a "Execute the campaign" section in `skills/codebase-anatomy/SKILL.md`: loop = `codeweb_campaign` (or `optimize --json` ready tier) → per step `codeweb_simulate` → apply via `node scripts/codemod.mjs <graph> --merge <ids> --into <id> --write` → `codeweb_refresh` → `codeweb_diff` (before-snapshot kept per step) → `codeweb_tests` for the survivor → commit with a message citing the step, or revert + record blocked-with-reason. Hard rules: ready tier only, stop on first gate failure, never touch review/blocked tiers, print a final receipt (steps applied/blocked, LOC delta, gate verdicts).
2. **(2h)** Dry-run on codeweb's own self-map (`node scripts/run.mjs . --out-dir .codeweb`), then on an axios clone — the case study's `setFormDataHeaders` merge (ready, ~12 LOC, gate-green) is the demo with a known answer.
3. **(2h)** Failure-path drill: force a bad merge (edit the plan) and verify the revert path leaves the tree clean and the step recorded as blocked.
4. **(1h)** Write the receipt line into the final output ("applied 1 merge · −12 LOC · 0 regressions · gate green") and a README stub under the campaign section.

Zero engine changes; zero new dependencies; `codemod --write` stays CLI-only (the MCP read-only trust line is untouched). If the day succeeds, the artifact is a screencast-able loop that demonstrates COMPETITIVE.md Bet 3 end-to-end — and the follow-up week adds the review-tier judgment drafting.

---

## Next

Top candidates for the operator to choose from: **(1) Campaign Copilot `/codeweb-apply`** — highest value, all primitives exist, day-one prototype above; **(2) Narrated map sidecar** — cheapest visible upgrade to the brief + report, determinism untouched; **(3) Tool-routing optimization** — the spend-gated one, but the biggest multiplier on every existing install (batch it with Idea 6's fallback grading to share the bench budget). The gimmick list §4 — especially no-embeddings and no-LLM-in-pipeline — is as load-bearing as any build choice and should be adopted alongside whichever idea is picked.
