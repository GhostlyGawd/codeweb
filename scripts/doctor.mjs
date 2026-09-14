#!/usr/bin/env node
// Read-only setup diagnostics. Resolves this running installation, never contacts
// a registry, installs a parser, maps source, or executes the target project's code.
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { nearestWorkspace, checkStaleness, parseArgs, die, emitJson, emitText } from './lib/cli.mjs';
import { probeAst } from './lib/ts-engine.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function diagnoseSetup({ cwd = process.cwd(), graphPath = null } = {}) {
  cwd = resolve(cwd);
  const issues = [];
  const packageInfo = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const pathExecutables = {};
  for (const name of ['codeweb', 'codeweb-mcp']) {
    const suffixes = process.platform === 'win32' ? ['', '.cmd', '.exe'] : [''];
    const paths = (process.env.PATH || '').split(delimiter).flatMap((d) => suffixes.map((s) => join(d, name + s)));
    const found = paths.find((p) => { try { return statSync(p).isFile(); } catch { return false; } });
    pathExecutables[name] = found ? realpathSync(found) : null;
  }
  const installation = {
    root: ROOT, version: packageInfo.version,
    kind: existsSync(join(ROOT, '.git')) ? 'checkout' : 'packaged',
    entrypoint: resolve(process.argv[1] || fileURLToPath(import.meta.url)),
    nodeExecutable: process.execPath, nodeVersion: process.version, pathExecutables,
  };
  const targetExists = existsSync(cwd) && statSync(cwd).isDirectory();
  if (!targetExists) issues.push({ code: 'target-missing', level: 'error', next: 'Pass an existing source directory as the target.' });
  const override = process.env.CODEWEB_WS ? resolve(process.env.CODEWEB_WS, 'graph.json') : null;
  const path = graphPath ? resolve(graphPath) : override || (targetExists ? nearestWorkspace(cwd)?.path : null);
  const graph = { path: path || null, status: 'missing', root: null, freshness: 'unknown' };
  if (!path || !existsSync(path)) {
    issues.push({ code: 'graph-missing', level: 'error', next: 'Build a map at this target; correct or unset CODEWEB_WS if it points elsewhere.', command: [process.execPath, join(ROOT, 'scripts/run.mjs'), cwd] });
  } else {
    try {
      const g = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error('expected nodes and edges arrays');
      graph.status = g.nodes.length ? 'mapped' : 'empty';
      graph.root = g.meta?.root || null;
      graph.symbols = g.nodes.length;
      graph.engine = g.meta?.engine || 'unknown';
      graph.baseline = existsSync(join(dirname(path), 'graph.baseline.json')) ? join(dirname(path), 'graph.baseline.json') : null;
      const sourceAvailable = !!graph.root && existsSync(graph.root) && statSync(graph.root).isDirectory();
      if (!sourceAvailable) issues.push({ code: 'source-unavailable', level: 'error', next: 'Restore graph.meta.root or remap the repository at its current source root.' });
      const stamped = Object.keys(g.meta?.sources || {}).length > 0;
      const stale = sourceAvailable ? checkStaleness(g) : null;
      graph.freshness = stale ? 'stale' : sourceAvailable && stamped ? 'unchanged-stamps' : 'unknown';
      if (stale) {
        graph.stale = stale;
        issues.push({ code: 'graph-stale', level: 'warning', next: 'Refresh this graph (MCP: codeweb_refresh).', command: [process.execPath, join(ROOT, 'scripts/refresh.mjs'), path] });
      } else if (!stamped) issues.push({ code: 'freshness-unknown', level: 'warning', next: 'Refresh or remap to record source stamps before relying on locations.' });
      if (!g.nodes.length) issues.push({ code: 'graph-empty', level: 'error', next: 'Map the code root containing supported source; an empty map cannot answer structural questions.' });
    } catch (e) {
      graph.status = 'invalid';
      issues.push({ code: 'graph-invalid', level: 'error', detail: e.message, next: 'Rebuild the map with codeweb <source-root>; do not treat invalid graph data as an empty result.' });
    }
  }
  const ast = probeAst();
  const ctags = spawnSync('ctags', ['--version'], { encoding: 'utf8', timeout: 2000 });
  const parsers = { regex: true, universalCtags: ctags.status === 0 && /Universal Ctags/i.test(ctags.stdout), ast, probeOnly: true };
  if (!ast.ts) issues.push({ code: 'optional-ast-unavailable', level: 'warning', next: 'Regex extraction remains available. For AST support, reinstall Codeweb with optional dependencies enabled in this installation.' });
  return { ok: !issues.some((i) => i.level === 'error'), installation, target: cwd, graph, parsers, issues };
}

export function runDoctor({ target = '.', graph = null, json = false } = {}) {
  const result = diagnoseSetup({ cwd: target, graphPath: graph });
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`codeweb doctor: ${result.ok ? 'ready' : 'setup needs attention'}`);
    console.log(`  installation: ${result.installation.root} (${result.installation.kind}, v${result.installation.version})`);
    console.log(`  node: ${result.installation.nodeVersion} — ${result.installation.nodeExecutable}`);
    for (const [name, path] of Object.entries(result.installation.pathExecutables)) console.log(`  PATH ${name}: ${path || 'not found'}`);
    console.log(`  graph: ${result.graph.path || 'not found'} — ${result.graph.status}, freshness ${result.graph.freshness}`);
    console.log(`  source root: ${result.graph.root || 'unknown'}`);
    console.log(`  parsers (availability probe only): regex available; Universal Ctags ${result.parsers.universalCtags}; AST ${Object.entries(result.parsers.ast).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'unavailable'}`);
    for (const issue of result.issues) {
      console.log(`  ${issue.level} ${issue.code}: ${issue.next}`);
      if (issue.command) console.log(`    command argv: ${JSON.stringify(issue.command)}`);
    }
  }
  return result.ok ? 0 : 2;
}


