import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageRecord, summarizeReceipt, summarizeResult, boundedError } from '../scripts/lib/evidence-store.mjs';

const rid = 'a'.repeat(64), sid = 'b'.repeat(64);
const sample = () => ({ schemaVersion:1, task:'edit-1', baseline:{inventoryDigest:'c'.repeat(64)}, target:{id:'f:main',label:'main',file:'main.js',line:1,loc:2,kind:'function'}, relations:{callers:[],callees:[],impact:[]}, questions:[], analysis:{limitations:['unmapped-calls']} });
const size = obj => Buffer.byteLength(JSON.stringify(obj));

test('ac_32: historical pages reconstruct all identities with exact totals and bounded UTF-8 envelopes', () => {
  const record = sample();
  record.relations.callers = Array.from({length:160}, (_,i)=>({id:String(i).padStart(64,'0'),file:`src/${'日本語'.repeat(12)}${i}.js`,line:i+1,relatedId:`f:${i}`,witnessPath:[]}));
  const seen=[]; let offset=0;
  do {
    const page=pageRecord(record,{receiptId:rid,task:'edit-1',section:'callers',offset});
    assert.ok(size(page)<=8192); assert.equal(page.historical,true); assert.equal(page.total,160);
    seen.push(...page.items.map(x=>x.id));
    assert.equal(page.remaining,160-seen.length);
    assert.equal(page.nextOffset,page.remaining ? seen.length : null);
    if(page.nextOffset===null)break;
    assert.ok(page.nextOffset>offset); offset=page.nextOffset;
  } while(offset<160);
  assert.deepEqual(seen,record.relations.callers.map(x=>x.id));
});

test('oversized detail emits an explicit identity locator and advances exactly once', () => {
  const record=sample(); record.relations.callers=[{id:rid,relatedId:'huge',file:'x.js',line:7,witnessPath:[{evidence:'🙂'.repeat(10000)}]}];
  const page=pageRecord(record,{receiptId:rid,task:'edit-1',section:'callers'});
  assert.ok(size(page)<=8192); assert.equal(page.items[0].itemOmitted,true); assert.equal(page.items[0].id,rid);
  assert.equal(page.nextOffset,null); assert.equal(page.remaining,0);
});

test('pagination validates task, parent, section and offset without retargeting', () => {
  const record=sample();
  for(const offset of [-1,0.5,NaN,1]) assert.throws(()=>pageRecord(record,{receiptId:rid,task:'edit-1',section:'callers',offset}));
  assert.throws(()=>pageRecord(record,{receiptId:rid,task:'other',section:'callers'}),e=>e.code==='wrong-task');
  assert.throws(()=>pageRecord(record,{receiptId:rid,task:'edit-1',section:'added'}));
  const page=pageRecord(record,{receiptId:rid,task:'edit-1',section:'callers',offset:0});
  assert.deepEqual(page.items,[]); assert.equal(page.nextOffset,null);
  const result={...record,parentReceiptId:rid,current:{},state:'changed',deltas:{added:[],removed:[],witnessChanged:[]}};
  assert.throws(()=>pageRecord(result,{receiptId:sid,resultId:sid,task:'edit-1',section:'added'}),e=>e.code==='wrong-parent');
});

test('summaries omit oversized limitation detail with exact counts and never silently truncate target', () => {
  const record=sample();record.analysis.limitations=Array.from({length:300},(_,i)=>`limitation-${i}-${'x'.repeat(100)}`);
  const summary=summarizeReceipt(record,rid);
  assert.ok(size(summary)<=8192);assert.equal(summary.state,'captured');assert.equal(summary.metadataOmitted,true);
  assert.equal(summary.limitationCount,300);
  record.target.label='🫠'.repeat(4000);
  assert.throws(()=>summarizeReceipt(record,rid),e=>e.code==='summary-too-large');
});

test('result summaries preserve evidence state independently of any structural verdict', () => {
 const r={...sample(),parentReceiptId:rid,current:{},state:'inconclusive',reasons:['extraction-incomplete'],targetEvidenceChanged:false,inputsChanged:true,deltas:{added:[],removed:[],witnessChanged:[]},legacyReviewGraph:{digest:rid,profile:'loaded'},sameGraphAsEvidence:false};
 const s=summarizeResult(r,rid,sid);assert.equal(s.state,'inconclusive');assert.equal(s.resultId,sid);assert.ok(size(s)<=8192);
});

