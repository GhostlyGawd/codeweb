# The verification harness — the golden-path contract

This file is the goal-prompts template's README, verbatim below the rule —
the contract "ships with every installation so the rules travel with the
code," and in graft mode it cannot land as the repo README (codeweb already
has one), so it lives here (ruled at the 141 gate, 2026-07-26; ADR-0001 in
`DECISIONS.md` records the codeweb-specific deviations a–d). Source:
GhostlyGawd/goal-prompts commit `984266d`, `template/README.md`.

---

# The golden-path template

This directory is a complete, self-verifying product repository. Brief
`141 · Scaffold the Rails` installs it into the repo the product actually
lives in — copied whole into an empty repo (greenfield), or grafted onto an
existing codebase without overwriting anything — wires the hooks, and proves
the gate bites. That repo is then ready for `142 · Spec the Product`. This
README is the template's spec; it ships with every installation so the rules
travel with the code.

**Design rule (the enforcement hierarchy):** deterministic enforcement
(hooks, CI, exit codes) beats executable artifacts (scripts, templates),
which beat written instructions. A capable-but-fallible agent can rationalize
past prose; it cannot rationalize past a failing exit code. Everything
load-bearing here is therefore a command that exits non-zero.

## Two layers

**The harness layer — operator-owned, agent-read-only:**

| Path | What it is |
|---|---|
| `scripts/check` | the one gate: spec lint → tests → evals. `--prove-red` plants a failing canary and asserts the gate goes red |
| `scripts/spec_lint.py` | deterministic spec linter: required sections, the AC grammar, built-ACs-have-tests, dependencies-have-ADRs |
| `scripts/hook-protect` | Claude Code PreToolUse hook — blocks any edit to the harness layer (exit 2) |
| `scripts/hook-check` | Claude Code PostToolUse hook — runs the gate after every file edit, blocks on red (exit 2) |
| `.claude/settings.json` | wires both hooks |
| `.githooks/pre-commit` | runs the gate before every commit (`git config core.hooksPath .githooks`) |
| `.github/workflows/check.yml` | CI runs the same gate on every push and PR |
| `.github/CODEOWNERS` | routes harness-layer changes to the operator |
| `tests/harness/` | tests of the harness itself: hooks wired, files present, spec lint honest |

**The product layer — the agent builds here:**
`src/` (code), `tests/` (product tests, outside `tests/harness/`), `evals/cases/`
(golden cases), `SPEC.md` (the contract), `DECISIONS.md` (append-only ADRs).

## The contract, mechanically enforced

- `SPEC.md` is the only source of work. Every acceptance criterion is one line
  in a grammar `spec_lint.py` parses:
  `- **AC-1** — <criterion> | check: ` `` `<command>` `` ` | status: next`
  (status: `next`, `built`, or `dropped`). An AC without a runnable check
  cannot be written — that is the product-selection constraint (only build
  what a machine can verify) turned into a parse error.
- Every `status: built` AC must have `ac_<n>` in a test name under `tests/` —
  claiming built without a pinning test is a lint failure, not a style issue.
- Zero dependencies by default. If `requirements.txt` gains a package, the
  lint fails unless `DECISIONS.md` names that package in an ADR.
- The gate runs at four moments, all deterministic: after every file edit
  (PostToolUse), before every commit (pre-commit), on every push (CI), and
  fresh at the ship gate (brief 144). Red blocks; nothing asks the agent's
  opinion.
- Edits to the harness layer are blocked at tool-call time (PreToolUse,
  exit 2). If the gate itself is wrong, the agent's move is to stop and
  report — the fix belongs to the operator.

## Installing (what 141 does)

**Greenfield — the repo is empty:**

```sh
cp -r template/. <repo-path> && cd <repo-path>
git init
git config core.hooksPath .githooks
sh scripts/check              # must be green on the pristine scaffold
sh scripts/check --prove-red  # must report PROVE-RED OK
git add -A && git commit -m "scaffold: harness from goal-prompts template"
```

**Graft — the repo already has code:** copy only the harness layer plus the
two skeletons, never overwriting an existing file: `scripts/`, `.githooks/`,
`.claude/`, `.github/workflows/check.yml`, `.github/CODEOWNERS`,
`tests/harness/` (with `tests/__init__.py`), `SPEC.md`, `DECISIONS.md`.
Then, with the operator's approval at 141's Phase 2 gate (these are
harness-layer lines, so an agent proposes and the operator ratifies):

- wire the repo's existing test/lint/build commands into `scripts/check`
  as one line each, so what already ran now runs inside the gate;
- replace the skeleton's example AC-1 `check:` with one of the repo's own
  test commands (or copy `src/product.py` + `tests/test_smoke.py` too, in a
  Python repo) so the first `scripts/check` run is green;
- then the same proof: `check` green, `--prove-red` OK, one commit.

Skip `src/`, `tests/test_smoke.py`, and `evals/` wherever they would collide
with existing code. Note: `spec_lint.py`'s dependency rule reads
`requirements.txt` only; other manifests are gated by review until the lint
learns them.

**Operator duties the agent cannot do (both modes):** create the GitHub
repo and push; make the `check` workflow a required status check (branch
protection); replace `@OPERATOR` in `.github/CODEOWNERS` with a real handle.

## The loop after scaffold

`142` writes `SPEC.md` (spec-lint-clean before it ends) → `143` implements,
one AC per verified commit, test first → `144` re-runs everything
adversarially and rules ship or hold → `29 · Weekly Vitals` and
`46/47 · Triage & Fixer` operate what shipped.

## Deviating

The stack default is Python 3 stdlib + `unittest` — chosen because zero
dependencies is the cheapest reliability money can't buy, and because the
parent repo proves the stack. A product may deviate (different language,
a framework) only by rewriting the harness layer to keep the same four
enforcement moments and recording the deviation as an ADR in `DECISIONS.md`.
The invariant is the contract above, not the language.
