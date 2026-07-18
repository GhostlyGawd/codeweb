// codeweb shared CLI harness — the one place stdout/exit/graph-loading plumbing lives.
// Motivated by codeweb's own overlap finding ("CLI scaffolding hand-rolled across N scripts") and by
// a real output-corruption bug: `process.stdout.write(big); process.exit(0)` silently drops
// everything past the OS pipe buffer (~64KB) because exit() discards queued async writes. Every
// emitter below ends the process NATURALLY (process.exitCode + event-loop drain), which is the
// documented Node way to guarantee a full flush. stderr messages are small (< pipe buffer), so
// die() may still hard-exit.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph } from './graph-ops.mjs';

// A consumer like `| head -1` closes the pipe early; without a handler Node dies on EPIPE with a
// stack trace. Treat it as a normal end-of-output.
process.stdout.on('error', (e) => { if (e && e.code === 'EPIPE') process.exit(0); throw e; });

/** stderr + immediate exit. Only for SMALL diagnostic messages (they fit the pipe buffer). */
export function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

/** Set the exit code WITHOUT killing pending stdout writes. Callers must fall off the end. */
export function finish(code = 0) {
  process.exitCode = code;
}

/** Write a JSON payload (any size) to stdout, flush-safe. Ends the turn via finish(code). */
export function emitJson(payload, code = 0) {
  process.stdout.write(JSON.stringify(payload) + '\n');
  finish(code);
}

/** Write pre-rendered text lines (any size) to stdout, flush-safe. */
export function emitText(text, code = 0) {
  process.stdout.write(text.endsWith('\n') || text === '' ? text : text + '\n');
  finish(code);
}

/**
 * Resolve the graph path from an explicit arg or the CODEWEB_WS workspace, load, parse, normalize.
 * Dies with the shared, actionable message on absence/corruption. Returns { graph, abs }.
 */
export function loadGraph(pathArg, { usage = null } = {}) {
  const graphPath = pathArg || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
  if (!graphPath) die(usage || 'usage: <graph.json> required (or set CODEWEB_WS)', 2);
  const abs = resolve(graphPath);
  if (!existsSync(abs)) die(`graph not found: ${abs} — build it first (run /codeweb, or: node scripts/run.mjs <target> --out-dir <target>/.codeweb)`, 2);
  let graph;
  try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
  catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }
  return { graph, abs };
}

/**
 * Shared list-truncation for budgeted output: keep the first `limit` items and describe the rest,
 * so a tool can return top-N + an explicit remainder instead of an unbounded dump (no silent caps).
 * limit == null / Infinity -> untouched.
 */
export function capList(items, limit, offset = 0) {
  const all = Array.isArray(items) ? items : [];
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  if (limit == null || !Number.isFinite(limit)) {
    return { items: off ? all.slice(off) : all, total: all.length, offset: off, truncated: false, remaining: 0 };
  }
  const lim = Math.max(0, Math.floor(limit));
  const slice = all.slice(off, off + lim);
  const remaining = Math.max(0, all.length - (off + slice.length));
  return { items: slice, total: all.length, offset: off, truncated: remaining > 0, remaining };
}
