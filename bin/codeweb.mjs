#!/usr/bin/env node
// codeweb bin — a deliberately old-syntax shim so Node < 22 users get a sentence, not a raw
// SyntaxError from deep inside the engine (ACTIVATION A6). The engine itself may use syntax an
// old Node cannot even parse, so the guard must live in a file every Node can parse; the real
// entry loads only after the check, via dynamic import.
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error('codeweb needs Node >= 22 (you have ' + process.version + '). Install the current LTS: https://nodejs.org');
  process.exit(2); // setup error — never 1, which codeweb-diff reserves for "regression found" (API F2)
}
import('../scripts/run.mjs');
