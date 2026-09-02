# GitHub Discussion draft — v0.14.0 announcement

**Posted 2026-09-02: https://github.com/GhostlyGawd/codeweb/discussions/89**

The repo's own Announcements category, so no third-party account is involved — this is the one
launch channel completable under mission credentials. (Discussions were off; enabling them was a
repo-settings change made for this post.) Verified anonymously after posting: the page is served
to an unauthenticated request, both tables and the install block render, and the receipt values
and honesty statements are present in the served HTML.

- **Repository:** GhostlyGawd/codeweb
- **Category:** Announcements
- **Title:** `codeweb v0.14.0 — the gate, C/C++, and every number re-derived`

---

## Body

```markdown
v0.14.0 is on npm and the release is published. This is the release where the CI gate
becomes the headline rather than a feature note, and where every published number was
re-derived from a repaired harness before it went out.

## What is new

**The deterministic regression gate leads.** codeweb builds a call/import graph, and the
gate diffs that graph across a pull request. It fails on a new dependency cycle, a new
body-confirmed duplication, or a symbol that lost every caller. No LLM in the loop, so the
verdict is the same every run, and it costs zero tokens per PR.

**C and C++ are first-class — 13 native languages now ship.** Both follow the same contract
as the rest: pinned grammar, sha256 recorded in `scripts/grammars/PROVENANCE.md`, ABI
verified against the pinned runtime, regex-tier fallback so the AST tier stays optional.

**The free/paid line is published, not implied.** Anything that runs on one laptop against
one repository is free forever under MIT — the map, the 28 MCP tools, the hooks, the gate
Action, every language, now and later. There is a hosted tier for teams that want the gate
run for them across repositories; its price intent is EUR 10 per active author per month,
an active author being one who committed in the trailing 90 days. Intent, not a live offer.
A billing problem there is designed to degrade the hosted service without ever touching
local tooling or your CI.

**Four benchmark instruments repaired.** Every failure was in the measuring tool, not the
product, and each reproduced at pre-release HEAD. No published number moved as a result.

## The receipts

32 pre-registered checks, graded against oracles written separately from the shipped code,
over six SHA-pinned repositories (axios, express, zod, flask, ripgrep, gorilla/mux). All 32
pass:

| Check | Result | Receipt |
|---|---|---|
| Cycles, impact, callers, callees, context-pack vs independent oracles | 497,864 comparisons, 0 disagreements | `bench/results/correctness-query.json` |
| Edit pre-flight vs the real gate verdict | 10,000 simulated edits, 0 wrong | `bench/results/edit-safety.json` |
| Byte-determinism | 20 runs per repo, 1 digest each, 6 repos | `bench/results/determinism.json` |
| Incremental refresh == full rebuild | 360 comparisons, 0 mismatches | `bench/results/determinism.json` |
| Renamed (Type-2) clone recall | 1.0 structural vs 0.0 lexical | `bench/results/detection-accuracy.json` |
| Dead-code safe-tier precision | 1.0 | `bench/results/detection-accuracy.json` |
| Sub-quadratic scaling | exponent 0.342, 95% CI upper 0.5702 | `bench/results/performance.json` |
| Query latency on 3,215 symbols | worst p95 51.89 ms (29.08 ms of it Node startup) | `bench/results/performance.json` |
| Auxiliary feature coverage incl. MCP/CLI parity across 28 tools | 11 checks, all pass | `bench/results/auxiliary.json` |
| Self-map budget | 1,573 symbols / 5,001 edges, 1,178 ms cold, 143 ms warm | `bench/results/benchmarks.json` |

Every one of those files is committed, and `node bench/run-all.mjs` regenerates all of them.

## What did not work

The pre-registered capstone — "agents edit better with codeweb" — came back a **null**:
a paired difference of exactly zero on a frozen, adversarially screened task set. It is a
floor effect on tasks clean enough that the baseline already succeeded, and it is published
in the repo beside the passes rather than quietly dropped. An earlier token-savings result
from the discovery pilots did not replicate when re-run, and is likewise recorded as not
replicating.

The repo keeps a standing list of things it deliberately does not claim, rendered on the
site straight from `site/data/product.json` so it cannot drift out of sync with the copy.

## Install

    npx -y @ghostlygawd/codeweb .

MIT, zero required dependencies, Node >= 22. Runs entirely on your machine: no account, no
telemetry, no license keys, and it reads code without executing it.

- Site: https://ghostlygawd.github.io/codeweb/
- The evidence: https://ghostlygawd.github.io/codeweb/research.html
- Release: https://github.com/GhostlyGawd/codeweb/releases/tag/v0.14.0

If a number in here does not re-derive on your machine, that is a bug worth an issue.
```
