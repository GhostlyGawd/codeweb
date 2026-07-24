# Comprehension audit — 2026-07-24

First run (no prior `COMPREHENSION.md`). Method: each public surface was met **cold, in visitor
order** — README top screenful + About block, the live pages (`/`, `/start.html`, `/product.html`,
`/demo/`, fetched over HTTP), the npm listing surface (`package.json`), the real first run
(`scripts/run.mjs` on a scratch project), the agent surfaces (`hooks/session-brief.mjs`,
`hooks/pre-edit-impact.mjs`, MCP handshake `INSTRUCTIONS`), and the plugin listing
(`.claude-plugin/marketplace.json` + `plugin.json`) — with a ten-second read recorded *before*
studying each. `DOCS.md`, `COPY.md`, `API.md` were read only afterwards; overlaps are cited, not
restated. Only write: this file.

**Verdict up front.** This product explains itself unusually well for its category: the category is
named in plain words on every major surface, both audiences are addressed by name, the mechanism is
shown (pipeline stages, a live demo of a real repo, "what success looks like" output), and the
alternative (an agent grepping) is named and beaten with numbers. The comprehension debt is not
"nobody gets it" — it is five specific breaks where a correct mental model gets **falsified by the
product's own surfaces**: three tool descriptions that literally render "undefined", a repo root
that impersonates a marketing project, a plugin that goes silent right after install, two
first-command paths that fail as documented, and a "living map" metaphor that promises a watcher
the product doesn't have.

---

## 1. Mental-model gap — intended vs the honest ten-second read

