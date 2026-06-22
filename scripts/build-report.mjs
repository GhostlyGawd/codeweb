#!/usr/bin/env node
// codeweb report renderer: graph.json -> self-contained interactive report.html
//
// Usage:
//   node build-report.mjs [path/to/graph.json] [--out report.html] [--open]
//
// Reads a codeweb graph (see skills/codebase-anatomy/references/graph-schema.md), normalizes it
// (defaults, dangling-edge removal, computed stats), injects it into report-template.html, and
// writes a single self-contained HTML file. No network/CDN required.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { _: [], open: false, out: null, md: true };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--open') a.open = true;
    else if (t === '--no-md') a.md = false;
    else if (t === '--out') a.out = argv[++i];
    else a._.push(t);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const graphPath = resolve(args._[0] || join('.codeweb', 'graph.json'));

if (!existsSync(graphPath)) {
  console.error(`[codeweb] graph not found: ${graphPath}`);
  process.exit(1);
}

let graph;
try {
  graph = JSON.parse(readFileSync(graphPath, 'utf8'));
} catch (e) {
  console.error(`[codeweb] invalid JSON in ${graphPath}: ${e.message}`);
  process.exit(1);
}

// --- normalize ---
graph.meta = graph.meta || {};
graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
graph.edges = Array.isArray(graph.edges) ? graph.edges : [];
graph.domains = Array.isArray(graph.domains) ? graph.domains : [];
graph.overlaps = Array.isArray(graph.overlaps) ? graph.overlaps : [];

for (const n of graph.nodes) if (!n.domain) n.domain = 'unassigned';

const ids = new Set(graph.nodes.map((n) => n.id));
const beforeEdges = graph.edges.length;
graph.edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
const droppedEdges = beforeEdges - graph.edges.length;

if (graph.domains.length === 0) {
  const counts = {};
  for (const n of graph.nodes) counts[n.domain] = (counts[n.domain] || 0) + 1;
  graph.domains = Object.entries(counts).map(([name, nodes]) => ({ name, nodes, summary: '' }));
}

graph.meta.generatedAt = new Date().toISOString();
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
writeFileSync(graphPath, JSON.stringify(graph));

// --- render ---
const templatePath = join(here, 'report-template.html');
if (!existsSync(templatePath)) {
  console.error(`[codeweb] template missing: ${templatePath}`);
  process.exit(1);
}
const template = readFileSync(templatePath, 'utf8');

// The report is self-contained and shareable (teammate, blog post, GitHub Pages), so it must not
// embed the absolute LOCAL source path. meta.root is only a disk pointer the query tools use to
// read bodies — graph.json on disk (written above) keeps it; the template renders meta.target,
// never meta.root. Strip it from the embedded copy without mutating the on-disk graph.
const embed = { ...graph, meta: { ...graph.meta } };
delete embed.meta.root;

// Escape "<" so the JSON can live inside a <script type="application/json"> tag without ever
// forming "</script>". Inside JSON, "<" only appears within string values, where < is a
// valid escape that decodes back to "<".
const json = JSON.stringify(embed).replace(/</g, '\\u003c');

// Function replacement avoids String.replace's $-pattern interpretation in the payload.
const html = template.replace('__GRAPH_DATA__', () => json);

const outPath = args.out ? resolve(args.out) : join(dirname(graphPath), 'report.html');
writeFileSync(outPath, html);

const s = graph.meta.stats;
console.log(`[codeweb] wrote ${outPath}`);
console.log(
  `[codeweb] ${s.nodes} nodes, ${s.edges} edges, ${s.domains} domains, ${s.overlaps} overlaps` +
    (droppedEdges ? ` (dropped ${droppedEdges} dangling edges)` : '')
);
console.log(`[codeweb] updated ${graphPath} (meta.generatedAt + meta.stats persisted)`);

if (args.md) {
  const mdPath = join(dirname(outPath), 'report.md');
  writeFileSync(mdPath, buildMermaid(graph));
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
