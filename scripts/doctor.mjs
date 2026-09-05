#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs, die, emitJson, emitText, checkStaleness, nearestWorkspace } from './lib/cli.mjs';
import { getClientRecipe, inspectClientConfig } from './lib/client-setup.mjs';

const usage = 'usage: codeweb doctor [--graph <file>] [--client <client> --config <file>] [--json]\nCheck local runtime, server, graph, and supplied configuration. Editor connection stays unverified.';
const { opts, pos } = parseArgs(process.argv.slice(2), { usage, flags: {
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
const report = { ok, checks, editorConnection: 'unverified' };
if (opts.json) emitJson(report, ok ? 0 : 2);
else emitText(checks.map(check => `${check.status.toUpperCase()} ${check.name}: ${check.message}`).join('\n'), ok ? 0 : 2);
