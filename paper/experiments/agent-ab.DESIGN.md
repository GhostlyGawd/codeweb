# H18 — Agent A/B field study: pre-registered design

**Status:** design pre-registered before any agent run. This is the **capstone, weakest-evidence**
theme (model nondeterminism is irreducible); the paper's thesis rests on Themes 1–4, and H18 is
reported as a field study with honest power, whatever it shows.

## Question

Does giving a coding agent codeweb's **pre-edit intelligence** measurably improve its edits? Concretely:
fewer **structural regressions** and less **new duplication**, and better **placement** of new code.

- **H1 (alternative):** treatment (codeweb-equipped) introduces fewer structural regressions than control.
- **H0 (null):** no difference. We report the null plainly if that is what the data shows.

## Conditions (everything equal except the independent variable)

Same base model, same task, same repo snapshot, same token ceiling. The **only** difference:

- **control** — the agent is given the task and edits the code. No mention of codeweb.
- **treatment** — the agent is given the task **plus codeweb's pre-edit protocol** and may run the
  read-only CLI tools via the shell:
  - `find-similar.mjs <graph> --body/--stdin [--structural]` — *does this already exist?* (reuse, don't re-implement)
  - `placement.mjs <graph> --calls <ids>` — *where does this belong?*
  - `query.mjs <graph> --impact <symbol>` — *what breaks if I change this?*
  - `simulate-edit.mjs <graph> --delete/--merge/--move` — *would my edit pass the gate?*

  Both conditions produce a diff over the same starting tree. The treatment's *only* advantage is
  access to codeweb's deterministic answers — isolating the effect of the tool, not of a different
  model or prompt scaffold. (This uses the CLI over the shell rather than MCP registration, so the
  study is reproducible without session-specific MCP setup; the MCP server exposes the identical
  functions, proven at parity by A-MCP.)

## Isolation

Each (task, condition, repetition) runs in its **own git worktree** (`isolation: 'worktree'`) over the
pinned corpus repo, so parallel agents never clobber each other and every diff is measured against a
clean, identical base.

## Metrics (per task; graded by codeweb's *own deterministic* tools — a neutral grader)

1. **Structural-regression count** (primary) — run `diff.mjs <before.json> <after.json>` on the graph
   before/after the agent's edit; count gate regressions (new cycle ∨ new duplication ∨ a symbol that
   lost all callers). This is the same deterministic gate proven correct in H5 — so the grader is not
   a biased judge, it is a verified function.
2. **New-duplication count** — `overlaps[]` added (body-confirmed) in the after-graph.
3. **Placement correctness** — for add-a-symbol tasks, did the new symbol land in the domain the
   `placement` oracle (callee gravity) says it belongs to? (binary per applicable task)
4. **Task completion** (gate) — did the edit satisfy the task's stated functional criterion? A task
   that wasn't completed is excluded from the *quality* metrics (you can't grade the cleanliness of a
   non-edit) but the completion *rate* itself is reported per condition.
5. **Secondary** — tokens, wall-clock.

## Task set — generation & freezing protocol (anti-bias)

We do **not** hand-pick tasks (author selection bias favors the tool). Instead:

1. A **proposer** agent reads each corpus repo and proposes candidate tasks of three kinds — *add*
   (introduce a function that may duplicate existing logic), *refactor* (move/merge/rename touching
   multiple callers), *fix* (a localized change with non-trivial blast radius) — each with: the repo,
   a precise instruction, and an **objective, automatable** success criterion.
2. An **adversarial reviewer** screens every candidate for: (a) **representativeness** — is this a real
   task a developer would do, not one contrived to make codeweb shine? (b) **fairness** — could a
   competent agent plausibly do it well *without* codeweb? (if not, it's rigged — cut it.) (c)
   **gradeability** — is success objectively measurable? Rejected tasks are logged with reason.
3. The surviving set (target **N ≈ 12–16**, balanced across kinds and repos) is **frozen** to
   `paper/results/agent-ab-tasks.json` **before any solver runs**. No task is added or dropped after
   solving begins.

## Repetitions & statistics

- **R = 2** solver runs per (task, condition) to absorb model nondeterminism (report per-run spread).
- **Pairing:** by task (each task contributes a control result and a treatment result).
- **Effect size:** Cliff's δ on regression counts (control vs treatment); **paired bootstrap 95% CI**
  (`pairedDiffCI`) on the per-task mean difference. Seeds committed.
- **Pass (confirmatory):** the paired-difference CI for (treatment − control) regression count lies
  **strictly below 0**. **If the CI straddles 0 / N is small:** reported as *null or underpowered*,
  with the observed point estimate, the CI, and the N needed for power — not spun as a win.

## Anti-rigging checklist (must all hold before runs)

- [ ] Control agent is competent (sanity-run on 1 task; it must produce a real edit, not a strawman).
- [ ] Tasks frozen before solving; rejection log committed.
- [ ] Grader is codeweb's verified `diff.mjs` (deterministic), not a model judge.
- [ ] Treatment and control prompts differ **only** in the codeweb protocol block (diffable).
- [ ] Both conditions get identical token ceilings and the identical starting worktree.

## Reproducibility caveat

Unlike Themes 1–4, this is **not** byte-reproducible (model nondeterminism). We commit seeds, the
frozen task set, both prompt templates, the grader, and all raw per-run results. The *deterministic*
parts (grading via `diff.mjs`, placement oracle) reproduce exactly from the committed agent diffs.

## Harness

`paper/experiments/agent-ab.mjs` (a workflow): stage 1 propose+freeze tasks → stage 2 solve each
(task,condition,rep) in a worktree → stage 3 grade each diff with `diff.mjs` → stage 4 paired stats.
Writes `paper/results/agent-ab.json` + `agent-ab-tasks.json` + per-run diffs under `paper/results/ab/`.
