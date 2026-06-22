#!/usr/bin/env node
// codeweb codemod (F8) — turn a consolidation OPPORTUNITY (or an explicit merge) into a concrete,
// gate-checked edit PLAN, and optionally APPLY it. Default is plan-only (pure). --write is
// conservative + REVERSIBLE: it refuses when the plan predicts a regression or a loser label can't
// be rewritten unambiguously, backs up every touched file, applies the edits, RE-EXTRACTS, and
// reverts byte-for-byte if the structural gate regresses. Source-rewriting is structural best-effort
// (it never re-introduces the byName guessing the extractor refuses). Built on ./lib/graph-ops.mjs
// (shares applyEdit / structuralRegressions / chooseCanonical — one truth with simulate-edit/optimize).
//
// Usage: node codemod.mjs <graph.json> (--opportunity <ovId> | --merge <ids> --into <id>) [--json] [--write]
// Exit: 0 ok, 1 predicted/actual regression (no net change), 2 usage/IO/ambiguous.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph, buildIndex, callersOf, impactOf, applyEdit, structuralRegressions, chooseCanonical, resolveSymbol } from './lib/graph-ops.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: codemod.mjs <graph.json> (--opportunity <ovId> | --merge <ids> --into <id>) [--json] [--write]';
function die(msg, code) { console.error(msg); process.exit(code); }

const argv = process.argv.slice(2);
let json = false, doWrite = false, opp = null, merge = null, into = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--write') doWrite = true;
  else if (t === '--opportunity') opp = argv[++i];
  else if (t === '--merge') merge = argv[++i];
  else if (t === '--into') into = argv[++i];
  else if (!t.startsWith('-')) pos.push(t);
}
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath || (opp == null && merge == null)) die(USAGE, 2);

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const index = buildIndex(graph);

// resolve the cluster to merge + the canonical survivor
let ids, canonical;
if (opp != null) {
  const o = graph.overlaps.find((x) => x.id === opp);
  if (!o) die(`opportunity not found: ${opp}`, 2);
  ids = [...new Set(o.nodes)];
  if (ids.length < 2) die(`opportunity ${opp} has <2 nodes`, 2);
  canonical = chooseCanonical(index, ids);
} else {
  ids = [...new Set(merge.split(',').flatMap((s) => resolveSymbol(graph, s.trim())))];
  if (ids.length < 2) die(`--merge needs >=2 resolved symbols (got ${ids.length})`, ids.length ? 2 : 1);
  canonical = into != null ? (resolveSymbol(graph, into)[0] || into) : chooseCanonical(index, ids);
}
const losers = ids.filter((id) => id !== canonical);
const byId = index.byId;

// projected gate (the SAME oracle simulate-edit is pinned to — one truth)
const after = applyEdit(graph, { kind: 'merge', ids, into: canonical });
const sr = structuralRegressions(graph, after);
const projectedGate = { newCycles: sr.newCycles, lostCallers: sr.lostCallers, ok: sr.newCycles.length === 0 && sr.lostCallers.length === 0 };

const deletions = losers.map((id) => { const n = byId.get(id); return { id, file: n.file, range: [n.line, n.line + (n.loc || 1) - 1] }; });
const rewrites = callersOf(index, losers).map((cid) => { const n = byId.get(cid); return { callerId: cid, file: n?.file ?? null, line: n?.line ?? null }; });
const locReclaimed = losers.reduce((s, id) => s + (byId.get(id)?.loc || 0), 0);
const canonLabel = byId.get(canonical)?.label;
const plan = { canonical, canonicalLabel: canonLabel, losers, deletions, rewrites, blastRadius: impactOf(index, ids).length, locReclaimed, projectedGate };

