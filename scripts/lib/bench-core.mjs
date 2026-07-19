// bench-core — the oracle-A/B engine, factored out of paper/experiments/oracle-ab.mjs so the
// SAME arms/oracle/scoring serve two callers: the frozen paper experiment (canonical results in
// paper/results/oracle-ab.json) and the product CLI `scripts/bench.mjs` ("run grep-vs-codeweb on
// YOUR repo, graded by YOUR compiler"). One truth — a divergence here would make the product
// bench and the published numbers measure different things.
//
// Design (unchanged from the experiment):
//   control   = grep  (`rg -n '\bX\b'` — the dump a grep-first agent ingests)
//   treatment = codeweb (`--dependents`, budgeted pages of 20, as served over MCP)
//   oracle    = TypeScript LanguageService getReferencesAtPosition (optional — absent => ungraded)
//   grading unit = FILES; cost = bytes injected into the agent context (tokens ~ bytes/4).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runQuery } from './query-core.mjs';

/** Deterministic PRNG (mulberry32) — the seed IS the sample. */
export const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Repo-relative prefix of the benchmark scope (e.g. packages/vite/src), '' = whole repo. */
export const scopeOf = (srcRoot, graphRoot) =>
  resolve(srcRoot).replace(/\\/g, '/').slice(resolve(graphRoot).replace(/\\/g, '/').length).replace(/^\//, '');

export const relOf = (abs, graphRoot) =>
  abs.replace(/\\/g, '/').slice(resolve(graphRoot).replace(/\\/g, '/').length).replace(/^\//, '');

/** The optional oracle dependency, resolved from the caller's cwd (TS_MODULE overrides). */
export function loadTypescript(tsModule = process.env.TS_MODULE || 'typescript') {
  try { return createRequire(join(process.cwd(), 'noop.js'))(tsModule); }
  catch { return null; }
}

let _rg = null;
/** Is ripgrep on PATH? (The grep arm needs it; absent => that arm reports unavailable.) */
export function rgAvailable() {
  if (_rg === null) _rg = spawnSync('rg', ['--version'], { stdio: 'ignore' }).error == null;
  return _rg;
}

/**
 * Deterministic symbol sample: exported product functions/classes in scope, label >= 4 chars,
 * fan-in (calls + imports) >= 3 — symbols an agent would actually ask about. A fixed id list
 * (A/B across engine versions needs identical tasks) bypasses sampling; absent ids are returned
 * in `missing`, never silently dropped.
 */
export function sampleSymbols(graph, index, { scope = '', n = 30, seed = 42, fixedIds = null } = {}) {
  if (fixedIds) {
    const byId = new Map(graph.nodes.map((nd) => [nd.id, nd]));
    return { sample: fixedIds.map((id) => byId.get(id)).filter(Boolean), missing: fixedIds.filter((id) => !byId.has(id)) };
  }
  const rng = mulberry(seed);
  const pool = graph.nodes.filter((nd) =>
    (nd.kind === 'function' || nd.kind === 'class') && nd.role === 'product' && nd.exports &&
    nd.file.startsWith(scope) && nd.label.length >= 4 &&
    (index.callIn.get(nd.id)?.size || 0) + (index.importIn.get(nd.id)?.size || 0) >= 3
  ).sort((a, b) => (a.id < b.id ? -1 : 1));
  const sample = [];
  while (sample.length < Math.min(n, pool.length) && pool.length) sample.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return { sample, missing: [] };
}

/**
 * TS LanguageService over the scope. oracleFiles(node) = files with >=1 compiler reference to the
 * symbol OUTSIDE its declaration entry, or null when the oracle can't resolve it (excluded, not
 * counted against either arm).
 */
export function makeTsOracle(ts, { srcRoot, graphRoot }) {
  const tsFiles = [];
  (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (!/node_modules|__tests__/.test(e.name)) walk(p); } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) tsFiles.push(p); } })(srcRoot);
  const snapshots = new Map();
  const host = {
    getScriptFileNames: () => tsFiles,
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => { if (!snapshots.has(f)) { try { snapshots.set(f, ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8'))); } catch { snapshots.set(f, null); } } return snapshots.get(f); },
    getCurrentDirectory: () => srcRoot,
    getCompilationSettings: () => ({ allowJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true }),
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => existsSync(f),
    readFile: (f) => { try { return readFileSync(f, 'utf8'); } catch { return undefined; } },
    directoryExists: (d) => { try { return statSync(d).isDirectory(); } catch { return false; } },
    getDirectories: (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } },
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
  const oracleFiles = (node) => {
    const abs = join(graphRoot, node.file);
    const text = host.readFile(abs);
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    const col = (lines[node.line - 1] || '').indexOf(node.label);
    if (col === -1) return null;
    const position = lines.slice(0, node.line - 1).reduce((s, l) => s + l.length + 1, 0) + col;
    let refs;
    try { refs = ls.getReferencesAtPosition(abs, position); } catch { return null; }
    if (!refs || !refs.length) return null;
    const files = new Set();
    for (const r of refs) { if (!r.isDefinition) files.add(relOf(r.fileName, graphRoot)); }
    return files.size ? files : null;
  };
  return { tsFileCount: tsFiles.length, oracleFiles };
}

/** codeweb arm: --dependents, budgeted pages of 20 (the MCP default), paged to exhaustion. */
export function codewebArm(graph, index, node, limit = 20) {
  let offset = 0, files = new Set(), bytes = 0, pages = 0;
  for (;;) {
    const { payload } = runQuery(graph, index, { query: 'dependents', symbol: node.id, limit, offset });
    bytes += JSON.stringify(payload).length; pages++;
    for (const id of payload.results || []) { const n = index.byId.get(id); if (n) files.add(n.file); }
    if (!payload.more) break;
    offset = payload.more.nextOffset;
  }
  return { files, bytes, pages };
}

/** grep arm: one rg dump over the scope. null when rg is not installed. */
export function grepArm(node, { srcRoot, graphRoot }) {
  if (!rgAvailable()) return null;
  let out = '';
  try { out = execFileSync('rg', ['-n', `\\b${node.label}\\b`, srcRoot], { encoding: 'utf8', maxBuffer: 1 << 28 }); }
  catch (e) { out = e.stdout || ''; }
  const files = new Set();
  for (const line of out.split('\n')) { const m = /^(.*?):\d+:/.exec(line); if (m) files.add(relOf(resolve(m[1]), graphRoot)); }
  files.delete(node.file); // the agent knows the definition site already
  return { files, bytes: out.length };
}

export const score = (reported, truth) => {
  const inter = [...reported].filter((f) => truth.has(f)).length;
  return { recall: truth.size ? inter / truth.size : 1, precision: reported.size ? inter / reported.size : 1 };
};

/**
 * Blast-radius COST ("what transitively breaks?"): one budgeted codeweb_impact call vs the
 * recursive grep loop an agent must run to a fixpoint — simulated GENEROUSLY for grep (the graph
 * hands it each next frontier's symbol names; a real agent must read files to learn them).
 * grep fields are null when rg is not installed.
 */
export function impactCost(graph, index, node, { srcRoot }) {
  const { payload } = runQuery(graph, index, { query: 'impact', symbol: node.id, limit: 20 });
  const cw = { bytes: JSON.stringify(payload).length, size: payload.count };
  if (!rgAvailable()) return { codewebBytes: cw.bytes, impactSize: cw.size, grepBytes: null, grepRounds: null };
  let bytes = 0, rounds = 0;
  const seen = new Set([node.id]);
  let frontier = [node];
  while (frontier.length && rounds < 12) {
    rounds++;
    for (const label of [...new Set(frontier.map((n) => n.label))]) {
      try { bytes += execFileSync('rg', ['-n', `\\b${label}\\b`, srcRoot], { encoding: 'utf8', maxBuffer: 1 << 28 }).length; }
      catch (e) { bytes += (e.stdout || '').length; }
    }
    const next = [];
    for (const n of frontier) for (const c of index.callIn.get(n.id) || []) {
      if (!seen.has(c)) { seen.add(c); const cn = index.byId.get(c); if (cn) next.push(cn); }
    }
    frontier = next;
  }
  return { codewebBytes: cw.bytes, impactSize: cw.size, grepBytes: bytes, grepRounds: rounds };
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Recall/precision/cost aggregate for one arm over graded rows (shape frozen by the paper run). */
export const aggArm = (rows, arm) => ({
  meanRecall: +mean(rows.map((r) => r[arm].recall)).toFixed(3),
  meanPrecision: +mean(rows.map((r) => r[arm].precision)).toFixed(3),
  totalBytes: rows.reduce((s, r) => s + r[arm].bytes, 0),
  meanBytes: Math.round(mean(rows.map((r) => r[arm].bytes))),
});

export const aggImpact = (rows) => ({
  meanImpactSize: Math.round(mean(rows.map((r) => r.impact.impactSize))),
  codewebMeanBytes: Math.round(mean(rows.map((r) => r.impact.codewebBytes))),
  grepMeanBytes: Math.round(mean(rows.map((r) => r.impact.grepBytes))),
  grepMeanRounds: +mean(rows.map((r) => r.impact.grepRounds)).toFixed(1),
  costRatio: +(mean(rows.map((r) => r.impact.grepBytes)) / Math.max(1, mean(rows.map((r) => r.impact.codewebBytes)))).toFixed(1),
});
