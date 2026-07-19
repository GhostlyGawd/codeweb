#!/usr/bin/env node
// Spec K (docs/specs/bench-scale-runnable.md) — the monorepo scale test as a runnable experiment.
// Drives the real pipeline against any checkout and emits one traceable JSON:
//   - cold full build (total + per-stage ms, parsed from run.mjs's stderr timing lines)
//   - no-change re-run (total ms + whether the stage memo actually fired)
//   - one-file-edit re-run (append a tiny function to a deterministic source file, re-map,
//     restore the file byte-identically) — the "re-map after an agent edit" cost Spec O targets
//   - query latencies on the highest-fan-in symbol (per-call subprocess, incl. graph parse)
//   - graph stats + engine version + target SHA, so the numbers are traceable to what made them
//
//   node bench/experiments/scale.mjs --repo <dir> --out <results.json> [--label <s>] [--ws <dir>] [--keep-ws]
//
// The previous scale figures were measured by hand and could not be reproduced; this script is
// the fix. It records whatever the numbers ARE — no thresholds, no gates.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- stderr parsing (exported for tests: reuse-honesty is pinned here) ------------------------
export function parseStageTimes(stderr) {
  const out = {};
  for (const m of String(stderr).matchAll(/\[run\] (\w+) done in (\d+)ms/g)) out[m[1]] = Number(m[2]);
  return out;
}
export const sawReuseBanner = (stderr) => /stages reused \(fragment unchanged\)/.test(String(stderr));

// ---- pipeline + query drivers -----------------------------------------------------------------
function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
}

function runPipeline(target, ws, extra = []) {
  const t0 = Date.now();
  const r = sh(process.execPath, [join(ROOT, 'scripts', 'run.mjs'), target, '--out-dir', ws, ...extra]);
  if (r.status !== 0) throw new Error(`run.mjs failed (exit ${r.status}) on ${target}:\n${r.stderr}`);
  return { totalMs: Date.now() - t0, stagesMs: parseStageTimes(r.stderr), reused: sawReuseBanner(r.stderr) };
}

function timeQuery(graph, args) {
  const t0 = Date.now();
  const r = sh(process.execPath, [join(ROOT, 'scripts', 'query.mjs'), graph, ...args, '--json'], { cwd: ROOT });
  if (r.status !== 0) throw new Error(`query.mjs ${args.join(' ')} failed (exit ${r.status}):\n${r.stderr}`);
  return Date.now() - t0;
}

// Deterministic edit target: first (file,id)-sorted node whose file the touch snippet can extend.
const TOUCH = {
  js: '\n// codeweb scale-bench touch (removed after measuring)\nexport function __codewebScaleTouch__() {\n  return 1;\n}\n',
  py: '\n# codeweb scale-bench touch (removed after measuring)\ndef __codeweb_scale_touch__():\n    return 1\n',
};
const touchFor = (file) => (/\.(m?[jt]s|c[jt]s|[jt]sx)$/.test(file) ? TOUCH.js : /\.py$/.test(file) ? TOUCH.py : null);

function pickEditFile(fragment) {
  const files = [...new Set(fragment.nodes.map((n) => n.file))].sort();
  const file = files.find((f) => touchFor(f));
  if (!file) throw new Error('no .js/.ts/.py source file in the fragment to touch');
  return file;
}

