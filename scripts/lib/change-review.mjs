// Additive evidence for the existing structural review. Gate rules stay in graph-ops.
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeGraph, reviewImpact } from './graph-ops.mjs';
import { checkStaleness, sourceReader } from './cli.mjs';
import { coverageNote } from './coverage.mjs';

/** A supplied snapshot must be a graph, not JSON that normalizes to an empty graph. */
export function loadReviewBaseline(file) {
  const graph = JSON.parse(readFileSync(file, 'utf8'));
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
      || graph.nodes.some(n => !n || typeof n.id !== 'string' || typeof n.file !== 'string')
      || graph.edges.some(e => !e || typeof e.from !== 'string' || typeof e.to !== 'string')) {
    throw new Error('baseline must contain nodes and edges arrays with valid symbols and endpoints');
  }
  return normalizeGraph(graph);
}

/** Git paths are relative to the repository; graph paths are relative to the mapped root. */
export function reviewGitHunks(ref, root) {
  if (!root || !existsSync(root)) throw new Error('--range requires an available graph source root');
  if (ref.startsWith('-')) throw new Error('git range must not start with a dash');
  const git = args => {
    const r = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`git diff failed: ${(r.stderr || r.error?.message || '').trim()}`);
    return r.stdout;
  };
  const gitRoot = git(['rev-parse', '--show-toplevel']).trim();
  // External diff drivers and textconv can execute code from the target. Disable both.
  const diff = git(['-c', 'core.quotePath=false', 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative', '--unified=0', ref, '--']);
  const records = []; let record = null;
  const relativePath = path => {
    const rel = relative(resolve(root), resolve(gitRoot, path)).replace(/\\/g, '/');
    return rel === '..' || rel.startsWith('../') || isAbsolute(rel) ? null : rel;
  };
  const pathOf = raw => {
    let path = raw.split('\t')[0];
    if (path.startsWith('"')) { try { path = JSON.parse(raw); } catch { throw new Error('cannot decode git path'); } }
    if (path === '/dev/null') return null;
    return relativePath(path.slice(2));
  };
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) { record = { oldFile: null, file: null, ranges: [], beforeRanges: [] }; records.push(record); }
    if (!record) continue;
    if (line.startsWith('--- ')) record.oldFile = pathOf(line.slice(4));
    else if (line.startsWith('+++ ')) record.file = pathOf(line.slice(4));
    else {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m) {
        const oldStart = +m[1], oldLen = m[2] === undefined ? 1 : +m[2];
        const start = +m[3], len = m[4] === undefined ? 1 : +m[4];
        if (oldLen) record.beforeRanges.push([oldStart, oldStart + oldLen - 1]);
        if (len) record.ranges.push([start, start + len - 1]);
        // A deleted hunk still changes the adjacent surviving body, if there is one.
        else if (record.file) record.ranges.push([Math.max(1, start), Math.max(1, start)]);
      }
    }
  }
  // Name/status is NUL-delimited and also includes binary, empty, and mode-only changes.
  const names = git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative', '--name-status', '-z', ref, '--']).split('\0');
  for (let i = 0; i + 1 < names.length; i += 2) {
    const status = names[i], file = relativePath(names[i + 1]);
    if (!file || records.some(r => r.file === file || r.oldFile === file)) continue;
    records.push({ file: status === 'D' ? null : file, oldFile: status === 'A' ? null : file, ranges: [], beforeRanges: [] });
  }
  return records.filter(r => r.file || r.oldFile).map(r => ({
    file: r.file || r.oldFile, ranges: r.file ? r.ranges : [[0, 0]],
    beforeFile: r.oldFile, beforeRanges: r.beforeRanges.length ? r.beforeRanges : r.oldFile ? null : [[0, 0]], deleted: !r.file,
  }));
}

function coverage(graph, node) {
  const known = !!graph.meta?.coverage;
  return { status: known && node.covered === true ? 'covered' : known && node.covered === false ? 'uncovered' : 'unknown',
    note: coverageNote(graph, node) || 'No recorded coverage is available.',
    ...(known && node.covered === true && Number.isFinite(node.hits) ? { hits: node.hits } : {}) };
}
function details(graph, ids) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  return [...new Set(ids)].sort().filter(id => byId.has(id)).map(id => {
    const n = byId.get(id);
    return { id, label: n.label || id, file: n.file, line: n.line || null, coverage: coverage(graph, n) };
  });
}

function hasSourceStamps(graph) {
  const sources = graph.meta.sources;
  return !!sources && typeof sources === 'object' && !Array.isArray(sources)
    && graph.nodes.every(n => sources[n.file] && Number.isFinite(sources[n.file].s) && Number.isFinite(sources[n.file].m));
}

