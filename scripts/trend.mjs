#!/usr/bin/env node
// codeweb trend — body-confirmed duplication + cross-domain coupling over a series of snapshots,
// so a one-shot map becomes a dashboard you re-open: is the codebase consolidating or sprawling?
//
// Two modes:
//   node trend.mjs <graph.json> [<graph.json>...] [--labels a,b,..] [--json]
//       Render a trend from pre-built graph snapshots, oldest -> newest.
//   node trend.mjs --git <repo> [--last N] [--focus <subdir>] [--json]
//       Snapshot each of the last N commits via an ephemeral git worktree + the deterministic
//       pipeline, then render. Read-only over the repo; worktrees live under the OS temp dir and
//       are removed after each commit (the caller's working tree is never touched).
//
// Metrics per snapshot:
//   confirmed  = duplicate-logic overlaps with confidence 'high' (body-confirmed real duplications)
//   candidates = duplicate-logic overlaps not 'refuted' (confirmed + unverified)
//   coupling   = total weight of non-test edges whose endpoints sit in different domains

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPARK = '▁▂▃▄▅▆▇█';

const USAGE = 'usage: trend.mjs (--git <repo> [--last N] [--focus <subdir>] | <a.json> <b.json> ... [--labels a,b,...]) [--json]';
import { parseArgs } from './lib/cli.mjs';

// ---- pure metrics ----
function metrics(g) {
  const overlaps = Array.isArray(g.overlaps) ? g.overlaps : [];
  const dl = overlaps.filter((o) => o.kind === 'duplicate-logic');
  const confirmed = dl.filter((o) => o.confidence === 'high').length;
  const candidates = dl.filter((o) => o.confidence !== 'refuted').length;
  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  const edges = Array.isArray(g.edges) ? g.edges : [];
  const dom = new Map(nodes.map((n) => [n.id, n.domain || 'unassigned']));
  let coupling = 0;
  for (const e of edges) {
    if (e.kind === 'test') continue;
    const a = dom.get(e.from), b = dom.get(e.to);
    if (a != null && b != null && a !== b) coupling += e.weight || 1;
  }
  return { confirmed, candidates, coupling, nodes: nodes.length, files: new Set(nodes.map((n) => n.file).filter(Boolean)).size };
}

// ---- pure rendering ----
function sparkline(values) {
  if (!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return SPARK[0].repeat(values.length); // flat series
  return values.map((v) => SPARK[Math.round(((v - min) / (max - min)) * (SPARK.length - 1))]).join('');
}
function arrow(values) {
  if (values.length < 2) return '→0';
  const d = values[values.length - 1] - values[0];
  return d > 0 ? `↑${d}` : d < 0 ? `↓${-d}` : '→0';
}
function line(label, seq) {
  return `${label.padEnd(22)} ${sparkline(seq)}  ${seq.join(' → ')}  (${arrow(seq)})`;
}
function renderTrend(rows, { json } = {}) {
  if (json) return JSON.stringify({ snapshots: rows }, null, 2);
  const confirmed = rows.map((r) => r.confirmed);
  const coupling = rows.map((r) => r.coupling);
  const symbols = rows.map((r) => r.nodes);
  const out = [];
  out.push(`# codeweb — trend (${rows.length} snapshot${rows.length === 1 ? '' : 's'})`);
  out.push('');
  out.push('> Oldest → newest. **confirmed** = body-confirmed duplicate-logic findings; **coupling** = cross-domain edge weight.');
  out.push('');
  out.push('```');
  out.push(line('confirmed duplications', confirmed));
  out.push(line('cross-domain coupling', coupling));
  out.push(line('symbols', symbols));
  out.push('```');
  out.push('');
  out.push('| # | snapshot | symbols | confirmed dups | candidates | coupling |');
  out.push('|---|----------|--------:|---------------:|-----------:|---------:|');
  rows.forEach((r, i) => out.push(`| ${i + 1} | ${r.label} | ${r.nodes} | ${r.confirmed} | ${r.candidates} | ${r.coupling} |`));
  out.push('');
  const d = confirmed[confirmed.length - 1] - confirmed[0];
  out.push(
    rows.length < 2 ? '➡️ Single snapshot — run with more to see a trend.'
      : d > 0 ? `⚠️ Duplication is **rising** (+${d} confirmed since the first snapshot).`
        : d < 0 ? `✅ Duplication is **falling** (${d} confirmed since the first snapshot).`
          : '➡️ Duplication is **flat** across the window.'
  );
  return out.join('\n');
}

// ---- snapshot sources ----
const loadSnapshot = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));

function gitSnapshots(repo, last, focus) {
  const git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  const log = git(['log', '-n', String(last), '--format=%H\t%cs', '--', focus]).trim();
  if (!log) return [];
  const commits = log.split(/\r?\n/).map((l) => { const [sha, date] = l.split('\t'); return { sha, date }; }).reverse();
  const rows = [];
  for (const { sha, date } of commits) {
    const base = mkdtempSync(join(tmpdir(), 'codeweb-trend-'));
    const wt = join(base, 'wt'), ws = join(base, 'ws');
    const label = `${sha.slice(0, 7)} (${date})`;
    try {
      git(['worktree', 'add', '--detach', '--force', wt, sha]);
      execFileSync(process.execPath, [join(HERE, 'run.mjs'), join(wt, focus), '--target', sha.slice(0, 7), '--out-dir', ws], { stdio: 'ignore' });
      rows.push({ label, ...metrics(loadSnapshot(join(ws, 'graph.json'))) });
    } catch (e) {
      rows.push({ label, error: String((e && e.message) || e), confirmed: 0, candidates: 0, coupling: 0, nodes: 0, files: 0 });
    } finally {
      try { git(['worktree', 'remove', '--force', wt]); } catch { /* best-effort */ }
      try { rmSync(base, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
  return rows;
}

// ---- main ----
// finding 24: THE flag loop (lib/cli.mjs parseArgs) — the local copy treated unknown flags as
// graph paths (the exact bug class run.mjs's #5 fix closed); one policy now.
const { opts: f, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    git: { type: 'string', default: null },
    last: { type: 'number', default: 10 },
    focus: { type: 'string', default: '.' },
    labels: { type: 'string', default: null },
    json: { type: 'bool', default: false },
  },
});
const opts = { graphs: pos, git: f.git, last: Math.max(1, f.last), focus: f.focus, json: f.json, labels: f.labels != null ? f.labels.split(',') : null };
let rows = [];
if (opts.git) {
  rows = gitSnapshots(resolve(opts.git), opts.last, opts.focus);
} else if (opts.graphs.length) {
  rows = opts.graphs.map((p, i) => {
    const g = loadSnapshot(p);
    const label = (opts.labels && opts.labels[i]) || (g.meta && g.meta.target) || `snapshot ${i + 1}`;
    return { label, ...metrics(g) };
  });
} else {
  console.error(USAGE);
  process.exit(2);
}
if (!rows.length) { console.error('[codeweb] no snapshots to chart'); process.exit(1); }
console.log(renderTrend(rows, { json: opts.json }));
