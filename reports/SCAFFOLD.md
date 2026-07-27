# SCAFFOLD — the goal-prompts harness: audited, ratified, installed

2026-07-26
All Build Goal Prompts · stage 1/4 · brief 141

Brief 141 installs the goal-prompts golden-path harness and proves the gate bites. This report
now records the full arc in one file: the Phase 1–2 readiness audit ran first and gate-stopped
(nothing installed, operator not present); the operator then answered the gate — **"Do
everything"** — and Phase 3 executed the ratified plan the same day. The audit that the
operator ratified is preserved verbatim below the install record, because its lens tables and
exact lines are what ADR-0001 cites.

## Install executed — 2026-07-26, operator go: "Do everything"

**What was installed** — commits `670d678` (scaffold) and `b77ce7d` (packaging):

- The 15-file graft, clobbering nothing: `scripts/check`, `scripts/spec_lint.py`,
  `scripts/hook-check`, `scripts/hook-protect`, `.githooks/pre-commit`,
  `.claude/settings.json`, `.github/workflows/check.yml`, `.github/CODEOWNERS`,
  `tests/__init__.py`, `tests/harness/{__init__.py,test_harness.py}`, `SPEC.md` (skeleton;
  142 fills it), `DECISIONS.md` (ADR-0001 filled), `evals/{run.py,cases/example-upper.json}`.
- The ratified rewrites, recorded as ADR-0001 deviations: **(a)** the 5-step gate — spec lint,
  harness tests, `npm test`, `node scripts/check-consistency.mjs`, evals; **(b)** PROTECTED
  narrowed to the explicit harness manifest in `hook-protect` and CODEOWNERS (file entries
  match exactly — prefix matching would have caught `scripts/check-consistency.mjs`);
  **(c)** npm `files` negations for the four harness scripts; **(d)** Python 3 as dev tooling
  only; **(e)** — discovered by the harness's own first bite, see proof 3 —
  `.githooks/pre-commit` unsets `GIT_INDEX_FILE`/`GIT_DIR`/`GIT_WORK_TREE`.
- Landing spots as ruled: the template contract verbatim at `docs/harness.md`; `CLAUDE.md`
  points to it; both charter-silent rulings mirrored into `CHARTER.md` Open questions;
  `.gitignore` gains `__pycache__/`; `git config core.hooksPath .githooks` set.
- `package-shape.test.mjs` P1 learned negation semantics (a negated path must exist), and P2
  pins the four harness files as absent from the tarball (verified: 117 files, zero harness).

**Harness proof — green, then red, then a real catch:**

1. **Green** — `sh scripts/check`, verbatim tail:
   ```
   == 4/5 consistency ==
   check-consistency: OK — v0.12.0, 27 tools, all surfaces aligned.
   == 5/5 evals ==
   ok    example-upper
   evals: all 1 case(s) passed
   ALL CHECKS PASSED
   ```
   (step 3/5 product tests: 918 tests, 870 pass, 0 fail, 48 environment skips.)
2. **Red** — delivered live through the real enforcement moment rather than the script's
   internal loop: a canary test was planted and the PostToolUse hook itself blocked with
   ```
   GATE RED — fix or revert before doing anything else:
   == 2/5 harness tests ==
   FAIL: test_canary_must_fail (tests.test_canary_prove_red.TestCanaryProveRed...)
   AssertionError: prove-red canary: the gate must catch this
   ```
   Canary reverted; gate back to `ALL CHECKS PASSED`. A gate that cannot fail is not a gate —
   this one fails.
3. **First real catch** — the pre-commit hook's very first run rejected the scaffold commit
   itself: git exports `GIT_INDEX_FILE`/`GIT_DIR` to hooks, which leaked into the suite's
   fixture-repo subprocesses and broke 11 git-spawning tests (ci-gate, history mining P1–P6,
   `trend --git`) that pass everywhere else. Fixed in the hook (deviation e), not in the
   tests. The same run also caught a broken `files` entry pattern in P1 after the negation
   edit. Two genuine blocks in the first hour: the rails bite.