export function changeReviewEvidence(graph, baseline, hunks, impact) {
  const reasons = [];
  const root = graph.meta.root;
  const sourceAvailable = !!root && existsSync(root);
  const reader = sourceReader(root);
  const files = [...new Set(graph.nodes.map(n => n.file))].sort();
  const unavailable = sourceAvailable ? files.filter(file => reader.linesOf(file) == null) : files;
  const stampsAvailable = hasSourceStamps(graph);
  if (!baseline) reasons.push('No baseline supplied; new cycles and lost callers were not checked.');
  if (!sourceAvailable || unavailable.length) reasons.push('Source bodies are unavailable; duplication checks can be incomplete.');
  if (!stampsAvailable) reasons.push('Source stamps are unavailable or incomplete; graph freshness is unknown.');
  if (!graph.meta.dirs || !Object.keys(graph.meta.dirs).length) reasons.push('Directory stamps are unavailable; new source files cannot be checked.');
  if (baseline && !hasSourceStamps(baseline)) reasons.push('Baseline source stamps are unavailable; snapshot provenance is incomplete.');
  if (graph.meta.dynamic?.files || baseline?.meta.dynamic?.files) reasons.push('Recorded dynamic calls can hide callers from structural analysis.');
  const changedIds = new Set(impact.changedSymbols);
  const changedFiles = new Set(graph.nodes.filter(n => changedIds.has(n.id)).map(n => n.file));
  const unmappedFiles = [...new Set(hunks.filter(h => !changedFiles.has(h.file)).map(h => h.file))].sort();
  if (unmappedFiles.length) reasons.push('Some changed files have no mapped symbol in the changed range.');
  const stale = sourceAvailable && stampsAvailable ? checkStaleness(graph) : null;
  if (stale) reasons.push('Source or directory stamps differ from the current map. Refresh the map and repeat the review.');
  const beforeHunks = hunks.map(h => ({ file: h.beforeFile ?? h.file, ranges: h.beforeRanges ?? h.ranges }));
  const beforeImpact = baseline ? reviewImpact(baseline, beforeHunks) : null;
  const currentIds = new Set(graph.nodes.map(n => n.id));
  return {
    analysis: {
      status: stale ? 'stale' : reasons.length ? 'incomplete' : 'complete',
      scope: 'Mapped changed spans, graph structural delta, and readable changed-symbol duplication checks',
      reasons, freshness: stale ? { status: 'stale', ...stale } : { status: sourceAvailable && stampsAvailable && Object.keys(graph.meta.dirs || {}).length ? 'fresh' : 'unknown' },
      checks: { changedSpans: true, structuralDelta: !!baseline, duplication: sourceAvailable && unavailable.length === 0 },
      limits: ['A complete checked scope does not establish runtime correctness.', 'Mapped symbol spans and static call edges are best-effort. Recorded coverage describes a past run.'],
      unavailableFiles: unavailable, unmappedFiles,
      provenance: { target: graph.meta.target || null, engine: graph.meta.engine || null, generatedAt: graph.meta.generatedAt || null,
        sourceRevision: graph.meta.sourceRevision || graph.meta.commit || null, baselineProvided: !!baseline, coverageSource: graph.meta.coverage?.source || null },
    },
    review: {
      changed: details(graph, impact.changedSymbols), affectedCallers: details(graph, impact.blastRadius.ids),
      removed: baseline ? details(baseline, beforeImpact.changedSymbols.filter(id => !currentIds.has(id))) : [],
      baselineAffectedCallers: baseline ? details(baseline, beforeImpact.blastRadius.ids) : [],
    },
  };
}

// New detail is an agent-facing supplement. Legacy impact/verdict fields remain untouched.
// Bound both row count and encoded bytes: one hostile or unusually long label cannot defeat it.
export function boundedReviewEvidence({ analysis, review }) {
  const maxItems = 12, maxBytes = 4096;
  const bound = (source, fields) => {
    const result = { ...source, totals: {}, omitted: {} };
    for (const field of fields) {
      const all = source[field], items = []; let bytes = 2;
      for (const item of all.slice(0, maxItems)) {
        const size = Buffer.byteLength(JSON.stringify(item), 'utf8') + (items.length ? 1 : 0);
        if (bytes + size > maxBytes) break;
        items.push(item); bytes += size;
      }
      result[field] = items;
      result.totals[field] = all.length;
      result.omitted[field] = all.length - items.length;
    }
    return result;
  };
  return {
    analysis: bound(analysis, ['unavailableFiles', 'unmappedFiles']),
    review: { ...bound(review, ['changed', 'affectedCallers', 'removed', 'baselineAffectedCallers']),
      detailBudget: { maxItemsPerList: maxItems, maxBytesPerList: maxBytes, fullDetails: 'Use --html <file> for all detail rows.' } },
  };
}
