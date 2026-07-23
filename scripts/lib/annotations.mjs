// codeweb finding-annotations (F7) — a deterministic, no-model memory of human/agent judgements.
// Every finding gets a stable `fingerprint` of its ESSENTIAL identity (kind + the symbols it
// implicates), so a "false-positive" suppression in `.codeweb/annotations.json` survives re-runs
// (FPR-STABLE) but CANNOT mask a genuinely new issue: if the implicated symbols change, the
// fingerprint changes and the finding resurfaces (ANN-IDENTITY-CHANGE-RESURFACES). Writes only to
// `.codeweb` metadata, never to source. Pure except the two explicit IO helpers.

import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { atomicWrite } from './cli.mjs'; // finding #42: crash-safe write (pretty-print bytes unchanged)

const ANN_FILE = 'annotations.json';

// Essential identity = kind + the sorted set of implicated node ids. Title/severity/evidence/order
// are cosmetic and excluded, so the same finding fingerprints identically across runs.
export function fingerprint(finding) {
  const kind = finding.kind || '';
  const nodes = [...new Set((finding.nodes || []).map(String))].sort();
  return createHash('sha1').update(JSON.stringify({ kind, nodes })).digest('hex').slice(0, 16);
}

// Read <dir>/annotations.json. `dir` IS the annotations directory (callers resolve `.codeweb`).
// Absent or corrupt -> an empty, well-formed annotation set (never throws).
export function loadAnnotations(dir) {
  try {
    const a = JSON.parse(readFileSync(join(dir, ANN_FILE), 'utf8'));
    return { suppressions: Array.isArray(a.suppressions) ? a.suppressions : [] };
  } catch { return { suppressions: [] }; }
}

// Partition findings into {visible, suppressed}, attaching each finding's fingerprint. A finding is
// suppressed iff its fingerprint matches a 'false-positive' suppression. Pure (never mutates input).
export function applySuppressions(findings, annotations) {
  const killed = new Set((annotations?.suppressions || []).filter((s) => s.verdict === 'false-positive').map((s) => s.fingerprint));
  const visible = [], suppressed = [];
  for (const f of findings) {
    const withFp = { ...f, fingerprint: fingerprint(f) };
    (killed.has(withFp.fingerprint) ? suppressed : visible).push(withFp);
  }
  return { visible, suppressed };
}

// Append a suppression to <dir>/annotations.json, idempotent by fingerprint. Creates the dir if
// needed. Returns the updated annotation set.
export function addSuppression(dir, fp, { note = '', verdict = 'false-positive' } = {}) {
  const ann = loadAnnotations(dir);
  if (!ann.suppressions.some((s) => s.fingerprint === fp)) ann.suppressions.push({ fingerprint: fp, verdict, note });
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, ANN_FILE), JSON.stringify(ann, null, 2));
  return ann;
}
