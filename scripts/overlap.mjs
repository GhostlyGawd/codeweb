// codeweb — overlap detector v2 (body-confirmed)
// Consumes <WS>/graph.json (post domain-mapping; WS = CODEWEB_WS, default .live), computes the
// overlap graph, and — when the target source is on disk — CONFIRMS each duplicate against the
// real function bodies (token-shingle Jaccard via node.line+node.loc). Body similarity is the
// authoritative confidence; structural corroboration (shared downstream calls + similar LOC) is
// the fallback when source is unavailable. Writes overlaps[] back into the graph and emits
// <WS>/overlap.md.
//
// Signals:
//   A. Redefinition clusters  — same symbol name in >=2 files; body-confirmed when source present.
//        · utility names      -> duplicate-logic
//        · CLI-scaffold names -> shared-responsibility (one combined finding)
//   B. Structural twins       — different-named fns whose downstream call *names* match.
//
// Confidence (with source):  body mean >=0.6 high(confirmed) · 0.35-0.6 medium(DRIFTED) ·
//   0.15-0.35 low · <0.15 refuted (dismissed as coincidental).  Precision over recall.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { shingles, jaccard } from './lib/shingles.mjs'; // shared body-shingle primitives (one truth)

const WS = process.env.CODEWEB_WS || '.live';   // per-target workspace dir (orchestrator sets this)
const GRAPH_PATH = `${WS}/graph.json`;
const OVERLAP_MD = `${WS}/overlap.md`;
const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const SOURCE_ROOT = graph.meta?.root || null; // target root recorded at extraction; null => structural fallback
const HAVE_SOURCE = !!SOURCE_ROOT && existsSync(SOURCE_ROOT);

const ENTRYPOINTS = new Set(['main']);
const SCAFFOLD = new Set(['parseArgs', 'parseArgv', 'usage', 'showHelp', 'printUsage', 'help', 'printHelp', 'cli']);
// KW / tokenize / jaccard / shingles now imported from ./lib/shingles.mjs (lifted, one truth).

// TWIN_JACCARD is a cheap RECALL pre-filter on shared downstream-call names; body-shingle
// confirmation (below) is the precision gate, so this can be loose. At 0.8 it never fired on
// real targets (0/516 candidate pairs passed); 0.5 surfaces candidates for body confirmation.
const TWIN_MIN_OUT = 4, TWIN_JACCARD = 0.5, LOC_CV_TIGHT = 0.4, K = 3;
const SEV = { low: 1, medium: 2, high: 3 };
const SEV_NAME = ['', 'low', 'medium', 'high'];
const CONF = { refuted: 0, low: 1, medium: 2, high: 3 };

const topDir = (file) => { const s = file.split('/')[0]; return /\.[^.]+$/.test(s) ? '(root)' : s; };
const domainOf = (n) => (n.domain && !/misc|loose|unassigned/i.test(n.domain) ? n.domain : topDir(n.file));
const commonDir = (files) => { const parts = files.map((f) => f.split('/').slice(0, -1)); let pre = parts[0] || []; for (const p of parts.slice(1)) { let i = 0; while (i < pre.length && i < p.length && pre[i] === p[i]) i++; pre = pre.slice(0, i); } return pre.length ? pre.join('/') : 'lib'; };
const band = (n) => (n >= 5 ? 3 : n >= 3 ? 2 : 1);
const severityFor = (files, domains) => SEV_NAME[Math.max(band(files), band(domains))];
const cv = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; if (!m) return 0; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m; };
const intersectAll = (sets) => { if (sets.length < 2) return new Set(); let acc = new Set(sets[0]); for (const s of sets.slice(1)) acc = new Set([...acc].filter((x) => s.has(x))); return acc; };

// ---- body access (read-only, by line range) ----
const fileCache = new Map();
const readLines = (rel) => { if (!fileCache.has(rel)) { try { fileCache.set(rel, readFileSync(SOURCE_ROOT + '/' + rel, 'utf8').split(/\r?\n/)); } catch { fileCache.set(rel, null); } } return fileCache.get(rel); };
const bodyShingles = (n) => { const lines = readLines(n.file); if (!lines) return null; const s = shingles(lines.slice(n.line - 1, n.line - 1 + (n.loc || 1)).join('\n'), K); return s.size ? s : null; };
const bodyConfidence = (nodes) => {
  const sets = nodes.map(bodyShingles).filter(Boolean);
  if (sets.length < 2) return null;
  const sims = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) sims.push(jaccard(sets[i], sets[j]));
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length, min = Math.min(...sims);
  const confidence = mean >= 0.6 ? 'high' : mean >= 0.35 ? 'medium' : mean >= 0.15 ? 'low' : 'refuted';
  return { mean, min, confidence, drifted: mean >= 0.35 && mean < 0.6 };
};

