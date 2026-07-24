#!/usr/bin/env node
// codeweb-query bin — old-syntax Node guard (see bin/codeweb.mjs), then the query CLI: the
// quickstart path for callers/impact/cycles without remembering the scripts/ layout.
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error('codeweb needs Node >= 22 (you have ' + process.version + '). Install the current LTS: https://nodejs.org');
  process.exit(2); // setup error — never 1, which codeweb-diff reserves for "regression found" (API F2)
}
import('../scripts/query.mjs');
