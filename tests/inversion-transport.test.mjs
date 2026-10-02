import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { normalizeGraph } from '../scripts/lib/graph-ops.mjs';
import { tmpDir, cleanup, writeTree, runNode, script } from './helpers.mjs';
import { startServer, initServer } from './mcp-harness.mjs';
import { incompleteAnalysis, qualifyInformation, TOOL_DIAGNOSTIC_CAP } from '../scripts/lib/analysis-completeness.mjs';

test('ac_38 diagnostic budgets preserve counts, omitted samples and both snapshots without changing stored evidence', () => {
  const graph = { meta:{ analysis:{ status:'incomplete',diagnosticCount:17,diagnostics:Array.from({length:17},(_,i)=>({file:'a.js',line:i+1,column:1,code:'unsupported-same-line-declaration'})) } } };
  const original=JSON.stringify(graph); const a=qualifyInformation({results:['a.js:known']},graph).analysis;
  assert.equal(a.completeness.diagnosticCount,17); assert.equal(a.completeness.diagnostics.length,TOOL_DIAGNOSTIC_CAP);
  assert.equal(a.completeness.omittedDiagnostics,14); assert.equal(a.omitted.diagnostics,14);
  const both=incompleteAnalysis(graph,graph); assert.equal(both.diagnosticCount,34);
  assert.ok(both.diagnostics.some(d=>d.snapshot==='before')); assert.ok(both.diagnostics.some(d=>d.snapshot==='after'));
  assert.equal(JSON.stringify(graph),original);
});

test('ac_38 informational CLI/MCP preserve useful partial answers with shared in-band limits', async () => {
  const dir = tmpDir('codeweb-inversion-transport-'); let server;
  try {
    mkdirSync(join(dir, '.codeweb'));
    writeTree(dir, { 'a.js': "import { beta } from './b.js'; export function alpha() { return beta(); }\n",
      'b.js': 'export function beta() {\n return 1;\n}\nfunction unused() {\n return 2;\n}\n' });
    const gp = join(dir, '.codeweb', 'graph.json');
    const graph = normalizeGraph((await runExtract({ path: dir, ctags: false, engine: 'regex' })).fragment);
    writeFileSync(gp, JSON.stringify(graph)); assert.equal(graph.meta.analysis.status, 'incomplete');
    const env = { CODEWEB_NO_STATS: '1', CODEWEB_NO_AUTOREFRESH: '1', CODEWEB_ENGINE: 'regex' };
    server = startServer({ cwd: dir, env }); await initServer(server); let id = 1;
    const call = async (tool, args) => {
      const current = id++; server.send({ jsonrpc: '2.0', id: current, method: 'tools/call', params: { name: tool, arguments: { ...(tool === 'codeweb_diff' ? {} : { graph: gp }), ...args } } });
      const reply = await server.reply(current); assert.ok(!reply.result.isError, reply.result.content[0].text);
      return JSON.parse(reply.result.content[0].text);
    };
    const pairs = [
      ['find.mjs', [gp,'beta','--json'], 'codeweb_find', { query: 'beta' }, 'results'],
      ['explain.mjs', [gp,'beta','--json'], 'codeweb_explain', { symbol: 'beta' }, 'cards'],
      ['context-pack.mjs', [gp,'beta','--json'], 'codeweb_context', { symbol: 'beta' }, 'target'],
      ['risk.mjs', [gp,'--json'], 'codeweb_risk', {}, 'ranked'],
    ];
    for (const [file, args, tool, toolArgs, field] of pairs) {
      const r = runNode(script(file), args, { env }); assert.equal(r.status, 0, r.stderr);
      const c = JSON.parse(r.stdout), m = await call(tool, toolArgs);
      assert.ok(c[field].length > 0, file); assert.deepEqual(m[field], c[field], tool);
      for (const p of [c,m]) {
        assert.equal(p.analysis.completeness.status, 'incomplete', tool);
        assert.equal(p.analysis.status, 'incomplete', tool);
        assert.ok(p.analysis.scope); assert.ok(p.analysis.freshness);
        assert.ok(p.analysis.completeness.diagnostics.length > 0);
      }
    }
    // Decision tools continue to report inconclusive scope and withhold cleanup proposals.
    const impact = await call('codeweb_impact', { symbol: 'beta' }); assert.equal(impact.analysis.status, 'incomplete');
    const dead = await call('codeweb_deadcode', {}); assert.equal(dead.safe.length, 0);
    const review = await call('codeweb_review', { changed: 'b.js', gate: true }); assert.equal(review.verdict.status, 'inconclusive');
    const diff = await call('codeweb_diff', { before: gp, after: gp }); assert.equal(diff.status, 'inconclusive');
    // A missing match is still a qualified partial answer, not a transport failure.
    const missing = await call('codeweb_explain', { symbol: 'does-not-exist' });
    assert.equal(missing.found, false); assert.equal(missing.analysis.completeness.status, 'incomplete');
    // Repaired source removes the known limit without a server restart.
    writeFileSync(join(dir, 'a.js'), "import { beta } from './b.js';\nexport function alpha() {\n return beta();\n}\n");
    const repaired = normalizeGraph((await runExtract({ path: dir, ctags: false, engine: 'regex' })).fragment);
    writeFileSync(gp, JSON.stringify(repaired));
    const clean = await call('codeweb_find', { query: 'beta' }); assert.ok(clean.results.length > 0);
    assert.notEqual(clean.analysis?.completeness?.status, 'incomplete');
  } finally { if (server) { server.close(); await server.exited; } cleanup(dir); }
});
