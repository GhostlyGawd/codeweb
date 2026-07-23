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

### CI red→green — skip-ceiling recalibration (post-push fix)

- Cause: T-3.2's ceiling 6 was calibrated from the LOCAL census (5); the runner census is 7.
  Run 29871314381 @1692629, job `test (ubuntu-latest, 22)` (88771829501): 644 tests, 637 pass,
  0 fail, **7 skipped → `##[error]7 skips (ceiling 6)`**, exit 1.
- The named 7 (from that job's TAP): 3x golden target (`ok 230/231/232 … # SKIP golden target not
  on disk: D:/…`), 1x `bench: compiler-graded mode on a TS fixture # SKIP typescript not
  resolvable`, 1x `graceful fallback … # SKIP engine available`, and the two CI-only skips:
  **`ok 481 - L1: harness emits the full measurement schema on a fixture report # SKIP playwright
  not resolvable`** and **`ok 482 - L2: a non-report input fails loudly … # SKIP playwright not
  resolvable`** (tests/report-scale-bench.test.mjs — playwright resolves in the dev container,
  not on runners).
- Decision per CI-only skip: NOT installed in the workflow — the guard's own header says
  "Skipped when playwright is not resolvable (CI stays zero-dep; the bench is a dev-side tool)";
  playwright is in no manifest/lockfile, needs a ~minutes browser download per leg, and real
  Playwright verification is WS-G's usage evidence. Both added to the named census instead.
  New ceiling: 7 census + 1 headroom = **8**, enumerated by name in the ci.yml comment.
- Per-leg reasoning (no per-leg ceilings): zero `process.platform`-conditional guards in tests/
  (grep: 0), git present on all runners (git-guarded tests run), engine installs on all legs
  (windows AST probe passed before fail-fast cancellation), D:/ golden fixture absent on the
  windows runner too, typescript/playwright absent everywhere → census 7 on every leg. Confirmed
  empirically where logs exist: ubuntu-22 TAP `# skipped 7`; ubuntu-24 `ℹ skipped 7`.
- Second bug found while verifying: **the ubuntu-24 "pass" was vacuous** — node 24's runner emits
  the spec-style summary (`ℹ skipped 7`), not TAP's `# skipped`, so awk parsed S=0 (ceiling-open,
  the drift mode the spec had deemed acceptable-for-the-future — it was live today). Both awks
  (ceiling + no-ast bound) now match `/^(#|ℹ) skipped/`; workflows.test.mjs invariant tightened to
  pin the dual-format pattern (RED→GREEN). Verified: awk on the local TAP log → 5, on a node-24
  style summary → 7, on TAP `# skipped 7` → 7.
- Other jobs on the red run 29871314381: bench ✓, consistency ✓ (incl. "Committed site is fresh"),
  test-no-ast ✓ (**644 tests, 599 pass, 0 fail, 45 skipped** on the runner = 7 census + 38
  engine-guarded; premise probe, fallback grep, bound 60 all passed), test (ubuntu-latest, 24) ✓
  (vacuously, see above), test (windows-latest, 22) **cancelled** by matrix fail-fast at the
  ubuntu-22 failure — its first verdict comes from the rerun.
- CHANGELOG #3 entry amended (ceiling 8 + census + dual-format note); test-no-ast comment updated
  to the runner-measured 45.

### CI red→green 2 — the windows leg's 8 genuine failures (the matrix doing its job)

- Run 29871812634 @49c218d: the ubuntu-22 recalibration held (ubuntu-22 ✓, ubuntu-24 ✓ — now
  genuinely, via the `ℹ` parse — bench ✓, consistency ✓, test-no-ast ✓); `test (windows-latest,
  22)` failed with **644 tests, 629 pass, 8 fail, 7 skipped** — real failures, not ceiling. There
  is no windows/node-24 leg to check: the matrix excludes it by spec design (T-3.1).
- The named 8 (job 88771829501→88773434629 log) and classification:
  1. `B1+B4: sections present, session valid, mirror byte-identical, corpus skip explicit` —
     child bench crashed: `ERR_UNSUPPORTED_ESM_URL_SCHEME` at bench/all.mjs:153 (`await
     import(<abs path>)`; on windows `D:\...` is not a valid ESM specifier). **Class (b)** small
     product fix: import via `pathToFileURL(...).href` (the pattern report-scale.mjs:74 already
     uses). bench/ is not a WS-B..H-owned surface.
  2. `B2: a lowered budget fails the gate by name` — same root cause, same fix.
  3. `cold run: ONE batched ctags process (-L -) serves every file` — the logging ctags fake is a
     shebang node script: unspawnable on windows (CreateProcess runs .exe/.com only; Node's
     CVE-2024-27980 hardening EINVALs .cmd/.bat without a shell, and the extractor's execFileSync
     rightly uses no shell). The extractor silently fell back to regex → zero invocations.
     **Class (c)** named platform skip — the FAKE is unix-only, not the feature (a real ctags.exe
     on PATH spawns fine); counted in the windows census.
  4. `warm run with one changed file: one PER-FILE spawn` — same shim, same class (c). The middle
     sibling (`untouched warm run: zero ctags processes`) was PASSING VACUOUSLY on windows
     (0 == 0 with ctags never engaged) — skipped with the same named guard for honesty; windows
     census = 7 shared + 3 ctags-shim = 10, per-leg ceiling 11 via `matrix.include.skip_ceiling`
     (`CEIL="${{ matrix.skip_ceiling || 8 }}"`).
  5. `IR1: re-export chain — renamed barrel export resolves…` — **class (a)** test bug: the
     in-process fake universe used POSIX `'/r'` literals; import-resolve's resolveImport runs
     node:path `resolve()`, which on windows re-anchors `/r/...` to the current drive
     (`D:\r\...`), so the test's `rel()` no longer matched and every lookup left the universe.
     Product path semantics are fine (real runs feed real platform paths). Fix: platform-honest
     root `resolve('/r')` + `join()`-built abs paths + backslash-normalizing `rel()`; rel ids and
     every assertion unchanged.
  6. `IR2: bindFileImports — named import through the barrel binds…` — same universe, same
     class (a) fix.
  7. `P2: npm pack ships engine + plugin surfaces…` — **class (a)**: `spawnSync('npm', …)` is
     ENOENT on windows (npm is `npm.cmd`) → status null. Fix: `npm.cmd` + `shell: true` on win32
     only; assertions unchanged.
  8. `K3: stagesReused honesty is pinned at the parser level` — **class (a)**: the test itself
     `await import(<abs path>)`ed scale.mjs. Fix: `pathToFileURL`. Rider: report-scale-bench's
     guard had the identical import bug swallowed by its catch (windows would report "playwright
     not resolvable" for the wrong reason) — fixed the same way; CI census unaffected.
- Nothing tripped the WS-B..H stop-tripwire: the two product-file failures live in bench/all.mjs;
  extract-symbols/masking/lang-rules/import-resolve/overlap/mcp-server/report/editor are
  untouched (IR1/IR2 were test-fixture bugs, not import-resolve bugs).
- Commits: class (a) test-portability 5b22064; class (b) bench fix b6c3b4e; class (c) skips +
  per-leg ceiling + this entry (see final sha in git log).

### WS-A review+verification

Reviewer container: Node v22.22.2, 4 cores, idle (load avg 0.65 before the timed run). Reviewed
head cd3c8ca; every commit d75e3ad→cd3c8ca diffed against the frozen spec. CI at cd3c8ca: all 7
jobs green.

Verdicts per finding (spec tasks vs what landed, plus fresh usage evidence):

- **#2 — PASS.** T-2.1/2.2/2.3 exact to spec: release.yml `test` job (npm ci → npm test →
  check-consistency), `needs: test` on publish, dispatch ancestor guard between version-verify and
  tag-create with `fetch-depth: 0`, vsce pinned 3.9.2 at both call sites with the pin comment.
  Fresh: `node --test tests/workflows.test.mjs` → 9/9 pass solo; release.yml re-read at HEAD.
  Behavior proof stays deferred to the next tag/dispatch, as the spec directs.
