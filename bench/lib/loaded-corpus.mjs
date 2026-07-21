// Perf-quality finding 13(b) — a pinned synthetic corpus that actually TRIGGERS the analysis
// machinery. The old generator emitted 0-3 calls per function with unique names: 0 twin
// candidates, 0 same-name groups, overlap done in 21ms — the timed harness exercised an idle
// pipeline, which is how a quadratic advisor loop shipped unseen. This corpus guarantees load:
//   - every function calls 4-8 DISTINCT callees (>= TWIN_MIN_OUT, so every one is a twin
//     candidate; the default 60x20 = ~1,260 candidates clears overlap's LSH_MIN_NODES=800 and
//     the LSH path engages on its own),
//   - 15 planted same-name clusters (sharedHelperK x4 files, byte-identical 6-line bodies) that
//     the same-name + body-confirmation signals MUST find,
//   - bodies long enough for shingles to bite.
// Deterministic: seeded LCG, no Date/Math.random — the same corpus bytes every run.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeLoadedCorpus(dir, { files = 60, fnsPerFile = 21, seed = 0xC0FFEE } = {}) {
  mkdirSync(dir, { recursive: true });
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = (n) => Math.floor(rnd() * n);

  const names = []; // global registry so callees are unique bare names (package-scoped resolution)
  for (let f = 0; f < files; f++) for (let j = 0; j < fnsPerFile; j++) names.push(`fn_${f}_${j}`);

  const sharedBody = (k) => [
    `export function sharedHelper${k}(v) {`,
    '  const t = anchor0(v) + anchor1(v);',
    '  const u = anchor2(t) * anchor3(v);',
    '  if (u > t) return u - t;',
    '  const w = u + t * 2;',
    '  return w - 1;',
    '}',
  ].join('\n');

  let clusterSeq = 0;
  for (let f = 0; f < files; f++) {
    const out = [];
    if (f === 0) {
      out.push('export function anchor0(v) { return v + 1; }');
      out.push('export function anchor1(v) { return v + 2; }');
      out.push('export function anchor2(v) { return v * 2; }');
      out.push('export function anchor3(v) { return v - 3; }');
    }
    for (let j = 0; j < fnsPerFile; j++) {
      const self = f * fnsPerFile + j;
      const nCallees = 4 + pick(5); // 4-8 distinct callees -> always a twin candidate
      const callees = new Set();
      while (callees.size < nCallees && callees.size < self) {
        const c = names[pick(Math.max(1, self))]; // earlier functions only: acyclic by construction
        if (c !== names[self]) callees.add(c);
      }
      const cs = [...callees];
      if (cs.length < 4) { // the first few functions: pad with anchors to stay candidates
        for (const a of ['anchor0', 'anchor1', 'anchor2', 'anchor3']) { if (cs.length < 4) cs.push(a); }
      }
      out.push(`export function ${names[self]}(x) {`);
      out.push(`  const a = ${cs[0]}(x) + ${cs[1] ? cs[1] + '(x)' : '1'};`);
      out.push(`  const b = ${cs[2] ? cs[2] + '(a)' : 'a'} - ${cs[3] ? cs[3] + '(x)' : '2'};`);
      for (let e = 4; e < cs.length; e++) out.push(`  const e${e} = ${cs[e]}(b) + ${e};`);
      out.push(`  const c = a * b + ${pick(97)};`);
      out.push('  if (c > 100) return c - a;');
      out.push('  return c + 1;');
      out.push('}');
    }
    // plant one same-name shared helper per file, cycling 15 distinct names -> 4 copies each at 60 files
    out.push(sharedBody(clusterSeq % 15));
    clusterSeq++;
    writeFileSync(join(dir, `mod${f}.mjs`), out.join('\n') + '\n');
  }
  return { files, fns: files * fnsPerFile, plantedClusters: Math.min(15, files), copiesPerCluster: Math.floor(files / 15) };
}
