/** Immutable, workspace-local evidence records and byte-bounded historical views. */
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, basename, resolve, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canonicalJSON, hash, EvidenceError, evidenceError, validateRecord } from './evidence-core.mjs';

export const RECORD_LIMIT = 2 * 1024 * 1024;
export const STORE_LIMIT = 32 * 1024 * 1024;
export const ENVELOPE_LIMIT = 8192;
export const ENVELOPE_BYTES = ENVELOPE_LIMIT;
const ID = /^[a-f0-9]{64}$/;
const TASK = /^[A-Za-z0-9_-]{1,64}$/;
const RECEIPT_SECTIONS = ['callers', 'callees', 'impact', 'questions'];
const RESULT_SECTIONS = ['added', 'removed', 'witnessChanged', 'questions'];
const NEXT = ['Read a historical section using its receipt ID, task, section and offset.'];
const ERROR_CODES = new Set(['missing', 'corrupt', 'wrong-task', 'wrong-workspace', 'wrong-parent', 'wrong-selector', 'invalid-arguments', 'invalid-schema', 'invalid-path', 'record-too-large', 'store-full', 'store-busy', 'store-unavailable', 'summary-too-large', 'item-too-large', 'target-not-found', 'ambiguous-target', 'source-unavailable', 'source-changing', 'unsupported-source-layout', 'unsupported-engine', 'analysis-incompatible', 'target-unresolved', 'extraction-incomplete', 'invalid-witness']);
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const fail = code => { throw evidenceError(code); };
const validId = id => typeof id === 'string' && ID.test(id);
const validTask = task => typeof task === 'string' && TASK.test(task);
// Windows can expose the same directory as an 8.3 short name (RUNNER~1) through
// realpathSync and as a long name (runneradmin) through fs.promises.realpath.
// Compare resolved directory identities. The graph locator keeps its basename distinct:
// graph.json and an alias symlink in the same workspace remain different receipt owners.
const filesystemSpelling = path => {
  const normalized = normalize(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};
const sameWorkspaceRoot = async (a, b) =>
  filesystemSpelling(await fs.realpath(a)) === filesystemSpelling(await fs.realpath(b));
const sameGraphLocator = async (a, b) =>
  filesystemSpelling(await fs.realpath(dirname(resolve(a)))) === filesystemSpelling(await fs.realpath(dirname(resolve(b))))
  && filesystemSpelling(basename(a)) === filesystemSpelling(basename(b));
const kindCheck = kind => { if (kind !== 'receipts' && kind !== 'results') fail('invalid-arguments'); };

/** Errors deliberately contain fixed guidance, never raw exception text or arbitrary paths. */
export function boundedError(error, context = {}) {
  const code = ERROR_CODES.has(error?.code) ? error.code : 'store-unavailable';
  const out = { mode: 'evidence', schemaVersion: 1, state: error?.state === 'inconclusive' ? 'inconclusive' : 'unavailable', code };
  if (validTask(context.task)) out.task = context.task;
  if (validId(context.receiptId)) out.receiptId = context.receiptId;
  if (validId(context.resultId)) out.resultId = context.resultId;
  if (code === 'target-not-found') out.found = false;
  if (code === 'store-full') out.storeDirectory = 'evidence/v1';
  if (code === 'record-too-large' && error.counts) {
    out.counts = Object.fromEntries(['callers', 'callees', 'impact', 'questions'].filter(key => Number.isSafeInteger(error.counts[key]) && error.counts[key] >= 0).map(key => [key, error.counts[key]]));
  }
  out.nextSteps = code === 'analysis-incompatible'
    ? ['Restart the process after analyzer updates, then recapture with the current profile and configuration.']
    : code === 'wrong-selector'
      ? ['Use the original capture selector or exact recorded target ID for this historical page.']
      : code === 'store-full'
    ? ['Deliberately clear unwanted records in the graph directory under evidence/v1; no automatic cleanup is performed.']
    : code === 'store-busy'
      ? ['Retry when the evidence writer finishes; remove a stale evidence/v1/.lock only after confirming no writer is active.']
      : code === 'record-too-large'
        ? ['Narrow the target or use ordinary context; complete evidence was not stored.']
        : code === 'summary-too-large' || code === 'item-too-large'
          ? ['Use ordinary context or inspect the local evidence JSON record.']
          : ['Check the explicit task and evidence IDs, then recapture if the record is unavailable.'];
  return out;
}

function sections(record, receiptId, resultId) {
  const names = resultId ? RESULT_SECTIONS : RECEIPT_SECTIONS;
  return Object.fromEntries(names.map(section => [section, {
    total: sectionItems(record, section, !!resultId).length,
    receiptId, ...(resultId ? { resultId } : {}), section, offset: 0,
  }]));
}
function sectionItems(record, section, result) {
  return section === 'questions' ? record.questions : (result ? record.deltas[section] : record.relations[section]);
}
function relationCounts(record) {
  return Object.fromEntries(['callers', 'callees', 'impact'].map(name => [name, record.relations[name].length]));
}
function questionCounts(record) {
  const counts = { total: record.questions.length, unresolved: 0, 'needs-recheck': 0, 'no-longer-observed': 0 };
  for (const question of record.questions) if (Object.hasOwn(counts, question.state)) counts[question.state]++;
  return counts;
}
function fitSummary(out) {
  if (bytes(out) <= ENVELOPE_LIMIT) return out;
  const reduced = { ...out, limitations: [], limitationCount: out.limitations.length, metadataOmitted: true,
    recordLocator: { kind: out.resultId ? 'results' : 'receipts', id: out.resultId || out.receiptId } };
  if (Array.isArray(out.reasons)) { reduced.reasons = []; reduced.reasonCount = out.reasons.length; }
  if (bytes(reduced) > ENVELOPE_LIMIT) fail('summary-too-large');
  return reduced;
}

/** These renderers accept validated records; they do not inspect current source. */
export function summarizeReceipt(record, receiptId) {
  if (!validId(receiptId) || !validTask(record.task)) fail('invalid-arguments');
  return fitSummary({ mode: 'evidence', schemaVersion: 1, state: 'captured', task: record.task, receiptId,
    baseline: record.baseline, target: record.target, sections: sections(record, receiptId),
    limitations: record.analysis.limitations, nextSteps: NEXT });
}
export function summarizeResult(record, receiptId, resultId) {
  if (!validId(receiptId) || !validId(resultId) || !validTask(record.task)) fail('invalid-arguments');
  if (record.parentReceiptId !== receiptId) fail('wrong-parent');
  return fitSummary({ mode: 'evidence', schemaVersion: 1, state: record.state, task: record.task, receiptId, resultId,
    baseline: record.baseline, current: record.current, target: record.target,
    targetEvidenceChanged: record.targetEvidenceChanged, inputsChanged: record.inputsChanged,
    relations: relationCounts(record), deltas: Object.fromEntries(RESULT_SECTIONS.filter(x => x !== 'questions').map(x => [x, record.deltas[x].length])),
    questions: questionCounts(record), reasons: record.reasons || [],
    legacyReviewGraph: record.legacyReviewGraph, sameGraphAsEvidence: record.sameGraphAsEvidence,
    sections: sections(record, receiptId, resultId), limitations: record.analysis.limitations, nextSteps: NEXT });
}

/** Pack whole items. A large item advances via an explicit locator, never a sliced string. */
export function pageRecord(record, { receiptId, resultId, task, section, offset = 0 }) {
  if (!validId(receiptId) || (resultId !== undefined && !validId(resultId)) || !validTask(task)) fail('invalid-arguments');
  if (task !== record.task) fail('wrong-task');
  const isResult = resultId !== undefined;
  if (isResult && record.parentReceiptId !== receiptId) fail('wrong-parent');
  if (!isResult && record.parentReceiptId !== undefined) fail('wrong-parent');
  if (!(isResult ? RESULT_SECTIONS : RECEIPT_SECTIONS).includes(section)) fail('invalid-arguments');
  const list = sectionItems(record, section, isResult);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > list.length) fail('invalid-arguments');
  let summary = isResult ? summarizeResult(record, receiptId, resultId) : summarizeReceipt(record, receiptId);
  const build = items => {
    const remaining = list.length - offset - items.length;
    return { ...summary, historical: true, section, offset, items, total: list.length, remaining,
      nextOffset: remaining ? offset + items.length : null };
  };
  summary = fitSummary(build([]));
  const items = [];
  for (let index = offset; index < list.length; index++) {
    const item = list[index];
    if (bytes(build([...items, item])) <= ENVELOPE_LIMIT) { items.push(item); continue; }
    // A later item may fit on the next page without loss of detail.
    if (items.length) break;
    const locator = { id: item.id, itemOmitted: true, recordSection: section, recordIndex: index,
      nextSteps: ['Read this item in the immutable local JSON record for full detail.'] };
    if (item.file !== undefined && bytes(build([{ ...locator, file: item.file, line: item.line ?? null }])) <= ENVELOPE_LIMIT) {
      locator.file = item.file; locator.line = item.line ?? null;
    }
    if (bytes(build([locator])) > ENVELOPE_LIMIT) fail('item-too-large');
    items.push(locator);
  }
  return build(items);
}

