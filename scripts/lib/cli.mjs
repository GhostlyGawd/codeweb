// codeweb shared CLI harness — the one place stdout/exit/graph-loading plumbing lives.
// Motivated by codeweb's own overlap finding ("CLI scaffolding hand-rolled across N scripts") and by
// a real output-corruption bug: `process.stdout.write(big); process.exit(0)` silently drops
// everything past the OS pipe buffer (~64KB) because exit() discards queued async writes. Every
// emitter below ends the process NATURALLY (process.exitCode + event-loop drain), which is the
// documented Node way to guarantee a full flush. stderr messages are small (< pipe buffer), so
// die() may still hard-exit.

import { readFileSync, existsSync, statSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { normalizeGraph } from './graph-ops.mjs';
import { sha1 } from './hash.mjs';

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

/**
 * Crash-safe artifact write: serialize to a same-directory temp file, then rename over the target.
 * rename(2) is atomic on POSIX (and effectively so on NTFS), so a concurrent reader sees the OLD
 * bytes or the NEW bytes — never a truncated half-write. Motivated by a reproduced corruption
 * (perf-quality finding 3): the MCP server SIGTERMs its refresh child at 60s, and an in-place
 * writeFileSync of a multi-MB graph.json killed mid-write left a workspace every query tool died
 * on — which the stage memo then preserved. Every graph/fragment/sidecar writer goes through here.
 * The temp name is pid-suffixed (concurrent writers can't collide); on rename failure the temp is
 * removed and the error rethrown.
 */
export function atomicWrite(path, data) {
  // A rename REPLACES the target inode — correct for regular files, destructive for special ones
  // (renaming over /dev/null would swap the device node for a regular file). Anything that isn't
  // a regular file gets a plain write-through instead.
  try { if (!statSync(path).isFile()) { writeFileSync(path, data); return; } } catch { /* absent -> atomic path */ }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  try { renameSync(tmp, path); }
  catch (e) { try { rmSync(tmp, { force: true }); } catch { /* best-effort */ } throw e; }
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
 * Resolve the graph path from an explicit arg, the CODEWEB_WS workspace, or — #5 — the nearest
 * `.codeweb/graph.json` above the cwd (the same walk-up the hooks and MCP server already use, via
 * findTarget below). Auto-discovery says which graph it picked (stderr), so a surprising choice is
 * visible. Dies with the shared, actionable message on absence/corruption. Returns { graph, abs }.
 */
export function loadGraph(pathArg, { usage = null } = {}) {
  let graphPath = pathArg || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
  if (!graphPath) {
    const near = findTarget(join(process.cwd(), 'x')); // findTarget walks up from a FILE's dir; anchor so the walk starts AT cwd
    if (near) {
      graphPath = near.baseline;
      console.error(`[codeweb] using ${near.baseline} (nearest .codeweb above cwd)`);
    }
  }
  if (!graphPath) die(usage || 'usage: <graph.json> required (or set CODEWEB_WS, or run from a mapped repo)', 2);
  const abs = resolve(graphPath);
  if (!existsSync(abs)) die(`graph not found: ${abs} — build it first (run /codeweb, or: node scripts/run.mjs <target> --out-dir <target>/.codeweb)`, 2);
  let graph;
  try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
  catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }
  return { graph, abs };
}

/**
 * Cached, best-effort source access for a graph's target (meta.root) — THE body reader
 * (context-pack, find-similar, diff rename-matching all read node spans; the logic lives once).
 * bodyOf(node) = the exact source lines [line, line+loc-1], or null when unreadable.
 */
// One truth for "what counts as a mappable source file" — the extractor's SRC list, mirrored
// here for the hooks (Spec E consolidation; the hooks previously trailed the extractor's list).
export const SRC_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|cs|rb|php|kt|kts|swift)$/;

// finding 17: THE scan-cache filename. run.mjs wrote `.scan-cache.json`, the post-edit hook
// `scan-cache.json`, and refresh.mjs `extract-cache.json` — three identical caches for one
// workspace, so the first hook fire after every map ran a COLD full re-scan (28.7s at 16k
// symbols, against the hook's own 30s timeout) and the first MCP auto-refresh was cold too.
// Every extract caller uses this constant; the cache is engine-namespaced, so callers must also
// agree on engine flags (they do now — the hook dropped its lone --no-ctags).
export const SCAN_CACHE_NAME = '.scan-cache.json';

