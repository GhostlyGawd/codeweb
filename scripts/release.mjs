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
import { getVersion, mcpToolCount, applySync, bumpVersion, rollChangelog, checkConsistency, readText, writeText } from './release-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const bumpLevel = (args.find((a) => ['--major', '--minor', '--patch'].includes(a)) || '').slice(2);
const explicit = (args.find((a) => a.startsWith('--version=')) || '').split('=')[1];
const today = new Date().toISOString().slice(0, 10);

const current = getVersion(ROOT);
const next = explicit || (bumpLevel ? bumpVersion(current, bumpLevel) : null);
if (!next) {
  process.stderr.write('usage: release.mjs (--major|--minor|--patch | --version=X.Y.Z) [--dry-run]\n');
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
