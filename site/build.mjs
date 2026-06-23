#!/usr/bin/env node
/**
 * codeweb static site builder — zero dependencies, native Node modules only.
 *
 * Reads the canonical version from package.json and the canonical product facts
 * from site/data/product.json, renders the data-driven blocks (proof stats, tool
 * grid, evidence ledger, tiers …), bundles the design system into one same-origin
 * stylesheet, fills the templates, and writes the static site into docs/.
 *
 * Output is deterministic: same inputs -> byte-identical docs/ (see tests/site-build.test.mjs).
 * Run:  node site/build.mjs   (or: npm run build:site)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SITE, '..');
const DOCS = join(ROOT, 'docs');
const ASSETS = join(DOCS, 'assets');

const read = (p) => readFileSync(p, 'utf8');
const readSite = (...p) => read(join(SITE, ...p));

const pkg = JSON.parse(read(join(ROOT, 'package.json')));
const product = JSON.parse(readSite('data', 'product.json'));
const VERSION = pkg.version;
const YEAR = String(new Date().getFullYear());
const BASE = product.pagesBase.replace(/\/?$/, '/');

// ---------------------------------------------------------------- helpers
function fill(tpl, vars) {
  const out = tpl.replace(/\{\{([a-zA-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  const leftover = out.match(/\{\{[a-zA-Z_]+\}\}/);
  if (leftover) throw new Error(`build: unfilled placeholder ${leftover[0]}`);
  return out;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- renderers (product.json -> HTML)
function renderStats() {
  return product.proof.headline.map((s) => `
      <div class="stat">
        <div class="num">${s.num}</div>
        <div class="label">${s.label}</div>
        <div class="src">${s.src}</div>
      </div>`).join('');
}

function renderToolPhases() {
  return product.toolPhases.map((ph) => `
    <div class="phase">
      <div class="phase-head" style="--phase:${ph.color}">
        <h3>${ph.title}</h3>
        <span class="count">${ph.tools.length} tool${ph.tools.length > 1 ? 's' : ''} · ${ph.blurb}</span>
      </div>
      <div class="grid cols-3">
        ${ph.tools.map((t) => `<div class="tool" style="--phase:${ph.color}">
          <div class="name">${t.name}</div>
          <div class="desc">${t.desc}</div>
        </div>`).join('\n        ')}
      </div>
    </div>`).join('');
}

function renderTiers() {
  return `<div class="grid cols-2">${product.tiers.map((tr) => `
    <div class="card">
      <div class="eyebrow">${tr.tier} — ${tr.theme}</div>
      <ul class="kicker-list">
        ${tr.features.map((f) => `<li><span class="dot"></span><span><strong>${f.id} · ${f.name}</strong> — ${f.desc}</span></li>`).join('\n        ')}
      </ul>
    </div>`).join('')}</div>`;
}

function renderModes() {
  return `<div class="grid cols-2">${product.modes.map((m) => `
    <div class="card">
      <h3>${m.title}</h3>
      <p>${m.desc}</p>
    </div>`).join('')}</div>`;
}

function renderLedger() {
  const label = { validated: 'Validated', preliminary: 'Preliminary', null: 'Null (honest)' };
  return `<table class="ledger">
    <thead><tr><th>Claim</th><th>Result</th><th>Sample</th><th>Evidence</th><th>Status</th></tr></thead>
    <tbody>
      ${product.claims.map((c) => `<tr>
        <td class="claim">${c.claim}</td>
        <td class="num">${c.metric}</td>
        <td class="muted">${c.sample}</td>
        <td class="src">${c.source}</td>
        <td><span class="chip chip-${c.tag}">${label[c.tag]}</span></td>
      </tr>`).join('\n      ')}
    </tbody>
  </table>`;
}

function renderDontClaim() {
  return `<ul>${product.dontClaim.map((d) => `<li><strong>${d.instead_of}</strong> → ${d.we_say}</li>`).join('')}</ul>`;
}

function renderLanguages() {
  return product.languages.map((l) => `<span class="chip">${l}</span>`).join(' ');
}
function renderLanguagesInline() {
  const ls = product.languages;
  return ls.length > 1 ? `${ls.slice(0, -1).join(', ')}, and ${ls[ls.length - 1]}` : ls[0];
}

function renderPhilosophy() {
  return `<ul class="kicker-list">${product.philosophy.map((p) => `<li><span class="dot"></span><span>${p}</span></li>`).join('')}</ul>`;
}

const PIPELINE = [
  { n: '01', t: 'extract', d: 'Parse-free atomic nodes + edges, per language (JS/TS/Python/Rust/Go).' },
  { n: '02', t: 'cluster', d: 'Group nodes into semantic domains.' },
  { n: '03', t: 'overlap', d: 'Body-confirm cross-domain duplication and rank it.' },
  { n: '04', t: 'render', d: 'A self-contained interactive map + 20 agent tools.' },
];
function renderPipeline() {
  return `<div class="pipeline">${PIPELINE.map((s) => `
    <div class="stage"><div class="n">${s.n}</div><h4>${s.t}</h4><p>${s.d}</p></div>`).join('')}</div>`;
}

// changelog: filled in by the changelog system (CHANGELOG.md). Empty until then.
function renderChangelogBody() {
  const md = join(ROOT, 'CHANGELOG.md');
  if (!existsSync(md)) return '<p class="muted">Changelog coming with the next tagged release.</p>';
  return changelogToHtml(read(md));
}

// minimal, deterministic Keep-a-Changelog -> HTML (no markdown dependency).
// Skips the document title + preamble (the page has its own intro) and the
// link-reference definitions at the foot of the file.
function changelogToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  let started = false; // begin only at the first version heading
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  for (const ln of lines) {
    if (/^##\s+/.test(ln)) { started = true; closeList(); out.push(`<h2 class="cl-ver">${inline(ln.replace(/^##\s+/, ''))}</h2>`); continue; }
    if (!started) continue;
    if (/^\[[^\]]+\]:\s+\S+/.test(ln)) continue; // link-reference definition
    if (/^###\s+/.test(ln)) { closeList(); out.push(`<h3 class="cl-grp">${inline(ln.replace(/^###\s+/, ''))}</h3>`); }
    else if (/^\s*[-*]\s+/.test(ln)) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(ln.replace(/^\s*[-*]\s+/, ''))}</li>`); }
    else if (ln.trim() === '') { closeList(); }
    else { closeList(); out.push(`<p>${inline(ln.replace(/^_|_$/g, ''))}</p>`); }
  }
  closeList();
  return out.join('\n');
}

// ---------------------------------------------------------------- page assembly
const blocks = () => ({
  version: VERSION,
  year: YEAR,
  tagline: product.tagline,
  elevator: product.elevator,
  repo: product.repo,
  headline_stats: renderStats(),
  tool_phases: renderToolPhases(),
  tiers: renderTiers(),
  modes: renderModes(),
  claim_ledger: renderLedger(),
  dont_claim: renderDontClaim(),
  languages: renderLanguages(),
  languages_inline: renderLanguagesInline(),
  philosophy: renderPhilosophy(),
  pipeline: renderPipeline(),
  changelog_body: renderChangelogBody(),
});

const baseTpl = readSite('templates', 'base.html');
const navTpl = readSite('templates', 'nav.html');
const footerTpl = readSite('templates', 'footer.html');

function nav(active) {
  return navTpl.replace(`data-nav="${active}"`, `data-nav="${active}" aria-current="page"`);
}

const PAGES = [
  { slug: 'index', nav: 'home', title: 'codeweb — the system map for your codebase', ogTitle: 'codeweb — the system map for your codebase', description: 'A deterministic code-structure graph that makes AI coding agents more efficient, effective, and capable. An interactive map for humans; 20 query tools for agents. 32/33 pre-registered checks pass.' },
  { slug: 'product', nav: 'product', title: 'Product — codeweb', ogTitle: 'codeweb — one graph, two interfaces', description: 'The 20 deterministic MCP tools, the Tier 0–3 feature map, five-language extraction, and the CI gate that fails a PR when an edit makes the structure worse.' },
  { slug: 'research', nav: 'research', title: 'Research — codeweb', ogTitle: 'codeweb — the evidence', description: 'A pre-registered effectiveness study (32/33 checks), an efficiency pilot, and an honest claim ledger: what is validated, what is preliminary, and what is a null result.' },
  { slug: 'start', nav: 'start', title: 'Get started — codeweb', ogTitle: 'Get started with codeweb', description: 'Install codeweb as a Claude Code plugin, run the engine directly, or register the MCP server. A five-minute quickstart and the core concepts.' },
  { slug: 'changelog', nav: 'changelog', title: 'Changelog — codeweb', ogTitle: 'codeweb changelog', description: 'Every release, capability, paper, and fix — kept in lock-step with the product under Keep a Changelog and Semantic Versioning.' },
];

function buildPage(page) {
  const contentFile = join(SITE, 'content', `${page.slug}.html`);
  if (!existsSync(contentFile)) return false;
  const content = fill(read(contentFile), blocks());
  const canonical = BASE + (page.slug === 'index' ? '' : `${page.slug}.html`);
  const html = fill(baseTpl, {
    title: esc(page.title),
    description: esc(page.description),
    ogTitle: esc(page.ogTitle),
    canonical,
    ogImage: `${BASE}assets/og.png`,
    nav: nav(page.nav),
    footer: fill(footerTpl, blocks()),
    content,
  });
  writeFileSync(join(DOCS, `${page.slug}.html`), html);
  return true;
}

// ---------------------------------------------------------------- assets
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
<line x1="12" y1="12" x2="5" y2="5" stroke="#30363d" stroke-width="1.6"/>
<line x1="12" y1="12" x2="19" y2="6" stroke="#30363d" stroke-width="1.6"/>
<line x1="12" y1="12" x2="6" y2="18" stroke="#30363d" stroke-width="1.6"/>
<circle cx="5" cy="5" r="2" fill="#1c2330" stroke="#30363d" stroke-width="1.6"/>
<circle cx="19" cy="6" r="2" fill="#1c2330" stroke="#3fb950" stroke-width="1.6"/>
<circle cx="6" cy="18" r="2" fill="#1c2330" stroke="#ffb65c" stroke-width="1.6"/>
<circle cx="12" cy="12" r="3.6" fill="#58a6ff"/>
</svg>`;

function copyDir(srcDir, pattern) {
  if (!existsSync(srcDir)) return;
  for (const f of readdirSync(srcDir).sort()) {
    if (pattern.test(f)) copyFileSync(join(srcDir, f), join(ASSETS, f));
  }
}

function buildAssets() {
  // one same-origin stylesheet, cached across pages — design system in one place
  writeFileSync(join(ASSETS, 'site.css'), `${readSite('tokens.css')}\n${readSite('styles.css')}`);
  writeFileSync(join(ASSETS, 'favicon.svg'), FAVICON);
  copyDir(join(ROOT, 'assets', 'brand'), /\.(svg|png)$/);
  copyDir(join(ROOT, 'assets', 'screens'), /\.png$/);
  const og = join(ROOT, 'assets', 'brand', 'social-preview.png');
  if (existsSync(og)) copyFileSync(og, join(ASSETS, 'og.png'));
}

// ---------------------------------------------------------------- wrap demo + paper
// Both are self-contained generated artifacts with their own CSS, so we inject inline-styled
// navigation (no shared stylesheet, no class collisions), guarded by a marker so re-runs are idempotent.
const MARKER = '<!--cw-nav-->';
const A = (href, label, home) => `<a href="${href}" style="color:${home ? '#e6edf3' : '#8b949e'};text-decoration:none">${label}</a>`;

function injectPaperNav() {
  const p = join(DOCS, 'paper', 'index.html');
  if (!existsSync(p)) return false;
  let html = read(p);
  if (html.includes(MARKER)) return false;
  const strip = `${MARKER}<nav style="position:sticky;top:0;z-index:9999;display:flex;gap:15px;align-items:center;height:38px;padding:0 16px;background:rgba(10,14,20,.94);border-bottom:1px solid #30363d;font:600 13px/1 -apple-system,system-ui,'Segoe UI',sans-serif">`
    + `${A('../index.html', '‹ codeweb', true)}${A('../product.html', 'Product')}${A('../research.html', 'Research')}${A('../demo/', 'Live demo')}<span style="flex:1"></span>${A('https://github.com/GhostlyGawd/codeweb', 'GitHub')}</nav>`;
  html = html.replace(/(<body[^>]*>)/, `$1\n${strip}`);
  writeFileSync(p, html);
  return true;
}

function injectDemoNav() {
  const p = join(DOCS, 'demo', 'index.html');
  if (!existsSync(p)) return false;
  let html = read(p);
  if (html.includes(MARKER)) return false;
  // weave links into the report's existing 48px top bar — no layout disruption on the full-viewport app
  const wm = `${MARKER}<b><a href="../index.html" style="color:inherit;text-decoration:none">codeweb</a></b>`
    + `<a href="../index.html" style="color:#8b949e;text-decoration:none;font-size:12px;margin-left:10px">Home</a>`
    + `<a href="../research.html" style="color:#8b949e;text-decoration:none;font-size:12px;margin-left:10px">Research</a>`
    + `<a href="../paper/" style="color:#8b949e;text-decoration:none;font-size:12px;margin-left:10px">Paper</a>`;
  if (!html.includes('<b>codeweb</b>')) return false;
  html = html.replace('<b>codeweb</b>', wm);
  writeFileSync(p, html);
  return true;
}

// ---------------------------------------------------------------- run
function main() {
  mkdirSync(ASSETS, { recursive: true });
  buildAssets();
  let n = 0;
  for (const p of PAGES) if (buildPage(p)) n++;
  const wrapped = [injectPaperNav() && 'paper', injectDemoNav() && 'demo'].filter(Boolean);
  process.stdout.write(`codeweb site: built ${n} page(s) + assets into docs/ (v${VERSION})\n`);
  if (wrapped.length) process.stdout.write(`  wrapped with shared nav: ${wrapped.join(', ')}\n`);
}
main();
