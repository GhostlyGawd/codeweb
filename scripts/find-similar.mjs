#!/usr/bin/env node
// codeweb find-similar — reuse-at-write-time. Before an agent writes a function, it asks "does
// something already do this?": shingle a candidate body/signature and rank existing non-test
// function bodies by token-shingle Jaccard. Turns codeweb's post-hoc duplication detection into
// write-time PREVENTION. Read-only, deterministic. Shares the K=3 shingler with overlap.mjs via
// ./lib/shingles.mjs (one truth).
//
// finding #26 (SURFACED behavior change): existing function/method bodies are shingled on their FIRST
// BODY_LINE_CAP lines — the SAME cap overlap/dup-check/the map-time sidecar apply, so the live path and
// the sidecar path give one answer (finding-15's "one answer per question", the capped one). A
// >400-line body's ranking can therefore differ from the pre-#26 uncapped answer, BY DESIGN; the JSON
// payload carries `bodyLineCap` so the cap is visible. The CANDIDATE text (--body/--stdin/--signature)
// stays UNCAPPED — only node bodies are capped.
//
// Usage:
//   node find-similar.mjs <graph.json> (--body <file> | --stdin | --signature "<text>") [--k N] [--json]
// Exit: 0 ok (even with zero matches), 2 usage / source unavailable.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, isTestFile } from './lib/graph-ops.mjs';
import { shingles, jaccard, K, BANDS, BODY_LINE_CAP, capBody } from './lib/shingles.mjs'; // THE size + bands + body cap (findings 27 + 26)
import { structuralShingles } from './lib/skeleton.mjs'; // F6: Type-2 (rename-invariant) similarity
import { loadSimilarIndex } from './lib/similar-index.mjs'; // finding 16: map-time shingle sets — zero source reads on the hot path

const USAGE = 'usage: find-similar.mjs <graph.json> (--body <file> | --stdin | --signature "<text>") [--k N] [--structural] [--json]';
import { die, emitJson, finish, loadGraph, sourceReader, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    stdin: { type: 'bool', default: false },
    structural: { type: 'bool', default: false },
    body: { type: 'string', default: null },
    signature: { type: 'string', default: null },
    k: { type: 'number', default: 10 },
  },
});
const { json, body, stdin, signature, structural } = opts, k = Math.max(1, opts.k);
// F6: --structural ranks by skeleton (identifier-normalized) shingles, so a clone with all variables
// renamed scores ~1 even when its lexical (token) similarity is lower. Lexical is the default.
const shg = structural ? (s) => structuralShingles(s, K) : (s) => shingles(s, K);
// exactly one candidate source
const sources = [body != null, stdin, signature != null].filter(Boolean).length;
if (sources !== 1) die(USAGE, 2);

const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

const root = graph.meta?.root || null;
if (!root || !existsSync(root)) die(`source unavailable: graph.meta.root is missing or not on disk — find-similar needs real bodies to compare (got ${root || 'none'})`, 2);

// read candidate text
let candidateText;
try {
  if (body != null) candidateText = readFileSync(resolve(body), 'utf8');
  else if (stdin) candidateText = readFileSync(0, 'utf8');
  else candidateText = signature;
} catch (e) { die(`cannot read candidate: ${e.message}`, 2); }

const candidate = shg(candidateText);

// score every non-test function/method body. finding 16: the lexical path serves from the
// map-time sidecar (exact shingle SETS — results byte-identical to the live path) with an exact
// size-ratio precut (J <= min/max, so a pair that cannot reach the 0.15 floor skips the
// intersection); every call previously re-read and re-shingled the whole repo. Stale/absent
// sidecar or --structural -> the live path, unchanged.
const reader = sourceReader(root);
const bodyOf = reader.bodyOf;
const tierOf = (s) => (s >= BANDS.high ? 'high' : s >= BANDS.medium ? 'medium' : 'low'); // THE bands (lib/shingles.mjs)
const simIndex = structural ? null : loadSimilarIndex(abs);

const matches = [];
let scanned = 0;
for (const n of graph.nodes) {
  if (n.kind !== 'function' && n.kind !== 'method') continue;
  if (isTestFile(n.file)) continue;
  scanned++; // reuse this pass for the payload count (was a second full filter over nodes)
  let sim;
  const rec = simIndex && simIndex.nodes[n.id];
  if (rec) {
    if (!candidate.size || !rec.n) continue;
    if (Math.min(candidate.size, rec.n) / Math.max(candidate.size, rec.n) < BANDS.low) continue; // exact bound
    let inter = 0;
    for (const s of rec.sh) if (candidate.has(s)) inter++;
    sim = inter / (candidate.size + rec.n - inter);
  } else {
    const src = bodyOf(n);
    if (src == null) continue;
    sim = jaccard(candidate, shg(capBody(src))); // finding #26: node body capped (candidate stays uncapped) so live ≡ sidecar
  }
  if (sim < BANDS.low) continue; // exclude below the low band
  matches.push({ id: n.id, label: n.label, file: n.file, line: n.line, domain: n.domain, sim: +sim.toFixed(6), tier: tierOf(sim) });
}
matches.sort((a, b) => b.sim - a.sim || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const top = matches.slice(0, k);

// API F3 (behavior BUG FIX): `count` was the capped length (top.length after slice(0, k)) —
// contradicting the fleet-wide "count is the true total" contract; the real match total was
// discarded and truncation was invisible. `count` is now the TRUE total; `more` marks the cap.
const payload = {
  candidate: { source: body != null ? 'body' : stdin ? 'stdin' : 'signature', shingles: candidate.size, mode: structural ? 'structural' : 'lexical' },
  index: simIndex ? 'sidecar' : 'live',
  bodyLineCap: BODY_LINE_CAP, // finding #26: existing bodies shingled on their first N lines (candidate uncapped)
  matches: top, count: matches.length, scanned,
};
if (matches.length > top.length) payload.more = { remaining: matches.length - top.length };

if (json) { emitJson(payload); } else {
  console.log(`find-similar: candidate (${payload.candidate.shingles} shingles) vs ${payload.scanned} existing symbols`);
  if (!top.length) console.log('  no similar existing symbol (>=15%) — looks novel; safe to write.');
  else {
    console.log(`  ${top.length} similar — consider reusing instead of re-implementing:`);
    for (const m of top) console.log(`  [${(m.sim * 100).toFixed(0).padStart(3)}% ${m.tier.padEnd(6)}] ${m.id}  (${m.file}:${m.line})`);
  }
  finish(0);
}