test('errors never echo attacker-controlled messages or oversized context', () => {
 const out=boundedError(Object.assign(new Error('secret '+ 'x'.repeat(20000)),{code:'../../evil'}),{task:'x'.repeat(10000),receiptId:'../escape',target:'SECRET'});
 assert.ok(size(out)<=8192);assert.ok(!JSON.stringify(out).includes('secret'));assert.ok(!JSON.stringify(out).includes('../'));
});

import { putRecord, readRecord, RECORD_LIMIT, STORE_LIMIT } from '../scripts/lib/evidence-store.mjs';
import { createReceipt, reconcileReceipt, hash, canonicalJSON } from '../scripts/lib/evidence-core.mjs';

async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'codeweb-evidence-store-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const graphPath=join(root,'.codeweb','graph.json');await fs.mkdir(join(root,'.codeweb'));
  const graph={nodes:[{id:'a',label:'a',file:'a.js',line:1,loc:1,kind:'function',exports:false}],edges:[],meta:{}};
  await fs.writeFile(join(root,'a.js'),'function a() {}\n');await fs.writeFile(graphPath,JSON.stringify(graph));
  const analyzerIdentity={profile:'native-regex-snapshot-v1',nodeVersion:process.version,runtimeDigest:'a'.repeat(64),discoveryDigest:'b'.repeat(64),engine:'regex',ctags:false,ast:false,relationVersion:1,projectionVersion:1,schemaVersion:1};
  const snapshot={root,graph,profile:'native-regex-snapshot-v1',sourceHashes:{'a.js':'c'.repeat(64)},inventoryDigest:'d'.repeat(64),optionsDigest:'e'.repeat(64),analyzerIdentity};
  const record=createReceipt(snapshot,{task:'edit-1',symbol:'a',graphRelativePath:'.codeweb/graph.json'});
  return {root,graphPath,record,snapshot,base:join(root,'.codeweb','evidence','v1')};
}

test('content-addressed capture round trips, reuses identical bytes and never modifies map', async t => {
  const f=await fixture(t), before=await fs.readFile(f.graphPath);
  const id=await putRecord(f.graphPath,'receipts',f.record);
  assert.equal(id,hash(f.record));
  const file=join(f.base,'receipts',`${id}.json`), stat=await fs.stat(file);
  assert.equal(await fs.readFile(file,'utf8'),canonicalJSON(f.record));
  assert.deepEqual(await readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root}),f.record);
  assert.equal(await putRecord(f.graphPath,'receipts',f.record),id);
  assert.equal((await fs.stat(file)).mtimeMs,stat.mtimeMs);
  assert.deepEqual(await fs.readFile(f.graphPath),before);
  assert.deepEqual(await fs.readdir(join(f.base,'receipts')),[`${id}.json`]);
  assert.ok(!(await fs.readdir(f.base)).includes('.lock'));
  if(process.platform!=='win32')assert.equal(stat.mode&0o777,0o600);
});

test('reader rejects wrong task/root, tampering, deleted pages and ID traversal', async t => {
  const f=await fixture(t), id=await putRecord(f.graphPath,'receipts',f.record);
  await assert.rejects(readRecord(f.graphPath,'receipts',id,{task:'other',root:f.root}),e=>e.code==='wrong-task');
  await assert.rejects(readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:join(f.root,'.codeweb')}),e=>e.code==='wrong-workspace');
  await assert.rejects(readRecord(f.graphPath,'receipts','../graph',{task:'edit-1',root:f.root}),e=>e.code==='invalid-arguments');
  const file=join(f.base,'receipts',`${id}.json`), text=await fs.readFile(file,'utf8');
  await fs.writeFile(file,text.replace('edit-1','edit-2'));
  await assert.rejects(readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root}),e=>e.code==='corrupt');
  await fs.unlink(file);
  await assert.rejects(readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root}),e=>e.code==='missing');
});