async function lstatMaybe(path) {
  try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function safeDirectory(path, create) {
  let stat = await lstatMaybe(path);
  if (!stat && create) {
    try { await fs.mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    stat = await fs.lstat(path);
  }
  if (!stat) fail('missing');
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('invalid-path');
  return stat;
}
async function layout(graphPath, kind, create) {
  kindCheck(kind);
  if (typeof graphPath !== 'string' || !graphPath) fail('invalid-arguments');
  // Canonicalize the trusted graph-directory anchor (e.g. macOS /tmp -> /private/tmp).
  const anchor = await fs.realpath(dirname(resolve(graphPath)));
  await safeDirectory(anchor, false);
  let cursor = anchor;
  for (const component of ['evidence', 'v1', kind]) { cursor = join(cursor, component); await safeDirectory(cursor, create); }
  return { anchor, base: join(anchor, 'evidence', 'v1'), directory: cursor };
}
async function checkLayout(loc, kind) {
  await safeDirectory(loc.anchor, false);
  for (const path of [join(loc.anchor, 'evidence'), loc.base, join(loc.base, kind)]) await safeDirectory(path, false);
}
async function acquireLock(loc) {
  const path = join(loc.base, '.lock');
  const deadline = performance.now() + 1000;
  while (true) {
    await checkLayout(loc, 'receipts');
    try { return { path, handle: await fs.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600) }; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await lstatMaybe(path);
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) fail('invalid-path');
      const remaining = deadline - performance.now();
      if (remaining <= 0) fail('store-busy');
      await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining)));
    }
  }
}
async function recordBytes(base) {
  let total = 0;
  async function visit(path) {
    await safeDirectory(path, false);
    for (const name of await fs.readdir(path)) {
      const entry = join(path, name), stat = await fs.lstat(entry);
      if (stat.isSymbolicLink()) fail('invalid-path');
      if (stat.isDirectory()) await visit(entry);
      else if (stat.isFile() && name.endsWith('.json')) total += stat.size;
    }
  }
  await visit(base);
  return total;
}
async function readPayload(path, id, kind) {
  const stat = await lstatMaybe(path);
  if (!stat) fail('missing');
  if (stat.isSymbolicLink() || !stat.isFile()) fail('invalid-path');
  if (stat.size > RECORD_LIMIT) fail('record-too-large');
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) fail('corrupt');
    const buffer = Buffer.alloc(RECORD_LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > RECORD_LIMIT) fail('record-too-large');
    const after = await handle.stat();
    if (after.size !== length || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs) fail('corrupt');
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))); }
    catch { fail('corrupt'); }
    try { validateRecord(payload, kind); if (hash(payload) !== id) fail('corrupt'); }
    catch (error) { if (error.code === 'unsupported-engine') throw error; fail('corrupt'); }
    return payload;
  } finally { await handle.close(); }
}
function normalizeError(error) {
  if (error instanceof EvidenceError) return error;
  if (error?.code === 'ENOENT') return evidenceError('missing');
  if (error?.code === 'ELOOP' || error?.code === 'ENOTDIR') return evidenceError('invalid-path');
  return evidenceError('store-unavailable');
}

