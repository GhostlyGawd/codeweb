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

// per-phase schematic glyph — what this phase does to the graph (geometry from tokens)
const PHASE_GLYPH = {
  structural: `<svg viewBox="0 0 220 120" fill="none" aria-hidden="true"><g stroke="var(--line)" stroke-width="1.6"><path class="flow-dash" d="M44 34 100 60"/><path class="flow-dash" d="M44 86 100 60"/><path d="M100 60 168 38"/><path d="M100 60 168 82"/></g><g fill="var(--phase)"><circle cx="44" cy="34" r="6"/><circle cx="44" cy="86" r="6"/><circle cx="100" cy="60" r="10"/></g><g fill="var(--faint)"><circle cx="168" cy="38" r="6"/><circle cx="168" cy="82" r="6"/></g><text x="44" y="18" fill="var(--phase)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">callers</text><text x="168" y="104" fill="var(--faint)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">callees</text></svg>`,
  write: `<svg viewBox="0 0 220 120" fill="none" aria-hidden="true"><rect x="30" y="42" width="64" height="36" rx="5" fill="var(--panel)" stroke="var(--phase)" stroke-dasharray="4 3"/><text x="62" y="64" fill="var(--phase)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">new()</text><rect x="126" y="42" width="64" height="36" rx="5" fill="var(--panel)" stroke="var(--line)"/><text x="158" y="64" fill="var(--muted)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">exists()</text><circle cx="110" cy="28" r="11" fill="none" stroke="var(--phase)" stroke-width="1.5"/><text x="110" y="32" fill="var(--phase)" font-size="13" font-family="var(--font-mono)" text-anchor="middle">≈</text><path class="flow-dash" d="M94 60 126 60" stroke="var(--phase)" stroke-width="1.6"/></svg>`,
  review: `<svg viewBox="0 0 220 120" fill="none" aria-hidden="true"><g stroke="var(--hi)" stroke-width="1.4"><path class="flow-dash" d="M110 60 60 32"/><path class="flow-dash" d="M110 60 56 78"/><path class="flow-dash" d="M110 60 78 100"/></g><circle cx="110" cy="60" r="24" fill="none" stroke="var(--hi)" stroke-width="1" opacity=".35"/><g fill="var(--hi)"><circle cx="110" cy="60" r="10"/><circle cx="60" cy="32" r="6"/><circle cx="56" cy="78" r="6"/><circle cx="78" cy="100" r="6"/></g><text x="150" y="56" fill="var(--hi)" font-size="11" font-family="var(--font-mono)">blast</text><text x="150" y="70" fill="var(--hi)" font-size="11" font-family="var(--font-mono)">radius</text></svg>`,
  optimize: `<svg viewBox="0 0 220 120" fill="none" aria-hidden="true"><g fill="var(--phase)"><circle cx="44" cy="42" r="8"/><circle cx="44" cy="82" r="8"/></g><g stroke="var(--line)" stroke-width="1.5"><path class="flow-dash" d="M52 42 120 62"/><path class="flow-dash" d="M52 82 120 62"/></g><circle cx="138" cy="62" r="13" fill="var(--phase)"/><path d="M120 62 126 62" stroke="var(--phase)"/><text x="138" y="40" fill="var(--muted)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">merge</text><path d="M166 62 188 62" stroke="var(--faint)" stroke-width="1.4" marker-end=""/><text x="186" y="58" fill="var(--good)" font-size="11" font-family="var(--font-mono)" text-anchor="end">−LOC</text></svg>`,
  freshness: `<svg viewBox="0 0 220 120" fill="none" aria-hidden="true"><path class="flow-spin" d="M110 28 A32 32 0 1 1 82 44" stroke="var(--phase)" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M110 24 L110 36 L120 30 Z" fill="var(--phase)"/><circle cx="110" cy="60" r="9" fill="var(--phase)"/><text x="110" y="108" fill="var(--muted)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">re-extract on edit</text></svg>`,
  meta: `<svg viewBox="0 0 220 120" fill="none" aria-hidden="true"><g stroke="var(--line)" stroke-width="1.4" fill="var(--panel)"><rect x="24" y="26" width="64" height="64" rx="5"/><rect x="132" y="26" width="64" height="64" rx="5"/></g><g fill="var(--muted)"><circle cx="44" cy="48" r="4"/><circle cx="68" cy="64" r="4"/></g><g fill="var(--phase)"><circle cx="152" cy="48" r="4"/><circle cx="176" cy="64" r="4"/><circle cx="160" cy="78" r="4"/></g><path class="flow-dash" d="M92 58 128 58" stroke="var(--phase)" stroke-width="1.6"/><text x="110" y="50" fill="var(--phase)" font-size="12" font-family="var(--font-mono)" text-anchor="middle">Δ</text></svg>`,
};

