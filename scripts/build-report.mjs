#!/usr/bin/env node
// codeweb report renderer: graph.json -> self-contained interactive report.html
//
// Usage:
//   node build-report.mjs [path/to/graph.json] [--out report.html] [--open]
//
// Reads a codeweb graph (see skills/codebase-anatomy/references/graph-schema.md), normalizes it
// (defaults, dangling-edge removal, computed stats), injects it into report-template.html, and
// writes a single self-contained HTML file. No network/CDN required.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildIndexLite, SIDECAR_NAME } from './lib/index-lite.mjs'; // Spec P: pre-edit hook fast path
import { sourceReader, atomicWrite } from './lib/cli.mjs';

const USAGE = 'usage: build-report.mjs [path/to/graph.json] [--out report.html] [--no-md] [--open]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help

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
  console.error(`[codeweb] graph not found: ${graphPath} — build it first (run /codeweb, or: node scripts/run.mjs <target> --out-dir <target>/.codeweb)`);
  process.exit(2); // #5: 2 = usage/IO per the documented exit-code convention
}

let graph;
try {
  graph = JSON.parse(readFileSync(graphPath, 'utf8'));
} catch (e) {
  console.error(`[codeweb] invalid JSON in ${graphPath}: ${e.message}`);
  process.exit(2); // #5: usage/IO
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

// Spec P: the pre-edit hook's sidecar, stamped against the FINAL graph.json bytes just written
// (mtime+size — the hook stats, never parses, to check freshness). Best-effort: a sidecar failure
// must never fail the map.
try {
  const st = statSync(graphPath);
  const lite = buildIndexLite(graph, { graphMtimeMs: st.mtimeMs, graphSize: st.size }, sourceReader(graph.meta?.root));
  atomicWrite(join(dirname(graphPath), SIDECAR_NAME), JSON.stringify(lite)); // hooks stat+read this concurrently
} catch { /* the hook falls back to the graph path */ }

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
const html = template
  .replace('<title>codeweb — system map</title>',
    `<title>${escAttr(ogTitle)}</title>\n<meta property="og:title" content="${escAttr(ogTitle)}">\n<meta property="og:description" content="${escAttr(ogDesc)}">\n<meta name="description" content="${escAttr(ogDesc)}">\n<meta property="og:type" content="website">`)
  .replace('__GRAPH_DATA__', () => json);

const outPath = args.out ? resolve(args.out) : join(dirname(graphPath), 'report.html');
atomicWrite(outPath, html);

const s = graph.meta.stats;
console.log(`[codeweb] wrote ${outPath}`);
console.log(
  `[codeweb] ${s.nodes} nodes, ${s.edges} edges, ${s.domains} domains, ${s.overlaps} overlaps` +
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
