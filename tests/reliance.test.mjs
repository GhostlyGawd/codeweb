// Caller-reliance contracts — the #1 real-world breaking edit is changing a return shape a
// caller still destructures. The explain card (and therefore the pre-edit hook, which embeds
// its summary) must say what callers actually take off the result, how often it's awaited,
// and the argument counts in use. Conservative: only call-site-line patterns count.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { preview } from '../hooks/pre-edit-impact.mjs';

const FIXTURE = {
  'util.js': 'export function getConfig(url, opts) {\n  return { timeout: 1, retries: 2, port: 3 };\n}\n',
  'a.js': 'import { getConfig } from "./util.js";\nexport function useA() {\n  const { timeout, retries } = getConfig("x");\n  return timeout + retries;\n}\n',
  'b.js': 'import { getConfig } from "./util.js";\nexport async function useB() {\n  const cfg = await getConfig("y", 1);\n  return cfg;\n}\n',
  'c.js': 'import { getConfig } from "./util.js";\nexport function useC() {\n  return getConfig().port;\n}\n',
};

function buildMapped() {
  const dir = tmpDir('codeweb-reliance-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, graph: join(ws, 'graph.json') };
}

test('explain card reports fields, awaited fraction, and arg range from real call sites', () => {
  const { dir, graph } = buildMapped();
  try {
    const r = runNode(script('explain.mjs'), [graph, 'getConfig', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const card = JSON.parse(r.stdout).cards[0];
    assert.ok(card.callersRelyOn, 'reliance detected');
    assert.deepEqual(card.callersRelyOn.fields, ['port', 'retries', 'timeout'], 'destructured + member-accessed fields');
    assert.equal(card.callersRelyOn.sites, 3, 'all three call sites inspected');
    assert.equal(card.callersRelyOn.awaited, 1, 'one caller awaits');
    assert.deepEqual(card.callersRelyOn.argRange, [0, 2], 'arg counts span 0..2');
    assert.match(card.summary, /callers use \{port, retries, timeout\} of the result — keep those/, 'the contract is IN the summary (ambient via the hook)');

    const t = runNode(script('explain.mjs'), [graph, 'getConfig']);
    assert.match(t.stdout, /callers rely on: /, 'text mode carries the line');
  } finally { cleanup(dir); }
});

test('the pre-edit hook delivers the reliance line without being asked', () => {
  const { dir } = buildMapped();
  try {
    const msg = preview(JSON.stringify({ tool_input: { file_path: join(dir, 'util.js') } }));
    assert.ok(msg, 'advisory produced for the depended-on file');
    assert.match(msg, /callers use \{port, retries, timeout\}/, 'the contract arrives ambiently at edit time');
  } finally { cleanup(dir); }
});

test('no callers or unreadable source -> no reliance claim (absence is honest)', () => {
  const { dir, graph } = buildMapped();
  try {
    writeFileSync(join(dir, 'lonely.js'), 'export function lonely() {\n  return 1;\n}\n');
    const r0 = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(dir, '.codeweb', 'fragment.json')]);
    assert.equal(r0.status, 0, r0.stderr);
    const frag = readJSON(join(dir, '.codeweb', 'fragment.json'));
    writeFileSync(graph, JSON.stringify({ ...frag, domains: [], overlaps: [] }));
    const r = runNode(script('explain.mjs'), [graph, 'lonely', '--json']);
    const card = JSON.parse(r.stdout).cards[0];
    assert.equal(card.callersRelyOn, undefined, 'zero call sites -> no reliance field at all');
  } finally { cleanup(dir); }
});