function renderToolPhases() {
  const ph = product.toolPhases;
  const rail = ph.map((p, i) => `<button class="te-station${i === 0 ? ' active' : ''}" type="button" role="tab" aria-selected="${i === 0}" data-te="${i}" style="--phase:${p.color}">
        <span class="te-step">0${i + 1}</span>
        <span class="te-title">${p.title}</span>
        <span class="te-badge">${p.tools.length}</span>
      </button>`).join('\n      ');
  const panels = ph.map((p, i) => `<div class="te-panel${i === 0 ? ' active' : ''}" data-te-panel="${i}" role="tabpanel" style="--phase:${p.color}">
        <div class="te-viz">${PHASE_GLYPH[p.key] || ''}</div>
        <div class="te-detail">
          <p class="te-blurb">${p.blurb}</p>
          <div class="te-tools">
            ${p.tools.map((t) => `<div class="te-tool"><span class="te-name">${t.name}</span><span class="te-desc">${t.desc}</span></div>`).join('\n            ')}
          </div>
        </div>
      </div>`).join('\n      ');
  return `<div class="tool-explorer">
      <div class="te-rail" role="tablist" aria-label="codeweb tool phases, in edit-loop order">
      ${rail}
      </div>
      <div class="te-stack">
      ${panels}
      </div>
    </div>`;
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
  { slug: 'index', nav: 'home', title: 'codeweb — the living map of your codebase', ogTitle: 'codeweb — the living map of your codebase', description: 'codeweb is the living map of your codebase — one deterministic graph served two ways: an interactive map for you, and 20 deterministic tools for the agents editing alongside you. Know what exists, and what an edit breaks, before you write.' },
  { slug: 'product', nav: 'product', title: 'Product — codeweb', ogTitle: 'codeweb — one graph, two interfaces', description: 'The 20 deterministic MCP tools, the Tier 0–3 feature map, five-language extraction, and the CI gate that fails a PR when an edit makes the structure worse.' },
  { slug: 'research', nav: 'research', title: 'Research — codeweb', ogTitle: 'codeweb — the evidence', description: 'A pre-registered effectiveness study (32/33 checks), an efficiency pilot, and an honest claim ledger: what is validated, what is preliminary, and what is a null result.' },
  { slug: 'start', nav: 'start', title: 'Get started — codeweb', ogTitle: 'Get started with codeweb', description: 'Install codeweb as a Claude Code plugin, run the engine directly, or register the MCP server. A five-minute quickstart and the core concepts.' },
  { slug: 'changelog', nav: 'changelog', title: 'Changelog — codeweb', ogTitle: 'codeweb changelog', description: 'Every release, capability, benchmark, and fix — kept in lock-step with the product under Keep a Changelog and Semantic Versioning.' },
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
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
<rect width="32" height="32" rx="7" fill="#1a1820"/>
<path d="M24.17 8.64 A11 11 0 1 0 24.17 23.36" fill="none" stroke="#c6f24e" stroke-width="4" stroke-linecap="round"/>
<rect x="22.9" y="11.4" width="4.2" height="9.2" rx="2.1" fill="#c6f24e"/>
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
  copyDir(join(SITE, 'assets'), /\.js$/);   // interactive engine (livemap.js) — same-origin, zero-dep
  copyDir(join(ROOT, 'assets', 'brand'), /\.(svg|png)$/);
  copyDir(join(ROOT, 'assets', 'screens'), /\.png$/);
  const og = join(ROOT, 'assets', 'brand', 'social-preview.png');
  if (existsSync(og)) copyFileSync(og, join(ASSETS, 'og.png'));
}

// ---------------------------------------------------------------- wrap demo
// The demo is a self-contained generated artifact with its own CSS, so we inject inline-styled
// navigation (no shared stylesheet, no class collisions), guarded by a marker so re-runs are idempotent.
const MARKER = '<!--cw-nav-->';

function injectDemoNav() {
  const p = join(DOCS, 'demo', 'index.html');
  if (!existsSync(p)) return false;
  let html = read(p);
  if (html.includes(MARKER)) return false;
  // weave links into the report's existing 48px top bar — no layout disruption on the full-viewport app
  const wm = `${MARKER}<b><a href="../index.html" style="color:inherit;text-decoration:none">codeweb</a></b>`
    + `<a href="../index.html" style="color:#9C99A6;text-decoration:none;font-size:12px;margin-left:10px">Home</a>`
    + `<a href="../research.html" style="color:#9C99A6;text-decoration:none;font-size:12px;margin-left:10px">Research</a>`;
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
  const wrapped = [injectDemoNav() && 'demo'].filter(Boolean);
  process.stdout.write(`codeweb site: built ${n} page(s) + assets into docs/ (v${VERSION})\n`);
  if (wrapped.length) process.stdout.write(`  wrapped with shared nav: ${wrapped.join(', ')}\n`);
}
main();
