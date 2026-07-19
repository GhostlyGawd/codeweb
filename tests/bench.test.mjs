// codeweb bench — the oracle A/B packaged as a product command. The engine itself is pinned by the
// byte-identical reproduction of bench/results/oracle-ab.json; these tests pin the CLI contract:
// cost-only degradation without a compiler oracle, graded mode with one, and the text summary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

const HAS_RG = spawnSync('rg', ['--version'], { stdio: 'ignore' }).error == null;
let TS_PATH = process.env.TS_MODULE || null;
if (!TS_PATH) { try { TS_PATH = createRequire(join(process.cwd(), 'noop.js')).resolve('typescript'); } catch {} }

// a hub symbol with three callers — passes the bench sampling filter (exported product
// function, label >= 4 chars, fan-in >= 3)
const FIXTURE = {
  'util.ts': 'export function used(): number {\n  return 1;\n}\n',
  'a.ts': "import { used } from './util';\nexport function goA() {\n  return used();\n}\n",
  'b.ts': "import { used } from './util';\nexport function goB() {\n  return used();\n}\n",
  'c.ts': "import { used } from './util';\nexport function goC() {\n  return used();\n}\n",
};

function buildMapped() {
  const dir = tmpDir('codeweb-bench-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, graph: join(ws, 'graph.json') };
}

test('bench: cost-only mode without a compiler oracle (graceful degradation)', () => {
  const { dir, graph } = buildMapped();
  try {
    const r = runNode(script('bench.mjs'), [graph, '--json'], { env: { ...process.env, TS_MODULE: '/nonexistent/typescript' } });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.oracle.available, false, 'no oracle -> ungraded');
    assert.match(out.oracle.reason, /typescript/i, 'the reason names the missing dependency');
    assert.ok(out.rows.length >= 1, 'the hub symbol is benched');
    const hub = out.rows.find((row) => row.symbol.endsWith('util.ts:used'));
    assert.ok(hub, `util.ts:used sampled (got ${out.rows.map((x) => x.symbol).join(', ')})`);
    assert.ok(hub.codeweb.bytes > 0 && hub.codeweb.pages >= 1, 'codeweb arm measured');
    assert.equal(hub.codeweb.recall, undefined, 'no recall without an oracle');
    assert.ok(out.codeweb.meanBytes > 0, 'cost aggregate present');
    if (HAS_RG) assert.ok(out.grep.meanBytes > 0, 'grep arm measured when rg exists');
    else assert.ok(out.grep.unavailable, 'grep arm reports unavailable without rg');
  } finally { cleanup(dir); }
});

test('bench: compiler-graded mode on a TS fixture', (t) => {
  if (!TS_PATH) { t.skip('typescript not resolvable (set TS_MODULE to enable)'); return; }
  const { dir, graph } = buildMapped();
  try {
    const r = runNode(script('bench.mjs'), [graph, '--json'], { env: { ...process.env, TS_MODULE: TS_PATH } });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.oracle.available, true, `oracle should grade (got ${JSON.stringify(out.oracle)})`);
    assert.equal(out.codeweb.meanRecall, 1, 'codeweb finds all three compiler-verified caller files');
    assert.equal(out.codeweb.meanPrecision, 1, 'and nothing else');
    if (HAS_RG) assert.equal(out.grep.meanRecall, 1, 'grep also finds them on this trivial fixture');
  } finally { cleanup(dir); }
});

test('bench: text summary is the default surface', () => {
  const { dir, graph } = buildMapped();
  try {
    const r = runNode(script('bench.mjs'), [graph], { env: { ...process.env, TS_MODULE: '/nonexistent/typescript' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /codeweb bench — /, 'headline');
    assert.match(r.stdout, /Q1 "who depends on X\?"/, 'discovery section');
    assert.match(r.stdout, /Q2 "what transitively breaks\?"/, 'blast-radius section');
    assert.match(r.stdout, /ungraded — /, 'states why grading is off');
  } finally { cleanup(dir); }
});
