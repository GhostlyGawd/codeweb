# Controlled replay: a real Codeweb maintainer change

Frozen before running the replay on 2026-09-22. The code change is the merged PR #97, from parent `2fb533f38ec9d69ecf4ab4a82d1dbe17983983aa` to merge commit `2bd8c19452e742213ec9f7aab0cfce7c10662f7d`. The tool under test is the current merged Codeweb source in a separate clean worktree. The target is a disposable checkout of the parent commit; only the actual PR diff under `scripts/` is applied to it. No repository target code is executed.

## Maintainer question

Before changing Codeweb's context/review workflow, the maintainer asks who uses `buildContextPack`. After the actual PR #97 edit, can they identify which mapped caller was added and whether the pre-edit answer still describes the source?

Independent source oracle, identified from the PR patch before running Codeweb: the new file `scripts/lib/evidence-core.mjs` imports `buildContextPack` and calls it inside `contextEvidence` (line 116 in the merged file). The mapped caller identity should be `lib/evidence-core.mjs:contextEvidence` when the source root is `scripts/`. This establishes a source fact, not that any edit is safe or that the graph is complete.

## Two tool flows

Both use detached, disposable checkouts at the same parent commit, the same actual patch, the same current Codeweb binary, one Node runtime, and the same `CODEWEB_ENGINE=regex` setting. Both map `scripts/` before editing, save an explicit graph baseline, apply the patch, refresh the graph, then call `codeweb_review` for the new file against the baseline.

- **Ordinary:** request `context-pack buildContextPack` before the edit. Inspect the normal review after it. If the review does not directly identify the new caller of `buildContextPack`, request context again and count that follow-up.
- **Receipt:** capture `context-pack buildContextPack --capture-evidence` before the edit. Supply the receipt to the review and page its added relations afterward.

Record command exit states, relevant relationship IDs, `analysis`/evidence status, wall time and stdout bytes for each step. Shared mapping/baseline/refresh costs are counted in both flows. Report each workflow's total including follow-ups. The first flow runs before the second, so timing can reflect cache/order effects; do not interpret one run as a speed benchmark.

## Decision rule

Mechanism passes this replay if the receipt reports `changed` with the oracle caller in its added *caller* relation, no spurious added caller, and does not turn a clean structural verdict into a behavioral safety claim. If analysis is inconclusive, record why and do not force a pass. Compare how directly the ordinary review exposes the same caller, including any extra query. A single internal replay cannot establish that developers make better edits, save tokens or return to the tool.
