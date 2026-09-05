# codeweb — Roadmap

**Refreshed 2026-09-05 against `CHARTER.md` and the user-authorized product clarity
implementation. Earlier amendments remain recorded in the charter.**

The four-phase "north-star science program" that previously lived here is retired as the
governing plan (charter C1). Measurement continues as the receipts discipline behind public
claims — not as the roadmap. The archived program, instruments, and results live in `bench/`
and git history.

## Now — product clarity and change review

Use **“See what your AI edits affect.”** and **“Structural checks for AI code changes.”**
on current public surfaces. Scope the claims to the evidence and preserve historical results.

- Make setup client-specific, with package commands and separate local and editor checks.
- Show changed symbols, affected callers, findings, and analysis limits in one review.
- Separate finding confidence from action priority and explain small-duplicate tradeoffs.
- Refresh the pinned demo and provide reproducible comparison and pilot protocols.
- Verify the implementation against AC-13 through AC-20 in `SPEC.md` before merge.

Real participant studies and maintainer decisions remain follow-up work. The implementation
does not claim those outcomes or run parked experiments.

## Next — picked 2026-08-17 (operator): productize and launch

The item left deliberately open on 2026-07-25 now has a pick. In scope:

- **The free-forever / Teams boundary statement** — published, not parked: the contract page
  and the Teams price intent ship on the site (charter, *The boundary: free forever / Teams*).
- **Gate-led repositioning** — the deterministic regression gate leads the story; the map is
  the supporting view. The 2026-09-05 amendment updates the headline and scopes its evidence.
- **C/C++ support** — the most-requested missing language, unblocked by amendment A2, which
  ratified official tree-sitter org releases as a second trusted source. The provenance bar
  itself is unchanged (`scripts/grammars/PROVENANCE.md`).
- **The hosted Teams build** — green-lit by amendment A1; it lives in a separate repository so
  the local product keeps taking no accounts, no telemetry, and no license keys.

Still parked, still gated on an explicit operator go (charter non-goal 7):

- **The measurement batch (P1+P3)** — tool-routing A/B over the tool descriptions, and grading
  the agent fallback path (`docs/proposals/ai-spend-gated.md`).
  *(Correction: these do not cost real API money — charter C7.)*
- **The edit-quality benchmark (H22)** — the one unproven claim leg: does codeweb context
  improve agent edit *correctness* on tasks that genuinely need non-local information?

## Not now

VS Code Marketplace publish *(non-goal 6, re-examined and reaffirmed 2026-08-17)* · resident
daemon · embeddings · paper packaging · new languages before their grammars clear provenance.

## Corrections (2026-08-17)

- The Teams build is no longer parked. Amendment A1 struck charter non-goal 5: the
  >2k downloads/wk · >10-external-repos distribution trigger is **superseded, not met**, and
  the hosted build is green-lit on market timing. The trigger's counters stay instrumented as
  evidence, not as a gate.

## Corrections (2026-07-25)

- The efficiency claim: the v0.9.0 budgeted re-run measured **+0.31 caller recall at equal
  context cost**; the earlier "−44% tokens" framing did not reproduce under budget parity
  (charter C6).
- "Phase 4 blast-radius pre-flight does not exist yet" was stale: its product half shipped
  (pre-edit hook, sidecar, impact cards); its A/B science never ran (charter C5).
- The premise that agent benchmarks cost real API money was fabricated (charter C7).
