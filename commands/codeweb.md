---
name: codeweb
description: Dissect a codebase into atomic nodes, wire the system web, tag domains, and surface overlap/consolidation opportunities as an interactive HTML map. Works on the current project or an external repo (path or git URL).
---

# /codeweb

Invoke the **codebase-anatomy** skill to build a "biological web" of a codebase and an
overlap graph for restructuring.

## Usage

```
/codeweb [target] [flags]
```

- `target` — a local path (default: current directory `.`) **or** a git URL / `owner/repo`
  to clone read-only and review before adopting.
- `--depth module|symbol|auto` — granularity (default `auto`: module-level overview, then
  symbol-level on the densest/most-overlapping subsystems).
- `--engine hybrid|read|tools` — how edges are extracted (default `hybrid`: static-analysis
  tools when available, agent reading otherwise).
- `--focus <glob>` — restrict atomic dissection to a path glob (e.g. `src/payments/**`).
- `--mode internal|external` — `internal` = restructure my own code; `external` = explore a
  third-party repo and produce an adoption review. Auto-detected from `target` if omitted.
- `--open` — open the generated `report.html` after rendering.

## What it does

1. Scopes and acquires the target (clones external repos read-only; never executes their code).
2. Dissects the code to atomic nodes (functions, classes, methods, exported symbols).
3. Wires the relationship web (calls, imports, inheritance) using the hybrid engine.
4. Tags every node with a semantic domain and clusters the domains.
5. Builds the overlap graph — duplicated logic, parallel implementations, tangled domains —
   and ranks consolidation opportunities.
6. Runs the consolidation advisor — tiers each duplicate-logic finding into **ready** (a
   body-confirmed merge the regression gate would accept), **blocked** (a merge that would
   introduce a new dependency cycle), or **review** (drifted/structural) — and writes `optimize.md`.
7. Renders a self-contained interactive HTML map plus `graph.json`, `overlap.md`, and `optimize.md`.
8. In external mode, adds an adoption review (risk, dependency, architecture verdict).

## Instructions for Claude

Activate the `codebase-anatomy` skill and follow its workflow. Parse the arguments above from
`$ARGUMENTS`. If `target` is a git URL or `owner/repo`, treat it as **external mode** unless
overridden. For the **eleven native languages** — JavaScript, TypeScript, Python, Rust, Go, Java,
C#, Ruby, PHP, Kotlin, Swift — prefer the skill's **fast path** — a single deterministic command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" "<target>" --target "<label>" --out-dir "<target>/.codeweb"
```

which runs extract → cluster → overlap → optimize → render in one shot (`--open` and
`--allow-empty` pass straight through); fall back to the agent-based dissection **only** for
languages outside that list or an explicit `--engine read`. `--depth`, `--focus`, and `--engine`
steer the agent-based fallback — the fast path is always full-target, symbol-level, and
deterministic. Write all outputs under
`<target>/.codeweb/` (or a temp dir for cloned external repos) and finish by reporting the artifact
paths and the top consolidation opportunities — lead with the **ready** tier from `optimize.md`
(merges the regression gate would accept), then call out anything **blocked** by a projected cycle.
