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

// Round 2, finding #23 — a pinned corpus whose file graph is one DENSE files-wide SCC: file i
// imports+calls file (i+1)%files (the ring guarantees the SCC), plus `extraPairDeps` extra
// cross-file deps densifying it so no single file->file cut breaks it — the break-cycles worst
// case (every candidate tried, verified:false), which the acyclic-by-construction corpus above
// can never exercise (the 22.8s whole-graph re-verify regression was gate-invisible exactly
// because of that). The pre-fix cost was per-candidate × WHOLE-graph edges, so each file also
// carries `fillerFnsPerFile` same-file-calling filler functions — cycle-neutral weight that makes
// a re-verify regression visible in the factor gate (and, written beside writeLoadedCorpus output
// in one tree, reproduces the finding's 93k-edge measurement; file/function names are disjoint by
// prefix, so the two generators compose). Deterministic: seeded LCG, no Date/Math.random.
export function writeCyclicCorpus(dir, { files = 60, extraPairDeps = 240, fillerFnsPerFile = 40, seed = 0xC7C11C } = {}) {
  mkdirSync(dir, { recursive: true });
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = (n) => Math.floor(rnd() * n);

  const deps = Array.from({ length: files }, () => new Set());
  for (let i = 0; i < files; i++) deps[i].add((i + 1) % files); // the ring: one files-wide SCC
  // The first `files` extras are a deterministic stride-2 second ring: with both rings present,
  // removing ANY single file->file pair leaves the whole SCC strongly connected (cut a ring pair
  // (a,a+1) and a+1 is still reached via stride-2 from a+(files-1); cut a stride-2 or random pair
  // and the full ring survives) — so "no single-pair cut breaks it" is GUARANTEED, not luck,
  // whenever extraPairDeps >= files. The remainder is seeded-random densification.
  let added = 0, guard = 0;
  for (let i = 0; i < files && added < extraPairDeps; i++) { deps[i].add((i + 2) % files); added++; }
  while (added < extraPairDeps && guard++ < extraPairDeps * 60) {
    const from = pick(files), to = pick(files);
    if (to === from || deps[from].has(to)) continue;
    deps[from].add(to); added++;
  }
  for (let i = 0; i < files; i++) {
    const targets = [...deps[i]]; // insertion order: ring edge first, extras in seeded order
    const out = targets.map((t) => `import { cyc_${t}_0 } from './cyc${t}.mjs';`);
    out.push(`export function cyc_${i}_0(x) {`);
    targets.forEach((t, k) => out.push(`  const v${k} = cyc_${t}_0(x + ${k});`));
    out.push(`  return x + ${targets.length};`);
    out.push('}');
    for (let k = 0; k < fillerFnsPerFile; k++) {
      out.push(`export function cyc_${i}_p${k}(x) {`);
      out.push(`  return cyc_${i}_p${(k + 1) % fillerFnsPerFile}(x) + cyc_${i}_p${(k + 2) % fillerFnsPerFile}(x) + ${k};`);
      out.push('}');
    }
    writeFileSync(join(dir, `cyc${i}.mjs`), out.join('\n') + '\n');
  }
  return { files, extraPairDeps: added, fns: files * (1 + fillerFnsPerFile) };
}
