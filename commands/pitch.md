---
name: codeweb-pitch
description: Draft a one-page, review-before-sharing refactor pitch memo from artifacts the map already produced — campaign projections, trend direction, hotspots, the local value receipt — every number pinned to an artifact path.
---

# /codeweb-pitch

Draft the business case users assemble by hand today (AI-IDEAS.md Idea 4): a one-page memo for
"fund this refactor" (team lead) or "here's what codeweb found in our repo" (the shareable
story). You select and narrate; the numbers come only from artifacts.

## Hard rules

- **Every number carries a citation** to the artifact path it came from
  (`optimize.md`, `campaign --json`, `.codeweb/history.jsonl`, `stats.json`, `trend` output).
  A number you cannot cite does not go in the memo.
- **Draft only — the user reviews before anything leaves the machine.** Never post, send, or
  commit the memo anywhere yourself. End with: "Review before sharing — numbers are only as
  fresh as the map (`mapped <date>` in the report masthead)."
- **The honest-null voice.** Blocked-tier items are stated as blocked with the gate's reason;
  no rounding up, no projections presented as measurements (the repo's claims-check culture).

## Inputs to read (all local, all already generated)

1. `optimize.md` / `codeweb_campaign` — ready/blocked/review counts, LOC reclaimable, per-step
   gate verdicts.
2. `.codeweb/history.jsonl` (or `node scripts/trend.mjs --history …`) — the trajectory:
   confirmed dups and coupling over the last N maps.
3. `node scripts/hotspots.mjs <graph>` — where the risk concentrates (auditable components).
4. `stats.json` (`npm run stats`) — the local receipt: regressions flagged before landing,
   cards delivered, queries served.

## Shape (one page, in this order)

trajectory (one sentence + the history series) → the ask (which ready merges, expected −LOC and
cycles, per `optimize.md`) → what's deliberately NOT proposed (blocked tier + why) → the safety
story (every merge pre-flighted by `codeweb_simulate`, landed behind the diff gate) → receipts
(`stats.json` lifetime line).

## Usage

```
/codeweb-pitch                    # draft the memo for the current map
/codeweb-pitch --audience lead    # "fund this refactor" framing
/codeweb-pitch --audience share   # "what codeweb found" framing for a post/README
```