test('symlink record and every evidence-directory component are rejected', async t => {
  const f=await fixture(t),id=await putRecord(f.graphPath,'receipts',f.record), file=join(f.base,'receipts',`${id}.json`);
  const outside=join(f.root,'outside.json');await fs.rename(file,outside);await fs.symlink(outside,file);
  await assert.rejects(readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root}),e=>e.code==='invalid-path');
  await assert.rejects(putRecord(f.graphPath,'receipts',f.record),e=>e.code==='invalid-path');
  await fs.unlink(file);
  for(const dir of [join(f.base,'receipts'),f.base,join(f.root,'.codeweb','evidence')]) {
    const held=dir+'.held';await fs.rename(dir,held);await fs.symlink(held,dir);
    await assert.rejects(putRecord(f.graphPath,'receipts',f.record),e=>e.code==='invalid-path');
    await fs.unlink(dir);await fs.rename(held,dir);
  }
  assert.equal(await fs.readFile(outside,'utf8'),canonicalJSON(f.record));
});

test('a held lock fails in a bounded interval and is not automatically removed', async t => {
  const f=await fixture(t);await fs.mkdir(join(f.base,'receipts'),{recursive:true});
  await fs.writeFile(join(f.base,'.lock'),'owner');const start=performance.now();
  await assert.rejects(putRecord(f.graphPath,'receipts',f.record),e=>e.code==='store-busy');
  assert.ok(performance.now()-start<1600);
  assert.equal(await fs.readFile(join(f.base,'.lock'),'utf8'),'owner');
  assert.deepEqual(await fs.readdir(join(f.base,'receipts')),[]);
});

test('corrupt regular JSON counts toward store cap, identical records reuse at cap', async t => {
  const f=await fixture(t), id=await putRecord(f.graphPath,'receipts',f.record);
  const filler=await fs.open(join(f.base,'results','corrupt.json'),'w');await filler.truncate(STORE_LIMIT);await filler.close();
  assert.equal(await putRecord(f.graphPath,'receipts',f.record),id);
  const changed=structuredClone(f.record);changed.task='another';
  await assert.rejects(putRecord(f.graphPath,'receipts',changed),e=>e.code==='store-full');
  assert.ok(!(await fs.readdir(f.base)).includes('.lock'));
  assert.deepEqual(await fs.readdir(join(f.base,'receipts')),[`${id}.json`]);
});

test('record and target-summary caps reject before publication; oversized reads reject before parsing', async t => {
  const f=await fixture(t), huge=structuredClone(f.record);
  huge.analysis.limitations.push('x'.repeat(RECORD_LIMIT));
  await assert.rejects(putRecord(f.graphPath,'receipts',huge),e=>e.code==='record-too-large');
  const wide=structuredClone(f.record);wide.target.label='🙂'.repeat(3000);
  await assert.rejects(putRecord(f.graphPath,'receipts',wide),e=>e.code==='summary-too-large');
  const id=await putRecord(f.graphPath,'receipts',f.record), file=await fs.open(join(f.base,'receipts',`${id}.json`),'w');
  await file.truncate(RECORD_LIMIT+1);await file.close();
  await assert.rejects(readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root}),e=>e.code==='record-too-large');
});

test('concurrent identical writers publish only one complete record and release temporary state', async t => {
  const f=await fixture(t);
  const ids=await Promise.all(Array.from({length:8},()=>putRecord(f.graphPath,'receipts',f.record)));
  assert.equal(new Set(ids).size,1);assert.deepEqual(await fs.readdir(join(f.base,'receipts')),[`${ids[0]}.json`]);
  assert.ok(!(await fs.readdir(f.base)).includes('.lock'));
  assert.deepEqual(await readRecord(f.graphPath,'receipts',ids[0],{task:'edit-1',root:f.root}),f.record);
});

test('schema extensions are never accepted even with a recomputed content ID', async t => {
 const f=await fixture(t), id=await putRecord(f.graphPath,'receipts',f.record), poison=structuredClone(f.record);poison.target.execute='unsafe';
 const badId=hash(poison);await fs.writeFile(join(f.base,'receipts',`${badId}.json`),canonicalJSON(poison));
 await assert.rejects(readRecord(f.graphPath,'receipts',badId,{task:'edit-1',root:f.root}),e=>e.code==='corrupt');
 await assert.rejects(putRecord(f.graphPath,'receipts',poison));assert.ok(id);
});

