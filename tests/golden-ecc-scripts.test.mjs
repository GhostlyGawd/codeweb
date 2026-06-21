// Golden regression on the REAL target (plugins/marketplaces/ecc/scripts) — the crown-jewel test
// that proves the extractor fix stays fixed end-to-end: the false `log` super-hub does not return.
//
// The target is a living tree (the CLI-consolidation dogfooding edits it), so exact node/edge
// counts drift over time. This test therefore pins DRIFT-ROBUST invariants, not snapshot numbers:
//   · the fix collapses the max `log` in-degree from >=100 (super-hub) to well under 60 (genuine);
//   · discord/ecc-bot.mjs:log — the original false hub (indeg 127) — now sits at a genuine
//     single-digit in-degree (real in-file callers + module-scope log() calls), not a hub;
//   · the CODEWEB_LEGACY_FALLBACK toggle resurrects the super-hub, so the fix is load-bearing.
// Guarded by existsSync: if the target isn't on disk the test SKIPS with a logged reason
// (no silent pass).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, readJSON, script, ambiguousDropped, indegree } from './helpers.mjs';

const TARGET = process.env.CODEWEB_GOLDEN_TARGET
  || 'D:/GitHub Projects/ecc-test/plugins/marketplaces/ecc/scripts';
const present = existsSync(TARGET);
const skip = present ? undefined : `golden target not on disk: ${TARGET} (set CODEWEB_GOLDEN_TARGET)`;
if (!present) console.error(`[golden] SKIP — ${skip}`);

const DISCORD_LOG = 'discord/ecc-bot.mjs:log'; // the original false super-hub (was indeg 127)
const GENUINE_MAX = 60; // fixed: the largest genuine `log` hub (utils.log) sits well under this

let WS, def, leg;
before(() => {
  if (!present) return;
  WS = tmpDir('codeweb-golden-');
  const extract = (file, env) => {
    const out = join(WS, file);
    const r = runNode(script('extract-symbols.mjs'), [TARGET, '--no-ctags', '--out', out], { env });
    assert.equal(r.status, 0, `extractor failed:\n${r.stderr}`);
    return { frag: readJSON(out), dropped: ambiguousDropped(r.stderr) };
  };
  def = extract('default.json', {});
  leg = extract('legacy.json', { CODEWEB_LEGACY_FALLBACK: '1' });
});
after(() => { if (WS) cleanup(WS); });

const callEdges = (frag) => frag.edges.filter((e) => e.kind === 'call');
const maxLogIndeg = (frag) => {
  const call = callEdges(frag);
  return Math.max(...frag.nodes.filter((n) => n.label === 'log')
    .map((n) => call.filter((e) => e.to === n.id).length));
};

test('the extractor parses the full target into a substantial graph', { skip }, () => {
  assert.ok(def.frag.nodes.length > 1500, `nodes ${def.frag.nodes.length} > 1500`);
  assert.equal(def.frag.meta.symbols, def.frag.nodes.length, 'meta.symbols mirrors node count');
  assert.equal(def.frag.meta.engine, 'regex', '--no-ctags forces deterministic regex engine');
});

test('FIXED: no `log` super-hub — max log in-degree genuine (<60), discord:log single-digit', { skip }, () => {
  // Guard the drift-robust assertion: if the living target ever loses ALL `log` symbols,
  // Math.max(...[]) is -Infinity and `-Infinity < 60` would silently pass. Fail loudly instead.
  assert.ok(def.frag.nodes.some((n) => n.label === 'log'), 'target still defines `log` symbols');
  assert.ok(maxLogIndeg(def.frag) < GENUINE_MAX,
    `max log in-degree ${maxLogIndeg(def.frag)} is genuine (< ${GENUINE_MAX}), not a fabricated hub`);
  const discordLogIndeg = indegree(callEdges(def.frag), DISCORD_LOG);
  assert.ok(discordLogIndeg >= 2 && discordLogIndeg < 10,
    `the original false hub now sits at a genuine single-digit in-degree (${discordLogIndeg}: real callers + module-scope calls), not the 127 super-hub`);
  assert.ok(def.dropped > 20, `genuine ambiguous bare calls still dropped (${def.dropped}); method calls (obj.log()) are now excluded earlier by the leading-dot guard, not counted as drops`);
});

test('LEGACY toggle is load-bearing — fabricates the dropped edges back', { skip }, () => {
  // The 127-log super-hub had TWO causes: ambiguous bare calls wired to byName[0] AND method calls
  // (obj.log()) matched to a top-level `log`. The leading-dot guard now fixes the method-call cause
  // permanently, so toggling only the bare-call fallback no longer rebuilds the full hub — but it is
  // still load-bearing: legacy drops nothing and fabricates the ambiguous edges back.
  assert.equal(leg.dropped, 0, 'legacy fabricates instead of dropping');
  assert.ok(leg.frag.edges.length > def.frag.edges.length,
    `legacy re-adds the fabricated edges (${leg.frag.edges.length} > ${def.frag.edges.length})`);
});
