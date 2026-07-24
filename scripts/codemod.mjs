#!/usr/bin/env node
// codeweb codemod (F8) — turn a consolidation OPPORTUNITY (or an explicit merge) into a concrete,
// gate-checked edit PLAN, and optionally APPLY it. Default is plan-only (pure). --write is
// conservative + REVERSIBLE: it refuses when the plan predicts a regression or a loser label can't
// be rewritten unambiguously, backs up every touched file, applies the edits, RE-EXTRACTS, and
// reverts byte-for-byte if the structural gate regresses. Source-rewriting is structural best-effort
// (it never re-introduces the byName guessing the extractor refuses). Built on ./lib/graph-ops.mjs
// (shares applyEdit / gateVerdict / chooseCanonical — one truth with simulate-edit/optimize).
//
// Usage: node codemod.mjs <graph.json> (--opportunity <ovId> | --merge <ids> --into <id>) [--json] [--write]
// Exit: 0 ok, 1 predicted/actual regression (no net change), 2 usage/IO/ambiguous.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph, buildIndex, callersOf, importersOf, impactOf, applyEdit, structuralRegressions, chooseCanonical, resolveSymbol, gateVerdict } from './lib/graph-ops.mjs';
import { maskAligned } from './lib/masking.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: codemod.mjs <graph.json> (--opportunity <ovId> | --merge <ids> [--into <id>]) [--json] [--write]'; // F14a: --into is optional (survivor inferred)
import { die, emitJson, finish, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    write: { type: 'bool', default: false },
    opportunity: { type: 'string', default: null },
    merge: { type: 'string', default: null },
    into: { type: 'string', default: null },
  },
});
const { json, merge, into } = opts, doWrite = opts.write, opp = opts.opportunity;
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath || (opp == null && merge == null)) die(USAGE, 2);

const { graph, abs } = loadGraph(graphPath, { usage: USAGE });

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
  if (into != null) {
    // an unresolvable --into must be a hard exit, never used verbatim: a raw string here has no
    // node/label, so canonLabel would be undefined and --write would delete EVERY definition and
    // rewrite loser tokens to the literal text "undefined" (reproduced in the perf-quality review).
    const cands = resolveSymbol(graph, into);
    if (cands.length === 0) die(`--into does not resolve to any node: ${into} — pass a node id or unique label`, 2);
    if (cands.length > 1) die(`--into is ambiguous (${cands.length} nodes): ${cands.join(', ')} — pass a full id`, 2);
    canonical = cands[0];
  } else canonical = chooseCanonical(index, ids);
}
const losers = ids.filter((id) => id !== canonical);
const byId = index.byId;

// projected gate (the SAME oracle simulate-edit is pinned to — one truth)
const after = applyEdit(graph, { kind: 'merge', ids, into: canonical });
const verdict = gateVerdict(graph, after, { exemptExported: false, scope: 'edges-only' });
const projectedGate = { newCycles: verdict.checks.newCycles, lostCallers: verdict.checks.lostCallers.map((l) => l.id), ok: verdict.ok, check: verdict.check };