// ---- --write: conservative, gated, reversible ------------------------------------------------
let writeResult = null, code = 0;
if (doWrite) {
  const root = graph.meta?.root;
  if (!root || !existsSync(root)) die(`--write needs graph.meta.root on disk (got ${root || 'none'})`, 2);
  if (!projectedGate.ok) { writeResult = { applied: false, reason: 'the gate predicts a regression — refusing to write', projectedGate }; code = 1; }
  else {
    // a loser whose label differs from the canonical's must have a GLOBALLY-UNIQUE label to rewrite
    // safely (the token unambiguously refers to it); else refuse (never guess — the extractor's rule).
    const labelCount = (lab) => graph.nodes.filter((n) => n.label === lab).length;
    const renameLosers = losers.filter((id) => byId.get(id).label !== canonLabel);
    const ambiguous = renameLosers.filter((id) => labelCount(byId.get(id).label) !== 1);
    if (ambiguous.length) { writeResult = { applied: false, reason: `cannot safely rewrite ambiguous label(s): ${ambiguous.map((id) => byId.get(id).label).join(', ')} — apply by hand`, ambiguous }; code = 2; }
    else {
      const touched = [...new Set([...deletions.map((d) => d.file), ...rewrites.map((r) => r.file).filter(Boolean)])];
      const backup = new Map();
      for (const f of touched) { const p = join(root, f); backup.set(f, existsSync(p) ? readFileSync(p, 'utf8') : null); }
      const restore = () => { for (const [f, txt] of backup) if (txt != null) writeFileSync(join(root, f), txt); };
      try {
        // 1) delete loser definition line-ranges (descending per file so indices stay valid)
        const delByFile = new Map();
        for (const d of deletions) { if (!delByFile.has(d.file)) delByFile.set(d.file, []); delByFile.get(d.file).push(d.range); }
        for (const [f, ranges] of delByFile) {
          const p = join(root, f); const lines = readFileSync(p, 'utf8').split(/\r?\n/);
          for (const [s, e] of ranges.slice().sort((a, b) => b[0] - a[0])) lines.splice(s - 1, e - s + 1);
          writeFileSync(p, lines.join('\n'));
        }
        // 2) rewrite each rename-loser's label token -> canonical label, across every touched file
        const renameLabels = [...new Set(renameLosers.map((id) => byId.get(id).label))];
        for (const f of touched) {
          const p = join(root, f); if (!existsSync(p)) continue;
          let txt = readFileSync(p, 'utf8');
          for (const lab of renameLabels) txt = txt.replace(new RegExp(`\\b${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), canonLabel);
          writeFileSync(p, txt);
        }
        // 3) re-extract + gate; revert on regression
        const r = spawnSync(process.execPath, [join(HERE, 'extract-symbols.mjs'), root], { encoding: 'utf8', maxBuffer: 1 << 28 });
        if (r.status !== 0) { restore(); writeResult = { applied: false, reason: `re-extraction failed; reverted` }; code = 1; }
        else {
          const fresh = normalizeGraph(JSON.parse(r.stdout));
          const post = structuralRegressions(graph, fresh);
          if (post.newCycles.length || post.lostCallers.length) { restore(); writeResult = { applied: false, reason: 'post-edit gate regressed; reverted', post }; code = 1; }
          else writeResult = { applied: true, filesTouched: touched, reExtractGate: { newCycles: post.newCycles, lostCallers: post.lostCallers, ok: true } };
        }
      } catch (e) { restore(); writeResult = { applied: false, reason: `error during write; reverted: ${e.message}` }; code = 1; }
    }
  }
}

const payload = { ...plan, write: writeResult };
if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(code); }

console.log(`codeweb codemod: merge ${ids.length} -> keep ${canonical}`);
console.log(`  removes ${losers.length} copy(ies), rewires ${rewrites.length} caller(s), ~${locReclaimed} LOC, blast ${plan.blastRadius}`);
console.log(`  projected gate: ${projectedGate.ok ? 'PASS' : 'BLOCK'}${projectedGate.ok ? '' : ` (${projectedGate.newCycles.length} new cycle, ${projectedGate.lostCallers.length} lost-caller)`}`);
console.log('  deletions:'); for (const d of deletions) console.log(`    ${d.file}:${d.range[0]}-${d.range[1]}  (${d.id})`);
console.log('  rewrites:'); for (const r of rewrites) console.log(`    ${r.file}:${r.line}  (${r.callerId})`);
if (writeResult) console.log(`  write: ${writeResult.applied ? `APPLIED to ${writeResult.filesTouched.length} file(s)` : `NOT applied — ${writeResult.reason}`}`);
else console.log('  (plan-only — pass --write to apply, gated + reversible)');
process.exit(code);