**Operator TODOs — after the go:**

- [x] Answer the gate question — answered "Do everything" (install as planned)
- [x] Ratify the gate lines, PROTECTED/CODEOWNERS manifest, npm `files` exclusions — ratified
      via the go; installed exactly as specified below (evals step retained per the plan's own
      copy-justification, recorded in ADR-0001a)
- [x] Rule the ADR boundary — root `DECISIONS.md` = harness + dependency ADRs;
      `docs/decisions/` = design history (mirrored into CHARTER.md)
- [x] Pick the contract landing spot — `docs/harness.md`; CLAUDE.md points to it
- [x] Replace `@OPERATOR` in CODEOWNERS — installed as `@GhostlyGawd`
- [ ] **Still yours, browser-only:** make the `check` workflow a required status check
      (branch protection) so red can never merge — steps in `OPERATOR-ACTIONS.md` §7

**Next:** 142 · Spec the Product writes the real, lint-clean `SPEC.md` at the root — running
in this same session under the now-live gate; then 143 (implement to spec) and 144 (the
adversarial ship gate re-run).

---

# The ratified plan — Phase 1–2 readiness audit (gate-stopped earlier the same day)

Brief 141 installs the goal-prompts golden-path harness and proves the gate bites. This run
executed Phase 1 (mandate + template) and Phase 2 (readiness audit) only; the operator was not
present to answer the Phase 2 gate, so **nothing was installed and no repo file changed except
this report**. The audit is complete; the install plan below is ready to execute on a go. First
run: no prior `SCAFFOLD.md` existed at the root or in `reports/`.

## Top findings, ranked

1. **Installed verbatim, the harness would lock agents out of the product.** The template's
   PreToolUse hook blocks every edit under `scripts/`, `.github/`, and `.claude/`
   (template `scripts/hook-protect:13`) — and in codeweb `scripts/` *is* the shipped product
   (`scripts/mcp-server.mjs` and ~40 sibling CLIs; 91 of the npm tarball's 116 files live
   there). The PROTECTED list must be narrowed to the harness manifest before install — a
   harness-layer rewrite the operator must ratify, recorded in ADR-0001.
2. **The graft is collision-clean.** All 15 files the graft would add are currently absent —
   `scripts/check`, `scripts/spec_lint.py`, `scripts/hook-check`, `scripts/hook-protect`,
   `.githooks/pre-commit`, `.claude/settings.json`, `.github/workflows/check.yml`,
   `.github/CODEOWNERS`, `tests/__init__.py`, `tests/harness/` (2 files), `SPEC.md`,
   `DECISIONS.md`, `evals/` (2 files) — and `core.hooksPath` is unset. "Clobbering nothing"
   holds file-for-file.
3. **The repo already clears the harness's mechanical bar but has zero local enforcement.**
   From a bare checkout with no dependencies: 918 tests, 870 pass, 0 fail, 48 environment
   skips, 62 s, working tree clean afterward. CI adds bench budgets and a consistency gate.
   But there is no pre-commit hook and no Claude Code hook in this repo — the graft's real
   value is the two local enforcement moments plus the SPEC/AC discipline and prove-red, at a
   measured cost of ~63 s per edit for the PostToolUse gate (hook timeout is 300 s).
4. **Harness files grafted into `scripts/` would ship to npm.** `package.json:39` puts
   `scripts` in the publish set (91 files in the v0.12.0 tarball). The four harness scripts
   need `files` negations (or another home) so shell/Python tooling never lands in the "zero
   deps, runs 100% locally" product package. Adjacent: a root `DECISIONS.md` would sit beside
   the existing ADR home `docs/decisions/` — the boundary needs an operator ruling, and
   `spec_lint.py` hardcodes the root path, so the file itself cannot move.
