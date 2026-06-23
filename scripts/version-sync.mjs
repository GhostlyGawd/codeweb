#!/usr/bin/env node
/**
 * Propagate the canonical version (package.json) and the canonical MCP tool count
 * (scripts/mcp-server.mjs) out to every place they would otherwise drift:
 * the plugin manifest and the skill frontmatter. Run after bumping package.json.
 *
 *   node scripts/version-sync.mjs        (or: npm run version-sync)
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersion, mcpToolCount, applySync } from './release-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = getVersion(ROOT);
const count = mcpToolCount(ROOT);
const changed = applySync(ROOT, version, count);

process.stdout.write(`version-sync: v${version}, ${count} MCP tools.\n`);
process.stdout.write(changed.length ? `  updated: ${changed.join(', ')}\n` : '  all targets already in sync.\n');
