// Spec C: the claims audit — every evidence source the marketing surfaces cite must exist in the
// tree. Pure so check-consistency can wire it and tests can pin it without touching the real repo.
//
// A "source" is valid when it resolves to (a) an existing path relative to the repo root, (b) an
// existing file under bench/results/, or (c) a filename-prefix of something under bench/results/
// or bench/experiments/ (labels like "efficiency-pilot" cover a family of files).

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function prefixHit(root, dir, label) {
  try { return readdirSync(join(root, dir)).some((f) => f.startsWith(label)); } catch { return false; }
}

/** Validate one source label against the tree. */
export function sourceExists(root, source) {
  if (!source || typeof source !== 'string') return false;
  const s = source.replace(/^\.\//, '');
  return existsSync(join(root, s))
    || existsSync(join(root, 'bench', 'results', s))
    || prefixHit(root, 'bench/results', s)
    || prefixHit(root, 'bench/experiments', s);
}

/**
 * Audit the evidence ledger (product.json claims + proof.headline) and the README's
 * bench-results references. Returns { ok, missing: [{where, source}] }.
 */
export function auditClaims(root, { product, readme }) {
  const missing = [];
  for (const c of product?.claims || []) {
    if (!sourceExists(root, c.source)) missing.push({ where: `product.json claim "${c.claim}"`, source: c.source });
  }
  for (const h of product?.proof?.headline || []) {
    if (!sourceExists(root, h.src)) missing.push({ where: `product.json headline "${h.label}"`, source: h.src });
  }
  const seen = new Set();
  for (const m of String(readme || '').matchAll(/bench\/(?:results|experiments)\/[\w][\w.-]*/g)) {
    const p = m[0];
    if (seen.has(p)) continue; seen.add(p);
    if (!existsSync(join(root, p))) missing.push({ where: 'README.md', source: p });
  }
  return { ok: missing.length === 0, missing };
}
