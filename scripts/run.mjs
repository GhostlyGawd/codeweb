#!/usr/bin/env node
// codeweb — pipeline orchestrator (the entry point the /codeweb command + codebase-anatomy skill call).
// Runs the full deterministic pipeline for ONE target into its OWN workspace, so analyzing several
// targets never clobbers each other's outputs. Resolves all paths from the plugin root, so it works
// regardless of the caller's cwd (e.g. `node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs <target>`).
//
//   node scripts/run.mjs <SRC> [--target <label>] [--out-dir <dir>]
//
// Default workspace: <plugin>/.codeweb/runs/<slug>  (override with --out-dir, e.g. <target>/.codeweb).
// Stages read their workspace from CODEWEB_WS (default '.live' when run standalone).
// Outputs in the workspace: fragment.json, graph.json, overlap.md, report.html, report.md.
// Read-only over the target; never executes target code.

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { atomicWrite, SCAN_CACHE_NAME, parseArgs } from './lib/cli.mjs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // plugin root (parent of scripts/)

// Bump when ANY downstream stage (cluster/overlap/optimize/report) changes behavior — it keys the
// stage memo, so an old workspace can never serve outputs computed by an older pipeline.
const MEMO_VERSION = 1;

const USAGE = `usage: run.mjs <SRC> [--target <label>] [--out-dir <dir>] [--open] [--full] [--allow-empty]
  <SRC>            path to the codebase to map (any of the 11 native languages)
  --target <label> workspace slug (default: last two path segments of <SRC>)
  --out-dir <dir>  where the artifacts go (default: .live/<slug> under the plugin root)
  --open           open report.html when the map is built
  --full           recompute every stage (skip the fragment memo + edge cache)
  --allow-empty    permit a target with no supported source (writes an empty map)
  --coverage <p>   annotate the graph with a coverage report (lcov or c8 JSON) after mapping`;
// finding 24: THE flag loop (lib/cli.mjs parseArgs). This file pioneered the unknown-flag
// rejection (#5: `--help` once became the target path); the shared loop carries that policy now.
const { opts: flags, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    target: { type: 'string', default: null },
    'out-dir': { type: 'string', default: null },
    open: { type: 'bool', default: false },
    full: { type: 'bool', default: false },
    'allow-empty': { type: 'bool', default: false }, // forwarded to extract: skip the empty-map guard
    coverage: { type: 'string', default: null },     // #13: measured-execution annotation after the map
  },
});
const opts = { src: pos[0] ?? null, target: flags.target, outDir: flags['out-dir'], open: flags.open, full: flags.full, allowEmpty: flags['allow-empty'], coverage: flags.coverage };
if (!opts.src) { console.error(USAGE); process.exit(2); }
// Resolve the target against the CALLER's cwd (not the plugin root the stages run in) — a relative
// <SRC> must mean the same thing as a relative --out-dir. Fail here with one clean line, not a
// stage-level stack trace.
opts.src = resolve(opts.src);
if (!existsSync(opts.src)) { console.error(`[run] target not found: ${opts.src}`); process.exit(1); }

// slug = whole target label (or last 2 path segments of src), so e.g. ecc/scripts -> "ecc-scripts"
// rather than a collision-prone "scripts".
const base = opts.target || opts.src.replace(/\\/g, '/').replace(/\/+$/, '').split('/').slice(-2).join('/');
const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'target';
const ws = opts.outDir ? resolve(opts.outDir) : join(ROOT, '.codeweb', 'runs', slug);
mkdirSync(ws, { recursive: true });

const env = { ...process.env, CODEWEB_WS: ws };
const node = process.execPath;
const S = (p) => join(ROOT, p);
const run = (label, file, args, useEnv) => {
  console.error(`\n[run] ${label}`);
  const t0 = Date.now();
  try {
    execFileSync(node, [file, ...args], { stdio: 'inherit', env: useEnv ? env : process.env, cwd: ROOT });
  } catch (e) {
    // The stage already printed its own diagnostics (stdio inherited) — add one clean line, not a
    // raw execFileSync stack dump.
    console.error(`\n[run] stage '${label}' failed${typeof e?.status === 'number' ? ` (exit ${e.status})` : ''} — aborting`);
    process.exit(1);
  }
  // Per-stage wall-time, stderr only (Spec K): the scale bench parses these lines; artifacts
  // never see a timestamp from here.
  console.error(`[run] ${label} done in ${Date.now() - t0}ms`);
};

const targetArg = opts.target ? ['--target', opts.target] : [];
// Extract always runs — it is the change detector — and rides the scan cache (Spec A), so a
// no-change re-run costs ~the regex baseline instead of a full parse.
run('extract', S('scripts/extract-symbols.mjs'), [opts.src, ...targetArg, ...(opts.allowEmpty ? ['--allow-empty'] : []), '--cache', join(ws, SCAN_CACHE_NAME), '--out', join(ws, 'fragment.json')], false);

