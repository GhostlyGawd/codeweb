#!/usr/bin/env node
// Read-only setup diagnostics. Resolves this running installation, never contacts
// a registry, installs a parser, maps source, or executes the target project's code.
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { nearestWorkspace, checkStaleness, parseArgs } from './lib/cli.mjs';
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { opts, pos } = parseArgs(process.argv.slice(2), {
    usage: 'usage: doctor.mjs [target] [--graph <graph.json>] [--json]',
    flags: { json: { type: 'bool', default: false }, graph: { type: 'string', default: null } },
  });
  process.exitCode = runDoctor({ target: pos[0] || '.', ...opts });
}
