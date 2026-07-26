# DECISIONS — append-only ADR log

One entry per load-bearing choice. Never rewrite an old entry; supersede it
with a new one. Format: `## ADR-N — title`, then Date / Status / Context /
Decision / Consequences.

Scope boundary (ruled at the 141 gate, 2026-07-26): this file holds harness
and dependency ADRs — the entries `scripts/spec_lint.py` greps for.
`docs/decisions/` remains the home of product design history; nothing moves.

## ADR-0001 — Instantiated from the goal-prompts golden-path template

Date: 2026-07-26
Status: accepted
Context: codeweb (@ghostlygawd/codeweb v0.12.0) — a mature, zero-dependency
Node.js MCP server + CLI, 918-test suite, 7 CI workflows. No VERDICT.md
exists; the mandate is the operator's dispatch of the "All Build Goal
Prompts" conductor (2026-07-26) and the operator's explicit "Do everything"
go at the `reports/SCAFFOLD.md` Phase 2 gate, ratifying that report's
install plan and rewrites (a)–(d). Template source: GhostlyGawd/goal-prompts
commit `984266d` (MIT), `template/` directory; contract at `docs/harness.md`.
Decision: This repo uses the goal-prompts golden-path harness, grafted
(15 files, clobbering nothing), with these recorded deviations:

- **(a) Node commands inside the gate.** `scripts/check` wires the repo's
  existing checks — `npm test` (the product suite) and
  `node scripts/check-consistency.mjs` — after spec lint and the harness
  tests, and retains the template's evals step (`python3 evals/run.py`) as
  step 5/5. (SCAFFOLD.md's four ratified lines omitted the evals step while
  its own plan copied `evals/` for the gate; the coherent reading — keep the
  template's lint → tests → evals contract — is recorded here rather than
  drifted into.) The four enforcement moments are unchanged: PostToolUse
  after every edit, pre-commit, CI on every push/PR, and the 144 ship gate.
  Deliberately not wired in: bench budgets (load-sensitive; CI-only) and the
  site build + docs freshness diff (writes the tree; CI-only).
- **(b) PROTECTED narrowed to the explicit harness manifest** in
  `scripts/hook-protect` and `.github/CODEOWNERS`: in codeweb, `scripts/`,
  `.github/`, and `.claude/` are shipped product surface (91 of the npm
  tarball's 116 files live in `scripts/`), so the template's directory
  prefixes would lock the agent out of the product. The manifest:
  `scripts/check`, `scripts/spec_lint.py`, `scripts/hook-check`,
  `scripts/hook-protect`, `.githooks/`, `.github/workflows/check.yml`,
  `.github/CODEOWNERS`, `.claude/settings.json`, `tests/harness/`,
  `evals/run.py`. File entries match exactly (prefix matching would catch
  product files like `scripts/check-consistency.mjs`).
- **(c) npm publish exclusions.** `package.json` `files` gains negations for
  the four harness scripts so no shell/Python tooling ships in the product
  tarball — the "zero deps, runs 100% locally" claims stay exact.
- **(d) Python 3 as dev tooling only.** Contributors and CI need `python3`
  (CI pins 3.12) for spec lint, harness tests, and evals. No runtime
  dependency is added; the charter's zero-required-deps invariant holds.
  `spec_lint.py`'s dependency rule reads `requirements.txt` only; Node
  dependencies stay guarded by the existing review and consistency gates.
- **(e) `.githooks/pre-commit` sanitizes git's hook environment.** Git
  exports `GIT_INDEX_FILE`/`GIT_DIR`/`GIT_WORK_TREE` to pre-commit hooks;
  the product suite spawns git inside fixture repos (ci-gate, history
  mining P1–P6, `trend --git`), and the leak pointed 11 such tests at this
  repo — red under the hook, green everywhere else, measured at install.
  The hook unsets the three vars before exec'ing `scripts/check`, keeping
  the gate identical at all four enforcement moments.
- **Landing spots (ruled at the gate).** The template contract lives at
  `docs/harness.md` (graft mode never clobbers an existing file, so the
  repo README stays); `CLAUDE.md` points to it. This file holds
  harness + dependency ADRs; `docs/decisions/` keeps design history.

Consequences: The harness layer changes only by operator hand — the
PreToolUse hook blocks agent edits to the manifest, and CODEOWNERS routes
its reviews to @GhostlyGawd. Every Python dependency ever added needs its
own ADR here. The gate costs roughly a minute per edit (PostToolUse runs
the full suite) — accepted knowingly at the gate; the operator may trim the
wiring later by hand. Both charter-silent rulings above are mirrored into
`CHARTER.md` Open questions in the install change, per `CLAUDE.md`.
