#!/usr/bin/env node
// codeweb serve — a zero-dependency static server for ONE workspace directory, localhost only.
// Some browsers hobble file:// pages (clipboard, hash routing quirks); `--serve` gives the
// report a real origin without any dependency or network exposure. Binds 127.0.0.1 ONLY, never
// 0.0.0.0; path traversal is rejected by resolve+prefix check; nothing is ever written.
//
// Usage: node serve.mjs [<dir>] [--port N] [--quiet]   (dir default: ./.codeweb; port 0 = ephemeral)
// Exit: runs until interrupted; 2 on usage/IO.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';

const USAGE = 'usage: serve.mjs [<dir>] [--port N] [--quiet]   (serves one workspace dir on 127.0.0.1)';
import { die, parseArgs } from './lib/cli.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { port: { type: 'number', default: 8420, min: 0 }, quiet: { type: 'bool', default: false } },
});
const root = resolve(pos[0] || '.codeweb');
if (!existsSync(root) || !statSync(root).isDirectory()) die(`not a directory: ${root}\n${USAGE}`, 2);

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const target = resolve(root, '.' + (path.endsWith('/') ? path + 'report.html' : path));
    // traversal guard: the resolved target must stay INSIDE the served root
    if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403); res.end('forbidden'); return; }
    if (!existsSync(target) || statSync(target).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  } catch { res.writeHead(500); res.end('error'); }
});
server.listen(opts.port, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`[codeweb] serving ${root} at http://127.0.0.1:${port}/report.html  (Ctrl-C to stop)`);
});
