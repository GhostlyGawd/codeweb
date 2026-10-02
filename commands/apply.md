---
name: codeweb-apply
description: Execute the codeweb consolidation campaign's READY tier step-by-step — simulate, apply, refresh, diff-gate, test, commit (or revert and record blocked). The deterministic gate owns every verdict; this command only drives the loop.
---

# /codeweb-apply

Execute the gated worklist that `/codeweb` ends at. Today the advisory stops at a plan
("the agent (+ the gate) executes each step"); this command is that execution — **ready-tier
merges only**, every accept/reject decided by the deterministic gate, never by you.

## Hard rules (AI-IDEAS.md Idea 1 — the fence)

- **Ready tier only.** Never touch `blocked` or `review` tier items — blocked means the gate
  already rejected the naive merge; review means a human judgement the user has not delegated.
- **Merge steps only.** Campaign `delete` proposals require source review and separate explicit
  deletion authorization. A green structural gate does not establish unused code or deletion safety.
- **The gate owns the verdict.** You simulate, edit, and run tests; `codeweb_diff` (exit 1 on a
  new cycle / new duplication / lost callers) and the test subset decide. You never overrule them.
- **Revert on any failure.** A red diff-gate or failing test subset → `git checkout` the touched
  files (or `git revert` the step commit), record the step as **blocked with the gate's reason**,
  and CONTINUE to the next step (campaign ordering keeps later steps valid).
- **Stop conditions:** first unexpected error class (not a per-step gate failure), a dirty
  working tree you did not create, or the user interrupting. Never force-push, never touch CI.
- **codemod --write is CLI-only by design** — the MCP surface stays read-only; the *user's* agent
  writes, codeweb never does.

## The loop

1. Preconditions: clean `git status`; a fresh map (`codeweb_map` or `node scripts/run.mjs .`).
2. Get the plan: `codeweb_campaign` (or `node scripts/optimize.mjs <graph> --json`) — take the
   **ready** tier in listed order.
3. Per step:
   a. Pre-flight: `codeweb_simulate` with the step's merge (`merge`, `into`) — skip the step as
      blocked if `projected.ok` is false (record why).
   b. Snapshot: copy `graph.json` to a `before.json` for this step.
   c. Apply: `node scripts/codemod.mjs <graph> --merge <ids> --into <id> --write` for mechanical
      merges; hand-edit only when codemod declines, keeping the edit minimal.
   d. Refresh: `codeweb_refresh` (or `node scripts/refresh.mjs <graph>`).
   e. Gate: `codeweb_diff` before vs after — **exit 1 → revert (rule above)**.
   f. Tests: `codeweb_tests` for the surviving symbol → run exactly that subset. Red → revert.
   g. Commit: one commit per step, message citing the step id and the gate verdict.
4. Final receipt (print it, in the value-receipt voice):
   `applied N merge(s) · −L LOC · cycles broken C · blocked B (reasons listed) · gate green`.

## Usage

```
/codeweb-apply                 # execute the ready tier of the current map's campaign
/codeweb-apply --dry-run       # walk the loop, apply nothing, print what WOULD happen
```
