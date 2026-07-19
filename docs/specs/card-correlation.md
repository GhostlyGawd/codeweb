# Spec: card→diff correlation ("advice followed") counter

## Problem
The outcome ledger counts that pre-edit cards were *delivered*, not whether they *mattered*.
The receipt should be able to say: "the card named the callers, and your next edits touched
them" — evidence the ambient context steers real work.

## Behavior (BDD)
- GIVEN the pre-edit hook delivers a card for symbol `S` whose explain card names caller
  files `F1..Fn` (reliance/callers present),
  THEN it records a pending card `{t, symbol, files}` beside the graph (`pending-card.json`).
- WHEN a subsequent post-edit check in the same workspace fires for a file `Fi ∈ files`
  within 30 minutes,
  THEN the ledger counter `cardCallersFollowed` increments and `Fi` is consumed from the
  pending set (each file counts at most once per card).
- WHEN a new card is delivered, it replaces the pending card. WHEN the pending card is older
  than 30 minutes, it is ignored and cleared on next touch.
- Editing the card's own subject file does NOT count (following advice = touching the
  *callers* it warned about).
- Everything is local-only, fail-open, `CODEWEB_NO_STATS=1` disables (same rules as the
  ledger it feeds). The receipt and the brief's activity line surface the counter as
  "card-named callers followed".

## Tests (child-process sequences over a mapped fixture)
- **B1 follow**: pre-edit on hub file (card names callers a.js, b.js) → post-edit event for
  a.js → `cardCallersFollowed = 1`; second post-edit for a.js does NOT double-count; b.js
  still counts (→ 2).
- **B2 subject file doesn't count**: post-edit for the hub file itself → counter unchanged.
- **B3 replacement**: a new pre-edit card replaces the old pending set.
- **B4 opt-out**: `CODEWEB_NO_STATS=1` → no pending file, no counters.

## Done when
Tests pass; receipt (`stats.mjs`) and brief line include the counter; suite + gate green.
