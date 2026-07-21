# Round-2 WS-A spec — gates & delivery (findings #2 #3 #4 #5 #6 #7, closer #1)

Process/bar: `docs/specs/round2-plan.md` (§Per-finding process, §A bar). Build order below = landing order; #1's closer lands last (it documents the others). Evidence → `round2-evidence.md` per task. Workflows are not unit-testable: their "failing test first" is a text-invariant test (`tests/workflows.test.mjs`, RED before the YAML edit) plus scripted verification commands; behavior proof is the first real Actions run on the PR.

## Finding #2 — release path runs zero tests, unpinned vsce

**T-2.1 — `test` job + `needs: test` + workflow-invariant tests.** Files: `.github/workflows/release.yml`, new `tests/workflows.test.mjs`.
Approach: add a `test` job before `publish`: `actions/checkout@v4` → `actions/setup-node@v4` (node-version '22', `cache: 'npm'`) → `npm ci` → `npm test` → `node scripts/check-consistency.mjs`. `publish` gains `needs: test` (bench stays PR-CI-only; runtime cost, budgets already gate merges). Both triggers (tag push, dispatch) flow through `test` since it's an ordinary job in the same workflow.
TDD: `tests/workflows.test.mjs` first (RED) — reads the three workflow files as text and asserts: release.yml matches `/^\s*needs:\s*test\s*$/m`, contains a job step running `npm test` and `check-consistency`; plus T-2.2/T-2.3/T-3.4 invariants below. Text-level on purpose: pins exactly the regression class #1 documented (gates silently dropped).
Success: workflows.test.mjs green; on the PR, Actions parses release.yml (no "workflow file issue" banner). Risk: none to publish semantics — a failing suite now blocks a release (intended). Rollback: remove `needs:` line.

