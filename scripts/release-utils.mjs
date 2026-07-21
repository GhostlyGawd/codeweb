/**
 * Shared, dependency-free helpers for the codeweb release ecosystem.
 *
 * The single source of truth for the version is package.json; the single source
 * of truth for the MCP tool count is the TOOLS table in scripts/mcp-server.mjs.
 * Everything else is derived from or checked against those two facts.
 *
 * Pure functions are exported for unit testing (bumpVersion, rollChangelog,
 * syncTargets); the file-touching helpers are thin wrappers over them.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const readText = (p) => readFileSync(p, 'utf8');
export const writeText = (p, s) => writeFileSync(p, s);

/** Canonical version (from package.json). */
export function getVersion(root) {
  return JSON.parse(readText(join(root, 'package.json'))).version;
}

/** Count the MCP tools at the source: the TOOLS table in scripts/mcp-server.mjs. */
export function mcpToolCount(root) {
  const src = readText(join(root, 'scripts', 'mcp-server.mjs'));
  return (src.match(/name:\s*'codeweb_[a-z_]+'/g) || []).length;
}

/** Count the tools the website advertises (sum of toolPhases in product.json). */
export function productToolCount(root) {
  const p = JSON.parse(readText(join(root, 'site', 'data', 'product.json')));
  return p.toolPhases.reduce((n, ph) => n + ph.tools.length, 0);
}

/** Canonical native-language count (from product.json's data-driven list; null when absent). */
export function productLanguageCount(root) {
  const p = JSON.parse(readText(join(root, 'site', 'data', 'product.json')));
  return Array.isArray(p.languages) ? p.languages.length : null;
}

// #3 (IMPROVEMENTS.md): the v0.9.0 gate audited structured surfaces (manifests, data files) but
// not PROSE — so the homepage said "20 tools" for a whole release while 24 shipped. These scans
// close that class: any hardcoded tool-count or native-language-count in the public prose must
// equal the canonical number, or the build fails. Numbers written as words count too ("Twenty
// tools" was one of the rotted instances).
const WORD_NUM = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, 'twenty-four': 24, 'twenty-seven': 27 };
const numOf = (s) => (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()] ?? null);

/** Prose files the scans cover — hand-written surfaces where counts can rot. */
export const PROSE_FILES = [
  'README.md',
  'site/content/index.html',
  'site/content/product.html',
  'site/content/start.html',
  'site/content/research.html',
  'commands/codeweb.md',
  'skills/codebase-anatomy/SKILL.md',
  'skills/codebase-anatomy/references/engine-detection.md',
];

/** Scan one text for tool-count / language-count claims that disagree with the canonical facts. */
export function scanProseCounts(text, file, { toolCount, langCount }) {
  const problems = [];
  // "<N> [deterministic|read-only|agent|query|MCP|structural]* tools" — digits or number-words.
  const toolRe = /\b(\d+|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|twenty-four|twenty-seven)((?:\s+(?:deterministic|read-only|agent|query|MCP|structural))*)\s+tools\b/gi;
  for (const m of text.matchAll(toolRe)) {
    const n = numOf(m[1]);
    if (n != null && n !== toolCount) problems.push(`${file}: says "${m[0].trim()}" but ${toolCount} tools ship`);
  }
  // "<N> native|first-class [languages]" — the language-surface claim. Skipped when the repo
  // carries no canonical language list (langCount null).
  if (langCount != null) {
    const langRe = /\b(\d+|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)[- ](native|first-class)\b/gi;
    for (const m of text.matchAll(langRe)) {
      const n = numOf(m[1]);
      if (n != null && n !== langCount) problems.push(`${file}: says "${m[0].trim()}" but ${langCount} native languages ship`);
    }
  }
  return problems;
}

/**
 * Where the version + tool-count must be mirrored away from package.json.
 * Each sub is [regExp, replacementString]; ${version}/${count} are interpolated,
 * $1/$2 are honored backrefs so surrounding formatting is preserved.
 */
