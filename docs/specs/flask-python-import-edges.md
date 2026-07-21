# Spec Q (CLOSED 2026-07-21): flask render_template import-edge regression

## Resolution — real regression, found and fixed

**Bisect verdict (step 1 of the contract, executed):** rebuilt the pinned flask checkout
(`36e4a82`) with both engines. `c892f50` resolved **14** dependents; v0.9.0 resolved **7** —
a REAL regression, not a stricter truth. The lost sites were the `examples/*` call sites:
the package-boundary rule (added post-c892f50 to kill cross-package NAME collisions) also
refused calls backed by an **explicit** `from flask import render_template`.

**Root causes, each now fixed + pinned by `tests/python-src-layout.test.mjs`:**
- **Q1** — single-segment absolute imports (`from flask import …`) resolved to nothing: the
  ≥2-segment stdlib guard also refused the repo's OWN top-level package. Now resolved rooted-only
  (`<pkg>/__init__.py` or `src/<pkg>/__init__.py` exactly — never by suffix, so `import json`
  still can't grab a nested in-repo json package).
- **Q2** — the public re-export (`from .templating import render_template as render_template` in
  `__init__.py`) was a dead end. `pyReExportResolve` follows the chain (bounded, masked text),
  on BOTH the from-import path and the member-access path (`flask.render_template(...)` via
  `import flask` — the pytest sites).
- **Q3** — an explicit import now binds bare calls across package boundaries (the alias is
  evidence, not a coincidence); the boundary rule still governs UNIMPORTED bare names.
- **Q4** — module-level from-import sites attribute to the importing file's `<module>` node
  (site granularity, matching the truth's `__init__.py:<module>` entries).

**Pre-flight re-run (step 3):** dependents **7 → 48**; truth-site coverage **24/26 literal,
26/26 under id normalization** — the two literal misses are the truth's pre-qualified-id labels
(`dispatch_request` vs our owner-qualified `RenderTemplateView.dispatch_request`; one `index`
vs our line-suffixed nested `index@…` defs, which the truth de-duplicated). Every truth SITE is
found; the extra entries are the same sites at finer granularity. `SCANNER_VERSION` bumped to 12
(cached v11 edges are stale).

---

# Original spec (as opened)

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