5. **The stack deviation is mandatory and nameable now.** The template default is Python 3
   stdlib + unittest; this is a zero-dependency Node repo. The gate must wire `npm test` and
   `node scripts/check-consistency.mjs` around the Python spec-lint/harness-test core, making
   Python 3 a dev-tooling requirement for contributors and CI (present here: 3.11.15) — never
   a product dependency, so the charter's zero-required-deps invariant (`CHARTER.md:47`)
   stays intact. ADR-0001 must record all of this.

## Phase 1 — mandate and template

**No verdict exists.** `VERDICT.md` is absent at the root and in `reports/` — both probes
returned `ls: cannot access ... No such file or directory`. The root holds CHANGELOG,
CHARTER, CLAUDE, CONTRIBUTING, LICENSE, OPERATOR-ACTIONS, README, SECURITY and no harness
files; `reports/` holds 21 audit reports, none of them a verdict.

**The mandate is the conductor dispatch.** The operator dispatched the "All Build Goal
Prompts" conductor playbook — briefs 141→144 run in sequence, each producing one report;
this run is stage 1/4, brief "141 · Scaffold the Rails". That is an explicit operator ask to
run this scaffold-readiness audit as part of the Build pipeline — not a hunch, and also not
an installation go: the conductor constrains the run to report-only, so installation approval
rests entirely on the operator's answer to the gate question at the end of this report. The
brief's null-report rule does not apply, because this dispatch is an operator ask.

**The template was located and read end to end.** Cloned
`https://github.com/GhostlyGawd/goal-prompts` at commit `984266d` (2026-07-26), MIT-licensed
(satisfying the charter's everything-local-is-free invariant). `template/` is a complete,
self-verifying scaffold of 21 files. Its README is the contract; the load-bearing clauses:

> "deterministic enforcement (hooks, CI, exit codes) beats executable artifacts (scripts,
> templates), which beat written instructions. … Everything load-bearing here is therefore a
> command that exits non-zero." (template/README.md:11–15)

> Graft mode: "copy only the harness layer plus the two skeletons, never overwriting an
> existing file: `scripts/`, `.githooks/`, `.claude/`, `.github/workflows/check.yml`,
> `.github/CODEOWNERS`, `tests/harness/` (with `tests/__init__.py`), `SPEC.md`,
> `DECISIONS.md`." Then, operator-ratified at this gate: "wire the repo's existing
> test/lint/build commands into `scripts/check` as one line each" and "replace the skeleton's
> example AC-1 `check:` with one of the repo's own test commands". (template/README.md:71–83)

> Deviating: "A product may deviate (different language, a framework) only by rewriting the
> harness layer to keep the same four enforcement moments and recording the deviation as an
> ADR in `DECISIONS.md`. The invariant is the contract above, not the language."
> (template/README.md:102–107)

The four enforcement moments: PostToolUse after every edit, pre-commit, CI on every
push/PR, and the brief-144 ship gate. `scripts/check --prove-red` plants a failing canary and
asserts the gate goes red — "A gate that cannot fail is not a gate" (template/scripts/check:13).

## Phase 2 — the six lenses

### 1. Mandate
Present, precisely scoped: an explicit operator dispatch to run this audit (quoted above); no
`VERDICT.md`; installation still needs the gate answer. Not a hunch, not yet a go.

### 2. Mechanical verifiability — strong, with receipts
- `npm test` (`node --test "tests/**/*.test.mjs"`, package.json:56): 145 test files ran here —
  918 tests, 870 pass, 0 fail, 48 skipped, 62 s, and `git status --porcelain` stayed empty.
  The 48 skips are the optional AST tier absent locally; CI installs it and holds skips to a
  counted ceiling of 8 (`.github/workflows/ci.yml:58–65`), with a no-AST leg proving the
  zero-dependency claim (`ci.yml:71–105`).
- Benchmarks are gated, not decorative: `npm run bench:all -- --gate` fails CI when
  `bench/budgets.json` budgets break (`ci.yml:111–122`).
- `node scripts/check-consistency.mjs` locks public copy to `package.json` and reads the
  identity line from `CHARTER.md` (charter Now §4, marked complete).
