#!/usr/bin/env node
// codeweb symbol extractor: emits {nodes, edges} JSON conforming to the graph schema
// (skills/codebase-anatomy/references/graph-schema.md).
//
// Strategy (hybrid engine, in code):
//   - Symbol discovery prefers universal-ctags (`ctags --output-format=json`) when installed;
//     otherwise a built-in regex scanner handles JS/TS and Python.
//   - Call edges are derived by scanning call sites and mapping each to the enclosing symbol —
//     this works with or without ctags.
//   - Read-only: it never executes the target. The only child processes are `ctags`/`rg`,
//     which statically inspect files already on disk.
//
// Usage:
//   node extract-symbols.mjs <path> [--out fragment.json] [--no-ctags]

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url'; // finding #40 (T-40.3): main-guard idiom (the hooks' verbatim compare)
import { isTestFile, roleOf, compileRoleOverrides } from './lib/graph-ops.mjs'; // F4/v7: test predicate + code-role (shared, one truth)
import { atomicWrite, parseArgs } from './lib/cli.mjs'; // finding 3: cache/fragment writes are rename-atomic (hooks + refresh read them concurrently)
import { SRC_RE } from './lib/common.mjs'; // finding 25: one truth for the mappable-source list (the copy here could drift)
import { scanSymbols, bodyEnd, parseSignature, DYNAMIC_RE, langOf } from './lib/lang-rules.mjs'; // finding 25: pure per-language rules
import { createImportResolver, defaultExportOf, importCandidates } from './lib/import-resolve.mjs'; // finding 25: cross-file name binding, one place; finding #11: shared specifier-candidate list
import { cyclomatic, nestingDepth } from './lib/complexity.mjs'; // F4: per-symbol complexity/nesting
import { maskJs, maskPy, maskRuby } from './lib/masking.mjs'; // comment/string/regex-literal blanking (one truth, shared with codemod's rewrite gate)
import { createOwnerStack } from './lib/enclosing.mjs'; // finding #21: live open-class stack (property-pinned identical to the linear scan)
import { createEdgeDeriver, idFile, markPublicApi, resolveTypedIntents } from './lib/edge-derive.mjs'; // finding #40: per-file derivation factory + pub-API walk + typed-intent resolution; idFile (id->file split) is its one truth, imported back
import { sha1 } from './lib/hash.mjs'; // one truth — codeweb's own gate flagged the duplicate on this branch
import { loadTsEngine, loadLangEngine, probeAst } from './lib/ts-engine.mjs'; // optional tree-sitter tiers (JS/TS + Java/C# dispatch)

// F0: bump when scanSymbols/ctagsSymbols OUTPUT or the cache format changes — invalidates stale caches.
// v2: nodes carry complexity/maxDepth (F4) + the cache holds per-file edge lists + a symbol signature (F9).
// v3: namespace/default-import member-access resolution (util.merge() / new Default()) -> new call edges.
// v4: Python docstrings/comments masked before symbol+edge scan -> drops phantom symbols/edges.
// v5: opt-in tree-sitter engine owns JS/TS method nodes (class-qualified ids) + dispatch edges.
// v6: methods carry an owner (class / Rust impl type / Go receiver) -> owner-qualified ids
//     (`file:Type.method`) in EVERY tier, ending same-file same-name id collisions.
// v7: nodes carry a `role` (product|test|fixture|example|bench|generated); bodyEnd scans MASKED
//     lines (multi-line templates/comments can no longer desync brace matching); class-field arrow
//     methods discovered; bare-identifier arguments become `ref` edges (not fabricated `call`s);
//     bare-name resolution is package-scoped (no more cross-package name-collision edges).
// v8: Java + C# discovery (class/interface/enum/record/struct + methods with owner-qualified ids,
//     visibility-as-export, C# base-list inherit edges); pom.xml/build.gradle/.csproj join the
//     package-boundary manifests.
// v9: tree-sitter tier default-on when installed (dispatch recall); export-star re-export chains
//     resolve (barrel files no longer swallow edges).
// v13: maskJs lexes regex literals (perf-quality finding 1) — extents/edges cached by v12 are stale.
// v14: round-2 truth fixes (#8 template frames, #9 spread/IIFE, #12 accessor ids, #13 Ruby
// heredoc/PHP #, #14 Python f-strings, #15 crash belts) change cached syms/ast.tsr/edges.
// Ladder (orchestrator-reconciled, monotonic by build order): WS-B took 13 -> 14; WS-C took
// 14 -> 15; WS-D took 15 -> 16; the WS-D review takes 16 -> 17.
// v16: round-2 cache-format change (#19: edge tuples interned per entry as ids+[from,to,kind]
// triples, `syms` dropped — nodes/ranges are the one stored copy) plus #17's additive name-delta
// fields (cand/bindCand/bindDeps/pyrex, cache-top pkgSig).
const SCANNER_VERSION = 17; // v17: derivation-semantics change (WS-D review) — the bare-name
// fallback excludes closure-local targets (closureLocalIds), and symbolSig annotates eligibility
// so a nesting flip invalidates cached edges. A previous-version cache is discarded at load (one
// cold rebuild, never a crash) — the read gate below only accepts an exact version match.

// idFile (id -> file split) is defined+exported by lib/edge-derive.mjs and imported above — one
// truth shared with the edge deriver that keys on it most.

const USAGE = 'usage: extract-symbols.mjs <path> [--out f.json] [--target label] [--cache f.json] [--full] [--allow-empty] [--no-ctags] [--engine regex|tree-sitter]';
// finding #40 (WS-H T-40.3): argv parsing, ALL process exits, and the --out/stdout writes live in
// main() + the guard at EOF; runExtract(opts) is a pure engine call whose IMPORT is side-effect-free
// (the precondition for #18b's in-process hook and the deep fix for #6's spawn-bound trials).
// Guard-path exits become ExtractError throws with byte-identical message text — main() prints+exits.
class ExtractError extends Error {
  constructor(code, message) { super(message); this.name = 'ExtractError'; this.code = code; }
}
// WASM parser engines are stateless and expensive to init — memoized PROCESS-WIDE (not per
// runExtract call), so the in-process hook (#18b) and #6's concurrent IE trials pay the ~1.4s init
// at most once. Memoize the load PROMISE, not the resolved value, so two concurrent first-calls
// single-flight it; a null resolution = load-failed, kept (per-process "once failed, stays null",
// mirroring the old module-global memo).
let _tsEnginePromise;               // undefined = not attempted; Promise<engine|null>
const _langEnginePromises = {};     // langKey -> Promise<engine|null>

export async function runExtract(opts = {}) {
  // Defaults == today's CLI defaults (ctags on, engine from CODEWEB_ENGINE) so engineMode / cache
  // namespace / SCANNER_VERSION match — a warm cache the CLI wrote is reused by an in-process call.
  opts = { path: null, out: null, ctags: true, target: null, cache: null, full: false, allowEmpty: false, engine: process.env.CODEWEB_ENGINE || null, ...opts };
  // finding #7: an unknown engine must not silently enable the AST tier — loud (exit 2 via main);
  // catches CODEWEB_ENGINE garbage too (same default). 'ts' stays a valid tree-sitter alias.
  if (opts.engine && !['regex', 'tree-sitter', 'ts'].includes(opts.engine)) {
    throw new ExtractError(2, `[extract] unknown --engine "${opts.engine}" (valid: regex, tree-sitter)`);
  }
  if (!opts.path) throw new ExtractError(2, USAGE);
  const root = resolve(opts.path);

// Spec E: role overrides from the TARGET's own codeweb.rules.json (`roles: [{glob, role}]`) —
// applied after path heuristics, first match wins, invalid config is a hard exit 2 (never a
// silent skip). Absent file / absent section -> byte-identical behavior to before.
let roleOverride = () => null;
try {
  const rulesPath = join(root, 'codeweb.rules.json');
  if (existsSync(rulesPath)) roleOverride = compileRoleOverrides(JSON.parse(readFileSync(rulesPath, 'utf8')).roles);
} catch (e) { throw new ExtractError(2, `[extract] ${e.message}`); }
const roleFor = (rel) => roleOverride(rel) || roleOf(rel);
if (!existsSync(root)) throw new ExtractError(1, `[extract] not found: ${root}`);

const SRC = SRC_RE; // finding 25: the extractor and the hooks share ONE source-extension list
const SKIP = /(^|[\\/])(node_modules|\.git|dist|build|out|vendor|third_party|\.codeweb|coverage)([\\/]|$)/;

function tryExec(cmd, args) { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch { return null; } }
function toolExists(cmd) { return tryExec(cmd, ['--version']) != null; }

// ---- enumerate source files ----
function listFiles() {
  const viaRg = tryExec('rg', ['--files', root]);
  let files;
  if (viaRg != null) {
    files = viaRg.split(/\r?\n/).filter(Boolean);
  } else {
    files = [];
    const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (SKIP.test(p)) continue; if (e.isDirectory()) walk(p); else files.push(p); } };
    walk(root);
  }
  // Canonicalize enumeration order: `rg --files` (parallel walk) and readdir can return files in a
  // nondeterministic order, which leaks into node-array order AND cluster3's domain-assignment
  // tie-breaks — making the pipeline non-reproducible. Sorting pins a stable order without changing
  // the file set. (Surfaced + verified by the determinism study, H1.)
  return files.filter((f) => SRC.test(f) && !SKIP.test(f)).sort();
}

const rel = (f) => relative(root, f).replace(/\\/g, '/');

