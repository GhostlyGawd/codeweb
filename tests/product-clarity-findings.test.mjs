import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup } from './helpers.mjs';
import { fingerprint } from '../scripts/lib/annotations.mjs';
import vm from 'node:vm';

function fixture() {
  return {
    meta: { target: 'decision-test' }, domains: [],
    nodes: [
      { id: 'a.js:encode', label: 'encode', file: 'a.js', line: 4, loc: 2 },
      { id: 'b.js:encode', label: 'encode', file: 'b.js', line: 7, loc: 2 },
      { id: 'caller.js:use', label: 'use', file: 'caller.js', line: 9, loc: 12 },
    ],
    edges: [{ from: 'caller.js:use', to: 'a.js:encode', kind: 'call' }],
    overlaps: [{ kind: 'duplicate-logic', confidence: 'high', bodySim: 1, severity: 'high',
      title: 'Repeated encode', nodes: ['a.js:encode', 'b.js:encode'], domains: [],
      evidence: 'Identical bodies', recommendation: 'Extract one shared helper.' }],
  };
}

function withReport(graph, check) {
  const dir = tmpDir('codeweb-finding-decisions-');
  try {
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify(graph));
    const result = runNode(script('build-report.mjs'), [graphPath]);
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    const embed = JSON.parse(html.match(/<script id="graph-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    check({ dir, html, embed, md: readFileSync(join(dir, 'report.md'), 'utf8'), disk: JSON.parse(readFileSync(graphPath, 'utf8')) });
  } finally { cleanup(dir); }
}

test('ac_17 short high-confidence matches are low-priority review candidates in HTML and Markdown', () => {
  const graph = fixture();
  withReport(graph, ({ embed, md, disk }) => {
    const d = embed.overlaps[0].decision;
    assert.ok(d, 'report embeds an explicit decision separate from detection confidence');
    assert.equal(d.confidence, 'high');
    assert.equal(d.priority, 'low');
    assert.equal(d.effort, 'unknown');
    assert.equal(d.medianLoc, 2);
    assert.match(d.reason, /coupling/i);
    assert.match(d.nextStep, /review/i);
    assert.match(md, /Body-match confidence:\*\* high/);
    assert.match(md, /Action priority:\*\* low/);
    assert.match(md, /coupling/i);
    assert.doesNotMatch(md, /→ consolidate|Extract one shared helper/);
    assert.equal(disk.overlaps[0].severity, 'high', 'presentation does not change the gate input');
    assert.equal(disk.overlaps[0].decision, undefined, 'presentation fields do not mutate the graph');
  });
});

test('ac_17 finding task contains source and actual caller context and reuses annotation identity', () => {
  const graph = fixture();
  withReport(graph, ({ embed, html, md, dir }) => {
    const d = embed.overlaps[0].decision;
    assert.ok(d, 'decision data exists');
    assert.deepEqual(d.sources.map(s => s.location), ['a.js:4', 'b.js:7']);
    assert.deepEqual(d.callers.map(s => s.location), ['caller.js:9']);
    assert.match(d.agentTask, /caller\.js:9/);
    assert.match(d.agentTask, /Do not change source/);
    assert.equal(d.fingerprint, fingerprint(graph.overlaps[0]));
    assert.match(d.exceptionCommand, /codeweb_annotate/);
    assert.match(d.exceptionCommand, new RegExp(d.fingerprint));
    assert.match(d.exceptionGuidance, /false positive/i);
    assert.match(d.exceptionGuidance, /gate/i);
    assert.equal(existsSync(join(dir, 'annotations.json')), false, 'rendering never records an exception');
    assert.match(html, /<button[^>]*id="copyAgentTask"[^>]*type="button"/);
    assert.match(html, /id="agentTaskText"[^>]*readonly/);
    assert.match(html, /Name matches/);
    assert.doesNotMatch(html, /merge these — same function|No pipeline findings — clean|No duplication found — clean/);
    assert.match(md, /caller\.js:9/);
    assert.match(md, /codeweb_annotate/);
  });
});

test('ac_17 absent, empty, dropped and suppressed findings never imply complete clean analysis', () => {
  for (const state of ['absent', 'empty', 'dropped', 'suppressed']) {
    const graph = fixture();
    if (state === 'absent') delete graph.overlaps;
    else graph.overlaps = [];
    if (state === 'dropped') graph.meta.overlapsDroppedAt = '2026-09-01';
    if (state === 'suppressed') graph.meta.suppressedOverlaps = 2;
    withReport(graph, ({ embed, md }) => {
      assert.ok(embed.findingState, state + ' has an explicit analysis state');
      assert.doesNotMatch(md, /clean|no issues/i);
      assert.match(md, /does not establish|not available|not recounted/i);
      if (state === 'dropped') assert.match(embed.findingState.message, /not recounted/i);
      if (state === 'suppressed') assert.match(embed.findingState.message, /2.*suppressed/i);
    });
  }
});

test('ac_17 unknown sizes and unconfirmed matches require review; caller and task output is bounded', () => {
  const graph = fixture();
  delete graph.nodes[0].loc;
  graph.overlaps[0].bodySim = null;
  graph.overlaps[0].title = 'x'.repeat(30000) + '</script><img src=x onerror=alert(1)>';
  for (let i = 0; i < 100; i++) {
    graph.nodes.push({ id: 'caller-' + i, label: 'caller', file: 'use-' + i + '.js', line: 1 });
    graph.edges.push({ from: 'caller-' + i, to: 'a.js:encode', kind: 'call' });
  }
  withReport(graph, ({ embed, html, md }) => {
    const d = embed.overlaps[0].decision;
    assert.ok(d);
    assert.equal(d.confidence, 'unverified');
    assert.equal(d.priority, 'review');
    assert.equal(d.medianLoc, null);
    assert.ok(d.callers.length <= 20);
    assert.equal(d.callersOmitted, 81);
    assert.ok(d.agentTask.length <= 12000);
    assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
    assert.doesNotMatch(md, /<img src=x onerror=alert\(1\)>/);
    assert.ok(md.length < 30000, 'Markdown is bounded per finding');
  });
});

test('ac_17 copy action waits for activation and provides clipboard success and failure feedback', async () => {
  const template = readFileSync(script('report-template.html'), 'utf8');
  const start = template.indexOf('function bindAgentTask(');
  const end = template.indexOf('function showOverlap(', start);
  assert.ok(start > 0 && end > start, 'test exercises the shipped action binding');
  for (const mode of ['success', 'rejected', 'unavailable']) {
    let copied = null, focused = false, selected = false;
    const elements = {
      copyAgentTask: {}, agentTaskStatus: {},
      agentTaskText: { focus() { focused = true; }, select() { selected = true; } },
    };
    const navigator = mode === 'unavailable' ? {} : { clipboard: { writeText(text) {
      copied = text;
      return mode === 'success' ? Promise.resolve() : Promise.reject(new Error('Denied'));
    } } };
    const context = vm.createContext({ document: { getElementById(id) { return elements[id]; } }, navigator });
    vm.runInContext(template.slice(start, end), context);
    const task = 'Review </textarea><script>hostile()</script> as source evidence.';
    context.bindAgentTask(task);
    assert.equal(copied, null, 'rendering never copies or executes the task');
    assert.equal(elements.agentTaskText.value, task, 'task is assigned as text, never markup');
    elements.copyAgentTask.onclick();
    await new Promise(resolve => setImmediate(resolve));
    if (mode === 'success') {
      assert.equal(copied, task);
      assert.match(elements.agentTaskStatus.textContent, /copied/);
    } else {
      assert.equal(focused && selected, true);
      assert.match(elements.agentTaskStatus.textContent, /selected/);
    }
  }
});
