#!/usr/bin/env node
// codeweb-diff bin — old-syntax Node guard (see bin/codeweb.mjs), then the diff gate CLI: the
// quickstart path to the regression verdict (exit 1 on a new cycle, new duplication, or a
// non-exported symbol losing every caller — the orphan-gate semantics).
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error('codeweb needs Node >= 22 (you have ' + process.version + '). Install the current LTS: https://nodejs.org');
  process.exit(1);
}
import('../scripts/diff.mjs');