import { getClientRecipe, inspectClientConfig } from './lib/client-setup.mjs';

export function runDoctorCommand(args = process.argv.slice(2)) {
  // Preserve explicit-target diagnostics; bare doctor performs the full setup check.
  if (args[0] && !args[0].startsWith('-')) {
    const { opts, pos } = parseArgs(args, { usage: 'doctor.mjs [target] [--graph <file>] [--json]', flags: { graph: { type: 'string' }, json: { type: 'bool', default: false } } });
    process.exitCode = runDoctor({ target: pos[0], ...opts });
    return;
  }
const usage = 'usage: codeweb doctor [--graph <file>] [--client <client> --config <file>] [--json]\nCheck local runtime, server, graph, and supplied configuration. Editor connection stays unverified.';
const { opts, pos } = parseArgs(args, { usage, flags: {
  graph: { type: 'string' }, client: { type: 'string' }, config: { type: 'string' }, json: { type: 'bool', default: false },
} });
if (pos.length || Boolean(opts.client) !== Boolean(opts.config) || (opts.client && !getClientRecipe(opts.client))) die(usage, 2);
const checks = [];
const add = (name, status, message, required = true) => checks.push({ name, status, message, required });
const compatible = Number(process.versions.node.split('.')[0]) >= 22;
add('runtime', compatible ? 'pass' : 'fail', compatible ? 'Node meets the required version (22 or later).' : 'Install Node 22 or later.');
// Use only this installed package's server and current runtime. Config commands are never run.
// Synchronous exchange closes stdin and reaps the child; timeout sends SIGKILL and bounds cleanup.
if (compatible) {
  const request = { jsonrpc: '2.0', id: 'doctor-init', method: 'initialize', params: {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codeweb-doctor', version: '1' },
  } };
  const server = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'mcp-server.mjs')], {
    input: JSON.stringify(request) + '\n', encoding: 'utf8', timeout: 8000, killSignal: 'SIGKILL', maxBuffer: 1 << 20,
  });
  let reply;
  try { reply = server.stdout?.trim().split('\n').map(line => JSON.parse(line)).find(row => row.id === request.id); } catch { /* invalid response */ }
  const valid = !server.error && !server.signal && server.status === 0 && reply?.jsonrpc === '2.0'
    && reply.result?.serverInfo?.name === 'codeweb' && reply.result?.capabilities?.tools && reply.result?.protocolVersion;
  add('server', valid ? 'pass' : 'fail', valid ? 'The installed local MCP server completed initialization.' : 'Local MCP initialization failed or timed out. Reinstall this package and run doctor again.');
} else add('server', 'unknown', 'Server check requires a supported Node version.');
const graphPath = opts.graph ? resolve(opts.graph)
  : process.env.CODEWEB_WS ? join(resolve(process.env.CODEWEB_WS), 'graph.json') : nearestWorkspace(process.cwd())?.path;
let graph;
try {
  if (!graphPath) throw new Error('absent');
  graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) throw new Error('shape');
  add('graph', 'pass', 'A readable graph with nodes and edges is present.');
} catch { add('graph', 'fail', 'No valid graph is available. Run: npx -y @ghostlygawd/codeweb .'); }
const sources = graph?.meta?.sources;
const stamped = sources && typeof sources === 'object' && !Array.isArray(sources) && Object.keys(sources).length > 0
  && Object.values(sources).every(st => st && Number.isFinite(st.s) && Number.isFinite(st.m));
if (!graph || !graph.meta?.root || !existsSync(graph.meta.root) || !stamped) {
  add('freshness', 'unknown', 'Freshness is unverified: source root or file stamps are unavailable. Rebuild the map.');
} else {
  const stale = checkStaleness(graph, { verify: true });
  add('freshness', stale ? 'fail' : 'pass', stale
    ? 'Mapped source files or directories changed. Rebuild the map before a query.'
    : 'Recorded source stamps match local files. Files outside recorded directories are not checked.');
}
if (opts.client) {
  let result;
  try { result = inspectClientConfig(getClientRecipe(opts.client), readFileSync(resolve(opts.config), 'utf8')); }
  catch { result = { status: 'fail', message: 'Cannot read the supplied configuration file.' }; }
  add('configuration', result.status, result.message);
}
add('editor', 'unknown', 'Editor connection is unverified. A local server check does not establish an editor connection. Run a caller query in your client.', false);
const ok = checks.every(check => !check.required || check.status === 'pass');
const report = { ...diagnoseSetup({ graphPath: opts.graph }), ok, checks, editorConnection: 'unverified' };
if (opts.json) emitJson(report, ok ? 0 : 2);
else emitText(checks.map(check => `${check.status.toUpperCase()} ${check.name}: ${check.message}`).join('\n'), ok ? 0 : 2);

}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runDoctorCommand();
