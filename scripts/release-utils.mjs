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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const readText = (p) => readFileSync(p, 'utf8');
export const writeText = (p, s) => writeFileSync(p, s);

/** Canonical version (from package.json). */
export function getVersion(root) {
  return JSON.parse(readText(join(root, 'package.json'))).version;
}

/** Count the MCP tools at the source: the TOOLS table in scripts/mcp-server.mjs plus the
 *  manifest entries it spreads in from scripts/lib/tool-specs.mjs (D1). Deduped by name, so a
 *  tool restated in both files can never double-count. */
export function mcpToolCount(root) {
  let text = readText(join(root, 'scripts', 'mcp-server.mjs'));
  const specsPath = join(root, 'scripts', 'lib', 'tool-specs.mjs');
  if (existsSync(specsPath)) text += '\n' + readText(specsPath);
  return new Set([...text.matchAll(/name:\s*'(codeweb_[a-z_]+)'/g)].map((m) => m[1])).size;
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
const WORD_NUM = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, 'twenty-four': 24, 'twenty-seven': 27, 'twenty-eight': 28 };
const numOf = (s) => (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()] ?? null);

/** Prose files the scans cover — hand-written surfaces where counts can rot. */
export const PROSE_FILES = [
  'README.md',
  'docs/reference.md',
  'tests/README.md',
  '.claude-plugin/marketplace.json',
  'site/content/index.html',
  'site/content/product.html',
  'site/content/start.html',
  'site/content/research.html',
  'commands/codeweb.md',
  'skills/codebase-anatomy/SKILL.md',
  'skills/codebase-anatomy/references/engine-detection.md',
  'scripts/lib/product-copy.mjs', // D6: the stdout claim strings are prose too
  'docs/cli.md', // D1: "--help wins and this file has a bug" — now its counts and tool names are gated
  // 2026-08-16 (PLAN Phase 0): the surfaces the C7 tooltip class shipped through — generated
  // artifacts and the remaining site pages are prose too, and the editor lens carries a
  // language-count comment that must track the shipped list.
  'scripts/report-template.html',
  'docs/demo/index.html',
  'site/content/support.html',
  'site/content/case-study.html',
  'site/content/downloads.html',
  'site/content/changelog.html',
  'editor/vscode-codeweb/README.md',
  'editor/vscode-codeweb/extension.js',
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
  // "(N total)" after an MCP-tools mention — the exact phrasing that shipped v0.9.0 with
  // "(20 total)" for a whole release: "total" isn't adjacent to "tools", so the tools scan
  // above can't see it. Context-gated to the preceding ~80 chars mentioning MCP tools, so
  // unrelated totals ("20,000 trials total") never trip it.
  const totalRe = /\b(\d+)\s+total\)/g;
  for (const m of text.matchAll(totalRe)) {
    const before = text.slice(Math.max(0, m.index - 80), m.index);
    if (!/MCP\s+tools?/i.test(before)) continue;
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
    // Bare "<N> languages" — the "Five languages, parse-free" heading class. Exemptions:
    // a preceding "original" (a historical count, e.g. "the original five languages"), and
    // open-ended "N+" counts (claims about OTHER tools' breadth, e.g. "40+ languages").
    const bareLangRe = /\b(\d+\+?|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s+languages?\b/gi;
    for (const m of text.matchAll(bareLangRe)) {
      if (m[1].endsWith('+')) continue;
      const before = text.slice(Math.max(0, m.index - 20), m.index);
      if (/original\s*$/i.test(before)) continue;
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
        [/(\d+)(\s+MCP tools)/, `${count}$2`],
      ],
    },
    {
      file: 'skills/codebase-anatomy/SKILL.md',
      subs: [[/(^  version:\s*).+$/m, `$1${version}`]],
    },
    {
      // DOCS/COMPREHENSION: marketplace.json said 1.0.0 while every other surface said the real
      // version — the one manifest the sync never touched.
      file: '.claude-plugin/marketplace.json',
      subs: [[/("version":\s*")[^"]+(")/, `$1${version}$2`]],
    },
    {
      // SEO F2: the MCP-registry manifest tracks the package version (top-level + the npm
      // package entry) so a release republish never ships a stale shelf listing.
      file: 'server.json',
      subs: [[/("version":\s*")[^"]+(")/g, `$1${version}$2`]],
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

/** VER-F4 (PLAN finding 8): claim VALUES trace to receipts, mechanically. The gate verified
 *  that receipt files exist and that counts matched — but the published numbers themselves
 *  were hand-restated on every surface, so a receipt re-run would move the truth while every
 *  surface silently kept the old number (the exact class behind charter C6). Scope: the
 *  headline stats with one canonical committed receipt each. A surface that does not state a
 *  stat is fine; a surface that states a DIFFERENT value than the receipt fails the build.
 *  Skipped entirely when the receipts are absent (fixture repos). */
export function auditClaimValues(root) {
  const problems = [];
  const readJson = (rel) => { try { return JSON.parse(readText(join(root, rel))); } catch { return null; } };
  const pilot = readJson('bench/experiments/efficiency-pilot.reps5-v090.json');
  const oracle = readJson('bench/results/oracle-ab.json');
  if (!pilot && !oracle) return problems; // fixtures: nothing to audit against
  const surfaces = ['README.md', 'site/content/research.html', 'site/data/product.json', 'assets/brand/proof-strip.svg'];
  // Deliberately OUT of scope: the "±"-form deltas (+0.310 recall, +0.234 precision, and the
  // labeled-history +0.265 from the reps8 run) — three legitimate values from two receipts
  // share one textual form, so a regex cannot bind a stated delta to its receipt without
  // false positives. The distinctively-phrased stats below are the C6 class this closes.
  const t = pilot ? Math.round((pilot.means?.treatment?.recall ?? NaN) * 100) : null;   // 74
  const c = pilot ? Math.round((pilot.means?.control?.recall ?? NaN) * 100) : null;     // 44
  const ratio = oracle && typeof oracle.impact?.costRatio === 'number' ? Math.round(oracle.impact.costRatio) : null; // 126
  // the "N deterministic comparisons" claim is a floor across every committed result file
  let comparisonSum = 0;
  const resultsDir = join(root, 'bench', 'results');
  if (existsSync(resultsDir)) {
    for (const f of readdirSync(resultsDir)) {
      if (!f.endsWith('.json')) continue;
      const d = readJson(`bench/results/${f}`);
      (function walk(v) {
        if (Array.isArray(v)) return v.forEach(walk);
        if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) {
            if (typeof x === 'number' && /comparison|trial/i.test(k)) comparisonSum += x;
            else walk(x);
          }
        }
      })(d);
    }
  }
  for (const rel of surfaces) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    const text = readText(p);
    if (t != null && c != null && Number.isFinite(t) && Number.isFinite(c)) {
      for (const m of text.matchAll(/\b(\d{2})(?:%| percent)[\s\S]{0,160}?\b(\d{2})(?:%| percent)\s+with\s+grep/gi)) {
        if (Number(m[1]) !== t || Number(m[2]) !== c) problems.push(`${rel} states a recall pair "${m[1]}/${m[2]}" but the pilot receipt says ${t}% codeweb / ${c}% grep (efficiency-pilot.reps5-v090.json)`);
      }
      for (const m of text.matchAll(/\b(\d{2})%\s*(?:→|->)\s*(\d{2})%/g)) {
        if (Number(m[1]) !== c || Number(m[2]) !== t) problems.push(`${rel} states "${m[0]}" but the pilot receipt says ${c}% → ${t}%`);
      }
    }
    if (ratio != null) {
      for (const m of text.matchAll(/\b(\d{2,4})\s*(?:×|times)\s+(?:the\s+|fewer\s+)tokens/gi)) {
        if (Number(m[1]) !== ratio) problems.push(`${rel} states "${m[0].trim()}" but the oracle receipt's cost ratio is ~${ratio}× (oracle-ab.json)`);
      }
    }
    if (comparisonSum > 0) {
      for (const m of text.matchAll(/(?:more than|[>~])\s*\*{0,2}([\d,]{4,}|\d{3}k)\*{0,2}\s*(?:deterministic\s+comparisons|comparisons|times)/gi)) {
        const stated = m[1].endsWith('k') ? Number(m[1].slice(0, -1)) * 1000 : Number(m[1].replace(/,/g, ''));
        if (Number.isFinite(stated) && stated > comparisonSum) problems.push(`${rel} claims "${m[0].trim()}" but the committed results sum to ${comparisonSum} comparisons/trials — the claim overstates its receipts`);
      }
    }
  }
  return problems;
}

/** Read-only consistency audit across the public-comms surface. */
export function checkConsistency(root) {
  const version = getVersion(root);
  const count = mcpToolCount(root);
  const problems = [];

  const plugin = JSON.parse(readText(join(root, '.claude-plugin', 'plugin.json')));
  if (plugin.version !== version) problems.push(`plugin.json version ${plugin.version} != package.json ${version}`);
  const advertised = (plugin.description.match(/(\d+)\s+MCP tools/) || [])[1];
  if (advertised && Number(advertised) !== count) problems.push(`plugin.json advertises ${advertised} tools; MCP server exposes ${count}`);

  // CHARTER.md "Done looks like" #2: the ratified job line is the one identity statement, read
  // from the charter itself, and it must appear on every public listing surface. Identity drift
  // fails the gate like a stale version string. (No CHARTER.md — e.g. test fixtures — no check.)
  const charterPath = join(root, 'CHARTER.md');
  if (existsSync(charterPath)) {
    const jobLine = (readText(charterPath).match(/\*\*"([^"]+)"\*\*/) || [])[1];
    if (!jobLine) {
      problems.push('CHARTER.md has no bolded, quoted job line to enforce');
    } else {
      const productPath = join(root, 'site', 'data', 'product.json');
      const surfaces = [
        ['README.md', existsSync(join(root, 'README.md')) ? readText(join(root, 'README.md')) : null],
        ['site/data/product.json (tagline)',
          existsSync(productPath) ? (JSON.parse(readText(productPath)).tagline || '') : null],
        ['package.json (description)', JSON.parse(readText(join(root, 'package.json'))).description || ''],
        ['.claude-plugin/plugin.json (description)', plugin.description || ''],
      ];
      for (const [label, text] of surfaces) {
        if (text !== null && !text.includes(jobLine)) {
          problems.push(`${label} is missing the charter job line "${jobLine}"`);
        }
      }
    }
  }

  const skill = readText(join(root, 'skills', 'codebase-anatomy', 'SKILL.md'));
  const skillVer = (skill.match(/^  version:\s*(.+)$/m) || [])[1];
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
    const productData = JSON.parse(readText(productPath));
    for (const c of productData.claims || []) {
      const m = /(\d+)\s*\/\s*(\d+)\s+tools/.exec(c.metric || '');
      if (m && (Number(m[1]) !== count || Number(m[2]) !== count)) {
        problems.push(`product.json claim "${c.claim}" metric says ${m[0]}; ${count} tools ship`);
      }
    }
    // The elevator carried "24 MCP query tools" for a release while 27 shipped: prose inside this
    // DATA file feeds site templates, but lived outside both the PROSE_FILES sweep (content files
    // only) and the structured checks above. Scan every string value, so a stale count anywhere
    // in the site data fails the gate like any other prose surface.
    const strings = [];
    (function walk(v) {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(productData);
    problems.push(...scanProseCounts(strings.join('\n'), 'site/data/product.json (prose)', { toolCount: count, langCount }));
  }

  // VER-F4: the values themselves, not just existence/counts (the C6 drift class).
  problems.push(...auditClaimValues(root));

  // VER-F7: the requirements companion (docs/requirements/*.yaml, digest-baselined 2026-07-29)
  // references SPEC ACs by id; a renumbered or dropped AC would silently orphan its trace
  // records. One-way by design: the YAML's references must exist in SPEC.md — the reverse
  // (new ACs needing trace records) is a re-baseline, which is the operator's requirements
  // process, not a gate rule.
  const reqYaml = join(root, 'docs', 'requirements', 'codeweb-product-requirements.yaml');
  const specPath = join(root, 'SPEC.md');
  if (existsSync(reqYaml) && existsSync(specPath)) {
    const spec = readText(specPath);
    const specIds = new Set([...spec.matchAll(/\*\*AC-(\d+)\*\*/g)].map((m) => m[1]));
    for (const m of readText(reqYaml).matchAll(/Acceptance criteria, AC-(\d+)/g)) {
      if (!specIds.has(m[1])) problems.push(`docs/requirements/codeweb-product-requirements.yaml traces AC-${m[1]}, which no longer exists in SPEC.md — re-baseline the companion`);
    }
  }

  // D6 / CHARTER C7: claim-bearing stdout strings are hoisted to lib/product-copy.mjs so this
  // gate can audit CLI output like any prose surface (the file also rides PROSE_FILES above).
  // The C7 regression class — a sponsorship cost premise — fails the build outright; wording for
  // that surface is ratified as "supports the project", never a cost story.
  const stdoutCopyPath = join(root, 'scripts', 'lib', 'product-copy.mjs');
  if (existsSync(stdoutCopyPath)) {
    const m = readText(stdoutCopyPath).match(/\b(?:pays?|paying|paid)\s+for\b|\bfund(?:s|ing|ed)?\b|\bbills?\b/i);
    if (m) problems.push(`scripts/lib/product-copy.mjs states a sponsorship cost premise ("${m[0]}") — CHARTER C7 ruled the class fabricated; no cost claims`);
  }
  // The same C7 class shipped again through surfaces this gate never read (the report/demo
  // footer tooltips, trend.mjs's rail, FUNDING.yml — found by the 2026-08-16 drift audit):
  // sweep every prose surface for sponsor-adjacent cost wording. Proximity-gated so unrelated
  // uses of "funds"/"bills" in ordinary prose can never false-positive.
  const costNear = /\bsponsor\w*\b[^\n]{0,80}\b(?:pays?|paying|paid|funds?|funding|funded|bills?)\b|\b(?:pays?|paying|paid|funds?|funding|funded|bills?)\b[^\n]{0,80}\bsponsor\w*\b/i;
  for (const rel of [...PROSE_FILES, '.github/FUNDING.yml', 'scripts/trend.mjs', 'scripts/lib/gate-md.mjs']) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    const m = readText(p).match(costNear);
    if (m) problems.push(`${rel} states a sponsorship cost premise ("${m[0].trim()}") — CHARTER C7 ruled the class fabricated; no cost claims`);
  }
  // D6's structural cause, closed the rest of the way: a numeric public claim inside any
  // script's string literal (outside product-copy.mjs) is invisible to the prose sweeps.
  // Zero instances existed at adoption (2026-08-16); this exists so the next one cannot ship.
  // Word-gated to the claim vocabulary so ordinary numeric formatting never trips it.
  const scriptsDir = join(root, 'scripts');
  if (existsSync(scriptsDir)) {
    const scriptFiles = [];
    for (const d of [scriptsDir, join(scriptsDir, 'lib')]) {
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d)) {
        if (f.endsWith('.mjs') && f !== 'product-copy.mjs') scriptFiles.push([`${d === scriptsDir ? 'scripts' : 'scripts/lib'}/${f}`, join(d, f)]);
      }
    }
    const litRe = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
    for (const [rel, p] of scriptFiles) {
      for (const m of readText(p).matchAll(litRe)) {
        const s = m[2];
        if (/\b\d+(?:\.\d+)?\s*[%×]/.test(s) && /caller|token|recall|benchmark|disagree|vs grep/i.test(s)) {
          problems.push(`${rel} hardcodes a numeric claim ("${s.slice(0, 60)}") outside product-copy.mjs — claim strings live where the gate looks (D6)`);
        }
      }
    }
  }

  // D1: the tool-interface manifest discipline. (a) A tool declared in BOTH lib/tool-specs.mjs
  // and mcp-server.mjs is the triplication coming back — the declaration drift behind the
  // recorded CLI↔MCP parity fix class. (b) Any codeweb_* name a prose surface uses must ship:
  // the docs-lying class (5c5d417) — the docs co-changed 0 of 13 times with the server, so this
  // coupling is enforced by the gate, not hoped for.
  const srvPath = join(root, 'scripts', 'mcp-server.mjs');
  const toolSpecsPath = join(root, 'scripts', 'lib', 'tool-specs.mjs');
  if (existsSync(srvPath) && existsSync(toolSpecsPath)) {
    const nameRe = /name:\s*'(codeweb_[a-z_]+)'/g;
    const srvNames = new Set([...readText(srvPath).matchAll(nameRe)].map((m) => m[1]));
    const specNames = new Set([...readText(toolSpecsPath).matchAll(nameRe)].map((m) => m[1]));
    for (const n of specNames) {
      if (srvNames.has(n)) problems.push(`${n} is declared in BOTH lib/tool-specs.mjs and mcp-server.mjs — one interface, one declaration (D1)`);
    }
    // (c) the reverse asymmetry (AGT-F7b): a spec without behavior throws at server startup,
    // but a TOOL_BEHAVIOR entry whose spec was removed is silently dead — gate it.
    const behaviorKeys = [...readText(srvPath).matchAll(/^  (codeweb_[a-z_]+): \(/gm)].map((m) => m[1]);
    for (const k of behaviorKeys) {
      if (!specNames.has(k) && !srvNames.has(k)) {
        problems.push(`${k} has a TOOL_BEHAVIOR entry but no lib/tool-specs.mjs declaration — dead behavior (D1)`);
      }
    }
    const shipped = new Set([...srvNames, ...specNames]);
    const flagged = new Set();
    for (const rel of PROSE_FILES) {
      const p = join(root, rel);
      if (!existsSync(p)) continue;
      for (const m of readText(p).matchAll(/\bcodeweb_[a-z_]+\b/g)) {
        const key = `${rel}:${m[0]}`;
        if (shipped.has(m[0]) || flagged.has(key)) continue;
        flagged.add(key);
        problems.push(`${rel} names ${m[0]}, which is not a shipped tool — docs must not outrun tools/list`);
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
