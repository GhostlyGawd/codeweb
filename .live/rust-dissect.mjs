// THROWAWAY test harness (not part of the shipped plugin) — a read-only Rust dissector that emits
// the same {meta,nodes,edges} fragment schema as scripts/extract-symbols.mjs, to exercise the
// language-agnostic downstream (cluster3 → overlap → build-report) on a non-JS/TS/Python target.
// Mirrors the extractor's precision rule: a bare call to a name with multiple defs and no same-file
// resolution is dropped, not guessed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'D:/GitHub Projects/ecc-test/plugins/marketplaces/ecc/ecc2/src';
const WS = '.live/runs/ecc2-rust';
const KW = new Set(['if','match','while','for','loop','return','fn','let','mut','move','async','await','unsafe','impl','struct','enum','trait','use','pub','as','where','dyn','ref','in','self','Self','super','crate','const','static','type','mod','else','break','continue','Some','Ok','Err','Box','Vec','println','print','eprintln','format','write','writeln','vec','assert','panic','matches']);

const norm = (p) => p.replace(/\\/g, '/');
const rootN = norm(ROOT);
const rel = (f) => norm(f).slice(rootN.length + 1);
const files = execFileSync('rg', ['--files', ROOT], { encoding: 'utf8' }).split(/\r?\n/).filter((f) => /\.rs$/.test(f));

const DEF = /^(\s*)(pub(\([a-z]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?(fn|struct|enum|trait)\s+([A-Za-z_]\w*)/;
const IMPL = /^\s*impl(?:<[^>]*>)?\s+(?:[A-Za-z_][\w:<>, ]*?\s+for\s+)?([A-Za-z_]\w*)/;

const nodes = [];
const fileRanges = new Map(); // rel -> {lines, ranges:[{id,name,start,end,kind}]}
for (const f of files) {
  let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const r = rel(f);
  const lines = text.split(/\r?\n/);
  const syms = [];
  lines.forEach((ln, i) => {
    const m = DEF.exec(ln);
    if (!m) return;
    const indent = m[1].length, exported = !!m[2], key = m[4], name = m[5];
    if (KW.has(name)) return;
    const kind = key === 'fn' ? (indent > 0 ? 'method' : 'function') : 'class';
    syms.push({ name, line: i + 1, kind, exports: exported });
  });
  const total = lines.length;
  const ranges = [];
  syms.sort((a, b) => a.line - b.line).forEach((s, idx) => {
    const start = s.line;
    const end = idx + 1 < syms.length ? Math.max(start, syms[idx + 1].line - 1) : total;
    const id = r + ':' + s.name;
    ranges.push({ id, name: s.name, start, end, kind: s.kind });
    nodes.push({ id, label: s.name, kind: s.kind, file: r, line: start, loc: Math.min(end - start + 1, 2000), exports: s.exports, domain: '', summary: '' });
  });
  fileRanges.set(r, { lines, ranges });
}

// name index
const byName = new Map();
for (const n of nodes) { if (!byName.has(n.label)) byName.set(n.label, []); byName.get(n.label).push(n.id); }
const nodeIds = new Set(nodes.map((n) => n.id));

const edgeSet = new Set();
const edges = [];
let dropped = 0;
const callRe = /([A-Za-z_]\w*)\s*\(/g;
const addEdge = (from, to, kind) => { if (!from || !to || from === to || !nodeIds.has(to)) return; const k = from + ' ' + to + ' ' + kind; if (edgeSet.has(k)) return; edgeSet.add(k); edges.push({ from, to, kind, weight: 1 }); };

for (const [r, { lines, ranges }] of fileRanges) {
  const sameFile = new Map(ranges.map((x) => [x.name, x.id]));
  const enclosing = (lineNo) => { for (const x of ranges) if (lineNo >= x.start && lineNo <= x.end) return x; return null; };
  // impl edges: track impl target by brace depth
  let depth = 0; const implStack = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const im = IMPL.exec(ln);
    if (im) implStack.push({ type: im[1], depth });
    // call edges
    callRe.lastIndex = 0; let m;
    while ((m = callRe.exec(ln))) {
      const name = m[1];
      if (KW.has(name) || !byName.has(name)) continue;
      const caller = enclosing(i + 1); if (!caller || caller.name === name) continue;
      let callee = sameFile.get(name);
      if (!callee) { const defs = byName.get(name); if (defs.length === 1) callee = defs[0]; else { dropped++; continue; } }
      addEdge(caller.id, callee, 'call');
    }
    // impl: link method defs to their type
    const dm = DEF.exec(ln);
    if (dm && dm[4] === 'fn' && dm[1].length > 0 && implStack.length) {
      const t = implStack[implStack.length - 1].type;
      const typeId = (sameFile.get(t)) || (byName.get(t)?.length === 1 ? byName.get(t)[0] : null);
      const methodId = r + ':' + dm[5];
      if (typeId) addEdge(methodId, typeId, 'impl');
    }
    // brace depth bookkeeping (after processing line)
    for (const ch of ln) { if (ch === '{') depth++; else if (ch === '}') { depth--; while (implStack.length && implStack[implStack.length - 1].depth >= depth) implStack.pop(); } }
  }
}

mkdirSync(WS, { recursive: true });
const fragment = { meta: { root: rootN, target: 'ecc2-rust', engine: 'rust-dissect (read)', languages: ['rust'], symbols: nodes.length }, nodes, edges };
writeFileSync(`${WS}/fragment.json`, JSON.stringify(fragment, null, 2));
const nk = {}; for (const n of nodes) nk[n.kind] = (nk[n.kind] || 0) + 1;
const ek = {}; for (const e of edges) ek[e.kind] = (ek[e.kind] || 0) + 1;
console.log(`[rust-dissect] ${nodes.length} nodes ${JSON.stringify(nk)} · ${edges.length} edges ${JSON.stringify(ek)} · dropped ${dropped} ambiguous calls · ${files.length} files -> ${WS}/fragment.json`);
