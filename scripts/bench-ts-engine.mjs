#!/usr/bin/env node
// Benchmark the optional tree-sitter complexity tier END-TO-END vs the regex F4 default, on a real
// target. This is the "performance gate" from docs/backlog-ast-tree-sitter.md (risk #3): does the
// parse cost stay acceptable before the tier is ever considered for default-on?
//
// Usage: node scripts/bench-ts-engine.mjs [target-dir]   (default: bench/corpus/axios)
//   --no-ctags is forced so symbol discovery is identical on both sides; the ONLY variable is which
//   engine computes complexity. Reports best-of-N wall time (subprocess) + per-symbol overhead.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2] || 'bench/corpus/axios';
if (!existsSync(target)) { console.error(`[bench] target not found: ${target}`); process.exit(1); }
const EXTRACT = resolve('scripts/extract-symbols.mjs');
const REPS = 3;

function timeRun(extra) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [EXTRACT, target, '--no-ctags', ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const ms = performance.now() - t0;
  if (r.status !== 0) { console.error(r.stderr); throw new Error('[bench] extract failed'); }
  const frag = JSON.parse(r.stdout);
  return { ms, symbols: frag.nodes.length, withCx: frag.nodes.filter((n) => n.complexity != null).length, engine: frag.meta.complexityEngine || 'regex' };
}
const best = (extra) => { let b = null; for (let i = 0; i < REPS; i++) { const r = timeRun(extra); if (!b || r.ms < b.ms) b = r; } return b; };

console.log(`[bench] target: ${target}   (best of ${REPS} runs each, --no-ctags)`);
const regex = best([]);
const ts = best(['--engine', 'tree-sitter']);
if (ts.engine === 'regex') { console.error('[bench] tree-sitter engine unavailable (optional dep not installed) — aborting'); process.exit(1); }

const overhead = ts.ms - regex.ms;
const perSym = ts.withCx > 0 ? overhead / ts.withCx : 0;
console.log(`[bench] symbols: ${regex.symbols} (${regex.withCx} with complexity)`);
console.log(`[bench] regex F4:    ${regex.ms.toFixed(0).padStart(6)} ms`);
console.log(`[bench] tree-sitter: ${ts.ms.toFixed(0).padStart(6)} ms   (${ts.engine})`);
console.log(`[bench] overhead:    ${('+' + overhead.toFixed(0)).padStart(6)} ms   = ${(ts.ms / regex.ms).toFixed(2)}x   = +${perSym.toFixed(3)} ms/symbol`);
