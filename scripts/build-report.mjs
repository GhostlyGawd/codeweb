#!/usr/bin/env node
// codeweb report renderer: graph.json -> self-contained interactive report.html
//
// Usage:
//   node build-report.mjs [path/to/graph.json] [--out report.html] [--open]
//
// Reads a codeweb graph (see skills/codebase-anatomy/references/graph-schema.md), normalizes it
// (defaults, dangling-edge removal, computed stats), injects it into report-template.html, and
// writes a single self-contained HTML file. No network/CDN required.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { writeSidecars } from './lib/sidecars.mjs'; // finding #25: THE map-time sidecar trio writer (refresh reuses it)
import { atomicWrite, loadGraph, parseArgs } from './lib/cli.mjs';
import { findingBuckets, bucketsLine } from './lib/graph-ops.mjs'; // ACTIVATION A4: one triple, same numbers on every surface

const USAGE = 'usage: build-report.mjs [path/to/graph.json] [--out report.html] [--no-md] [--open]';

const here = dirname(fileURLToPath(import.meta.url));

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — the local copy treated unknown flags as
// positional paths (the exact bug class run.mjs's #5 fix closed); one policy now.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    open: { type: 'bool', default: false },
    out: { type: 'string', default: null },
    'no-md': { type: 'bool', default: false },
  },
});
const args = { open: opts.open, out: opts.out, md: !opts['no-md'] };

// finding 24: one loader (arg -> CODEWEB_WS -> nearest .codeweb) — this file carried a
// near-verbatim copy of loadGraph's error handling; loadGraph also ran normalizeGraph
// (meta/array defaults, domain/role fills), so only the report-specific normalization remains.
const { graph, abs: graphPath } = loadGraph(pos[0], { usage: USAGE });

// --- normalize (report-specific: dangling-edge drop + domain synthesis) ---
const ids = new Set(graph.nodes.map((n) => n.id));
const beforeEdges = graph.edges.length;
graph.edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
const droppedEdges = beforeEdges - graph.edges.length;

if (graph.domains.length === 0) {
  const counts = {};
  for (const n of graph.nodes) counts[n.domain] = (counts[n.domain] || 0) + 1;
  graph.domains = Object.entries(counts).map(([name, nodes]) => ({ name, nodes, summary: '' }));
}

// finding 5: this timestamp was the SOLE byte-difference between two identical runs. Honor
// SOURCE_DATE_EPOCH (the reproducible-builds convention) so CI can pin it and byte-compare
// graph.json across runs; without it, wall-clock as before.
const sde = Number(process.env.SOURCE_DATE_EPOCH);
graph.meta.generatedAt = Number.isFinite(sde) ? new Date(sde * 1000).toISOString() : new Date().toISOString();
graph.meta.stats = {
  files: new Set(graph.nodes.map((n) => n.file).filter(Boolean)).size,
  nodes: graph.nodes.length,
  edges: graph.edges.length,
  domains: graph.domains.length,
  overlaps: graph.overlaps.length,
};

// Persist the normalized graph back to disk so graph.json matches what the report renders:
// generatedAt, the computed meta.stats, default-filled domains, and the dangling-edge drop
// become part of the machine-readable artifact (they previously lived only in report.html/md).
// Minified, matching the upstream writers (cluster3.mjs / overlap.mjs).
atomicWrite(graphPath, JSON.stringify(graph));

// Spec P / finding #25: the map-time sidecar trio (brief.json, index-lite.json, similar-index.json),
// stamped against the FINAL graph.json bytes just written (mtime+size — the hooks stat, never parse,
// to check freshness). THE one writer now lives in lib/sidecars.mjs so refresh reuses it verbatim (a
// refresh used to leave all three stale until the next full map). Best-effort — never fails the map.
writeSidecars(graphPath, graph);

// --- render ---
const templatePath = join(here, 'report-template.html');
if (!existsSync(templatePath)) {
  console.error(`[codeweb] template missing: ${templatePath}`);
  process.exit(2); // #5: usage/IO
}
const template = readFileSync(templatePath, 'utf8');

// The report is self-contained and shareable (teammate, blog post, GitHub Pages), so it must not
// embed the absolute LOCAL source path. meta.root is only a disk pointer the query tools use to
// read bodies — graph.json on disk (written above) keeps it; the template renders meta.target,
// never meta.root. Strip it from the embedded copy without mutating the on-disk graph.
const embed = { ...graph, meta: { ...graph.meta } };
delete embed.meta.root;
// finding 5: generatedAt and the per-file/dir mtime stamps are dead weight the template never
// reads — and they made report.html differ across byte-identical inputs and fresh checkouts.
// Stripping them makes the shared artifact byte-deterministic for free. graph.json keeps all
// three (brief-core reads generatedAt; the staleness check reads sources/dirs).
delete embed.meta.generatedAt;
delete embed.meta.sources;
delete embed.meta.dirs;
// finding #36: the report template never reads these per-node/per-edge fields (grep-verified
// against report-template.html's read-set: nodes → id,label,domain,kind,role,file,line,loc,
// exports,summary; edges → from,to,weight), yet at scale they dominate report.html — per-node
// `t3` structural fingerprints run to ~kB each, so 16.8k nodes carry multiple MB of bytes the
// browser parses and discards. Strip them from the EMBEDDED copy with FRESH objects: `graph`
// is never mutated, so graph.json on disk (:68) and the sidecars (:74) — read by the editor
// lens, the MCP tools, and the hooks — keep every field. Embed-only slimming, ≥40% smaller.
embed.nodes = graph.nodes.map((n) => {
  const m = { ...n };
  delete m.t3; delete m.signature; delete m.complexity; delete m.maxDepth;
  return m;
});
embed.edges = graph.edges.map((e) => {
  const m = { ...e };
  delete m.kind;
  return m;
});

