import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSON, hash, tupleHash, projectGraph, createReceipt, reconcileReceipt, validateRecord } from '../scripts/lib/evidence-core.mjs';
const sha = (x) => hash(x);
const node = (id, extras = {}) => ({ id, label:id, file:`${id}.js`, line:1, loc:2, kind:'function', exports:false, ...extras });
const edge = (from,to,kind='call') => ({from,to,kind});
function snapshot(nodes=[node('a'),node('b'),node('c')],edges=[edge('b','a'),edge('c','b')]) {
 return { root:'/tmp/evidence-core', graph:{meta:{},nodes,edges}, sourceHashes:Object.fromEntries(nodes.map(n=>[n.file,sha(n.file)])), inventoryDigest:sha('inventory'), analyzerIdentity:{profile:'native-regex-snapshot-v1',nodeVersion:'v22',runtimeDigest:sha('runtime'),discoveryDigest:sha('discovery'),engine:'regex',ctags:false,ast:false,relationVersion:1,projectionVersion:1,schemaVersion:1}, optionsDigest:sha('options'),profile:'native-regex-snapshot-v1' };
}
const capture = s => createReceipt(s,{task:'task-1',symbol:'a',graphRelativePath:'.codeweb/graph.json'});
test('ac_30: canonical UTF8 keys and strict data values; tuple lengths avoid collisions',()=>{
 assert.equal(canonicalJSON({z:1,a:[2,1]}),'{"a":[2,1],"z":1}');
 assert.equal(hash({a:1,b:2}),hash({b:2,a:1}));
 for(const value of [undefined,NaN,Infinity,{a:undefined},'\ud800',new Date(),[,1]]) assert.throws(()=>canonicalJSON(value));
 assert.notEqual(tupleHash(['ab','c']),tupleHash(['a','bc']));
 assert.equal(hash(null),'74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
});
test('projection ignores timestamps and array ordering; capture complete typed relations',()=>{
 const s=snapshot(); const r=capture(s); const shuffled=structuredClone(s); shuffled.graph.nodes.reverse(); shuffled.graph.edges.reverse(); shuffled.graph.meta={mtime:33,root:'/elsewhere'};
 assert.equal(hash(projectGraph(s.graph,s.sourceHashes,s.profile)),hash(projectGraph(shuffled.graph,shuffled.sourceHashes,s.profile)));
 assert.equal(hash(r),hash(capture(shuffled)));
 assert.deepEqual(r.relations.callers.map(x=>x.relatedId),['b']);
 assert.deepEqual(new Set(r.relations.impact.map(x=>x.relatedId)),new Set(['b','c']));
 assert.deepEqual(r.relations.impact.find(x=>x.relatedId==='c').witnessPath,[edge('c','b'),edge('b','a')]);
 assert.equal(validateRecord(r,'receipt'),r);
 assert.equal(reconcileReceipt(r,s).state,'unchanged');
});
test('reconciliation observes new callers independently of displayed query and original remains immutable',()=>{
 const s=snapshot(),r=capture(s),original=canonicalJSON(r),next=snapshot([...s.graph.nodes,node('d')],[...s.graph.edges,edge('d','a')]); next.inventoryDigest=sha('new');
 const out=reconcileReceipt(r,next); assert.equal(out.state,'changed'); assert.equal(out.parentReceiptId,hash(r));
 assert.deepEqual(out.deltas.added.map(x=>[x.relation,x.relatedId]).sort(),[['callers','d'],['impact','d']]);
 assert.equal(canonicalJSON(r),original); assert.equal(hash(out),hash(reconcileReceipt(r,next))); validateRecord(out,'result');
});
test('intermediate witness source change and isolated target edit cannot claim unchanged',()=>{
 const s=snapshot(),r=capture(s),next=structuredClone(s); next.sourceHashes['b.js']=sha('changed'); next.inventoryDigest=sha('new');
 assert.ok(reconcileReceipt(r,next).deltas.witnessChanged.some(x=>x.relatedId==='c'));
 const solo=snapshot([node('a')],[]),rr=capture(solo); solo.sourceHashes['a.js']=sha('new body');
 assert.equal(reconcileReceipt(rr,solo).targetEvidenceChanged,true); assert.equal(reconcileReceipt(rr,solo).state,'changed');
});
test('unrelated inputs can change while evidence remains unchanged after recomputation',()=>{
 const s=snapshot(),r=capture(s);s.inventoryDigest=sha('other'); const o=reconcileReceipt(r,s); assert.equal(o.inputsChanged,true);assert.equal(o.state,'unchanged');
});
test('incompatible, missing target and incomplete snapshots never assert relation deltas',()=>{
 const s=snapshot(),r=capture(s),other=structuredClone(s);other.optionsDigest=sha('new');
 assert.equal(reconcileReceipt(r,other).state,'inconclusive');
 other.optionsDigest=s.optionsDigest;other.graph.nodes=other.graph.nodes.filter(n=>n.id!=='a');other.graph.edges=[];
 assert.ok(reconcileReceipt(r,other).reasons.includes('target-unresolved'));
 const incomplete=structuredClone(s);incomplete.graph.meta.analysis={status:'incomplete',diagnostics:[{code:'gap',file:'a.js',line:1,column:1,evidence:'gap'}]};
 const result=reconcileReceipt(r,incomplete); assert.equal(result.state,'inconclusive'); assert.equal(result.deltas.removed.length,0);
});
test('same-reason questions do not relocate each other; moves retain old questions',()=>{
 const s=snapshot();s.graph.meta.analysis={status:'no-known-incompleteness',diagnostics:[{code:'gap',file:'a.js',line:1,column:1,evidence:'x'},{code:'gap',file:'a.js',line:3,column:1,evidence:'y'}]};
 const r=capture(s); assert.equal(r.questions.length,2);
 assert.ok(reconcileReceipt(r,s).questions.every(q=>q.state==='unresolved'));
 const next=structuredClone(s);next.graph.meta.analysis.diagnostics[0].line=2;next.sourceHashes['a.js']=sha('moved');
 const out=reconcileReceipt(r,next);assert.equal(out.questions.length,3);assert.equal(out.questions.find(q=>q.id===r.questions.find(q=>q.span.line===1).id).state,'needs-recheck');
 next.graph.meta.analysis.diagnostics=[];assert.ok(reconcileReceipt(r,next).questions.every(q=>q.state==='no-longer-observed'));
});
test('schema rejects unknown nested fields, mismatched relation IDs, unsupported profile',()=>{
 const r=capture(snapshot()); for(const mutate of [x=>x.extra=true,x=>x.baseline.extra=true,x=>x.relations.callers[0].extra=true,x=>x.relations.callers[0].id='a'.repeat(64),x=>x.query.profile='bad']) {const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateRecord(bad,'receipt'));}
 const s=snapshot();s.profile='agent';assert.throws(()=>capture(s),e=>e.code==='unsupported-engine');
});
test('selectors are exact and unambiguous; self call retained and import never impact',()=>{
 const s=snapshot([node('a'),node('x',{label:'a'})],[]);assert.throws(()=>createReceipt(s,{task:'t',symbol:'absent',graphRelativePath:'graph.json'}),e=>e.code==='target-not-found');
 s.graph.nodes[0].id='other';assert.throws(()=>capture(s),e=>e.code==='ambiguous-target');
 const ss=snapshot([node('a'),node('b')],[edge('a','a'),edge('b','a','import')]);const rr=capture(ss);assert.equal(rr.relations.callers.length,1);assert.equal(rr.relations.impact.length,0);
});
test('record validation rejects contradictory profile, task types, missing target source and delta owners',()=>{
 const r=capture(snapshot());
 for(const mutate of [x=>x.task=123,x=>x.baseline.analyzerIdentity.ast=true,x=>x.analysis.profile='agent',x=>x.target.sourceSha256=null]) {const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateRecord(bad,'receipt'));}
 const out=reconcileReceipt(r,snapshot());out.state='unchanged';out.reasons=['analysis-incompatible'];assert.throws(()=>validateRecord(out,'result'));
});
test('projection preserves diagnostics count; canonical data never calls getters',()=>{
 const s=snapshot();s.graph.meta.analysis={status:'incomplete',diagnosticCount:100,diagnostics:[]};assert.equal(capture(s).analysis.diagnosticCount,100);
 let called=false;const value={get a(){called=true;return 1;}};assert.throws(()=>canonicalJSON(value));assert.equal(called,false);
});
test('shortest impact witness tie-break is deterministic and cycle bounded',()=>{
 const s=snapshot(['a','b','c','d'].map(id=>node(id)),[edge('b','a'),edge('c','a'),edge('d','c'),edge('d','b'),edge('a','d')]);
 const r=capture(s);const path=r.relations.impact.find(x=>x.relatedId==='d').witnessPath;
 assert.deepEqual(path,[edge('d','b'),edge('b','a')]);s.graph.edges.reverse();assert.equal(hash(capture(s)),hash(r));
});
test('native structured signatures survive capture and strict schema validation',()=>{
 const signature={params:['name','opts = {}'],returns:'string',raw:'function a(name, opts = {}): string'};
 const s=snapshot([node('a',{signature})],[]);const r=capture(s);assert.deepEqual(r.target.signature,signature);validateRecord(r,'receipt');
 const bad=structuredClone(r);bad.target.signature.extra=true;assert.throws(()=>validateRecord(bad,'receipt'));
});
test('standing relevant limitations and exported-consumer questions survive reconciliation',()=>{
 const s=snapshot([node('a',{exports:true})],[]);s.graph.meta.dynamic={files:1};const r=capture(s);
 assert.ok(r.analysis.limitations.includes('dynamic-dispatch'));assert.ok(r.analysis.limitations.includes('external-callers'));
 assert.equal(r.questions[0].reason,'external-consumers-unknown');assert.equal(reconcileReceipt(r,s).questions[0].state,'unresolved');
 s.graph.nodes[0].exports=false;const out=reconcileReceipt(r,s);assert.equal(out.questions[0].state,'no-longer-observed');assert.equal(out.targetEvidenceChanged,true);
});
test('immutable context reader derives a missing label window question for an aliased mapped caller',()=>{
 const s=snapshot([node('a'),node('b')],[edge('b','a')]);const source={'a.js':['function a() {}'],'b.js':['function b() { alias(); }']};
 s.sourceReader={available:true,linesOf:file=>source[file]??null,bodyOf:n=>(source[n.file]||[]).slice(n.line-1,n.line+n.loc-1).join('\n')};
 const r=capture(s);assert.equal(r.questions.length,1);assert.equal(r.questions[0].reason,'caller-source-window-missing');
 assert.ok(r.analysis.limitations.includes('source-evidence'));assert.ok(!r.analysis.limitations.includes('freshness-unknown'));
 assert.equal(reconcileReceipt(r,s).questions[0].state,'unresolved');
});
test('semantic validation rejects contradictory capture and result claims even with well-shaped data',()=>{
 const s=snapshot(),r=capture(s);
 for(const mutate of [x=>x.analysis.sourceAvailable=false,x=>x.baseline.analyzerIdentity.relationVersion=99,x=>x.target.sourceSha256=sha('mismatch'),x=>x.target.file='different.js']){const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateRecord(bad,'receipt'));}
 const next=snapshot([...s.graph.nodes,node('d')],[...s.graph.edges,edge('d','a')]),result=reconcileReceipt(r,next);
 for(const mutate of [x=>x.state='unchanged',x=>x.deltas.removed=[...x.deltas.added],x=>x.deltas.added[0].support.find(p=>p.path==='a.js').sha256=sha('wrong')]) {const bad=structuredClone(result);mutate(bad);assert.throws(()=>validateRecord(bad,'result'));}
 const unchanged=reconcileReceipt(r,s);unchanged.targetEvidenceChanged=true;assert.throws(()=>validateRecord(unchanged,'result'));
});
test('removed witness retains historical target hash while current relations bind changed target',()=>{
 const s=snapshot(),r=capture(s),next=snapshot(s.graph.nodes,[edge('c','b')]);next.sourceHashes['a.js']=sha('new target');next.inventoryDigest=sha('new inventory');
 const out=reconcileReceipt(r,next);assert.ok(out.deltas.removed.length);assert.equal(out.deltas.removed[0].support.find(p=>p.path==='a.js').sha256,r.target.sourceSha256);validateRecord(out,'result');
});
test('three-edge shortest tie is ordered target-outward before storing original direction',()=>{
 const s=snapshot(['t','a','b','x','w','z'].map(id=>node(id)),[edge('a','t'),edge('x','a'),edge('z','x'),edge('b','t'),edge('w','b'),edge('z','w')]);
 const r=createReceipt(s,{task:'t',symbol:'t',graphRelativePath:'graph.json'});
 assert.deepEqual(r.relations.impact.find(x=>x.relatedId==='z').witnessPath,[edge('z','x'),edge('x','a'),edge('a','t')]);
});
