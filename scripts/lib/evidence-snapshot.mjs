// Coherent source evidence. All extractor reads use an immutable local byte inventory.
import { readFileSync, readdirSync, lstatSync, realpathSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { resolve, relative, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runExtract, EXTRACTION_SKIP, EXTRACTION_MANIFESTS } from '../extract-symbols.mjs';
import { SRC_RE } from './common.mjs';
import { canonicalJSON, hash, EvidenceError, evidenceError } from './evidence-core.mjs';

export const EVIDENCE_PROFILE = 'native-regex-snapshot-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function failure(code, cause) {
  const error = evidenceError(code);
  if (cause) error.cause = cause;
  return error;
}
const isSnapshotManifestName = name => EXTRACTION_MANIFESTS.includes(name) || /\.(csproj|sln)$/.test(name);
function roles(path, name) {
  const found = [];
  if (SRC_RE.test(path)) found.push('source');
  if (path.endsWith('.json')) found.push('json');
  if (isSnapshotManifestName(name)) found.push('manifest');
  if (path === 'codeweb.rules.json') found.push('config');
  return found;
}

function readRegular(path) {
  // O_NOFOLLOW closes the file-symlink replacement seam; directory consistency is
  // independently checked during the second inventory. Never inspect target code by execution.
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    if (!fstatSync(fd).isFile()) throw failure('unsupported-source-layout');
    return readFileSync(fd);
  } catch (e) {
    if (e.code === 'ELOOP') throw failure('unsupported-source-layout', e);
    throw e;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function inventory(root) {
  const files = new Map(), directories = new Map(), entries = [], sourceHashes = {};
  function walk(rel) {
    const dir = join(root, rel);
    if (lstatSync(dir).isSymbolicLink()) throw failure('unsupported-source-layout');
    const children = readdirSync(dir, { withFileTypes: true }).sort((a, b) => cmp(a.name, b.name));
    const kept = [];
    for (const child of children) {
      const path = rel ? rel + '/' + child.name : child.name;
      if (EXTRACTION_SKIP.test(path)) continue;
      if (child.isSymbolicLink()) throw failure('unsupported-source-layout');
      const kind = child.isDirectory() ? 'directory' : child.isFile() ? 'file' : 'other';
      kept.push({ name: child.name, type: kind });
      if (kind === 'directory') { walk(path); continue; }
      const kinds = roles(path, child.name);
      if (!kinds.length) continue;
      if (kind !== 'file') throw failure('unsupported-source-layout');
      const bytes = readRegular(join(root, path));
      files.set(path, bytes);
      const hash = sha256(bytes);
      sourceHashes[path] = hash;
      for (const role of kinds) entries.push({ path, kind: role, sha256: hash });
    }
    directories.set(rel, kept);
  }
  walk('');
  if (!files.has('codeweb.rules.json')) entries.push({ path: 'codeweb.rules.json', kind: 'config', sha256: null });
  entries.sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind));
  const directoryEntries = [...directories].sort(([a], [b]) => cmp(a, b)).map(([path, children]) => ({ path, entries: children }));
  return { files, directories, sourceHashes, digest: hash({ entries, directories: directoryEntries }) };
}

function inputAdapter(root, snapshot) {
  function key(path) {
    const rel = relative(root, resolve(path)).replaceAll('\\', '/');
    if (rel === '..' || rel.startsWith('../') || resolve(root, rel) !== resolve(path)) throw failure('unsupported-source-layout');
    return rel;
  }
  const missing = () => { const e = new Error('snapshot input not found'); e.code = 'ENOENT'; throw e; };
  return Object.freeze({
    readFileSync(path, encoding) {
      const bytes = snapshot.files.get(key(path));
      if (!bytes) return missing();
      return encoding ? bytes.toString(typeof encoding === 'string' ? encoding : encoding.encoding) : Buffer.from(bytes);
    },
    existsSync(path) {
      const rel = key(path);
      if (snapshot.files.has(rel) || snapshot.directories.has(rel)) return true;
      const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      return !!snapshot.directories.get(parent)?.some(e => e.name === name);
    },
    readdirSync(path, options) {
      const children = snapshot.directories.get(key(path));
      if (!children) return missing();
      return children.map(e => options?.withFileTypes ? Object.freeze({ name: e.name, isDirectory: () => e.type === 'directory', isFile: () => e.type === 'file', isSymbolicLink: () => false }) : e.name);
    },
    statSync(path) {
      const rel = key(path), bytes = snapshot.files.get(rel), isDirectory = snapshot.directories.has(rel);
      if (!bytes && !isDirectory) return missing();
      // Synthetic stable stamps are never the currency check; raw inventory hashes are.
      return { size: bytes?.length || 0, mtimeMs: 0, isDirectory: () => isDirectory, isFile: () => !!bytes };
    },
  });
}