- Golden/gate tests exist (`tests/golden-ecc-scripts.test.mjs`, `tests/gate-verdict.test.mjs`).
Quality here is command-checkable to an unusual degree; this harness is the right tool class
for this repo. What the repo lacks is not verification but *local enforcement* (lens 4).

### 3. Mode — graft, collision-verified file by file
Mature codebase (v0.12.0, 27 MCP tools) → graft. Every file the graft adds, each verified
absent today:

| Graft would add | Current state |
|---|---|
| `scripts/check` | absent (`scripts/` has 40+ product `.mjs` files, no `check`) |
| `scripts/spec_lint.py` | absent (no `.py` anywhere in `scripts/`) |
| `scripts/hook-check`, `scripts/hook-protect` | absent |
| `.githooks/pre-commit` | absent — no `.githooks/` dir; `git config core.hooksPath` unset |
| `.claude/settings.json` | absent — `.claude/` holds only `skills/release-tag/SKILL.md` |
| `.github/workflows/check.yml` | absent — 7 other workflows, none named `check.yml` |
| `.github/CODEOWNERS` | absent (also absent at root) |
| `tests/__init__.py`, `tests/harness/{__init__.py,test_harness.py}` | absent — no `tests/harness/`, no `.py` under `tests/` |
| `SPEC.md`, `DECISIONS.md` (root) | absent |
| `evals/run.py`, `evals/cases/example-upper.json` | absent — no `evals/` dir; copied because `scripts/check` step 3/3 requires the runner (template/README.md:84 skips `evals/` only on collision) |

Skipped per the contract: `src/`, `tests/test_smoke.py` (Python-repo-only,
template/README.md:80–84), the template's `.gitignore`/`CLAUDE.md`/`README.md`. The two suites
cannot interfere: `npm test` globs only `*.test.mjs`; `unittest discover` sees only `.py`.
One contract tension to rule on: the template README "ships with every installation so the
rules travel with the code" (template/README.md:7–9), but in graft mode copying it would
clobber this repo's README — proposed landing spot: `docs/harness.md` (operator's pick).

