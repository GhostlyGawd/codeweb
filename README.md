# codeweb

> Dissect a codebase to its atomic parts, wire them into a living system web, tag each node's
> domain, and surface where the system does overlapping work — so it can be restructured into
> well-defined, non-duplicative systems. Renders a self-contained interactive HTML map.

codeweb is the missing **atomic-analysis + overlap-detective** layer. Where `repo-scan`
classifies *files* and flags duplicate *modules*, and `codebase-onboarding` writes high-level
architecture docs, codeweb works at **symbol resolution**: functions, classes, and methods, the
call/import edges between them, the semantic domain each belongs to, and the cross-domain
overlap graph.

## Two modes

- **Internal** — map your own codebase and find consolidation opportunities to restructure.
- **External** — clone a third-party repo *read-only* (e.g. a Claude Code plugin you found on
  GitHub), fully map it, and get an adoption review before you commit to using it. codeweb
  never executes target code.

## Install

This is a self-contained Claude Code plugin. To use it:

1. Copy the `codeweb/` directory into a plugins location Claude Code discovers, **or** add the
   directory as a local marketplace and install it:
   ```
   /plugin marketplace add D:/GitHub Projects/ecc-test/codeweb
   /plugin install codeweb
   ```
2. Restart Claude Code so the command, agents, and skill register.

Requires Node.js — the whole deterministic pipeline (extract → cluster → overlap → render) runs
on Node, no external dependencies. Static-analysis tools (universal-ctags, ripgrep, madge, etc.)
are *optional* — they only sharpen the agent fallback path; the default engine reads the code
directly.

## Use

```
/codeweb                                  # map the current project
/codeweb src/payments --depth symbol      # deep-dive one subsystem
/codeweb https://github.com/owner/repo    # external review before adopting
/codeweb owner/repo --open                # clone, map, and open the report
```

Flags: `--depth module|symbol|auto`, `--engine hybrid|read|tools`, `--focus <glob>`,
`--mode internal|external`, `--open`. See `commands/codeweb.md`.

## Outputs (under `<target>/.codeweb/`)

| File | What it is |
|---|---|
| `graph.json` | The machine-readable web: `nodes`, `edges`, `domains`, `overlaps`, plus `meta` (target root, engine, languages, stats). |
| `report.html` | Self-contained interactive map — force-directed graph, domain tree, clickable node details, ranked overlap tab. No network/CDN required. |
| `report.md` | The same map as plain markdown — domains, top nodes, ranked overlaps. |
| `overlap.md` | The ranked consolidation opportunities in plain markdown. |
| `fragment.json` | The raw extractor output (atomic nodes + edges) before clustering — the pipeline's first stage. |

## How it works

For JavaScript, TypeScript, and Python the default is a **deterministic Node pipeline** — one
command, no LLM in the loop, reproducible byte-for-byte. `scripts/run.mjs` chains four stages
into a per-target workspace:

1. **Extract** (`extract-symbols.mjs`) — parse every source file into atomic nodes (functions,
   classes, methods) and call/import edges. Unresolved bare calls only wire to a global
   definition when the name is unambiguous; multi-def names drop the edge rather than fabricate a
   false hub.
2. **Cluster** (`cluster3.mjs`) — strip genuine utility hubs, then group nodes into
   directory-anchored semantic domains.
3. **Overlap** (`overlap.mjs`) — detect duplicated logic and parallel implementations, then
   confirm each candidate against the real function bodies (token-shingle similarity) so findings
   are body-backed, not name coincidences.
4. **Render** (`build-report.mjs`) — turn `graph.json` into the self-contained `report.html`
   (and `report.md`).

For languages the extractor can't parse (or with `--engine read`), codeweb **falls back** to the
agent path: parallel `codeweb-dissector` agents extract nodes + edges per subsystem, the
fragments merge into one graph by node id, and `codeweb-domain-mapper` tags domains and detects
overlaps. Both paths emit the same `graph.json` schema, so clustering, overlap, and rendering are
shared. In **external** mode, either path appends an adoption verdict (risk, deps, architecture).

## Components

```
codeweb/
├── .claude-plugin/plugin.json
├── commands/codeweb.md              # /codeweb trigger
├── scripts/                         # the deterministic engine (default fast path)
│   ├── run.mjs                      # orchestrator — one command, runs all stages per target
│   ├── extract-symbols.mjs         # stage 1: source -> atomic nodes + edges (JS/TS/Python)
│   ├── cluster3.mjs                # stage 2: hub-strip + directory-anchored domains
│   ├── overlap.mjs                 # stage 3: body-confirmed duplication/overlap detection
│   ├── build-report.mjs            # stage 4: graph.json -> interactive report.html + report.md
│   └── report-template.html        # the renderer's self-contained HTML shell
├── agents/                          # fallback path (unparseable langs / --engine read)
│   ├── codeweb-dissector.md         # atomic dissection (parallel, read-only)
│   └── codeweb-domain-mapper.md     # domain tagging + overlap detection
├── skills/codebase-anatomy/
│   ├── SKILL.md                     # orchestration brain (fast path default, agents fallback)
│   └── references/
│       ├── graph-schema.md
│       ├── overlap-heuristics.md
│       └── engine-detection.md
└── README.md
```

## Handoffs

codeweb's domain map and overlap list feed naturally into `refactor-cleaner` (act on the
consolidation list), `codebase-onboarding` (use the domain map for a guide), and `code-tour`
(anchor a tour to the symbol index).