**T-2.2 — dispatch ancestor guard.** Files: `release.yml`.
Approach: publish job's checkout gains `fetch-depth: 0` (merge-base needs history). New step between "Verify version matches package.json" and "Create tag (dispatch only)", `if: github.event_name == 'workflow_dispatch'`:
`git fetch origin main && git merge-base --is-ancestor HEAD origin/main || { echo "::error::dispatched ref is not on main"; exit 1; }` (a commit is its own ancestor, so dispatching main's tip passes).
TDD: invariant in workflows.test.mjs: `/merge-base --is-ancestor HEAD origin\/main/`. Success: assertion green; guard sits before tag creation (grep order check in the test: is-ancestor index < "Create tag"). Risk: fetch-depth 0 slows checkout ~seconds. Rollback: delete step.

**T-2.3 — pin vsce.** Files: `release.yml` (:117, :139).
Approach: `@vscode/vsce@latest` → `@vscode/vsce@3.9.2` in both `npx --yes` calls. 3.9.2 = current latest stable (verified `npm view @vscode/vsce version` 2026-07-21; repo never pinned before — always `@latest`). Comment the pin: "exact pin — bump deliberately".
TDD: invariant: release.yml matches `/@vscode\/vsce@3\.9\.2/` twice and contains no `vsce@latest`. Success: both call sites pinned. Risk: 3.9.2 breakage with this extension is possible → verify once locally: `cd editor/vscode-codeweb && npx --yes @vscode/vsce@3.9.2 package --no-dependencies --out /tmp/x.vsix` exits 0 (record in evidence). Rollback: bump pin.

## Finding #3 — CI single-OS/Node, AST tier can silently un-test itself, gate runs regex-only

**T-3.1 — matrix + npm cache + honest engines.** Files: `ci.yml`, `package.json`.
Approach: `test` job gets `strategy: matrix: { os: [ubuntu-latest, windows-latest], node: ['22', '24'], exclude: [{os: windows-latest, node: '24'}] }` (3 jobs); `runs-on: ${{ matrix.os }}`, `node-version: ${{ matrix.node }}`, `cache: 'npm'` (package-lock.json exists). Add `cache: 'npm'` to bench/consistency/release setup-node steps too. `package.json` engines `>=20` → `>=22` (its own comment admits Node 20's `npm test` glob is broken; matrix never tests 20 — stop claiming it). Windows job's value is path semantics (the D:/ golden tests stay skipped even there — they key on `CODEWEB_GOLDEN_TARGET` presence, not the OS).
TDD: workflows.test.mjs asserts `strategy:`/`matrix:` present in ci.yml and `cache: 'npm'` in all four setup-node blocks; engines assertion in `tests/release-tooling.test.mjs` (`engines.node === '>=22'`). Success: 3 matrix jobs green on the PR. Risk: windows may surface real path bugs — out of WS-A scope; if a pre-existing failure appears, set that cell `continue-on-error: true` + file it as a finding, don't fix engine code here. Rollback: collapse matrix to ubuntu/22.

**T-3.2 — AST-install probe + skip ceiling.** Files: `ci.yml`.
Approach: after `npm ci`, step `node -e "await import('web-tree-sitter')"` — an optionalDependency install hiccup now fails the job instead of green-skipping the AST tier (28 guards). Then run tests with a ceiling (`shell: bash` so it works on windows): `set -o pipefail; npm test 2>&1 | tee "$RUNNER_TEMP/test.log"; S=$(awk '/^# skipped/{n=$3} END{print n+0}' "$RUNNER_TEMP/test.log"); [ "$S" -le 6 ] || { echo "::error::$S skips (ceiling 6)"; exit 1; }`. Ceiling 6 = today's true 5 (3 golden-target, 1 bench TS_MODULE, 1 inverse fallback) + 1 headroom; the tier-wide failure mode adds ~28 and trips it.
TDD: workflows.test.mjs asserts `web-tree-sitter` probe and `# skipped` handling exist. Success: matrix jobs report skipped ≤ 6; deleting node_modules/web-tree-sitter locally and re-running the ceiling command exits 1 (evidence). Risk: node --test emits TAP on non-TTY (CI) — verified locally via `npm test 2>&1 | cat`; if a future reporter change drops the `# skipped` line, `n+0` fails ceiling-open (S=0) — acceptable, probe still guards the real failure. Rollback: drop ceiling step.

**T-3.3 — regex-fallback coverage job.** Files: `ci.yml`.
Approach: the fallback-equivalence test (`tests/extract-engine.test.mjs:53`) skips whenever the engine is installed — i.e. always in CI. NOTE: the audit's proposed `CODEWEB_ENGINE=regex` job cannot un-skip it (the skip keys on the child's actual engine availability and the test passes explicit `--engine` flags, which beat the env default). Honest fix: add job `test-no-ast` (ubuntu, node 22): `npm ci --omit=optional` → `npm test` → assert the fallback test ran: `grep -E "^ok .*graceful fallback" "$RUNNER_TEMP/test.log"`. This also finally tests the shipped claim "CI without npm install keeps working" (whole regex tier green stand-alone). No skip ceiling here (the ~28 AST skips are the point).
TDD: workflows.test.mjs asserts a job runs `--omit=optional` and greps "graceful fallback". Success: job green, grep hits. Risk: low. Rollback: delete job.

**T-3.4 — codeweb-gate installs deps.** Files: `codeweb-gate.yml`.
Approach: insert `- run: npm ci` (+ `cache: 'npm'` on its setup-node) before the `ci-gate.mjs` step — the structural self-gate currently analyzes every PR regex-only, blind to AST-dispatch regressions in `scripts/**`.
TDD: workflows.test.mjs asserts codeweb-gate.yml contains `npm ci`. Success: gate run's banner on the next PR records the tree-sitter engine (evidence: Actions log line). Risk: +~20 s per gated PR. Rollback: remove step.

## Finding #4 — consistency gate skips package.json ("24 MCP tools" vs 27 shipped)

**T-4.1 — scan + sync sub + regression tests.** Files: `scripts/release-utils.mjs`, `tests/release-tooling.test.mjs`.
Approach: in `checkConsistency` (after the PROSE_FILES loop, ~:176): `problems.push(...scanProseCounts(JSON.parse(readText(join(root,'package.json'))).description || '', 'package.json (description)', { toolCount: count, langCount }))` — description-only, not raw JSON (keywords/scripts can't false-positive; existing `toolRe` already matches "24 MCP tools"). In `syncTargets`, append `{ file: 'package.json', subs: [[/(\d+)(\s+MCP tools)/, '${count}$2']] }` (count interpolated; no version sub — package.json version is the source, bumped by release.mjs) — so the next version roll self-heals this class.
TDD (RED first): extend the drifted-fixture round-trip test — fixture package.json gains `description: 'engine with 15 MCP tools'`; assert `before.problems` matches `/package\.json.*15 MCP tools/` and `applySync` + recheck goes ok (15→3, the stub's count). Plus a `scanProseCounts` line for the exact live string: `('… 24 MCP tools for coding agents', 'package.json', {toolCount: 27, …})` → 1 problem.
Success (plan bar): planted package.json drift fails `check-consistency`; round-trip repairs it. Risk: none; scan is read-only. Rollback: remove the two additions.

**T-4.2 — correct the live drift 24→27.** Files: `package.json:5`.
Approach: description "24 MCP tools" → "27 MCP tools". Sequenced immediately after T-4.1: landing the scan turns the existing real-repo tests (`the real repo is consistent`, `check-consistency CLI exits 0`) RED on the live drift — the gate catching, in-repo, the exact drift it was built for; this edit turns them GREEN. Record both states in evidence.
Success: `node scripts/check-consistency.mjs` exits 0; `npm test` green. Risk: none. Rollback: n/a (factual correction).

## Finding #5 — `npm test` mutates tracked docs/; committed changelog.html stale

**T-5.1 — `--out` flag + re-point tests.** Files: `site/build.mjs`, `tests/site-build.test.mjs`.
Approach: build.mjs adopts the repo flag loop (`import { parseArgs } from '../scripts/lib/cli.mjs'` — the #24 policy: unknown flags die): `out: { type: 'string' }`; `const DOCS = flags.out ? resolve(flags.out) : join(ROOT, 'docs')`; `ASSETS = join(DOCS,'assets')` unchanged relative to DOCS. `injectDemoNav` already no-ops when `DOCS/demo` is absent (temp dirs). Banner prints the real dir but keeps the literal `built N page(s)` (a test matches it). Tests: module-level `const OUT = tmpDir('codeweb-site-')`, every `runNode(BUILD)` → `runNode(BUILD, ['--out', OUT])`, `DOCS` reads → `OUT`, `after(() => cleanup(OUT))` (`import { after } from 'node:test'`). Determinism test builds twice into OUT. Default-path (no flag → docs/) stays covered by ci.yml's Build site step + T-5.2's clean-tree assert — no test may write tracked docs/ anymore.
TDD (RED first): new test "`--out` redirects the whole build": build into tmp, assert 5 pages exist there — fails today (flag ignored; also today's builder would reject nothing). Then implement, then re-point the existing 7.
Success (plan bar): clean tree → `npm test` → `git status --porcelain` empty. Risk: `--out` used with a relative path in CI — resolve() handles; lib/cli.mjs import from site/ crosses dirs (already precedented by release-utils import). Rollback: default path unchanged, flag additive.

**T-5.2 — CI freshness gate.** Files: `ci.yml` (consistency job).
Approach: after "Build site": `- name: Committed site is fresh` → `git diff --exit-code -- docs && test -z "$(git status --porcelain -- docs)"` (second clause catches untracked new outputs). Known annual rot: the footer year comes from build time — a January rebuild-and-commit is expected; note this in the step comment.
TDD: workflows.test.mjs asserts the step exists. Success: job fails on a stale docs/ (verified locally pre-T-5.3: run builder, `git diff --exit-code -- docs` exits 1 today — that IS the planted drift). Risk: none. Rollback: remove step.

**T-5.3 — rebuild + commit the stale page.** Files: `docs/` (changelog.html + any drifted siblings).
Approach: `node site/build.mjs`; commit the diff. Verified stale now: docs/changelog.html lacks the CHANGELOG `### Removed` (finding-28) section HEAD carries.
Success: `git diff -- docs` empty after build; published Pages changelog == CHANGELOG.md content. Order: must land in the same PR as T-5.2 or the freshness gate fails the PR. Risk: none.

## Finding #6 — one 60 s sequential property test floors the suite

**T-6.1 — async spawn helper.** Files: `tests/helpers.mjs`.
Approach: export `runNodeAsync(scriptPath, args, {env, cwd})` — `child_process.execFile` wrapped in a promise, same contract as `runNode` (resolves `{status, stdout, stderr}`, never rejects; `status` from `error.code ?? 1` on failure; `maxBuffer: 1 << 28`). Measured basis for the design: node:test runs top-level `test()`s in one file SEQUENTIALLY (4×400 ms slept 1.8 s), and `{concurrency}` subtests overlap only when bodies yield — spawnSync bodies serialized even under concurrency 4 (1.98 s) while async bodies overlapped (0.58 s). So the audit's "per-trial test()s run concurrently" shape is rejected: concurrency requires subtests + async spawn.
TDD (RED first): unit test in a tests file: `runNodeAsync` on `node -e "process.exit(3)"`-style script returns status 3 + captured stderr; two awaited-in-parallel calls overlap (wall < sum, sleep-script).
Success: helper green; no behavior change elsewhere. Risk: none (additive).

**T-6.2 — IE-EQUIVALENCE → concurrent per-trial subtests + trial-count env.** Files: `tests/incremental-edges.test.mjs`.
Approach: `const TRIALS = Number(process.env.CODEWEB_IE_TRIALS || (process.env.CI ? 40 : 10));` (CI=40 — unchanged CI depth per plan bar; local default 10). Parent `test('IE-EQUIVALENCE …', { concurrency: 4 }, async (t) => { await Promise.all(range(TRIALS).map((trial) => t.test(\`trial ${trial}\`, async () => {…}))); })`. Trial body identical mutation logic, but `extract`/`coldFull` become awaited `runNodeAsync` versions (local async wrappers in this file; the three other IE tests stay sync/top-level). Seeding: one shared `prng(2025)` stream is order-dependent → per-trial `const rng = prng(2025 + trial)` so trials are independent, deterministic per index, and concurrency-safe. Fixture *bytes* change; the semantics class (40 random 2–6-step mutation sequences, warm ≡ cold assert per step) does not — state this in the test header comment.
TDD: property test is its own oracle — RED step is running the restructured file once with `CODEWEB_IE_TRIALS=2` to prove plumbing, then full depth. Verification commands (evidence): `time CODEWEB_IE_TRIALS=40 node --test tests/incremental-edges.test.mjs` before (~60 s) vs after (~18–25 s expected at 4 cores); TAP shows 40 `trial N` subtests passed; `time npm test` wall ≤ ~55 s (plan bar; next-longest file is 13.3 s).
Success: bar met, zero skips/fails, IE-COLD-PARITY/INCREMENTALITY/DANGLING untouched. Risk: 4-way child extracts × runner file-parallelism oversubscribes 4 cores — mild; cap stays 4 (tune to 3 if suite jitters). Rollback: `CODEWEB_IE_TRIALS` + concurrency 1 reproduces old serial behavior.

## Finding #7 — docs drift trio

**T-7.1 — `--engine` validated; README corrected.** Files: `scripts/extract-symbols.mjs` (~:66), `README.md:497`, `tests/extract-engine.test.mjs`.
Approach: after the `opts` assembly: `if (opts.engine && !['regex','tree-sitter','ts'].includes(opts.engine)) { console.error(\`[extract] unknown --engine "${opts.engine}" (valid: regex, tree-sitter)\`); process.exit(2); }` — exit 2 = the #24 arg policy; catches `CODEWEB_ENGINE` garbage too (env feeds the same parseArgs default — loud beats silently-enabling-AST, which is what `read` does today). README:497: "(or with `--engine read`)" → "(or when the deterministic engine is skipped entirely)" — no flag named; real values are documented at the USAGE string (`regex|tree-sitter`).
TDD (RED first): new test beside the engine tests: `--engine read` → status 2, stderr matches `/unknown --engine .*valid: regex, tree-sitter/`; `--engine regex` still 0. README grep in evidence: `grep -n '\-\-engine read' README.md` → empty.
Success: test green; no `--engine read` mention anywhere (`grep -rn 'engine read' README.md docs/ .claude/`). Risk: someone's env exports CODEWEB_ENGINE=<typo> → extract now exits 2 with a message instead of silently running AST — intended; changelog-noted. Rollback: drop the guard.

**T-7.2 — release-tag SKILL numbers.** Files: `.claude/skills/release-tag/SKILL.md:33`.
Approach: "`npm test` passes locally (expect ~400 tests; skips are fine — they're tree-sitter-absence tests)" → "`npm test` passes locally (~590 tests; up to ~5 environment skips are fine — golden-target-absence, optional typescript, engine-fallback inverse)". Approximate on purpose (counts grow); the CI skip ceiling (T-3.2) is the enforced version.
TDD: grep assertion in evidence (`grep -c '~400' SKILL.md` → 0). Success: numbers match `npm test` reality (589 today). Risk: none.

**T-7.3 — release.mjs fails on its own failed audit.** Files: `scripts/release.mjs` (:55-57).
Approach: after printing the audit line: `if (!audit.ok) process.exit(1);` (prep files already written — exit 1 signals "do not commit", matching the printed problems).
TDD: not unit-testable in place (`ROOT` derives from the script's own path → always the real repo). Scripted verification instead (evidence): copy the repo to scratch (`git archive HEAD | tar -x -C $SCRATCH` + `cp package-lock.json`), plant a prose drift in the copy (README "26 MCP tools"), run `node $SCRATCH/scripts/release.mjs --patch` → exits 1 and prints the problem; clean copy → exits 0. Success: both observed. Risk: none. Rollback: remove line.

## Finding #1 — closer (lands last)

**T-1.1 — amend the round-1 claim; per-finding entries; honest closer.** Files: `CHANGELOG.md`.
Approach: (a) Add under `[Unreleased]` a `### Changed` correction bullet: commit `bfc6b92` ("all 32 findings") did not land findings 29–32 (release gate, test split, CI matrix/skip guards, consistency-gate coverage) — CHANGELOG documented 1–28 only; they ship in this round as findings #2/#6/#3/#4. (b) Every WS-A task above appends its entry as it lands (texts below) — so `rollChangelog` can never roll an empty claim over shipped work. (c) The audited "closer that diffs CHANGELOG claims against `git show --name-only`" is NOT built: infeasible honestly — changelog prose ↔ file-set mapping isn't machine-checkable without inventing structure, and CI checkouts are shallow (`fetch-depth: 1` — historical shas unavailable) while packed installs exclude `.git` entirely. The honest closer = (a)+(b) plus the self-catching gate: T-4.1's package.json scan + its regression test in `tests/release-tooling.test.mjs` — the surface where round-1's drop was publicly visible now fails the build by itself.
Success: CHANGELOG carries the correction + one entry per landed finding (`grep -c 'round 2, finding #' CHANGELOG.md` ≥ 7); T-4.1's tests green. Risk: none.

## CHANGELOG entries (added per task, `(perf-quality round 2, finding #N)` suffix)

- **#2** Fixed: releases are gated — tag/dispatch publishing now `needs:` the full suite + consistency check; dispatched refs must be ancestors of main; vsce pinned to 3.9.2.
- **#3** Changed: CI matrix (ubuntu/windows × node 22/24, npm cache), post-install AST probe + skip ceiling ≤6, a no-optional-deps job exercising the regex fallback, `npm ci` in the self-gate; engines honestly `>=22`.
- **#4** Fixed: consistency gate scans package.json's description; version-sync repairs it; live "24 MCP tools" corrected to 27.
- **#5** Fixed: `site/build.mjs --out`; tests build into temp dirs (`npm test` no longer rewrites tracked docs/); CI asserts docs/ freshness; stale committed changelog.html rebuilt.
- **#6** Changed: IE-EQUIVALENCE runs its trials as concurrent subtests (`CODEWEB_IE_TRIALS`, 40 CI / 10 local); suite wall ~93 s → ≤ ~55 s, semantics unchanged at CI depth.
- **#7** Fixed: unknown `--engine` exits 2 (README's nonexistent `--engine read` removed); release-tag SKILL test counts corrected; release.mjs exits 1 on a failed audit.
- **#1** Changed: the round-1 claim correction (T-1.1a text).

## Shared files with other workstreams (coordinate — WS-A lands first, others rebase on it)

- **package.json** — HOT: #3 (engines) + #4 (description) here; later workstreams may touch scripts/optionalDependencies. Land A's edits in separate small commits to keep rebases trivial.
- **CHANGELOG.md** — HOT: every workstream appends per finding (plan constraint). Append-only under `[Unreleased]`, one bullet per finding, to keep merges conflict-light.
- **tests/helpers.mjs** — `runNodeAsync` (T-6.1) is additive; B/C/D also edit this file — no signature changes to existing helpers.
- **docs/** — regenerated by T-5.3 and by any future `site/build.mjs` run; after T-5.2 a stale docs/ fails CI, so any workstream touching CHANGELOG.md/site data must rebuild docs/ in the same PR.
- **.github/workflows/** and `tests/workflows.test.mjs` — WS-A-only this round; `tests/incremental-edges.test.mjs` is also cited by D (#17 IE byte-identity proofs rely on it) — D consumes, does not edit, the split shape.