export function syncTargets(version, count) {
  return [
    {
      file: '.claude-plugin/plugin.json',
      subs: [
        [/("version":\s*")[^"]+(")/, `$1${version}$2`],
        [/(\d+)(\s+deterministic read-only query tools)/, `${count}$2`],
      ],
    },
    {
      file: 'skills/codebase-anatomy/SKILL.md',
      subs: [[/(^version:\s*).+$/m, `$1${version}`]],
    },
    {
      file: 'README.md',
      subs: [[/(badge\/version-)\d+\.\d+\.\d+(-)/, `$1${version}$2`]],
    },
    {
      // no-op for the shipped server (version derives from package.json, no literal); repairs a
      // hardcoded serverInfo literal if one is ever reintroduced.
      file: 'scripts/mcp-server.mjs',
      subs: [[/(version:\s*')\d+\.\d+\.\d+(')/, `$1${version}$2`]],
    },
    {
      // Round 2, finding #4: the npm listing said "24 MCP tools" while 27 shipped, and neither the
      // gate nor the version roll touched it. The description's tool count now self-heals here.
      // No version sub — package.json IS the version source, bumped by release.mjs.
      file: 'package.json',
      subs: [[/(\d+)(\s+MCP tools)/, `${count}$2`]],
    },
  ];
}

/** Apply syncTargets to disk. Returns the list of files that changed. */
export function applySync(root, version, count) {
  const changed = [];
  for (const t of syncTargets(version, count)) {
    const p = join(root, t.file);
    if (!existsSync(p)) continue;
    const before = readText(p);
    let after = before;
    for (const [re, rep] of t.subs) after = after.replace(re, rep);
    if (after !== before) { writeText(p, after); changed.push(t.file); }
  }
  return changed;
}

/** Read-only consistency audit across the public-comms surface. */
export function checkConsistency(root) {
  const version = getVersion(root);
  const count = mcpToolCount(root);
  const problems = [];

  const plugin = JSON.parse(readText(join(root, '.claude-plugin', 'plugin.json')));
  if (plugin.version !== version) problems.push(`plugin.json version ${plugin.version} != package.json ${version}`);
  const advertised = (plugin.description.match(/(\d+)\s+deterministic read-only query tools/) || [])[1];
  if (advertised && Number(advertised) !== count) problems.push(`plugin.json advertises ${advertised} tools; MCP server exposes ${count}`);

  const skill = readText(join(root, 'skills', 'codebase-anatomy', 'SKILL.md'));
  const skillVer = (skill.match(/^version:\s*(.+)$/m) || [])[1];
  if (skillVer && skillVer.trim() !== version) problems.push(`SKILL.md version ${skillVer.trim()} != ${version}`);

  const pc = productToolCount(root);
  if (pc !== count) problems.push(`product.json lists ${pc} tools; MCP server exposes ${count}`);

  const readmePath = join(root, 'README.md');
  if (existsSync(readmePath)) {
    const rb = (readText(readmePath).match(/badge\/version-(\d+\.\d+\.\d+)-/) || [])[1];
    if (rb && rb !== version) problems.push(`README version badge ${rb} != ${version}`);
  }

  const clPath = join(root, 'CHANGELOG.md');
  if (existsSync(clPath)) {
    const cl = readText(clPath);
    const verRe = new RegExp(`^##\\s*\\[${version.replace(/\./g, '\\.')}\\]`, 'm');
    if (!verRe.test(cl)) problems.push(`CHANGELOG.md has no section for v${version}`);
  } else {
    problems.push('CHANGELOG.md is missing');
  }

  // The MCP handshake surface: serverInfo.version must agree with package.json. The shipped server
  // derives it dynamically (no literal — nothing to drift); a hardcoded literal is tolerated only
  // while it matches, and version-sync repairs it. (A literal '0.1.0' drifted for a whole release
  // because nothing audited this file.)
  const mcpPath = join(root, 'scripts', 'mcp-server.mjs');
  if (existsSync(mcpPath)) {
    const hard = readText(mcpPath).match(/version:\s*'(\d+\.\d+\.\d+)'/);
    if (hard && hard[1] !== version) problems.push(`mcp-server.mjs hardcodes serverInfo version ${hard[1]} != package.json ${version}`);
  }

  // #3: prose scans — hardcoded tool/language counts anywhere in the public prose must match the
  // canonical facts (tool count from the TOOLS table, language count from product.json data).
  const langCount = productLanguageCount(root);
  for (const rel of PROSE_FILES) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    problems.push(...scanProseCounts(readText(p), rel, { toolCount: count, langCount }));
  }
  // Round 2, finding #4: package.json's description is prose on the most public surface (the npm
  // listing) — scan it too. Description-only, not the raw JSON: keywords/scripts can't
  // false-positive, and `|| ''` keeps description-less fixtures green.
  problems.push(...scanProseCounts(
    JSON.parse(readText(join(root, 'package.json'))).description || '',
    'package.json (description)', { toolCount: count, langCount },
  ));
  // The research-page claim ledger: an "N / N tools" parity metric must claim the shipped count.
  const productPath = join(root, 'site', 'data', 'product.json');
  if (existsSync(productPath)) {
    for (const c of JSON.parse(readText(productPath)).claims || []) {
      const m = /(\d+)\s*\/\s*(\d+)\s+tools/.exec(c.metric || '');
      if (m && (Number(m[1]) !== count || Number(m[2]) !== count)) {
        problems.push(`product.json claim "${c.claim}" metric says ${m[0]}; ${count} tools ship`);
      }
    }
  }

  return { ok: problems.length === 0, version, count, problems };
}

/** Semantic-version bump. */
export function bumpVersion(v, level) {
  const [a, b, c] = v.split('.').map(Number);
  if (level === 'major') return `${a + 1}.0.0`;
  if (level === 'minor') return `${a}.${b + 1}.0`;
  if (level === 'patch') return `${a}.${b}.${c + 1}`;
  throw new Error(`bumpVersion: unknown level "${level}"`);
}

/**
 * Roll a Keep-a-Changelog document for a release: the body currently under
 * [Unreleased] becomes the new dated [version] section, and [Unreleased] is reset.
 * Link-reference definitions for [Unreleased] and [version] are refreshed.
 */
export function rollChangelog(md, version, date, repo = 'https://github.com/GhostlyGawd/codeweb') {
  const PLACEHOLDER = '_Nothing yet. Open work lands here before it ships in the next tagged release._';
  const unrelRe = /## \[Unreleased\]\s*([\s\S]*?)(?=\n## \[|\n\[Unreleased\]:|$)/;
  const m = md.match(unrelRe);
  if (!m) throw new Error('rollChangelog: no [Unreleased] section found');
  const body = m[1].replace(/^\s+|\s+$/g, '');
  if (!body || body === PLACEHOLDER) throw new Error('rollChangelog: [Unreleased] is empty — nothing to release');

  const prev = (md.match(/## \[(\d+\.\d+\.\d+)\]/) || [])[1];
  const replacement = `## [Unreleased]\n\n${PLACEHOLDER}\n\n## [${version}] - ${date}\n\n${body}\n`;
  let out = md.replace(unrelRe, replacement);

  // refresh link refs
  out = out.replace(/^\[Unreleased\]:.*$/m, `[Unreleased]: ${repo}/compare/v${version}...HEAD`);
  const verLink = `[${version}]: ${repo}/compare/${prev ? `v${prev}` : 'main'}...v${version}`;
  if (!new RegExp(`^\\[${version.replace(/\./g, '\\.')}\\]:`, 'm').test(out)) {
    out = out.replace(/^(\[Unreleased\]:.*\n)/m, `$1${verLink}\n`);
  }
  return out;
}