// ---- package boundaries (workspace scoping) -------------------------------------------------
// The nearest manifest dir above a file ('' = target root). Bare-name call resolution never crosses
// a package boundary: in a monorepo, cross-package calls go through imports (which resolve
// precisely); a cross-package NAME COLLISION is exactly how `create-vite` template files ended up
// "calling" vite's normalizePath. Single-package repos (or trees with no manifests) all map to ''
// — behavior there is unchanged.
const MANIFESTS = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'Package.swift'];
const manifestMemo = new Map(); // dir -> boolean
const hasManifest = (dir) => {
  if (!manifestMemo.has(dir)) {
    let found = MANIFESTS.some((m) => existsSync(join(root, dir, m)));
    // C# projects name their manifest <Project>.csproj — a fixed-name check can't see it
    if (!found) { try { found = readdirSync(join(root, dir)).some((f) => f.endsWith('.csproj') || f.endsWith('.sln')); } catch { /* unreadable dir */ } }
    manifestMemo.set(dir, found);
  }
  return manifestMemo.get(dir);
};
const pkgMemo = new Map(); // file's dir -> package dir
function pkgOf(relFile) {
  const dir0 = relFile.includes('/') ? relFile.slice(0, relFile.lastIndexOf('/')) : '';
  if (pkgMemo.has(dir0)) return pkgMemo.get(dir0);
  let dir = dir0, found = '';
  while (dir) {
    if (hasManifest(dir)) { found = dir; break; }
    const i = dir.lastIndexOf('/');
    dir = i === -1 ? '' : dir.slice(0, i);
  }
  pkgMemo.set(dir0, found);
  return found;
}

// ---- per-language regex symbol scan ----
// finding 8: one mask per file per language. maskPy previously ran up to 4x per Python file
// (symbol scan, extents, import binding, edge scan) and maskJs 2x per JS-family file (extents +
// edges) — measured at 52% of a Python-corpus extract. Masking is a pure function of the text, so
// the result is cached by rel path (extraction is one-shot per process; fileSyms already retains
// every raw text, so the masked copy does not change the memory complexity class).
const maskCache = new Map(); // `${rel}\x00${kind}` -> masked text
function maskedOnce(relPath, kind, text) {
  const k = relPath + '\x00' + kind;
  let v = maskCache.get(k);
  if (v === undefined) {
    v = kind === 'py' ? maskPy(text)
      : kind === 'rb' ? maskRuby(text)
      : maskJs(text, relPath.endsWith('.php') ? { hashComment: true } : undefined); // PHP `#` comments (finding #13)
    maskCache.set(k, v);
  }
  return v;
}

// ctags accelerator: returns array of {name,line,kind} or null
const parseCtagsLines = (out, bucketByPath) => {
  const syms = bucketByPath ? null : [];
  for (const ln of out.split(/\r?\n/)) {
    if (!ln.trim()) continue;
    try {
      const j = JSON.parse(ln);
      if (j._type !== 'tag' || !j.name) continue;
      const s = { name: j.name, line: j.line || 1, kind: j.kind || 'symbol', exports: false };
      if (bucketByPath) { const arr = bucketByPath.get(j.path) || []; arr.push(s); bucketByPath.set(j.path, arr); }
      else syms.push(s);
    } catch { /* skip */ }
  }
  return syms;
};
// finding 12: on a COLD run, ONE ctags process serves every file (`-L -`, list on stdin) instead
// of one execFileSync per file — the spawn floor alone measured ≥0.9s per 600 files with a no-op
// shim, ~10x more with real ctags option parsing; minutes of pure process churn at repo scale.
// Warm runs keep the per-file spawn: misses are few there, and one small spawn beats re-tagging
// the whole repo. A batch failure degrades to the per-file path, which degrades to the regex
// scanner — the same graceful ladder as before, per file.
let ctagsBatch; // undefined = not run, null = failed, Map(path -> syms)
function ctagsBatchOnce() {
  if (ctagsBatch !== undefined) return ctagsBatch;
  try {
    const out = execFileSync('ctags', ['--output-format=json', '--fields=+n-P', '-f', '-', '-L', '-'],
      { encoding: 'utf8', maxBuffer: 1 << 28, input: files.join('\n') });
    ctagsBatch = new Map();
    parseCtagsLines(out, ctagsBatch);
  } catch { ctagsBatch = null; }
  return ctagsBatch;
}
function ctagsSymbols(file) {
  if (oldCache == null) { // cold: the whole-run batch
    const batch = ctagsBatchOnce();
    if (batch != null) { const syms = batch.get(file) || []; return syms.length ? syms : null; }
  }
  const out = tryExec('ctags', ['--output-format=json', '--fields=+n-P', '-f', '-', file]);
  if (out == null) return null;
  const syms = parseCtagsLines(out, null);
  return syms.length ? syms : null;
}

const useCtags = opts.ctags && toolExists('ctags');
const files = listFiles();

// #1 (IMPROVEMENTS.md): an empty scan must not masquerade as a successful map. If the target has
// no supported source at all, say what was looked for and where, and stop — a green run over
// nothing is the kind of silent lie the rest of the pipeline is engineered against.
// `--allow-empty` keeps intentionally-sparse targets (CI skeletons, new repos) workable.
const SUPPORTED_EXTS = SRC.source.match(/\(([^)]+)\)/)[1].split('|').map((e) => `.${e}`);
if (files.length === 0 && !opts.allowEmpty) {
  // ACTIVATION A6: the two real escapes lead — wrong directory (most common) and non-native
  // language (the agent fallback exists precisely for this). --allow-empty is the niche one.
  throw new ExtractError(1, `[extract] no supported source files under ${root}\n` +
    `[extract]   looked for: ${SUPPORTED_EXTS.join(' ')} (node_modules, dist, vendor and friends are skipped)\n` +
    '[extract]   wrong directory? Point at the code root. Non-native language? In Claude Code, the\n' +
    '[extract]   /codeweb command falls back to agent-based mapping — no extractor needed.\n' +
    '[extract]   (Intentionally sparse target? --allow-empty writes an empty map.)');
}

// Tree-sitter tier — DEFAULT-ON since v9 (it was opt-in): dynamic-dispatch call edges (this.m(),
// typed-receiver x.m()) are the regex tier's one recall gap, measured directly in the oracle A/B
// (6/30 under-recalled symbols, all dispatch/re-export). web-tree-sitter is an optionalDependency —
// when it or the vendored grammar is unavailable, loadTsEngine() returns null and every file falls
// back to the regex scanner (CI without npm install keeps working; meta.engine records which tier
// ran, and the scan cache is namespaced per engine, so reproducibility holds per install state).
// `--engine regex` / CODEWEB_ENGINE=regex force the old behavior.
// Spec A (docs/specs/perf-lazy-ast.md): PROBE availability up front (file existence + module
// resolution — cheap), LOAD the WASM engines lazily at the first file that actually needs a
// parse. A warm cached run — or any run whose AST products all come from the cache — never pays
// the ~1.4s runtime+grammar init. Everything decided at startup (cache namespace, meta stamp,
// banner engine name) derives from the probe, so fragments stay byte-identical either way.
let astProbe = { ts: false, java: false, csharp: false, tsVersion: null };
if (opts.engine !== 'regex') {
  astProbe = probeAst();
  if (!astProbe.ts && (opts.engine === 'tree-sitter' || opts.engine === 'ts')) {
    console.error('[extract] --engine tree-sitter requested but web-tree-sitter/grammar unavailable; falling back to regex F4');
  }
}
// Poison guard: if a probe said "available" but the real load later fails, complexity/dispatch
// fell back to regex mid-run — a `+ts`-namespaced cache must never memoize that state.
let astLoadFailed = false;
let astEngineLoadedThisRun = false;    // per-run: an engine actually initialized this run (banner: loaded vs idle)
const _failLogged = new Set();          // per-run: engine keys whose load-failure was already logged
async function tsEngineGet() {
  if (!astProbe.ts) return null;
  if (_tsEnginePromise === undefined) _tsEnginePromise = loadTsEngine().then((e) => e || null, () => null); // single-flight, process-wide
  const eng = await _tsEnginePromise;
  if (eng) astEngineLoadedThisRun = true;
  else { astLoadFailed = true; if (!_failLogged.has('ts')) { _failLogged.add('ts'); console.error('[extract] AST probe passed but the ts engine failed to load — scan cache disabled for this run'); } }
  return eng;
}
// Java/C# dispatch tier (docs/specs/java-cs-tree-sitter.md): regex keeps owning their NODES;
// the AST contributes the dispatch edges regex precision-gates away. Loaded lazily on the first
// file of each language; unavailable -> byte-identical regex output (the standing contract).
async function langEngineFor(langKey) {
  if (opts.engine === 'regex' || !astProbe[langKey]) return null;
  if (_langEnginePromises[langKey] === undefined) _langEnginePromises[langKey] = loadLangEngine(langKey).then((e) => e || null, () => null); // single-flight, process-wide
  const eng = await _langEnginePromises[langKey];
  if (eng) astEngineLoadedThisRun = true;
  else { astLoadFailed = true; if (!_failLogged.has(langKey)) { _failLogged.add(langKey); console.error(`[extract] AST probe passed but the ${langKey} engine failed to load — scan cache disabled for this run`); } }
  return eng;
}

