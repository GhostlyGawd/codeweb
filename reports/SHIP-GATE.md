# SHIP-GATE — adversarial go/no-go (re-run after the harness install)

2026-07-27
All Build Goal Prompts · stage 4/4 · brief 144 (re-run; the first pass nulled)

**What changed since the last run:** everything. The 2026-07-26 pass was a one-paragraph null
— no `SPEC.md`, no gate, nothing to judge (preserved in git at commit `ed56d78`). Since then
the operator answered the 141 gate ("Do everything"), the harness was installed and proven
(commits `670d678`…`793149a`), 142 wrote the ratified root `SPEC.md` (7 built, pinned ACs),
and 143 logged its zero-open-AC session. This re-run judged that state adversarially,
verify-by-running. All sabotage was reverted; `git status --porcelain` is clean.

## Scorecard

| Lens | Result | Evidence (command-output tails) |
|---|---|---|
| 1 · The gate itself | **PASS** | Fresh `sh scripts/check`: `ALL CHECKS PASSED` (918 tests, 870 pass, 0 fail, 48 env skips; consistency OK; evals 2/2). `sh scripts/check --prove-red`: `PROVE-RED OK: the gate goes red when a test fails` |
| 2 · AC truth | **PASS 7/7** | Every `check:` run verbatim: AC-1 `npm test` → 870 pass/0 fail · AC-2 consistency → exit 0, "OK — v0.12.0, 27 tools" · AC-3 zero-deps probe → exit 0 · AC-4 prove-red → `PROVE-RED OK` · AC-5 `node --test tests/package-shape.test.mjs` → 2/2 · AC-6 four-bin `--help` loop → exit 0 · AC-7 `python3 evals/run.py` → "all 2 case(s) passed" |
| 3 · Test honesty | **PASS 3/3** | Sabotaged AC-2 (README "27 tools"→"26"): the live PostToolUse hook went red in ~5 s naming the lie (`README.md: says "26 tools" but 27 tools ship`), check exit 1; reverted → exit 0. Sabotaged AC-3 (injected `left-pad` runtime dep): pin red — "runtime dependencies must stay empty (charter invariant)", check exit 1; reverted → 0. Sabotaged AC-6 (`--help` → exit 2): caught by TWO independent layers — the ac_6 pin and the `cli-help` golden case — check exit 1; reverted → 0. No test survived sabotage. |
| 4 · Harness integrity | **PASS** | 13-file diff vs template `984266d`: 8 byte-identical (`spec_lint.py`, `hook-check`, `settings.json`, `test_harness.py`, both `__init__.py`, `evals/run.py`, `example-upper.json`); 5 differ and each maps to a recorded ADR-0001 deviation — `check`→(a), `hook-protect`→(b), `pre-commit`→(e), `check.yml`→(a), `CODEOWNERS`→(b). Zero unmapped drift. |
| 5 · Eval floor | **PASS** | `python3 evals/run.py`: `ok cli-help · ok example-upper · evals: all 2 case(s) passed` — the floor is "all cases pass"; it holds. |
| 6 · First dollar | **PASS** (doorway) | `.github/FUNDING.yml` → `github: [GhostlyGawd]` (repo Sponsor button; GitHub Sponsors handles checkout/VAT/receipts into the operator's account) · README:316 links github.com/sponsors/GhostlyGawd · the site support page carries the same doorway. Copy is C7-honest on all three surfaces: support + placement, no cost claims, nothing paywalled. Per SPEC: a stranger's actual card cannot be verified from here, and the spec claims nothing more. |

## The ruling

**SHIP.** Every bar came from `SPEC.md`, written before this run; none was adjusted to fit
the results. The gate is green and provably capable of red; all seven built ACs pass their
checks verbatim; three sabotages were each caught (one by two independent layers) and no test
survived; the harness layer carries zero drift beyond its five ADR-recorded deviations; the
eval floor holds; and the money path is wired end-to-end to an operator-controlled account
with charter-honest copy. The shipped local product is exactly what it claims to be. (Cutting
an actual release remains the operator's move via the release-tag process — this ruling says
the contract is met, not that a tag was pushed.)

## Blockers

None. Two named watch items, neither a blocker:

- **Branch protection is still open** (the one unchecked operator TODO, `OPERATOR-ACTIONS.md`
  §7): until `check` is a required status check, a red gate blocks agents at edit time,
  commits locally, and CI — but GitHub will not physically stop a merge over it.
- **Bench receipts run on main CI, not here** (`bench/corpus` is not clonable in this
  sandbox): the recall/token kill-criteria tripwires are enforced by `ci.yml`'s bench gate —
  watch them there.

## Watch after ship — the first Weekly Vitals checklist (from SPEC.md kill criteria)

- [ ] `sh scripts/check --prove-red` still prints `PROVE-RED OK` — a gate that cannot fail
      proves nothing; anything else halts feature work.
- [ ] The bench caller-recall receipt still clears the grep baseline (charter: 44%→74%), and
      `npm run bench:all -- --gate` stays green on main — two consecutive reds = stop
      shipping.
- [ ] `node scripts/check-consistency.mjs` green on main — claim drift ships nothing.
- [ ] MCP budget pins (`tests/mcp-budget.test.mjs`) green on main — answers staying small is
      the token half of the promise.
- [ ] The lens-core linear-scaling perf test (`#38`) flaked once under gate load this session
      (passed unchanged on re-run) — if it recurs, it is operator's-hand work (a load guard),
      never a silent skip.
