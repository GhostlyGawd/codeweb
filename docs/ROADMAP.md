# codeweb — Roadmap

**Refreshed 2026-07-25 against `CHARTER.md` (the ratified contract).** The four-phase
"north-star science program" that previously lived here is retired as the governing plan
(charter C1). Measurement continues as the receipts discipline behind public claims — not as
the roadmap. The archived program, instruments, and results live in `bench/` and git history.

## Now — the identity milestone

Align every claim-bearing surface to the ratified identity — problem, user, and the job line
("Your agents break less code and burn fewer tokens.") — enforce that line in
`check-consistency`, then cut the release. Details and done-checks: `CHARTER.md`.

## Next — deliberately open; picked after Now lands

Candidates on the table, none chosen yet:

- **The measurement batch (P1+P3)** — tool-routing A/B over the tool descriptions, and grading
  the agent fallback path (`docs/proposals/ai-spend-gated.md`). Gated on an operator go-ahead
  only. *(Correction: these do not cost real API money — charter C7.)*
- **The edit-quality benchmark (H22)** — the one unproven claim leg: does codeweb context
  improve agent edit *correctness* on tasks that genuinely need non-local information?
- **C/C++ support** — the most-requested missing language; gated on trusted grammar
  provenance (`scripts/grammars/PROVENANCE.md`).
- **The free-forever / Teams boundary statement** — publish the contract; any build stays
  parked behind the distribution trigger (charter non-goal 5).

## Not now

Teams build · VS Code Marketplace publish · resident daemon · embeddings · paper packaging ·
new languages before their grammars clear provenance.

## Corrections (2026-07-25)

- The efficiency claim: the v0.9.0 budgeted re-run measured **+0.31 caller recall at equal
  context cost**; the earlier "−44% tokens" framing did not reproduce under budget parity
  (charter C6).
- "Phase 4 blast-radius pre-flight does not exist yet" was stale: its product half shipped
  (pre-edit hook, sidecar, impact cards); its A/B science never ran (charter C5).
- The premise that agent benchmarks cost real API money was fabricated (charter C7).