// F0: load the scan cache (keyed by content hash + engine mode + scanner version). A re-run reuses
// cached symbol-discovery for byte-identical files and re-scans only changed ones — edge derivation
// is still GLOBAL (see below), so the fragment is identical with or without the cache. tree-sitter is
// its own engine namespace (`+ts`) so class-qualified syms can't be served to a regex run, or vice versa.
const engineMode = (useCtags ? 'ctags' : 'regex') + (opts.engine !== 'regex' && astProbe.ts ? '+ts' : '');
// finding 10 signatures. rulesSig: role overrides are baked into cached nodes, so a rules change
// invalidates the stamp tier wholesale. fileSig: products that resolve against the file SET
// (re-export targets, import bindings) are only reusable while the list is unchanged.
let rulesSig = 'none';
try { rulesSig = sha1(readFileSync(join(root, 'codeweb.rules.json'), 'utf8')); } catch { /* absent */ }
const fileSig = sha1(files.map(rel).sort().join('\n'));
let oldCache = null;
if (opts.cache) { try { const c = JSON.parse(readFileSync(opts.cache, 'utf8')); if (c && c.version === SCANNER_VERSION && c.engine === engineMode) oldCache = c; } catch { /* corrupt/absent -> cold */ } }
const newCache = opts.cache ? { version: SCANNER_VERSION, engine: engineMode, rulesSig, fileSig, files: {} } : null;
// finding #19 (T-19.1): per-entry edge interning — edges were 46 % of cache bytes as verbose
// objects. Stored form: `ids` (distinct endpoint ids, first-use order) + `edges` as
// [fromIdx, toIdx, kindIdx] triples, kindIdx into the CLOSED kind set the derive emits (weight is
// always 1). Encoded once at cache-write time from the in-memory object edges; replay decodes
// FRESH objects per run (cached state must never alias the live fragment).
const EDGE_KINDS = ['call', 'ref', 'inherit', 'test'];
const encodeEntryEdges = (edgeObjs) => {
  const ids = []; const idIdx = new Map();
  const ix = (v) => { let k = idIdx.get(v); if (k === undefined) { k = ids.length; ids.push(v); idIdx.set(v, k); } return k; };
  return { ids, edges: edgeObjs.map((e) => [ix(e.from), ix(e.to), EDGE_KINDS.indexOf(e.kind)]) };
};
const decodeEntryEdges = (entry) => entry.edges.map(([f, t, k]) => ({ from: entry.ids[f], to: entry.ids[t], kind: EDGE_KINDS[k], weight: 1 }));
// finding 10: the STAMP TIER. A file whose mtime+size match its cache entry reuses every cached
// per-file product (nodes, ranges, dynamic flag, re-export table, bindings, edges) without being
// READ — warm extract drops from O(repo bytes) to O(changed bytes + one stat sweep). It trusts
// the same stamps checkStaleness trusts; CODEWEB_VERIFY_FRESHNESS=1 or --full forces the
// read+hash path, and a stamp mismatch (or missing product) falls back to it per file.
const stampTier = !!(oldCache && !opts.full && process.env.CODEWEB_VERIFY_FRESHNESS !== '1' && oldCache.rulesSig === rulesSig);
// finding 18: skip the cache write-back when NOTHING changed — a no-change hook/refresh run
// carried every entry verbatim, then re-stringified and re-wrote the multi-MB cache anyway.
// Dirty when any file took the read path, any per-file product was (re)computed rather than
// replayed, or any signature moved.
let cacheDirty = !oldCache;
let scanCount = 0;
const scanFile = (f, text) => { scanCount++; return (useCtags && ctagsSymbols(f)) || scanSymbols(f, text, (kind) => maskedOnce(rel(f), kind, text)); };

