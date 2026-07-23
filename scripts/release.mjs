#!/usr/bin/env node
/**
 * codeweb release prep — updates the whole file ecosystem in one motion, then
 * stops and hands the gated git steps (commit, tag, push, GitHub release) to you.
 *
 *   node scripts/release.mjs --minor            # 0.2.0 -> 0.3.0
 *   node scripts/release.mjs --version=1.0.0
 *   node scripts/release.mjs --minor --dry-run  # show the plan, change nothing
 *
 * What it does (non-dry): bump package.json -> roll CHANGELOG [Unreleased] into a
 * dated version section -> version-sync plugin.json + SKILL.md -> rebuild the site
 * -> re-check consistency. It never runs git; it prints the exact commands to finish.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { die, parseArgs } from './lib/cli.mjs';
import { getVersion, mcpToolCount, applySync, bumpVersion, rollChangelog, checkConsistency, readText, writeText } from './release-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// FORMS F7: the last hand-rolled parser, on the one form where a typo is destructive — a
// `--dryrun` typo used to run the REAL prep, and `--version=banana` shipped "banana" toward
// package.json/plugin.json/SKILL.md. The house parser (unknown-flag death, --help) + a semver
// check close both. `--version=X.Y.Z` (the historically documented form) normalizes first.
const USAGE = 'usage: release.mjs (--major | --minor | --patch | --version X.Y.Z) [--dry-run]';
const argv = process.argv.slice(2).flatMap((a) => (a.startsWith('--version=') ? ['--version', a.slice('--version='.length)] : [a]));
const { opts, pos } = parseArgs(argv, {
  usage: USAGE,
  flags: {
    major: { type: 'bool', default: false },
    minor: { type: 'bool', default: false },
    patch: { type: 'bool', default: false },
    version: { type: 'string', default: null },
    'dry-run': { type: 'bool', default: false },
  },
});
if (pos.length) die(`unexpected argument: ${pos[0]}\n${USAGE}`, 2);
const dry = opts['dry-run'];
const bumpLevel = ['major', 'minor', 'patch'].find((k) => opts[k]) || '';
const explicit = opts.version;
if (explicit != null && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(explicit)) {
  die(`--version must be semver X.Y.Z (got "${explicit}")\n${USAGE}`, 2);
}
const modes = ['major', 'minor', 'patch'].filter((k) => opts[k]).length + (explicit != null ? 1 : 0);
if (modes > 1) die(`pass exactly one of --major | --minor | --patch | --version\n${USAGE}`, 2);
const today = new Date().toISOString().slice(0, 10);

const current = getVersion(ROOT);
const next = explicit || (bumpLevel ? bumpVersion(current, bumpLevel) : null);
if (!next) {
  process.stderr.write(USAGE + '\n');
  process.exit(2);
}
const count = mcpToolCount(ROOT);

console.log(`codeweb release: ${current} -> ${next}  (${count} MCP tools)${dry ? '  [dry-run]' : ''}`);
['bump package.json',
 `roll CHANGELOG.md: [Unreleased] -> [${next}] - ${today}`,
 'version-sync plugin.json + SKILL.md',
 'rebuild site (node site/build.mjs)'].forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

if (dry) {
  try {
    const preview = rollChangelog(readText(join(ROOT, 'CHANGELOG.md')), next, today).split('\n').slice(0, 16).join('\n');
    console.log('\n--- CHANGELOG preview ---\n' + preview);
  } catch (e) { console.log(`  (changelog: ${e.message})`); }
  console.log('\nDry run — no files changed.');
  process.exit(0);
}

const pkgPath = join(ROOT, 'package.json');
writeText(pkgPath, readText(pkgPath).replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
writeText(join(ROOT, 'CHANGELOG.md'), rollChangelog(readText(join(ROOT, 'CHANGELOG.md')), next, today));
const changed = applySync(ROOT, next, count);
execFileSync(process.execPath, [join(ROOT, 'site', 'build.mjs')], { stdio: 'inherit' });

const audit = checkConsistency(ROOT);
console.log(`\nupdated: package.json, CHANGELOG.md, ${changed.join(', ')}, docs/`);
console.log(audit.ok ? 'consistency: OK' : `consistency: ${audit.problems.length} problem(s) — ${audit.problems.join('; ')}`);
// Round 2, finding #7: a failed audit must fail the prep — exit BEFORE the gated git commands
// print (files are already written; exit 1 says "do not commit", matching the printed problems).
if (!audit.ok) process.exit(1);
console.log('\nNext (gated — run when ready):');
console.log(`  git add -A && git commit -m "release: v${next}"`);
console.log(`  git tag -a v${next} -m "codeweb v${next}"`);
console.log('  git push origin main --tags');
console.log(`  gh release create v${next} --title "codeweb v${next}" --notes-from-tag`);