### 4. Existing checks and the exact wiring (for ratification)
What runs today: `npm test` · `node scripts/check-consistency.mjs` ·
`npm run bench:all -- --gate` (CI) · `node site/build.mjs` + docs-freshness diff (CI) ·
`node scripts/ci-gate.mjs` structural self-review on `scripts/**` PRs
(`.github/workflows/codeweb-gate.yml`). There is no lint command — no eslint/prettier/biome
config exists; the copy-density and brand-sync tests inside `npm test` fill that role. Local
hooks: none (`hooks/` at the root is the *shipped product's* Claude Code hooks for user
repos, not this repo's own dev hooks — naming adjacency worth knowing).

Proposed `scripts/check` body — these exact lines are what the operator ratifies:

```
echo "== 1/4 spec lint ==";      python3 scripts/spec_lint.py
echo "== 2/4 harness tests ==";  python3 -m unittest discover -s tests -t . -q
echo "== 3/4 product tests ==";  npm test
echo "== 4/4 consistency ==";    node scripts/check-consistency.mjs
```

Deliberately *not* wired into the gate: `bench:all --gate` (load-sensitive budgets would flake
on a laptop hook; stays CI-only as today) and `site/build.mjs` + freshness check (writes
`docs/` — an every-edit gate must never dirty the tree; stays CI-only). Measured gate cost:
~63 s per edit (62 s suite + ~1 s Python steps), within the hook's 300 s timeout
(template/.claude/settings.json:21) but a real workflow tax the operator should accept
knowingly or trim later by operator hand.

### 5. Stack fit — the named deviations for ADR-0001
The keep: spec lint, harness tests, evals runner, hooks stay Python 3 stdlib + `/bin/sh`
exactly as shipped. The deviations to name in ADR-0001 ("Instantiated from the goal-prompts
golden-path template"):
- **(a) Node commands inside the gate** — steps 3–4 above; the four enforcement moments are
  preserved, which is the template's stated invariant.
- **(b) PROTECTED narrowed** — from directory prefixes (`scripts/`, `.github/`, `.claude/`)
  to the explicit harness manifest (the 4 harness scripts, `.githooks/`,
  `.github/workflows/check.yml`, `.github/CODEOWNERS`, `.claude/settings.json`,
  `tests/harness/`, `evals/run.py`), because those directories are product surface here
  (finding 1). Same narrowing in CODEOWNERS.
- **(c) npm publish exclusions** — `files` negations (e.g. `"!scripts/check"`,
  `"!scripts/spec_lint.py"`, `"!scripts/hook-check"`, `"!scripts/hook-protect"`) so the
  116-file tarball gains nothing (finding 4).
- **(d) Python 3 as dev tooling** — contributors and CI need `python3` (local: 3.11.15; the
  workflow pins 3.12); the product's zero-required-deps invariant is untouched because no
  runtime dependency is added and nothing Python ships. Also recorded: `spec_lint.py`'s
  dependency rule reads `requirements.txt` only (template/README.md:85–87), so `package.json`
  dependencies remain guarded by the existing review/gates, not the lint.
Charter cross-check: local, deterministic, telemetry-free, MIT — all invariants hold under
this plan. The charter is silent on dev-tooling language policy and on the two-ADR-homes
boundary; the gate answer below is the operator ruling on both, and the install commit should
mirror them into `CHARTER.md` Open questions per `CLAUDE.md` (this audit could not edit the
charter).

### 6. Operator duties — what only a human can do
Push/merge the scaffold branch; make `check` a required status check (branch protection is a
browser step — `.github/repo-settings.json` covers only description/homepage/topics, and
`OPERATOR-ACTIONS.md` is this repo's established ledger for exactly such moves); replace
`@OPERATOR` in CODEOWNERS with `@GhostlyGawd`; ratify the gate lines and narrowed PROTECTED
list above; rule the DECISIONS.md-vs-`docs/decisions/` boundary and the harness-contract
landing spot.

## What Phase 3 WOULD do on "install" (as ratified — executed above)

1. Copy the 15 files in the lens-3 table from template commit `984266d`, preserving
   executable bits (`tests/harness/test_harness.py:59` asserts `pre-commit` is executable);
   apply ratified rewrites (a)–(c) to `scripts/check`, `scripts/hook-protect`, CODEOWNERS,
   `package.json` `files`; replace `SPEC.md`'s example AC-1 `check:` with a repo command.
2. `git config core.hooksPath .githooks` (repo-local; note: per-clone — a fresh clone is
   unenforced at commit-time until re-run; CI backstops).
3. Prove green: `sh scripts/check` — spec lint OK, harness suite (12 tests: files present,
   hooks wired, protect blocks/allows correctly, spec-lint honesty), all 918 product tests,
   consistency OK. This demonstrates the whole existing suite now runs inside the gate.
4. Prove red: `sh scripts/check --prove-red` — plants `tests/test_canary_prove_red.py`,
   asserts the gate exits non-zero, cleans up, prints `PROVE-RED OK`. Works unmodified
   because step 2/4 keeps `unittest discover`. This demonstrates the gate can actually fail —
   a gate that cannot fail is not a gate.
5. Fill ADR-0001 with date, the mandate quote, and deviations (a)–(d); one commit:
   `scaffold: harness from goal-prompts template`. (The PR will itself trigger
   `codeweb-gate.yml`'s structural self-review, since it touches `scripts/**` — expected.)

## The gate question — answered

Asked: **install as planned** (the 15-file graft with ratified rewrites exactly as specified
above), **adjust**, or **abort**? The operator answered **"Do everything"** (2026-07-26) —
install as planned, plus fix every finding. Executed above; deviation (e) was added during
install when the pre-commit hook's first run caught the git-env leak, and the evals step was
retained in the gate per this plan's own lens-3 justification (both recorded in ADR-0001).