// ---- build nodes per file, with line ranges ----
const nodes = [];
const fileSyms = new Map(); // file -> {text, ranges:[{id,name,start,end,kind}]}
const dispatchByFile = new Map(); // file -> [{from,to}] dispatch edges (tree-sitter engine only)
const typedLangsSeen = new Set(); // 'java'|'csharp' actually processed by the AST tier this run (banner)
const typedIntentsByFile = new Map(); // rel -> [{from, recvType, method}] Java/C# typed-receiver calls, resolved globally after all nodes exist
// v7 STALENESS STAMPS: per-file size+mtime recorded in meta.sources so query tools can cheaply
// detect that the graph no longer matches disk ("aware" — an agent must know its map is stale).
const sources = {};
// v10 CONFIDENCE CALIBRATION: files using dynamic dispatch (computed member calls, getattr,
// non-literal require, event emitters) hide call edges no static map can see. Record WHERE, so
// answer-time tools can say "0 callers, but this repo routes calls dynamically in N file(s) —
// absence of callers is weaker evidence" instead of sounding equally sure everywhere.
const dynamicFiles = [];
for (const f of files) {
  const r = rel(f);
  const isPy = r.endsWith('.py');
  const isJsTs = /\.(jsx?|mjs|cjs|tsx?|mts|cts)$/.test(r); // finding #11: .mts/.cts are TS files
  const isBraceLang = isJsTs || /\.(java|cs|php|kt|kts|swift)$/.test(r); // maskJs handles //, /* */ and "…" for all of them
  const isIndentLang = isPy || r.endsWith('.rb'); // extents by dedent (Python) / end-at-indent (Ruby)
  const langKey = r.endsWith('.java') ? 'java' : r.endsWith('.cs') ? 'csharp'
    : r.endsWith('.py') ? 'python' : r.endsWith('.go') ? 'go' : r.endsWith('.rs') ? 'rust'
    : r.endsWith('.rb') ? 'ruby' : r.endsWith('.php') ? 'php' : null; // #14: Ruby/PHP join the dispatch tier
  // Does the AST tier owe this file products (methods/dispatch/complexity)? Drives cache-hit
  // validity — a hit without them must re-scan — and the lazy engine load below (Spec A).
  const needsAst = opts.engine !== 'regex' && ((isJsTs && astProbe.ts) || (langKey && astProbe[langKey]));

  // ---- finding 10: stamp tier — one stat, zero reads for an unchanged file ----
  const oldHit = stampTier ? oldCache.files[r] : null;
  if (oldHit && oldHit.stamp && oldHit.hash && oldHit.nodes && oldHit.ranges // #19: `syms` dropped from the product set
      && (!needsAst || (oldHit.ast && (!isJsTs || oldHit.cx)))) {
    let stq = null; try { stq = statSync(f); } catch { stq = null; }
    if (stq && stq.size === oldHit.stamp.s && Math.round(stq.mtimeMs) === oldHit.stamp.m) {
      sources[r] = { s: oldHit.stamp.s, m: oldHit.stamp.m, h: oldHit.hash };
      if (oldHit.dyn) dynamicFiles.push(r);
      for (const n of oldHit.nodes) nodes.push(n); // this-run-private objects (the cache is JSON.parse'd fresh per run)
      fileSyms.set(f, { text: null, ranges: oldHit.ranges }); // text pulled lazily IF a landscape change needs it
      if (needsAst && isJsTs) {
        const tsr = oldHit.ast.tsr;
        if (tsr && tsr.dispatch && tsr.dispatch.length) dispatchByFile.set(f, tsr.dispatch);
      }
      if (needsAst && langKey) {
        typedLangsSeen.add(langKey);
        const d = oldHit.ast.d;
        if (d) {
          if (d.thisCalls.length) dispatchByFile.set(f, (dispatchByFile.get(f) || []).concat(d.thisCalls));
          if (d.typedIntents.length) typedIntentsByFile.set(r, d.typedIntents);
        }
      }
      if (newCache) newCache.files[r] = oldHit; // carry every product (rex/bind/def included) forward
      continue;
    }
  }

  // finding 4: stat BEFORE read and re-stat after, re-reading on mismatch — stamping from a single
  // post-read stat let a file modified between read and stat carry a fresh stamp over stale bytes
  // (a permanently false-fresh graph with no external tooling involved). If the file won't hold
  // still after 3 attempts, stamp it impossible (s:-1) so checkStaleness always flags it — the
  // failure mode is fail-STALE, never fail-fresh.
  let text = null, st = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let pre; try { pre = statSync(f); } catch { pre = null; }
    try { text = readFileSync(f, 'utf8'); } catch { text = null; }
    if (text == null) break;
    let post; try { post = statSync(f); } catch { post = null; }
    if (pre && post && pre.size === post.size && pre.mtimeMs === post.mtimeMs) { st = post; break; }
    st = null; // changed while reading — retry
  }
  if (text == null) continue;
  cacheDirty = true; // this file took the read path — the cache entry is (re)built
  const contentHash = sha1(text); // stamped into meta.sources (verify tier) and keys the scan cache
  sources[r] = st
    ? { s: st.size, m: Math.round(st.mtimeMs), h: contentHash }
    : { s: -1, m: 0, h: contentHash }; // never-fresh stamp for a file that kept changing
  const isDyn = DYNAMIC_RE.test(text);
  if (isDyn) dynamicFiles.push(r);
  let syms;
  let astHit = null; // the cache entry serving this file's AST products (fully-valid hit only)
  if (opts.cache) {
    const h = contentHash;
    const hit = oldCache && oldCache.files[r];
    const hitOk = hit && hit.hash === h && (!needsAst || (hit.ast && (!isJsTs || hit.cx)));
    // finding #19 (T-19.1): `syms` are no longer stored (symbols sat in the cache 3x as
    // syms+nodes+ranges). A content-hash hit therefore replays the FULL stamp-tier product set —
    // nodes/ranges/dyn/ast dispatch/typed intents, entry carried forward wholesale — with the
    // text already read and the stamp refreshed. Same validity gate as the stamp tier: rulesSig
    // unchanged (role verdicts are baked into cached nodes) plus the ast/cx conjuncts above;
    // anything less falls through to a fresh scanFile (ast products, which are role-free, still
    // reuse via astHit when content-valid).
    if (hitOk && hit.nodes && hit.ranges && oldCache.rulesSig === rulesSig) {
      for (const nd of hit.nodes) nodes.push(nd); // this-run-private objects (cache JSON.parse'd fresh per run)
      fileSyms.set(f, { text, ranges: hit.ranges });
      if (needsAst && isJsTs) {
        const tsr = hit.ast.tsr;
        if (tsr && tsr.dispatch && tsr.dispatch.length) dispatchByFile.set(f, tsr.dispatch);
      }
      if (needsAst && langKey) {
        typedLangsSeen.add(langKey);
        const d = hit.ast.d;
        if (d) {
          if (d.thisCalls.length) dispatchByFile.set(f, (dispatchByFile.get(f) || []).concat(d.thisCalls));
          if (d.typedIntents.length) typedIntentsByFile.set(r, d.typedIntents);
        }
      }
      newCache.files[r] = hit; // carry every product (rex/bind/def/edges included) forward
      hit.stamp = st ? { s: st.size, m: Math.round(st.mtimeMs) } : null; // refreshed stamp
      hit.dyn = isDyn ? 1 : 0; // identical by construction (same text)
      continue;
    }
    if (hitOk) astHit = hit;
    syms = scanFile(f, text); // cache miss -> re-scan
    newCache.files[r] = { hash: h };                                // prune deleted files (only current)
    if (astHit) { newCache.files[r].ast = astHit.ast; newCache.files[r].cx = astHit.cx; }
  } else {
    syms = scanFile(f, text);
  }
  const seen = new Set();
  syms = syms.filter((s) => { const k = s.name + ':' + s.line; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line);
  const lines = text.split(/\r?\n/);
  const total = lines.length;
  // Body extents are measured on MASKED lines: stripSC alone is line-local, so a multi-line template
  // literal (or block comment) containing braces desynced the brace counter and bodies swallowed
  // whole neighboring functions (a 5-line helper recorded as 550 loc on vite — poisoning
  // context-pack size, complexity, and body-confirmed duplication). maskJs/maskPy carry string/
  // comment state ACROSS lines; ${} interpolations stay live so real code still counts.
  const scanLines = (isPy ? maskedOnce(r, 'py', text) : r.endsWith('.rb') ? maskedOnce(r, 'rb', text) : isBraceLang ? maskedOnce(r, 'js', text) : text).split(/\r?\n/);
  const fileRole = roleFor(r);
  // When the tree-sitter engine is active it OWNS JS/TS method discovery (class-qualified ids) and the
  // dispatch edges; the regex scanner still owns classes, functions and const-arrow functions (which
  // the parse-tree walk doesn't cover). extractJsTs returns null on any parse failure -> keep the regex
  // methods (graceful per-file fallback). Build the qualified ids in ONE parser so dispatch from/to
  // always match an emitted node — never a second line-containment guess that could silently disagree.
  let tsResult = null;
  let fileCx = null;    // hit: {nodeId -> exact cx} lookup; miss: collector recorded into the cache entry
  let engForFile = null;
  if (isJsTs && needsAst) {
    if (astHit) {
      tsResult = astHit.ast.tsr; // includes the null-on-parse-failure state, memoized deterministically
      fileCx = astHit.cx;
    } else {
      engForFile = await tsEngineGet(); // FIRST real need -> the one-time WASM init happens here
      if (engForFile) {
        tsResult = engForFile.extractJsTs(text, r);
        fileCx = {};
        if (newCache) { newCache.files[r].ast = { tsr: tsResult }; newCache.files[r].cx = fileCx; }
      }
    }
    // the parse tree owns method_definition nodes; class-FIELD arrows (`handleClick = () => {}`)
    // are only discovered by the regex scan (field: true), so they must survive the handoff.
    if (tsResult) syms = syms.filter((s) => s.kind !== 'method' || s.field);
  }
  const fileNodesStart = nodes.length; // finding 10: this file's node slice, cached for stamp-tier reuse
  const ranges = [];
  const fileIds = new Set(); // per-file id uniqueness — duplicate ids corrupt byName/edges/diff keys
  // finding #21 (T-21.2): live open-class stack replaces the per-method scan over ranges-so-far —
  // syms is line-sorted (classes precede their methods), so pushes arrive start-ascending and each
  // method's owner is an amortized-O(1) query with the scan's exact semantics (strict
  // `start > rg.start`: a class starting on the method's own line never owns it; property-pinned).
  const openClasses = createOwnerStack();
  syms.forEach((s) => {
    const start = s.line;
    // real body extent (brace match / dedent), NOT next-symbol-line — so the last symbol can't
    // run to EOF and absorb the trailing top-level code (the fabricated-edge bug).
    const end = Math.min(bodyEnd(scanLines, start - 1, isIndentLang) + 1, total);
    const loc = Math.min(end - start + 1, 2000);
    // Owner-qualified id (`file:Type.method`, matching the tree-sitter tier's scheme). Rust/Go owners
    // come from the scan (impl/receiver); Python + JS/TS methods resolve to the ENCLOSING class range
    // (classes precede their methods in the line-sorted ranges). Same-file same-name methods across
    // classes/impls/receivers were previously ONE colliding id.
    let owner = s.owner;
    if (!owner && s.kind === 'method') {
      const best = openClasses.ownerOf(start);
      if (best) owner = best.name;
    }
    if (s.field && !owner) return; // arrow-field candidate with no enclosing class -> not a method
    let id = r + ':' + (owner ? owner + '.' + s.name : s.name);
    if (fileIds.has(id)) id += '@' + start; // last-resort disambiguator (e.g. TS overload stubs)
    fileIds.add(id);
    const range = { id, name: s.name, start, end, kind: s.kind };
    ranges.push(range);
    if (s.kind === 'class') openClasses.push(range);
    const node = { id, label: s.name, kind: s.kind, file: r, line: start, loc, exports: s.exports, domain: '', summary: '', role: fileRole };
    if (s.kind === 'function' || s.kind === 'method') {
      node.signature = parseSignature(lines[start - 1] || '', s.name, isPy); // F3: contract for callers
      // F4: approximate cyclomatic complexity + max nesting from the SAME body extent (lines [start, end]).
      // Only function/method nodes carry these (a class/module has no single control-flow body).
      const body = lines.slice(start - 1, start - 1 + loc).join('\n');
      const lang = isPy ? 'py' : 'js';
      // Exact McCabe via tree-sitter for JS/TS when the tier is active (TS grammar is a JS superset
      // for control-flow counting); otherwise the regex F4 approximation. maxDepth stays regex F4 —
      // exact nesting is a later increment. Rust/Go/Python always use regex (no TS grammar match).
      // Exact values ride the scan cache (Spec A): a hit looks them up; a miss computes + records.
      let cx = null;
      if (isJsTs && fileCx) {
        if (astHit) cx = Object.prototype.hasOwnProperty.call(fileCx, id) ? fileCx[id] : null;
        else if (engForFile) {
          // finding 7: exact complexity = 1 + decision nodes starting within the symbol's extent
          // rows, summed from the whole-file parse's per-row tally — the identical decision set
          // the old per-body slice re-parse counted, without a re-parse per symbol. The re-parse
          // survives only as the whole-file-parse-failed fallback.
          const dr = tsResult && tsResult.decisionRows;
          if (dr) {
            let d = 0;
            for (let row = start, stop = start + loc - 1; row <= stop; row++) d += dr[row] || 0;
            cx = fileCx[id] = 1 + d;
          } else cx = fileCx[id] = engForFile.cyclomaticExact(body);
        }
      }
      node.complexity = cx != null ? cx : cyclomatic(body, lang);
      // Spec H: Type-3 statement fingerprints ride the same parse (>=6 statements only).
      const t3 = tsResult && tsResult.t3ByLine && tsResult.t3ByLine[start];
      if (t3) node.t3 = t3;
      node.maxDepth = nestingDepth(body, lang);
    }
    nodes.push(node);
  });
  // Tree-sitter method nodes: class-qualified id, BARE label (so byName / codemod's ambiguity guard /
  // overlap clustering keep keying on the same bare name), exact complexity from the parse tree;
  // signature + maxDepth reuse the regex F3/F4 helpers on the method's source slice (exact nesting is a
  // later increment). Added to `ranges` so deriveFileEdges attributes a call FROM a method to its
  // qualified id — the same id the dispatch edge uses for `from` (enclosing() prefers the method over
  // its containing class by largest start, so the qualified method id wins).
  if (tsResult) {
    for (const m of tsResult.methods) {
      const start = m.line;
      const end = Math.min(m.endLine, total);
      const loc = Math.min(end - start + 1, 2000);
      const body = lines.slice(start - 1, end).join('\n');
      let mid = m.id;
      // finding #12: a cross-tier id collision suffixes '@' + 1-based start line (the regex tier's
      // scheme at the fileIds check above) instead of silently dropping the node — the drop was how
      // a setter vanished whenever the regex tier had already claimed the getter's id.
      if (fileIds.has(mid)) mid += '@' + start;
      if (fileIds.has(mid)) continue; // still colliding (same line): ids must stay unique
      fileIds.add(mid);
      ranges.push({ id: mid, name: m.label, start, end, kind: 'method' });
      nodes.push({
        id: mid, label: m.label, kind: 'method', file: r, line: start, loc,
        exports: false, domain: '', summary: '', role: fileRole,
        signature: parseSignature(lines[start - 1] || '', m.label, false),
        complexity: m.complexity,
        maxDepth: nestingDepth(body, 'js'),
        ...(tsResult.t3ByLine && tsResult.t3ByLine[start] ? { t3: tsResult.t3ByLine[start] } : {}),
      });
    }
    if (tsResult.dispatch.length) dispatchByFile.set(f, tsResult.dispatch);
  }
  // Java/C#/Python/Go/Rust: AST dispatch tier (edges only — regex owns the nodes). this/self/
  // receiver calls resolve in-file now; typed-receiver intents wait for the global pass (the
  // receiver's type may live anywhere). Products ride the scan cache exactly like the JS/TS
  // tier's (Spec A); Spec F adds the three dedicated walkers.
  if (langKey && needsAst) {
    typedLangsSeen.add(langKey);
    let d = null;
    if (astHit) d = astHit.ast.d;
    else {
      const eng = await langEngineFor(langKey);
      d = (eng && eng.extractDispatch(text, r)) || null;
      if (eng && newCache) newCache.files[r].ast = { d };
    }
    if (d) {
      if (d.thisCalls.length) dispatchByFile.set(f, (dispatchByFile.get(f) || []).concat(d.thisCalls));
      if (d.typedIntents.length) typedIntentsByFile.set(r, d.typedIntents);
    }
  }
  fileSyms.set(f, { text, ranges });
  // finding 10: record the stamp-tier products for the next run. `nodes` are stored as built
  // (run-global fields like `pub` are stripped at cache-write time); rex/bind/def attach in their
  // own passes below.
  if (newCache) {
    const entry = newCache.files[r];
    entry.stamp = st ? { s: st.size, m: Math.round(st.mtimeMs) } : null;
    entry.dyn = isDyn ? 1 : 0;
    entry.nodes = nodes.slice(fileNodesStart);
    entry.ranges = ranges;
  }
}

