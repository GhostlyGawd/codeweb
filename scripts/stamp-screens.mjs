// Stamp assets/screens/.template-stamp with the hash of the report template.
// The brand-sync gate (tests/brand-sync.test.mjs) compares the two: when the template
// changes, the committed screenshots are presumed stale until they are re-shot (or
// consciously re-verified against the change) and this script is re-run. The stamp is a
// review checkpoint, not a pixel proof — it exists so a template change can never ship
// with old screenshots silently.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = createHash('sha256')
  .update(readFileSync(join(ROOT, 'scripts', 'report-template.html')))
  .digest('hex');
writeFileSync(join(ROOT, 'assets', 'screens', '.template-stamp'), hash + '\n');
console.log('stamped assets/screens/.template-stamp = ' + hash.slice(0, 12) + '…');
