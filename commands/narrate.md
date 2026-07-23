---
name: codeweb-narrate
description: Write one-sentence, agent-authored summaries for each domain and the top load-bearing symbols into the .codeweb/narration.json sidecar — provenance-labeled, staleness-stamped, never touching graph.json.
---

# /codeweb-narrate

The fast path's map answers "how big" but never "what for" — every node summary is empty and
every domain summary is a templated count. This command restores the English meaning as a
**sidecar with provenance** (AI-IDEAS.md Idea 3): `graph.json` stays byte-identical; delete the
sidecar and you have today.

## Hard rules (the fence)

- **Write ONLY `.codeweb/narration.json`.** Never edit `graph.json`, never any source file.
- **One sentence per entry.** What the domain/symbol is FOR — not how big (the map already says).
- **Stamp it** against the graph you read, so staleness is visible and stale narration silently
  drops out of every surface (same discipline as the other sidecars).
- Rendered surfaces label every sentence **agent-written** — narration annotates the map; it
  never *is* the map.

## Steps

1. Read the map: `codeweb_brief` for the domain list; `node scripts/reading-order.mjs <graph>`
   for what to read first; read the top files per domain (bounded — this is a sentence, not a review).
2. Stat the graph for the stamp: `mtimeMs` + `size` of `.codeweb/graph.json`.
3. Write `.codeweb/narration.json`:

```json
{
  "version": 1,
  "stamp": { "graphMtimeMs": <graph mtimeMs>, "graphSize": <graph bytes> },
  "domains": { "<domain name>": "<one sentence — what it does>" },
  "symbols": { "<node id>": "<one sentence>" }
}
```

Cover every product domain; cover the top ~20 load-bearing symbols (the brief's list). Re-run
after a re-map to refresh the stamp.