- **#3 — PASS** (incl. all four followups). Matrix/probe/ceilings/test-no-ast/gate-deps as
  specced. The two red→green cycles were adversarially re-checked: the 6→8 recalibration is a
  census correction, not a weakening (the guard FIRED — proof it works — and every skip is named);
  the dual-format awk fix TIGHTENED a live vacuous pass (node-24 leg was ceiling-open at S=0).
  Windows followups are honest: all 5 class-(a) fixes preserve every assertion byte-for-byte
  (IR1/IR2 platform-honest paths, rel ids unchanged; P2 npm.cmd win32-only; K3/report-scale
  `pathToFileURL`); the bench `file://` fix is correct Node ESM semantics on every platform (POSIX
  accepts both forms, windows requires the URL — `D:` parses as a scheme); the 3 ctags-shim skips
  are genuinely environment-bound (shebang fake unspawnable via the extractor's no-shell
  execFileSync on windows — the product's real-ctags path is NOT skipped) and honestly include the
  vacuously-passing middle sibling. Windows ceiling 11 = enumerated 7 shared + 3 shim + 1 headroom
  — census and ceiling agree.
  **Matrix question (windows×24): deliberate, not a silent hole** — the exclusion is written into
  the frozen spec (T-3.1's explicit `exclude`, "3 jobs"), commented in ci.yml ("one Node line is
  enough there" — the windows cell's value is path semantics), and restated in the red→green 2
  entry. No change made.
- **#4 — PASS.** Scan (description-only, `|| ''`), sync sub, live 24→27, round-trip + live-string
  tests — all per spec, one commit per the commit rule. Fresh: real repo
  `node scripts/check-consistency.mjs` → exit 0 `OK — v0.9.0, 27 tools`; `git archive` copy with
  planted `27→24` → **exit 1**, actionable: `x package.json (description): says "24 MCP tools" but
  27 tools ship` + the version-sync fix hint.
- **#5 — PASS.** `--out` via shared parseArgs (usage string present), all 8 site-build tests
  retargeted to a tmpDir with zero assertions weakened (invariants identical, only the output dir
  moved; tracked-docs coverage moved to the CI freshness gate exactly as specced). Fresh: full
  `npm test` → `git status --porcelain` → **empty**; fresh `node site/build.mjs --out <tmp>` →
  all five pages **byte-identical** to committed docs/ (cmp), changelog.html included.
- **#6 — PASS; deviation adjudicated: accept, and the bar is in fact met on an idle container.**
  Mechanism exact to spec (asserts byte-identical, ops/messages unchanged, 40 trials at CI depth,
  per-trial seeds, guard throws on garbage — re-verified: `CODEWEB_IE_TRIALS=abc` → loud fail).
  Fresh timings, idle 4-core container: `time npm test` → **55.8 s** wall (614 tests, 609 pass,
  0 fail, 5 skipped) — the plan's ~55 s bar, met; CI depth `CODEWEB_IE_TRIALS=40` → **60.8 s**
  (644/639/0/5); solo `CODEWEB_IE_TRIALS=40 node --test tests/incremental-edges.test.mjs` →
  **12.3 s**, 44/44. The build-time 71.0/73.6 s were measured on a loaded container (the ledger's
  own CPU math — 162 s user+sys at depth 10 → 40.6 s ideal floor, ~2.9 effective cores — is
  reproduced here and explains both numbers). Slowest files now (one TAP run, per-file sums):
  bench-all 9.9 s, simulate-edit 9.5 s, incremental-edges 6.2 s @depth 10, overlap-lsh 5.3 s,
  mcp 5.2 s — no single-file floor remains; further splits would shave seconds at most and the
  residual is spawn overhead, i.e. IMPROVEMENTS #6's own "deeper unlock stays #40" (WS-H). The
  CHANGELOG's "full suite ~93 s → ~55 s class" is empirically supported by the fresh measurement;
  no amendment needed. Plan bar note amended here (ledger), plan untouched.
- **#7 — PASS with one ledger correction.** Guard/README/SKILL/release-exit all landed per spec.
  Fresh: `extract-symbols.mjs … --engine read` → **exit 2**, `[extract] unknown --engine "read"
  (valid: regex, tree-sitter)`; `run.mjs --engine read` → **exit 2** `unknown flag: --engine` +
  usage (run.mjs never had the flag; the #24 policy rejects it). Correction: the #7 entry's second
  grep claim ("`grep -rn -- '--engine read' README.md docs/ .claude/ | grep -v 'docs/specs/'` →
  0 hits") is wrong at fcd15bf and at HEAD — it hits docs/changelog.html once, the CHANGELOG
  mirror QUOTING the removal ("README's nonexistent `--engine read` mode is gone"), same
  descriptive-mention class as the spec's own docs/specs/ carve-out; README itself is clean
  (`grep -n -- '--engine read' README.md` → 0). Note: README:200's `--engine hybrid|read|tools`
  is the `/codeweb` slash-command surface where `read` is a real value (commands/codeweb.md:21) —
  not drift. No file change needed; the record is corrected by this entry.
- **#1 — PASS.** Correction bullet verified truthful: bfc6b92 is titled "all 32 findings" and
  touches **zero** `.github/workflows` files (`git show --name-only` → 0 matches), so 29–32
  (workflow gates + test split) demonstrably did not land there. 7 per-finding entries present
  (`grep -c 'round 2, finding #'` → 7); the structural closer is exactly the spec's (a)+(b)+#4
  gate; the infeasible diff-closer correctly not built.

No assertion was weakened anywhere in the workstream (all 12 touched test files diffed
before/after); CHANGELOG entries present for every finding and accurate against fresh evidence.
Nothing structural found; the one recorded inaccuracy (#7 grep) is corrected above.

## WS-B

Builder evidence — truth: lexing/masking (#15, #8, #9, #12, #13, #14), spec
`docs/specs/round2-ws-b.md` (hardened; authoritative). Base 6f7d96b. Strict TDD: every finding's
fixtures were run RED first (failure reasons recorded below), then the fix, then green. Full suite
once at the end: `time npm test` → **55.7 s wall, 656 tests, 651 pass, 0 fail, 5 skipped** (the 5
are the pre-existing environment skips — golden-target ×3, TS_MODULE bench, extract-engine inverse
fallback; WS-B's 7 new test files add ZERO skips on this container), `git status --porcelain`
empty after.

- **T-0 — `566e375`.** `SCANNER_VERSION` 13 → 14 (`extract-symbols.mjs`), v14 comment names the
  six findings. Interlock honored: B takes 13→14; C/D renumber to 14→15 / 15→16 (orchestrator).
  `node --test tests/incremental-edges.test.mjs tests/cache-unification.test.mjs` → pass (mixed-
  version cache byte-identity risk retired before any behavior change landed).
- **#15 — `292580e`.** Pre-fix repro (scratch): `extract-symbols.mjs` on
  `src/generated/data.js` = 9,000,000-char string INSIDE `payload()`'s body → **exit 1,
  `RangeError: Maximum call stack size exceeded`, in BOTH default and `CODEWEB_ENGINE=regex`**
  (spec's claim reproduced verbatim). New `tests/huge-line-crash.test.mjs` red pre-fix: HL-CX +
  HL-RB (in-process RangeError), HL-SHIPPED (unrolled regexes absent), HL-BELT (no belt), HL-E2E ×2
  (exit 1 both tiers); HL-RB-ESC (escape-heavy 2M shape) and HL-EQ (old-vs-new inlined equivalence,
  5,000 seeded strings incl. `\n` — pins each site's escape atom) were green by construction and
  guard the new form. Post-fix: 8/8 green; `complexity.test.mjs` + `maskjs-regex-literals` +
  `ts-engine` + `type3-clones` zero diffs. Belt is kept exercised post-fix via the spec's mock-throw
  option (String object with throwing replace/split → exactly 1/0).
- **#8 — `ea2d18f`.** New `tests/maskjs-nested-templates.test.mjs` red pre-fix in BOTH tiers:
  n1 fabricated `docs → fabricateMe`, n2 lost `later → helper` (state inversion), n3 lost
  `afterEsc → helper` (no `\` handling), n4 fabricated `host → phantom` (verbatim `${'…'}`); n5 is
  the design pin (green both sides: middle-frame liveness + string→regex→backtick-push order).
  Shared property suite `tests/masking-properties.test.mjs` (corpus = spec fixtures + all tracked
  scripts/lib/*.mjs, 10 fixtures + 33 lib files): P2 maskJs idempotence red pre-fix (first failure:
  n1.mjs), P1 lengths + maskPy/maskRuby legs green throughout, value-then-division counterexample
  documented in-header. Post-fix all green; JM-*, maskjs-regex-literals (untouched), extract-engine,
  extract-v7, type3, codemod, IE suites zero diffs. Mechanical adjustment (noted in test header):
  the huge-line corpus member participates at 1M chars (mask-semantics properties are
  size-independent; the 9M crash class is covered at full size in huge-line-crash.test.mjs).
- **#9 — `85b1835`.** New `tests/spread-iife-selfmap.test.mjs` red pre-fix: SP-1 no
  `report → metrics` edge (member-branch dead end), SP-2 `PERM_SEEDS`/`g` yielded function symbols,
  SP-3 real-text self-map had 0 metrics callers + a PERM_SEEDS node. **Deviation (mechanical):**
  the spec's lookahead placement `=\s*(?!\(\()` is defeated by `\s*` backtracking (verified: still
  matched); landed as `=(?!\s*\(\()\s*` — same rejection class, anchored at `=`; residuals match
  the spec's documented set. **Dogfood proof (fresh self-map via run.mjs at this sha):**
  `trend.mjs:metrics` call-callers = **2** (`gitSnapshots`, `<module>` — the :109/:141 spread
  sites), `PERM_SEEDS` nodes = **0**, `deadcode selfmap/graph.json` → **safe tier EMPTY (0 safe,
  8 review)** — the review 8 are entrypoint/closure-guarded, not the finding's class.
- **#12 — `bdb778e`.** New `tests/accessor-overload-truth.test.mjs` red pre-fix: no
  `w.ts:Widget.value@5` in either tier (AST dropped the setter at the methodIds dedupe; regex saw
  only the setter and missed getter/compute/render), fabricated `Widget → Widget.value/…` phantom
  callers from decl/stub lines, probe table red on `static *gen2()` + `render(props = {})`.
  Post-fix: both tiers emit **identical id sets** (`Widget.value` bare = getter, `Widget.value@5`
  = setter; A/B assert), setter's `normalize` attributes to `@5`, zero `class → own member` edges.
  **Deviation (adjudicate):** the spec's stub-line guard applied unconditionally matches **112
  real statement lines in this repo** (`finish(code);`, `claim(pj.main, manifest, d);` — measured
  with the spec's own regex over git-tracked sources); suppressing callRe there would drop real
  edges (e.g. cli.mjs:finish's only callers) — violating the plan's "no recall regression" bar.
  Landed class-gated: the guard fires only when `enclosing(line).kind === 'class'` (class bodies
  cannot contain call statements; stubs live exactly there). Same mechanism, one regex test per
  line, kills the fixture's fabrications; nothing real suppressed. Self-map spot check at this
  sha: `class → own member` edges = **0**; `@line` ids = 5, all legitimate same-name collisions in
  test/bench files. Suites: ts-engine, extract-engine (incl. dispatch-count :125), extract-v7,
  type3, IE, id-collision, all language suites — zero diffs (no exact-set assertion tripped).
- **#13 — `5febde3`.** New `tests/ruby-heredoc-php-hash.test.mjs` red pre-fix: `phantom_method`
  node existed + `db.rb:<module> → db.rb:helper` fabricated (raw-text Ruby scan; heredoc body
  live); x.php had 2 call edges to helper (module fabrication from the `#` line). Post-fix green:
  no phantom node, exactly one `real → helper` edge per language; `real_caller → helper` survives.
  maskRuby heredoc state machine per spec (FIFO queue; opener token → literal `''`; body/terminator
  → length-0 lines; `~`/`-` trimmed-equality vs column-0 terminators; `a << b`/`<<=` never match);
  `.rb` scan routed through `masked('rb')`; maskJs `{hashComment}` php-gated at maskAligned +
  maskedOnce. lang-ruby-php-kotlin-swift + lang-dispatch-ruby-php green unchanged (grep-verified
  fixture independence held); masking-properties (incl. heredoc idempotence) green; noMask comment
  updated to "non-masked languages" per spec.
- **#14 — `91668e5`.** New `tests/python-fstring-edges.test.mjs` red pre-fix: `report → compute`,
  `multi → compute`, `prefixed → compute` all missing (f-strings blanket-blanked); decoy/decoy2
  no-edge pins green pre- AND post-fix (the value()-routing decision holds). Post-fix 5/5;
  python-docstring-mask + python-imports + python-src-layout green; masking-properties maskPy
  idempotence + length stayed green through the landing (the spec's mandated property).
  **Differential check:** keepValues output byte-identical to pre-fix maskPy on the fixture and on
  plain-string/comment shapes (old masker from git HEAD~1 imported side-by-side). Interpretation
  note: the spec's parenthetical "(delimiters kept…)" for expr-interior quoted runs is implemented
  as the whole-slice keepValues gate (delimiters blank in default mode, same shape as maskJs :157)
  — the reading the spec itself mandates via the idempotence property (kept-in-default quotes
  re-mask as normal strings and go red).

Suite discipline: relevant subsets per finding (recorded above), ONE full run at the end
(55.7 s / 656 / 651 / 0 / 5), tree clean. No existing assertion weakened or changed — the risk
note's "may legitimately change" set was not needed (all exact-set assertions stayed green as the
spec predicted for these fixtures). Windows-portability: all new tests use helpers'
join/tmpDir/writeTree, no dynamic imports of local files except via file:// URL (kv-check lives in
scratch, not the repo), no CRLF assumptions (property test compares against split(/\r?\n/) lines
per spec).

### WS-B review+verification

Reviewer: adversarial build review + usage verification over 566e375, 292580e, ea2d18f, 85b1835,
bdb778e, 5febde3, 91668e5, a27ea03 (spec `docs/specs/round2-ws-b.md`, frozen). Container: same
class as builder's (tree-sitter engine present — all AST legs ran un-skipped). Review commits:
**2ca9ad1** (docs rebuild), **d641c44** (module-stub pin + residual notes), this entry.

- **T-0 — PASS, gate proven both directions.** Planted a v13 `.scan-cache.json` with poisoned
  cached syms+nodes -> warm run discarded it (correct output, cache rewritten v14). Control:
  same poison at v14 -> `POISONED_ALPHA` REPLAYED (stamp tier serves cached `nodes`), proving the
  probe sensitive and the `version === SCANNER_VERSION` check at :282 the discriminator.
- **#15 — PASS.** Escape atoms per site verified in the diffs (`\\.` complexity trio; `\\[^]`
  RB_DQ/RB_SQ + stmtHash trio); HL suite 8/8 incl. 9M in-process repros, escape-heavy 2M shape,
  5,000-case seeded equivalence, shipped-source tripwire, mock-throw belt (exactly 1/0), E2E both
  tiers. Belt is try/catch on whole bodies -> covers all call sites as specced.
- **#8 — PASS.** Frame-stack diff matches spec (emission rule, check order string->regex->
  backtick-push, `\` as 2-char text, cross-line invariant comment). n1–n5 through the real
  extractor BOTH tiers: call-edge sets EXACTLY ground truth (5 edges: realUser->fabricateMe,
  later->helper, afterEsc->helper, outer->inner, tick->inner; zero extras, zero ref noise), n2
  `fmt.loc` = 3 exactly as hand-traced. Property suite green (P2 idempotence corpus-scoped,
  counterexample documented in-header as specced).
- **#9 — PASS; deviation RATIFIED with proof.** Probe table over spec-vs-landed lookahead
  placement: spec's `=\s*(?!\(\()` wrong on **7/16** cases (including its own primary target
  `const PERM_SEEDS = (() => {` — `\s*` backtracking defeats it); landed `=(?!\s*\(\()\s*`
  correct **16/16**, incl. the brief's `= ((a)=>a)`, `=((x)=>x)()`, tab/space variants, and both
  documented residuals (`= ( (` and async-IIFE still match). Spread guard verified (`a?.b(`,
  `...obj.fn(` non-cases hold).
- **#12 — PASS; class-gate narrowing verified BOTH directions; one residual documented.**
  (1) b1/w.ts re-run fresh, both tiers: identical id sets (`Widget.value` + `Widget.value@5`),
  exactly 3 ground-truth edges, zero `Widget -> member` phantoms, setter's normalize at `@5`.
  (2) Module-level TS overload stubs (`export function f(x: number): string;` + impl): **no
  fabrication in either tier** — stub lines match the function rule in both tiers (functions are
  regex-owned even under tree-sitter), so each stub is a declaration start covered by declStarts,
  ids dedupe to `f`/`f@2`/`f@3`, `caller -> f@3`, `f@3 -> g`, zero `<module>` edges. No guard
  extension needed; pinned as new over.ts legs in tests/accessor-overload-truth.test.mjs
  (d641c44). Corrections: builder's "112 statement lines" is an UNDER-count — the spec's
  unconditional regex hits **675** tracked js/ts lines (382 non-keyword-led; 74 in scripts/
  alone), a fortiori justifying the narrowing. One real residual found: a bare call statement in
  an ES2022 `static {}` block is stub-shaped with class enclosing -> its class-attributed edge is
  suppressed (verified vs pre-#12 worktree: `A -> register` existed, now gone). Accepted + now
  documented at STUB_LINE_RE: rare construct, and the pre-fix edge mis-attributed the call to the
  class node. `finish(code);`-class statement lines verified surviving in the fresh self-map
  (`query.mjs:<module> -> lib/cli.mjs:finish [call]` present).
- **#13 — PASS.** Heredoc state machine per spec (FIFO, front-tag terminator rules, opener token
  -> `''`, `a << b`/`<<=` immune); fixture green; empirical limit check matches the docs:
  quoted-tag `<<~"SQL"` opener eaten by RB_DQ (body stays live — documented), backtick-tag still
  opens (body masked). The limit is documented where users look: maskRuby header AND the
  CHANGELOG #13 entry, which now reaches docs/changelog.html via 2ca9ad1.
- **#14 — PASS; interpretation verified correct.** The whole-slice keepValues gate is the only
  reading consistent with the spec's mandated idempotence property (kept-in-default delimiters
  re-mask as normal strings). 8 adversarial in-process cases (nested/escaped/same-quote-3.12
  quotes in exprs, format specs, dicts, `{{code}}`, unterminated expr): all idempotent +
  column-preserving, expr CODE live, expr-string CONTENT blanked. E2E nested-quote fixture:
  `wrap -> fmt` exists, `wrap -> decoy` absent. **keepValues differential vs pre-#14 masker
  (worktree at 5febde3): 7/7 byte-identical** incl. the spec fixture.
- **Never-weaken audit — CLEAN.** Across 6f7d96b..a27ea03 the only existing-test change is the
  `noMask` error-message string in tests/lang-rules.test.mjs (spec-directed comment update; throw
  semantics unchanged). 7 new test files, zero assertions loosened. CHANGELOG entries present for
  all six findings.
- **Dogfood (fresh full self-map via run.mjs at d641c44):** `trend.mjs:metrics` call-callers =
  **2** (`gitSnapshots`, `<module>`); `PERM_SEEDS` nodes = **0**; deadcode -> **safe tier EMPTY
  (0 safe, 8 review**, all entrypoint/closure-guarded**)**; `class -> own member` edges = **0**;
  `@line` ids = 5, all legitimate test/bench same-name collisions.
- **Suites:** tier-equivalence (incremental-edges IE-*, type3-clones, extract-engine, ts-engine,
  extract-v7): 47 pass / 1 pre-existing env skip. Full `npm test` at review HEAD: **58.5 s wall,
  658 tests, 653 pass, 0 fail, 5 skipped** (pre-existing env skips; +2 tests = the new
  module-stub legs), `git status` clean after (only intended review edits present pre-commit).
  `check-consistency` OK.
- **CI on a27ea03:** 6/7 green (test ×3 OS/node legs, test-no-ast, gate, bench); `consistency`
  **red** — docs/changelog.html stale vs WS-B's six CHANGELOG entries. That is WS-A finding #5's
  freshness gate making its first real catch, one workstream after landing. Fixed mechanically in
  2ca9ad1 (in-place `node site/build.mjs`, byte-identical to a temp rebuild, exactly the six
  missing paragraphs); fresh CI run on the review head expected green (checked post-push).

Verdict: **all six findings PASS**; both builder deviations (#9 lookahead placement, #12 class
gate) ratified with fresh adversarial proof; no structural problems. Residuals documented, none
blocking. WS-C may rebase.

## WS-C

Builder evidence — truth: resolution (#11, #10, #16), spec `docs/specs/round2-ws-c.md` (hardened;
authoritative). Base e67965c (post-WS-B). Strict TDD: every finding's fixtures ran RED first
(failure reasons below), then the fix, then green. Container: tree-sitter engine present (all AST
legs un-skipped). `SCANNER_VERSION` 14 → 15 landed with #10's commit per the spec ladder
(B=14, C=15, D=16).

### Baseline (before first WS-C change, HEAD e67965c)

- `node scripts/extract-symbols.mjs . --no-ctags --out <scratch>/baseline.json` →
  `1232 symbols, 4521 edges (3906 call + 615 import) from 225 files; dropped 554 ambiguous`.
- **Ref-edge total: 1,180**. **Into ≤2-char symbols: 234 across 8** (`g`@replay-mine ×74,
  `f`@regrade ×52, `p`@regrade ×51, `d`@diff ×38, `w`@diff ×11, `q`@query ×4, `G`@post-edit-diff
  ×3, `C`@post-edit-diff ×1 — all test/bench, matching the audit exactly). **Product→non-product
  ref edges: 209** (audit measured 193 pre-WS-B; WS-B's truth fixes shifted the count — recorded
  both). **Product→non-product calls: 2** (out of ref scope, recorded per spec):
  `scripts/lib/minhash.mjs:<module> → tests/replay-mine.test.mjs:g` and
  `scripts/lib/stats.mjs:monthLine → bench/experiments/efficiency-pilot.regrade.mjs:f`.

### Finding #11 — 70c94ac

- T-11.1 RED (`node --test tests/import-nodenext.test.mjs` → 5 fail / 1 pass): i1 `edges: []` +
  would-be ambiguous drop (alias miss → bare-name two-defs); i2 `edges: []` (nsmap empty); i3
  call edge present ONLY via the unique-bare-name rescue, barrel dependent edge absent (re-export
  table empty); i4 `edges: []` (`.mts` files not enumerated at all); i5 `pub` missing. i6 GREEN
  pre-fix by design — the hardened both-exist precedence pin (literal on-disk `.js` wins; the
  remap must never flip it).
- T-11.2/11.3: `EXT_REMAP` + `importCandidates` exported from lib/import-resolve.mjs; resolveImport
  and the pub-walk's `addEntry` iterate the ONE list (membership caller-owned). After: **i1–i6
  6/6 green**.
- **Byte-identity (criterion 1)**: no-remap-miss corpus (direct `.js` hits, extensionless→`.js`,
  dir→`/index.js`, `.ts` direct, python imports) extracted by the PRE-fix resolver (git worktree
  at e67965c) vs post-fix, both `--no-ctags --engine regex`: `cmp` → **byte-identical**.
- Suites: import-anchor-precision / import-default-export / import-member-edges /
  import-object-alias-precision / python-imports / incremental-edges / package-shape / extract-v7
  → 41/41; neighbors (extract-symbols, reference-edges, test-edges, module-scope, inherit-edges,
  lang-rules, codemod, both hooks, stdout-flush) → 62/62.
- **Mechanical adjustment (noted)**: `.mts/.cts` added to `SRC_RE` + the JS/TS dispatch points
  (isJsTs, re-export scan filter, edge-mask dispatch, langOf) — the frozen i4 fixture requires
  `.mts` sources to extract, which requires them enumerated and masked as TS. Residual (out of
  WS-C scope, noted for a future pass): codemod.mjs:151's import-repoint loop still filters on
  the old extension list, so a rename's import repoint skips `.mts/.cts` importers.

### Finding #10 — ce5a76f

- T-10.1 RED: `tests/extract-refscope.test.mjs` → (a)(b)(c)(d) fail with the documented
  fabrications, (a-inv) green pre-fix (the one-directional pin); `tests/self-map-roles.test.mjs`
  PROPERTY → fail with **209** product→non-product ref violations on the real self-map.
- T-10.2–T-10.4 (one commit): decl-line refRe skip + paren-balance continuation; param-shadow
  from `parseSignature(...).raw` token sweep (+ spilled-tail + continuation sweep; per-file local
  maps — cached `ranges` gain no non-JSON state); ≥3-char fallback guard with distinct
  `shortDropped` surfaced as `(N short-name)` in the banner (helpers' `dropped (\d+) ambiguous`
  grep unaffected — format extension only); reject-form ref role gate at the unique-in-package
  branch. `SCANNER_VERSION` 14 → 15 + per-file `short` cache field.
- **Self-map re-measurement** (`node scripts/extract-symbols.mjs . --no-ctags --out …` at
  ce5a76f): banner `1240 symbols, 4102 edges (3482 call + 620 import) from 228 files; dropped
  1287 ambiguous bare-call edges (826 short-name)`. **Ref edges 1,180 → 771. Into ≤2-char
  symbols 234 → 2** — both survivors are SAME-FILE refs to `bench/experiments/
  efficiency-pilot.regrade.mjs:f`, a real 1-char `const f = (x) => …` formatter (line 169),
  resolved via sameFileByName — never the fallback — bench-role both sides: legitimate,
  explained. **Product→non-product refs 209 → 0** (empty ALLOWLIST). The 2 baseline cross-role
  CALLS also gone (both were 1-char bare-fallback wirings — the short guard covers calls too).
  Fabricated cross-role class: **~0 achieved**.
- T-10.5: both rename-workaround comments deleted; natural names restored
  (`cli.mjs` `linesOf(relPath→rel)`; import-resolve destructure `rel/textOf/maskedOnce`, all
  internal uses renamed back). Self-map second test pins zero edges from
  `scripts/lib/{import-resolve,cli}.mjs:*` into `extract-symbols.mjs:{rel,textOf,maskedOnce}` —
  the exact cycle class the renames dodged. Property test green **×2 runs**.
- Suites: refscope 5/5; self-map-roles 2/2 ×2; reference-edges / test-edges / extract-symbols
  (exact `ambiguousDropped` 1/0 assertions HOLD — fixtures have no shadowing/short names) /
  extract-v7 / inherit-edges / deadcode / spread-iife-selfmap (`trend.mjs:metrics`, `PERM_SEEDS`
  WS-B assertions hold) / accessor-overload-truth / id-collision / module-scope → 61/61;
  tier-equivalence (incremental-edges IE-*, extract-engine, type3-clones, ts-engine,
  lazy-ts-engine) → 46 pass / 1 pre-existing env skip; language suites (py/go/rust/java/cs/rb/
  php/kt/swift), signature, suppression, annotations, cli consumers → green.

### Finding #16 — 4853084

- T-16.1 RED: the new Signal-B case reproduced the audit disease exactly — tA/tB paired as ov1
  plus 4 cross-role pairs alongside the legitimate pA/pB.
- T-16.2: the one-line caller-side `cand` filter. Suites: overlap-roles (old + new) + overlap +
  overlap-lsh + overlap-caps → 14/14 (lsh/caps fixtures stamp `role:'product'`; overlap.test
  paths product-role — re-checked per the spec's risk note before landing).
- **A/B on the SAME post-#10/#11 self-map** (fragment → workspace, overlap run 4 ways):
  (before) pre-#16 overlap (e67965c worktree), default scope → **16 parallel-impl findings, all
  16 containing non-product nodes** (test-helper pairs: `extract`/`runOverlap`/`buildMapped`/
  `<module>`-of-test-files …). (after) post-#16 default → **0 parallel-impl**; every emitted
  finding across all kinds (11 total) references product-role nodes only — the header's
  "excluded" claim is now TRUE for Signal B. (i) set equality: default ≡ ALL_ROLES∩all-product
  (both empty — ONLY the excluded class vanished). (ii) surviving product pairs: none exist on
  the post-#10 map (the audit's ov1/ov2 class dissolved when #10 removed fabricated edges from
  twin candidacy — the spec's "counts are pre-fix baseline, not acceptance" note, live);
  vacuously identical in both runs. (iii) `CODEWEB_ALL_ROLES=1`: new overlap's COMPLETE
  `overlaps` output byte-identical to the pre-#16 overlap under the same env (**129 findings**)
  — the filter is provably inert under the escape hatch, so `cand` is byte-identical to today's.

### Closing

- Full `npm test` ×2 at 4853084: **57.4 s / 57.0 s wall; 672 tests, 667 pass, 0 fail, 5
  skipped** (pre-existing env skips; +14 tests = 6 nodenext + 5 refscope + 2 self-map-roles + 1
  Signal-B; zero new skips, all new tests path-portable). `git status --porcelain` clean after
  both runs. `check-consistency` OK at every commit; docs/ rebuilt in the SAME commit as each
  CHANGELOG entry (WS-B's freshness lesson applied).
- Deviations, all mechanical + noted above: `.mts/.cts` SRC_RE widening (#11); the property test
  reads stamped `node.role` (= roleFor: rules overrides + roleOf — the gate's exact truth) rather
  than raw `roleOf(file)`; baseline cross-role count 209 vs the audit's 193 (post-WS-B tree).
  No design changes; no assertion weakened (the only fixture-count shifts are the documented
  self-map-derived measurements, and the exact `ambiguousDropped` 1/0 assertions were verified
  unshifted).

### WS-C review+verification

Reviewer pass over 70c94ac / ce5a76f / 4853084 / 8c4dc9d vs the frozen spec. Verdict: **all three
findings pass**; every diff maps to its T-task; no existing assertion touched (new files +
append-only); i6 precedence pin present (both directions); CHANGELOG + docs/changelog.html rebuilt
in each commit; `check-consistency` OK. Three small gaps found and fixed in this pass (below),
each red-first; one residual noted. Builder-flagged scrutiny items adjudicated:

- **(a) SRC_RE widening coherence** — full extension-universe sweep: extractor dispatch points
  (:320/:593/:969), `langOf`, SRC_RE, importCandidates all coherent. TWO stragglers found, both
  same class as the flagged one, both FIXED (red-first): `codemod.mjs:151` repoint loop skipped
  `.mts/.cts` importers (CM-IMPORT-REPOINT-MTS pins it), and — worse — `maskAligned`
  (masking.mjs:303) returned null for `.mts/.cts`, so codemod's rewrite gate fell back to
  UNMASKED whole-file label replacement for them (masking-properties P4 pins the dispatch
  contract). Deliberately left: bench replay/determinism corpora SRC_REs (frozen lists),
  bench-core's `.tsx?` corpus walk, cli.mjs:174 script-name claim scan (scripts are .mjs).
  **Residual (design-level, not fixed):** the repoint loop matches specifiers against deletion
  files LITERALLY — a NodeNext `./x.mjs` specifier naming a deleted `x.mts` source won't repoint,
  and a repoint TO a `.mts` canonical would emit the `.mts` spelling; remap-aware repointing
  needs importCandidates against deletionFiles (future pass).
- **(b) role property source** — stamped `node.role` and the :816 gate share ONE `roleFor`
  closure per run, and the stamp tier is rulesSig-gated: within a run and across rules edits they
  cannot diverge... except through the EDGE cache, which keyed on symbolSig alone. A rules-file
  role flip changes no node id, so run 2 replayed run 1's gate verdicts against fresh stamps —
  product→bench refs the gate now forbids shipped from cache (reproduced red). FIXED:
  `reuseEdges` now also requires `oldCache.rulesSig === rulesSig` (mirror of the stamp tier's
  gate); role-overrides R5 pins flip-then-warm-rederive. The builder's deviation (reading
  `node.role`, not literal `roleOf`) is CORRECT — raw roleOf would mis-assert every
  override-covered file.
- **(c) LEGACY_FALLBACK interaction** — property extraction run under both modes. Default:
  771 refs, 0 cross-role. `CODEWEB_LEGACY_FALLBACK=1`: decl-line skip, param shadow, and the
  short guard all HOLD (≤2-char refs stay 2, both same-file; 828 short drops identical) — they
  sit UPSTREAM of the lever; 28 product→non-product refs reappear via the lever's own
  `defs[0]` branch only, which is its documented purpose (resurrect pre-fix wiring for A/B
  regression proof; extract-symbols.test.mjs asserts a fabricated edge COMES BACK under it).
  Correct by design; property test correctly runs default-mode.
- **(d) Python class-paren over-suppression** — fixture written (refscope (e)): a class whose
  `__init__(self, helper)` shadows module symbol `helper`. Confirmed: the param-ref inside
  `__init__` drops (1 ambiguous), `render`'s real cross-file body ref SURVIVES
  (`Widget.render → helper.py:helper`). Suppression is per-binding in Python too; green as-built.

Usage verification (all fresh at 8c4dc9d):
- Self-map: `1240 symbols, 4102 edges from 228 files` — ref edges **771**, product→non-product
  refs **0**, refs into ≤2-char symbols **2** (both same-file, regrade.mjs `f`),
  product→non-product calls **0**, T-10.5 cycle-class edges **0** (re-derived, not trusted).
- Overlap on that map: default **11 findings, 0 parallel-impl, 0 non-product nodes anywhere**;
  `CODEWEB_ALL_ROLES=1` **129 findings**, graph.json AND overlap.md **byte-identical** to the
  pre-#16 overlap (ce5a76f worktree ≡ e67965c's overlap.mjs) under the same env — criterion 3
  (i)–(iii) re-derived, set equality holds (16 ALL_ROLES twins, 0 all-product, 0 default).
- i1–i6 re-run green; NodeNext package end-to-end: `query --callers src/x-parse.ts:parse` →
  exactly `src/main.ts:run` (the audit's 0-answer case answers); y-parse:parse → 0.
- SCANNER_VERSION gate: planted a v14 cache with a poisoned edge → discarded (poison absent,
  full rescan, cache rewritten v15, fragment byte-identical to cold).
- CI at 8c4dc9d: **all 7 jobs green** (gate, consistency, bench, test ×3 matrix, test-no-ast).
  Gate adjudication: the PR digest reads `edges +13 −1` — the gate maps `--target scripts`
  only, where the removed fabrications never existed (they pointed into tests//bench/); its
  regression classes (new cycles / duplication / a SURVIVING symbol losing all callers) key
  `lostCallers` on call-kind in-edges only, so deliberate ref-fabrication removal passes
  honestly. No gate bug; nothing to fix.
- Full `npm test` ×1 post-fix: **58.7 s wall; 676 tests, 671 pass, 0 fail, 5 skipped**
  (pre-existing env skips; +4 tests this pass), `git status --porcelain` clean after commit.

## WS-D

Builder evidence for findings **#20 → #21 → #19 → #17 → #18a** (spec `round2-ws-d.md`, frozen).
Commits: #20 `4115acc`, #21 `729aa5d`, #19 `8a471f5`, #17 `8582b4f` (generator + rexSig truth
fix) + `a6083cb` (delta), #18a `a140fdf`. All numbers min-of-3, one session, one 4-core box,
`writeLoadedCorpus` trees (`{files:800}` = 17,604 syms ≈ the 16.8k class; `{files:1400}` ≈
29.4k); BEFORE side is the WS-D-entry tree `d35ca2e` via a worktree, same session. Bench
discipline per spec header: ratios are the gates, absolutes are evidence (sole absolute gate:
the hook's < 1.5 s).

- **#20 maskJs (byte-identity + ≥ 1.4×)** — `tests/maskjs-identity.test.mjs` embeds the pre-#20
  masker verbatim as a frozen oracle: identity over every mask-eligible repo file (229, incl.
  .php hashComment), a loaded-corpus tree, and adversarial fixtures, all 4 mode combinations —
  green pre-patch, gates the patch, and is why #20 ships with NO version bump. Derived special
  sets re-verified against the CURRENT (post-WS-B) state machine per the spec's unresolved note —
  two members the spec's enumeration predates, documented in code: expr-interior includes
  `` ` `` (#8 nested push), template-text includes `\` (2-char escape). Throughput (repeatable
  one-liner in the commit + this ledger's method): 800-file corpus 148.8 → 29.3 ms =
  26.75 → 135.83 MB/s (**5.08×**; keepValues 4.81×); repo mix 30.16 → 95.02 MB/s (**3.15×**).
  Gate ≥ 1.4×: cleared.
- **#21 enclosing index (≥ 2× big-file, ± 5 % corpus, byte-identical)** — new
  `scripts/lib/enclosing.mjs` (cohesive for WS-H #40) + 300-trial property suites with the OLD
  linear scans embedded verbatim (object-identity equality incl. duplicate-start tie-breaks) +
  golden owner-id fixture + big-file determinism. 8k-fn single file (`{files:1, fnsPerFile:8000}`):
  regex tier 1,514 → 734 ms (**2.06×**, the tier the finding profiled); AST tier 3,210 → 2,393 ms
  (1.34× — tree-sitter parse dominates there, recorded honestly). `cmp` byte-identical fragments
  BOTH tiers vs d35ca2e. 800-file corpus 1,257 → 1,162 ms (inside the ± 5 % bound, faster).
- **#19 warm floor (v16)** — SCANNER_VERSION 15 → 16 (B=14/C=15/D=16 ladder, no rev field).
  Interned edges + syms dropped + hash-hit full-product replay (rulesSig-gated); CF-MIGRATE
  plants a poisoned previous-generation cache → cold banner `scanned N/N`, no poison, output
  byte-equal to no-cache, cache rewritten at the live version. Compact fragment + sha1
  skip-write (`(unchanged)` banner, CF-SKIP-WRITE pins mtime stability). `.stages.json` →
  per-output {s, h}, size-first; S5 (parseable same-length graph.json tamper) and S6 (report.md
  tamper) red-first then green; SOURCE_DATE_EPOCH joins the lever string. **DEVIATION (spec
  estimate vs measurement)**: cache −32.3 % default engine (18,856,987 → 12,774,593 B) /
  −38.4 % regex (15.8 → 9.7 MB) vs the spec's ≥ 40 % — its estimate read `syms` as a third of
  the 44 % symbol share; measured decomposition: syms 6 %, nodes 29 %, ranges 8 %; the edge term
  fell 8.24 → 3.51 MB (−57 %). Mechanism exactly as specced; flagged for reviewer adjudication.
  Fragment 22.7 → 14.2 MB. Warm no-change `run.mjs` 825 → 677 ms mid-WS; **701 ms final** (with
  #17 cand fields + #18a sidecar freshness in the loop) — the floor criterion's ratio (≤ ~84 %
  of before) holds either way. Memo belt: 13.9 MB graph parse 329.6 ms → 35.8 ms 5-output
  stat+read+sha1 (9.2× cheaper, 5× the coverage). IE-EQUIVALENCE gained warm-vs-cold fragment
  BYTE equality per step (the #17 oracle) — green before #17 landed.
- **#17 name-delta (the round's riskiest)** — extended generator landed FIRST per spec
  (delsym/rensym incl. colliding, pkg toggle, rex flip). **Found a genuine pre-existing
  staleness bug**: the spec's own "green under wholesale" premise failed 5/40 trials — a barrel
  flip (`export { shared9 } from './rexutil.js'` → `'./rexutil2.js'`) changes zero symbols, so
  the SHIPPED engine replayed the unchanged consumer's stale call edge (IE-REX-FLIP repro).
  Fixed red-first with `rexSig` (canonical JS re-export + py from-import tables) on BOTH reuse
  gates — the spec's hardened trigger (e) made total; plus the py belt: a changed .py file whose
  (srcMod, orig) chain-landing-pad membership moved goes wholesale (edge-time
  `pyReExportResolve` is invisible to cand/bindDeps — mechanical superset of (e), noted).
  Delta rule as hardened: three conjuncts incl. **bind-replay** (T-17.3's deps API: resolved
  targets + every visited chain file, dead ends included; the py memo now stores visited files
  so bindDeps are bind-order-independent). Kill-switch `CODEWEB_NAME_DELTA=0` verified: the :80
  wholesale assertion VERBATIM under that leg (same tree, same add-a3 step) and the whole IE
  suite passes with the ambient switch (47/47 at 40 trials). **IE at FULL depth: default leg
  47/47, kill-switch leg 47/47, `CODEWEB_IE_TRIALS=40`**, fragment byte-equality every step.
  Bench @16.8k: noop 560 ms; **add-one-unique 710 ms = 1.27× noop (bar ≤ ~1.3×; was 2.12×)**,
  `edged 1/800`; body-edit 759 ms `1/800` (unchanged class); delete 703 `1/800`; rename 708
  `3/800`; add-colliding(anchor0) 1,127 ms `800/800` — honesty row, near-wholesale by design.
  @29.4k: add-one 2,294 → 1,277 ms = **1.22× noop** (was 2.14×), `edged 1/1400`. Hook
  add-one-function end-to-end 1,909 → 1,027 ms. Caveat per spec: loaded-corpus emits no imports
  — bench exercises the bare-name path; bind-coupling correctness is IE's (IE-BIND-COUPLING:
  rensym of imported `a1` re-edges c.js, b.js replays). Deviations noted in the commit:
  hash-hit files re-derive binds from in-hand text (sound subset of "stamp/hash unchanged"
  replay, no extra IO).
- **#18a hook-baseline sidecar (< 1.5 s)** — graph-ops split (`baselineSummary` /
  `regressionsAgainstSummary`, `structuralRegressions` = composition), `hook-baseline.json`
  beside graph.json (stamp-first, sha1-on-mismatch with shared read), write points in run.mjs
  (reuse path only when stale) + refresh.mjs (free string), both try/catch. Five BDD scenarios
  incl. the sidecar-consumption proof (dropped baseline cycle key reported as NEW) and
  both-corrupt → silent exit 0. Hook no-change fire @16.8k: 1,167 → **889 ms** — the absolute
  < 1.5 s floor holds with margin (this box is faster than the finding's 1,624 ms box; same
  corpus size, method noted). hook-fastpath-floor.md revisit triggers point the residual at
  #18b/WS-H.
- **Suite + gates**: full `npm test` at IE full depth (`CODEWEB_IE_TRIALS=40`): **70.1 s wall,
  727 tests, 722 pass, 0 fail, 5 skipped** (pre-existing env skips; +51 tests this workstream),
  `git status --porcelain` clean. `check-consistency: OK`. `bench/all.mjs --gate`: "all
  promises hold" (local refresh of benchmarks.json reverted — gate result recorded here).
  Interlocks honored: WS-C's `rulesSig` conjunct preserved in `reuseEdges` AND required by the
  delta path (R5 green); masking special sets re-derived from WS-B-final state; no fixture or
  generator assumes the pre-.mts/.cts extension list (identity test derives from the live
  dispatch set).

Reviewer-scrutiny items: (1) #19's cache-size shortfall vs the spec's ≥ 40 % estimate
(mechanism-faithful, decomposition above — adjudicate estimate vs bar); (2) the rexSig/py-belt
superset of hardened trigger (e) — strictly more conservative, never weaker, but post-freeze;
(3) IE op-stream bytes differ from the frozen generator (uniform 8-op pick vs the old
delfile×2 weighting — #6 precedent claimed); (4) #21's AST-tier big-file ratio (1.34×) is below
the 2× bar the regex tier clears — parse-dominated, pre-existing constant; (5) the
`hash-hit-derives-binds` simplification in #17 (T-17.3 allows replay there; derive chosen —
sound, no IO cost).

### WS-D CI red→green (b6f1040)

Head `b002d40` had two CI reds; both root-caused and fixed honestly, no gate suppression or
re-baseline:
- **gate**: ONE new cycle `lib/graph-ops.mjs ↔ lib/import-resolve.mjs` — not an import: #17's
  private 3-char `dep` closure became a package-unique symbol, and graph-ops' `dep` LOOP
  VARIABLES (impactOf/impactCountOf BFS pushes) bare-ref-resolved to it via the unique-name
  fallback, closing a cycle with the pre-existing `scanJsReExports → graph-ops:map` ref (the
  ≥3-char guard's documented residual magnet class). Fix: rename to `addDep` (naming hygiene;
  behavior byte-identical — IE 40-trial both legs re-verified 47/47 post-rename, import/python/
  cache/hook suites 107/107). Gate re-run vs `d35ca2e`: edges +49 −6, **cycles +0 −0, "ok — no
  structural regressions"**.
- **test-no-ast**: ENC-GOLD's expected ids were AST-shaped (`A.m`/`B.m`/`Late.ping` are
  tree-sitter method nodes; the regex scanner never discovers single-line-body methods). Split
  per the suite's named-skip idiom: ENC-GOLD pins the REGEX tier explicitly (`--engine regex` —
  the exact path #21's owner stack changed), byte-identical on every leg with NO skip, id list
  matching the no-ast leg verbatim; ENC-GOLD-AST keeps the default-engine golden under
  `{ skip: !probeAst().ts && 'tree-sitter engine unavailable' }` (+1 named skip on the no-ast
  leg: 50 ≤ its documented 60 runaway bound; matrix ceilings 8/11 unaffected).

Fix sha `b6f1040`; coordinator-confirmed final CI state: **all 7 jobs green** (test
ubuntu-22/24, windows-22, test-no-ast, bench, consistency, gate — gate comment shows cycles +0).

### WS-D review+verification

Reviewer pass over `4115acc`/`729aa5d`/`8a471f5`/`8582b4f`/`a6083cb`/`a140fdf`/`b002d40`/
`b6f1040`/`1535d3c` vs the frozen spec. Verdict: **all five findings pass**; every diff maps to
its T-task; one adjudication produced a code fix (below, `1bd4d02`); one CHANGELOG gap filled.
All fresh numbers min-of-3, one session, one box, `writeLoadedCorpus` trees.

**(a) The `dep`→`addDep` rename — adjudicated: the rename WAS the T-10.5 disease; the CLASS is
now fixed, and the rename ratified on the merits only.** Counterfactual fixture (a 3-char
package-unique closure `dep` in one file + `for (const dep of …) … visited.add(dep)` loop vars in
another): at head `1535d3c` the fallback STILL fabricated `consumer.mjs:impactOf →
target.mjs:dep (ref)` — the rename moved the target, not the mechanism. Fix (`1bd4d02`,
red-first `extract-refscope (f)`): the pkg-unique fallback excludes **closure-local** targets —
ids whose range sits strictly inside a `function`/`method` range (positive kinds only, so unknown
ctags container kinds stay eligible; `.php`/`.rb` exempt — nested definitions there become
reachable at runtime; same-file untouched — WS-C's 2 legitimate short survivors are exactly the
sameFileByName path, and they remain: refs into ≤2-char symbols still **2**, both same-file
`regrade.mjs:f`). Nesting joins the resolution landscape: the eligibility bit annotates
`symbolSig` AND both delta label maps — a wrap-into-closure edit keeps the node id, so an
unannotated sig would wholesale-replay every consumer's stale verdict; `CF-NEST-FLIP` pins
warm==cold bytes + delta-path selectivity (`edged 2/3`), and fails RED with the annotation
neutralized. Derivation-semantics change ⇒ `SCANNER_VERSION` 16 → **17**. **Revert-proof**: with
`dep` RESTORED in import-resolve.mjs, the self-map has **0** cross-file edges into it, **0**
graph-ops↔import-resolve edges either direction, 7 same-file `dep` edges intact — the guard, not
the name, closes the incident; `addDep` kept because a verb names an action, dodge comment
rewritten. Self-map delta (regex, both trees): **−31 fabricated closure-local edges** — including
`scanJsReExports → graph-ops:map`, the OTHER half of the CI cycle, and the extract-symbols →
import-resolve factory-closure refs (real runtime deps, but resolved by name-coincidence; the
principled home is the dispatch/member tier) — **+13** formerly-shadowed top-level uniques (the
fallback's documented heuristic on a cleaner candidate set; none cross-role).
Product→non-product refs **0**; self-map-roles 2/2; gate vs PR base: **cycles +0 −0, ok**.

**(b) #19 cache shortfall — accept with justification, and the FINAL net recorded.** Provenance:
IMPROVEMENTS.md measured `syms+nodes+ranges` as an aggregate 44 %; the spec's ≥ 40 % derived from
reading `syms` as ~a third of it; builder measured syms 6 % (nodes carry the weight). Mechanism
exactly as specced; the −32.3 %/−38.4 % ledger numbers are the **#19-commit point**. Fresh at the
review head WITH #17's cand/bindDeps fields (spec estimated +5–10 %): default 18,856,987 →
**14,149,552 B (−25.0 %)**, regex 15,821,267 → **11,113,832 B (−29.8 %)** — so T-17.1's "net
≥ 35 %" line is also missed, same estimate provenance, cand at the top of its predicted band.
The criteria that gate behavior all hold (warm floors below; fragment 22.75 → 14.22 MB; memo belt
9.2× cheaper at 5× coverage). Named cheap next term (future pass, not built — it is another
format change): stored nodes carry default-valued fields (`exports:false, domain:'', summary:''`,
`weight:1`) on every row; field-compaction attacks the 29 % `nodes` share directly.

**(c) #21 AST tier 1.34× — bar's intent met; residual profiled parse-bound.** Fresh 8k-fn
interleaved min-of-3: regex 1,505 → 750 ms = **2.01×** (the tier the finding profiled; bar ≥ 2×
holds); AST tier 3,426 → 2,571 ms = 1.33×. Direct profile: `extractJsTs` (tree-sitter parse +
walk + t3 + cx) alone = **~1,390–1,470 ms** on that file — a constant #21 never touched; the
enclosing/owner term fell ~750–850 ms in BOTH tiers. Sorted node/edge sets equal across trees
(8,005 nodes / 48,093 edges); main-tree byte-determinism holds under a pinned epoch.

**(d) builder's five scrutiny items**: (1) = (b) above. (2) rexSig+py-belt vs trigger (e):
rexSig-inequality → wholesale is a strict SUPERSET of "any changed file's table differs" (global
canonical-table hash + fileSig conjunct + the (srcMod,orig) membership belt) — never weaker,
post-freeze but red-first; **IE-REX-FLIP re-verified RED against the pre-#17 engine (d35ca2e
worktree)** — the staleness bug was real and shipped; accepted. A CHANGELOG gap found: the truth
fix was invisible outside the perf entry — Fixed entry added in this pass. (3) IE op-stream
bytes: uniform 8-op pick is a semantics-class superset; delfile frequency was never pinned and
IE-DANGLING pins deletion deterministically; #6 precedent applies — accepted. (4) = (c) above.
(5) hash-hit-derives-binds: replay requires `text == null` at both bind gates, so a hash-hit
(read) file re-derives from in-hand text — a strictly-fresher subset of T-17.3's allowance, zero
extra IO — accepted.

**(e) sweep**: every T-task maps to its diff (T-20.1/2/3 with re-derived special sets ✓;
T-21.1/2/3 lib+property+goldens ✓; T-19.1/2/3 incl. size-first sha belt, `SOURCE_DATE_EPOCH`
lever, S5/S6 ✓; T-17.1–17.5 incl. the three-conjunct rule at :1175 ✓; T-18.1/2/3 ✓). Never-weaken:
the `:80` assertion string is **byte-verbatim** under the kill-switch leg (diffed against
`bfc6b92`), scenario per the spec's blessed superset; `rulesSig` conjunct present in BOTH
`reuseEdges` and `deltaDirty` (R5 green). ENC-GOLD split: regex golden runs skip-free everywhere
(id list = the no-ast leg verbatim), ENC-GOLD-AST under the named probe skip, un-skipped here —
no coverage lost. #18a seams exercised LIVE against the hook binary in a scratch workspace:
no-change+sidecar → silent exit 0; corrupt sidecar × valid graph → fallback WARN, exit 0; valid
sidecar × graph tampered to same-length garbage under a matching stamp → **correct
lost-callers verdict from the sidecar** (the legacy path would have parsed garbage and gone
silent); both corrupt → exit 0, zero bytes. CHANGELOG+docs rebuilt in every finding commit
(`b6f1040` carried none — test/naming-only, noted).

**Usage verification (fresh, this box, head `1bd4d02`)**: mask corpus800 **4.83×/5.07×**
(keepValues off/on), repo-mix 2.82×/3.08× — bar ≥ 1.4×, **0 byte diffs** over 1,033 files × both
modes vs the d35ca2e masker. Warm noop extract 601 → **574 ms**; add-one-function **741 ms =
1.29× noop** (bar ≤ ~1.3×), `edged 1/800` ×3; `run.mjs` warm noop 828 → **711 ms**. Kill-switch:
same mutation, `edged 1/800` (delta) vs **`edged 800/800`** (`CODEWEB_NAME_DELTA=0`), fragments
byte-identical delta == kill-switch == cold-full. Planted v15 cache → `scanned 800/800` cold
rebuild, cache rewritten v17, bytes == cold-full; warm→warm `scanned 0/800` ×2, byte-identical.
Hook no-change fire **876 ms with sidecar / 1,214 ms without** (−338 ms ≈ the finding's ~325 ms
estimate; absolute < 1.5 s either way). **IE-EQUIVALENCE at FULL depth on the review head:
default leg 47/47, kill-switch leg 47/47** (`CODEWEB_IE_TRIALS=40`). Full `npm test`: 700 tests,
**695 pass, 0 fail, 5 skipped** (pre-existing env skips), tree clean. `check-consistency: OK`;
`bench/all.mjs --gate`: all promises hold (local benchmarks.json refresh reverted, per WS-D
precedent). CI on the final head: recorded in PR #57 checks post-push (all 7 required green —
see the PR timeline for this sha).

## WS-E

Builder evidence — advisors + leftovers (#41 #22 #23 #24 #26 #27 #28 #42), spec
`docs/specs/round2-ws-e.md` (hardened; authoritative). Container: Node v22.22.2, 4 cores. Bench
corpus built once via `writeLoadedCorpus("<scratch>/cw-ws-e/src",{files:680})` → **14,964 function
nodes / 88,465 edges** (`node scripts/run.mjs <src> --target e-loaded --out-dir <ws>`); baseline
worktree at the WS-E-start sha **9ac5543** for before/after + byte-identity. All timings min-of-3
unless noted. Strict TDD; per-finding commit + CHANGELOG entry + `node site/build.mjs` in the same
commit; trailer on every commit.

### Prior builder (landed before this session; NOT re-done)

`#41` **1532c02**, `#22` **2882724**, `#23` **9d23435 + cac8e2a**, `#24` **ee8b638 + dfdee97 +
9ac5543** (7 commits, pushed). Their per-finding evidence lives in the CHANGELOG entries; this
ledger section was not written before the credit-limit death, so it starts here. The dead builder
also left an uncommitted partial `tests/dup-check.test.mjs` (#26 characterization + sidecar tests).

### Partial-test decision (#26)

The orphaned `tests/dup-check.test.mjs` (+112 lines: `IOV-PIN-26` characterization + `DC-SIDECAR-EQ`
equivalence) was **coherent and matched the spec's #26 test plan — kept and completed**, with ONE
fixture bug fixed: `DC-SIDECAR-EQ`'s long-body copy renamed the function (`.replace(/longOne/,
'longCopy')`), so the two capped bodies differed by one identifier token and sim was ~0.9993, not the
asserted 1 (`IOV-PIN-26` correctly does NOT rename its copy). Removed the rename so the 400-line copy
is byte-identical → sim exactly 1, which is the cap-parity the test pins. After the fix the test was
RED only on the missing impl (`SIMILAR_VERSION` undefined), as required.

### #26 — dup-check pool from similar-index — b759a0b

- `BODY_LINE_CAP` (400) + `capBody` centralized in `lib/shingles.mjs`, imported by overlap/dup-check/
  find-similar/the sidecar builder (local copies deleted); overlap byte-identical (logic untouched).
  `SIMILAR_VERSION = 2` (one const, builder + loader) — `buildSimilarIndex` + find-similar's live
  path now cap node bodies; find-similar payload gains `bodyLineCap`; candidate text uncapped.
  `review.mjs` passes `loadSimilarIndex(abs)`.
- TDD: `DC-SIDECAR-EQ` RED (SIMILAR_VERSION undefined) → GREEN. `node --test tests/dup-check.test.mjs
  tests/find-similar.test.mjs` → 21/21. overlap/type3/skeleton/rename suites 29/29.
- Baseline (pre-#26, live path, this container): 1-changed **374 ms**, 50-changed **1,804 ms**
  (task-recorded 396/1646 — same class). After (fresh v2 sidecar, min-of-3): 1-changed **6 ms
  (62×, bar ≤ ~60 ms)**, 50-changed **1,115 ms**. Equivalence: sidecar output byte-equal to live on
  200 corpus ids (and the fixture set: CRLF file + >400-line pool body; stale/v1 rejected; missing id
  falls back; changed id judged live).

### #27 — campaign concurrent advisors + clone opt-out — da4be54

- Three `spawnSync` → async `spawn` + `Promise.all` (stdout collected, stderr drained + discarded,
  exit code ignored, error/non-JSON → default). `planCampaign` gains `clone` (default true); campaign
  passes `clone:false` (owns its graph; normalizeGraph is idempotent + never touches meta).
- TDD: `CMP-CONCURRENT-STABLE` GREEN on the sequential code first (characterization), then still GREEN
  after the switch (byte-stable). `node --test tests/campaign.test.mjs` → 10/10.
- Wall (min-of-3, corpus graph): **1.65 → 0.89 s**; payload `cmp`-identical to the 9ac5543 binary.

### #28 — diff rename detection: indexed + memoized + capped-with-a-note — 54d5213

- Pure top-level `detectRenames({before, after, bIx, aIx, nodesRemoved, nodesAdded, bReader,
  aReader})` (WS-F #33 lifts verbatim): `byId` indexes (no `g.nodes.find`), old-skeleton hoisted, new-
  skeleton memoized once (null bodies too), bodies capped at `BODY_LINE_CAP`. Additive
  `nodes.renameCheck = {skipped, removed, added, cap}` + one text line when detection is capped (>200
  a side, both non-empty); documented in the header.
- TDD: 5 characterization pins GREEN on 9ac5543 (rename-in-place, move-with-name, sub-0.85 non-match,
  span-shape fallback, >400-line rename), cap-trip `renameCheck` tests RED → GREEN. `node --test
  tests/diff.test.mjs tests/rename-explain.test.mjs` → 18/18.
- Evidence: `after.json` = corpus graph with 195 relabeled nodes; rename overhead vs the 0-rename diff
  (min-of-3): **1,733 → 30 ms (bar ≤ ~50 ms)**; `renamed[]` byte-identical to the 9ac5543 binary
  (195 pairs).

### #42 — migration leftovers + trend fast path — 2060cb8

- T-42.1 dead `writeFileSync` imports dropped (overlap/build-report/coverage/refresh; grep-verified).
  T-42.2 `coverage.mjs` writes the graph compact (`JSON.stringify(graph)`); `coverage.test` pins
  parse+compact. T-42.3 jsdoc moved above `sourceReader` (comment-only). T-42.4 `import-resolve.mjs`
  re-indented uniform 2-space — the two verbatim-moved blocks (lines 58–251 base-0, 273–356 base-2)
  shifted +2; `git diff -w --quiet` → exit 0, `node --check` OK, no multi-line literals in the spans.
  T-42.5 `stats.mjs` (×3) + `annotations.mjs` (×1) → `atomicWrite` (bytes/pretty-print unchanged); no
  import cycle (cli's deps are leaf modules, nothing imports stats/annotations). T-42.6 `staleNote` on
  `bench/results/scale-typescript.json`. T-42.7 `run.mjs --stages through-overlap` (unknown value exit
  2; partial run never writes the memo) + `trend.mjs --git` reuses one ws with the `meta.target===sha7`
  belt.
- TDD: `stage-memo` S7 (partial skips report+memo, full run after is not poisoned) + S8 (`--stages
  bogus` exit 2); `trend` reused-ws belt (failed middle commit zeroed, neighbors correct). Suites:
  coverage/atomic-writes/stats/annotations/suppression/stage-memo/trend/pipeline/import → 68/68.
- Evidence: `trend --git --last 2` on a 2-commit 680-file repo — per-commit **~7.5 → ~4.6 s**
  (extract-dominated; optimize+report skipped); snapshot metrics (nodes/confirmed/candidates/coupling)
  byte-identical to the 9ac5543 full-pipeline path.

### Closing

- ONE full `npm test` at 2060cb8: **721 tests, 716 pass, 0 fail, 5 skipped** (the pre-existing env
  skips — golden target ×3, TS bench, extract-engine inverse fallback; **zero new skips**, all new
  tests path-portable), wall ~67 s, `git status --porcelain` empty after.
- `check-consistency: OK — v0.9.0, 27 tools`; docs/ rebuilt in each finding commit (freshness gate
  green: `node site/build.mjs` + `git diff --quiet -- docs` → exit 0 at HEAD). No existing assertion
  weakened (new tests + append-only; the only edit to a pre-existing test file is the #26 fixture-bug
  fix in the dead builder's own uncommitted lines).
- Reviewer-scrutiny items: (1) #26 sidecar↔live bit-equality rests on `round6(inter/(a+b-inter)) ===
  round6(jaccard)` — verified byte-equal on 200 corpus ids, not just the fixtures. (2) #27 `clone:false`
  is safe ONLY because `normalizeGraph` is idempotent additive default-filling that never touches
  `meta` (loadGraph already normalized the graph); every other planCampaign caller keeps the clone.
  (3) #28 `detectRenames` must stay ambient-state-free for WS-F #33 — it takes all inputs as params.
  (4) #42.4 re-indent trusts `git diff -w` empty for correctness; confirmed no multi-line string/
  template in the shifted spans (only inline-comment backticks) so no hidden content change.
  (5) #42.7 the memo-write skip on partial runs is the belt and the per-output existence+hash check is
  the brace; the trend `meta.target===sha7` guard is defense-in-depth atop run.mjs's exit-non-zero.
- CI on the final head recorded in PR #57 checks post-push.

### WS-E review+verification

Independent adversarial review (no prior reviewer saw any of WS-E). Container: Node v22.22.2, 4 cores;
corpus re-built (`writeLoadedCorpus({files:680})`) → **14,964 nodes / 88,465 edges** (matches the
builder). Baseline worktrees at the per-fix pre-shas (base `1532c02~1`, `2882724`, `cac8e2a`,
`9ac5543`) for real before/after diffs. All eight findings **HELD**; the (a)-(f) equivalence
properties all adjudicated **held — no counterexample**.

- **#41 HELD** — LINT-NUL green over all tracked `.mjs`; tripwire proven: a planted NUL in a tracked
  file turns it RED naming `file: byte 0x00 at offset N`, green after restore.
- **#22 HELD (a: held)** — beyond the property test, ran the REAL pre-#22 `readingOrder` (base worktree)
  vs HEAD on **900 fresh-seeded random graphs (108 with self-loops) + 7,656 budget checks** and the
  15k corpus: every budget's output is byte-identical to the old code AND an exact prefix of the full
  order (budgets 0..n+2, and 40/100000/∞). Candidate key `(un,fi,id)` reads only the emitted set via
  `un` — no lookahead over `remaining`, confirmed in code and empirically.
- **#23 HELD (b: held)** — built ref-only-ring / call+ref-shadow / multi-SCC / dense-SCC-with-ref-pair
  fixtures; `break-cycles` stdout (json AND text) is **byte-identical HEAD vs pre-#23 baseline** on all
  four, including the ref-subtlety verdicts (1-call cut fails, ref keeps the pair alive → next cut).
  `CYCLE_KINDS` exported, used in `fileCycles`/`cheapestCuts`/`createMergeSimulator`, zero inline copies.
- **#24 HELD (c: held)** — instrumented `lshCandidatePairs` to dump real Signal-B/C entries on the 15k
  corpus, then diffed tier-2 output vs a string-key reference on those exact entries: Signal B **26,485
  pairs**, `buckets 901782==901782`, `skipped 64==64`; Signal C `74==74` — **pair SEQUENCE, set, and
  counts all byte-equal**. Core hashing (signature/bandKeys/PERM_SEEDS) unchanged since baseline.
  Collision handling: the random property can't reach a true 2³² band-fold collision; **added
  `LSH-TIER2-COLLISION-SPILL`** — searched out a real collision (`itm_285`/`itm_13184` share band-0 fold
  with differing tuples) and proved the spill groups each tuple only with its own duplicate, deep-equal
  to the string-key reference (precondition-guarded so a hash change fails loudly).
- **#26 HELD (d: held)** — the sidecar path `round6(inter/(a+b−inter))` equals `round6(jaccard)` because
  `rec.sh` is a deduped set (`[...set].sort()`), `rec.n=|set|`, and `capBody` is applied before
  shingling; **2,138 real-corpus probes, 0 mismatch**. sidecar≡live on the FRESH 15k map — clone-dense
  400-changed sample, 35 real >0.6 matches, **byte-identical**. Refresh: `refresh.mjs` rewrites
  graph.json (new mtime/size) but not the sidecar → `loadSimilarIndex` stamp check fails → null → live
  fallback (correct, unaccelerated). Sidecar is written by `build-report.mjs` at map time; keeping it
  fresh+accelerated post-refresh is **WS-F #25's `writeSidecars`** — a documented dependency, no
  correctness gap.
- **#27 HELD (e: held)** — `normalizeGraph` is idempotent (`asArray` returns the same array; 2nd pass a
  no-op) and never replaces/mutates `meta` (`g.meta = g.meta || {}` — same object reference,
  target/stats preserved). Alias-corruption probe: `campaign --json` on a graph with
  `meta.target="MY_REAL_TARGET"` emits that value under `clone:false` (a corrupting normalize would emit
  the `'target'` fallback). Only `campaign.mjs` passes `clone:false`. Spawn: stdio piped, stderr
  drained+discarded, exit code ignored, `error`→null→default, resolve idempotent.
- **#28 HELD (f: held)** — `renamed[]` **byte-identical 195/195** HEAD vs baseline on the relabeled 15k
  graph; cap-trip (250/250) emits `renameCheck {skipped,removed,added,cap:200}` with `renamed:[]`.
  `detectRenames` takes every input as a param (no ambient state) — WS-F #33 lifts verbatim.
- **#42 HELD** — dead `writeFileSync` imports gone (0 remaining, 4 files); coverage compact +
  byte-deterministic across runs (SOURCE_DATE_EPOCH); jsdoc move comment-only; `import-resolve`
  `git diff -w` empty; stats(×3)+annotations(×1) `atomicWrite`; `staleNote` NOTE-only (diff adds only
  the note — receipt NOT regenerated); `--stages through-overlap` (unknown→exit 2; partial run writes
  no memo, and `outputsIntact()`'s per-output size+sha1 check on `.stages.json` is the brace so a
  partial ws can never satisfy a full-run memo); trend one-ws + `meta.target===sha7` belt. All #42
  suites 34/34.
- **Never-weaken audit**: every touched test is additive or STRENGTHENED — `bench-all` now asserts the
  `cyclic` section, `coverage` asserts compactness; the only "-" lines are import-list widenings. No
  assertion weakened. (Minor: the Closing's "only edit to a pre-existing test file is the #26 fixture
  fix" is imprecise — those two strengthenings also touch pre-existing files — but the substance, no
  weakening, holds.) CHANGELOG per finding (#24's single entry lands at 9ac5543); `node site/build.mjs`
  + `git diff --quiet -- docs` → clean.

Fresh perf (min-of-3) vs the E bar: reading-order @15k **433 ms** (<1 s); break-cycles dense-SCC
(60f/240deps, cycles=1 verified:false — the densified worst case) **161 ms** (<1 s); overlap Signal-B
twin-enumeration **424 ms vs pre-#24 baseline 2877 ms = 6.8×** (≥4×) with overlap.md + 16 graph.json
overlaps byte-identical; dup-check 1-changed sidecar-fresh **6 ms** (≤60 ms; live 384 ms); campaign
**986 ms** (max-child+compose); diff rename overhead **30 ms** (784−754; ≤50 ms), renamed[] identical.
Bench rows `readingOrder`/`breakCycles` + the `cyclic` section are wired into `bench/all.mjs`; budgets
are FACTORS (0.7 / 0.45 / 0.9); `node bench/all.mjs --gate` → **all promises hold**. ONE full
`npm test`: **721 tests, 716 pass, 0 fail, 5 skipped** (pre-existing env skips), wall ~68 s,
`git status --porcelain` empty. `check-consistency: OK — v0.9.0, 27 tools`. NOTE: committed
`bench/results/benchmarks.json` is a pre-existing receipt (WS-E did not touch it — correctly avoiding
machine-specific drift; `--gate` regenerates+gates fresh). Review added one test (collision-spill);
committed with the trailer. CI on the review head confirmed post-push.

## WS-F

MCP server & hooks — the BDD workstream (#29 #30 #31 #34 #25 #32 #33). Build order per the frozen spec
(crash first, then the queue redesign as two stages): #29 → #30+#31 → #34 → #25 → #32 → #33. New BDD
spine: `tests/mcp-harness.mjs` (long-lived stdio client — none existed; 6 suites shared a spawnSync
batch pattern that cannot "send after observing") + `tests/mcp-scenarios.test.mjs` (S1–S7). All cross-
request ordering asserted by CODEWEB_MCP_TRACE mechanism, never wall-clock. Server startup gated behind
`isMain` so tests import `queueKeyFor` without spawning a readline loop.

### #29 — EPIPE guard — 4f664e0
Repro confirmed RED first: `find_similar` + 1 MB body + bad graph → `exit 1`, EPIPE thrown, request
unanswered (`scratchpad/build-f/repro29.mjs`). Fix: `child.stdin.on('error',…)` before writing +
try/catch around `stdin.end()`; named the INHERITED `lib/cli.mjs:19` stdout guard at `send()` (no
masking dup — T-29.2 correction verified: cli.mjs already installs it via import side effect); dropped
the dead `spawnSync` import. Post-fix: `exit 0`, `id2` answered isError, `id3` ping answered.
- **S1a** epipe-survival GREEN — find_similar 1MB+bad graph → isError, subsequent ping answers, exit 0.
- **S1b** stdout-close GREEN — 400-reply burst + destroy read end → server exits 0 (pins the cli.mjs guard).
M-series 28/28 unchanged.

### #30 + #31 — per-workspace-dir queue (stage 1) — 69eddce
The queue redesign's stage 1, landed as ONE coherent change. `spawnQueues` (keyed by graph FILE path)
→ per-WORKSPACE-DIR state `wsOf(key) → {writerTail, writersPending}`; key = `dirname(resolve(graph))`
for graph tools, `resolve(out)` for map, `dirname(resolve(after))` for diff (new `queueFrom`). One
`runChild` wrapper owns spawn/timeout/settle-once/trace/inflight for every child. handleMap routed
through it (gains the settle-once guard it lacked); autoRefresh joins as a writer, SKIPs when
`writersPending>0`, else enqueues (`refreshInFlight` deleted). `CODEWEB_MCP_TRACE=1` → NDJSON stderr
events (silent by default).
- **S2** refresh→diff ordering GREEN (this stage: trace end(refresh) < start(diff); adjusted at #33, see below).
- **S3** map serialization GREEN — end(map#1) < start(map#2), surviving graph parses (**I1**).
- **I5** GREEN — a failing map settles exactly once (one reply) + drains exit 0 (`mcp-queue.test.mjs`).
- **I7** GREEN — explicit refresh + stale query in one burst → `skip-autorefresh` trace, exactly ONE refresh child.
- `queueKeyFor` unit GREEN incl. the `(graphless)` fallback pinned unreachable for shipped tools.
M-series 28/28; find/brief/stats/awareness/mcp-budget 49/49 unchanged.

### #34 — cancellation + malformed/batch frames — 1510d8e
Wrote S4/S7/batch RED first (3/3 red), then split `handle()` → `handle` (array/scalar dispatch) +
`handleMessage`. `notifications/cancelled` → `inflight.get(requestId)` → SIGKILL running child or mark
a queued job (never spawns), suppress reply, still release (I5). Non-object frame → `-32600`. Batch
array → minimal per-member fan-out (individual NDJSON lines, NOT array-collected — the T-34.3
adjudicated tradeoff; empty array → single `-32600`).
- **S4** cancellation-kills-child GREEN — trace `kill(cancel)`, NO reply for the id, ping answers, exit 0, no graph.json.
- **S7** malformed-and-batch GREEN — 42/"x"/null/[] each one `-32600`, following ping answers.
- batch fan-out GREEN — `[{ping id:9},{unknown id:10}]` → reply 9 + `-32602` 10; `[1,2]` → two `-32600`; notification member silent.
M7/M10 (notifications, parse-error) unchanged.

### #25 — refresh regenerates the sidecar trio — 4fc1548
New `scripts/lib/sidecars.mjs writeSidecars(absGraphPath, graph)` — THE one map-time writer. build-
report migrated to one call (byte-identical to the old inline block, asserted). refresh calls it after
its atomic write (`normalizeGraph(updated)` POST-write for consumer parity); write order graph →
hook-baseline (WS-D, untouched) → trio; reports `payload.sidecars`. similar-index rebuilt via the
CURRENT v2 capped builder when `meta.root` readable, else REMOVED (never silently stale) — **the #25/#26
interlock**: this rebuild is what re-freshes #26's dup-check pool source after a refresh (verified v2
via `SIMILAR_VERSION`, not hardcoded). ONE stat stamp shared by the trio; crash-window property holds.
- **S5** refresh-preserves-sidecars GREEN by MECHANISM — all three loaders non-null, brief/index-lite/similar stamps === `statSync(graph.json)` (not wall-clock).
- sidecars lib unit 7/7 — byte-identical migration; both similar-index branches (root readable→rebuilt, absent/gone→removed); one-stamp equality; crash-window→all loaders null; session-brief `preview()` sidecar path ≡ graph path after a refresh.
build-report/hook-sidecar/find-similar/dup-check/freshness 34/34 unchanged (migration proven byte-identical).

### #32 — reader concurrency (stage 2) — 2770840
Writer/reader split on the stage-1 machinery: readers capture writerTail (I2), await it, then acquire
one of `READER_CAP=3` global slots (FIFO waiters, I4); writers chain on the join of writerTail +
enqueue-time `readersInFlight` snapshot (I1+I3 conservative). Slot acquired only AFTER the I2 wait
(no cross-workspace deadlock). Aggressive "writers skip readers" stays REJECTED. `READER_CAP=1` =
rollback lever.
- **S6** reader-overlap GREEN — risk + hotspots: both `start` precede either `end` (children alive together, **I4**).
- cap test GREEN — 4 readers, peak concurrent ≤3 and ≥2 (**I4** enforced, real overlap).
- writer-barrier GREEN — [reader, writer, reader] → end(reader₁) ≤ start(writer) < start(reader₂) (**I2**+**I3**).
- **S2 re-verified GREEN** after this stage (the redesign's third verification).
Latency (evidence, not CI-asserted, @445 symbols): risk solo **152 ms**, hotspots solo **149 ms**,
the two concurrent **146 ms** ≈ max, vs ~301 ms sum — the #32 win.

### #33 — per-edit loop in-process — abdc3f3
**The #33/#28 interlock**: `detectRenames` lifted VERBATIM (WS-E #28 made it ambient-free for exactly
this) into new `scripts/lib/diff-core.mjs` — not re-fixed. `diffGraphs(before, after, {names,bIx?,aIx?})
→ {payload, code}`; diff.mjs is load → diffGraphs → emit (exit codes + bytes unchanged). MCP diff fast
path: before = fresh parse (NOT graph-cached — FIFO would evict the live graph); after = `cachedGraph`
(re-stat/reload); awaits after-workspace writerTail (I6); suppress-only inflight (cancel while awaiting
→ no reply); any throw → spawned diff.mjs fallback (errResult verbatim). stats: `receiptPayload()` in
lib/stats.mjs (one empty-note truth); MCP fast path mirrors brief, cachedGraph parity → bad graph falls
through to the spawn.
- **I6** GREEN — diff fast path awaits writerTail; cancel-during-diff-fast-path → NO reply, ping answers.
- diff parity GREEN — MCP text === `diff.mjs --json` byte-for-byte (MD1/MD2/MD2b).
- stats parity GREEN — MCP text === `stats.mjs --json` (empty + non-empty ledgers); missing-graph errResult identical to the spawn.
- **S2 adjusted (mechanical drift, noted)**: #33 moved diff in-process so there is no `start(diff)`
  child event; S2 now asserts ordering by the DETERMINISTIC post-refresh payload (the edit's node
  appears — impossible without the I6 wait) + end(refresh) fired + NO child spawned. Refresh is now the
  loop's only child.
Latency (evidence): diff answers in-process in the ms class (session init+brief+diff wall **102 ms**
@445; the diff itself sub-ms warm); stats spawns no child.

### Closing — WS-F
Six commits: 4f664e0 (#29) · 69eddce (#30+#31) · 1510d8e (#34) · 4fc1548 (#25) · 2770840 (#32) ·
abdc3f3 (#33). Each carries a CHANGELOG entry + a `node site/build.mjs` docs rebuild in the same
commit; `check-consistency: OK — v0.9.0, 27 tools`. S1–S7 all GREEN; invariants I1–I7 each carry an
assertion (I1 S3, I2 S2/writer-barrier, I3 writer-barrier, I4 S6/cap, I5 map-settle-once unit, I6
diff-fast-path/cancel, I7 autoRefresh-skip). No new cycle: `lib/diff-core.mjs` is a leaf (imported by
diff.mjs + mcp-server.mjs; imports only graph-ops/shingles/skeleton/cli — nothing imports it back).
SOURCE_DATE_EPOCH byte-identity preserved for every sidecar writer (build-report migration asserted
byte-identical). Never-weaken: every touched pre-existing test stayed green untouched; new tests are
path-portable with ZERO new skips. ONE full `npm test`: **752 tests, 747 pass, 0 fail, 5 skipped**
(the same pre-existing env skips), wall **~72 s**, `git status --porcelain` empty. push -u + CI check
to follow.

### WS-F review+verification

Independent adversarial review completing an interrupted pass. Container: Node **v22.22.2**, 4 cores.
Method: scripted stdio client via `tests/mcp-harness.mjs` (long-lived server, TRACE + NO_AUTOREFRESH)
for the crash/queue/cancel/diff items, real `run.mjs`/`refresh.mjs`/`find-similar.mjs`/`diff.mjs`
children for the sidecar + byte-parity items, and a direct import of the exported `queueKeyFor` for the
key mechanism. The builder's S1–S7/I1–I7 closing lists were spot-checked, not trusted. **All seven
findings HELD; no counterexample, no fix needed.** Per-finding: **#29 held · #30 held · #31 held ·
#34 held · #25 held (closes WS-E #26) · #32 held · #33 held.**

The five load-bearing reproductions (all GREEN):

1. **#29 EPIPE survival — HELD.** `find_similar` with a **1 MB `body`** and `graph:/no/such/dir/nope.json`
   (child dies on the bad graph before draining stdin): the request is **ANSWERED** as an isError result
   (`graph not found … build it first`), a subsequent **ping ANSWERS** (server ALIVE — the exact crash
   the finding exists for), and stdin-close exits **0**. The guard is `child.stdin.on('error',…)` before
   `child.stdin.end()` wrapped in try/catch (mcp-server.mjs:388–392); the SERVER's stdout EPIPE stays
   covered by the INHERITED `lib/cli.mjs:19` handler (no masking dup).
2. **#25 sidecars → closes WS-E #26 — HELD (mechanism, not timing).** After a real map, all three sidecars
   (`brief.json`/`index-lite.json`/`similar-index.json`) carry `stamp == statSync(graph.json)`
   `{graphMtimeMs, graphSize}`. After an on-disk edit + `codeweb_refresh` (graph stat moved
   1361→1568 B): the trio **re-stamps to the NEW graph**, the fresh `similar-index` **contains the new
   node** (content refreshed, not just the stamp), `refresh --json` reports `sidecars:['brief','index-
   lite','similar-index']`, and **`hook-baseline.json` (WS-D) coexists** with the trio. Critically,
   `find_similar` reports **`index:sidecar` BOTH pre- AND post-refresh** — the WS-E reviewer's required
   close of the #26 gap (pre-#25 a refresh stranded stale sidecars → live fallback) holds by mechanism.
   dup-check's pool reads the same `loadSimilarIndex` sidecar (lib/dup-check.mjs recOf), so it is fresh too.
3. **#33 diff byte-parity + no cycle — HELD.** MCP in-process `codeweb_diff` result text **=== `diff.mjs
   --json` stdout byte-for-byte** on two real before/after pairs: an add-a-function pair (**375/375 B**)
   and a **rename pair** that trips `detectRenames` (renamed `helper→helperRenamed` sim 1.0; **425/425 B**).
   `lib/diff-core.mjs` is a **leaf**: imported by exactly `diff.mjs` + `mcp-server.mjs`, and its four deps
   (graph-ops/shingles/skeleton/cli) do **not** import it back — **+0 cycle**, gate confirmed.
4. **#30 refresh→diff ordering + #34 cancellation — HELD (scripted, not code-reading).** `queueKeyFor`
   normalizes `refresh` (dir of graph), `diff` (dir of `after` via `queueFrom`), `map` (`out`), and
   `annotate` (dirFromGraph) to the **one workspace dir** — the collision #30 needs; the `(graphless)`
   fallback is **unreachable** for shipped tools. Behaviorally: refresh+diff in ONE burst → the diff
   payload contains the edit's node (read POST-refresh bytes — the **I6** writer-tail wait), `end(refresh)`
   fired, and **no child spawned for the diff** (#33 in-process). Cancellation: a started `codeweb_map` +
   `notifications/cancelled{requestId}` → **`kill` trace reason:`cancel`**, a following **ping answers**,
   drain **exits 0**, and **NO reply** for the cancelled id (suppressed). Importing `queueKeyFor` did not
   start a server — independently exercising the isMain guard below.
5. **Never-weaken audit — HELD.** `git diff a5657c6..98edd32` touches **only NEW test files**
   (mcp-harness/scenarios/inprocess/queue + sidecars.test); every pre-existing suite (mcp.test,
   mcp-budget, hook-sidecar, efficiency-pilot, find/brief/stats/awareness) is **byte-identical, 0-line
   diff** across the whole WS-F range. No pre-existing assertion weakened, none skipped.

**Prior reviewer's real find (98edd32 — not re-done here, CI already green):** the Windows main-guard
`resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))` (both sides `resolve()`d — the
proven session-brief.mjs idiom) so the server reliably starts on Windows; plus S6 reader-overlap/I4-cap
determinism via a **writer-barrier** (one refresh both readers capture releases them in a single promise
resolution — overlap deterministic under stdin-chunk/enqueue jitter, reproduced under a CPU hog) and a
fail-fast scenario-exit race. That commit's suite (752/747) is unchanged here.

ONE full `npm test` on the review head: **752 tests, 747 pass, 0 fail, 5 skipped** (pre-existing env
skips), wall **~75 s** (node duration_ms 75245), `git status --porcelain` **empty**. CI on 98edd32 green
(`codeweb gate` + `ci` both success, run 29956777910/29956777979 — the 7 legs). Review adds no source or
test change — only this ledger entry; committed with the trailer. CI on the review head confirmed post-push.

## WS-G

Report & editor — the performance/UX workstream (#36 #38 #37 #35). Build order per the frozen spec:
#36 (slim embed) → #38 (editor lens BFS) → #37 (draw loop, so #35's sim is measurable without draw
noise) → #35 (expand-all sim, research risk + receipt re-run — last). File-disjoint from A–F except
`bench/results/`. Standing invariant re-verified after #36 and #35: `report.html` byte-identical
across two rebuilds. Corpus: `writeLoadedCorpus("/tmp/cw16k",{files:800})` (17604 nodes / 104143
edges) → `run.mjs`; the sim numbers below are the node lab (`bench/experiments/report-sim-lab.mjs`,
spec-sanctioned primary evidence) with a headless-Chromium fixture run validating the schema end-to-end.

### #36 — slim report.html embed — 6fa2afe
The embed carried four per-node fields (`t3,signature,complexity,maxDepth`) + per-edge `kind` that
`report-template.html` never reads (grep-verified: node `kind` read at :248/:269/:424/:427, `o.kind`
is OVERLAP kind, edge `kind` + the four node fields unread). Stripped into FRESH objects (graph never
mutated → graph.json + sidecars keep every field). Dead `domSummary` (:228) deleted.
- `stat -c%s report.html` at 16.8k: **14,559,374 → 10,455,685 B (−28.2%)**, ~4.1 MB of
  t3/signature/complexity/maxDepth/kind. DEVIATION noted: measured 28.2% not ≥40%, corpus-bound.
  [REVIEWER CORRECTION — the original text here claimed "the loaded corpus is the regex tier — short
  fns, no `t3`"; that is FACTUALLY WRONG and inconsistent with the 14.56 MB pre-strip byte count
  above (regex-tier, sans t3, would be ~13.3 MB). The loaded corpus IS AST-tier here (web-tree-sitter
  present): graph.json carries `t3` on 13,403/17,604 nodes (avg 7.5 stmt-hashes ≈ 1.2 MB). The 4.1 MB
  stripped = ~1.2 MB t3 + ~2.9 MB signature/complexity/maxDepth/edge-kind. The <40% is because these
  short planted-clone fns carry SMALL t3 (the ≥40% target assumed statement-heavy fns where t3
  dominates) — NOT because t3 is absent. Reviewer-reproduced on codeweb's own scripts/ (avg t3 len 18,
  max 158): embed strip 32.8% — larger t3 → larger strip, as expected. See ### WS-G review below.]
- Two independent rebuilds byte-IDENTICAL (10,455,685 B). Test parses the `graph-data` payload: no
  embedded node has the four keys, no embedded edge has `kind`, node `kind` survives, graph.json keeps all.

### #38 — lens pointer-queue BFS + persistent memo + activation — 666347c
`blastOf` used `queue.shift()` (O(frontier²)) + `[...callIn,...inheritIn]` per visit; rewritten to
`impactCountOf`'s shape (index-pointer queue, direct Set iteration) — numbers IDENTICAL (hub blast
17600 = 17600). `buildLensIndex(graph, prevIndex)` carries memo entries ∉ forward-closure of the
call/inherit edge delta's `to` seeds; `refresh()` stopped clearing the cache; `activationEvents`
`onStartupFinished` → `workspaceContains:**/.codeweb/graph.json` + onCommand fallbacks.
- `lens-bench.mjs /tmp/cw16k-ws/graph.json`: worst file cold **492ms**, warm **0.23ms**; per-file COLD
  p50 **0.34ms**, 81% of files <40ms. Hub files (mean blast 2262, MAX 17600 = whole graph) 100–460ms
  cold — the synthetic corpus is pathologically connected; per-node BFS is O(Σblast). DEVIATION: <40ms
  holds for typical files + always warm, not the densest hub files at 16.8k (frozen spec chose
  dependency-free per-node BFS over the SCC blastAll). old shift() vs new on the max hub walk: 29.5→23.3ms.
- Property test: 250 randomized edge+NODE mutations → carried === cold for every id; counting test:
  untouched id keeps poisoned sentinel, affected dropped. Scale-doubling budget 2N/N ~2× (linear).

### #37 — draw loop — 1597be8
`cvColors()` hoisted to one call/draw (was one per labeled node, ≤16.8k/draw). Edges batch into ≤432
exact style buckets `state|pair|min(weight,72)` — 50k-edge property test: bucket style === old
per-edge style BYTE-EXACT; one `beginPath`+`stroke`/bucket (was 104143/draw). Labels: screen-space
gate `nd.r*cam.k>7.5` + per-frame cap 300, priority-ranked (bubbles>hl>screen-r>id), position-
independent (proven: moving all x/y → same pick). `refreshHits` stores hitIds/hitDomains, gDraw
reuses (no per-frame AN rescan — source-guarded). `drawOnce()` probe + root-sandbox launch fix.
- Fixture browser run: `drawOnceMs 0.9`, expandAll green, 0 pageErrors. report.html byte-identical ×2.

### #35 — expand-all sim — 18423d8 (T-35.1 lab) + f845dc3 — FALLBACK
Four-part fix IN ORDER: far-field monopole (per-cell mass + COM, non-adjacent push, 2×CUT latch at
C>4096) + golden-spiral hatch (SP=38, K_FAR=0.8, lands WITH the monopole) + chunkable `gStepChunk`
(cursor on sim, forces across slices, ONE integrate+decay/step, bitwise-equal budget=∞ vs 2ms —
pinned) + reduced-motion discrete stills (`_settleDraws`, `fpsProbe`). T-35.6: `expandAll` rewritten
from the unstable 10-frame sample to run-to-settle `{settledMsPerFrame, maxSingleStepMs, totalSettleMs,
steps}`; `report-scale.mjs` gates both; `report-scale.json` rewritten (fixture browser + 16.8k lab
rows, honest verdict, "GREEN no fix needed" retired); bench-test pins + report-at-scale.md thresholds
updated. `scale-typescript.json:35` LEFT to WS-E (no TS checkout — NOTE only, per spec ground-truth).

**PRIMARY-vs-FALLBACK: FALLBACK, honest floor.** Sim lab settledMsPerFrame / maxSingleStepMs (8ms budget):
- **1k** (1000n): **3.65ms** / 40.4ms — primary MET (≤50)
- **5k** (5000n): **45.6ms** / 20.3ms — primary MET (≤50)
- **16.8k** (17604n): **269.45ms** / **93.06ms** — settled is the documented FLOOR (>50; the far field
  is O(n·cells), ≤50ms needs a hierarchical Barnes-Hut tree, out of frozen scope); maxSingleStepMs
  93ms ≤ 250 no-freeze floor MET (was 774ms as one unsliced task, or ~1.2s pre-#35 explosion).
Baseline (hatch seed) reproduced: 250ms/step, first 1225ms, 1.5M-px span → monopole+spiral compacts to
229k px, no explosion. fps: 8ms frame budget ⇒ sustained ~60fps between slices (browser fpsProbe added;
16.8k browser probe hung on the 10MB load + 15s expandAll — flaky at scale; fixture run green). Layout
bitwise-deterministic (seeded, no Math.random, insertion-order). NOT faked, NOT wedged.

### Suite + determinism
`report.html` byte-determinism (build-report.test.mjs:55) green after #36 AND #35 (re-verified: two
16.8k rebuilds identical, 10,468,305 B). Sim determinism pinned in report-sim.test.mjs. ONE full
`npm test`: **769 tests, 764 pass, 0 fail, 5 skipped** (pre-existing env skips; report-scale-bench L1/L2
ran locally as playwright was `npm i --no-save`'d — they SKIP in CI, no NEW skips), wall **77s**,
`git status --porcelain` empty. Shas: #36 6fa2afe · #38 666347c · #37 1597be8 · #35 18423d8+f845dc3.

### CI red→green (post-push)
First push (57815dc): 6/7 CI jobs green; `test-no-ast` (regex-only leg) showed 1 fail — **NOT a WS-G
test**. The CI log's single `not ok` was **#420 `S6 reader-overlap: two readers released together by
a writer barrier → both start before either ends (I4)`** (`tests/mcp-scenarios.test.mjs`, WS-F's
file — file-disjoint from WS-G), error `both readers ended · 1 !== 2 · expected 2 actual 1`: a
timing-sensitive MCP concurrency overlap assertion. It PASSED in all three AST legs (ubuntu-22/24,
windows) that same run, and reproducing the no-AST condition locally (`mv node_modules/web-tree-sitter`
aside → `npm test`, ±playwright) passed 0-fail twice — confirming a FLAKE, not a regex-tier defect. All
WS-G tests passed no-AST in that very log (T-37 buckets #600–601, labelPick #602–604, report-sim
#609–612, lens-core #745–748, extension #750). WS-G touches no MCP file, so the fix is a re-run, not a
source change. Empty re-trigger (8b15fed) → **run 29965060233: all 7 jobs green** (consistency, gate,
bench, test-no-ast, test ubuntu-22/24, test windows-22). WS-G tests are engine-agnostic (synthetic
fixtures, never the AST tier), so no skip-guard or fixture change was needed or made.


### WS-G review+verification

Adversarial build-review + usage-verification of #36/#38/#37/#35 + the S6 flake (reviewer: Fable). Each
finding reproduced from source; the #35 fallback audited for honesty, not for reaching the primary.

**#35 expand-all — FALLBACK, HONEST (verified).** The gate `expandAllOk` (report-scale.mjs:167) ANDs
`settledMsPerFrame ≤ 50 && maxSingleStepMs ≤ 250`, so the 16.8k row is `expandAllOk:false, green:false`
with an explicit `expandAllFallback` note + `greenNote` — the settled floor is NOT disguised as a pass.
And no CI gate keys on it: `bench/all.mjs --gate` gates `budgets.json` (not report-scale.json), and
report-scale-bench.test.mjs pins only field types (and SKIPs without playwright) — so the honest
`green:false` blocks nothing; the fallback's acceptance rests on `maxSingleStepMs ≤ 250`, which holds.
Reviewer re-ran the node lab ×4 at 16.8k (`--domains 20 --per-domain 840 --sp 38 --budget 8`):
settledMsPerFrame **273–302** (the receipt's 269 is honest, my box runs a hair slower), maxSingleTaskMs
**56–184** — every run ≤ 250, the no-freeze floor is robust (worst 184 ≪ 250). firstStep 363–536 ms.
Determinism: **zero `Math.random` in the entire template**; physics is a pure function of positions
(node-array + grid-Map insertion order), `performance.now()` gates only slice boundaries, never
arithmetic (T-35.4 bitwise budget=∞ vs 2 ms — test-pinned). Monopole + spiral land TOGETHER in f845dc3
(the sole physics commit — spiral never ships alone, the ordering gate holds by construction). Metric
rewrite + report-scale.json refresh + report-scale-bench.test.mjs pin update are all atomic in f845dc3.
- REVIEWER FIXES: (1) report-scale.json 16.8k `expandAll.nodes/edges` 17604/104143 → **16800/91883** (the
  lab's actual synthetic — every field in that block is the lab's, not the report's; note clarified).
  (2) See #36 below.

**#36 embed strip — verified; a factual error in the evidence CORRECTED.** Real 16.8k report rebuilt:
report.html **14,572,009 → 10,468,320 B (−28.2%)** — reproduces the builder's number. Embed strip is
COMPLETE (parsed `graph-data`: **0/17604** nodes leak t3/signature/complexity/maxDepth, **0/104143**
edges leak kind; embed keys = the template read-set exactly). graph.json on disk keeps everything
(signature/complexity/maxDepth ×17604, **t3 ×13403**, edge kind ×104143). Two rebuilds **byte-identical**
(same sha256). The builder's claim "the loaded corpus is the regex tier — no t3" is FALSE and
inconsistent with its own 14.56 MB pre-strip count (regex-tier sans t3 ≈ 13.3 MB): the corpus IS
AST-tier here, t3 present on 13403 nodes (avg 7.5 stmt-hashes ≈ 1.2 MB); the 4.1 MB stripped = t3 (1.2)
+ signature/complexity/maxDepth/kind (2.9). The <40% is small-t3 (short planted-clone fns), not absent
t3. Reviewer built codeweb's own `scripts/` (AST, avg t3 len 18, max 158): embed strip **32.8%** — bigger
t3 → bigger strip, exactly finding (b)'s expectation. Corrected the wording in this doc + CHANGELOG.

**#38 lens — verified.** `blastOf` is the index-pointer walk (source-guard test: no `.shift()`, no
`[...callIn,...inheritIn]` spread-merge). 250-mutation memo property (carry === cold for every id) +
counting test (poison sentinel 999 survives on untouched ids, dropped on affected) — green. Activation
`workspaceContains:**/.codeweb/graph.json` + onCommand, **no onStartupFinished**; `refresh()` stops
clearing the cache, `loadIndex` passes prevIndex. lens-bench at 16.8k: index build 61 ms, worst hub file
cold 407 ms / warm 0.10 ms — the DISCLOSED deviation (<40 ms holds for typical files, p50 0.34 ms, +
always-warm; per-node BFS is the frozen-spec choice). NOT an algorithmic regression — same numbers,
faster walk on deep radii; lens-core stays dependency-free.

**#37 draw — verified.** Edge buckets are EXACT: the 50k-edge property test reconstructs the pre-#37
per-edge formula as an oracle and asserts `stroke`/`width` **byte-identical** past both saturation points
(w=29 alpha, w=72 width), ≤432 buckets, dim/tangle/norm disjoint — lossless, integer-weight. `cvColors()`
hoisted to one call/draw (source-guard). `labelPick` cap 300, priority-ranked, position-INDEPENDENT
(moving all x/y → identical pick). `refreshHits` stores hitIds/hitDomains; gDraw reuses them (source-guard:
no per-frame `AN.forEach` rescan). 25/25 WS-G unit tests green.

**S6 — a REAL residual race; HARDENED (evidence below).** Replies are read off **stdout** (rlOut), the
CODEWEB_MCP_TRACE start/end lines off **stderr** (rlErr) — two pipes with no cross-stream ordering
guarantee. `mcp-server.mjs` writes `trace('end')` (stderr) then the reply (stdout) in `finish()`, but the
harness parses the pipes independently, so `await h.reply(id)` does NOT prove the reader's `end` NDJSON
line has been parsed — exactly the CI flake `both readers ended · 1 !== 2`. The writer-barrier (98edd32)
hardened the START overlap (both `start` before either `end` in EXECUTION), but left this END-VISIBILITY
race in the trace snapshot. FIX: await the boundary trace events on the stderr stream before snapshotting
`h.trace()` — additive, matches the harness's existing `traceEvent` idiom (S4/cancel-diff already do
this). Applied to S6 + the I4-cap sibling + the four other snapshot sites sharing the pattern (S2, S3, I7,
writer-barrier), so the whole scenario suite is deterministic against the race. Evidence: the reader-
overlap family (S6 + I4-cap + writer-barrier) run **20× in a loop = 60/60 pass, 0 fail**, and the fix is
deterministic by construction (the cross-stream dependency is removed). tests/mcp-scenarios.test.mjs is
WS-F's file, but the mandate authorizes the S6 hardening; changes are await-only, no assertion weakened.

**Standard sweep.** Never-weaken (6aa43d4..677e48f): test changes additive; the report-scale gate change
is the spec-sanctioned T-35.6 schema swap (old `simMsPerFrame ≤ 16` straddle-metric → `settledMsPerFrame
≤ 50` + added `maxSingleStepMs ≤ 250` + `drawOnceMs ≤ 100` — net STRONGER); removed template code is the
dead `domSummary` + the old synchronous gStep (→ chunked gStepChunk with the far field), the `d2||0.01`
guard preserved. CHANGELOG on 4/5 commits (the T-35.1 lab commit pairs with f845dc3's #35 entry). No new
import cycle (lens-core dependency-free; no new scripts/ imports; ci-gate confirms).

**Suite.** ONE full `npm test` after the S6 hardening: **769 tests, 764 pass, 0 fail, 5 skipped** (the
playwright report-scale-bench skips — CI-matching), wall **77 s**, `git status --porcelain` clean (only
the five review-touched files). Reader-overlap family looped 20× (60/60). Identical to the builder's
counts, now with the trace-visibility awaits.

**Usage.** Built the real 16.8k report (17604/104143, report.html 10,468,320 B). Headless Chromium (root,
chromiumSandbox:false): graph interactive **118 ms**, first layout settled **131 ms**, 0 pageErrors on
load (5k report: 133/145 ms). The browser expand-all settle-poll does not converge at 16.8k/5k (the
documented harness limitation the receipt already notes), so the authoritative sim numbers are the node
lab (above) + the committed fixture browser row (expandAll green, maxSingleStepMs 1.2 ms) — no frame >
250 ms at any scale measured.

## WS-H

Builder evidence for findings **#40 (extract-symbols decomposition, staged always-green) → #18b
(in-process post-edit hook)** (spec `round2-ws-h.md`, frozen). This is the FINAL workstream — the
tracked residual of round-1 #25, now actually closed. Commits: T-40.1 `52254c5`, T-40.2 `c7c8983`,
T-40.3 `d2132a2`, T-40.4 `173a119`, T-40.5 `247134d`, T-18b `851c0f2`. All extractor changes are
**output-preserving** — the KILL CRITERION never triggered (byte-identity held on the first attempt
at every stage).

**Rebase gate — free-variable audit RE-DERIVED against HEAD (319b0ae), not the spec-time table.**
`deriveFileEdges`'s free identifiers programmatically re-audited against the CURRENT engine (post
WS-B/C/D). Result vs the spec's 7-row table: **two lib-local pure imports the spec-time table
predates** — `parseSignature` (lang-rules; the #10 param-shadow sig scan) and `buildInnermostIndex`
(enclosing; the #21 index, built function-local per WS-D's own note) — plus **two NEW ctx fields
from B/C/D drift**: `roleFor` (the #10 T-10.3 ref role-gate, post-C) and `closureLocalIds` (the
WS-D-review closure-local magnet fix, post-D). Final ctx = `{ byName, pkgOf, roleFor,
resolveFileMember, closureLocalIds, legacyFallback }`; lib imports = `KEYWORDS, parseSignature`
(lang-rules), `isTestFile` (graph-ops), `buildInnermostIndex` (enclosing); `idFile` defined in
edge-derive.mjs and imported back. #17's `cand` collection + return field moved WITH the body; #19
interning and #17 delta/dirty-label stayed orchestration (verified free-of-reach-back).

**P1 — frozen-tree self-map byte-cmp (`SOURCE_DATE_EPOCH=1753056000`, out/cache OUTSIDE the frozen
tree).** Baseline `base.json` captured at pre-WS-H HEAD (1372 symbols, 4443 edges, 994,185 B).
`cmp base.json cand.json` **silent (byte-identical) after every stage** — T-40.1, T-40.2, T-40.3 —
cold AND warm (warm run2 == `--full`). Final at `851c0f2`: `cmp base.json final.json` **silent** —
the entire decomposition + in-process hook produces bit-identical extractor output over the whole
codeweb repo (all languages, ctags+tree-sitter engine).

**P2 — IE-EQUIVALENCE at 40 trials (`CODEWEB_IE_TRIALS=40`).** After T-40.1: default leg **47/47**,
kill-switch leg (`CODEWEB_NAME_DELTA=0`) **47/47**, fragment byte-equal every step. After T-40.4
(now in-process) + T-18b: **48/48** (47 + IE-INPROC-PARITY), both legs. The WS-C `rulesSig` conjunct
and WS-D kill-switch are preserved verbatim (kill-switch wholesale assertion unchanged).

**#40 build (always-green, per-stage commit):**
- **T-40.1** `createEdgeDeriver(ctx)` → new leaf `scripts/lib/edge-derive.mjs` (import-resolve's
  factory template; only rename in the moved body: `LEGACY_FALLBACK`→`legacyFallback`). Orchestrator
  −259/+12 lines. `tests/edge-derive.test.mjs` (11 in-process seam cases, no spawn). Acyclic:
  edge-derive imports only node:path-only siblings.
- **T-40.2** `markPublicApi` (pub-API entry walk, now fs-free — orchestrator injects `readPkg` +
  statted `sources`, applies the returned ids-to-stamp; order-safe, the walk never reads `pub`) +
  `resolveTypedIntents` (Java/C# typed dispatch) joined edge-derive.mjs, clearing #40's named
  shadowing smells (`rel` loop-var vs `rel()`; `files` local vs global). +5 seam cases.
- **T-40.3** `export async runExtract(opts)` + `main()` + the repo's `import.meta.url` guard idiom.
  Import is SIDE-EFFECT-FREE: SE-IMPORT-CLEAN (empty cwd stays empty, no argv/exit/writes),
  IE-TWO-RUNS + IE-TWO-RUNS-CONCURRENT (each fragment byte-equals a fresh CLI run), RE-ERRORS
  (guard paths throw `ExtractError`, never `process.exit` — only `main()` exits). WASM engines are
  process-wide survivors memoizing the load PROMISE (single-flight); per-run flags drive the banner.
- **T-40.4** starter trio in-process: `incremental-edges` (the IE property sweep — its own wall
  **12,939 → 2,851 ms** at 40 trials = **4.54×**; full-file 15.5 → 3.6 s = 4.3×), `call-apply-chain`,
  `test-edges`. **DEVIATION**: the spec's ≥5× estimate — measured **4.3–4.5×**; the floor is now
  genuine per-extract `rg` file-enumeration + IO (node-boot-per-child + per-child WASM init
  eliminated; a `CODEWEB_ENGINE=regex` run is the same wall, so WASM is NOT the floor). Recorded for
  reviewer adjudication (same posture as WS-D #19/#21).
- **T-40.5** family batch (18 files): import/edge-precision family + language-extraction widening +
  `maskjs-regex-literals` (margin).

**P3 — spawn accounting (extractor-invoking subset, the plan-§H bar).** Pre-H HEAD subset = **80**
(`grep -rhoE "runNode\(EXTRACT|runNode\(script\('extract-symbols|runNodeAsync\(…"`); after T-40.5 =
**58** → **22 sites retired ≥ 20 bar** (cleared with margin). Total `runNode(` 314 → 293.
Non-extractor spawns (`query.mjs`, `context-pack.mjs`) untouched; `cli-front-door` + `empty-target`
never converted (CLI-surface owners). One retained extractor spawn is deliberate: IE-INPROC-PARITY
(pins the CLI surface byte-for-byte). **Dynamic** (strace, `execve` of extract-symbols during
`incremental-edges`): **116 → 1** extractor node-child launches at 10 trials (≈382 → 1 at 40-trial
CI depth).

**#18b — in-process post-edit hook (T-18b), CONDITIONAL gate MET.** IE-INPROC-PARITY holds:
S18b-PARITY proves `additionalContext` byte-identical across the in-process path and
`CODEWEB_HOOK_INPROC=0` (forced spawn) on the regression fixture; the extractor-level IE-INPROC-PARITY
proves the fragment == CLI stdout. The hook lazily `import()`s `runExtract` AFTER the findTarget guard
(inert fires pay nothing) and reuses runExtract's own #17 warm-cache name-delta machinery — zero
splice logic in the hook. **Perf (16.8k `writeLoadedCorpus({files:800})`, median-of-5, this box)**:
no-change fire **in-process 698 ms** vs **forced-spawn 1,089 ms** on the same corpus (the #18a row is
889 ms, sha `a140fdf`) — **< 700 ms floor MET**; strace: **0 extractor child processes in-process vs
1 spawned** (the child-boundary term — node boot + fragment stringify/parse — provably eliminated,
~391 ms median Δ). `hookInprocFallbacks` observed during the hook suite = **0** (no divergence).
Rollback lever `CODEWEB_HOOK_INPROC=0` + one-shot spawn fallback + fallback counter all in place.
`hook-fastpath-floor.md`'s "> 1.5 s → in-process extraction" revisit trigger is now consumed.

**Reviewer-scrutiny items:** (1) T-40.4's IE wall drop is **4.3–4.5×**, below the spec's ≥5× estimate
— the residual is genuine per-extract `rg` enumeration + IO (the spawn/boot overhead IS gone;
WASM verified not the floor), analogous to WS-D's #19 size / #21 AST-ratio estimate-vs-measurement
deviations. (2) `markPublicApi`'s `readPkg(dir)` returns the parsed object|null (spec wrote
"string|null") — a faithful reading of "the lib does no fs"; the orchestrator owns the
readFileSync+JSON.parse. (3) The unindented `runExtract` body (no re-indent) was a deliberate
byte-safety choice: no lint gate in CI, no multi-line template literals in the body (scanned), so
wrapping without re-indentation guarantees byte-identity and keeps the diff reviewable (the moved
lines show as unchanged context). (4) #18b in-process 698 ms sits right at the 700 ms floor — the
honest number is recorded; the child-boundary elimination (gate i) is the load-bearing, provable
term. (5) The engine load-failure stderr is now deduped per-run via a `_failLogged` set (untested
path — engines load fine on every gate box) instead of the old per-`===undefined` gate; astLoadFailed
(the fragment-affecting flag) is per-run and P1-covered.

### WS-H review+verification

Adversarial build-review + usage-verification of #40 (extract-symbols decomposition) + #18b (in-process
hook), the FINAL round-2 workstream (reviewer: Fable). Every claim reproduced from source; the whole
ballgame is byte-identity of the foundation file. **VERDICT: PASS — no structural problem found, no
assertion weakened, no code fix needed (this entry is the only change).**

**Self-map byte-cmp — IDENTICAL (the load-bearing test).** Froze ONE 249-file source tree
(`SOURCE_DATE_EPOCH=1753056000`), ran the FULL pipeline at 319b0ae (pre-WS-H) and 6fb49ff against it
(`--out-dir` outside the tree). Banners character-identical (1390 symbols / 4469 edges / 1603 dropped /
3 dispatch). `cmp` byte-identical (generatedAt included): **fragment.json, graph.json, report.md,
report.html, overlap.md, optimize.md**. The 4 mtime-stamped sidecars (index-lite/brief/similar-index/
hook-baseline) differ ONLY in the embedded graph.json `graphMtimeMs`/`"m"` wall-clock stamp (the two
maps ran ~5 s apart) — content-identical once normalized, and the graph content hash `b0d41d7b…` +
size 1029278 match (the "mod generatedAt" carve-out, not structural). P1 direct `extract --out` also
byte-identical. The decomposition changes NOTHING observable.

**IE-EQUIVALENCE @ 40, both legs.** default **48/48** (IE-EQUIVALENCE 40/40), kill-switch
`CODEWEB_NAME_DELTA=0` **48/48** (40/40). No flake at the full floor.

**ctx-completeness + leaf.** Free-identifier audit of edge-derive.mjs: every name resolves to one of
5 pure imports (KEYWORDS/parseSignature/isTestFile/buildInnermostIndex/importCandidates), local
`idFile`, the 6 ctx fields (byName/pkgOf/roleFor/resolveFileMember/closureLocalIds/legacyFallback), or
a function param/local — **zero reach-back** into orchestrator scope (the one bare `nodes` is comment
prose). #17 `cand` moved with the body (local, returned sorted); #19 interning + #17 delta stayed
orchestration (no reference in the lib). Call-site (:902) provides exactly the 6 destructured fields.
**Leaf:** only extract-symbols imports edge-derive; its 4 imported libs are node:path-only (no
back-edge) — **+0 cycle** confirmed by reading.

**Main-guard side-effect-free.** run-extract.test.mjs 4/4 (SE-IMPORT-CLEAN + IE-TWO-RUNS +
…-CONCURRENT + RE-ERRORS). Independent probe: `import()` under adversarial argv (`--out
SHOULD_NOT_EXIST.json --engine bogus`) fired no main(), wrote no file, exposed runExtract. `runExtract`
throws ExtractError; only main() exits.

**22 conversions honest.** Extractor-invoking spawn sites **80 → 58 = exactly 22 retired** (≥20 bar,
occurrence-level, no double-counting); 23 sites converted − 1 deliberate CLI-pin spawn added in
run-extract.test.mjs; incremental-edges keeps 1 (IE-INPROC-PARITY). Spot-checked call-apply-chain,
class-usage-ref, signature, python-imports, extract-rust: genuinely in-process (import runExtract, 0
extractor spawns), and the ONLY dropped assertion is the spawn `status===0` boilerplate — content
assertions identical. 10 converted files (51 tests) green on **regex + tree-sitter + default** tiers
(no AST assumption introduced).

**#18b parity + perf.** Hook suite (post-edit-diff + hook-sidecar + cache-unification) 20/20;
S18b-PARITY proves additionalContext byte-identical in-process vs `CODEWEB_HOOK_INPROC=0`. Independent
perf (median-of-5, 16.8k `writeLoadedCorpus({files:800})`, this box): no-change fire **in-process 681
ms vs forced-spawn 1067 ms, Δ386 ms** — **< 700 ms floor MET** (method: `node post-edit-diff.mjs` with
a no-change PostToolUse payload on stdin, hrtime end-to-end, mapped once to warm the cache). Fallback
counter verified: a forced in-process failure (`CODEWEB_ENGINE=bogus` → runExtract throws) bumps
`hookInprocFallbacks:1`, hook fail-open exit 0. hook-fastpath-floor.md closure honest (my 681/1067
reproduces its 698/1089 within box noise; `>1.5 s` trigger legitimately consumed, next trigger set).

**Never-weaken (319b0ae..6fb49ff).** Kill-switch assertion VERBATIM (`assert.equal(ec2.edged,
ec2.total, 'a changed symbol set forces a full re-edge (correctness over speed)')`); 14 `deepEqual`
correctness gates intact; the 3 byte-gates moved `assert.ok(Buffer.equals(--out files))` →
`assert.equal(fragment bytes)` (identical strictness, same messages); rulesSig conjunct (:918) + WS-D
`CODEWEB_NAME_DELTA==='0'` (:799) present; CHANGELOG + docs/changelog.html landed with every commit.

**Usage.** Full `run.mjs` map on the real repo end-to-end via runExtract (1390 symbols, all 5 stages,
9 artifacts). Real post-edit hook, fired as hooks.json does: no-change → null; forced edge-derive↔
graph-ops cycle → correctly flagged, in-process (`hookInprocFallbacks` 0). Full `npm test`
(CODEWEB_IE_TRIALS=40): **817 pass / 0 fail / 5 env-skips**, 69 s, porcelain clean. CI `ci` #167 =
success at 6fb49ff (pre-push).

Shas reviewed: 52254c5 · c7c8983 · d2132a2 · 173a119 · 247134d · 851c0f2 · 6fb49ff.

## Finding #39 (late-added)

**REFACTOR · cli — the last hand-rolled flag loops routed through `parseArgs`.** #24 put ONE
unknown-flag policy in lib/cli.mjs (`parseArgs(argv, spec)`: unknown → `die(2)` with usage; `--help`
→ usage, exit 0; never a silent positional). Six scripts still hand-rolled their own loop. **All six
converted** (none was already done — query.mjs / site/build.mjs #5 were the pre-existing exemplars I
matched): `explain.mjs`, `diff.mjs`, `brief.mjs`, `coverage.mjs`, `stats.mjs`,
`scripts/bench-ts-engine.mjs`. Each keeps its `{ json: {type:'bool'} }` spec (bench-ts-engine:
`{ out: {type:'string'} }` + optional target positional); accepted flags/positionals/`--help`
preserved exactly. Dead `die` import dropped from brief/stats (loop was its only use); `parseArgs`
added to the existing `./lib/cli.mjs` import in 5 scripts (**+0 module edge, +0 cycle**), and a fresh
`./lib/cli.mjs` import in bench-ts-engine (leaf CLI — nothing imports it, so **+0 cycle** too).

**The live bug (explain.mjs, diff.mjs).** Their loops had NO else-branch —
`for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); }`
— so an unknown flag was neither a value nor a positional: silently dropped.

**Failing → passing (measured, fixture graph, one resolvable symbol).**

| invocation | before | after |
|---|---|---|
| `explain.mjs g.json alpha --jsno` | exit **0** (typo ignored) | exit **2** `unknown flag: --jsno` + usage |
| `diff.mjs g.json g.json --nope` | exit **0** (typo ignored) | exit **2** `unknown flag: --nope` + usage |
| `bench-ts-engine.mjs --engine tree-sitter` | exit **1** `target not found: --engine` (swallowed to target) | exit **2** unknown flag + usage |
| `brief/coverage/stats … --nope` | exit 2 (bare usage, no diagnostic) | exit 2 `unknown flag: --nope` + usage |
| `explain --json` / `diff --json` / all six `--help` | exit 0 | exit 0 (unchanged) |

**Test.** `tests/cli-unknown-flags.test.mjs` (7 tests, zero skips). Against the unconverted tree it
was **5 fail / 2 pass** (the 2 passing = the legit `--json`+positional smokes, proving the conversion
never touched the accepted surface); after conversion **7/7**. Full `npm test`: **799 tests, 794
pass, 0 fail, 5 env-skips** (pre-existing optional-dep gates — #39 adds none), ~70 s, porcelain clean.

Sha: **fd4a560** (`refactor(cli): route the last hand-rolled flag loops through parseArgs — finding #39`).