const deletions = losers.map((id) => { const n = byId.get(id); return { id, file: n.file, range: [n.line, n.line + (n.loc || 1) - 1] }; });
// callers AND importers: a file that only imports a loser still holds a specifier that must be
// rewritten/repointed, or it ships a valid-looking import of a deleted definition.
const rewrites = [...new Set([...callersOf(index, losers), ...importersOf(index, losers)])].sort()
  .map((cid) => { const n = byId.get(cid); return { callerId: cid, file: n?.file ?? null, line: n?.line ?? null }; });
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
          const p = join(root, f); const raw = readFileSync(p, 'utf8');
          const eol = raw.includes('\r\n') ? '\r\n' : '\n'; // preserve the file's line ending (no silent CRLF->LF)
          const lines = raw.split(/\r?\n/);
          for (const [s, e] of ranges.slice().sort((a, b) => b[0] - a[0])) lines.splice(s - 1, e - s + 1);
          writeFileSync(p, lines.join(eol));
        }
        // 2) rewrite each rename-loser's label token -> canonical label — but only at positions that
        //    are LIVE CODE under the mask: an occurrence inside a comment is left alone (stale prose
        //    is harmless — it is counted and reported), and an occurrence inside a string/template/
        //    regex literal REFUSES the whole write, because a name that appears in a value can be
        //    load-bearing (dynamic dispatch, lookup keys, log greps) and rewriting OR orphaning it
        //    silently changes behavior. Both masks are column-preserving, so mask indexes address
        //    the raw text directly. Languages without an aligned mask (Ruby) keep the raw rewrite.
        const renameLabels = [...new Set(renameLosers.map((id) => byId.get(id).label))];
        let commentMentions = 0;
        for (const f of touched) {
          const p = join(root, f); if (!existsSync(p)) continue;
          let txt = readFileSync(p, 'utf8');
          for (const lab of renameLabels) {
            const re = new RegExp(`\\b${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            const live = maskAligned(f, txt);
            if (live == null) { txt = txt.replace(re, canonLabel); continue; } // no aligned mask for this language
            const values = maskAligned(f, txt, { keepValues: true });
            let out = '', last = 0, m;
            while ((m = re.exec(txt)) !== null) {
              if (live.slice(m.index, m.index + lab.length) === lab) {        // live code -> rewrite
                out += txt.slice(last, m.index) + canonLabel; last = m.index + lab.length;
              } else if (values.slice(m.index, m.index + lab.length) === lab) { // inside a string/regex value
                throw Object.assign(new Error(`"${lab}" appears inside a string/regex literal in ${f} — rewriting it could change behavior; apply by hand`), { refuse: true });
              } else commentMentions++;                                        // inside a comment -> leave stale prose
            }
            txt = out + txt.slice(last);
          }
          writeFileSync(p, txt);
        }
        // 2.5) an import that named a loser now names the canonical — but its module specifier may
        //      still point at the file the definition was just deleted FROM: `import { canon } from
        //      './loser.mjs'` is valid-looking, broken at runtime, and invisible to the structural
        //      gate (bare-name package resolution still finds the survivor elsewhere). Repoint any
        //      relative specifier that resolves to a deletion file (and not to the canonical's own
        //      file) at the canonical's file; refuse when the canonical lives in the importing file
        //      itself — that import must be deleted by hand, not repointed.
        const canonFile = byId.get(canonical)?.file;
        const deletionFiles = new Set(deletions.map((d) => d.file));
        const canonRe = new RegExp(`\\b${canonLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        const specRe = /\bfrom\s+(['"])([^'"]+)\1/;
        for (const f of touched) {
          if (!/\.(jsx?|mjs|cjs|tsx?|mts|cts)$/.test(f)) continue; // finding #11 (review): .mts/.cts importers repoint too
          const p = join(root, f); if (!existsSync(p)) continue;
          const raw = readFileSync(p, 'utf8');
          const eol = raw.includes('\r\n') ? '\r\n' : '\n';
          let changed = false;
          const lines = raw.split(/\r?\n/).map((ln) => {
            if (!/^\s*(?:import|export)\b/.test(ln) || !canonRe.test(ln)) return ln;
            const sm = specRe.exec(ln);
            if (!sm || !sm[2].startsWith('.')) return ln;                      // bare/package specifier: not ours
            const target = posix.normalize(posix.join(posix.dirname(f), sm[2]));
            if (!deletionFiles.has(target) || target === canonFile) return ln;
            if (canonFile === f) throw Object.assign(new Error(`${f} imports ${canonLabel} from ${sm[2]}, but the canonical now lives in ${f} itself — delete that import by hand`), { refuse: true });
            let spec = posix.relative(posix.dirname(f), canonFile);
            if (!spec.startsWith('.')) spec = './' + spec;
            changed = true;
            return ln.replace(specRe, `from ${sm[1]}${spec}${sm[1]}`);
          });
          if (changed) writeFileSync(p, lines.join(eol));
        }
        // 3) re-extract + gate; revert on regression. The gate treats a fully-deleted node as a
        //    non-regression by design, so additionally assert the canonical itself survived.
        const r = spawnSync(process.execPath, [join(HERE, 'extract-symbols.mjs'), root], { encoding: 'utf8', maxBuffer: 1 << 28 });
        if (r.status !== 0) { restore(); writeResult = { applied: false, reason: `re-extraction failed; reverted` }; code = 1; }
        else {
          const fresh = normalizeGraph(JSON.parse(r.stdout));
          const post = structuralRegressions(graph, fresh);
          if (!fresh.nodes.some((n) => n.id === canonical)) { restore(); writeResult = { applied: false, reason: `canonical ${canonical} missing after re-extract; reverted` }; code = 1; }
          else if (post.newCycles.length || post.lostCallers.length) { restore(); writeResult = { applied: false, reason: 'post-edit gate regressed; reverted', post }; code = 1; }
          else writeResult = { applied: true, filesTouched: touched, commentMentions, reExtractGate: { newCycles: post.newCycles, lostCallers: post.lostCallers, ok: true } };
        }
      } catch (e) { restore(); writeResult = { applied: false, reason: e.refuse ? e.message : `error during write; reverted: ${e.message}` }; code = e.refuse ? 2 : 1; }
    }
  }
}

const payload = { ...plan, write: writeResult };
if (json) { emitJson(payload, code); } else {

console.log(`codeweb codemod: merge ${ids.length} -> keep ${canonical}`);
console.log(`  removes ${losers.length} copy(ies), rewires ${rewrites.length} caller(s), ~${locReclaimed} LOC, blast ${plan.blastRadius}`);
console.log(`  projected gate: ${projectedGate.ok ? 'PASS' : 'BLOCK'}${projectedGate.ok ? '' : ` (${projectedGate.newCycles.length} new cycle, ${projectedGate.lostCallers.length} lost-caller)`}`);
console.log('  deletions:'); for (const d of deletions) console.log(`    ${d.file}:${d.range[0]}-${d.range[1]}  (${d.id})`);
console.log('  rewrites:'); for (const r of rewrites) console.log(`    ${r.file}:${r.line}  (${r.callerId})`);
if (writeResult) console.log(`  write: ${writeResult.applied ? `APPLIED to ${writeResult.filesTouched.length} file(s)` : `NOT applied — ${writeResult.reason}`}`);
else console.log('  (plan-only — pass --write to apply, gated + reversible)');
finish(code);
}