// finding 10: stamp-tier records carry no text — consumers pull it lazily, so an unchanged file
// is read only when a landscape change (symbol set / file set) actually invalidates its cached
// downstream products. On the no-change warm path nothing pulls, and the run does zero reads.
const textOf = (fAbs, rec) => {
  if (rec.text == null) { try { rec.text = readFileSync(fAbs, 'utf8'); } catch { rec.text = ''; } }
  return rec.text;
};

// ---- index symbol names -> node ids ----
const byName = new Map();
for (const n of nodes) { if (!byName.has(n.label)) byName.set(n.label, []); byName.get(n.label).push(n.id); }

// ---- resolve imports: aliases (for accurate cross-file calls) + import edges ----
const relSet = new Set(files.map(rel));
const absByRel = new Map(files.map((f2) => [rel(f2), f2])); // Spec Q2: re-export resolution reads target modules
const nodeIdSet = new Set(nodes.map((n) => n.id));
const kindById = new Map(nodes.map((n) => [n.id, n.kind])); // for class-usage ref edges
const anchorByFile = new Map(); // rel -> {id, loc} most-substantial symbol of the file
for (const n of nodes) { const cur = anchorByFile.get(n.file); if (!cur || (n.loc || 0) > cur.loc) anchorByFile.set(n.file, { id: n.id, loc: n.loc || 0 }); }
const anchorId = (r) => { const a = anchorByFile.get(r); return a ? a.id : null; };
// finding 25: cross-file name binding — relative/Python module resolution, re-export chains,
// member tables, and import binding — is lib/import-resolve.mjs's factory; the extractor
// injects its context and keeps only cache replay/record around the calls.
const resolver = createImportResolver({ rel, relSet, absByRel, fileSyms, textOf, maskedOnce, nodeIdSet, nodes });
const { resolveReExport, resolveFileMember, reExportByFile, starReExportByFile } = resolver;
const defaultExportByFile = new Map(); // rel -> node id of the single-symbol default export (if any)
for (const [fabs, recd] of fileSyms) {
  const rr = rel(fabs);
  const entry = newCache && newCache.files[rr];
  let ds;
  // finding 10: the default-export id depends only on the file's own text+ranges, so a stamp-hit
  // record serves the cached value; the nodeIdSet guard below re-applies fresh every run.
  if (recd.text == null && entry && 'def' in entry) ds = entry.def;
  else {
    ds = defaultExportOf(rr, textOf(fabs, recd), new Set(recd.ranges.map((rg) => rg.name))) ?? null;
    if (entry) { entry.def = ds; cacheDirty = true; }
  }
  if (ds && nodeIdSet.has(ds)) defaultExportByFile.set(rr, ds);
}
// finding 10: the raw re-export tables resolve specifiers against the FILE SET only, so a
// stamp-hit record's cached table is valid while the file list is unchanged (fileSig).
const rexReuse = stampTier && oldCache.fileSig === fileSig;
for (const f of files) {
  const fsRec = fileSyms.get(f); if (!fsRec) continue;
  const r = rel(f);
  if (!/\.(jsx?|mjs|cjs|tsx?|mts|cts)$/.test(r)) continue; // JS/TS only (finding #11: .mts/.cts included)
  const entry = newCache && newCache.files[r];
  if (rexReuse && fsRec.text == null && entry && entry.rex) {
    resolver.loadJsReExports(r, entry.rex.map, entry.rex.stars);
    continue;
  }
  const { map, stars } = resolver.scanJsReExports(f, r, textOf(f, fsRec));
  if (entry) { entry.rex = { map: [...map].map(([exp2, v]) => [exp2, v.target, v.orig]), stars }; cacheDirty = true; }
}
// Round 2, finding #17 — re-export/from-import-table signature (`rexSig`). Cached per-file edges
// and binds EMBED RESOLVED IDS reached through re-export chains (`export { x } from`, Python
// `from .m import x`), and a chain retarget — flipping a barrel's `from './util'` to
// `'./util2'` — changes ZERO symbols: symbolSig/bindSig could not see it, and the extended IE
// generator's `rex` op reproduced today's engine replaying the consumer's STALE call edge (the
// pre-#17 wholesale gate had the same blind spot the delta spec's trigger (e) names). rexSig is
// sha1 over every file's canonical table — JS: sorted named re-exports + stars in source order
// (order is resolution precedence); Py: the stored `pyrex` from-import triples — comparable only
// while the file SET is unchanged (resolution is file-set-relative, and a fileSig change already
// re-derives binds wholesale). A py file not read this run serves its cached `pyrex`; if any is
// missing (cache built before this field), rexSig is null -> never equal -> one conservative
// wholesale re-derive populates it (the write-time sweep below records it for every file read).
for (const f of files) {
  const fsRec = fileSyms.get(f); if (!fsRec) continue;
  const r = rel(f);
  if (!r.endsWith('.py')) continue;
  const entry = newCache && newCache.files[r];
  if (!entry || entry.pyrex !== undefined || fsRec.text == null) continue; // carried or unread
  const table = resolver.pyReExportTableOf(r);
  entry.pyrex = table ? [...table].map(([local, v]) => [local, v.srcMod, v.orig]) : null;
}
const rexSig = (() => {
  if (!newCache) return null;
  const parts = [];
  for (const f of files) {
    const r = rel(f);
    if (/\.(jsx?|mjs|cjs|tsx?|mts|cts)$/.test(r)) {
      const map = reExportByFile.get(r);
      const stars = starReExportByFile.get(r);
      if (!map && !stars) continue;
      const rows = map ? [...map].map(([exp2, v]) => [exp2, v.target, v.orig]).sort((a, b) => (a[0] < b[0] ? -1 : 1)) : [];
      parts.push(r + '\x01' + JSON.stringify(rows) + '\x01' + JSON.stringify(stars || []));
    } else if (r.endsWith('.py')) {
      const entry = newCache.files[r];
      if (!entry) continue;
      if (entry.pyrex === undefined) return null; // unknowable -> conservative re-derive
      if (entry.pyrex && entry.pyrex.length) parts.push(r + '\x01' + JSON.stringify(entry.pyrex));
    }
  }
  return sha1(parts.join('\n'));
})();

