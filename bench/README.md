# bench/ — codeweb's benchmarks and receipts

Every public claim codeweb makes traces to a file in this directory. It holds the **runnable
instruments** (harnesses that measure the engine and the agent loop) and the **frozen results**
they produced — the receipts behind the site's [evidence ledger](https://ghostlygawd.github.io/codeweb/research.html)
and the README's numbers.

## Layout

| Path | What it is |
|---|---|
| `run-all.mjs` | Re-runs every deterministic harness and re-derives every number (`node bench/run-all.mjs`) |
| `experiments/` | The instruments: oracle A/B, determinism, detection accuracy, edit safety, performance, the efficiency pilot, the agent A/Bs, and the replay benchmark (`replay-mine.mjs` → `replay-ab.workflow.js` → `replay-analyze.mjs`) |
| `results/` | Frozen outputs, committed verbatim — including the nulls and one discarded pilot (`replay-ab-pilot.json`, kept with its flaws documented) |
| `lib/` | Shared oracles + statistics used by the harnesses (self-contained; no runtime deps) |
| `corpus/` + `corpus.manifest.json` | SHA-pinned real-repo corpus, cloned by `corpus/clone-corpus.sh` (large; git-ignored) |

The user-facing one-command benchmark (`npm run bench -- <graph.json>`) lives in
`scripts/bench.mjs` and shares its arms/oracle/scoring with the frozen oracle A/B here —
your repo, same referee, same math.

## Rules these runs obey

Criteria are fixed before data collection; engines are frozen across arms; grading is by fixed
functions or independent oracles (TypeScript compiler, Kosaraju SCC, reverse-BFS) — never
self-reported; nulls and discarded pilots are published with the reasons, not binned. The replay
benchmark additionally solves **blind**: agents work in a history-free export of the base
revision and never see the answer key (`docs/specs/replay-run.md`).

## Provenance

These instruments began as a pre-registered effectiveness study. The manuscript,
pre-registration (H1–H18), and figure apparatus were retired from `main` after the program
moved into the product (this directory, the site ledger, and the CHANGELOG's Research notes);
they remain in git history, last present at tag `v0.8.0` under `paper/`.
