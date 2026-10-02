import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {TOOL_SPECS,QUERY_TOOL_SPECS} from '../scripts/lib/tool-specs.mjs';

test('ac_40 packaged coding skill resolves live MCP operations and ships with the analysis runtime',()=>{
  const skill=readFileSync(new URL('../skills/codeweb/SKILL.md',import.meta.url),'utf8');
  const declared=new Set([...TOOL_SPECS,...QUERY_TOOL_SPECS].map(t=>t.name));
  for(const tool of new Set(skill.match(/codeweb_[a-z_]+/g))) assert.ok(declared.has(tool),`undocumented tool ${tool}`);
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  assert.ok(skill.includes(`  version: ${pkg.version}`),'skill metadata must match the packaged runtime');
  const cmd=process.platform==='win32'?'npm.cmd':'npm';
  const packed=spawnSync(cmd,['pack','--dry-run','--json'],{encoding:'utf8',shell:process.platform==='win32',maxBuffer:4<<20});
  assert.equal(packed.status,0,packed.stderr);
  const files=new Set(JSON.parse(packed.stdout)[0].files.map(f=>f.path));
  for(const path of ['skills/codeweb/SKILL.md','skills/codebase-anatomy/SKILL.md','scripts/mcp-server.mjs','scripts/lib/lexical-bindings.mjs','bin/codeweb-mcp.mjs','.codex-plugin/plugin.json','.mcp.json'])assert.ok(files.has(path),path);
  const manifest=JSON.parse(readFileSync(new URL('../.codex-plugin/plugin.json',import.meta.url)));
  assert.equal(manifest.version,pkg.version);assert.equal(manifest.mcpServers,'./.mcp.json');
  const mcp=JSON.parse(readFileSync(new URL('../.mcp.json',import.meta.url)));
  assert.equal(mcp.mcpServers.codeweb.command,'node');
  assert.ok(mcp.mcpServers.codeweb.args[0].endsWith('/scripts/mcp-server.mjs'));
});
