// Shared, bounded states for mapped advisory hooks. Unknown evidence never
// becomes a clean structural verdict; no workspace or original baseline is written.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { normalizeGraph, roleOf } from './graph-ops.mjs';
import { EXTRACTION_SKIP } from './common.mjs';

export function hookFileInScope(filePath, target) {
  const rel = relative(target.root, resolve(filePath)).replace(/\\/g, '/');
  return !EXTRACTION_SKIP.test(rel) && roleOf(rel) !== 'generated';
}

export function readHookGraph(target, bytes) {
  return normalizeGraph(JSON.parse(bytes ?? readFileSync(target.baseline, 'utf8')));
}

export function hookIssue(target, reason) {
  return { root: target.root, status: 'unavailable', reason };
}

export function formatHookIssue(out) {
  return `[codeweb] mapped evidence unavailable (${out.reason}); structural result unknown.\n  → Inspect source and rebuild this target with codeweb_map (or /codeweb); preserve the original pre-edit baseline.`;
}
