import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = (f) => resolve('scripts', f);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cw-evidence-transport-'));
  t.after(() => rmSync(root, { recursive:true, force:true }));
  const ws = join(root,'.codeweb'); mkdirSync(ws);
  writeFileSync(join(root,'a.js'), 'export function target(x) {\n  return x + 1;\n}\nexport function caller() {\n  return target(1);\n}\n');
  const graph = join(ws,'graph.json');
  writeFileSync(graph, JSON.stringify({meta:{root},nodes:[],edges:[],domains:[],overlaps:[]}));
  return {root,ws,graph};
}
function cli(f,args,cwd) {
  const p = spawnSync(process.execPath,[script(f),...args,'--json'],{encoding:'utf8',cwd,maxBuffer:8<<20});
  assert.ifError(p.error);
  return { ...p, data: p.stdout.trim() ? JSON.parse(p.stdout) : null };
}
function mcp(f,name,args) {
  const p = spawnSync(process.execPath,[script('mcp-server.mjs')],{encoding:'utf8',cwd:f.root,maxBuffer:8<<20,
    env:{...process.env,CODEWEB_MCP_TRACE:'1'}, input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{graph:f.graph,...args}}})+'\n'});
  assert.ifError(p.error);
  const res=JSON.parse(p.stdout.trim()).result;
  return {res,data:JSON.parse(res.content[0].text),stderr:p.stderr};
}
const capture = (f,task='task1') => cli('context-pack.mjs',[f.graph,'target','--capture-evidence','--task',task],f.root);

test('ac_33: CLI/MCP capture parity bypasses empty cached graph and auto-refresh',t=>{
  const f=fixture(t), before=readFileSync(f.graph,'utf8');
  const c=capture(f); assert.equal(c.status,0,c.stderr); assert.equal(c.data.state,'captured');
  assert.equal(Buffer.byteLength(JSON.stringify(c.data))<=8192,true);
  const m=mcp(f,'codeweb_context',{symbol:'target',captureEvidence:true,task:'task1'});
  assert.equal(m.res.isError,undefined); assert.deepEqual(m.data,c.data);
  assert.equal(readFileSync(f.graph,'utf8'),before);
  assert.doesNotMatch(m.stderr,/"tool":"codeweb_refresh"/);
});

test('ac_33: clean review still reconciles new caller; historical pages never refresh',t=>{
  const f=fixture(t), c=capture(f); assert.equal(c.status,0,c.stderr);
  const before=readFileSync(f.graph,'utf8');
  writeFileSync(join(f.root,'b.js'),'import { target } from "./a.js";\nexport function newCaller() {\n return target(2);\n}\n');
  const legacy=cli('review.mjs',[f.graph,'--changed','a.js'],f.root);
  const r=cli('review.mjs',[f.graph,'--changed','a.js','--receipt',c.data.receiptId,'--task','task1'],f.root);
  assert.equal(r.status,legacy.status,r.stderr); assert.deepEqual(r.data.verdict,legacy.data.verdict);
  assert.equal(r.data.evidence.state,'changed'); assert.ok(r.data.evidence.resultId);
  assert.equal(r.data.evidence.sameGraphAsEvidence,false);
  const m=mcp(f,'codeweb_review',{changed:'a.js',evidenceReceipt:c.data.receiptId,task:'task1'});
  assert.deepEqual(m.data,r.data);
  const page=mcp(f,'codeweb_context',{symbol:'target',evidenceReceipt:c.data.receiptId,evidenceResult:r.data.evidence.resultId,task:'task1',evidenceSection:'added'});
  assert.equal(page.data.historical,true); assert.ok(page.data.total>0); assert.equal(page.data.stale,undefined);
  assert.equal(readFileSync(f.graph,'utf8'),before);
  assert.equal(existsSync(join(f.ws,'graph.baseline.json')),false);
});

