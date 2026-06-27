# codeweb — North-Star Science Roadmap

**Goal (the bar that does not move):** codeweb must *verifiably* make coding agents — including
frontier models — **more efficient (tokens / tool-calls / latency)** AND **more effective (edit
quality)**. An accurate engine that adds zero agent value is "not helpful enough yet." We do not
regress to "the engine is correct" as the success criterion.

**Status at start of program (2026-06-27):**

| Leg of the north-star | State | Evidence |
|---|---|---|
| Discovery effectiveness | ✅ proven (one slice) | caller-discovery recall +0.265 (~6× noise floor, 8/8 frozen-engine reps positive), steps −34% vs grep — PR #13 |
| Efficiency | ✅ proven (one slice) | total tokens −910k (~44%), runtime tool-calls −6.4, both clear of noise (S/N ~2) — `efficiency-pilot.usage.mjs` |
| Edit-quality effectiveness | ❌ **NULL (open)** | H18 floor effect — tasks too easy for context to matter |

The full claim is **NOT yet met**: proven on discovery + efficiency, unproven on edit-quality.
This roadmap closes that gap in four phases, ordered by dependency and de-risking.

---

## Cross-cutting guardrails (anti-reward-hack; every phase obeys all six)

These extend `paper/PRE-REGISTRATION.md` §0. A phase does not "pass" unless all hold:

1. **Pre-register** hypothesis + primary metric + pass threshold *before* the run.
2. **Freeze the engine** (pin engine hash) across both arms — measure the tool, not engine drift.
3. **Symmetric task authoring** — the same generator feeds the grep arm and the codeweb arm.
4. **Clear a measured noise floor** — ≥8 reps, report S/N, judge on lower-CI not point estimate.
5. **Agent-facing metric only** — the agent's *behavior* must move; static graph-accuracy that never
   touches agent performance does not count toward the north-star.
6. **Nulls and negatives ship** — any language/task class that fails goes in the paper, not the bin.

---

## Phase 1 — Harden & extend the proven wins  *(foundation, cheapest first)*

Turn "one slice" (JS/TS + one Python target) into a robust, multi-language surface. The frozen-engine
multi-language harness produced here is reused by Phases 2–4.

- **H19 (generalizes):** the caller-discovery recall advantage over grep holds across ≥3 languages
  (JS proven; add **Go** = gorilla-mux, **Rust** = ripgrep; Python = flask already partial) and ≥2
  repo-size tiers.
- **H20 (scales):** token-saving % does **not** decrease as repo/graph size grows (slope ≥ 0 within CI).
- **Primary metric:** recall delta (engine-frozen, ≥8 reps) and total-token delta with S/N, vs grep.
- **Pass:** recall-delta lower-CI > noise floor in ≥3/4 languages; token-saving slope ≥ 0 vs LOC.
- **Requirements:** corpus already spans the languages (`paper/corpus.manifest.json`); reuse
  `efficiency-pilot.usage.mjs`. **Moderate** multi-agent spend.
- **Falsifier:** recall delta crosses zero in ≥2 languages ⇒ "generalizes" is killed; scope the claim.
- **Ships:** multi-language proof table in `paper/`; deterministic `ci-gate` product rides along.

## Phase 2 — Productize the efficiency win as the **Context Compiler**

The −44% token win, turned into a shipped deterministic tool: *one `codeweb context-pack <symbol>`
replaces grep fan-out.* Becomes the agent-facing testbed Phase 3 reuses. `scripts/context-pack.mjs`
already exists.

- **H21 (non-inferior + cheaper):** replacing agent grep-exploration with one `context-pack` call
  holds **task success non-inferior** while cutting tokens/tool-calls — measured on the **shipped
  CLI/MCP command**, not the pilot harness.
- **Primary metric:** task-success (pre-registered non-inferiority margin) + token/tool-call delta, S/N.
- **Pass:** success within margin AND tokens down with S/N > 2; output byte-stable for same
  input + engine hash.
- **Requirements:** harden `context-pack.mjs` (stable ordering, `--token-budget`), wire to MCP, doc.
  Moderate multi-agent spend.
- **Anti-hack:** cannot "win" tokens by degrading success — the margin is the gate.

## Phase 3 — Crack the edit-quality null  *(the north-star gap, hardest)*

**Diagnosis of H18:** floor effect — old tasks were too easy, so context never mattered. Fix the
*tasks*, not the metric.

- **H22 (context raises edit correctness):** on tasks **constructed so the correct edit depends on
  non-local information** (distant caller invariant, multi-file ripple, dynamic-dispatch target),
  codeweb-context agents produce higher edit-correctness than grep-only agents.
- **Primary metric:** edit correctness — objective test-pass where possible; blind rubric otherwise.
- **Pass:** correctness-delta lower-CI > 0 across ≥N reps; both arms off floor *and* ceiling.
- **Requirements:** **hard** — context-sensitive task construction is the bottleneck; **heavy
  multi-agent spend**; blind grading.
- **Anti-hack:** tasks authored *before* seeing results, ideally by an *independent* agent, so they
  cannot be cherry-picked to favor codeweb.
- **Falsifier:** still null on genuinely context-sensitive tasks ⇒ **published boundary** — codeweb
  helps discovery + efficiency but not edit-quality. A legitimate result, not a failure.

## Phase 4 — Novel mechanism: **edit blast-radius pre-flight**  *(highest upside, last)*

Does not exist yet. Before an agent edits symbol X, codeweb computes its blast radius — transitive
callers, dynamic-dispatch sites, covering tests, cyclomatic risk (`scripts/risk.mjs` + graph) — and
surfaces it as a pre-edit signal. The **auto-fix refactor bot** is the *action* layer of this same
signal.

- **H23 (reduces collateral breakage):** agents shown the pre-edit blast-radius break fewer downstream
  tests and miss fewer call sites than agents without it.
- **H24 (agents use it):** instrument whether the signal actually changes agent behavior (a novel
  signal that is ignored is a null even if breakage drops for other reasons).
- **Primary metric:** downstream-test-breakage rate; missed-call-site rate — both **objectively run**,
  never self-reported.
- **Pass:** breakage/miss rate lower with CI above noise AND H24 shows behavioral uptake.
- **Requirements:** build blast-radius compute (callers + risk exist; **coverage→symbol mapping is
  new**), then agent A/B. **Heavy multi-agent spend.**
- **Anti-hack:** measure real test breakage by running the suite, never trust agent confidence.

---

### Side-feature mapping (the three productization options)

| Side feature | Lands as | Science needed |
|---|---|---|
| CI gate (block bad PRs) | deterministic product alongside Phase 1 | none (already `scripts/ci-gate.mjs`) |
| Context compiler | **is Phase 2** | H21 |
| Auto-fix refactor bot | **action layer of Phase 4** | H23/H24 |

### Hypothesis ledger

H19–H20 (Phase 1), H21 (Phase 2), H22 (Phase 3), H23–H24 (Phase 4). All registered in
`paper/PRE-REGISTRATION.md` before their runs; H1–H18 are the prior study.
