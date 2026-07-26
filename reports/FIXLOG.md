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

## Session — 2026-07-26 · branch `claude/spring-cleaning-conductor-bkzct1`

Reports consumed: PRUNE.md, SIMPLIFY.md, DEBT.md, HOTSPOTS.md (the Spring Cleaning run, this
directory, same branch — commits ride the run's PR #81). Scope chosen by the operator: **all
four offered bundles** — (1) D1 tool-interface manifest starting with the six QUERY_KIND tools,
(2) D6 C7-fabricated stdout claim + gate the class, (3) the restated-idiom trio (D3a loader,
walk-up, in-process hook fallback), (4) PRUNE's slate + chores. `site/data/benchmarks.json` and
`docs/agent-tools.md` deliberately untouched — operator rulings still pending (PRUNE §3).
Branch note: house rules pin work to the designated session branch, standing in for the brief's
`fix/goal-<date>`.

### Build plan (dependency-ordered, as executed)

F1 PRUNE slate → F2+F3 D3a loader (tests first, then the 5 sites) → F4 one walk-up → F5 hook
fallback in-process → F6 suppressions (skipped, below) → F7 lockfile → F8 D6 claim + stdout
gate → F9 D1 manifest → F10 D1 gate rules. Suite: 870 → 878 pass, 0 fail; `check-consistency`
OK after every commit.

### Fixed — finding · commit · verified by

| finding (report) | commit | verification |
|---|---|---|
| 3 orphaned `docs/assets/` SVGs + dead `stddev` (PRUNE §2 / D9) | `f1b37e2` | site rebuild does not recreate them; full suite |
| One stamped-sidecar loader `loadStamped` (DEBT §5 D3a; SIMPLIFY §4) | `0a91bdb` + `93a3624` | new 6-case unit suite; parity pins (hook-sidecar, brief, find-similar, reach); `graphMtimeMs` 5 restatements → 1 reader |
| One `nearestWorkspace()` for the 4 walk-ups + loadGraph's anchor trick (SIMPLIFY §2.2 / D3b) | `7a44b3c` | full suite; CODEWEB_WS precedence + unsupported.json variants preserved |
| Pre-edit hook fallback in-process — −1 process, −1 multi-MB parse (SIMPLIFY §2.3) | `903b67a` | hook-sidecar P1/P2 byte-parity unchanged; #18b's lazy-import motion |
| `package-lock.json` v0.9.0 fossil (PRUNE §3 / D7) | `43854ea` | `npm ci --dry-run` agrees; metadata-only diff (version, bin map, node floor) |
| C7-fabricated sponsorship claim live in `run.mjs` stdout; no gate on stdout claims (DEBT D6) | `c62deb7` | wording mirrors ratified README/support copy (operator sign-off flagged on the PR); claim strings hoisted to `lib/product-copy.mjs`; cost-premise gate rule + fixture test; revenue suite green |
| Tool-interface manifest — six QUERY_KIND tools declared once, both transports derive (DEBT D1; HOTSPOTS §7 primary preemption) | `8e96b68` | mcp/mcp-budget/mcp-inprocess/query/release-tooling 76/76; `mcpToolCount` unions manifest + server |
| Gate enforces the manifest: no restatement, no phantom tool names in prose, `docs/cli.md` gated (DEBT D1; HOTSPOTS anti-pair 0/13) | `d22bf45` | fixture test (restatement + phantom + clean); aligned real-repo gate stays OK |

### Skipped / narrowed (logged, per the brief)

- **The 29 LANG_DISPATCH deadcode self-suppressions (PRUNE §3 / D8): skipped as scoped.**
  `.codeweb/` is gitignored and `deadcode.mjs` reads `annotations.json` only beside the graph,
  so the suppression memory is workspace-local by design — nothing to commit, and a fresh clone
  (D8's own "prospect runs codeweb on codeweb" scenario) would never see it. Verified on today's
  self-map: still exactly 29, all `LANG_DISPATCH` dynamic dispatch in `lib/ts-engine.mjs`.
  Operator decision attached: keep the ritual local (paste-ready commands below), or make
  deliberate memory durable with a one-line `.gitignore` exception
  (`!.codeweb/annotations.json`) — a repo-policy call, not a code fix.
- **D6 wording** is mirrored from the ratified surfaces, not invented — "sponsoring supports the
  project", "sponsors get seen" — but public-claim wording belongs to the operator
  (`CLAUDE.md`/charter): sign-off requested on PR #81.
- **Docs reality vs the reports:** DEBT/HOTSPOTS assumed per-tool flag tables in `docs/cli.md`;
  the file documents bins/run-flags/env only. Name+count gating (landed) is the docs coupling
  that actually exists; generated per-tool docs would be new surface — logged as follow-up.

### Follow-ups surfaced by the fixes

- D1 long tail: 21 tools still declare interfaces in `mcp-server.mjs` only — convert
  tool-by-tool (find/explain/context next; they carry budgets and fast paths).
- D2 (split `mcp-server.mjs`) stays queued behind the manifest per DEBT §4 — cheaper now that
  the six entries generate and the TOOLS table shrank.
- `annotate.mjs:41` still uses the `join(cwd,'x')` findTarget anchor — the same one-line cleanup
  `loadGraph` got in `7a44b3c`; outside the four sites SIMPLIFY enumerated, so left alone.
- The 29 suppression commands (fingerprints are machine-independent — sha1 of kind + node ids —
  so these run verbatim on any mapped workspace of this tree; regenerate anytime with
  `node scripts/deadcode.mjs <ws>/graph.json --json --all`):

```sh
node scripts/annotate.mjs --suppress cfdbc5f71cf9ab99 --note 'LANG_DISPATCH dynamic dispatch (callSite)'
node scripts/annotate.mjs --suppress bddfac53f441c473 --note 'LANG_DISPATCH dynamic dispatch (callSite@473)'
node scripts/annotate.mjs --suppress 40b65f6d6c154820 --note 'LANG_DISPATCH dynamic dispatch (callSite@509)'
node scripts/annotate.mjs --suppress bfa1f7c54a99d7b3 --note 'LANG_DISPATCH dynamic dispatch (callSite@545)'
node scripts/annotate.mjs --suppress bc28c3d99c64e2b7 --note 'LANG_DISPATCH dynamic dispatch (callSite@585)'
node scripts/annotate.mjs --suppress 6b0f91f01e713666 --note 'LANG_DISPATCH dynamic dispatch (callSite@626)'
node scripts/annotate.mjs --suppress b066a3798c99f5ad --note 'LANG_DISPATCH dynamic dispatch (callSite@664)'
node scripts/annotate.mjs --suppress a95af3f8ae77c081 --note 'LANG_DISPATCH dynamic dispatch (collectOwners)'
node scripts/annotate.mjs --suppress da4762987d411dc9 --note 'LANG_DISPATCH dynamic dispatch (collectOwners@462)'
node scripts/annotate.mjs --suppress 8933ff63e86e749d --note 'LANG_DISPATCH dynamic dispatch (collectOwners@497)'
node scripts/annotate.mjs --suppress 0a7434e27da22258 --note 'LANG_DISPATCH dynamic dispatch (collectOwners@533)'
node scripts/annotate.mjs --suppress 671c36fb7ecb3138 --note 'LANG_DISPATCH dynamic dispatch (collectOwners@573)'
node scripts/annotate.mjs --suppress 7de5651c3e3e4adf --note 'LANG_DISPATCH dynamic dispatch (collectOwners@614)'
node scripts/annotate.mjs --suppress 6a9e4b0469b5bf9a --note 'LANG_DISPATCH dynamic dispatch (collectOwners@652)'
node scripts/annotate.mjs --suppress 47ee22a69a69a6fc --note 'LANG_DISPATCH dynamic dispatch (enclosingOf)'
node scripts/annotate.mjs --suppress af4d6b1b35ccef58 --note 'LANG_DISPATCH dynamic dispatch (enclosingOf@480)'
node scripts/annotate.mjs --suppress 51aaf4a89313904a --note 'LANG_DISPATCH dynamic dispatch (enclosingOf@517)'
node scripts/annotate.mjs --suppress 3f47f19e98e23951 --note 'LANG_DISPATCH dynamic dispatch (enclosingOf@553)'
node scripts/annotate.mjs --suppress efda843a4a3d827e --note 'LANG_DISPATCH dynamic dispatch (enclosingOf@593)'
node scripts/annotate.mjs --suppress 9bae028a30410ad0 --note 'LANG_DISPATCH dynamic dispatch (enclosingOf@633)'
node scripts/annotate.mjs --suppress f4e72efed9e4e071 --note 'LANG_DISPATCH dynamic dispatch (enclosingOf@673)'
node scripts/annotate.mjs --suppress e074d1f0635e7d09 --note 'LANG_DISPATCH dynamic dispatch (entry)'
node scripts/annotate.mjs --suppress d76354dca5745a25 --note 'LANG_DISPATCH dynamic dispatch (entry@526)'
node scripts/annotate.mjs --suppress 272bd8c45f810284 --note 'LANG_DISPATCH dynamic dispatch (entry@563)'
node scripts/annotate.mjs --suppress c71399851f09ea8f --note 'LANG_DISPATCH dynamic dispatch (entry@603)'
node scripts/annotate.mjs --suppress a0ccaae7023c7416 --note 'LANG_DISPATCH dynamic dispatch (entry@644)'
node scripts/annotate.mjs --suppress 1a0632a918197948 --note 'LANG_DISPATCH dynamic dispatch (entry@684)'
node scripts/annotate.mjs --suppress 4f9f323a0b5a7296 --note 'LANG_DISPATCH dynamic dispatch (walkTree)'
node scripts/annotate.mjs --suppress 8a469c8f605ad135 --note 'LANG_DISPATCH dynamic dispatch (walkTree@437)'
```
