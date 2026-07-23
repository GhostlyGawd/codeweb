#!/usr/bin/env node
// codeweb-mcp bin — same old-syntax Node guard as bin/codeweb.mjs. The server main-guards on
// being the invoked script, so the shim announces itself via CODEWEB_BIN before importing.
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error('codeweb-mcp needs Node >= 22 (you have ' + process.version + '). Install the current LTS: https://nodejs.org');
  process.exit(1);
}
process.env.CODEWEB_BIN = '1';
import('../scripts/mcp-server.mjs');