const isDecl = (file) => /\.d\.ts$/.test(file);
const defs = graph.nodes.filter((n) => n.kind !== 'module' && !isDecl(n.file));
const byId = new Map(graph.nodes.map((n) => [n.id, n]));

const outLabels = new Map();
for (const e of graph.edges) { if (e.kind !== 'call') continue; const to = byId.get(e.to); if (!to) continue; if (!outLabels.has(e.from)) outLabels.set(e.from, new Set()); outLabels.get(e.from).add(to.label); }

// ---- Signal A: redefinition clusters ------------------------------------------------
const byLabel = new Map();
for (const n of defs) { if (!byLabel.has(n.label)) byLabel.set(n.label, []); byLabel.get(n.label).push(n); }

const overlaps = [];
const scaffoldCluster = [];

for (const [label, nodes] of byLabel) {
  const files = [...new Set(nodes.map((n) => n.file))];
  if (files.length < 2) continue;
  if (ENTRYPOINTS.has(label)) continue;
  if (SCAFFOLD.has(label)) { scaffoldCluster.push({ label, nodes, files }); continue; }

  const domains = [...new Set(nodes.map(domainOf))];
  const locs = nodes.map((n) => n.loc);
  const medLoc = locs.slice().sort((a, b) => a - b)[locs.length >> 1];

  // authoritative: body confirmation; fallback: structural corroboration
  const body = HAVE_SOURCE ? bodyConfidence(nodes) : null;
  let confidence, basis;
  if (body) {
    confidence = body.confidence;
    basis = body.drifted
      ? `DRIFTED — copies diverged (body avg ${(body.mean * 100).toFixed(0)}%, min ${(body.min * 100).toFixed(0)}%); risk of inconsistent fixes`
      : body.confidence === 'refuted'
        ? `body-refuted (avg ${(body.mean * 100).toFixed(0)}%) — same name, different logic; likely coincidental`
        : `body-confirmed (avg ${(body.mean * 100).toFixed(0)}%, min ${(body.min * 100).toFixed(0)}%)`;
  } else {
    const callSets = nodes.map((n) => outLabels.get(n.id)).filter((s) => s && s.size);
    const shared = intersectAll(callSets);
    const locCV = cv(locs);
    const score = (shared.size > 0 ? 2 : 0) + (locCV < LOC_CV_TIGHT ? 1 : 0);
    confidence = score >= 2 ? 'high' : score === 1 ? 'medium' : 'low';
    basis = `structural: ${shared.size ? `share calls {${[...shared].slice(0, 4).join(', ')}}` : 'no shared calls'}, LOC cv=${locCV.toFixed(2)}`;
  }

  overlaps.push({
    kind: 'duplicate-logic', confidence, drifted: !!(body && body.drifted), bodySim: body ? +body.mean.toFixed(3) : null,
    severity: severityFor(files.length, domains.length), rank: files.length * 10 + domains.length,
    title: `\`${label}\` re-implemented in ${files.length} files` + (body && body.drifted ? ' (drifted)' : ''),
    domains, nodes: nodes.map((n) => n.id),
    evidence: `${nodes.length} definitions of \`${label}()\` across ${files.length} files, ${domains.length} domain(s); median ${medLoc} LOC. ${basis}. Sites: ${files.slice(0, 5).join(', ')}${files.length > 5 ? `, +${files.length - 5} more` : ''}`,
    recommendation: body && body.drifted
      ? `Reconcile the ${files.length} drifted copies into one \`${label}\` in \`${commonDir(files)}/\` — they have diverged, so pick the correct behaviour deliberately.`
      : `Extract one \`${label}\` into \`${commonDir(files)}/\`; import at the ${files.length} sites; delete the local copies.`,
  });
}