test('result records require an existing task-owned parent and reads require the exact supplied parent', async t => {
 const f=await fixture(t), result=reconcileReceipt(f.record,f.snapshot);
 await assert.rejects(putRecord(f.graphPath,'results',result),e=>e.code==='missing');
 const receiptId=await putRecord(f.graphPath,'receipts',f.record);
 const resultId=await putRecord(f.graphPath,'results',result);
 assert.deepEqual(await readRecord(f.graphPath,'results',resultId,{task:'edit-1',root:f.root,receiptId}),result);
 await assert.rejects(readRecord(f.graphPath,'results',resultId,{task:'edit-1',root:f.root,receiptId:rid}),e=>e.code==='wrong-parent');
 const wrong=structuredClone(result);wrong.task='other';
 await assert.rejects(putRecord(f.graphPath,'results',wrong),e=>e.code==='wrong-task');
 const page=pageRecord(result,{receiptId,resultId,task:'edit-1',section:'added'});
 assert.deepEqual(page.items,[]);assert.equal(page.historical,true);
});

test('historical pages remain identical after source removal and cannot migrate to another graph path', async t => {
 const f=await fixture(t),id=await putRecord(f.graphPath,'receipts',f.record);
 const original=pageRecord(f.record,{receiptId:id,task:'edit-1',section:'callers'});
 await fs.unlink(join(f.root,'a.js'));
 const reread=await readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root});
 assert.deepEqual(pageRecord(reread,{receiptId:id,task:'edit-1',section:'callers'}),original);
 await fs.writeFile(join(f.root,'.codeweb','other.json'),'{}');
 await assert.rejects(readRecord(join(f.root,'.codeweb','other.json'),'receipts',id,{task:'edit-1',root:f.root}),e=>e.code==='wrong-workspace');
});

test('incomplete crash temp files are not pages and lock symlinks are rejected', async t => {
 const f=await fixture(t);await fs.mkdir(join(f.base,'receipts'),{recursive:true});
 await fs.writeFile(join(f.base,'receipts',`.${rid}.crash.tmp`),'{');
 await assert.rejects(readRecord(f.graphPath,'receipts',rid,{task:'edit-1',root:f.root}),e=>e.code==='missing');
 const outside=join(f.root,'lock-target');await fs.writeFile(outside,'untouched');await fs.symlink(outside,join(f.base,'.lock'));
 await assert.rejects(putRecord(f.graphPath,'receipts',f.record),e=>e.code==='invalid-path');
 assert.equal(await fs.readFile(outside,'utf8'),'untouched');
});

test('concurrent different writers account for the exact store cap without partial publication', async t => {
 const f=await fixture(t);await fs.mkdir(join(f.base,'receipts'),{recursive:true});
 const fill=await fs.open(join(f.base,'corrupt.json'),'w');await fill.truncate(STORE_LIMIT-Buffer.byteLength(canonicalJSON(f.record)));await fill.close();
 const other=structuredClone(f.record);other.task='edit-2';
 const results=await Promise.allSettled([putRecord(f.graphPath,'receipts',f.record),putRecord(f.graphPath,'receipts',other)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'store-full');
 const names=await fs.readdir(join(f.base,'receipts'));assert.equal(names.length,1);assert.ok(names[0].endsWith('.json'));
 assert.ok(!(await fs.readdir(f.base)).includes('.lock'));
});

test('real schema high-degree records survive storage and reconstruct full paged memberships', async t => {
 const f=await fixture(t),snapshot=structuredClone(f.snapshot);
 for(let i=0;i<100;i++) {
   const id=`caller-${i}`,file=`${id}.js`;await fs.writeFile(join(f.root,file),`function c${i}(){a()}\n`);
   snapshot.graph.nodes.push({id,label:id,file,line:1,loc:1,kind:'function',exports:false});snapshot.graph.edges.push({from:id,to:'a',kind:'call'});snapshot.sourceHashes[file]=hash(file);
 }
 const record=createReceipt(snapshot,{task:'edit-1',symbol:'a',graphRelativePath:'.codeweb/graph.json'}),id=await putRecord(f.graphPath,'receipts',record);
 const loaded=await readRecord(f.graphPath,'receipts',id,{task:'edit-1',root:f.root});
 for(const section of ['callers','callees','impact','questions']) {
   const seen=[];let offset=0;
   do {const page=pageRecord(loaded,{receiptId:id,task:'edit-1',section,offset});assert.ok(size(page)<=8192);seen.push(...page.items.map(x=>x.id));offset=page.nextOffset;}while(offset!==null);
   assert.deepEqual(seen,(section==='questions'?record.questions:record.relations[section]).map(x=>x.id));
 }
});