// ---- main -------------------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const opt = { repo: null, out: null, label: null, ws: null, keepWs: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--repo') opt.repo = resolve(argv[++i]);
    else if (t === '--out') opt.out = resolve(argv[++i]);
    else if (t === '--label') opt.label = argv[++i];
    else if (t === '--ws') opt.ws = resolve(argv[++i]);
    else if (t === '--keep-ws') opt.keepWs = true;
  }
  if (!opt.repo || !opt.out) {
    console.error('usage: scale.mjs --repo <dir> --out <results.json> [--label <s>] [--ws <dir>] [--keep-ws]');
    process.exit(1);
  }
  const ws = opt.ws || mkdtempSync(join(tmpdir(), 'codeweb-scale-'));
  rmSync(ws, { recursive: true, force: true });

  const gitSha = (() => {
    const r = sh('git', ['-C', opt.repo, 'rev-parse', 'HEAD']);
    return r.status === 0 ? r.stdout.trim() : null;
  })();

  console.error(`[scale] target ${opt.repo}${gitSha ? ` @ ${gitSha.slice(0, 10)}` : ''} -> ws ${ws}`);

  console.error('[scale] cold full build...');
  const cold = runPipeline(opt.repo, ws);
  console.error(`[scale]   ${cold.totalMs}ms (${Object.entries(cold.stagesMs).map(([s, v]) => `${s} ${v}`).join(', ')})`);

  console.error('[scale] no-change re-run...');
  const noChange = runPipeline(opt.repo, ws);
  console.error(`[scale]   ${noChange.totalMs}ms, stagesReused=${noChange.reused}`);

  console.error('[scale] one-file-edit re-run...');
  const fragment = JSON.parse(readFileSync(join(ws, 'fragment.json'), 'utf8'));
  const editRel = pickEditFile(fragment);
  const editAbs = join(opt.repo, editRel);
  const original = readFileSync(editAbs);
  let edit;
  try {
    writeFileSync(editAbs, Buffer.concat([original, Buffer.from(touchFor(editRel))]));
    edit = runPipeline(opt.repo, ws);
  } finally {
    writeFileSync(editAbs, original); // byte-identical restore, whatever happened above
  }
  console.error(`[scale]   ${edit.totalMs}ms on ${editRel} (${Object.entries(edit.stagesMs).map(([s, v]) => `${s} ${v}`).join(', ')})`);
  // Leave the workspace consistent with the restored tree (also re-primes the query graph).
  const restoreRun = runPipeline(opt.repo, ws);

  const graphPath = join(ws, 'graph.json');
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const indeg = new Map();
  for (const e of graph.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const hub = [...indeg.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  const hubId = hub ? hub[0] : graph.nodes[0].id;

  console.error(`[scale] queries on ${hubId} (fan-in ${hub ? hub[1] : 0})...`);
  const queries = {
    symbol: hubId,
    fanIn: hub ? hub[1] : 0,
    impactMs: timeQuery(graphPath, ['--impact', hubId]),
    callersMs: timeQuery(graphPath, ['--callers', hubId]),
    cyclesMs: timeQuery(graphPath, ['--cycles']),
    orphansMs: timeQuery(graphPath, ['--orphans']),
    note: 'per-call subprocess incl. graph parse; in-process MCP serves from cache',
  };

  const result = {
    bench: 'monorepo scale test (Spec K, docs/specs/bench-scale-runnable.md)',
    target: { path: opt.repo, sha: gitSha, label: opt.label || opt.repo.split('/').slice(-2).join('/') },
    engine: { version: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version },
    graph: {
      symbols: graph.nodes.length,
      edges: graph.edges.length,
      files: new Set(graph.nodes.map((n) => n.file)).size,
      domains: (graph.domains || []).length,
      overlaps: (graph.overlaps || []).length,
      graphJsonBytes: statSync(graphPath).size,
    },
    pipeline: {
      cold: { totalMs: cold.totalMs, stagesMs: cold.stagesMs },
      noChange: { totalMs: noChange.totalMs, stagesReused: noChange.reused },
      oneFileEdit: {
        totalMs: edit.totalMs,
        stagesMs: edit.stagesMs,
        editedFile: editRel,
        editKind: 'append-function',
        changedFragment: !edit.reused,
      },
      restoreRun: { totalMs: restoreRun.totalMs, stagesReused: restoreRun.reused },
    },
    queries,
  };
  writeFileSync(opt.out, JSON.stringify(result, null, 2) + '\n');
  console.error(`[scale] wrote ${opt.out}`);
  if (!opt.keepWs && !opt.ws) rmSync(ws, { recursive: true, force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