// v9: a BARREL IS A DEPENDENT. `export { X } from './impl'` means the barrel file must change when
// X is renamed — the compiler counts that export specifier as a reference, and so must we (it was a
// measured recall gap: index.ts barrels missing from every dependents answer). Named re-exports edge
// the barrel's <module> to the resolved SYMBOL; `export *` edges it to the target's <module>
// (file-level dependency — the names aren't enumerable without reading the target's exports).
const reExportEdges = []; // [fromModuleId, toId] — appended with the import edges below
for (const [r, map] of reExportByFile) {
  for (const { target, orig } of map.values()) {
    const resolved = resolveReExport(target, orig);
    if (resolved) reExportEdges.push([r + ':<module>', resolved]);
  }
}
for (const [r, stars] of starReExportByFile) {
  for (const target of stars) reExportEdges.push([r + ':<module>', target + ':<module>']);
}
// v10 PUBLIC API: symbols reachable from a package entrypoint (package.json main/module/browser/
// bin/exports, followed through re-export chains) have callers the graph CANNOT see — everyone who
// installs the package. Stamp them `pub: true` so answers stop implying "0 in-repo callers" means
// "safe to rename/delete". JS/TS manifests only (other ecosystems: conventional entries, later).
{
  // finding #40 (T-40.2): the walk is lib/edge-derive.markPublicApi (pure, no fs — the lib gets
  // readPkg + the statted `sources` membership); the orchestrator owns the single `pub` mutation
  // (order-safe — the walk never reads pub, so a returned ids-to-stamp Set is equivalent).
  const pubIds = markPublicApi({
    nodes, relFiles: files.map(rel), pkgOf, sources, reExportEdges,
    readPkg: (dir) => { try { return JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')); } catch { return null; } },
  });
  if (pubIds.size) { const byId = new Map(nodes.map((n) => [n.id, n])); for (const id of pubIds) { const n = byId.get(id); if (n) n.pub = true; } }
}

// F9: global symbol signature — a hash of the discovered symbol-node id set (module nodes are derived,
// so excluded). A file's edges depend ONLY on its own text + global symbol resolution (byName/alias),
// so when the symbol set is unchanged AND a file's content is unchanged, that file's edges are
// identical and may be reused. Any added/removed/renamed symbol flips the signature -> full re-derive
// (correctness over speed). This is what makes warm-incremental byte-identical to a cold full extract.
// Package boundaries participate in the signature: adding/removing a manifest changes bare-name
// resolution, so cached per-file edges must invalidate then too. (Moved above the binding loop for
// finding 10 — cached bindings gate on it.)
const pkgBoundaries = [...new Set(files.map((f) => pkgOf(rel(f))))].sort();
// Round-2 WS-D review — the closure-local magnet (#10's >=3-char guard left every 3+-char name
// exposed; the `dep` CI incident was one). A symbol whose range sits strictly inside another
// FUNCTION/METHOD body is lexically unreachable from other files in every lexically-scoped
// language here, so the cross-file bare-name fallback must never target it. Positive kinds only:
// unknown container kinds (ctags interfaces/structs/namespaces) leave members eligible — the
// conservative direction. PHP and Ruby are exempt (a PHP nested function becomes GLOBAL when the
// enclosing function runs; a Ruby nested def lands on the enclosing class) — their bare cross-file
// reach is already method-filtered at the fallback. Same-file resolution (sameFileByName) is
// untouched: WS-C's two legitimate short survivors are exactly that path.
function collectClosureLocals(r, ranges, out) {
  if (!ranges || ranges.length < 2 || /\.(php|rb)$/.test(r)) return;
  const sorted = ranges.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const stack = []; // start-ascending open ranges; lazy-pop mirrors the enclosing-index sweep
  for (const rg of sorted) {
    while (stack.length && stack[stack.length - 1].end < rg.start) stack.pop();
    if (stack.some((p) => (p.kind === 'function' || p.kind === 'method')
      && p.start <= rg.start && p.end >= rg.end && !(p.start === rg.start && p.end === rg.end))) out.add(rg.id);
    stack.push(rg);
  }
}
const closureLocalIds = new Set();
for (const [fAbs2, rec2] of fileSyms) collectClosureLocals(rel(fAbs2), rec2.ranges, closureLocalIds);
// Eligibility is part of the resolution landscape, so it ANNOTATES symbolSig ('\u0001' marker):
// a nesting flip changes no node id, and an unannotated sig would replay every consumer's stale
// verdict (fallback hit or drop) wholesale — the same blind-spot class rexSig closed for barrels.
const symbolSig = sha1(nodes.map((n) => n.id + (closureLocalIds.has(n.id) ? '\u0001' : '')).slice().sort().join('\n') + '\0' + pkgBoundaries.join('\n'));
const pkgSig = sha1(pkgBoundaries.join('\n')); // finding #17: pkg-boundary repartition alone (zero label delta) must stay a wholesale flip

const aliasByFile = new Map();   // fileAbs -> Map(localName -> symbolId in the target file) [named/default value]
const nsAliasByFile = new Map(); // fileAbs -> Map(localName -> target REL file) [namespace/default OBJECT, for member access]
const classAliasByFile = new Map(); // fileAbs -> Map(localName -> CLASS node id) [default import whose default export is a class — for instanceof/static-method ref edges]
const importEdges = [];
// finding 10: cached bindings embed RESOLVED target ids/files, so they are reusable only while
// both the symbol set and the file list stand still — the same rule the F9 edge cache lives by.
// finding #17: ... AND the re-export landscape (rexSig): a barrel/from-import retarget changes
// zero symbols but re-aims the resolved ids cached binds embed. rexStable additionally requires
// an unchanged file SET — stored py tables are file-set-relative, so cross-file-set comparison
// would compare stale-vs-stale (accepted cost: a file add/delete that changes NO symbol now
// re-derives once instead of replaying — strictly safer than the corner it closes).
const rexStable = !!(oldCache && oldCache.fileSig === fileSig && rexSig != null && oldCache.rexSig === rexSig);
const bindSig = sha1(symbolSig + '\0' + fileSig);
const bindReuse = stampTier && oldCache.bindSig === bindSig && rexStable;
if (oldCache && (oldCache.bindSig !== bindSig || oldCache.symbolSig !== symbolSig || oldCache.fileSig !== fileSig || oldCache.rexSig !== rexSig)) cacheDirty = true;

// ---- finding #17: name-delta invalidation --------------------------------------------------
// A symbolSig flip used to re-derive EVERY file's binds and edges (full re-read) — adding one
// function was 2.3x the noop floor. When the flip is a pure NAME delta, only files that could
// SEE the delta re-derive: dirty labels = labels whose sorted def-id lists differ between the
// old cache's nodes and the live nodes (both at this pre-module-node point — cached entries
// never contain module nodes, so the domains match by construction). A file's cached products
// replay only under per-file rules (below) whose union provably covers every byName consumer —
// the has() gate, the pkg-scoped unique fallback, and every ambiguity transition (0->1, 1->2,
// 2->1, 1->1' retarget) is a def-list change on that label.
// WHOLESALE-FLIP transitions (delta ineligible, full re-derive as today):
//   (a) pkgSig moved — pkgOf repartitions inPkg with zero label delta;
//   (b) fileSig changed — specifier + <module> landscape (add/delete);
//   (c) old cache lacks the #17 fields (cand/bindCand/bindDeps, py pyrex) — additive migration,
//       no extra version bump: one wholesale run records them;
//   (d) --full / CODEWEB_VERIFY_FRESHNESS=1;
//   (e) the re-export landscape moved (rexSig, incl. its py (srcMod,orig)-membership belt below)
//       — forwarding flips retarget OTHER files' chains with zero label delta, and Py chains are
//       also walked at EDGE time via resolveFileMember, invisible to consumers' cand/bindDeps;
//   (f) kill-switch CODEWEB_NAME_DELTA=0 — wholesale for edges AND binds (rollback lever; both
//       paths emit identical bytes, only wall-time moves).
const deltaDirty = (() => {
  if (!oldCache || opts.full || process.env.CODEWEB_VERIFY_FRESHNESS === '1') return null; // (d)
  if (process.env.CODEWEB_NAME_DELTA === '0') return null;                                 // (f)
  if (oldCache.rulesSig !== rulesSig) return null;    // role verdicts baked into cached edges (finding #10 / R5)
  if (oldCache.symbolSig === symbolSig) return null;  // today's wholesale-valid path — untouched
  if (oldCache.fileSig !== fileSig) return null;      // (b)
  if (oldCache.pkgSig !== pkgSig) return null;        // (a)
  if (!rexStable) return null;                        // (e)
  for (const [r2, e] of Object.entries(oldCache.files)) {                                  // (c)
    if (!e.nodes || !e.ranges || !e.hash || e.cand === undefined || !e.bind || e.bindCand === undefined || e.bindDeps === undefined) return null;
    if (r2.endsWith('.py') && e.pyrex === undefined) return null;
  }
  // (e) py belt: a changed .py file whose OWN def set moved can retarget an edge-time chain that
  // lands on it (pyReExportResolve's nodeIdSet.has(srcMod:orig)) — invisible to cand/bindDeps
  // even with every TABLE unchanged (rexStable). Wholesale iff any (srcMod, orig) pair named by
  // ANY stored table changed membership in srcMod's own node-id set.
  const pyPairs = []; // [srcMod, orig]
  for (const e of Object.values(oldCache.files)) {
    if (e.pyrex) for (const [, srcMod, orig] of e.pyrex) pyPairs.push([srcMod, orig]);
  }
  if (pyPairs.length) {
    for (const [srcMod, orig] of pyPairs) {
      const o = oldCache.files[srcMod], nw = newCache.files[srcMod];
      if (!o || !nw) continue;               // srcMod outside the universe -> fileSig owns it
      if (o.hash === nw.hash) continue;      // unchanged file: same defs
      const id = srcMod + ':' + orig;
      const oldHas = o.nodes.some((n) => n.id === id);
      const newHas = (nw.nodes || []).some((n) => n.id === id);
      if (oldHas !== newHas) return null;    // chain landing pad appeared/vanished -> wholesale
    }
  }
  // dirty labels: def-id-list delta per label, old vs new, bidirectional by construction.
  // WS-D review: both lists carry the closure-local eligibility marker (same '\u0001' scheme as
  // symbolSig) — a nesting flip keeps the id but moves the marker, and the label MUST dirty then
  // (the fallback's verdict on it changed while cand/bindDeps see nothing).
  const oldLocal = new Set();
  for (const [r2, e] of Object.entries(oldCache.files)) collectClosureLocals(r2, e.ranges, oldLocal);
  const oldByLabel = new Map();
  for (const e of Object.values(oldCache.files)) {
    for (const n of e.nodes) { let l = oldByLabel.get(n.label); if (!l) oldByLabel.set(n.label, l = []); l.push(n.id + (oldLocal.has(n.id) ? '\u0001' : '')); }
  }
  const dirty = new Set();
  for (const [label, ids] of byName) {
    const o = oldByLabel.get(label);
    if (!o) { dirty.add(label); continue; }
    const a = ids.map((id) => id + (closureLocalIds.has(id) ? '\u0001' : '')).sort(), b = o.sort();
    if (a.length !== b.length || a.some((v, i2) => v !== b[i2])) dirty.add(label);
  }
  for (const label of oldByLabel.keys()) if (!byName.has(label)) dirty.add(label);
  return dirty;
})();
const bindReplayed = new Set(); // rel paths whose bind was REPLAYED this run — the edge rule's third conjunct

for (const f of files) {
  const fsRec = fileSyms.get(f); if (!fsRec) continue;
  const r = rel(f), isPy = r.endsWith('.py');
  const bindEntry = newCache && newCache.files[r];
  const replayBind = (b) => {
    if (b.a.length) aliasByFile.set(f, new Map(b.a));
    if (b.ns.length) nsAliasByFile.set(f, new Map(b.ns));
    if (b.cls.length) classAliasByFile.set(f, new Map(b.cls));
    for (const pair of b.ie) importEdges.push(pair);
    bindReplayed.add(r);
  };
  if (bindReuse && fsRec.text == null && bindEntry && bindEntry.bind) { // finding 10: replay cached bindings
    replayBind(bindEntry.bind);
    continue;
  }
  // finding #17 (T-17.3): per-file bind replay under a name delta — stamp unchanged (text never
  // pulled), fileSig+pkgSig unchanged (eligibility above), bindCand ∩ dirty = ∅, and every file
  // in bindDeps content-unchanged (ns targets included: deriveFileEdges resolves members against
  // their live symbol tables). Ineligible/intersecting -> re-bind this file only (lazy textOf).
  if (deltaDirty && fsRec.text == null && bindEntry && bindEntry.bind
      && bindEntry.bindCand && !bindEntry.bindCand.some((n) => deltaDirty.has(n))
      && bindEntry.bindDeps && bindEntry.bindDeps.every((d) => {
        const o = oldCache.files[d], nw = newCache.files[d];
        return o && nw && o.hash === nw.hash;
      })) {
    replayBind(bindEntry.bind);
    continue;
  }
  const { amap, nsmap, classmap, edges: bindEdges, deps, bindCand } = resolver.bindFileImports({
    fAbs: f, r, isPy, text: textOf(f, fsRec), aId: anchorId(r), defaultExportByFile, kindById,
  });
  for (const pair of bindEdges) importEdges.push(pair);
  if (amap.size) aliasByFile.set(f, amap);
  if (nsmap.size) nsAliasByFile.set(f, nsmap);
  if (classmap.size) classAliasByFile.set(f, classmap);
  if (bindEntry) {
    bindEntry.bind = { a: [...amap], ns: [...nsmap], cls: [...classmap], ie: bindEdges };
    bindEntry.bindDeps = [...deps].sort();   // finding #17 (T-17.3)
    bindEntry.bindCand = [...bindCand].sort();
    cacheDirty = true;
  }
}

// ---- derive call edges (F9: incremental, per-file, cacheable) ------------------------------
const LEGACY_FALLBACK = !!process.env.CODEWEB_LEGACY_FALLBACK; // A/B: restore pre-fix byName[0] wiring for regression testing

// finding #40 (WS-H T-40.1): per-file edge derivation moved VERBATIM into lib/edge-derive.mjs's
// createEdgeDeriver factory. Free-vars re-derived against the CURRENT engine (not the spec-time
// table): injected ctx = byName, pkgOf, roleFor (#10 ref role-gate), resolveFileMember (resolver
// method), closureLocalIds (WS-D-review magnet fix), legacyFallback (the env read stays here);
// KEYWORDS/parseSignature/isTestFile/buildInnermostIndex are the lib's own pure-module imports.
// The edge loop below (cache replay/record) + #17 delta/dirty-label computation stay orchestration.
const { deriveFileEdges } = createEdgeDeriver({ byName, pkgOf, roleFor, resolveFileMember, closureLocalIds, legacyFallback: LEGACY_FALLBACK });

const edges = [];
let ambiguousDropped = 0, shortNameDropped = 0, edgedCount = 0;
// Every successfully-read file derives edges — NOT only files with discovered symbols. A test file
// whose only "functions" are anonymous callbacks (`test('…', () => { foo() })`) discovers zero
// symbols; excluding it dropped its module-scope call to `foo` entirely, so the imported prod symbol
// got no `test` edge (the blast-radius coveringTests signal). With empty ranges, enclosing() returns
// null and the call is correctly attributed to the file's <module> (created on demand).
const edgeFiles = files.filter((f) => fileSyms.has(f));
// Edge cache valid iff the symbol set AND the role rules are unchanged: finding #10 made edge
// derivation role-DEPENDENT (the ref role gate's verdicts are baked into cached edges), and a
// rules-file role flip changes no node id — symbolSig alone would replay stamp-era verdicts
// indefinitely. Mirrors the stamp tier's rulesSig gate ("a rules change invalidates wholesale").
// finding #17: rexStable joins the gate — a re-export retarget changes no node id either, and the
// stale-replay it caused (IE `rex` op, REX-FLIP test) was reachable pre-#17.
const reuseEdges = !opts.full && oldCache && oldCache.symbolSig === symbolSig && oldCache.rulesSig === rulesSig && rexStable;
for (const f of edgeFiles) {
  const rec = fileSyms.get(f);
  const r = rel(f);
  const cacheEntry = newCache && newCache.files[r]; // carries the content hash from discovery
  const prev = (reuseEdges || deltaDirty) && oldCache.files[r];
  // finding #17 (T-17.2): under a name delta, F's cached edges replay iff — three conjuncts, the
  // third is the hardening — (1) F's content hash is unchanged (below), (2) cand(F) ∩ dirty = ∅,
  // and (3) F's BIND replayed this run. The pair alone is unsound: `import { foo as bar }` holds
  // `bar` in cand while dirty holds `foo`, and member calls `u.merge()` never reach addEdge — both
  // ride the bind rule (bindCand + dep hashes), which precedes this loop. No-import files hold
  // vacuously (empty deps; their bind replays whenever their stamp holds).
  const deltaOk = reuseEdges
    || (deltaDirty && prev && prev.cand && !prev.cand.some((n) => deltaDirty.has(n)) && bindReplayed.has(r));
  let result;
  if (prev && cacheEntry && prev.hash === cacheEntry.hash && prev.edges && prev.ids && deltaOk) {
    result = { edges: decodeEntryEdges(prev), hasModule: !!prev.hasModule, ambiguous: prev.ambiguous || 0, short: prev.short || 0, cand: prev.cand }; // reuse (#19: decode fresh objects)
  } else {
    // finding 10: text + mask only on the derive path — an edge-cache hit never touches the file
    const text = textOf(f, rec);
    const lines = (r.endsWith('.py') ? maskedOnce(r, 'py', text) : r.endsWith('.rb') ? maskedOnce(r, 'rb', text) : /\.(jsx?|mjs|cjs|tsx?|mts|cts|java|cs|php|kt|kts|swift)$/.test(r) ? maskedOnce(r, 'js', text) : text).split(/\r?\n/); // no calls from docstrings/comments/strings
    result = deriveFileEdges(r, lines, rec.ranges, aliasByFile.get(f), nsAliasByFile.get(f), classAliasByFile.get(f));
    edgedCount++;
  }
  if (cacheEntry) { cacheEntry.edges = result.edges; cacheEntry.hasModule = result.hasModule; cacheEntry.ambiguous = result.ambiguous; cacheEntry.short = result.short; if (result.cand) cacheEntry.cand = result.cand; }
  if (result.hasModule && !nodeIdSet.has(r + ':<module>')) {
    nodes.push({ id: r + ':<module>', label: '<module>', kind: 'module', file: r, line: 1, loc: 1, exports: false, domain: '', summary: '', role: roleFor(r) });
    nodeIdSet.add(r + ':<module>');
  }
  for (const e of result.edges) edges.push(e);
  ambiguousDropped += result.ambiguous;
  shortNameDropped += result.short;
}
if (newCache) { newCache.symbolSig = symbolSig; newCache.bindSig = bindSig; newCache.pkgSig = pkgSig; if (rexSig != null) newCache.rexSig = rexSig; }

// ---- append import edges (file anchor -> imported symbol) ----
// Deduped against the call edges by (from,to): caller ids are file-local, so this set has no
// cross-file collisions and matches the original single-edgeSet behaviour exactly.
let importEdgeCount = 0;
const edgeKeys = new Set(edges.map((e) => e.from + ' ' + e.to));
// A coarse module-import edge (namespace/default/side) targets the imported file's <module> node,
// created on demand here so a symbol-less barrel still gets a node. This keeps the file-level "imports
// this module" signal (fileCycles/coupling unchanged — same file-pair) without polluting a symbol.
const ensureModuleNode = (id) => {
  if (nodeIdSet.has(id)) return;
  nodes.push({ id, label: '<module>', kind: 'module', file: idFile(id), line: 1, loc: 1, exports: false, domain: '', summary: '', role: roleFor(idFile(id)) });
  nodeIdSet.add(id);
};
for (const [a, b] of [...importEdges, ...reExportEdges]) {
  if (a.endsWith(':<module>')) ensureModuleNode(a); // a symbol-less barrel still gets its node
  if (b.endsWith(':<module>')) ensureModuleNode(b);
  if (!nodeIdSet.has(a) || !nodeIdSet.has(b) || a === b) continue;
  const key = a + ' ' + b;
  if (edgeKeys.has(key)) continue;
  edgeKeys.add(key);
  const ik = (isTestFile(idFile(a)) && !isTestFile(idFile(b))) ? 'test' : 'import';
  edges.push({ from: a, to: b, kind: ik, weight: 1 });
  if (ik === 'import') importEdgeCount++;
}

// ---- append dynamic-dispatch call edges (tree-sitter engine: this.m() + typed-receiver x.m()) ----
// The member-call edges the regex engine deliberately drops. Endpoints are guarded against the final
// node set; deduped by (from,to,kind) so a dispatch `call` can coexist with a `ref`/`import` of the
// same pair but never duplicates an identical edge. Iterate the already-sorted edgeFiles so the
// appended order is deterministic. A test-file caller reclassifies to `test`, matching call edges.
let dispatchEdgeCount = 0, dispatchDropped = 0;
const edgeTriKeys = new Set(edges.map((e) => e.from + '\t' + e.to + '\t' + e.kind));
for (const f of edgeFiles) {
  const disp = dispatchByFile.get(f);
  if (!disp) continue;
  for (const d of disp) {
    if (d.from === d.to || !nodeIdSet.has(d.from) || !nodeIdSet.has(d.to)) { dispatchDropped++; continue; }
    const kind = (isTestFile(idFile(d.from)) && !isTestFile(idFile(d.to))) ? 'test' : 'call';
    const key = d.from + '\t' + d.to + '\t' + kind;
    if (edgeTriKeys.has(key)) continue;
    edgeTriKeys.add(key);
    edges.push({ from: d.from, to: d.to, kind, weight: 1 });
    dispatchEdgeCount++;
  }
}

// Typed-receiver dispatch (Java/C#): resolve each {from, recvType, method} intent against the
// WHOLE graph — the receiver's class must resolve to exactly ONE file, and the qualified method
// must be a real node. Anything ambiguous or absent is dropped and counted, never guessed (the
// same precision contract every dispatch tier honors).
// finding #40 (T-40.2): typed-receiver resolution is lib/edge-derive.resolveTypedIntents — moving
// it here also clears #40's named shadowing smells (`rel` loop-var vs the rel() fn; `files` local
// vs the global). Tri-keys are appended to the caller-owned edgeTriKeys; edges pushed in order.
const _typed = resolveTypedIntents({ intentsByFile: typedIntentsByFile, nodeIdSet, existingTriKeys: edgeTriKeys });
for (const e of _typed.edges) edges.push(e);
const typedWired = _typed.wired, typedDropped = _typed.dropped;

// meta — the single source of truth for the target. `root` (absolute, forward-slashed) + each
// node's relative `file` path reconstruct any source file, so downstream stages (overlap/confirm
// body-reading, report header) read the target from here instead of re-hardcoding it.
const rootFwd = root.replace(/\\/g, '/').replace(/\/+$/, '');
const targetLabel = opts.target || rootFwd.split('/').slice(-2).join('/') || rootFwd;
const languages = [...new Set(files.map(langOf))].sort();
const fragment = {
  meta: {
    root: rootFwd, target: targetLabel, engine: useCtags ? 'ctags' : 'regex',
    // additive: only present when the tree-sitter tier owns complexity for this run, so the
    // default (regex) output is byte-identical to before. Pins the grammar version for determinism.
    // Stamped from the PROBE (identical string to the loaded engine's — pinned by test L4) so a
    // warm run that never initializes the engine emits the same meta as a cold one (Spec A).
    ...(opts.engine !== 'regex' && astProbe.ts && !astLoadFailed ? { complexityEngine: astProbe.tsVersion } : {}),
    languages, symbols: nodes.length,
    sources, // per-file {s: size, m: mtimeMs, h: sha1} staleness stamps (h powers the verify tier — finding 4)
    // files with dynamic-dispatch patterns — the honest asterisk on every "0 callers" answer
    ...(dynamicFiles.length ? { dynamic: { files: dynamicFiles.length, sample: dynamicFiles.slice(0, 3) } } : {}),
    // per-DIRECTORY mtime stamps: adding/deleting a file touches its directory, so NEW files (which
    // per-file stamps cannot see) still flip the staleness check.
    dirs: Object.fromEntries([...new Set(Object.keys(sources).map((r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '.')))].sort().map((d) => {
      try { return [d, Math.round(statSync(join(root, d)).mtimeMs)]; } catch { return [d, 0]; }
    })),
  },
  nodes, edges,
};
// #1: files existed but nothing was extractable — same honesty rule as the zero-file guard above.
// (A `<module>` pseudo-node only exists where module-level code does something, so config-only
// trees can land here.) Guarded before any artifact/cache write so a failed run leaves nothing.
if (nodes.length === 0 && !opts.allowEmpty) {
  throw new ExtractError(1, `[extract] 0 symbols found in ${files.length} supported file(s) under ${root} — the files parsed but defined no functions, classes, or methods.\n` +
    '[extract]   is this the right directory? Pass --allow-empty to proceed with an empty map.');
}
if (newCache && !astLoadFailed && cacheDirty) {
  try {
    // finding #17: pyrex catch-up — files read AFTER the pre-bind sweep (e.g. a wholesale edge
    // re-derive pulled their text) record their from-import table now, so a migrating cache
    // converges to a computable rexSig in one wholesale run.
    for (const [r2, e] of Object.entries(newCache.files)) {
      if (!r2.endsWith('.py') || e.pyrex !== undefined) continue;
      const fabs2 = absByRel.get(r2);
      const rec2 = fabs2 && fileSyms.get(fabs2);
      if (!rec2 || rec2.text == null) continue; // never read this run: populated on its next read
      const table = resolver.pyReExportTableOf(r2);
      e.pyrex = table ? [...table].map(([local, v]) => [local, v.srcMod, v.orig]) : null;
    }
    // finding 10: cached nodes must not carry run-GLOBAL fields — `pub` is recomputed from the
    // package-entry walk every run, and a stale cached true could never be cleared. Copies only
    // (the live fragment keeps its pub flags).
    for (const e of Object.values(newCache.files)) {
      if (e.nodes) e.nodes = e.nodes.map((n) => { if (n.pub === undefined) return n; const { pub, ...rest } = n; return rest; });
      // finding #19 (T-19.1): edges are interned at write time — every entry holds decoded object
      // edges in memory (the edge loop (re)assigns them each run), encoded here in one pass.
      if (e.edges) { const enc = encodeEntryEdges(e.edges); e.ids = enc.ids; e.edges = enc.edges; }
    }
    atomicWrite(resolve(opts.cache), JSON.stringify(newCache));
  } catch { /* cache is best-effort */ }
}
// Dispatch note + banner report from the PROBE (what tier owns the run) plus the live load state:
// `ast: loaded` (initialized this run) / `ast: idle` (available, nothing needed a parse — the warm
// path Spec A exists for) / `ast: off` (regex opt-out, unavailable, or load failure).
const astAvailable = opts.engine !== 'regex' && Object.entries(astProbe).some(([k, v]) => k !== 'tsVersion' && v === true);
const typedLangs = ['java', 'csharp', 'python', 'go', 'rust', 'php'].filter((k) => typedLangsSeen.has(k)); // ruby has no static types — self/implicit dispatch only
const dispatchNote = astAvailable
  ? `; wired ${dispatchEdgeCount} dispatch edge(s)${dispatchDropped ? `, dropped ${dispatchDropped} (missing endpoint)` : ''}` +
    (typedLangs.length ? `; typed-dispatch (${typedLangs.join('+')}) ${typedWired} wired${typedDropped ? `, ${typedDropped} dropped (ambiguous/absent)` : ''}` : '')
  : '';
const anyAstLoaded = astEngineLoadedThisRun;
const astState = anyAstLoaded ? 'loaded' : (!astAvailable || astLoadFailed) ? 'off' : 'idle';
const banner = `[extract] ${nodes.length} symbols, ${edges.length} edges (${edges.length - importEdgeCount} call + ${importEdgeCount} import) from ${files.length} files (${useCtags ? 'ctags' : 'regex'}${opts.engine !== 'regex' && astProbe.ts ? '+tree-sitter' : ''} engine); dropped ${ambiguousDropped} ambiguous bare-call edges (${shortNameDropped} short-name)${dispatchNote}; scanned ${scanCount}/${files.length} file(s); edged ${edgedCount}/${edgeFiles.length}${opts.cache ? ' (cache on)' : ''}; ast: ${astState}`;
  return { fragment, banner };
}

// ---- CLI front door: argv parse, --out/stdout write, exit codes (the ONLY process-lifecycle owner) ----
async function main() {
  const { opts: flags, pos } = parseArgs(process.argv.slice(2), {
    usage: USAGE,
    flags: {
      out: { type: 'string', default: null },
      target: { type: 'string', default: null },
      cache: { type: 'string', default: null },       // F0: per-file scan cache (incremental freshness)
      full: { type: 'bool', default: false },         // F9: ignore the edge cache, derive all edges from scratch
      'no-ctags': { type: 'bool', default: false },
      'allow-empty': { type: 'bool', default: false }, // intentionally-sparse targets: skip the empty-map guard
      engine: { type: 'string', default: process.env.CODEWEB_ENGINE || null }, // optional tree-sitter tier (exact cyclomatic); default regex
    },
  });
  const opts = { path: pos[0] ?? null, out: flags.out, ctags: !flags['no-ctags'], target: flags.target, cache: flags.cache, full: flags.full, allowEmpty: flags['allow-empty'], engine: flags.engine };
  let result;
  try { result = await runExtract(opts); }
  catch (e) { if (e instanceof ExtractError) { console.error(e.message); process.exit(e.code); } throw e; }
  const { fragment, banner } = result;
  // finding #19 (T-19.2): `--out` writes COMPACT JSON and an unchanged fragment is never rewritten
  // (out-file exists ∧ sizes equal ∧ sha1 old === sha1 new ⇔ identical bytes) -> skip the write,
  // banner gains `(unchanged)`. Stdout path unchanged. This is CLI I/O — never reached at import.
  if (opts.out) {
    const outPath = resolve(opts.out);
    const json = JSON.stringify(fragment);
    let unchanged = false;
    try {
      const prev = statSync(outPath);
      if (prev.size === Buffer.byteLength(json)) unchanged = sha1(readFileSync(outPath, 'utf8')) === sha1(json);
    } catch { /* absent/unreadable -> write */ }
    if (!unchanged) atomicWrite(outPath, json);
    console.error(banner + (unchanged ? ' (unchanged)' : '') + ` -> ${opts.out}`);
  } else { process.stdout.write(JSON.stringify(fragment)); console.error(banner); }
}

// Execute the CLI ONLY when run directly — the repo's proven guard idiom (post-edit-diff.mjs:79,
// pre-edit-impact.mjs, session-brief.mjs use it verbatim). LEXICAL compare (path.resolve, no
// realpath): safe here because extract-symbols is NOT a package.json `bin` entry (only run.mjs /
// mcp-server.mjs are) and every in-repo caller spawns it by real absolute path — do NOT expose it
// via `bin` without realpathSync on both sides (a symlinked argv[1] would skip main()).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
