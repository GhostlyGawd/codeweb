// AC-12 (ac_12): agent-fallback provenance is labeled and surfaced. The codebase-anatomy skill
// stamps meta.engine as hybrid|tools|read; the deterministic pipeline stamps ctags|regex. The
// values existed but nothing downstream read them — an agent-built map answered with
// deterministic-tier authority (reports/PLAN.md finding 12). The briefing (the day-one surface,
// injected at session start) now carries the provenance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBrief, renderBrief } from '../scripts/lib/brief-core.mjs';
import { normalizeGraph, buildIndex } from '../scripts/lib/graph-ops.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

const graphWith = (engine) => normalizeGraph({
  meta: { target: 'label-fixture', engine },
  nodes: [
    { id: 'a.js:one', label: 'one', file: 'a.js', domain: 'app', exports: true },
    { id: 'a.js:two', label: 'two', file: 'a.js', domain: 'app', exports: false },
  ],
  edges: [{ from: 'a.js:one', to: 'a.js:two', kind: 'call' }],
  domains: [], overlaps: [],
});

test('ac_12: every agent-path engine value (hybrid|tools|read) labels the brief payload', () => {
  for (const engine of ['hybrid', 'tools', 'read']) {
    const g = graphWith(engine);
    const b = buildBrief(g, buildIndex(g));
    assert.ok(b.engine, `${engine}: payload carries the provenance block`);
    assert.equal(b.engine.source, 'agent');
    assert.equal(b.engine.mode, engine);
    assert.match(b.engine.note, /unverified/, 'the note says what the label means');
  }
});

test('ac_12: deterministic-pipeline engines (ctags|regex) carry no agent label', () => {
  for (const engine of ['ctags', 'regex', undefined]) {
    const g = graphWith(engine);
    const b = buildBrief(g, buildIndex(g));
    assert.equal(b.engine, undefined, `${engine}: no provenance block for the deterministic pipeline`);
  }
});

test('ac_12: the rendered brief (session-start injection) says the provenance out loud', () => {
  const g = graphWith('read');
  const text = renderBrief(buildBrief(g, buildIndex(g)));
  assert.match(text, /provenance: agent-extracted/, 'the one-line caveat renders');
});

test('ac_12: the fallback schema documents meta.engine as the provenance label', () => {
  const schema = readFileSync(join(PLUGIN_ROOT, 'skills', 'codebase-anatomy', 'references', 'graph-schema.md'), 'utf8');
  assert.match(schema, /provenance label/, 'graph-schema.md tells agents the stamp is load-bearing');
});
