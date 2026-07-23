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

const USAGE = 'usage: trend.mjs (--history <history.jsonl> | --git <repo> [--last N] [--focus <subdir>] | <a.json> <b.json> ... [--labels a,b,...]) [--json]';
import { parseArgs } from './lib/cli.mjs';

// ---- pure metrics ----
// RETENTION R8 — and the gate's own catch on this very change: metricsRow (lib/history.mjs) is
// THE one metrics computation (run.mjs's ledger rows, ci-gate's --history, and this dashboard);
// this adapter only renames symbols->nodes for trend's legacy row shape.
import { metricsRow } from './lib/history.mjs';
function metrics(g) {
  const r = metricsRow(g);
  return { confirmed: r.confirmed, candidates: r.candidates, coupling: r.coupling, nodes: r.symbols, files: r.files };
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
  // finding #42: ONE workspace dir reused across every commit (the extractor's scan cache persists in
  // it, so files unchanged commit-to-commit aren't re-parsed); worktree churn stays per-commit. Each
  // run is `--stages through-overlap` — extract+cluster+overlap only (all metrics() reads: nodes/edges
  // from extract, domains from cluster, overlaps from overlap) — skipping optimize+report (~half the
  // per-commit wall) and never writing the stage memo.
  const wsBase = mkdtempSync(join(tmpdir(), 'codeweb-trend-ws-'));
  const ws = join(wsBase, 'ws');
  const rows = [];
  try {
    for (const { sha, date } of commits) {
      const sha7 = sha.slice(0, 7);
      const base = mkdtempSync(join(tmpdir(), 'codeweb-trend-'));
      const wt = join(base, 'wt');
      const label = `${sha7} (${date})`;
      try {
        git(['worktree', 'add', '--detach', '--force', wt, sha]);
        execFileSync(process.execPath, [join(HERE, 'run.mjs'), join(wt, focus), '--target', sha7, '--out-dir', ws, '--stages', 'through-overlap'], { stdio: 'ignore' });
        // Reused-ws belt: a failed run leaves the PREVIOUS commit's graph.json in the shared ws.
        // Accept the row only if the loaded graph is THIS commit's (meta.target === sha7) — else skip
        // it exactly like a thrown run, so a stale graph is never misattributed to this commit.
        const g = loadSnapshot(join(ws, 'graph.json'));
        if (g.meta?.target !== sha7) throw new Error(`stale graph in reused ws (meta.target ${g.meta?.target ?? 'none'} != ${sha7})`);
        rows.push({ label, ...metrics(g) });
      } catch (e) {
        rows.push({ label, error: String((e && e.message) || e), confirmed: 0, candidates: 0, coupling: 0, nodes: 0, files: 0 });
      } finally {
        try { git(['worktree', 'remove', '--force', wt]); } catch { /* best-effort */ }
        try { rmSync(base, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    }
  } finally {
    try { rmSync(wsBase, { recursive: true, force: true }); } catch { /* best-effort */ }
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
    history: { type: 'string', default: null }, // RETENTION R8: the instant path — read the per-map ledger
    last: { type: 'number', default: 10 },
    focus: { type: 'string', default: '.' },
    labels: { type: 'string', default: null },
    json: { type: 'bool', default: false },
  },
});
const opts = { graphs: pos, git: f.git, history: f.history, last: Math.max(1, f.last), focus: f.focus, json: f.json, labels: f.labels != null ? f.labels.split(',') : null };
let rows = [];
if (opts.history) {
  // RETENTION R8: run.mjs appends one metrics row per full map to .codeweb/history.jsonl — the
  // series this dashboard used to recompute (N full pipeline runs into a temp dir) and discard.
  // Instant, no pipeline; --git remains for backfilling history that predates the ledger.
  const raw = readFileSync(resolve(opts.history), 'utf8');
  rows = raw.split('\n').filter((l) => l.trim()).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; } // a torn tail line is skipped, not fatal
  }).map((r, i) => ({
    label: r.at ? String(r.at).slice(0, 10) : `map ${i + 1}`,
    confirmed: r.confirmed ?? 0, candidates: r.candidates ?? 0, coupling: r.coupling ?? 0,
    nodes: r.symbols ?? 0, files: r.files ?? 0,
  }));
} else if (opts.git) {
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
// REVENUE §3.4: someone graphing structural health over 5+ snapshots is doing by hand the job a
// hosted rollup would do — the team-lead surface gets the one-line rail (text mode only).
if (!opts.json && rows.length >= 5) {
  console.log('\ncodeweb is free — sponsoring pays for its benchmarks: https://github.com/sponsors/GhostlyGawd');
}
