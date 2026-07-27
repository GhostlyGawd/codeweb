// narration sidecar (AI-IDEAS Idea 3) — one-sentence, AGENT-WRITTEN summaries for domains and
// load-bearing symbols, in `.codeweb/narration.json`. The fence: LLM output lives in sidecars
// with provenance, never inside graph.json (byte-reproducible) and never in a runtime compute
// path — this loader only READS, and every rendering surface labels the text "agent-written".
// Same staleness discipline as the other sidecars: stamped against one stat of graph.json; a
// mismatch returns null, so stale narration silently drops out rather than misleading anyone.

import { loadStamped } from './sidecar-stamp.mjs'; // D3a: THE stamp rule, one reader

export const NARRATION_SIDECAR = 'narration.json';

/** Load fresh narration beside a graph, or null (absent / stale / malformed). Never throws. */
export function loadNarration(absGraphPath) {
  const doc = loadStamped(absGraphPath, NARRATION_SIDECAR, 1);
  if (!doc) return null;
  return {
    domains: doc.domains && typeof doc.domains === 'object' ? doc.domains : {},
    symbols: doc.symbols && typeof doc.symbols === 'object' ? doc.symbols : {},
  };
}