function analyzerIdentity() {
  const lib = dirname(fileURLToPath(import.meta.url)), scripts = dirname(lib);
  const names = readdirSync(lib).filter(n => n.endsWith('.mjs')).map(n => 'lib/' + n)
    .concat(['extract-symbols.mjs', 'context-pack.mjs', 'review.mjs']).sort(cmp);
  return {
    profile: EVIDENCE_PROFILE, nodeVersion: process.version,
    runtimeDigest: hash(names.map(path => ({ path, sha256: sha256(readFileSync(join(scripts, path))) }))),
    discoveryDigest: hash({ source: SRC_RE.source, skip: EXTRACTION_SKIP.source, manifests: EXTRACTION_MANIFESTS }),
    engine: 'regex', ctags: false, ast: false, relationVersion: 1, projectionVersion: 1, schemaVersion: 1,
  };
}

// ESM functions remain cached after files on disk change. Never label those old
// functions with a freshly computed identity from replacement runtime files.
const loadedAnalyzerIdentity = Object.freeze(analyzerIdentity());
const loadedAnalyzerCanonical = canonicalJSON(loadedAnalyzerIdentity);
function verifyLoadedAnalyzer() {
  let matches = false;
  try { matches = canonicalJSON(analyzerIdentity()) === loadedAnalyzerCanonical; } catch { /* removed/unreadable runtime is incompatible too */ }
  if (!matches) throw evidenceError('analysis-incompatible', 'Analyzer files changed after module loading; restart this process and recapture.', 'inconclusive');
  return loadedAnalyzerIdentity;
}

function capturedSourceReader(files) {
  const cache = new Map();
  const linesOf = path => {
    if (!files.has(path)) return null;
    if (!cache.has(path)) cache.set(path, files.get(path).toString('utf8').split(/\r?\n/));
    return cache.get(path).slice(); // consumers cannot mutate a later caller window
  };
  return Object.freeze({
    available: true,
    linesOf,
    bodyOf(node) {
      const lines = node && linesOf(node.file);
      return lines ? lines.slice(node.line - 1, node.line - 1 + (node.loc || 1)).join('\n') : null;
    },
  });
}

export async function captureSnapshot(rootPath, { beforeExtract, afterExtract } = {}) {
  let root;
  try { root = realpathSync(resolve(rootPath)); } catch (e) { throw failure('source-unavailable', e); }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const identity = verifyLoadedAnalyzer(), before = inventory(root);
      await beforeExtract?.({ attempt, root });
      const { fragment: graph } = await runExtract({ path: root, engine: 'regex', ctags: false, cache: null, allowEmpty: true, input: inputAdapter(root, before) });
      await afterExtract?.({ attempt, root });
      const after = inventory(root);
      verifyLoadedAnalyzer();
      if (before.digest !== after.digest) continue;
      return {
        root, graph, sourceHashes: before.sourceHashes, sourceReader: capturedSourceReader(before.files), inventoryDigest: before.digest,
        analyzerIdentity: identity,
        optionsDigest: hash({ profile: EVIDENCE_PROFILE, rules: before.sourceHashes['codeweb.rules.json'] || null }),
        profile: EVIDENCE_PROFILE,
      };
    } catch (e) {
      if (['unsupported-source-layout', 'source-changing', 'analysis-incompatible'].includes(e.code)) throw e;
      throw failure('source-unavailable', e);
    }
  }
  throw failure('source-changing');
}