test('ac_33: explicit tasks isolate evidence and do not change old gate result on receipt failure',t=>{
  const f=fixture(t); const c=capture(f); assert.equal(c.status,0,c.stderr);
  const legacy=cli('review.mjs',[f.graph,'--changed','a.js','--gate'],f.root);
  const r=cli('review.mjs',[f.graph,'--changed','a.js','--gate','--receipt',c.data.receiptId,'--task','other'],f.root);
  assert.equal(r.status,legacy.status); assert.deepEqual(r.data.verdict,legacy.data.verdict);
  assert.equal(r.data.evidence.state,'unavailable');
  const bad=mcp(f,'codeweb_context',{symbol:'target',evidenceReceipt:c.data.receiptId,task:'other',evidenceSection:'callers'});
  assert.equal(bad.res.isError,true);
});

test('ac_33: invalid mode combinations fail before evidence artifact writes',t=>{
  const f=fixture(t);
  for(const args of [
    [f.graph,'target','--capture-evidence'],
    [f.graph,'target','--capture-evidence=false','--task','task1'],
    [f.graph,'target','--capture-evidence','--task','task1','--limit','1'],
    [f.graph,'target','--receipt','0'.repeat(64),'--task','task1','--section','callers','--offset','0.5'],
    [f.graph,'target','--task','task1']
  ]) {const p=cli('context-pack.mjs',args,f.root);assert.equal(p.status,2,p.stderr);}
  assert.equal(existsSync(join(f.ws,'evidence')),false);
});

test('ac_33: target misses are bounded found:false results; evidence flags are advertised',t=>{
  const f=fixture(t);
  const p=cli('context-pack.mjs',[f.graph,'absent','--capture-evidence','--task','task1'],f.root);
  assert.equal(p.status,1,p.stderr);assert.equal(p.data.found,false);
  const m=mcp(f,'codeweb_context',{symbol:'absent',captureEvidence:true,task:'task1'});
  assert.equal(m.res.isError,undefined);assert.deepEqual(m.data,p.data);
});

test('ac_33: failing legacy gate and explicit before identity survive unavailable evidence',t=>{
  const f=fixture(t);
  writeFileSync(join(f.root,'b.js'),'function second() {\n return 2;\n}\n');
  const nodes=[{id:'a.js:target',label:'target',file:'a.js',line:1,loc:3,kind:'function',exports:false},{id:'b.js:second',label:'second',file:'b.js',line:1,loc:3,kind:'function',exports:false}];
  const base={meta:{root:f.root},nodes,edges:[{from:nodes[0].id,to:nodes[1].id,kind:'call'}],domains:[],overlaps:[]};
  const before=join(f.ws,'graph.baseline.json');writeFileSync(before,JSON.stringify(base));
  writeFileSync(f.graph,JSON.stringify({...base,edges:[...base.edges,{from:nodes[1].id,to:nodes[0].id,kind:'call'}]}));
  const args=[f.graph,'--changed','a.js','--before',before,'--gate'];
  const old=cli('review.mjs',args,f.root), bad=cli('review.mjs',[...args,'--receipt','0'.repeat(64),'--task','task1'],f.root);
  assert.equal(old.status,1,old.stderr);assert.equal(bad.status,1,bad.stderr);
  assert.deepEqual(bad.data.verdict,old.data.verdict);assert.equal(bad.data.evidence.state,'unavailable');
  const c=capture(f);assert.equal(c.status,0,JSON.stringify(c.data));
  const good=cli('review.mjs',[...args,'--receipt',c.data.receiptId,'--task','task1'],f.root);
  assert.equal(good.status,1);assert.equal(good.data.evidence.legacyReviewBefore.path,before);
  assert.match(good.data.evidence.legacyReviewBefore.digest,/^[a-f0-9]{64}$/);
  assert.equal(readFileSync(before,'utf8'),JSON.stringify(base));
});

