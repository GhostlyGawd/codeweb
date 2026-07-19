# H18-v2 — the funded rerun, one command

**Question:** does the **ambient** codeweb loop (day-one brief injected at session start + explain
cards with caller-reliance contracts and confidence caveats injected before each edit) measurably
reduce structural regressions — on tasks hard enough to have headroom?

**Why v2 exists:** v1 (`agent-ab.json`) returned an honest **null with a floor effect** — both arms
scored ~0 regressions because clean, well-scoped tasks give a capable model nothing to get wrong.
v2 changes exactly two pre-registered things (see `agent-ab2-ambient.workflow.js` header):
hard tasks (fan-in ≥ 5 / shape changes with ≥ 3 caller files, difficulty verified against the
graph by the adversarial reviewer) and a treatment arm that mirrors what the hooks now do
automatically (context delivered, not offered).

## Prerequisites

- Corpus clones at `paper/corpus/{axios,flask,express}` (read-only; any pinned revision — the
  study copies per cell). `git clone --depth 1` each if absent.
- Node on PATH. Nothing else — graphs are built per cell by the harness.

## Run

Smoke first (≈4 cells, sanity of the whole pipeline):

```
Workflow({ scriptPath: "paper/experiments/agent-ab2-ambient.workflow.js",
           args: { root: "<abs path to codeweb>", smoke: true } })
```

Full run (9 tasks × 2 conditions × 2 reps = **36 cells**):

```
Workflow({ scriptPath: "paper/experiments/agent-ab2-ambient.workflow.js",
           args: { root: "<abs path to codeweb>" } })
```

Persist the returned `{tasks, cells, config}` to `paper/results/agent-ab2-raw.json`, then analyze
(deterministic, seeded):

```
node paper/experiments/agent-ab-analyze.mjs paper/results/agent-ab2-raw.json paper/results/agent-ab2.json
```

## Cost (why this waits for a go-ahead)

Each cell is a full agent solving a real task in an isolated repo copy plus two pipeline builds.
Ballpark from the v1 run: **~100–250k tokens per cell → roughly 4–9M tokens for the full 36-cell
run** (smoke ≈ 0.5M). It spends from the session's budget via the Workflow tool.

## Interpretation guardrails (pre-committed)

- Primary metric: paired difference in `structuralRegressions` (treatment − control), bootstrap
  95% CI; **pass = CI strictly below 0**. Straddling 0 → reported as null/underpowered, plainly.
- Validity checks: treatment cells must show real ambient engagement (`ambientContextNoted`), and
  the frozen task set must show non-trivial `difficultyEvidence` — otherwise v2 answers nothing.
- The grader is `diff.mjs` (a verified deterministic function), never a model judge.