// Combined CLI-scaffold finding
if (scaffoldCluster.length) {
  const allNodes = scaffoldCluster.flatMap((c) => c.nodes);
  const files = [...new Set(allNodes.map((n) => n.file))];
  const domains = [...new Set(allNodes.map(domainOf))];
  const breakdown = scaffoldCluster.sort((a, b) => b.files.length - a.files.length).map((c) => `\`${c.label}\` ×${c.files.length}`).join(', ');
  // quantify the consolidation: current scaffolding LOC vs one shared module + a small per-script spec
  const currentLoc = allNodes.reduce((s, n) => s + (n.loc || 0), 0);
  const MODULE_LOC = 70, PER_SCRIPT_LOC = 12;
  const estAfter = MODULE_LOC + PER_SCRIPT_LOC * files.length;
  const saved = Math.max(0, currentLoc - estAfter);
  overlaps.push({
    kind: 'shared-responsibility', confidence: 'high', drifted: false, bodySim: null, severity: 'high', rank: 100000 + files.length,
    title: `CLI scaffolding hand-rolled across ${files.length} scripts`,
    domains, nodes: allNodes.map((n) => n.id),
    evidence: `Per-script reimplementation of CLI plumbing: ${breakdown} — ${allNodes.length} functions, ~${currentLoc} LOC across ${files.length} scripts. No shared CLI framework.`,
    recommendation: `Introduce one shared CLI module (~${MODULE_LOC} LOC) exporting a declarative \`parseArgs(spec)\` + \`renderHelp(spec)\`; replace each script's parser with a ~${PER_SCRIPT_LOC}-LOC flag spec. Est. ~${currentLoc} → ~${estAfter} LOC (−${saved}). Preserve per-script behaviour (unknown-arg policy, dest remaps, number validation, repeatable flags) and snapshot-test each parser before deleting the original.`,
  });
}

// ---- Signal B: structural twins -----------------------------------------------------
const cand = [...outLabels.entries()].filter(([, s]) => s.size >= TWIN_MIN_OUT);
const inv = new Map();
for (const [id, s] of cand) for (const t of s) { if (!inv.has(t)) inv.set(t, []); inv.get(t).push(id); }
const seenPair = new Set();
const flagged = new Set(overlaps.flatMap((o) => o.nodes));
const twins = [];
for (const callers of inv.values()) {
  for (let i = 0; i < callers.length; i++) for (let j = i + 1; j < callers.length; j++) {
    const x = callers[i], y = callers[j], key = x < y ? x + '|' + y : y + '|' + x;
    if (seenPair.has(key)) continue; seenPair.add(key);
    const nx = byId.get(x), ny = byId.get(y);
    if (!nx || !ny || nx.file === ny.file || nx.label === ny.label) continue;
    if (flagged.has(x) && flagged.has(y)) continue;
    const sim = jaccard(outLabels.get(x), outLabels.get(y));
    if (sim < TWIN_JACCARD) continue;
    twins.push({ nx, ny, sim, sh: [...outLabels.get(x)].filter((t) => outLabels.get(y).has(t)) });
  }
}
twins.sort((a, b) => b.sim - a.sim);
// Body-confirm each twin like Signal A: a shared downstream-call shape is only suggestive —
// confirm against the real bodies (token-shingle Jaccard). Body sim becomes the authoritative
// confidence, so genuine parallel impls rank up, drifted copies are flagged, and pairs that
// merely call the same helpers but implement different logic get demoted/dismissed as coincidental.
for (const t of twins.slice(0, 16)) {
  const domains = [...new Set([domainOf(t.nx), domainOf(t.ny)])];
  const body = HAVE_SOURCE ? bodyConfidence([t.nx, t.ny]) : null;
  let confidence, drifted = false, bodySim = null, basis;
  if (body) {
    confidence = body.confidence;
    drifted = body.drifted;
    bodySim = +body.mean.toFixed(3);
    basis = body.confidence === 'refuted'
      ? `bodies only ${(body.mean * 100).toFixed(0)}% similar — parallel call shape but distinct logic; likely coincidental`
      : drifted
        ? `bodies ${(body.mean * 100).toFixed(0)}% similar — parallel implementations that have drifted`
        : `bodies ${(body.mean * 100).toFixed(0)}% similar — confirmed parallel implementation`;
  } else {
    confidence = 'medium';
    basis = 'structural only (body unreadable / source absent): matched on downstream call names';
  }
  overlaps.push({
    kind: 'parallel-impl', confidence, drifted, bodySim, severity: severityFor(2, domains.length),
    rank: Math.round((bodySim != null ? bodySim : t.sim) * 5),
    title: `\`${t.nx.label}\` and \`${t.ny.label}\` call the same ${Math.round(t.sim * 100)}% of helpers` + (drifted ? ' (drifted)' : ''),
    domains, nodes: [t.nx.id, t.ny.id],
    evidence: `${t.nx.id} and ${t.ny.id} share downstream calls (name-Jaccard ${t.sim.toFixed(2)}): {${t.sh.slice(0, 6).join(', ')}}. ${basis}.`,
    recommendation: body && body.confidence === 'refuted'
      ? 'Despite the shared call shape the bodies differ — probably not the same logic; verify before merging.'
      : 'Compare the two; if behaviour matches, keep one and route both call sites through it.',
  });
}

