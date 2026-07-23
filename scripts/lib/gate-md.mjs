// gate-md — render diff.mjs's JSON payload as the PR comment the CI gate posts. The gate used to
// be invisible unless it blocked ("today it only pass/fails"); this puts the structural review
// where reviewers already look, budgeted like every other codeweb surface (hard caps + explicit
// "+N more", never an unbounded dump).

import { sign } from './cli.mjs';

const MARKER = '<!-- codeweb-gate -->';

const cap = (arr, n) => ({ head: arr.slice(0, n), more: Math.max(0, arr.length - n) });

/**
 * payload = the `diff.mjs --json` object. Returns the full comment body (marker included, so the
 * workflow can find-and-update its own comment instead of stacking new ones).
 * opts.history (RETENTION R7): metric rows from prior gated runs ({confirmed} each, oldest ->
 * newest) — renders the cross-PR trajectory line, the thing that keeps a team's gate installed
 * through its first annoying red X.
 */
export function gateComment(p, { history = null } = {}) {
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
    for (const r of p.regressions) L.push(`- ❌ ${r}`);
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
  section('New dependency cycles', p.cycles.added, (c) => `- ${c.join(' → ')}`, 3);
  section('New duplication findings', p.overlaps.added, (o) => `- ${o.kind}: ${o.title || '(untitled)'}`, 5);
  section('Symbols that lost all callers', lost, (id) => `- \`${id}\``, 5);
  section('Renames (not churn)', p.nodes.renamed, (r) => `- \`${r.from}\` → \`${r.to}\`${r.sim != null ? ` (body ${(r.sim * 100).toFixed(0)}%)` : ''}`, 5);
  // R7: trajectory — a verdict says "this PR"; the series says "the gate is working".
  if (Array.isArray(history) && history.length >= 2) {
    L.push('');
    L.push(`<sub>confirmed duplications across the last ${history.length} gated runs: ${history.map((r) => r.confirmed).join(' → ')}</sub>`);
  }
  L.push('');
  // R7: the footer finally links home — this comment is codeweb's highest-frequency impression
  // on people who never installed it.
  L.push('<sub>codeweb structural review (same verdict as the gate). Reproduce locally: `node scripts/ci-gate.mjs --base <base-sha> --target <dir>` · [map your own repo with codeweb →](https://github.com/GhostlyGawd/codeweb) · free & local · [support the project](https://github.com/sponsors/GhostlyGawd)</sub>');
  return L.join('\n') + '\n';
}
