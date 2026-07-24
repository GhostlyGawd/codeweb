# UI microcopy & labeling audit — 2026-07-24

First run (no prior `MICROCOPY.md`). Scope: the small words the interface runs on — report.html
chrome (tabs, toggles, tooltips, legends, empty states, the details drawer), the VS Code
extension's labels, site nav/footer chrome, and the CLI lines that function as labels (verdicts,
section headings, next-steps, confirmations). Method: every string surface read in source
(`scripts/report-template.html`, `scripts/build-report.mjs`, `editor/vscode-codeweb/*`,
`site/templates/*` + `site/build.mjs`, `scripts/{codemod,annotate,deadcode,break-cycles,optimize,
run,diff,ci-gate}.mjs`, `scripts/lib/{brief-core,gate-md,graph-ops,diff-core}.mjs`,
`hooks/*.mjs`), then exercised live: a fixture repo was mapped
(`node scripts/run.mjs` → report.html/optimize.md/report.md), `codemod` was run plan-only and
`--write`, and the shipped demo specimen (`docs/demo/index.html`) was compared to the template.
`COPY.md` (stage 2) is the base layer: its glossary (domain vs. "area", the findings triple, tier
display names, "blast" definition-on-first-contact) and its worst-10 rewrites are **established —
cited below, not re-derived**. `ERRORS.md`/`CLI.md` own failure text; nothing there is re-audited.

Where strings live: everything is hardcoded at point of use — no i18n layer (COPY.md §5 confirmed
none is needed). The joints that matter are shared (`bucketsLine`, `loadGraph`), but the report
template hand-mirrors vocabulary in inline JS and the demo is a *committed* build artifact — both
are exactly where the drift below happened.

---

## 1. String findings

Ranked by stakes × frequency. Every entry: **lens · location · current → rewrite**.

### A. Unclear — the label hides what happens (high stakes first)

**A1. The codemod's verdict claims a gate it doesn't run** — *says what happens / honest confirmation*
- `scripts/codemod.mjs:191`: `projected gate: PASS` / `projected gate: BLOCK (…)`
- This line prints immediately above `--write`, which **deletes source lines**. But the check
  behind it (`structuralRegressions`, `scripts/lib/graph-ops.mjs:554-569`) is not the shipped
  gate: the CI gate (`scripts/lib/diff-core.mjs:120-126`, run verbatim by `ci-gate.mjs`) exempts
  exported symbols from the lost-caller rule **and additionally blocks on new duplication
  findings** — neither is true of this pre-flight. COPY.md worst-10 #2 pinned this exact disease
  on `simulate-edit.mjs` and rewrote it; `codemod.mjs:191` has the same words and was not on that
  list. A "projected gate: PASS" here can be followed by a real CI BLOCK (new duplication), and a
  "BLOCK" here can be a CI pass (exported orphan).