// #6 (IMPROVEMENTS.md): manifest-declared entrypoints — files a HOST invokes without a code edge.
// deadcode's "safe to delete" tier listed the VS Code extension's activate/deactivate (package.json
// `main`) and hook scripts (hooks.json commands) on codeweb's own map; anything a manifest names is
// review-tier, never safe. Sources: every package.json beside mapped files (main/bin/exports),
// hooks/hooks.json, .claude-plugin/plugin.json (path-ish tokens). Fail-open: unreadable/absent
// manifests contribute nothing. Returns Map<relFile, manifestRelPath>.
export function manifestEntryFiles(root, relFiles) {
  const entries = new Map();
  if (!root || !existsSync(root)) return entries;
  const relSet = new Set(relFiles);
  const claim = (p, manifest, baseDir) => {
    if (typeof p !== 'string' || !p) return;
    const clean = p.replace(/^\.\//, '').replace(/\$\{[A-Z_]+\}\//g, '');
    for (const cand of [clean, baseDir ? `${baseDir}/${clean}` : null]) {
      if (cand && relSet.has(cand) && !entries.has(cand)) entries.set(cand, manifest);
    }
  };
  const dirs = new Set(['']);
  for (const f of relFiles) { let d = f; while (d.includes('/')) { d = d.slice(0, d.lastIndexOf('/')); dirs.add(d); } }
  for (const d of dirs) {
    const pjPath = join(root, d, 'package.json');
    if (!existsSync(pjPath)) continue;
    const manifest = d ? `${d}/package.json` : 'package.json';
    try {
      const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
      claim(pj.main, manifest, d);
      const binVals = typeof pj.bin === 'string' ? [pj.bin] : Object.values(pj.bin || {});
      for (const v of binVals) claim(v, manifest, d);
      const flatExports = (x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(flatExports) : []);
      for (const v of flatExports(pj.exports)) claim(v, manifest, d);
    } catch { /* fail-open */ }
  }
  // Plugin surfaces reference scripts by path inside command strings — extract path-ish tokens.
  for (const manifest of ['hooks/hooks.json', '.claude-plugin/plugin.json']) {
    const p = join(root, manifest);
    if (!existsSync(p)) continue;
    try {
      for (const m of readFileSync(p, 'utf8').matchAll(/[\w@${}./-]+\.(?:mjs|cjs|js)/g)) claim(m[0], manifest, null);
    } catch { /* fail-open */ }
  }
  return entries;
}

// Walk up from a file to the nearest mapped workspace (.codeweb/graph.json). Previously
// duplicated verbatim in both hooks — codeweb's own campaign flagged it (Spec E dogfood).
export function findTarget(filePath) {
  let dir = dirname(resolve(filePath));
  for (let i = 0; i < 40; i++) {
    const baseline = join(dir, '.codeweb', 'graph.json');
    if (existsSync(baseline)) return { root: dir, baseline };
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function sourceReader(root) {
  const available = !!root && existsSync(root);
  const cache = new Map();
  // (Parameter deliberately NOT named `rel`: a bare identifier that uniquely matches a global
  // symbol elsewhere wires a false ref edge — the gate caught `rel` here closing a cycle with
  // the extractor the moment cli.mjs gained an importer there. Same lesson as graph-ops' score/cap.)
  const linesOf = (relPath) => {
    if (!available) return null;
    if (!cache.has(relPath)) { try { cache.set(relPath, readFileSync(root + '/' + relPath, 'utf8').split(/\r?\n/)); } catch { cache.set(relPath, null); } }
    return cache.get(relPath);
  };
  const bodyOf = (n) => {
    const lines = n && linesOf(n.file);
    if (!lines) return null;
    return lines.slice(n.line - 1, n.line - 1 + (n.loc || 1)).join('\n');
  };
  return { available, linesOf, bodyOf };
}

/**
 * Staleness check against the extractor's per-file stamps (meta.sources: {rel: {s,m,h}}). Returns
 * null when the graph matches disk (or has no stamps/root); else { count, files: [up to 8 rels] }.
 * stat-only by default — a few ms even on thousands of files. New files can't be detected without
 * a walk (documented); changed + deleted are.
 *
 * verify tier (finding 4): mtime+size stamps are bypassed by mtime-preserving content changes
 * (rsync -a, tar -x, git-restore-mtime, SOURCE_DATE_EPOCH builds) — the graph reads fresh while
 * its edges describe old bytes. Pass {verify:true} — or set CODEWEB_VERIFY_FRESHNESS=1 once for
 * those workflows — to additionally sha1-compare content where the stat matches (reads every
 * stamped file; keep it opt-in).
 */
export function checkStaleness(graph, { verify = process.env.CODEWEB_VERIFY_FRESHNESS === '1' } = {}) {
  const root = graph?.meta?.root, sources = graph?.meta?.sources;
  if (!root || !sources || !existsSync(root)) return null;
  const stale = [];
  for (const [relPath, st] of Object.entries(sources)) {
    try {
      const cur = statSync(root + '/' + relPath);
      if (cur.size !== st.s || Math.round(cur.mtimeMs) !== st.m) stale.push(relPath);
      else if (verify && st.h && sha1(readFileSync(root + '/' + relPath, 'utf8')) !== st.h) stale.push(relPath + ' (content changed, stamp preserved)'); // utf8 decode matches the extractor's hashing exactly
    } catch { stale.push(relPath + ' (deleted)'); }
    if (stale.length >= 64) break; // enough to know it's stale; don't stat forever
  }
  // directory stamps catch NEW files (a created file touches its directory's mtime)
  for (const [relDir, m] of Object.entries(graph?.meta?.dirs || {})) {
    if (stale.length >= 64) break;
    try {
      const cur = statSync(relDir === '.' ? root : root + '/' + relDir);
      if (Math.round(cur.mtimeMs) !== m) stale.push(relDir + '/ (dir changed — new/removed files)');
    } catch { stale.push(relDir + '/ (dir deleted)'); }
  }
  return stale.length ? { count: stale.length, files: stale.slice(0, 8) } : null;
}

/** Signed-delta formatter for renderers ("+3", "-2", "+0" — a delta always shows its direction). */
export const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

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