test('ac_33: ambiguous selectors return bounded candidate IDs without a receipt',t=>{
  const f=fixture(t);writeFileSync(join(f.root,'b.js'),'export function target(x) {\n return x;\n}\n');
  const c=capture(f);assert.equal(c.status,2);assert.equal(c.data.code,'ambiguous-target');
  assert.equal(c.data.matchedCount,2);assert.equal(c.data.suggestions.length,2);
  assert.ok(Buffer.byteLength(JSON.stringify(c.data))<=8192);
  assert.equal(existsSync(join(f.ws,'evidence')),false);
});

test('ac_33: saved graph provenance, historical target removal and text states stay explicit',t=>{
  const f=fixture(t);const graph=JSON.parse(readFileSync(f.graph));graph.meta.engine={name:'agent',model:'fixture'};writeFileSync(f.graph,JSON.stringify(graph));
  for(const name of ['graph.baseline.json','graph.prev.json','hook-baseline.json'])writeFileSync(join(f.ws,name),'sentinel');
  const c=capture(f);assert.equal(c.status,0,JSON.stringify(c.data));assert.deepEqual(c.data.savedGraphProvenance.engine,graph.meta.engine);
  rmSync(join(f.root,'a.js'));
  const page=mcp(f,'codeweb_context',{symbol:'target',evidenceReceipt:c.data.receiptId,task:'task1',evidenceSection:'callers'});
  assert.equal(page.data.historical,true);assert.equal(page.data.total,1);
  const r=cli('review.mjs',[f.graph,'--changed','a.js','--receipt',c.data.receiptId,'--task','task1'],f.root);
  assert.equal(r.data.evidence.state,'inconclusive');assert.ok(r.data.evidence.reasons.includes('target-unresolved'));
  for(const name of ['graph.baseline.json','graph.prev.json','hook-baseline.json'])assert.equal(readFileSync(join(f.ws,name),'utf8'),'sentinel');
});

test('ac_33: store-full review preserves computed counts without promising result pages',t=>{
  const f=fixture(t), c=capture(f);assert.equal(c.status,0,JSON.stringify(c.data));
  const base=join(f.ws,'evidence','v1');
  // Sparse corrupt JSON still consumes the store's declared byte quota.
  const filler=join(base,'receipts','quota.json');writeFileSync(filler,'x');
  const fill=spawnSync(process.execPath,['-e','require("node:fs").truncateSync(process.argv[1],32*1024*1024)',filler]);assert.equal(fill.status,0);
  writeFileSync(join(f.root,'b.js'),'import { target } from "./a.js";\nexport function added() {\n return target(2);\n}\n');
  const r=cli('review.mjs',[f.graph,'--changed','a.js','--receipt',c.data.receiptId,'--task','task1'],f.root);
  assert.equal(r.status,0,r.stderr);const e=r.data.evidence;
  assert.equal(e.state,'unavailable');assert.equal(e.code,'store-full');assert.equal(e.persistence,'not-persisted');
  assert.equal(e.computedState,'changed');assert.ok(e.computedSummary.deltas.added>0);
  assert.equal(e.resultId,undefined);assert.equal(e.sections,undefined);assert.ok(Buffer.byteLength(JSON.stringify(e))<=8192);
});


test('ac_33: graph-file aliases retain locator identity without following stored record paths',t=>{
  const f=fixture(t), alias=join(f.ws,'alias.json');
  symlinkSync(f.graph,alias);
  const aliased={...f,graph:alias};const c=capture(aliased);
  assert.equal(c.status,0,JSON.stringify(c.data));
  const p=cli('context-pack.mjs',[alias,'target','--receipt',c.data.receiptId,'--task','task1','--section','callers'],f.root);
  assert.equal(p.status,0,JSON.stringify(p.data));assert.equal(p.data.historical,true);
  const wrong=cli('context-pack.mjs',[f.graph,'target','--receipt',c.data.receiptId,'--task','task1','--section','callers'],f.root);
  assert.equal(wrong.status,2);assert.equal(wrong.data.code,'wrong-workspace');
});