- Rewrite (matching COPY.md #2's pattern):
  `projected: PASS — no new cycles; no surviving symbol loses its last caller` /
  `projected: BLOCK — new cycle or lost caller (details below)` plus one qualifier line:
  `  (checks cycles + lost callers — stricter than the diff.mjs/CI gate on exports; does not count duplication)`
- Same fix applies to the refusal string at `scripts/codemod.mjs:86`:
  `the gate predicts a regression — refusing to write` → `the pre-flight predicts a regression (new cycle or lost caller) — refusing to write`.

**A2. "rewires N caller(s)" / "APPLIED" promise edits the write doesn't make** — *honest confirmation*
- `scripts/codemod.mjs:190,193,194`: `removes 1 copy(ies), rewires 1 caller(s), ~5 LOC, blast 3` ·
  section `rewrites:` · `write: APPLIED to 1 file(s)`
- Observed live on the fixture: `--write` deleted the duplicate `hashPassword` from
  `billing.mjs` and touched **nothing at the caller** — the surviving call now references an
  unimported symbol (codemod rewrites renamed tokens and repoints existing import specifiers,
  but never *adds* an import; the code's own comment at :141-145 admits the structural gate can't
  see this). stdout still said `rewires 1 caller(s)` → `write: APPLIED to 1 file(s)`, exit 0.
- Rewrites: summary → `removes 1 copy(ies) · 1 caller/importer site(s) to re-check · ~5 LOC · blast radius 3`;
  section header `rewrites:` → `caller/importer sites to re-check (codemod renames tokens and repoints imports — it never adds an import):`;
  confirmation → `write: applied — deleted 1 definition(s) in 1 file(s); re-extract gate ok (0 new cycles, 0 lost callers). Verify imports at the sites above.`

**A3. "gated + reversible" reads as undo; there is none after success** — *honest confirmation*
- `scripts/codemod.mjs:195`: `(plan-only — pass --write to apply, gated + reversible)`
- Backups are in-memory only (`backup`/`restore()`, :96-98) and are dropped once the write
  sticks. "Reversible" is true only *during* the run (auto-revert on a post-edit regression);
  after `APPLIED` the deleted lines are gone unless git has them.
- Rewrite: `(plan-only — --write applies it, and auto-reverts only if the post-edit re-extract regresses; after a successful apply, undo is git's job)`

**A4. "safe to delete" leads; the doubt arrives after the list** — *helper where it helps*
- `scripts/deadcode.mjs:120` heading: `safe to delete (no caller, not exported, no test):` — the
  caveat (`…a genuinely-called symbol can surface here — cross-check before deleting`, :45)
  prints at :128, **after** both lists. The heading is the label people act on; the hedge must
  precede the delete, not follow it.
- Rewrite: heading → `delete candidates (no caller, not exported, no test — extraction can miss dynamic calls; cross-check before deleting):`
  and drop the trailing note, or keep the note *above* the first list.

**A5. The suppression workflow has no visible door** — *says what happens*
- `scripts/deadcode.mjs:118-128`: the human (non-`--json`) output prints `N suppressed` counts
  but **never a fingerprint and never the command** — fingerprints exist only in the JSON
  payload (:92-93), so a user staring at a false positive has no path to
  `annotate.mjs --suppress <fingerprint>` (the only mutation in the workflow,
  `scripts/annotate.mjs:8`).
- Rewrite: append one footer line to the text output:
  `  false positive? suppress it: node scripts/annotate.mjs --suppress <fingerprint> --note "why"  (fingerprints: --json)` —
  or print the fingerprint per row: `  ${o.id}  [${o.domain}]  (${o.loc} loc)  fp:${o.fingerprint}`.

**A6. The role-filter tooltip promises the opposite action half the time** — *says what happens*
- `scripts/report-template.html:152`: `title="Hide tests, fixtures, examples and generated code from every view"` —
  static, while `syncRoleBtn` (:364-368) flips only the text (`Product only ✓` / `All code`).
  When the filter is ON, clicking *shows* those roles; the hover still says "Hide".
- Rewrite: set `title` in `syncRoleBtn`: ON → `Showing product code only — click to include tests, fixtures, examples and generated code`;
  OFF → `Click to hide tests, fixtures, examples and generated code from every view`.

**A7. The graph toggle's middle state is a status, not an action** — *says what happens*
- `scripts/report-template.html:990`: `Collapse (3 open)` (between `Expand all symbols` and
  `Collapse to areas`). "Collapse (3 open)" names neither the object nor the result.
- Rewrite: `Collapse 3 open domains` · end-state label `Collapse to areas` → `Collapse to domains`
  (glossary, COPY.md #5) · `Expand all symbols` stays.

**A8. VS Code command title promises a palette action it can't perform** — *says what happens*
- `editor/vscode-codeweb/package.json:31`: `"codeweb: Open symbol in the interactive report"` —
  the command needs `(graphPath, id)` arguments (`extension.js:101`) that only a lens click
  supplies; from the Command Palette there is no symbol and the handler falls over.
- Rewrite: `"codeweb: Open the interactive report"` + make the no-args path open plain
  `report.html` beside the nearest graph — or mark the command palette-hidden
  (`"enablement": "false"` / omit from palette menus). The label must match what a palette
  invocation actually does.

### B. Jargon — system words surfaced as labels

**B1. "blast" undefined at the settings surface** — `editor/vscode-codeweb/package.json:44`:
`Show codeweb CodeLens (callers · blast) above mapped symbols.` — settings is a first-contact
surface; COPY.md's glossary requires "blast radius" defined once per surface (its #3 fixed the
hover, not this). Rewrite: `Show codeweb CodeLens above mapped symbols: direct callers · blast radius (symbols affected if this changes).`
Same word bare in the codemod summary (`blast 3`, `scripts/codemod.mjs:190` — covered by A2's rewrite)
and in `optimize.md` rows (`blast 3`, `scripts/optimize.mjs` render) → `blast radius 3` on first use per document.

**B2. "body-refuted" + a pointer the viewer can't follow** — `scripts/report-template.html:532`:
`N candidate(s) dismissed (body-refuted) — full transparency list in overlap.md` — internal
pipeline vocabulary, and `overlap.md` is a workspace file a *shared* report's reader does not
have. Rewrite: `N candidate(s) dismissed — same name, but the bodies differ too much to merge. Full list: .codeweb/overlap.md beside the graph.`

**B3. "body 87%" in the drawer** — `scripts/report-template.html:489`: `· body 87%` — the one
place body-similarity surfaces without its noun. Rewrite: `· bodies 87% similar`.

**B4. Treemap legend names a metric it never explains** — `scripts/report-template.html:166`:
`duplication [bar] 0 → 100%`. Percent of *what* lives only in the per-file tooltip. Rewrite:
add `title="share of this file's functions also defined elsewhere"` to `#tmLegend` (keeps the
compact label).

**B5. "loc" / "cx"** — graph legend `○ symbol — size = loc` (`report-template.html:172`) and the
`cx 14` abbreviation in explain/hotspots — COPY.md already lists `cx` as a near-miss; `loc` is
acceptable dev shorthand but the legend has room: `size = lines`. Low priority.

### C. Inconsistent terms — two names, one concept

**C1. "areas" vs "domains", the instances COPY.md didn't cite** — COPY.md worst-10 #5 already
owns the report chrome (`report-template.html:172,351,429-431,573,990` and the brief header
`scripts/lib/brief-core.mjs:76-78`); adopt those rewrites. New instances of the same split found
this pass, all on *share* surfaces:
- `scripts/build-report.mjs:126` (og:description of every built report): `N symbols · N edges · N areas · N findings`
  — while the same build's stdout (:141) says `N domains`. One build, two names. → `N domains`.
- `scripts/report-template.html:434` (drawer how-to): `click an area bubble to expand it` → `domain bubble`.
- `scripts/report-template.html:468` (duplication drawer): `defined in N files · N area(s)` → `N domain(s)`.
- `site/build.mjs:368,373` (demo page meta): `274 product symbols across 8 areas` / `…, 8 areas, …` → `8 domains`.

**C2. The public demo still shows the label the product retired** — *inconsistent term, shipped*
- `docs/demo/index.html` (masthead JS): `duplicates.length + ' dup-groups'` — the string the
  current template explicitly replaced because it "contradicted the findings ledger on every
  run" (`report-template.html:326-329`, ACTIVATION A4). The demo is a committed artifact "not
  regenerated by this build" (`site/build.mjs:340`), so the site's highest-conviction surface
  (nav: "Live demo") renders retired vocabulary and a number the product itself disowned.
- Fix: rebuild `docs/demo/index.html` from the current template; add the built demo to the
  `check-consistency` sweep COPY.md §5.4 already proposes for templates.

**C3. severity vs. confidence — same slot, different dimension, never labeled**
- Fixture finding ov1 renders as `high` (red badge, confidence) in report.html
  (`report-template.html:489,524`), `[LOW]` (severity) in optimize.md (`scripts/optimize.mjs:160`),
  and `` `low` `` (severity, bare) in report.md (`scripts/build-report.mjs:204`). Three sibling
  surfaces lead with an unlabeled value from two different scales — a reader comparing them sees
  "high" and "low" for the same finding.
- Rewrite: name the dimension wherever the bare value appears — report.html badge gets
  `title="confidence: high"`; report.md → `` — severity `low` ``; optimize rows already carry both
  (`[LOW … high]`) but unlabeled → keep, and label in the legend line.
  Also `report-template.html:89`: confidence "high" wears `--stCritical` red — the same red the
  duplication table uses for *worst* file counts; red-as-good-confidence next to red-as-bad-count
  on one screen invites the wrong read. Move confidence badges to the accent/neutral badge style.

**C4. Third display name for the `review` tier** — `scripts/optimize.mjs:158`: row tag `JUDGE  `
alongside the summary's `judgement call(s)` and the JSON's `review`. Glossary says one display
name; `JUDGE` also parses as an imperative. Rewrite: tag → `REVIEW?` is worse; use `JUDGEMENT`
(pads to 9) or keep the triple `READY/BLOCKED/JUDGEMENT`.

**C5. Drawer sections mislabel edge kinds** — `scripts/report-template.html:459-460`:
`used by (N)` / `calls (N)` — both lists carry **all** edge kinds (calls, imports, inheritance,
tests, refs; `inAdj`/`outAdj` are built from every edge, :209-215). Glossary: "dependents" for
all-kind inbound, "calls" only for call edges. Rewrite: `used by (N)` stays (plain-language
dependents); `calls (N)` → `depends on (N)`.

**C6. Nav/footer case split** — `site/templates/nav.html:13` `Get Started` vs
`site/templates/footer.html:18` `Get started`. Pick sentence case (`Get started`) — it matches
`Live demo`, `Raw results`, `MIT License` neighbors.

**C7. Toolbar casing** — `report-template.html:153,305,365,988`: `copy link` and `auto ◐` sit
lowercase beside `Product only ✓`, `Fit`, `Findings`. One toolbar, one convention: `Copy link`,
theme label capitalized (`Auto ◐`), or lowercase everything. Sentence case recommended (matches
the tab row).

### D. Placeholder-as-label / helper placement

**D1. Graph search: the instruction lives in the placeholder** — `report-template.html:169`:
`placeholder="search symbols… (Enter jumps)"` with no visible label. The "(Enter jumps)" hint
vanishes at the first keystroke — exactly when it's needed. Mitigations already present
(aria-label; the count chip re-teaches `N match(es) — Enter jumps`, :1004), so this is minor:
keep the placeholder as `search symbols…` and let the chip carry the key hint (it already does);
sighted users get the hint pre-typing from a `title` on the input.

**D2. Editor-root inline form** — `report-template.html:400-401`: the input's only visible
identity is the placeholder `/absolute/path/to/project` (good format example, wrong as sole
label) and the button is bare `save`. The adjacent `stored only in this browser` note is
excellent. Rewrite: button → `Save root`; keep placeholder as the format example (the
aria-label already names the field). The trigger link pair is also split: `set root for editor
links` (no root) vs `root ✎` (root set, :420-422) — make the second `change root`.

### E. Fine as-is, noted so nobody "fixes" them

- `diff.mjs:45-46`: `REGRESSIONS (a gate would block):` / `ok — no structural regressions` —
  honest subjunctive; diff never claims to *be* the gate. Keep.
- `gate-md.mjs:22,58`: the PR comment's `✅ no structural regressions` / `**Blocking:**` and its
  "same verdict as the gate" footer — legitimate: `ci-gate.mjs` literally runs `diff.mjs`
  (shared code path, COPY.md voice rule satisfied). One nit: `❌ N regression type(s)` counts
  categories, not regressions — `N regression class(es)` or list the total.
- `annotate.mjs:45`: `codeweb annotate: suppressed <fp> in <dir> (N total). Source untouched.` —
  model confirmation: names the object, the scope, and the non-action. Add the undo while truth
  allows: `undo: remove it from <dir>/annotations.json`.
- `copy link` → `copied ✓` (:294), the staleness chip `findings not recounted` (:337), `mapped
  N days ago` (:346), `Product only ✓` label itself, `break-cycles`' `VERIFIED to break the
  cycle`, and the hook cards' `blast radius N` (spelled out, `lib/context-core.mjs:64`) — all
  say what happened; keep.
- `run.mjs:305-308` `next:` block — numbered, runnable, result-first. One slip: step 3's
  "re-run codeweb here" names no runnable command (voice rule) → `re-run: npx -y @ghostlygawd/codeweb .`.
- Grammar nit, both optimize surfaces (`optimize.mjs:140,156`): `1 actionable findings` — the
  product's own `(s)` discipline, missed here → `${n} actionable finding(s)`.
- Empty states `—` at `report-template.html:538,540,462` — already COPY.md worst-10 #7; adopt
  its rewrites (the drawer's calls-empty `—` → `— depends on nothing in the map`).

---

## 2. Term glossary (interface layer — extends COPY.md §3, which governs)

| Concept | The one word | Retire / rule |
|---|---|---|
| Symbol cluster | **domain** | "area" — including og:descriptions (`build-report.mjs:126`, `site/build.mjs:368,373`), drawer strings (:434,:468), and the demo rebuild (C2). |
| Count of findings | **the triple: N actionable · N needs review · N dismissed** | Raw `overlaps.length` rendered as "N findings" (`build-report.mjs:126` og text) — use `N actionable findings`. `dup-groups` stays dead (C2). |
| Finding strength | **confidence** (high/medium/low) — always labeled | A bare `low`/`high` badge with no dimension word; severity and confidence never share a slot unlabeled (C3). |
| Change impact | **blast radius** (define once per surface; "blast N" only after) | Bare `blast` in settings descriptions, plan summaries, optimize rows (B1). |
| Pre-flight result | **projected: PASS/BLOCK** + what was checked | `projected gate:` — only `diff.mjs`/`ci-gate.mjs` output speaks for the gate (A1, COPY.md #2). |
| Applied write | **applied — did X; check Y** | Bare `APPLIED to N file(s)`; "reversible" for anything without a real undo (A2, A3). |
| Deletion candidates | **delete candidates** (+ caveat up front) | Heading "safe to delete" with the hedge below the list (A4). |
| Optimize tiers | **ready · blocked · judgement calls** | `JUDGE` row tag (C4); `review` stays JSON-only (COPY.md). |
| Inbound list | **used by** (all kinds) | — |
| Outbound list | **depends on** (all kinds) | "calls" for a list that includes imports/refs (C5). |

## 3. High-stakes labels — reword these first

1. `projected gate: PASS` — `scripts/codemod.mjs:191` (and `:86`): the words that green-light a
   source-deleting `--write` while describing a different gate than CI runs (A1).
2. `rewires N caller(s)` / `rewrites:` / `write: APPLIED to N file(s)` — `scripts/codemod.mjs:190,193,194`:
   the apply confirmation that claimed a rewiring it didn't perform in live test (A2).
3. `gated + reversible` — `scripts/codemod.mjs:195`: implied undo on the one irreversible action (A3).
4. `safe to delete (…)` — `scripts/deadcode.mjs:120`: safety asserted before the caveat (A4), and
   no visible suppress path for false positives (A5).
5. `simulate-edit.mjs:87,90` gate-equivalence wording — already rewritten by COPY.md #2; apply it.
   (The `diff.mjs`/`gate-md.mjs` verdict strings are the house standard — leave them.)

## 4. Voice rules (microcopy conventions for this codebase)

1. **Buttons and toggles are verb + object (+ count)** — `Collapse 3 open domains`, `Save root`,
   `Copy link`. A label that could be `OK`, `save`, or a bare status (`Collapse (3 open)`) isn't done.
2. **A toggle's tooltip states the result of the next click and flips with the state**; the label
   states the current state (`Product only ✓` is right; its frozen `title` is not — A6).
3. **Verdict words carry their scope on the same line.** `PASS/BLOCK/APPLIED/safe` never travel
   alone: say what was checked and what wasn't (`no new cycles; no lost callers — doesn't count
   duplication`). Only the gate's own output uses the word "gate" (COPY.md rule, extended to
   codemod).
4. **Caveats and format hints come before the action** — above the delete list, in the settings
   description, in the visible form (the `/absolute/path/to/project` placeholder + "stored only
   in this browser" note is the pattern); never only after the list or only in the error.
5. **Confirmations name the object, the scope, and the undo where one truly exists** —
   `annotate`'s "suppressed <fp> … Source untouched." is the house standard; "reversible" is
   banned unless a command can actually revert it.
6. **One display name per concept, including built artifacts** — og:descriptions, report.md, and
   `docs/demo/index.html` are UI too; add them (and `editor/`) to the `check-consistency` sweep
   so retired strings (`dup-groups`, "areas") can't outlive their retirement.
7. **Every number badge names its dimension** at least on hover (`confidence: high`), and status
   colors keep one meaning per screen (red ≠ "high confidence" while also meaning "worst count").