| Surface | One-liner it tries to plant | Honest ten-second read | Gap |
|---|---|---|---|
| **GitHub About block** ("See what an edit breaks before you write it — deterministic call/import graph + 27 MCP tools for coding agents…") | Impact-before-edit tool for agent users | Exactly that | None — best compact statement the project has, tied with npm |
| **README top screenful** (`README.md:12-44`) | "Agents answer *who uses this / what breaks* exactly and cheaply from a prebuilt graph instead of grepping" | Got it — *if* you already run a coding agent and know what grep costs. The tagline `Your coding agent greps. codeweb knows.` is a riddle to anyone else; the category arrives in body copy (line 19, "maps the repo's call/import graph") | Small for the target reader; the file list *above* the README muddies it badly (Finding 2) |
| **Site hero** (`site/content/index.html:5-11` → live `/`) | "One deterministic graph, two interfaces: interactive map for you, 27 tools for your agent — know what breaks before you write" | Got the category ("Deterministic code map" kicker) and the dual audience in one glance | Three snags: "living map" (implies auto-updating), chip `runs on an empty node_modules` (parses as nonsense), stat-strip research jargon (Findings 6-8) |
| **/start.html** | "Pick your path — plugin, MCP server, or plain npx — and here's what success looks like" | Clear three-way fork by audience; the success log is a great expectation-setter | Quickstart silently switches to clone-only commands (Finding 4); success example over-promises findings (Finding 9) |
| **/product.html** | "27 tools cover every phase of the edit loop" | Clean digger-layer catalog, grouped by phase | Three cards say `undefined` where the description goes (Finding 1) |
| **/demo/** | "This is axios, really mapped — click around" | Self-explaining: banner `this is axios, mapped`, legend, `Pick an item to inspect it.` | None worth fixing |
| **npm listing** (`package.json:5`) | "See what an edit breaks before you write it — … graph … 27 MCP tools … interactive map … zero deps, runs 100% locally" | Exactly that; strongest one-liner of all surfaces | None |
| **CLI first run** (`scripts/run.mjs` output) | "One command → map + findings + numbered next steps" | Ends in a result and a `next:` list — good first win | Mid-log telemetry is insider-speak (Finding 8); tiny repos end at `0 actionable finding(s)` with no reframe (Finding 9) |
| **Session brief** (`hooks/session-brief.mjs`) | "Your agent now knows this repo — ask codeweb before guessing" | On a *mapped* repo: the best teaching moment in the product (`load-bearing (most depended-on — check impact before touching)`, `ask codeweb before guessing: codeweb_find → codeweb_explain → codeweb_context`) | On an *unmapped* repo: total silence (Finding 3) |
| **Plugin marketplace** (`.claude-plugin/marketplace.json:15`) | "/codeweb builds the graph; hooks brief every session and impact-check every edit; 27 tools answer before the agent writes" | Mechanism-in-a-sentence; the best listing copy | `plugin.json:4` leads with process-poetry instead ("Dissect a codebase to its atomic parts … living system web"); `marketplace.json:9` says version `1.0.0` while everything else says 0.10.0 |

---

## 2. Findings — ranked by cost

Each: **lens · location · wrong belief a newcomer walks away with · fix**. Class:
[never] = never explained · [late] = explained too late · [jargon] = explained in insider terms.

### 1. Three of the "27 deterministic tools" describe themselves as `undefined` — on the page that sells precision
- **Lens:** Concrete over abstract / What is this. **Class:** [never] (a build bug, not copy).
- **Location:** live `/product.html` = `docs/product.html:127,139,150`:
  `<span class="te-name">codeweb_annotate</span><span class="te-desc">undefined</span>` — same for
  `codeweb_simulate` and `codeweb_stats`.
- **Root cause (new — not in DOCS/COPY/API):** those three entries in `site/data/product.json`
  carry the key `blurb`; `site/build.mjs:86` renders `${t.desc}` → the literal string `undefined`
  is baked into the shipped HTML. `check-consistency` counts tools (27 ✓) but never checks that
  each has a description.
- **Wrong belief:** "This project is unfinished — the 27-tool number is padded, and a page this
  broken can't be a 'deterministic, 0-disagreements' tool." It falsifies the headline claim at the
  exact evaluation surface, in the product's own chosen genre (receipts).
- **Fix:** rename `blurb` → `desc` in the three entries (or make `build.mjs` read
  `t.desc ?? t.blurb`); add a build-time assert "every tool has a non-empty desc" so this class
  can't ship again.

### 2. The GitHub repo's first screenful is 16 ALL-CAPS marketing reports — above the README
- **Lens:** What is this / Progressive disclosure. **Class:** [never].
- **Location:** repo root file list (rendered *above* the README on the repo page): `ACTIVATION.md`,
  `AI-IDEAS.md`, `CHECKOUT.md`, `COMPETITIVE.md`, `CRO.md`, `FORMS.md`, `FUNNEL.md`, `PROOF.md`,
  `RETENTION.md`, `REVENUE.md`, `SEO.md` … beside `README.md`/`SECURITY.md`. Extends DOCS.md
  Gap 6 (shelf labels) with the first-surface angle: the visitor meets `REVENUE.md` and
  `CHECKOUT.md` *before* the hero image.
- **Wrong belief:** "This is a growth-hacking experiment / AI-generated content repo, not a serious
  engineering tool" — a "what is this" corruption that happens before one line of the pitch is
  read, and it directly undercuts the sober-engineering voice the README then tries to establish.
- **Fix:** move the working reports to `docs/reports/` (or `.reports/`), or at minimum prefix
  them out of the visual A-Z top (`_reports/`). One README line ("internal working audits live in
  docs/reports/") keeps the transparency win without the shelf confusion.

### 3. Install the plugin, open a session — and codeweb says nothing
- **Lens:** How it works / first-run. **Class:** [never] — no surface says hooks are inert until a
  map exists.
- **Location:** verified live: on a repo with source but no `.codeweb/`, `hooks/session-brief.mjs`
  and `hooks/pre-edit-impact.mjs` both exit 0 with **zero output** (DOCS.md walk step 16 calls
  this "fail-open", API.md §1d "inert when unmapped" — by design). But the listing copy promises
  ambient behavior: `marketplace.json:15` "hooks **brief every session** and **impact-check every
  edit**"; README.md:174 "**ambient** pre-edit impact cards".
- **Wrong belief:** "The plugin didn't install / doesn't work." The user's one required action
  (`run /codeweb once`) is stated in start.html and README, but the product itself never asks for
  it at the moment it matters — the first unmapped session — so the activation cliff is silent.
- **Fix:** one-time nudge in the SessionStart hook when cwd has source but no graph:
  `[codeweb] this repo isn't mapped yet — run /codeweb (or codeweb_map) to turn on briefs and
  impact cards.` Keep it once-per-workspace (a stamp file) to preserve the quiet-by-default
  posture.

### 4. The quickstart teaches commands the installer it just recommended cannot run
- **Lens:** How it works / Curse of knowledge. **Class:** [late] — the clone/npx split is explained
  in README.md:196-199 but not where the commands are used.
- **Location:** `site/content/start.html:59,65,71,77` — steps 1-4 of the "Five-minute quickstart"
  are `node scripts/run.mjs …`, `node scripts/query.mjs …`, `node scripts/diff.mjs …`,
  `node scripts/ci-gate.mjs …`, immediately after the page's three install paths, none of which
  produce a `scripts/` directory in the user's project (`npx -y @ghostlygawd/codeweb .` is the
  path the same page just recommended to the undecided: line 32).
- **Wrong belief:** "`node scripts/run.mjs` → `Cannot find module` → the quickstart is broken."
  Same family as DOCS.md D1 (README.md:200-201's "**bundled** sample code" pointing at a
  gitignored corpus — confirmed: the advertised first win exits 1 on a fresh clone).
- **Fix:** head the quickstart with "from a clone of this repo:" and add the npx/bin equivalents
  (`npx -y @ghostlygawd/codeweb .`, `codeweb-query`, `codeweb-diff` — currently documented
  nowhere, DOCS.md Gap 1); apply DOCS.md's D1 fix to README.md:200.

### 5. "The living map" promises a watcher that doesn't exist
- **Lens:** One-sentence test / What is this. **Class:** [never] qualified.
- **Location:** site h1 `site/content/index.html:5` ("The **living map** of your codebase."),
  README hero SVG alt `README.md:3`, `marketplace.json:8` ("the living map"), `plugin.json:4`
  ("living system web"), `commands/codeweb.md:8` ("biological web").
- **Wrong belief:** "It watches my files and stays current by itself." Reality: the map updates on
  re-run/`codeweb_refresh` (MCP auto-refresh exists only inside agent sessions; the human path is
  manual). First stale `report.html` reads as product failure, not workflow.
- **Fix:** either earn the word where it's true ("stays live in agent sessions — auto-refresh +
  staleness warnings; re-run for the standalone map", one line under the hero) or trade it for an
  honest superlative ("the shared map of your codebase"). Drop "biological web" from
  `commands/codeweb.md` — it's the insider-est phrase on any surface (COPY.md's glossary already
  picks plain names).

### 6. `runs on an empty node_modules` — a trust chip that parses as a requirement
- **Lens:** Curse of knowledge. **Class:** [late] — decoded on start.html ("Zero required
  dependencies (an empty node_modules works)") and README.md:169, but the hero chip stands alone.
- **Location:** `site/content/index.html:11` — `v{{version}} · runs on an empty node_modules ·
  never executes the code it maps`.
- **Wrong belief:** "It needs an empty node_modules?" / "something about my node_modules will be
  touched." The chip compresses a proof ("zero deps, CI-verified") into words only the author can
  decompress in ten seconds.
- **Fix:** `zero dependencies · never executes your code · MIT` — keep the empty-node_modules
  proof one layer down where it's already explained.

### 7. The hero's proof strip speaks methods-section, not visitor
- **Lens:** Concrete over abstract / Curse of knowledge. **Class:** [jargon].
- **Location:** live `/` stat strip (`{{headline_stats}}`, `site/content/index.html:27`, rendered
  from `site/data/product.json`): `32 / 33 pre-registered checks pass`, `~490k oracle comparisons,
  0 disagreements`, `+0.31 / equal cost … (v0.9.0 pilot)` captioned with raw filenames
  (`bench/preregistration.md`, `correctness-query.json`, `efficiency-pilot.reps5-v090.json`).
- **Wrong belief:** two failure modes — the generous reader files it as "academic project, not for
  me"; the literal reader asks "so one check *fails*?" and "0.31 of what?" Nothing on this surface
  defines pre-registered, oracle, or recall (the evidence section lower down helps, but the strip
  fires first).
- **Fix:** translate each number's caption into visitor language and keep the filename as the
  receipt link: "32/33 pre-registered checks pass — the one miss is published too" · "~490k answers
  cross-checked against an independent referee — 0 disagreements" · "+31% of true callers found vs
  grep, at the same token cost (pilot)".
- Same family, same fix-class: the README top screenful spends lines 25-40 on
  `oracle-ab.json`, "frontier-agent A/B", "engine-frozen reps", "body-confirmed" — methodology
  vocabulary one layer too early (the audience gate is README.md:12's tagline itself; fine for
  agent-owners, a riddle for the "just want the map" persona the install section explicitly
  serves at line 188).

### 8. The first run narrates its pipeline in internal vocabulary
- **Lens:** Curse of knowledge. **Class:** [jargon] (cosmetic — the ending redeems it).
- **Location:** live first-run output (verified on a scratch project): `dropped 0 ambiguous
  bare-call edges (0 short-name)`, `wired 0 dispatch edge(s)`, `hubs stripped (indeg>=12)`,
  `isolated-after-dehub: 2 (29%)`, `source: FOUND — body-confirmed`.
- **Wrong belief:** none fatal — but the first minute with the product reads like someone else's
  debug session, which dilutes the (excellent) closing `[run] mapped … next: 1. see the map …`.
- **Fix:** demote stage telemetry behind `CODEWEB_VERBOSE`; the default run prints one line per
  stage + the result block. (COPY.md's voice rules already point here; this extends them from
  strings to verbosity.)

### 9. The success story says 14 findings; the visitor's first repo says 0 — and nothing reframes it
- **Lens:** Why this / first-run. **Class:** [never].
- **Location:** `site/content/start.html:41` (`[run] mapped 1668 symbols -> 14 actionable
  finding(s) · 6 ready merge(s)` as "what success looks like") vs the real first run on a small or
  clean repo: `0 actionable finding(s)` (verified). The CLI's `gate would stay green` aside is the
  only hint that zero is good.
- **Wrong belief:** "It found nothing — no value here" — when the durable value (impact queries,
  the map, the gate) is exactly what a clean repo still gets.
- **Fix:** teach the zero state where it happens: `0 actionable finding(s) — structure is clean;
  the map and impact tools are the payoff: open .codeweb/report.html` (COPY.md rule 5: empty
  states say what emptiness means), and caption the site example "a 1,668-symbol repo with real
  duplication — a clean repo ends at 0 findings, gate green".

### 10. Copy asserts one gate; the product ships three — confirmed, comprehension cost restated
- **Lens:** How it works. **Class:** [never] (the divergence is documented nowhere user-facing).
- **Location:** already fully evidenced as DOCS.md D2 / COPY.md #2 / API.md F1 (README.md:284-287,
  `docs/ci-gate.md:3-4`, `simulate-edit`'s "the gate would reject this edit").
- **Wrong belief (the comprehension framing):** "one gate protects me everywhere" — a CI adopter
  believes exported symbols losing their last caller fail the build (they don't); an agent
  believes simulate's BLOCK is the gate's verdict (it isn't). The safety mental model — the
  product's core promise — is the one place the surfaces teach something false.
- **Fix:** as API.md §5 (one `gateVerdict()`, presenters name their scope); until then the
  one-sentence honesty fix from DOCS.md item 2 belongs on every surface that says "the gate".

### 11. Small trust nicks (each one line to fix)
- `site/content/start.html:88` — heading `Five ideas that make the rest click` over **six** cards
  (confirmed live; COPY.md #6). Belief: "they don't proofread their own teaching page."
- `.claude-plugin/marketplace.json:9` `"version": "1.0.0"` vs 0.10.0 everywhere else. Belief:
  "which version am I getting?"
- `plugin.json:4` opens with process ("Dissect … wire … tag …") where every sibling surface opens
  with the benefit; swap the first clause for `package.json:5`'s opener.
- README.md:510 "chains five stages" vs the four-item list below and `:514` alt "four
  deterministic stages" (DOCS.md item 5). Belief: "do *they* know how many stages it has?"
- VS Code lens `N callers · blast M` with "blast" undefined on that surface (COPY.md #3) — the
  highest-frequency human string in the product.

---

## 3. First-screen rewrite

**Site hero** — keep the structure (kicker · H1 · promise · dual-audience line · two CTAs), swap
the four words that mislead and translate the proof strip:

> **Deterministic code map**
> **The shared map of your codebase.**
> **Know what exists, and what an edit breaks — before you write.** One command reads your code
> (never runs it) and builds the graph in ~3 s. You get an interactive map; the coding agents
> editing alongside you get the same graph as **27 exact tools** — no LLM in the loop, so answers
> don't drift.
> [Map your repo] [See the live demo]
> zero dependencies · never executes your code · free & MIT
> *32/33 pre-registered checks pass (the miss is published) · ~490k answers cross-checked, 0
> disagreements · +31% of true callers found vs grep at equal token cost (pilot)*

**README first screenful** — keep the tagline as the hook, but let the About-block sentence land
before the methodology: after `README.md:12`, insert the category line verbatim from
`package.json:5` ("See what an edit breaks before you write it — deterministic call/import graph
of your codebase, 27 MCP tools for coding agents, and a self-contained interactive map."), then
move the benchmark table's methodology detail (lines 25-40) down into "Proven effective". And fix
the shelf: the reports move out of the root so the file list stops answering "what is this" with
`REVENUE.md`.

## 4. Explain-it-back script

Three sentences a newcomer should be able to repeat after one visit — and where each is taught
today:

1. **"codeweb reads my repo — never runs it — and builds a deterministic call/import graph in a
   few seconds."** Taught well: hero chip + `README.md:14` + start.html privacy line; weakened
   only by "living" (Finding 5).
2. **"My coding agent queries that graph over MCP — who calls this, what breaks, does this already
   exist — and gets exact ~1 KB answers instead of grepping whole files."** Taught well:
   `README.md:17-23`, product page phases, MCP `INSTRUCTIONS` (`scripts/mcp-server.mjs:54-61`);
   weakened by the three `undefined` cards (Finding 1) and the silent unmapped session
   (Finding 3).
3. **"I get the same graph as a self-contained interactive map — duplication, dead code, hotspots
   — and a diff gate that fails CI on structural regressions."** Taught: See-it-in-action +
   `/demo/` + start.html steps 3-4; weakened by the gate's three meanings (Finding 10) and the
   0-findings first run (Finding 9).

Sentence 2 is the one at risk: it is the product's actual thesis, and every break that matters
(Findings 1, 3, 4, 10) sits somewhere along its path.

---
*Read-only audit; the only write is this file. Live pages fetched over HTTP as a visitor; CLI and
hooks exercised against scratch workspaces (`stage4/` in the session scratchpad), not the repo's
own tree.*
