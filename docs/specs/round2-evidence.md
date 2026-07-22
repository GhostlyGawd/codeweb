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
