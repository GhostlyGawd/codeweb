---
name: codebase-anatomy
description: Dissect a codebase to atomic nodes (functions, classes, symbols), wire the call/import web, tag each node's domain, and build a cross-domain overlap graph that ranks consolidation/de-duplication opportunities, then render an interactive HTML map. Use to restructure your own codebase into well-defined non-duplicative systems, OR to fully map and review an external repo (git URL / owner-repo) before adopting it. Triggers include "map this codebase", "dependency/relationship graph", "find duplication/overlap", "atomic dissection", "review this repo before I use it", and the /codeweb command.
version: 0.6.0
metadata:
  origin: community
---

# Codebase Anatomy (codeweb)

Build a "biological web" of a system: every atomic part (function, class, method, exported
symbol) is a node; calls/imports/inheritance are the edges; each node belongs to a domain; and
an **overlap graph** shows where separate parts do the same work — the simplification targets.

The goal is not a pretty picture. It is an **evidence-backed restructure plan**: which
duplicated logic should collapse into one well-defined system, and who should depend on it.

## When to Use

- Restructuring your own codebase and you need to *see* the real dependency web and where it's
  duplicative before moving code.
- Onboarding to a large/legacy system at symbol resolution, not just folder-level.
- Reviewing an **external** repo (a plugin, library, or template you found on GitHub) end-to-end
  before adopting it — what it does, how it's wired, and whether it's worth committing to.
- Hunting cross-cutting duplication that file/module tools miss (the same check coded N times in
  N domains).

## Two Modes

- **internal** — analyze the current project; produce a domain map + overlap graph + restructure
  recommendations.
- **external** — `target` is a git URL or `owner/repo`. Clone it **read-only** to a temp dir,
  map it the same way, and add an **adoption review** (risk, dependencies, architecture verdict,
  "should you adopt this?").

Auto-detect: a URL or `owner/repo` ⇒ external; a path or `.` ⇒ internal. `--mode` overrides.

## Non-Negotiable Rules

- **Never execute the target.** No build, run, test, install, or entrypoint — for internal or
  external code. Only read files and invoke read-only static-analysis tools that inspect files
  already on disk. This is absolute for external repos (their toolchain can run their code).
- **Evidence over guesswork.** Every node, edge, domain, and overlap must trace to code you read
  or a tool emitted. When unsure of an edge or an overlap, omit it or mark it `low` — never
  inflate. A report that cries wolf is worse than no report.
- **No silent truncation.** If you cap depth, sample, or skip files, say so in the report and in
  `meta`. Coverage gaps must be visible.
- **One graph, one schema.** Everything conforms to `references/graph-schema.md`. The HTML
  renderer and all agents depend on it.
- **Reuse, don't reinvent.** Hand off to `repo-scan` (file/library classification),
  `codebase-onboarding` (guides), `refactor-cleaner` (acting on the list) rather than redoing
  their jobs.

## Outputs (under `<target>/.codeweb/`)

1. `graph.json` — the web: `nodes`, `edges`, `domains`, `overlaps`, plus `meta` (roles,
   staleness stamps, stats).
2. `report.html` — self-contained interactive map (force graph, domain tree, node details,
   ranked overlap tab; product-only filter by default). No network/CDN.
3. `report.md` — the same map as plain markdown (mermaid domain graph + overlaps).
4. `overlap.md` — the ranked consolidation opportunities in plain markdown.
5. `optimize.md` — the consolidation advisory (ready / blocked / review tiers).
6. `fragment.json` — the raw extractor output (pipeline stage 1).
7. (external mode) an adoption review section appended to `overlap.md` and your final summary.

## References

- `references/graph-schema.md` — the exact JSON shape and merge rules. **Read before dissecting.**
- `references/engine-detection.md` — the hybrid engine: which analysis tool per language, how to
  probe for it, and depth/scaling rules.
- `references/overlap-heuristics.md` — the four overlap kinds and the severity rubric.

## Core Workflow

### 0 — Scope & acquire

- Parse `target`, `--depth`, `--engine`, `--focus`, `--mode`, `--open`.
- internal: resolve the path (default `.`). external: `git clone --depth 1 <url>` into a temp
  dir (e.g. `${TMPDIR}/codeweb-<repo>`); **do not** run anything inside it.
- Detect languages, package managers, and repo size (`rg --files | wc -l`). Choose effective
  depth: `auto` ⇒ module-level overview, then symbol-level on the densest/most-overlapping
  subsystems. Probe for analysis tools per `engine-detection.md`; record the engine.

