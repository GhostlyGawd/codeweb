// gate-md — render diff.mjs's JSON payload as the PR comment the CI gate posts. The gate used to
// be invisible unless it blocked ("today it only pass/fails"); this puts the structural review
// where reviewers already look, budgeted like every other codeweb surface (hard caps + explicit
// "+N more", never an unbounded dump).

import { sign } from './cli.mjs';
import { TEAMS_DASHBOARD_LINE, placementsSuppressed } from './product-copy.mjs';

const MARKER = '<!-- codeweb-gate -->';

const cap = (arr, n) => ({ head: arr.slice(0, n), more: Math.max(0, arr.length - n) });

// Source-derived strings stay single-line text, even when filenames contain Markdown or HTML.
const plain = (value, limit = 240) => {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (s.length > limit ? s.slice(0, limit) + '…' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]~]/g, '\\$&');
};
const relativePath = (value) => typeof value === 'string' && value.length > 0 &&
  !value.startsWith('/') && !/[\\\x00-\x1f]/.test(value) &&
  !value.split('/').some((part) => !part || part === '..' || part === '.');
const encodePath = (value) => value.split('/').map((part) => encodeURIComponent(part)
  .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

function sourceLocation(file, line, source) {
  const target = source?.target === '.' ? '' : (source?.target || '');
  const path = target ? `${target}/${file}` : file;
  const at = Number.isSafeInteger(line) && line > 0 ? line : null;
  const label = plain(`${path}${at ? `:${at}` : ''}`);
  // Only immutable commit links, with no credentials/query/fragment or parent traversal.
  const url = source?.repositoryUrl;
  if (!relativePath(file) || (target && !relativePath(target)) ||
      !/^https?:\/\/[a-z0-9.-]+(?::\d+)?\/[\w.-]+\/[\w.-]+$/i.test(url || '') ||
      !/^[a-f0-9]{40,64}$/i.test(source?.ref || '')) return label;
  return `[${label}](${url}/blob/${source.ref}/${encodePath(path)}${at ? `#L${at}` : ''})`;
}

/**
 * payload = the `diff.mjs --json` object. Returns the full comment body (marker included, so the
 * workflow can find-and-update its own comment instead of stacking new ones).
 * opts.history (RETENTION R7): metric rows from prior gated runs ({confirmed} each, oldest ->
 * newest) — renders the cross-PR trajectory line, the thing that keeps a team's gate installed
 * through its first annoying red X.
 * opts.upgrade (REVENUE §3 row 1): set false when the caller renders its own dashboard link — the
 * hosted service appends a footer pointing at the customer's real dashboard, and two dashboard
 * links in one comment, one of them marketing, is worse than either alone.
 * opts.graph is the after graph for symbol locations. opts.source optionally supplies
 * { repositoryUrl, ref, target } for immutable GitHub links; missing/invalid context stays text.
 */
export function gateComment(p, { history = null, upgrade = true, graph = null, source = null } = {}) {
  const byId = new Map((graph?.nodes || []).map((n) => [n.id, n]));
  const symbol = (id) => {
    const n = byId.get(id);
    return n?.file ? sourceLocation(n.file, n.line, source) : `\`${plain(id)}\``;
  };
  const L = [];
  L.push(MARKER);
  L.push(`## codeweb gate — ${p.ok ? '✅ no structural regressions' : `❌ ${p.regressions.length} regression type(s)`}`);
  L.push('');
  const rn = p.nodes.renamed.length;
  L.push(
    `\`${p.before}\` → \`${p.after}\` · nodes +${p.nodes.added.length} −${p.nodes.removed.length}${rn ? ` ~${rn} renamed` : ''}` +
    ` · edges +${p.edges.added} −${p.edges.removed} · cross-domain Δ${sign(p.crossDomainEdges.delta)}` +
    ` · cycles +${p.cycles.added.length} −${p.cycles.removed.length} · overlaps +${p.overlaps.added.length} −${p.overlaps.removed.length}`
  );
  if (!p.ok) {
    L.push('');
    L.push('**Blocking:**');
    for (const r of p.regressions) L.push(`- ❌ ${plain(r)}`);
  }
  // existing symbols that lost their last caller (brand-new and renamed-to nodes are not "lost")
  const added = new Set(p.nodes.added), renamedTo = new Set(p.nodes.renamed.map((r) => r.to));
  const lost = p.orphans.added.filter((id) => !added.has(id) && !renamedTo.has(id));
  const section = (title, items, render, n) => {
    if (!items.length) return;
    const c = cap(items, n);
    L.push('');
    L.push(`**${title}**`);
    for (const it of c.head) L.push(render(it));
    if (c.more) L.push(`- …+${c.more} more`);
  };
  section('New dependency cycles', p.cycles.added, (c) => {
    const sites = cap(c, 8);
    return `- ${sites.head.map((f) => sourceLocation(f, null, source)).join(' → ')}${sites.more ? ` → …+${sites.more} more files` : ''}`;
  }, 3);
  if (p.cycles.added.length) L.push('Inspect the dependency path; consider moving shared code into a module both sides can import.');
  section('New duplication findings', p.overlaps.added, (o) => {
    const sites = cap(o.nodes || [], 5);
    const details = [`- ${plain(o.kind)}: ${plain(o.title || '(untitled)')}`];
    if (sites.head.length) details.push(`  Sites: ${sites.head.map(symbol).join(' · ')}${sites.more ? ` · …+${sites.more} more sites` : ''}`);
    const facts = [];
    if (o.confidence) facts.push(`confidence: ${plain(o.confidence)}`);
    if (Number.isFinite(o.bodySim) && o.bodySim >= 0 && o.bodySim <= 1) facts.push(`body similarity: ${Math.round(o.bodySim * 100)}%`);
    if (facts.length) details.push(`  ${facts.join(' · ')}`);
    if (o.evidence) details.push(`  Evidence: ${plain(o.evidence, 400)}`);
    return details.join('\n');
  }, 5);
  if (p.overlaps.added.length) L.push('Compare the implementations and their callers before extracting shared logic; similarity alone does not establish interchangeability.');
  section('Symbols that lost all callers', lost, (id) => `- ${symbol(id)}`, 5);
  if (lost.length) L.push('Check entry points, callbacks, and dynamic dispatch before restoring a caller or removing the symbol. No mapped callers does not prove a symbol is unused.');
  section('Renames (not churn)', p.nodes.renamed, (r) => `- \`${r.from}\` → \`${r.to}\`${r.sim != null ? ` (body ${(r.sim * 100).toFixed(0)}%)` : ''}`, 5);
  // R7: trajectory — a verdict says "this PR"; the series says "the gate is working".
  if (Array.isArray(history) && history.length >= 2) {
    L.push('');
    L.push(`<sub>confirmed duplications across the last ${history.length} gated runs: ${history.map((r) => r.confirmed).join(' → ')}</sub>`);
  }
  L.push('');
  L.push('Analysis limits: this gate checks mapped structural changes and does not establish behavioral correctness. Ambiguous or unsupported calls may be absent from the map; run the relevant tests.');
  L.push('');
  // R7: the footer finally links home — this comment is codeweb's highest-frequency impression
  // on people who never installed it.
  L.push('<sub>codeweb structural review (same verdict as the gate). Reproduce locally: `node scripts/ci-gate.mjs --base <base-sha> --target <dir>` · [map your own repo with codeweb →](https://github.com/GhostlyGawd/codeweb) · free & local · [support the project](https://github.com/sponsors/GhostlyGawd)</sub>');
  // REVENUE §3 row 1: the attribution above is unconditional; this one line is the upgrade moment,
  // and it answers the suppression lever. Footer region only — never the verdict or the findings.
  if (upgrade && !placementsSuppressed()) L.push(TEAMS_DASHBOARD_LINE);
  return L.join('\n') + '\n';
}
