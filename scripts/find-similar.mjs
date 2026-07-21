#!/usr/bin/env node
// codeweb find-similar — reuse-at-write-time. Before an agent writes a function, it asks "does
// something already do this?": shingle a candidate body/signature and rank existing non-test
// function bodies by token-shingle Jaccard. Turns codeweb's post-hoc duplication detection into
// write-time PREVENTION. Read-only, deterministic. Shares the K=3 shingler with overlap.mjs via
// ./lib/shingles.mjs (one truth).
//
// Usage:
//   node find-similar.mjs <graph.json> (--body <file> | --stdin | --signature "<text>") [--k N] [--json]
// Exit: 0 ok (even with zero matches), 2 usage / source unavailable.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, isTestFile } from './lib/graph-ops.mjs';
import { shingles, jaccard } from './lib/shingles.mjs';
import { structuralShingles } from './lib/skeleton.mjs'; // F6: Type-2 (rename-invariant) similarity
import { loadSimilarIndex } from './lib/similar-index.mjs'; // finding 16: map-time shingle sets — zero source reads on the hot path

const USAGE = 'usage: find-similar.mjs <graph.json> (--body <file> | --stdin | --signature "<text>") [--k N] [--structural] [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, finish, loadGraph, sourceReader } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, body = null, stdin = false, signature = null, k = 10, structural = false; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--stdin') stdin = true;
  else if (t === '--structural') structural = true;
  else if (t === '--body') body = argv[++i];
  else if (t === '--signature') signature = argv[++i];
  else if (t === '--k') k = Math.max(1, parseInt(argv[++i], 10) || 10);
  else if (!t.startsWith('-')) pos.push(t);
}
// F6: --structural ranks by skeleton (identifier-normalized) shingles, so a clone with all variables
// renamed scores ~1 even when its lexical (token) similarity is lower. Lexical is the default.
const shg = structural ? (s) => structuralShingles(s, 3) : (s) => shingles(s, 3);
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
const tierOf = (s) => (s >= 0.6 ? 'high' : s >= 0.35 ? 'medium' : 'low'); // overlap.mjs bands
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
    if (Math.min(candidate.size, rec.n) / Math.max(candidate.size, rec.n) < 0.15) continue; // exact bound
    let inter = 0;
    for (const s of rec.sh) if (candidate.has(s)) inter++;
    sim = inter / (candidate.size + rec.n - inter);
  } else {
    const src = bodyOf(n);
    if (src == null) continue;
    sim = jaccard(candidate, shg(src));
  }
  if (sim < 0.15) continue; // exclude below the low band
  matches.push({ id: n.id, label: n.label, file: n.file, line: n.line, domain: n.domain, sim: +sim.toFixed(6), tier: tierOf(sim) });
}
matches.sort((a, b) => b.sim - a.sim || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const top = matches.slice(0, k);

const payload = {
  candidate: { source: body != null ? 'body' : stdin ? 'stdin' : 'signature', shingles: candidate.size, mode: structural ? 'structural' : 'lexical' },
  index: simIndex ? 'sidecar' : 'live',
  matches: top, count: top.length, scanned,
};

if (json) { emitJson(payload); } else {
  console.log(`find-similar: candidate (${payload.candidate.shingles} shingles) vs ${payload.scanned} existing symbols`);
  if (!top.length) console.log('  no similar existing symbol (>=15%) — looks novel; safe to write.');
  else {
    console.log(`  ${top.length} similar — consider reusing instead of re-implementing:`);
    for (const m of top) console.log(`  [${(m.sim * 100).toFixed(0).padStart(3)}% ${m.tier.padEnd(6)}] ${m.id}  (${m.file}:${m.line})`);
  }
  finish(0);
}
