#!/usr/bin/env node
// codeweb annotate (F7) — record (or list) false-positive suppressions for finding fingerprints in
// <dir>/annotations.json (default .codeweb). This is the ONLY mutation in the suppression workflow and
// it writes to .codeweb metadata, NEVER to source. Idempotent by fingerprint. Built on
// ./lib/annotations.mjs. A finding's fingerprint comes from the tools that emit it (deadcode/overlap).
//
// Usage:
//   node annotate.mjs --suppress <fingerprint> [--note "why"] [--dir <.codeweb>] [--json]
//   node annotate.mjs --list [--dir <.codeweb>] [--json]
// Exit: 0 ok, 2 usage.

import { resolve } from 'node:path';
import { addSuppression, loadAnnotations } from './lib/annotations.mjs';

const USAGE = 'usage: annotate.mjs (--suppress <fingerprint> [--note "..."] | --list) [--dir <.codeweb>] [--json]';
import { die, emitJson, finish, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    list: { type: 'bool', default: false },
    suppress: { type: 'string', default: null },
    note: { type: 'string', default: '' },
    dir: { type: 'string', default: '.codeweb' },
  },
});
const { json, list, note, dir } = opts, fp = opts.suppress;
const annDir = resolve(dir);

if (list) {
  const ann = loadAnnotations(annDir);
  if (json) emitJson(ann);
  else {
    console.log(`codeweb annotations (${annDir}): ${ann.suppressions.length} suppression(s)`);
    for (const s of ann.suppressions) console.log(`  ${s.fingerprint}  ${s.verdict}${s.note ? `  — ${s.note}` : ''}`);
    finish(0);
  }
} else {
  if (!fp) die(USAGE, 2);
  const ann = addSuppression(annDir, fp, { note, verdict: 'false-positive' });
  if (json) emitJson({ dir: annDir, fingerprint: fp, suppressions: ann.suppressions.length });
  else {
    console.log(`codeweb annotate: suppressed ${fp} in ${annDir} (${ann.suppressions.length} total). Source untouched.`);
    finish(0);
  }
}
