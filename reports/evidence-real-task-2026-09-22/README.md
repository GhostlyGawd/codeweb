# Evidence receipts on a real Codeweb edit

**Decision: keep the merged feature unreleased for now.** The internal replay verified its source-backed delta mechanism, but did not establish better maintainer decisions or lower cost. A willing maintainer's observed task is the next evidence needed for a public release claim. The feature remains available from `main` for source-based trials.

The [protocol](PROTOCOL.md) was written before the replay. [replay.py](replay.py) applies the actual merged PR #97 `scripts/` diff in two disposable checkouts of its parent commit. Tool code came from a clean integration worktree whose `scripts/` bytes matched merged `main`. The script maps the same historical source, captures before the edit, applies the real patch, refreshes, and reviews the change. The target code is read, never executed. [RESULT.json](RESULT.json) contains commands, exit codes, per-step times, byte counts, and bounded result summaries.

## Observed result

The source oracle is the new `contextEvidence` function in `scripts/lib/evidence-core.mjs`. The actual PR adds its direct call to `buildContextPack`.

| Question | Ordinary context + review | Receipt + review |
|---|---|---|
| Before-edit mapped callers | 2 | Receipt recorded 2 |
| After-edit review | Lists `contextEvidence` as a changed symbol, without identifying its new relationship to `buildContextPack` | Reports `changed`; the added-relations page names exactly one new direct caller: `lib/evidence-core.mjs:contextEvidence` |
| Extra inspection | A follow-up context query returned 3 callers, including the oracle | One historical delta page returned the new caller and six impact relationships |
| Structural review | `ok:false` with three duplication-similarity findings | Identical structural verdict; receipt result stays separate |
| Total wall time, one serial run | 985 ms | 1,518 ms |
| Total stdout, including follow-up/page | 38,286 bytes | 38,670 bytes |

The receipt met the frozen mechanism check: it reported the expected direct caller, no unrelated new direct caller, and did not claim behavioral safety. The ordinary workflow can also identify the caller with an additional targeted query. This replay shows a difference in **how the change is presented**, not proof that a developer would miss it without receipts.

The structural verdict is red in both conditions because `codeweb_review` reports three body-similarity findings in the added module. The merged PR's full structural self gate passed. These are different checks; the replay does not adjudicate the similarity findings or treat either result as a behavioral verdict. They are a presentation/interpretation point for a participant trial.

## Interpretation and limits

This was one historical maintainer task with two serial, scripted tool flows and a known source oracle. No independent developer or coding agent made an edit decision. Times include local process startup and can reflect condition order or caches; stdout bytes are not model tokens. The receipt flow added roughly 0.53 seconds and 384 bytes in this run. [RESULT-initial.json](RESULT-initial.json) preserves the first run: its raw outcomes agree, but its scoring incorrectly treated a changed-symbol name as an explicit caller relationship. The scoring was corrected to the frozen protocol rule before the recorded rerun.

The September 22 scheduled Codeweb product-team outcome review finished separately with **zero observed participant conversations/tasks** and no new response on [the prior user report](https://github.com/GhostlyGawd/codeweb/issues/92). That is missing evidence, not zero demand or proof of no value.

## Release decision

The technical floor is met: merged code, full repository gate, cross-platform CI and offline packed-package smoke passed. The product floor is unmeasured: whether the receipt changes a maintainer's inspection or final decision enough to justify its extra step and output. I recommend **holding a public package/release update** and using the merged source for one voluntary, observed maintainer task. Do not advertise token savings, fewer broken edits, or retention from this replay. Keep the existing 0.15.0 release in place while that observation is sought.

[Participant protocol and blank capture sheet](PARTICIPANT-PROTOCOL.md) are prepared. No outreach was sent, no participant response was simulated, and no release or product code was changed in this trial.
