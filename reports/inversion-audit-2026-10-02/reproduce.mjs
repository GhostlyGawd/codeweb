// Read-only audit runner: synthetic sources and generated results stay in the OS temp directory.
// Exit 0 means the audit ran, not that the product passed. --fail-on-gap returns 1 for unmet expectations.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runExtract } from '../../scripts/extract-symbols.mjs';
import { normalizeGraph, buildIndex, impactOf } from '../../scripts/lib/graph-ops.mjs';
import { startServer, initServer } from '../../tests/mcp-harness.mjs';

const repo = resolve(import.meta.dirname, '../..');
const output = mkdtempSync(join(tmpdir(), 'codeweb-inversion-'));
const cases = JSON.parse(readFileSync(join(import.meta.dirname, 'CASEFILES.json'))).cases;
const targetNames = { wrapper: 'Inner', alias: 'target', shadow: 'target', decorator: 'decorate',
  jsx_text: 'pretend', private_member: 'Hidden', block: 'target', alias_import: 'target' };
const env = { ...process.env, CODEWEB_NO_STATS: '1', CODEWEB_NO_AUTOREFRESH: '1', CODEWEB_ENGINE: 'regex' };
function cli(file, args, cwd) {
  const r = spawnSync(process.execPath, [join(repo, 'scripts', file), ...args],
    { cwd, env, encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.error || r.signal || !r.stdout) throw r.error || new Error(`${file} failed: ${r.stderr}`);
  return { exit: r.status, payload: JSON.parse(r.stdout), stderr: r.stderr };
}
function writeCase(id, files) {
  const dir = join(output, id);
  mkdirSync(join(dir, '.codeweb'), { recursive: true });
  for (const [file, source] of Object.entries(files)) writeFileSync(join(dir, file), source);
  return dir;
}
const observations = [];
for (const [id, files] of Object.entries(cases)) {
  const dir = writeCase(id, files);
  for (const engine of ['regex', 'tree-sitter']) {
    const { fragment } = await runExtract({ path: dir, engine, ctags: false });
    const graph = normalizeGraph(fragment);
    const graphPath = join(dir, '.codeweb', `${engine}.json`);
    writeFileSync(graphPath, JSON.stringify(graph));
    const deadcode = cli('deadcode.mjs', [graphPath, '--json'], dir);
    const target = graph.nodes.find(n => n.label === targetNames[id]);
    const impact = target ? impactOf(buildIndex(graph), [target.id]) : [];
    const calls = graph.edges.filter(e => e.kind === 'call');
    const safe = deadcode.payload.safe.map(n => n.id);
    const checks = [];
    const check = (expectation, passed) => checks.push({ expectation, passed: !!passed });
    if (['block', 'alias', 'alias_import'].includes(id)) {
      check('Known outer/immutable-alias call resolves to target',
        calls.some(e => e.from.endsWith(':invoke') && e.to === target?.id));
      check('Impact contains invoking consumer', impact.some(n => n.endsWith(':invoke')));
    }
    if (['shadow', 'private_member'].includes(id))
      check('No fabricated call to a shadowed or non-exported function', !calls.some(e => e.to === target?.id));
    if (id === 'decorator') check('Literal decorator use contributes a dependency',
      graph.edges.some(e => e.to === target?.id && ['call', 'ref'].includes(e.kind)));
    if (id === 'jsx_text') check('JSX literal text produces no function declaration', !target);
    if (id === 'wrapper') check('Unresolved JSX wrapper is visibly qualified',
      graph.meta.analysis?.status === 'incomplete' && graph.meta.analysis.diagnosticCount > 0);
    let campaign = null;
    if (['block', 'jsx_text'].includes(id)) {
      campaign = cli('campaign.mjs', [graphPath, '--json'], dir);
      check('Live/non-code target is absent from safe deletion tier', !safe.includes(target?.id));
      check('Live/non-code target is absent from campaign deletions',
        !campaign.payload.steps.some(s => s.type === 'delete' && s.op.ids.includes(target?.id)));
    }
    const row = { id, requested_engine: engine, actual_complexity_engine: graph.meta.complexityEngine ?? null,
      nodes: graph.nodes.map(n => n.id), edges: graph.edges.map(e => ({ from: e.from, to: e.to, kind: e.kind })),
      analysis: graph.meta.analysis, target: target?.id ?? null, impact, safe,
      campaign_deletes: campaign?.payload.steps.filter(s => s.type === 'delete') ?? [], checks };
    observations.push(row);
    console.log(JSON.stringify({ id, engine, unmet_expectations: checks.filter(c => !c.passed).map(c => c.expectation) }));
  }
}

// The ninth fixture exercises one confidence/transport family, separate from the 16 primary observations.
const partial = writeCase('partial', {
  'a.js': "import { beta } from './b.js'; export function alpha() { return beta(); }\n",
  'b.js': 'export function beta() {\n return 1;\n}\nfunction unused() {\n return 2;\n}\n',
});
const graphPath = join(partial, '.codeweb', 'graph.json');
const graph = normalizeGraph((await runExtract({ path: partial, ctags: false, engine: 'regex' })).fragment);
writeFileSync(graphPath, JSON.stringify(graph));
const pairs = [
  ['impact', 'query.mjs', [graphPath, '--impact', 'beta', '--json'], 'codeweb_impact', { graph: graphPath, symbol: 'beta' }],
  ['find', 'find.mjs', [graphPath, 'beta', '--json'], 'codeweb_find', { graph: graphPath, query: 'beta' }],
  ['explain', 'explain.mjs', [graphPath, 'beta', '--json'], 'codeweb_explain', { graph: graphPath, symbol: 'beta' }],
  ['context', 'context-pack.mjs', [graphPath, 'beta', '--json'], 'codeweb_context', { graph: graphPath, symbol: 'beta' }],
  ['deadcode', 'deadcode.mjs', [graphPath, '--json'], 'codeweb_deadcode', { graph: graphPath }],
  ['risk', 'risk.mjs', [graphPath, '--json'], 'codeweb_risk', { graph: graphPath }],
  ['review', 'review.mjs', [graphPath, '--changed', 'b.js', '--gate', '--json'], 'codeweb_review', { graph: graphPath, changed: 'b.js', gate: true }],
  ['diff', 'diff.mjs', [graphPath, graphPath, '--json'], 'codeweb_diff', { before: graphPath, after: graphPath }],
];
const transport = [];
const server = startServer({ cwd: partial, env });
try {
  await initServer(server);
  for (const [i, [id, file, args, name, arguments_]] of pairs.entries()) {
    const c = cli(file, args, partial);
    server.send({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name, arguments: arguments_ } });
    const response = await server.reply(i + 1, 20000);
    if (!response.result) throw new Error(`${name} returned a protocol error`);
    const m = JSON.parse(response.result.content[0].text);
    const row = { id, cli: c, mcp: { isError: response.result.isError ?? false, payload: m } };
    transport.push(row);
    console.log(JSON.stringify({ tool: id, cli_exit: c.exit, cli_analysis: c.payload.analysis ?? null,
      mcp_error: row.mcp.isError, mcp_analysis: m.analysis ?? null }));
  }
} finally {
  server.close();
  await server.exited;
}
const summary = { primary_observations: observations.length,
  primary_unmet_expectations: observations.flatMap(o => o.checks).filter(c => !c.passed).length,
  paired_transport_observations: transport.length,
  meaning: 'Audit execution completed; unmet expectations are reported product gaps, not a clean gate.' };
writeFileSync(join(output, 'RESULTS.json'), JSON.stringify({ summary, observations,
  transport_input_analysis: graph.meta.analysis, transport }, null, 2));
console.log(JSON.stringify({ output_directory: output, ...summary }));
if (process.argv.includes('--fail-on-gap') && summary.primary_unmet_expectations) process.exitCode = 1;
