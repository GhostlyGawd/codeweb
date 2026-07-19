#!/usr/bin/env node
/**
 * Fail when codeweb's public comms disagree with the source of truth:
 *  - a version string out of sync with package.json
 *  - a documented MCP tool count != the actual TOOLS table in mcp-server.mjs
 *  - a missing CHANGELOG entry for the current version
 *
 * This applies codeweb's own "fail on regression" philosophy to its marketing.
 * Exit 1 on any problem, 0 when aligned. Read-only.
 *
 *   node scripts/check-consistency.mjs   (or: npm run check-consistency)
 */
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkConsistency } from './release-utils.mjs';
import { auditClaims } from './lib/claims-check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = checkConsistency(ROOT);

// Spec C: the claims audit — every evidence source cited by the ledger and the README must exist.
// A receipt whose backing file is gone is a rotted claim, and rotted claims fail the build.
try {
  const product = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'product.json'), 'utf8'));
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const audit = auditClaims(ROOT, { product, readme });
  if (!audit.ok) {
    r.ok = false;
    for (const m of audit.missing) r.problems.push(`claim source missing: ${m.where} cites "${m.source}"`);
  }
} catch (e) {
  r.ok = false;
  r.problems.push(`claims audit could not run: ${e.message}`);
}

if (r.ok) {
  process.stdout.write(`check-consistency: OK — v${r.version}, ${r.count} tools, all surfaces aligned.\n`);
  process.exit(0);
}

process.stderr.write(`check-consistency: ${r.problems.length} problem(s) for v${r.version} (${r.count} tools):\n`);
for (const p of r.problems) process.stderr.write(`  x ${p}\n`);
process.stderr.write('Fix with: node scripts/version-sync.mjs (then update CHANGELOG.md if needed)\n');
process.exit(1);