### Fast path (default) — one-command deterministic engine

For languages the bundled extractor handles (**JavaScript, TypeScript, Python, Rust, Go, Java, C#**), run the whole
pipeline in a single command instead of dissecting by hand. It is faster, cheaper, and
reproducible, and emits the same `graph.json` schema:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" "<target>" --target "<label>" --out-dir "<target>/.codeweb"
```

It chains extract → cluster (directory-anchored domains) → overlap (body-confirmed duplication)
→ optimize (consolidation advisory) → render, writing `fragment.json`, `graph.json`, `overlap.md`, `optimize.md`, `report.html`, `report.md` into the
workspace (defaults to `<plugin>/.codeweb/runs/<slug>/` when `--out-dir` is omitted). The script is
read-only over the target and resolves its own paths, so it works from any cwd. **When it
succeeds, skip steps 1–5 and go to step 6.** Use the agent-based passes below only as a
**fallback** — for languages the extractor can't parse, an explicit `--engine read`, or to enrich
findings the scripts left `low`-confidence.

### 1 — Survey & partition (agent-based fallback; skip if the fast path ran)

- Build the subsystem map: top-level source dirs / packages, excluding vendored and build dirs
  (lean on `repo-scan`'s classification idea — project vs third-party vs artifact).
- Partition the project code into ~4–12 scopes of comparable size. These are the parallel units.

### 2 — Dissect (parallel `codeweb-dissector`)

- Spawn one `codeweb-dissector` per scope **in parallel** (single message, multiple agents).
  Pass each: its scope, the engine mode, the detected tools, and the node/edge schema.
- Each returns `{nodes, edges}` for its slice. They may reference ids outside their scope.
- If subagents aren't available, run the passes sequentially with the same instructions.

### 3 — Merge

- Union all nodes (dedupe by `id`) and edges (unique by `from,to,kind`; sum `weight`).
- Drop edges whose endpoints aren't in the node set (dangling refs to skipped code).

### 4 — Domain-map & overlap (`codeweb-domain-mapper`)

- Pass the merged `{nodes, edges}` to one `codeweb-domain-mapper` with `overlap-heuristics.md`.
- It returns per-node `domain`, a `domains[]` summary, and ranked `overlaps[]`. Merge `domain`
  back onto each node by `id`; attach `domains` and `overlaps` to the graph.

### 5 — Stamp & render

- Write `.codeweb/graph.json`.
- Run the renderer:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/build-report.mjs" "<target>/.codeweb/graph.json"
  ```
  (add `--open` to launch it). It computes `meta.stats`, stamps `generatedAt`, drops any
  remaining dangling edges, writes the normalized graph back to `graph.json`, and writes
  `report.html` + `report.md` beside it.

### 6 — Overlap.md + summary

- Write `overlap.md`: the ranked overlaps as a checklist — title, kind, severity, the symbols
  involved, evidence, and the named consolidation target. This is the restructure plan.
- Report to the user: artifact paths, the domain count, and the **top 3–5 consolidation
  opportunities** with their recommendations.

### 7 — External adoption review (external mode only)

Append an adoption verdict: what the repo is and does (from the domain map), notable
dependencies and risk surface (lean on `security-review` / `repo-scan` signals), architecture
quality (cohesion vs the overlap graph), and a clear **adopt / adapt / avoid** recommendation
with reasons. Then clean up the temp clone.

## Scaling

Follow `engine-detection.md`: module depth for first pass and huge repos; expand to symbol depth
on the top subsystems by size and cross-domain edge density. If total nodes would exceed ~2000,
cap symbol expansion to the focus area and state it. The HTML renderer auto-starts in
domain-aggregated view above ~600 nodes and lets the user expand.

## Handoffs

- `refactor-cleaner` — execute the consolidation list.
- `codebase-onboarding` — turn the domain map into an onboarding guide.
- `code-tour` — anchor a guided tour to the symbol index.
- `repo-scan` — deeper file-level / third-party classification.

## Output Format

```text
TARGET   — path/url · mode · languages · engine · depth
WEB      — nodes / edges / domains  (+ coverage caveats)
DOMAINS  — each domain: name · node count · one-line role
OVERLAPS — ranked: severity · kind · title · → consolidation target
ARTIFACTS— .codeweb/graph.json · report.html · overlap.md
VERDICT  — (external only) adopt / adapt / avoid, with reasons
```
