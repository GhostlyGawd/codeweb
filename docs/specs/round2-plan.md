# Round-2 implementation plan — all 42 findings

Source of truth for findings: `IMPROVEMENTS.md` (round 2, 2026-07-21). This plan partitions the 42 findings into eight workstreams, ordered by a dependency graph, and defines the per-task process. Per-workstream task specs live in `docs/specs/round2-ws-*.md`; verification evidence accumulates in `docs/specs/round2-evidence.md`.

## Dependency graph → build order

```
A (gates/delivery)  ──────────────┐
  #2 #3 #4 #5 #6 #7 #1            │  A first: gates protect every later push; #5 makes
                                  │  `npm test` clean-tree for all later verification;
B (truth: lexing/masking)         │  #6 speeds IE-EQUIVALENCE, which D relies on for
  #8 #9 #12 #13 #14 #15  ◄────────┘  byte-identity proofs.
        │  (B and C both edit extract-symbols.mjs + masking; truth
        ▼   must be settled before caching semantics are tuned)
C (truth: resolution)
  #10 #11 #16
        │──────────► E depends on C (#16 and #24 both edit overlap.mjs)
        ▼
D (engine perf)
  #17 #18a #19 #20 #21     (#18a = baseline sidecar; #18b in-process extract lands with H)
        ▼
E (advisors)
  #22 #23 #24 #26 #27 #28 #41 #42
        ▼
F (MCP & hooks)
  #29 #30 #31 #32 #33 #34 #25    (#33's diff lib-ification builds on #28's diff cleanup)
        ▼
G (report & editor)              (file-disjoint from A–F; sequenced to keep one build
  #35 #36 #37 #38                 at a time on the shared tree)
        ▼
H (deep refactor)
  #40 (+ #18b in-process hook extraction enabled by it)
```

Rationale highlights: A's gates (#2/#4/#5) turn every subsequent workstream's push into a gated one and end the tracked-docs mutation that would otherwise dirty every later verification run. B before C before D: truth bugs change edge sets; perf work (#17 name-delta invalidation) must prove byte-identity against *correct* edges, not ones a later fix rewrites. E after C because two findings share `overlap.mjs`. F after E because #33 serves diff in-process from the lib seam #28 cleans. H last: the L-effort orchestrator decomposition (#40) touches everything B–D stabilized, and #18b consumes it.

## Per-finding process (every workstream)

1. **Spec** (`round2-ws-X.md`): per finding, tasks `T-<finding>.<n>` with: files, approach, explicit success criteria (measurable / byte-comparable where the finding claims it), and test plan — TDD (failing test first) for behavior changes, property tests for equivalence claims (early-exit ≡ full, name-delta ≡ cold, mask idempotence), BDD-style scenario tests (given/when/then names) for MCP/hook flows.
2. **Adversarial spec review**: a separate reviewer hardens the spec in place (missed edge cases, unverifiable criteria, hidden coupling, rollback notes). Spec is frozen only after this pass.
3. **Build**: implement tasks in order; each task lands test-first; commit per finding (or per coherent task group) with `topic(scope): what — finding #n` messages; suite subset green before each commit.
4. **Build review**: reviewer diffs the workstream's commits against spec + criteria; small gaps fixed immediately, larger ones returned to the builder.
5. **Usage verification**: run the affected surface for real (CLI on corpora, MCP stdio client, hook payloads, Playwright for report) and append evidence — exact commands, numbers, commit sha — to `round2-evidence.md`.
6. Push after each workstream; final gate = full suite ×2, `check-consistency`, bench gate, then PR ready + merge.

## Success criteria summary (the bar each workstream must clear)

- **A**: tag/dispatch release path provably runs tests (workflow lint + dry assertions); `check-consistency` fails on a planted package.json drift and passes after 24→27 fix; `npm test` leaves `git status` clean; suite wall ≤ ~55 s with IE-EQUIVALENCE split and unchanged trial semantics at CI depth; docs drift trio corrected.
- **B/C**: every fixture from the truth audit (nested templates, escaped backticks, `${}` strings, spread calls, arrow-IIFE, heredocs, PHP `#`, f-strings, 10 MB line, accessors/overloads, NodeNext specifiers, namespace imports, Signal-B roles) extracts to its documented expected symbols/edges; self-map deadcode "safe" tier has zero false positives (`trend.mjs:metrics` ≥ 1 caller; `PERM_SEEDS` referenced); no regression in the existing recall/precision suites.
- **D**: add-one-function warm extract at 16.8k within ~1.3× of noop floor (vs 2.3× today), byte-identical output proven by IE-EQUIVALENCE at CI depth; hook no-change fire < 1.5 s at the 16k class per the spec threshold; mask outputs byte-identical at ≥1.4× throughput.
- **E**: reading-order @15.7k < 1 s with first-N byte-identical to the pre-fix order; break-cycles dense-SCC case < 1 s with identical verdicts; overlap Signal-B stage ≥ 4× faster with identical candidate pair set; each gains a bench row.
- **F**: EPIPE repro answers instead of crashing; refresh→diff ordering holds under parallel fire; refresh leaves all three sidecars valid (hook timings return to sidecar floor after a refresh); readers overlap (two concurrent advisors ≈ max, not sum); cancellation kills the child.
- **G**: expand-all at 16.8k — no single frame > 250 ms and settled sim ≤ ~50 ms/frame (measured via the stage hook), receipt re-run and committed; report ≥ 40 % smaller with template feature-parity; fitted draw < 100 ms; lens per-file < 40 ms.
- **H**: edge derivation callable in-process with the same outputs as the CLI path on the equivalence corpus; ≥ 20 spawn sites converted or obsoleted; orchestrator no longer exits at import time.

## Constraints

- Never weaken an existing test to make a task pass; determinism (`SOURCE_DATE_EPOCH` byte-identity) is a standing invariant for every artifact writer touched.
- CHANGELOG.md gains entries per finding as they land (so `rollChangelog` can't roll over an empty claim — finding #1's lesson); the #1 closer also amends the round-1 claim.
- Evidence ledger is append-only; every task's entry cites its commit sha.
