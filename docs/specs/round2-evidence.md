# Round-2 evidence ledger

Append-only. One section per workstream; per task: commands, key numbers, commit sha.

## WS-A

Container: Node v22.22.2, 4 cores. All timings `time` wall clock, this container.

### Baseline (before first change)

- `node scripts/check-consistency.mjs` → exit 0, `OK — v0.9.0, 27 tools, all surfaces aligned.`
  over the live package.json "24 MCP tools" drift — the finding #4 bug, confirmed live.
- `time npm test` → **87.4 s** wall (user 3m23.7s); TAP: **589 tests, 584 pass, 0 fail, 5 skipped**, exit 0.
- After that run: `git status --porcelain` → ` M docs/changelog.html` — `npm test` mutates tracked
  docs/ (finding #5 proof); restored with `git restore docs`.
- `npm view @vscode/vsce version` → 3.9.2 (re-verified; matches the spec's pin).

### Finding #2 — d75e3ad

- T-2.1/2.2/2.3 TDD: `tests/workflows.test.mjs` written first; `node --test tests/workflows.test.mjs`
  → RED, 3/3 fail. After release.yml edits → 3/3 pass.
- YAML well-formedness: `python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]"` → clean.
- T-2.3 risk re-verified: `cd editor/vscode-codeweb && npx --yes @vscode/vsce@3.9.2 package
  --no-dependencies --out <scratch>/x.vsix` → exit 0, `Packaged: … (6 files, 5.99 KB)`.
- Pre-existing + out of scope (per spec, noted not fixed): dispatching while tag v$V exists at a
  DIFFERENT commit reuses that tag while artifacts build from the dispatched ref.
- release.yml behavior proof deferred to the next real tag/dispatch (workflow fires only then);
  invariants + YAML parse are the in-PR proof.

### Finding #3 — 2f646d0

- TDD: 5 new workflows invariants + engines assertion in `tests/release-tooling.test.mjs` → RED
  (5 fail + 1 fail), then ci.yml/codeweb-gate.yml/release.yml/package.json edits → all pass
  (workflows 8/8, release-tooling 12/12). YAML parse clean.
- Probe syntax re-verified in-container: `node -e "await import('web-tree-sitter')"` → exit 0 with
  the engine installed (top-level await works in `-e` on Node 22).
- Engine-absent proof (scratch copy, run at final HEAD 3a3aae1, local so CODEWEB_IE_TRIALS
  defaults to 10): `git archive HEAD | tar -x -C $S && cd $S && npm ci --omit=optional` →
  premise probe FAILS as required (`node -e "await import('web-tree-sitter')"` → import error);
  `bash -c 'set -o pipefail; npm test 2>&1 | tee $LOG'` → exit 0, **614 tests, 571 pass, 0 fail,
  43 skipped** (matches the spec's measured 43); awk skip count S=43; T-3.2 ceiling command
  `[ "$S" -le 6 ]` → **exit 1** (the ceiling trips hard on the engine-absent tier); T-3.3 bound
  `[ "$S" -le 60 ]` → exit 0; T-3.3 step-3 grep
  `grep -E "^ok [0-9]+ - graceful fallback" $LOG | grep -v "# SKIP" | grep -q .` → exit 0
  (`ok 176 - graceful fallback: …` ran UN-skipped). Suite genuinely passes engine-absent.
- Windows/node-24 matrix cells + gate banner engine line: provable only on the PR's Actions run
  (spec risk note stands: a pre-existing windows failure would be a new finding, not fixed here).

### Finding #4 — fdf185f (T-4.1 + T-4.2, one commit per the spec's commit rule)

- TDD RED: fixture round-trip extended (description `'engine with 15 MCP tools'` + problem assert)
  → `not ok 9 - checkConsistency catches drift…` (scan not yet implemented).
- Scan + sync sub added → the real-repo tests went RED on the live drift exactly as designed:
  `not ok 4 - the real repo is consistent`, `not ok 5 - check-consistency CLI exits 0`;
  `node scripts/check-consistency.mjs` → exit 1, `x package.json (description): says "24 MCP
  tools" but 27 tools ship`. (Captured from the working tree; never committed RED.)
- T-4.2 24→27 → release-tooling 13/13 pass; `check-consistency` → exit 0.
- Planted-drift CLI proof (temp copy): `git archive HEAD | tar -x -C $S`, plant `27→24` in the
  copy's package.json description → `node $S/scripts/check-consistency.mjs` → **exit 1** naming the
  drift; real repo → **exit 0**.

### Finding #5 — a221c7d

- T-5.1 TDD RED: new test `--out redirects the whole build` → `not ok 1` (flag silently ignored,
  temp dir empty). After build.mjs `--out` (+ parseArgs with usage) → 8/8 site-build tests pass;
  the run leaves `git status --porcelain -- docs` EMPTY.
- T-5.2: workflows invariant RED → ci.yml freshness step → 9/9. Local gate proof pre-T-5.3:
  `node site/build.mjs && git diff --exit-code -- docs` → **exit 1** on today's stale docs (that IS
  the planted drift: committed changelog.html lacked round-1's `### Removed` section).
- T-5.3: rebuilt after the CHANGELOG entry; only drifted sibling was docs/changelog.html
  (+51 stale lines before entries, +60 with them); committed; `git diff --exit-code -- docs` →
  exit 0 at HEAD.
- Plan bar: clean tree → `time npm test` → **90.3 s**, 601 tests, 596 pass, 0 fail, 5 skipped,
  exit 0 → `git status --porcelain` → **empty** (the suite no longer touches tracked files).
- Note: every later commit that touches CHANGELOG.md also rebuilds docs/ in the same commit, so
  the freshness gate holds at every subsequent HEAD, not just the PR tip.

### Finding #6 — 5dcdff9

- T-6.1 TDD: `tests/helpers-async.test.mjs` RED (helper unexported) → `runNodeAsync` in
  helpers.mjs (execFile promise, runNode contract incl. the `{...process.env, ...env}` merge) →
  2/2 pass, incl. the measured overlap assert (two 400 ms children < 750 ms wall).
- T-6.2: plumbing `CODEWEB_IE_TRIALS=2 node --test tests/incremental-edges.test.mjs` → 6/6 pass;
  guard `CODEWEB_IE_TRIALS=abc` → the file fails loudly with `CODEWEB_IE_TRIALS must be a positive
  integer` (never vacuously green).
- Before: `time node --test tests/incremental-edges.test.mjs` (serial 40 hardcoded) → **58.0 s**,
  4/4 pass. After: `time CODEWEB_IE_TRIALS=40 node --test tests/incremental-edges.test.mjs` →
  **15.3 s**, 44 tests (4 top-level + **40 `trial N` subtests, all pass**), 0 fail — better than
  the spec's 18–25 s expectation. IE-COLD-PARITY / IE-INCREMENTALITY / IE-DANGLING untouched.
- **Suite-wall bar (≤ ~55 s): NOT met in this container — reported, not fudged.**
  `time npm test` after all changes → **71.0 s** (local depth 10);
  `time CODEWEB_IE_TRIALS=40 npm test` → **73.6 s** (CI depth) vs **87.4 s** baseline.
  Why: with the 60 s serial floor gone, no single test exceeds 8.0 s (top: budget-gate 8.0 s,
  IE-EQUIVALENCE 6.0 s at depth 10) — the suite is now aggregate-CPU-bound, not schedule-blocked:
  ~210 s total CPU (user+sys) / 4 cores = **52.5 s ideal floor**, i.e. the ~55 s bar required
  near-perfect packing; observed effective parallelism is ~3.0 cores (process-spawn-heavy suite).
  The finding's mechanism (the split) is built exactly as specced and its file-level numbers beat
  spec; the residual is IMPROVEMENTS #6's own "deeper unlock stays #40" (spawn collapse, WS-H).
  No spec-sanctioned lever remained: cap 3 is a jitter knob, and trial depths are fixed by the
  "unchanged CI depth" constraint.

### Finding #7 — fcd15bf

- T-7.1 TDD: new engine-validation test RED (`not ok 6`, unknown engine silently ran) → guard at
  the opts assembly → extract-engine 9 tests: 8 pass, 1 skip (the inverse-fallback skip, engine
  present). Greps: `grep -n -- '--engine read' README.md` → 0 hits;
  `grep -rn -- '--engine read' README.md docs/ .claude/ | grep -v 'docs/specs/'` → 0 hits.
- T-7.2: `grep -c '~400' .claude/skills/release-tag/SKILL.md` → 0.
- T-7.3 scripted verification (run AFTER #4 landed, per the spec's ordering): scratch copy A with
  planted README `"26 MCP tools"` → `node $S/scripts/release.mjs --patch` → **exit 1**, prints
  `consistency: 1 problem(s) — README.md: says "26 MCP tools" but 27 tools ship`, and the
  "Next (gated …)" git commands do NOT print; clean scratch copy B → **exit 0** with the Next
  block. (First attempt archived pre-#7 HEAD and correctly exited 0 — rerun after the commit.)

### Finding #1 — 3a3aae1

- CHANGELOG correction bullet added under [Unreleased] (bfc6b92's "all 32" claim amended;
  29–32 ship as #2/#6/#3/#4); per-finding entries landed with each finding above.
- `grep -c 'round 2, finding #' CHANGELOG.md` → **7** (≥ 7 required; one wrapped suffix re-flowed
  onto a single line to keep the machine check honest, then the closer commit amended).
- The audited "diff CHANGELOG claims against git show" closer NOT built, per spec (a): infeasible
  honestly; the structural closer is (a)+(b)+the #4 gate, all landed and tested.

### Final state

- `time npm test` → 71.0 s, **614 tests, 609 pass, 0 fail, 5 skipped**, exit 0; CI depth
  (`CODEWEB_IE_TRIALS=40`) → 73.6 s, 644 tests, 639 pass, 0 fail, 5 skipped.
- `node scripts/check-consistency.mjs` → exit 0.
- `git status --porcelain` → empty after every run above.
- Mechanical notes for the build reviewer: (1) workflows.test.mjs invariants were added per
  finding (#2's in d75e3ad; T-3.1–3.4's in 2f646d0; T-5.2's in a221c7d) rather than all in the
  first RED file — the spec's "plus T-2.2/T-2.3/T-3.4 invariants" listing was read against the
  no-RED-commits rule; every invariant still ran RED before its YAML edit. (2) site/build.mjs's
  banner now prints the resolved output dir (spec-directed) — the literal `built N page(s)` is
  unchanged. (3) docs/ is rebuilt in every CHANGELOG-touching commit (see #5 note).
