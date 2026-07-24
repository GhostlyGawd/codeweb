# FIXLOG — implemented findings, append-only

## Session — 2026-07-24 · branch `claude/product-review-ux-features-df0f48`

Reports consumed: DOCS.md, COPY.md, API.md, COMPREHENSION.md, ERRORS.md, CLI.md, MICROCOPY.md
(this directory). Scope chosen by the operator: **Everything** — the 14 deduped finding
families presented by the conductor. Branch note: house rules pin all work to the designated
session branch, standing in for the brief's `fix/goal-<date>`.

### Build plan (dependency-ordered, as executed)

F3 site-undefined → F10 reports/ move → F11 naming finish (two commits) → F1 gate unification
→ F2 codemod honesty → F4 parser coach → F6 run.mjs streams+machine mode → F5 CI-gate truth
(two halves) → F8 map-failure message → F12 MCP strictness (three commits) → F7 hook advisory
→ F9 unmapped nudge → F13 docs truth → F14 lens definitions. Suite: 871 → 900 pass, 0 fail,
`check-consistency` OK after every commit.

### Fixed — finding · commit · verified by

| finding (report) | commit | verification |
|---|---|---|
| Three tool cards render "undefined" (COMPREHENSION C1) | `f63fec1` | site-build no-undefined sweep + desc guard test; live rebuild |
| Repo root's first screenful is growth reports (COMPREHENSION C2) | `cf68b72` | 19 reports moved to `reports/`; full suite |
| domain/areas + JUDGE naming splits (COPY #5, MICROCOPY C1/C2/C4) | `907e5e6` | full suite; demo masthead drops the disowned count |
| deadcode "safe to delete" + no suppress door (MICROCOPY A4/A5) | `a84711a` | DC-COPY pin |
| The gate is three contracts wearing one name (API F1/§5, DOCS D2, COPY #2) | `5c81f8b` | gate-verdict property tests (preflight==structuralRegressions; gate==diff verdict; divergence case declared both sides) |
| codemod borrowed verdict / phantom rewires / phantom undo (MICROCOPY A1/A2/A3) | `379f8a6` | CM-COPY pin |
| Parser coaches: did-you-mean, `--flag=value`, bin name, no-map append (CLI §6, ERRORS R1) | `d946ac2` | three coach pins + live probes |
| CI gate false verdicts on setup failures; bins exit 2 (ERRORS #3, API F2) | `ab3f29b` | action.yml pins (code captured; 1 vs 2 messages) |
| codeweb_map failure beheading (ERRORS #2/R2) | `d50cdbc` | I5b pin (escapes present, no flag leak) |
| Pre-edit hook auto-approve (API F10) | `5a01ae7` | envelope pin (no permissionDecision) |
| Silent hooks on unmapped repos (COMPREHENSION #3) | `2c502fd` | once-per-workspace nudge pins |
| run.mjs streams inverted, no machine mode (CLI 5.1/6.1) | `2254543` | FR7-9 stdout-contract + `--json` pins |
| run.mjs exit-code split + validate-before-create (API F2, CLI 7.2) | `34183b5` | E7 pin |
| Docs truth: D1 corpus lie, stale counts, prose-sweep gaps, marketplace 1.0.0, plugin poetry, new docs/cli.md + CONTRIBUTING.md (DOCS fix-now/gaps) | `5c5d417` | PROSE_FILES extension + consistency gate |
| MCP rejects unknown args / real booleans / context bodies split (API F4/F5) | `1affe2e` | validation pins |
| One pagination dialect, offset everywhere, true totals (API F3, CLI 5.2) | `67e0f9f` | pagination pins (offset:50 ≠ page 0; find_similar true count) |
| Transport-true remedies; refresh/fitness/placement/codemod/annotate join loadGraph (API F6/F7) | `dd2ddbd` | no-CLI-leak + annotate no-orphan-dir pins |
| "blast" defined at lens/settings/optimize; palette command guarded (COPY #3, MICROCOPY B1/A8) | `7ecad5b` | lens tests |

### Skipped / narrowed (logged, per the brief)

- **Demo regeneration** (MICROCOPY C2's full fix): rebuilding `docs/demo/index.html` needs the
  axios corpus, which this environment cannot clone (repo-scoped git access). The masthead was
  surgically corrected instead; regenerate the demo from a machine with the corpus at the next
  release.
- **codemod import-adding engine**: A2's honest-copy fix shipped; making `--write` insert
  imports at rewired call sites is an engine feature the report explicitly did not prescribe.
- **deadcode/context per-tier `offset` params**: `nextOffset` shipped wherever `remaining` is
  emitted; a single offset paging two tiers in lockstep would over-skip the shorter tier
  (the report's anticipated fallback).

### Follow-ups surfaced by the fixes

- `trend --json` still pretty-prints multi-line (API F11's NDJSON holdout — small).
- graph.json schema versioning (API F8) — design decision, not a drop-in fix.
- `context {full:true}` no longer implies whole bodies (`bodies:"full"` does) — flag in the
  next release notes as a behavior change, with find_similar's `count` correction.
