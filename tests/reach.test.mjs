// Growth playbook Batch 8 — AI ideas + reach (AI-IDEAS.md 1/3/4 + FUNNEL §5). The fence rules
// everything here: deterministic core, agent edges. LLM output lives ONLY in the consuming
// agent's workflow (commands/skills) or in provenance-labeled sidecars — never in graph.json,
// never in a runtime query path, never authoring the gate's verdict.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpDir, cleanup, script, runNode, PLUGIN_ROOT, readJSON } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');

test('RE1: /codeweb-apply exists — ready tier only, deterministic gate owns every verdict', () => {
  const cmd = read('commands/apply.md');
  assert.match(cmd, /ready/i, 'scoped to the ready tier');
  assert.match(cmd, /revert/i, 'the failure path is a revert, not a shrug');
  assert.match(cmd, /codeweb_simulate|simulate-edit/, 'pre-flights every step');
  assert.match(cmd, /codeweb_diff|diff\.mjs/, 'the gate verdict is deterministic');
  assert.match(cmd, /never|not/i, 'states what it must not touch');
  assert.match(read('skills/codebase-anatomy/SKILL.md'), /[Ee]xecute the campaign/, 'the skill carries the loop');
});

test('RE2: /codeweb-pitch exists — every number pinned to an artifact, review before sharing', () => {
  const cmd = read('commands/pitch.md');
  assert.match(cmd, /citation|cite|artifact path/i, 'no naked numbers');
  assert.match(cmd, /review/i, 'the user reviews before anything leaves the machine');
  assert.match(cmd, /campaign|optimize|trend/, 'built from artifacts the user already has');
});

test('RE3: narration is a provenance-labeled sidecar — brief renders it, absence changes nothing', async () => {
  const { loadNarration, NARRATION_SIDECAR } = await import('../scripts/lib/narration.mjs');
  const { buildBrief, renderBrief } = await import('../scripts/lib/brief-core.mjs');
  const { normalizeGraph, buildIndex } = await import('../scripts/lib/graph-ops.mjs');
  const dir = tmpDir('codeweb-reach-');
  try {
    const gp = join(dir, 'graph.json');
    const graph = {
      meta: { target: 'n-fixture' },
      nodes: [
        { id: 'a.js:alpha', label: 'alpha', kind: 'function', file: 'a.js', domain: 'core', role: 'product' },
        { id: 'b.js:beta', label: 'beta', kind: 'function', file: 'b.js', domain: 'core', role: 'product' },
      ],
      edges: [{ from: 'a.js:alpha', to: 'b.js:beta', kind: 'call' }],
      domains: [{ name: 'core', nodes: 2, summary: '2 symbols across 2 file(s)' }],
      overlaps: [],
    };
    writeFileSync(gp, JSON.stringify(graph));
    assert.equal(loadNarration(gp), null, 'no sidecar -> null -> exactly today');

    const st = statSync(gp);
    writeFileSync(join(dir, NARRATION_SIDECAR), JSON.stringify({
      version: 1,
      stamp: { graphMtimeMs: st.mtimeMs, graphSize: st.size },
      domains: { core: 'Dispatches requests and merges configuration.' },
      symbols: { 'a.js:alpha': 'The request entry point.' },
    }));
    const narration = loadNarration(gp);
    assert.ok(narration, 'fresh stamp -> loaded');

    const g = normalizeGraph(JSON.parse(readFileSync(gp, 'utf8')));
    const brief = buildBrief(g, buildIndex(g));
    brief.narration = narration;
    const text = renderBrief(brief);
    assert.match(text, /Dispatches requests/, 'the domain finally says what it is FOR');
    assert.match(text, /agent-written/, 'provenance label on every rendered sentence');

    writeFileSync(gp, JSON.stringify({ ...graph, meta: { ...graph.meta, x: 1 } })); // graph changed
    assert.equal(loadNarration(gp), null, 'stale stamp -> narration drops out (never misleads)');
  } finally { cleanup(dir); }
});

test('RE4: --serve serves the workspace on localhost only', async () => {
  const dir = tmpDir('codeweb-reach-');
  try {
    mkdirSync(join(dir, 'ws'), { recursive: true });
    writeFileSync(join(dir, 'ws', 'report.html'), '<title>served-map</title>');
    const child = spawn(process.execPath, [script('serve.mjs'), join(dir, 'ws'), '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const port = await new Promise((res, rej) => {
      const t = setTimeout(() => { child.kill(); rej(new Error('serve did not announce a port')); }, 8000);
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += String(d);
        const m = buf.match(/127\.0\.0\.1:(\d+)/);
        if (m) { clearTimeout(t); res(Number(m[1])); }
      });
    });
    const res = await fetch(`http://127.0.0.1:${port}/report.html`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /served-map/);
    const miss = await fetch(`http://127.0.0.1:${port}/../secret`);
    assert.notEqual(miss.status, 200, 'no path traversal');
    child.kill();
    assert.match(runNode(script('run.mjs'), ['--help']).stdout, /--serve/, 'run.mjs documents the flag');
  } finally { cleanup(dir); }
});

test('RE5: quickstart bins exist with the Node guard and forward faithfully', () => {
  const pkg = readJSON(join(PLUGIN_ROOT, 'package.json'));
  for (const [name, file] of [['codeweb-query', 'bin/codeweb-query.mjs'], ['codeweb-diff', 'bin/codeweb-diff.mjs']]) {
    assert.equal(pkg.bin[name], file, `${name} registered`);
    assert.match(read(file), /major < 22/, `${file} carries the old-syntax Node guard`);
    const r = runNode(join(PLUGIN_ROOT, file), ['--help']);
    assert.equal(r.status, 0, `${file} --help exits 0: ${r.stderr}`);
    assert.match(r.stdout, /usage:/, `${file} forwards to the real CLI`);
  }
});

test('RE6: the acquisition ledger runs on a schedule and appends where the docs say', () => {
  const wf = read('.github/workflows/acquisition-ledger.yml');
  assert.match(wf, /schedule:/, 'runs without a human');
  assert.match(wf, /cron:/, 'cron-scheduled');
  assert.match(wf, /acquisition-ledger\.jsonl/, 'appends the JSONL series');
  assert.match(wf, /api\.npmjs\.org\/downloads|npmjs\.org/, 'snapshots npm downloads (the 14-day-expiry problem)');
});

test('RE7: the spend-gated AI work is documented as funded proposals, not silently run', () => {
  const doc = read('docs/proposals/ai-spend-gated.md');
  for (const idea of ['routing', 'vocab', 'fallback']) assert.match(doc, new RegExp(idea, 'i'), `covers the ${idea} idea`);
  assert.match(doc, /spend|budget|sponsor/i, 'names the funding dependency');
  assert.match(doc, /budgets\.json|replay-ab|agent-ab/, 'points at the existing harnesses');
  assert.match(doc, /not (been )?run|proposal/i, 'is explicit that nothing here has been executed');
});
