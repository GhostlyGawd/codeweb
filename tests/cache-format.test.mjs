// Round 2, finding #19 — the v16 scan-cache format: edge tuples interned (ids + [from,to,kind]
// triples), `syms` dropped (nodes/ranges are the one stored copy), fragment sha1 skip-write.
// The migration contract is the SCANNER_VERSION ladder: ANY version mismatch discards the cache
// wholesale — one cold rebuild, never a crash, output byte-equal to no-cache.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');
const FIXTURE = {
  'a.js': 'export function a1(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\n',
  'b.js': 'export function b1(y) { return y * 2; }\n',
  'c.js': 'import { a1 } from "./a.js";\nexport function c1() { return a1(3); }\n',
};

function extract(root, out, cache, extra = []) {
  const r = runNode(EXTRACT, [root, '--out', out, '--cache', cache, '--no-ctags', ...extra]);
  assert.equal(r.status, 0, `extract failed: ${r.stderr}`);
  return r.stderr;
}

test('CF-SHAPE: v16 entries hold interned edges and NO syms; warm no-change replays byte-identically', () => {
  const dir = tmpDir('codeweb-cf-'); const root = join(dir, 'src'); writeTree(root, FIXTURE);
  const cachePath = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cachePath);
    const cache = readJSON(cachePath);
    assert.equal(typeof cache.version, 'number');
    for (const [rel, e] of Object.entries(cache.files)) {
      assert.ok(!('syms' in e), `${rel}: syms dropped from the cache (stored 3x pre-#19)`);
      assert.ok(Array.isArray(e.nodes) && Array.isArray(e.ranges), `${rel}: nodes+ranges are the stored product`);
      assert.ok(Array.isArray(e.ids), `${rel}: interned endpoint id table present`);
      for (const t of e.edges) {
        assert.ok(Array.isArray(t) && t.length === 3 && t.every((x) => Number.isInteger(x)), `${rel}: edge stored as [fromIdx,toIdx,kindIdx] (got ${JSON.stringify(t)})`);
        assert.ok(t[0] < e.ids.length && t[1] < e.ids.length, `${rel}: edge indexes resolve in ids`);
      }
    }
    // warm no-change: stamp tier, zero scans, zero re-edges, fragment byte-equal + skip-write
    const before = readFileSync(join(dir, 'g0.json'));
    const stderr = extract(root, join(dir, 'g0.json'), cachePath);
    assert.match(stderr, /scanned 0\/3/, `no-change warm run reads nothing (${stderr})`);
    assert.match(stderr, /edged 0\/3/, 'no-change warm run re-edges nothing');
    assert.match(stderr, /\(unchanged\) -> /, 'fragment skip-write announces itself (T-19.2)');
    assert.ok(readFileSync(join(dir, 'g0.json')).equals(before), 'fragment bytes stable');
  } finally { cleanup(dir); }
});

test('CF-HASH-HIT: touched-but-unchanged file replays the full product set without a re-scan', () => {
  const dir = tmpDir('codeweb-cf-'); const root = join(dir, 'src'); writeTree(root, FIXTURE);
  const cachePath = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cachePath);
    // touch a.js: new mtime, identical bytes -> stamp tier misses, content-hash tier replays
    const now = new Date(Date.now() + 5000);
    utimesSync(join(root, 'a.js'), now, now);
    const stderr = extract(root, join(dir, 'g1.json'), cachePath);
    assert.match(stderr, /scanned 0\/3/, `hash hit does not re-scan (${stderr})`);
    assert.match(stderr, /edged 0\/3/, 'hash hit replays cached edges');
    // and the refreshed stamp makes the NEXT run a pure stamp hit again
    const stderr2 = extract(root, join(dir, 'g2.json'), cachePath);
    assert.match(stderr2, /scanned 0\/3/, 'stamp refreshed by the hash-hit run');
    // output equals a cold full extract byte-for-byte
    const r = runNode(EXTRACT, [root, '--out', join(dir, 'cold.json'), '--cache', join(dir, 'coldc.json'), '--no-ctags', '--full']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(join(dir, 'g1.json')).equals(readFileSync(join(dir, 'cold.json'))), 'hash-hit replay == cold full, byte-for-byte');
  } finally { cleanup(dir); }
});

test('CF-MIGRATE: a stale-version cache (planted poison) is discarded — cold rebuild, byte-equal to no-cache, cache rewritten at the live version', () => {
  const dir = tmpDir('codeweb-cf-'); const root = join(dir, 'src'); writeTree(root, FIXTURE);
  const cachePath = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cachePath);
    const live = readJSON(cachePath);
    // plant a previous-generation cache: version-1, old shape (syms present, object edges), with
    // POISON that would corrupt the output if any tier replayed it
    const poisoned = {
      version: live.version - 1, engine: live.engine, rulesSig: live.rulesSig, fileSig: live.fileSig,
      symbolSig: live.symbolSig, bindSig: live.bindSig,
      files: Object.fromEntries(Object.entries(live.files).map(([rel, e]) => [rel, {
        hash: e.hash, stamp: e.stamp, dyn: e.dyn,
        syms: [{ name: 'POISON_SYM', line: 1, kind: 'function', exports: true }],
        nodes: [{ id: `${rel}:POISON_SYM`, label: 'POISON_SYM', kind: 'function', file: rel, line: 1, loc: 1, exports: true, domain: '', summary: '', role: 'product' }],
        ranges: [{ id: `${rel}:POISON_SYM`, name: 'POISON_SYM', start: 1, end: 1, kind: 'function' }],
        edges: [{ from: `${rel}:POISON_SYM`, to: 'b.js:b1', kind: 'call', weight: 1 }],
      }])),
    };
    writeFileSync(cachePath, JSON.stringify(poisoned));
    const stderr = extract(root, join(dir, 'g1.json'), cachePath);
    assert.match(stderr, /scanned 3\/3/, `version mismatch -> cold rebuild (${stderr})`);
    assert.ok(!readFileSync(join(dir, 'g1.json'), 'utf8').includes('POISON_SYM'), 'no poisoned product replayed');
    const r = runNode(EXTRACT, [root, '--out', join(dir, 'nocache.json'), '--no-ctags']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(join(dir, 'g1.json')).equals(readFileSync(join(dir, 'nocache.json'))), 'post-migration output byte-equal to no-cache');
    assert.equal(readJSON(cachePath).version, live.version, 'cache rewritten at the live version');
  } finally { cleanup(dir); }
});

test('CF-SKIP-WRITE: an unchanged fragment is not rewritten (mtime stable), a changed one is', () => {
  const dir = tmpDir('codeweb-cf-'); const root = join(dir, 'src'); writeTree(root, FIXTURE);
  const cachePath = join(dir, 'cache.json');
  const out = join(dir, 'frag.json');
  try {
    extract(root, out, cachePath);
    const old = new Date('2020-01-02T03:04:05Z');
    utimesSync(out, old, old); // pin a recognizable mtime; a rewrite would replace it
    extract(root, out, cachePath);
    assert.equal(Math.round(statSync(out).mtimeMs), old.getTime(), 'identical fragment -> write skipped');
    writeFileSync(join(root, 'b.js'), FIXTURE['b.js'] + 'export function b2() { return 9; }\n');
    const stderr = extract(root, out, cachePath);
    assert.ok(!/\(unchanged\)/.test(stderr), 'changed fragment is written');
    assert.notEqual(Math.round(statSync(out).mtimeMs), old.getTime(), 'changed fragment -> file rewritten');
    assert.ok(readFileSync(out, 'utf8').includes('b2'), 'new symbol present');
  } finally { cleanup(dir); }
});
