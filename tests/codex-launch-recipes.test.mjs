import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clientRecipes,inspectClientConfig} from '../scripts/lib/client-setup.mjs';

const codex=clientRecipes.find(r=>r.id==='codex');
test('ac_39 Codex doctor recognizes an installed binary without requiring optional args',()=>{
  for(const command of ['codeweb-mcp','/opt/tools/codeweb-mcp','C:\\tools\\codeweb-mcp.cmd']) {
    const config=`[mcp_servers.codeweb]\ncommand = ${JSON.stringify(command)}\n`;
    const result=inspectClientConfig(codex,config);
    assert.equal(result.status,'pass');assert.match(result.message,/unverified/);
  }
});
test('ac_39 Codex doctor distinguishes disabled, foreign and ambiguous launch recipes without exposing values',()=>{
  const disabled=inspectClientConfig(codex,'[mcp_servers.codeweb]\ncommand = "codeweb-mcp"\nenabled = false\n');
  assert.equal(disabled.status,'fail');
  const unknown=inspectClientConfig(codex,'[mcp_servers.codeweb]\ncommand = "PRIVATE_VALUE"\nargs = ["SECRET_VALUE"]\n');
  assert.equal(unknown.status,'fail');assert.doesNotMatch(JSON.stringify(unknown),/PRIVATE_VALUE|SECRET_VALUE/);
  assert.equal(inspectClientConfig(codex,'[mcp_servers.codeweb]\ncommand = "codeweb-mcp"\ncommand = "codeweb-mcp"\n').status,'unknown');
});

test('ac_39 Codex doctor recognizes explicit plugin enablement and honors server disablement',()=>{
  const enabled='[plugins."codeweb@codeweb"]\nenabled = true\n';
  const good=inspectClientConfig(codex,enabled);assert.equal(good.status,'pass');assert.match(good.message,/unverified/);
  assert.equal(inspectClientConfig(codex,enabled+'[plugins."codeweb@codeweb".mcp_servers.codeweb]\nenabled = false\n').status,'fail');
  assert.equal(inspectClientConfig(codex,enabled.replace('true','false')).status,'fail');
});
