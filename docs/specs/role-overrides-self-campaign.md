# Spec E: role-override config + self-campaign execution

## Problem
Role tagging is heuristic-only. It cannot know that codeweb's `docs/` is a *generated* site
build (19 symbols currently ranked as product), or any repo's equivalent ("this dir is vendored
/ generated / bench") — the vite-playground lesson applies to every repo with a non-obvious
layout. And the dogfood loop has never been closed: codeweb has never actually executed its own
ready merges.

## Behavior (testable contract)
1. **`roles` map in `codeweb.rules.json`** (the file `fitness.mjs` already reads): glob →
   role (`product|test|fixture|example|bench|generated|vendored`). Extraction applies overrides
   AFTER path heuristics (override wins; first matching glob wins, order preserved). Unknown
   role values fail loudly at extract time. Absent file/section → behavior unchanged.
2. **Everything downstream already honors `role`** (findings, deadcode, hotspots, report
   scoping) — no consumer changes; the override just feeds the existing field.
3. **Self config.** codeweb's own `codeweb.rules.json` marks `docs/**` as `generated` (built
   site output). Self-map's product view stops ranking site bundles.
4. **Campaign execution (dogfood).** With roles fixed: fresh self-map → `campaign` → execute
   every product-true READY merge via `codemod --merge ... --write`, gate-checking each step
   (`diff` before→after must pass) and running the full suite after each. Steps the suite or
   gate rejects are reverted and recorded. The executed campaign (steps, gate verdicts, LOC
   delta) is committed as `bench/results/self-campaign.json` — "codeweb consolidated itself"
   becomes a receipt.

## Tests (TDD — tests/role-overrides.test.mjs)
- **R1 override wins:** fixture repo with `src/gen/**` heuristically product + rules mapping it
  `generated` → extracted nodes carry `generated`; findings/deadcode product scope excludes
  them.
- **R2 order + specificity:** two overlapping globs → first match wins, deterministically.
- **R3 fail-loud:** an invalid role value in the config → extract exits 2 naming the entry.
- **R4 absent config unchanged (property):** fragment with no `roles` section is byte-identical
  to a run with no rules file at all.
- **R5 campaign safety (BDD, on a fixture):** given a fixture with one body-identical ready
  merge, when codemod --write applies it, then the gate passes, callers are rewired, and a
  synthetic suite still passes; a fixture whose merge would cycle is refused.

## Done when
Tests pass; suite green; self-map shows docs/** as generated; the self-campaign has run with
every kept step gate-green + suite-green and the receipt committed.