// ---- rank, split, write -------------------------------------------------------------
overlaps.sort((a, b) => SEV[b.severity] - SEV[a.severity] || CONF[b.confidence] - CONF[a.confidence] || b.rank - a.rank);
overlaps.forEach((o, i) => { o.id = 'ov' + (i + 1); delete o.rank; });
graph.overlaps = overlaps;
writeFileSync(GRAPH_PATH, JSON.stringify(graph));

const findings = overlaps.filter((o) => o.confidence === 'high' || o.confidence === 'medium');
const unverified = overlaps.filter((o) => o.confidence === 'low');
const dismissed = overlaps.filter((o) => o.confidence === 'refuted');
const fmt = (o) => {
  const syms = o.nodes.slice(0, 10).map((id) => '  - `' + id + '`').join('\n') + (o.nodes.length > 10 ? `\n  - …+${o.nodes.length - 10} more` : '');
  return [`### ${o.id} · [${o.severity.toUpperCase()}] ${o.title}`, `**Kind:** ${o.kind}  ·  **Confidence:** ${o.confidence}${o.bodySim != null ? ` (body ${(o.bodySim * 100).toFixed(0)}%)` : ''}  ·  **Domains:** ${o.domains.join(', ')}`, ``, o.evidence, ``, `**→ ${o.recommendation}**`, ``, `<details><summary>${o.nodes.length} symbols</summary>`, ``, syms, `</details>`, ``].join('\n');
};
const md = [
  '# codeweb — overlap / consolidation opportunities',
  '',
  `> **${findings.length} findings** · ${unverified.length} unverified · ${dismissed.length} dismissed (body-refuted) on **${graph.meta?.target || 'target'}**.`,
  `> ${HAVE_SOURCE ? 'Confidence is **body-confirmed** (token-shingle similarity of real function bodies).' : 'Source unavailable — confidence is structural (shared calls + LOC).'} Each finding is a checklist item.`,
  '', '## Findings', '', ...findings.map(fmt),
  '## Unverified candidates', '', '_Borderline body similarity (15–35%); confirm by reading before acting._', '', ...unverified.map(fmt),
  '## Dismissed (body-refuted)', '', '_Same name, <15% body similarity — different logic, not duplication. Listed for transparency (no silent truncation)._', '',
  ...dismissed.map((o) => `- ${o.id} \`${o.title.replace(/`/g, '')}\` — body ${(o.bodySim * 100).toFixed(0)}%`),
].join('\n');
writeFileSync(OVERLAP_MD, md);

// ---- console summary ----------------------------------------------------------------
const drifted = findings.filter((o) => o.drifted).length;
console.log(`source: ${HAVE_SOURCE ? 'FOUND — body-confirmed' : 'absent — structural fallback'}`);
console.log(`findings ${findings.length} (incl. ${drifted} drifted) · unverified ${unverified.length} · dismissed ${dismissed.length}`);
console.log('--- top findings ---');
for (const o of findings.slice(0, 14)) console.log(`[${o.severity.toUpperCase().padEnd(6)} ${o.confidence.padEnd(6)}${o.bodySim != null ? ' ' + (o.bodySim * 100).toFixed(0).padStart(3) + '%' : '     '}] ${o.title.replace(/`/g, '')}`);
