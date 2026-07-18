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
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // plugin root (parent of scripts/)

const argv = process.argv.slice(2);
const opts = { src: null, target: null, outDir: null };
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--target') opts.target = argv[++i];
  else if (t === '--out-dir') opts.outDir = argv[++i];
  else if (!opts.src) opts.src = t;
}
if (!opts.src) { console.error('usage: run.mjs <SRC> [--target <label>] [--out-dir <dir>]'); process.exit(1); }
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
  try {
    execFileSync(node, [file, ...args], { stdio: 'inherit', env: useEnv ? env : process.env, cwd: ROOT });
  } catch (e) {
    // The stage already printed its own diagnostics (stdio inherited) — add one clean line, not a
    // raw execFileSync stack dump.
    console.error(`\n[run] stage '${label}' failed${typeof e?.status === 'number' ? ` (exit ${e.status})` : ''} — aborting`);
    process.exit(1);
  }
};

const targetArg = opts.target ? ['--target', opts.target] : [];
run('extract', S('scripts/extract-symbols.mjs'), [opts.src, ...targetArg, '--out', join(ws, 'fragment.json')], false);
run('cluster', S('scripts/cluster3.mjs'), [], true);
run('overlap', S('scripts/overlap.mjs'), [], true);
run('optimize', S('scripts/optimize.mjs'), [join(ws, 'graph.json'), '--out', join(ws, 'optimize.md')], false);
run('report', S('scripts/build-report.mjs'), [join(ws, 'graph.json')], false);

console.error(`\n[run] done -> ${ws}`);
console.error(`[run]   ${ws}/report.html · report.md · overlap.md · optimize.md · graph.json · fragment.json`);
