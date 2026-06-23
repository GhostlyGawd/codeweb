// codeweb tree-sitter SPIKE — exact-vs-regex evidence harness.
//
// Runs the tree-sitter extractor on the fixture and, for every function/method, compares its EXACT
// (AST/McCabe) cyclomatic against the value the SHIPPING regex engine produces — by calling the real
// scripts/lib/complexity.mjs (NOT a reimplementation) on the same source span the extractor feeds it.
// Then lists the dynamic-dispatch call edges the AST resolves that the regex engine drops to zero.
//
// Output is the raw material for the go/no-go in GO-NO-GO.md. Run: npm run spike

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { extractFile, serialize } from './extract-ts.mjs';
import { cyclomatic } from '../../scripts/lib/complexity.mjs'; // the SHIPPING F4 regex approximation

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, 'fixture/sample.ts');
const REL = relative(HERE, FIXTURE).replace(/\\/g, '/');

const src = readFileSync(FIXTURE, 'utf8');
const lines = src.split(/\r?\n/);
const graph = await extractFile(FIXTURE, REL);

// Reconstruct the body slice the regex extractor would hand to cyclomatic(): lines [line, line+loc).
const regexCx = (node) => cyclomatic(lines.slice(node.line - 1, node.line - 1 + node.loc).join('\n'), 'js');

const fns = graph.nodes.filter((n) => n.kind === 'function' || n.kind === 'method');
const rows = fns.map((n) => {
  const exact = n.complexity;
  const regex = regexCx(n);
  return { name: n.label, kind: n.kind, exact, regex, delta: regex - exact };
}).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));

const diverged = rows.filter((r) => r.delta !== 0);
const absErr = rows.reduce((s, r) => s + Math.abs(r.delta), 0);
const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0);

const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
console.log('\n=== EXACT (tree-sitter / McCabe) vs REGEX (shipping F4) cyclomatic ===');
console.log(`fixture: ${REL}  ·  same decision definition both sides → every gap is a precision gap\n`);
console.log(`  ${pad('symbol', 12)} ${pad('kind', 9)} ${padL('exact', 6)} ${padL('regex', 6)} ${padL('Δ', 4)}  why the regex diverges`);
console.log('  ' + '-'.repeat(72));
const WHY = {
  render: 'strips the whole template literal → misses && + ternary in ${…}',
  validate: 'counts optional param `cfg?:` `?` as a ternary (+1)',
  execute: 'matches `.catch(` as `\\bcatch\\b` — a Promise method, not try/catch (+1)',
};
for (const r of rows) {
  const why = r.delta === 0 ? '(exact match)' : (WHY[r.name] || '');
  console.log(`  ${pad(r.name, 12)} ${pad(r.kind, 9)} ${padL(r.exact, 6)} ${padL(r.regex, 6)} ${padL((r.delta > 0 ? '+' : '') + r.delta, 4)}  ${why}`);
}
console.log('  ' + '-'.repeat(72));
console.log(`  symbols: ${rows.length}   diverged: ${diverged.length} (${Math.round(100 * diverged.length / rows.length)}%)   Σ|Δ|: ${absErr}   max|Δ|: ${maxAbs}   mean|Δ|: ${(absErr / rows.length).toFixed(2)}`);

console.log('\n=== DYNAMIC-DISPATCH call edges resolved by the AST (regex engine emits 0 of these) ===');
for (const e of graph.edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to))) {
  console.log(`  ${e.from.split(':')[1]} → ${e.to.split(':')[1]}   [resolved via ${e.via}]`);
}
console.log(`  dispatch edges resolved: ${graph.edges.length}   ·   regex baseline: 0 (drops every obj.method())`);

// correctly-dropped, no-guess receivers (precision guard) — surfaced so the writeup can cite them
console.log('\n=== correctly DROPPED (no type → no guess; precision preserved) ===');
console.log('  doWork().catch(onError)   receiver is a call result, not a typed name');
console.log('  items.map(…) / .join(…)   `items: string[]` is an array type, no receiver class');

// persist the enriched graph for inspection / determinism baseline
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out/graph.json'), serialize(graph));
console.log('\n[spike] enriched graph → out/graph.json\n');