// Escape "<" so the JSON can live inside a <script type="application/json"> tag without ever
// forming "</script>". Inside JSON, "<" only appears within string values, where < is a
// valid escape that decodes back to "<".
const json = JSON.stringify(embed).replace(/</g, '\\u003c');

// Function replacement avoids String.replace's $-pattern interpretation in the payload.
// #8: a hosted report unfurls with a real title/description instead of a bare link. Only the
// TARGET LABEL and counts are embedded — never meta.root (the standing privacy invariant).
const escAttr = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ogTitle = `codeweb — ${graph.meta.target || 'codebase'} map`;
const ogDesc = `${(graph.nodes || []).length} symbols · ${(graph.edges || []).length} edges · ${(graph.domains || []).length} areas · ${(graph.overlaps || []).length} findings — interactive structure map generated by codeweb.`;
// RETENTION R10: the report names the version that built it (deterministic per install — the
// byte-identity property is version-stable), so a shared report self-identifies being behind.
const PKG_VERSION = (() => { try { return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();
const html = template
  .replace('<title>codeweb — system map</title>',
    `<title>${escAttr(ogTitle)}</title>\n<meta property="og:title" content="${escAttr(ogTitle)}">\n<meta property="og:description" content="${escAttr(ogDesc)}">\n<meta name="description" content="${escAttr(ogDesc)}">\n<meta property="og:type" content="website">\n<meta name="generator" content="codeweb v${escAttr(PKG_VERSION)}">`)
  .replace('__GRAPH_DATA__', () => json);

const outPath = args.out ? resolve(args.out) : join(dirname(graphPath), 'report.html');
atomicWrite(outPath, html);

const s = graph.meta.stats;
console.log(`[codeweb] wrote ${outPath}`);
console.log(
  `[codeweb] ${s.nodes} nodes, ${s.edges} edges, ${s.domains} domains — ${bucketsLine(findingBuckets(graph.overlaps))}` +
    (droppedEdges ? ` (dropped ${droppedEdges} dangling edges)` : '')
);
console.log(`[codeweb] updated ${graphPath} (meta.generatedAt + meta.stats persisted)`);

if (args.md) {
  const mdPath = join(dirname(outPath), 'report.md');
  atomicWrite(mdPath, buildMermaid(graph));
  console.log(`[codeweb] wrote ${mdPath}`);
}

if (args.open) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${outPath}"`
      : process.platform === 'darwin'
        ? `open "${outPath}"`
        : `xdg-open "${outPath}"`;
  try {
    execSync(cmd, { stdio: 'ignore', shell: true });
  } catch {
    /* opening is best-effort */
  }
}

// --- Mermaid / markdown fallback (renders on GitHub, no JS) ---
function mmId(s) { return 'd_' + String(s).replace(/[^A-Za-z0-9_]/g, '_'); }
function buildMermaid(g) {
  const byId = new Map((g.nodes || []).map((n) => [n.id, n]));
  const m = g.meta || {}, st = m.stats || {};
  const out = [
    '# codeweb — system map (static)',
    '',
    '> Auto-generated by codeweb. Open `report.html` for the interactive version.',
    '',
    `**Target:** ${m.target || '?'}${m.mode ? ' · ' + m.mode : ''}  ·  ` +
      `${st.nodes || 0} nodes · ${st.edges || 0} edges · ${st.domains || 0} domains · ${st.overlaps || 0} overlaps` +
      `${m.engine ? '  ·  engine: ' + m.engine : ''}`,
    '',
    '## Domain graph',
    '',
    '```mermaid',
    'flowchart LR',
  ];
  const cnt = {};
  (g.nodes || []).forEach((n) => { cnt[n.domain] = (cnt[n.domain] || 0) + 1; });
  const domains = (g.domains && g.domains.length ? g.domains.map((d) => d.name) : Object.keys(cnt));
  domains.forEach((d) => out.push(`  ${mmId(d)}["${d} (${cnt[d] || 0})"]`));
  const agg = new Map();
  (g.edges || []).forEach((e) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b || a.domain === b.domain) return;
    const k = a.domain < b.domain ? a.domain + '|' + b.domain : b.domain + '|' + a.domain;
    agg.set(k, (agg.get(k) || 0) + (e.weight || 1));
  });
  for (const [k, w] of agg) { const p = k.split('|'); out.push(`  ${mmId(p[0])} ===|${w}| ${mmId(p[1])}`); }
  out.push('```', '', '## Overlap / consolidation opportunities', '');
  const ov = g.overlaps || [];
  if (!ov.length) { out.push('_None recorded._', ''); }
  else {
    const rank = { high: 0, medium: 1, low: 2 };
    ov.slice().sort((a, b) => (rank[a.severity] == null ? 3 : rank[a.severity]) - (rank[b.severity] == null ? 3 : rank[b.severity]))
      .forEach((o, i) => {
        out.push(`### ${i + 1}. ${o.title || '(untitled)'} — \`${o.severity || 'low'}\``);
        out.push(`- **kind:** ${o.kind || '?'}  ·  **domains:** ${(o.domains || []).join(', ')}`);
        if (o.evidence) out.push(`- **evidence:** ${o.evidence}`);
        if (o.recommendation) out.push(`- **→ consolidate:** ${o.recommendation}`);
        if ((o.nodes || []).length) out.push(`- **nodes:** ${o.nodes.map((n) => '`' + n + '`').join(', ')}`);
        out.push('');
      });
  }
  return out.join('\n');
}
