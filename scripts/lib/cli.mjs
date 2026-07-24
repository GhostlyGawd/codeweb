// codeweb shared CLI harness — the one place stdout/exit/graph-loading plumbing lives.
// Motivated by codeweb's own overlap finding ("CLI scaffolding hand-rolled across N scripts") and by
// a real output-corruption bug: `process.stdout.write(big); process.exit(0)` silently drops
// everything past the OS pipe buffer (~64KB) because exit() discards queued async writes. Every
// emitter below ends the process NATURALLY (process.exitCode + event-loop drain), which is the
// documented Node way to guarantee a full flush. stderr messages are small (< pipe buffer), so
// die() may still hard-exit.

import { readFileSync, existsSync, statSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { normalizeGraph } from './graph-ops.mjs';
import { sha1 } from './hash.mjs';
// finding 24: the pure helpers live in lib/common.mjs (no EPIPE side effect); re-exported
// here so every existing importer keeps working unchanged.
export { SRC_RE, SCAN_CACHE_NAME, sign, capList } from './common.mjs';

// A consumer like `| head -1` closes the pipe early; without a handler Node dies on EPIPE with a
// stack trace. Treat it as a normal end-of-output.
process.stdout.on('error', (e) => { if (e && e.code === 'EPIPE') process.exit(0); throw e; });

/** stderr + immediate exit. Only for SMALL diagnostic messages (they fit the pipe buffer). */
export function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

/**
 * THE flag loop (finding 24). Twenty-five scripts hand-rolled `for (let i = 0; i < argv.length…)`
 * with three different unknown-flag policies — run.mjs rejected unknown flags (the documented #5
 * convention, adopted after `--help` silently became a target path), while trend/build-report
 * still swallowed them as positionals. One loop, one policy:
 *   - unknown flag  -> die(2) with the usage (never a silent positional),
 *   - --help / -h   -> print usage, exit 0 (every CLI answers --help, including the 11 that didn't),
 *   - value flags   -> next token; a missing or (for numbers) non-numeric value dies with the flag named.
 * spec: { usage, flags: { name: { type: 'bool'|'string'|'number'|'float'|'pair', default? } } }.
 * 'pair' consumes TWO tokens (reading-order's `--scope <kind> <value>`) -> [v1, v2].
 * Returns { opts, pos } — opts keyed by the flag name (sans dashes), pos = positional tokens.
 */
// CLI review "first fix": the parser coaches instead of walling. Levenshtein for did-you-mean —
// tiny inputs (flag names/arg keys), plain DP. Exported: the MCP layer's unknown-argument
// near-miss (API F4) uses the same tier — one implementation, per codeweb's own gate.
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[n];
}
const nearestFlag = (name, flags) => {
  const cands = [...Object.keys(flags), 'help'];
  let best = null, bestD = Infinity;
  for (const c of cands) {
    const d = editDistance(name.toLowerCase(), c);
    if (d < bestD) { best = c; bestD = d; }
  }
  return bestD <= 2 || (best && best.startsWith(name)) ? best : null;
};
// Usage strings name the script file; when invoked through a bin wrapper (codeweb-query,
// codeweb-diff), say the name the user actually typed.
const speakUsage = (usage) => {
  const invoked = basename(process.argv[1] || '');
  return invoked.startsWith('codeweb') ? String(usage).replace(/^usage: \S+\.mjs/, `usage: ${invoked.replace(/\.mjs$/, '')}`) : usage;
};

export function parseArgs(argv, spec) {
  const flags = spec.flags || {};
  const opts = {};
  for (const [k, f] of Object.entries(flags)) if (f.default !== undefined) opts[k] = f.default;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    let t = argv[i];
    if (t === '--help' || t === '-h') { console.log(speakUsage(spec.usage)); process.exit(0); }
    if (t.startsWith('-') && t !== '-') {
      // accept --flag=value (the convention every other CLI taught people)
      let inline;
      const eq = t.indexOf('=');
      if (eq > 1) { inline = t.slice(eq + 1); t = t.slice(0, eq); }
      const name = t.replace(/^--?/, '');
      const f = flags[name];
      if (!f) {
        const near = nearestFlag(name, flags);
        die(`unknown flag: ${t}${near ? ` (did you mean --${near}?)` : ''}\n${speakUsage(spec.usage)}`, 2);
      }
      if (f.type === 'bool') {
        if (inline !== undefined) {
          if (inline !== 'true' && inline !== 'false') die(`flag ${t} is a switch — use ${t} or ${t}=false\n${speakUsage(spec.usage)}`, 2);
          opts[name] = inline === 'true';
        } else opts[name] = true;
        continue;
      }
      const v = inline !== undefined ? inline : argv[++i];
      if (v === undefined) die(`flag ${t} needs a value\n${speakUsage(spec.usage)}`, 2);
      if (f.type === 'number' || f.type === 'float') {
        const n = f.type === 'float' ? parseFloat(v) : parseInt(v, 10);
        if (Number.isNaN(n)) die(`flag ${t} needs a number (got "${v}")\n${speakUsage(spec.usage)}`, 2);
        // FORMS F14c: flags can declare a floor (min: 0 on limits/offsets) — a negative limit
        // silently minted empty pages with a nextOffset:0 loop instead of an error.
        if (f.min !== undefined && n < f.min) die(`flag ${t} must be >= ${f.min} (got ${v})\n${speakUsage(spec.usage)}`, 2);
        opts[name] = n;
      } else if (f.type === 'pair') {
        const v2 = argv[++i];
        if (v2 === undefined) die(`flag ${t} needs two values\n${speakUsage(spec.usage)}`, 2);
        opts[name] = [v, v2];
      } else opts[name] = v;
    } else pos.push(t);
  }
  return { opts, pos };
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
  if (!graphPath) {
    // ERRORS R1: 20 tools passed {usage} here and REPLACED the shared cause+remedy with a bare
    // usage wall — syntax-blame for an environment problem. Append, never substitute.
    die([
      `no map found — checked the graph argument, CODEWEB_WS, and every .codeweb/ above ${process.cwd()}.`,
      'map this repo first: npx -y @ghostlygawd/codeweb <repo root>   (in Claude Code: /codeweb)',
      `then: ${speakUsage(usage || 'usage: <graph.json> [flags]')}`,
    ].join('\n'), 2);
  }
  const abs = resolve(graphPath);
  if (!existsSync(abs)) die(`graph not found: ${abs} — build it first (run /codeweb, or: node scripts/run.mjs <target> --out-dir <target>/.codeweb)`, 2);
  let graph;
  try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
  catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }
  return { graph, abs };
}

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

/**
 * Cached, best-effort source access for a graph's target (meta.root) — THE body reader
 * (context-pack, find-similar, diff rename-matching all read node spans; the logic lives once).
 * bodyOf(node) = the exact source lines [line, line+loc-1], or null when unreadable.
 */
export function sourceReader(root) {
  const available = !!root && existsSync(root);
  const cache = new Map();
  const linesOf = (rel) => {
    if (!available) return null;
    if (!cache.has(rel)) { try { cache.set(rel, readFileSync(root + '/' + rel, 'utf8').split(/\r?\n/)); } catch { cache.set(rel, null); } }
    return cache.get(rel);
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

