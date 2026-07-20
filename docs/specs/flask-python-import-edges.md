# Spec Q (open): flask render_template import-edge regression

## Discovered by
The Spec M budgeted pilot re-run (2026-07-20). The pre-flight recorded
`flask-render_template: dependents 7 vs truth 26 (delta -19)`, and flask was the only per-task
LOSS in the run (recall paired delta −0.03). The frozen truth for this target is 26 real
caller sites; the current engine's graph resolves 7.

## Symptom
`node scripts/query.mjs .codeweb/pilot/flask/graph.json --dependents src/flask/templating.py:render_template --json`
returns 7 where 26 are real. The missing ~19 are dominated by:
- module-level `from flask import render_template` import sites across examples/ and tests/
  (the truth notes for this target say "codeweb emits ZERO import-kind edges here");
- the public re-export `from .templating import render_template as render_template` in
  `src/flask/__init__.py`;
- in-file pytest call sites in indexed test files whose `render_template(...)` calls were not
  attributed.

This is NOT pure coverage (the files ARE indexed) — it is Python import-edge + call attribution.
The reps8-era engine (`c892f50`) reportedly resolved more of these (run-4 flask recall 0.95), so
this is a regression somewhere between that engine and v0.9.0, OR a truth set that is stricter
than the run-4 oracle. Both are in scope to disambiguate.

## Investigation contract (do this before any fix)
1. Bisect: rebuild the flask pilot graph at `c892f50` and at v0.9.0; diff `--dependents` counts.
   If c892f50 also returns ~7, the "regression" is really the frozen truth being stricter than
   the run-4 oracle (an honest re-label, not a code fix). If c892f50 returns ~20+, a real
   extractor change dropped Python import edges — git-bisect the extractor.
2. Whichever it is, record the finding in this spec. A measured "the truth is stricter, not a
   regression" is a valid, closing outcome — same discipline as the shards deletion.

## If it is a real regression — fix contract (TDD)
- A fixture reproducing `from flask import render_template` at module scope + a call inside a
  view function, asserting BOTH the import-kind edge and the call-kind edge resolve to
  `templating.py:render_template`. Red first.
- The fix stays inside the Python import-resolution path in `extract-symbols.mjs`; precision
  contract holds (a same-named different symbol must NOT wire).
- Re-run the pre-flight: flask dependents move toward 26; re-run 5 budgeted reps → flask ΔR
  turns non-negative. Update `efficiency-pilot.reps5-v090.json`'s per-task note.

## Done when
The bisect verdict is recorded; if a regression, the fixture is green, the pre-flight count
climbs, and the pilot's flask loss is closed or explained.