export async function putRecord(graphPath, kind, payload) {
  let temp, lock;
  try {
    kindCheck(kind); validateRecord(payload, kind);
    const text = canonicalJSON(payload), encodedBytes = Buffer.byteLength(text, 'utf8');
    if (encodedBytes > RECORD_LIMIT) {
      const error = evidenceError('record-too-large');
      error.counts = { ...relationCounts(payload), questions: payload.questions.length };
      throw error;
    }
    const id = hash(payload);
    // Capture cannot publish an artifact if its required target summary is unrenderable.
    if (kind === 'receipts') {
      summarizeReceipt(payload, id);
    }
    const root = await fs.realpath(payload.sourceRootRealpath);
    if (!(await sameWorkspaceRoot(root, payload.sourceRootRealpath))) fail('wrong-workspace');
    const canonicalGraph = join(await fs.realpath(dirname(resolve(graphPath))), basename(graphPath));
    if (kind === 'receipts' && !(await sameGraphLocator(resolve(root, payload.graphRelativePath), canonicalGraph))) fail('wrong-workspace');
    const loc = await layout(graphPath, kind, true);
    // One workspace lock coordinates both namespaces.
    await safeDirectory(join(loc.base, 'receipts'), true);
    await safeDirectory(join(loc.base, 'results'), true);
    lock = await acquireLock(loc);
    await checkLayout(loc, kind);
    if (kind === 'results') {
      const parent = await readPayload(join(loc.base, 'receipts', `${payload.parentReceiptId}.json`), payload.parentReceiptId, 'receipts');
      if (parent.task !== payload.task) fail('wrong-task');
      if (!(await sameWorkspaceRoot(parent.sourceRootRealpath, payload.sourceRootRealpath))) fail('wrong-workspace');
    }
    const destination = join(loc.directory, `${id}.json`);
    if (await lstatMaybe(destination)) {
      await readPayload(destination, id, kind);
      return id;
    }
    if (await recordBytes(loc.base) + encodedBytes > STORE_LIMIT) fail('store-full');
    temp = join(loc.directory, `.${id}.${randomBytes(12).toString('hex')}.tmp`);
    const handle = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await checkLayout(loc, kind);
    // Publication is atomic. Cooperative writers cannot replace an existing record under the lock.
    await fs.rename(temp, destination);
    temp = null;
    return id;
  } catch (error) { throw normalizeError(error); }
  finally {
    if (temp) await fs.unlink(temp).catch(() => {});
    if (lock) {
      await lock.handle.close().catch(() => {});
      await fs.unlink(lock.path).catch(() => {});
    }
  }
}

export async function readRecord(graphPath, kind, id, { task, root, receiptId } = {}) {
  try {
    kindCheck(kind);
    if (!validId(id) || !validTask(task) || typeof root !== 'string' || !root || (kind === 'results' && !validId(receiptId))) fail('invalid-arguments');
    const loc = await layout(graphPath, kind, false);
    const payload = await readPayload(join(loc.directory, `${id}.json`), id, kind);
    await checkLayout(loc, kind);
    if (payload.task !== task) fail('wrong-task');
    const rootRealpath = await fs.realpath(root);
    if (!(await sameWorkspaceRoot(payload.sourceRootRealpath, rootRealpath))) fail('wrong-workspace');
    if (kind === 'receipts' && !(await sameGraphLocator(resolve(rootRealpath, payload.graphRelativePath), join(loc.anchor, basename(graphPath))))) fail('wrong-workspace');
    if (kind === 'results') {
      if (payload.parentReceiptId !== receiptId) fail('wrong-parent');
      await readRecord(graphPath, 'receipts', receiptId, { task, root });
    }
    return payload;
  } catch (error) { throw normalizeError(error); }
}
