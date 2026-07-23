// narration sidecar (AI-IDEAS Idea 3) — one-sentence, AGENT-WRITTEN summaries for domains and
// load-bearing symbols, in `.codeweb/narration.json`. The fence: LLM output lives in sidecars
// with provenance, never inside graph.json (byte-reproducible) and never in a runtime compute
// path — this loader only READS, and every rendering surface labels the text "agent-written".
// Same staleness discipline as the other sidecars: stamped against one stat of graph.json; a
// mismatch returns null, so stale narration silently drops out rather than misleading anyone.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const NARRATION_SIDECAR = 'narration.json';

/** Load fresh narration beside a graph, or null (absent / stale / malformed). Never throws. */
export function loadNarration(absGraphPath) {
  try {
    const doc = JSON.parse(readFileSync(join(dirname(absGraphPath), NARRATION_SIDECAR), 'utf8'));
    if (doc.version !== 1) return null;
    const st = statSync(absGraphPath);
    if (doc.stamp?.graphMtimeMs !== st.mtimeMs || doc.stamp?.graphSize !== st.size) return null;
    return {
      domains: doc.domains && typeof doc.domains === 'object' ? doc.domains : {},
      symbols: doc.symbols && typeof doc.symbols === 'object' ? doc.symbols : {},
    };
  } catch { return null; }
}