// Spec B (docs/specs/perf-stage-memo-scale.md): the four downstream stages are pure functions of
// (fragment bytes, CODEWEB_* levers, pipeline version). When that key matches the previous run and
// every output still exists, reuse the outputs — wall-time changes, never a byte. --full forces.
const STAGE_OUTPUTS = ['graph.json', 'overlap.md', 'optimize.md', 'report.html', 'report.md'];
// Round 2, finding #19 (T-19.3): SOURCE_DATE_EPOCH joins the lever string when set — the stage
// outputs bake it in (graph.json's generatedAt rides the hashed bytes), so a changed epoch must
// never reuse old-epoch bytes, which the per-output hashes below would then fossilize.
const levers = Object.keys(process.env)
  .filter((k) => k.startsWith('CODEWEB_') && k !== 'CODEWEB_WS').sort()
  .map((k) => `${k}=${process.env[k]}`).join(';')
  + (process.env.SOURCE_DATE_EPOCH !== undefined ? `;SOURCE_DATE_EPOCH=${process.env.SOURCE_DATE_EPOCH}` : '');
const memoKey = createHash('sha1')
  .update(`v${MEMO_VERSION}|${levers}|`).update(readFileSync(join(ws, 'fragment.json')))
  .digest('hex');
const memoPath = join(ws, '.stages.json');
const sha1hex = (buf) => createHash('sha1').update(buf).digest('hex');
// Round 2, finding #19 (T-19.3): the memo records {s: byteLen, h: sha1} per output, hashed from
// each output's FINAL bytes (post-rename) just before the memo write. Reuse then requires the key
// match AND every output to exist with matching size (checked FIRST — truncation never hashes)
// and sha1. This replaces graphParses(): the old belt full-parsed graph.json (~167 ms @13.9 MB)
// yet caught only unparseable corruption of that one file — the other four outputs had no belt at
// all, and a parseable byte-tamper sailed through. Any miss -> recompute all (all-or-nothing, as
// before); a memo without `outputs` (old shape) or corrupt -> recompute once, upgraded on write; a
// crash between an output rename and the memo write leaves mismatched hashes -> recompute.
let prevMemo = null;
try { prevMemo = JSON.parse(readFileSync(memoPath, 'utf8')); } catch { /* absent/corrupt -> compute */ }
const outputsIntact = () => {
  if (!prevMemo || !prevMemo.outputs) return false; // old-shape memo: recompute, one run upgrades
  for (const f of STAGE_OUTPUTS) {
    const rec = prevMemo.outputs[f];
    if (!rec) return false;
    const p = join(ws, f);
    let st; try { st = statSync(p); } catch { return false; }      // missing
    if (st.size !== rec.s) return false;                           // truncated/resized: size first, never hash
    try { if (sha1hex(readFileSync(p)) !== rec.h) return false; }  // tampered — parseable or not
    catch { return false; }
  }
  return true;
};
const reusable = !opts.full && prevMemo?.key === memoKey && outputsIntact();

if (reusable) {
  console.error('\n[run] stages reused (fragment unchanged) — skipping downstream recompute; --full forces');
} else {
  run('cluster', S('scripts/cluster3.mjs'), [], true);
  run('overlap', S('scripts/overlap.mjs'), [], true);
  run('optimize', S('scripts/optimize.mjs'), [join(ws, 'graph.json'), '--out', join(ws, 'optimize.md')], false);
  run('report', S('scripts/build-report.mjs'), [join(ws, 'graph.json'), ...(opts.open ? ['--open'] : [])], false);
  try {
    const outputs = {};
    for (const f of STAGE_OUTPUTS) { const b = readFileSync(join(ws, f)); outputs[f] = { s: b.length, h: sha1hex(b) }; }
    atomicWrite(memoPath, JSON.stringify({ key: memoKey, at: new Date().toISOString(), outputs }) + '\n');
  } catch { /* memo is best-effort */ }
}

// Round 2, finding #18a: persist the post-edit hook's baseline summary beside graph.json — the
// hook then skips its per-edit baseline parse + before-side cycle/index recompute. On the reuse
// path only when the sidecar is missing/stale (one graph parse, amortized); best-effort by
// contract — a sidecar failure must never fail a map.
try {
  const { computeHookBaseline, writeHookBaselineBeside, hookBaselineFresh } = await import('./lib/hook-baseline.mjs');
  const gp = join(ws, 'graph.json');
  if (!reusable || !hookBaselineFresh(gp)) {
    const bytes = readFileSync(gp, 'utf8');
    writeHookBaselineBeside(gp, computeHookBaseline(JSON.parse(bytes), bytes, statSync(gp).mtimeMs));
  }
} catch { /* sidecar is best-effort */ }

if (opts.coverage) run('coverage', S('scripts/coverage.mjs'), [join(ws, 'graph.json'), resolve(opts.coverage)], false); // #13

console.error(`\n[run] done -> ${ws}`);
console.error(`[run]   ${ws}/report.html · report.md · overlap.md · optimize.md · graph.json · fragment.json`);
// #5: the map's whole point is to be LOOKED AT — say so (auto-open stays opt-in via --open).
if (!opts.open) console.error(`[run]   open ${join(ws, 'report.html')} in your browser (or re-run with --open)`);
// #10: the value receipt shows up where the user already is — one line, only when non-empty.
try {
  const { readStats, lifetimeTotals, monthLine } = await import('./lib/stats.mjs');
  const receipt = monthLine(lifetimeTotals(readStats(join(ws, 'graph.json'))));
  if (receipt) console.error(`[run]   codeweb here so far: ${receipt} (full receipt: scripts/stats.mjs)`);
} catch { /* receipt must never break the pipeline */ }
