// codeweb tree-sitter SPIKE — determinism check (F9 IE-EQUIVALENCE style).
//
// codeweb's contract is "one graph, one schema" and reproducibility: the same input + pinned grammar
// must yield a byte-identical graph. tree-sitter parses deterministically, so this asserts that the
// extractor's serialized output is identical across repeated runs (and exercises a fresh subprocess
// run too, to rule out in-process parser-state carryover). Exits non-zero on any mismatch.
//
// Run: npm run determinism

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, join } from 'node:path';
import { extractFile, serialize } from './extract-ts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, 'fixture/sample.ts');
const REL = relative(HERE, FIXTURE).replace(/\\/g, '/');
const sha = (s) => createHash('sha256').update(s).digest('hex');

// Three independent derivations: two in-process (fresh parse each), one via a separate subprocess.
const a = serialize(await extractFile(FIXTURE, REL));
const b = serialize(await extractFile(FIXTURE, REL));
const c = execFileSync(process.execPath, [join(HERE, 'extract-ts.mjs'), FIXTURE], { encoding: 'utf8' });
// the CLI emits relative-to-HERE ids identical to REL, so c is directly comparable
const hashes = { 'in-process #1': sha(a), 'in-process #2': sha(b), 'subprocess': sha(c.trim()) };

console.log('=== determinism check (pinned grammar) ===');
for (const [k, v] of Object.entries(hashes)) console.log(`  ${k.padEnd(16)} sha256 ${v.slice(0, 16)}…`);

const allEqual = a === b && a === c.trim();
if (allEqual) {
  console.log(`\n  PASS — all 3 derivations byte-identical (${a.length} bytes)`);
  process.exit(0);
}
console.error('\n  FAIL — derivations diverged:');
if (a !== b) console.error('    in-process #1 != in-process #2 (parser state carryover?)');
if (a !== c.trim()) console.error('    in-process != subprocess (environment-dependent output?)');
process.exit(1);
