// Pure evidence projection and reconciliation. Target source is never read or executed here.
import { createHash } from 'node:crypto';
import { buildIndex, callersOf, calleesOf, impactOf, resolveSymbol } from './graph-ops.mjs';
import { buildContextPack } from './context-core.mjs';

export class EvidenceError extends Error {}
export function evidenceError(code, message = code, state = 'unavailable') {
  const error = new EvidenceError(message);
  error.name = 'EvidenceError';
  error.code = code;
  error.state = state;
  return error;
}
const PROFILE = 'native-regex-snapshot-v1';
const compare = (a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b));
const fail = (message='Invalid evidence record') => { throw evidenceError('corrupt',message); };
function validString(s) {
  if (typeof s !== 'string') fail('Expected string');
  for(let i=0;i<s.length;i++) {const c=s.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const d=s.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))fail('Unpaired surrogate');}else if(c>=0xdc00&&c<=0xdfff)fail('Unpaired surrogate');}
  return s;
}
export function canonicalJSON(value) {
  const seen=new Set();
  function encode(v, depth=0) {
    if(depth>128)fail('JSON nesting too deep');
    if(v===null)return 'null';
    if(typeof v==='string')return JSON.stringify(validString(v));
    if(typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='number'){if(!Number.isFinite(v))fail('Nonfinite number');return JSON.stringify(v);}
    if(typeof v!=='object'||seen.has(v))fail('Expected acyclic JSON data');
    if(Object.getOwnPropertySymbols(v).length)fail('Symbol keys are not JSON');
    for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(v)))if(descriptor.get||descriptor.set)fail('Accessors are not data');
    seen.add(v);let out;
    if(Array.isArray(v)) {const parts=[];for(let i=0;i<v.length;i++){if(!Object.hasOwn(v,i))fail('Sparse array');parts.push(encode(v[i],depth+1));}out='['+parts.join(',')+']';}
    else {if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)fail('Expected plain object');out='{'+Object.keys(v).sort(compare).map(k=>JSON.stringify(validString(k))+':'+encode(v[k],depth+1)).join(',')+'}';}
    seen.delete(v);return out;
  }
  return encode(value);
}
export const hash = value => createHash('sha256').update(canonicalJSON(value),'utf8').digest('hex');
function tupleBytes(strings) {
  return Buffer.concat(strings.map(s=>{const b=Buffer.from(validString(s));if(b.length>0xffffffff)fail('Tuple item too long');const size=Buffer.alloc(4);size.writeUInt32BE(b.length);return Buffer.concat([size,b]);}));
}
export const tupleHash = strings => createHash('sha256').update(tupleBytes(strings)).digest('hex');
const sorted = (items,key=x=>x.id) => [...items].sort((a,b)=>compare(key(a),key(b)));
const distinct = (items,key=canonicalJSON) => [...new Map(items.map(x=>[key(x),x])).values()];
const nil = v => v === undefined ? null : v;
function targetProjection(n,sourceHashes) {
  return {id:n.id,label:nil(n.label),file:n.file,line:nil(n.line),loc:nil(n.loc),kind:nil(n.kind),exports:typeof n.exports==='boolean'?n.exports:false,signature:nil(n.signature),sourceSha256:sourceHashes?.[n.file]??null};
}
function diagnosticsOf(graph) {
  return sorted(distinct((graph.meta?.analysis?.diagnostics||[]).map(d=>({code:d.code,file:d.file,line:nil(d.line),column:nil(d.column),evidence:nil(d.evidence)}))),canonicalJSON);
}
export function projectGraph(graph,sourceHashes,profile=null) {
  const nodes=sorted(graph.nodes.map(n=>{
    const {sourceSha256,...p}=targetProjection(n,sourceHashes);
    const recorded=graph.meta?.sources?.[n.file];
    let sourceDigest=null;
    if(sourceSha256!==null)sourceDigest={algorithm:'sha256',value:sourceSha256};
    else if(recorded?.h)sourceDigest={algorithm:'sha1',value:recorded.h};
    else if(recorded?.hash)sourceDigest={algorithm:recorded.algorithm||recorded.hashAlgorithm||'unspecified',value:recorded.hash};
    return {...p,sourceDigest};
  }));
  const edges=distinct(graph.edges.map(e=>({source:e.from??e.source,target:e.to??e.target,kind:e.kind})));
  edges.sort((a,b)=>Buffer.compare(tupleBytes([a.source,a.target,a.kind]),tupleBytes([b.source,b.target,b.kind])));
  return {version:1,nodes,edges,diagnostics:diagnosticsOf(graph),profile};
}
function analysisOf(snapshot) {
  const analysis=snapshot.graph.meta?.analysis;
  const limitations=new Set(['unmapped-calls','isolated-discovery-does-not-apply-ignore-files']);
  for(const item of [...(analysis?.limitations||[]),...(snapshot.graph.meta?.limitations||[])]) limitations.add(typeof item==='string'?item:canonicalJSON(item));
  if(analysis?.status==='incomplete')limitations.add('extraction-incomplete');
  if(snapshot.graph.meta?.dynamic?.files>0)limitations.add('dynamic-dispatch');
  return {status:analysis?.status==='incomplete'?'incomplete':'no-known-incompleteness',diagnosticCount:analysis?.diagnosticCount??(analysis?.diagnostics||[]).length,diagnostics:diagnosticsOf(snapshot.graph),limitations:[...limitations].sort(compare),profile:snapshot.profile,sourceAvailable:true};
}
function baselineOf(s) {return {inventoryDigest:s.inventoryDigest,graphDigest:hash(projectGraph(s.graph,s.sourceHashes,s.profile)),analyzerIdentity:s.analyzerIdentity,optionsDigest:s.optionsDigest,profile:s.profile};}
const pathKey = e => tupleBytes([e.from,e.to,e.kind]);
function pathsTo(graph,target) {
  const incoming=new Map();
  for(const e of graph.edges) if(e.kind==='call'||e.kind==='inherit') {if(!incoming.has(e.to))incoming.set(e.to,[]);incoming.get(e.to).push({from:e.from,to:e.to,kind:e.kind});}
  for(const list of incoming.values())list.sort((a,b)=>Buffer.compare(pathKey(a),pathKey(b)));
  const paths=new Map([[target,[]]]),queue=[target];
  for(let i=0;i<queue.length;i++) {const current=queue[i];for(const e of incoming.get(current)||[])if(!paths.has(e.from)){paths.set(e.from,[e,...paths.get(current)]);queue.push(e.from);}}
  return paths;
}
function relationsOf(snapshot,target) {
  const ix=buildIndex(snapshot.graph),paths=pathsTo(snapshot.graph,target.id);
  const memberships={callers:callersOf(ix,[target.id]),callees:calleesOf(ix,[target.id]),impact:impactOf(ix,[target.id])};
  const relations={};
  for(const [relation,ids] of Object.entries(memberships))relations[relation]=sorted(ids.map(relatedId=>{
    const witnessPath=relation==='impact'?paths.get(relatedId):[{from:relation==='callers'?relatedId:target.id,to:relation==='callers'?target.id:relatedId,kind:'call'}];
    if(!witnessPath)throw evidenceError('invalid-witness','No supporting path','inconclusive');
    const nodeIds=new Set([target.id,...witnessPath.flatMap(e=>[e.from,e.to])]);
    const nodes=sorted([...nodeIds].map(id=>{const n=ix.byId.get(id);if(!n)throw evidenceError('invalid-witness','Unknown witness node','inconclusive');return {id:n.id,file:n.file,line:nil(n.line),loc:nil(n.loc),kind:nil(n.kind)};}));
    const support=[...new Set(nodes.map(n=>n.file))].sort(compare).map(path=>{const sha256=snapshot.sourceHashes[path];if(!sha256)throw evidenceError('source-unavailable','Witness source absent','inconclusive');return {path,sha256};});
    const id=tupleHash([relation,target.id,relatedId]);
    const evidenceDigest=hash({id,witnessPath,nodes,support});
    return {id,relation,targetId:target.id,relatedId,witnessPath,nodes,support,evidenceDigest};
  }));
  return relations;
}
function questionsOf(snapshot,target,relations,task,context=null) {
  const files=new Set([target.file,...Object.values(relations).flat().flatMap(r=>r.nodes.map(n=>n.file))]);
  const conditions=diagnosticsOf(snapshot.graph).filter(d=>files.has(d.file)).map(d=>({reason:d.code,file:d.file,span:{line:d.line,column:d.column}}));
  if(target.exports)conditions.push({reason:'external-consumers-unknown',file:target.file,span:{line:target.line,column:null}});
  // Snapshot source-window gaps may be supplied by the shared context reader; never infer them from graph absence.
  for(const gap of [...(snapshot.sourceWindowGaps||[]),...(context?.callers||[]).filter(c=>c.windowEvidence?.status!=='shown')])if(files.has(gap.file))conditions.push({reason:'caller-source-window-missing',file:gap.file,span:{line:gap.line??null,column:gap.column??null}});
  return sorted(distinct(conditions.map(c=>{
    const id=tupleHash([task,target.id,c.reason,c.file,canonicalJSON(c.span)]),digest=snapshot.sourceHashes[c.file]??null;
    return {id,task,targetId:target.id,...c,originalSourceSha256:digest,currentSourceSha256:digest,state:'unresolved'};
  }),x=>x.id));
}
function queryOf(symbol,target,s) {return {selector:symbol,targetId:target.id,relationVersion:1,profile:s.profile,edgeKinds:{callers:['call'],callees:['call'],impact:['call','inherit']}};}
function contextEvidence(snapshot,target) {
  if(!snapshot.sourceReader)return null;
  return buildContextPack(snapshot.graph,buildIndex(snapshot.graph),snapshot.sourceReader,[target.id],{symbol:target.id,limit:null,staleInfo:null});
}
function qualifyAnalysis(analysis,target,questions,context=null) {
  const limits=new Set(analysis.limitations);
  // The immutable inventory replaces stat-only freshness. All other categories survive.
  for(const code of context?.analysis?.limitations||[])if(!['freshness-unknown','stale-graph','new-files-unchecked'].includes(code))limits.add(code);
  if(target.exports)limits.add('external-callers');
  if(questions.some(q=>q.reason==='caller-source-window-missing'))limits.add('source-evidence');
  return {...analysis,limitations:[...limits].sort(compare)};
}
export function createReceipt(snapshot,{task,symbol,graphRelativePath}) {
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(task)||typeof symbol!=='string')throw evidenceError('invalid-arguments');
  if(snapshot.profile!==PROFILE)throw evidenceError('unsupported-engine');
  const ids=resolveSymbol(snapshot.graph,symbol);
  if(!ids.length)throw evidenceError('target-not-found');
  if(ids.length!==1)throw evidenceError('ambiguous-target');
  const target=targetProjection(snapshot.graph.nodes.find(n=>n.id===ids[0]),snapshot.sourceHashes);
  if(!target.sourceSha256)throw evidenceError('source-unavailable');
  const relations=relationsOf(snapshot,target),context=contextEvidence(snapshot,target);
  const payload={schemaVersion:1,task,sourceRootRealpath:snapshot.root,graphRelativePath,query:queryOf(symbol,target,snapshot),baseline:baselineOf(snapshot),target,relations,questions:questionsOf(snapshot,target,relations,task,context),analysis:analysisOf(snapshot)};
  payload.analysis=qualifyAnalysis(payload.analysis,target,payload.questions,context);
  validateRecord(payload,'receipt');return payload;
}
function reconcileQuestions(original,current,snapshot,inconclusive) {
  const fresh=new Map(current.map(q=>[q.id,q])),result=[];
  for(const old of original) {
    const match=fresh.get(old.id);
    const candidate=!match&&current.some(q=>q.reason===old.reason&&q.file===old.file&&q.id!==old.id);
    const currentSourceSha256=snapshot.sourceHashes[old.file]??null;
    const state=inconclusive?'needs-recheck':candidate?'needs-recheck':match?(old.originalSourceSha256!==currentSourceSha256?'needs-recheck':'unresolved'):'no-longer-observed';
    result.push({...old,currentSourceSha256,state});fresh.delete(old.id);
  }
  for(const q of fresh.values())result.push(q);
  return sorted(result);
}
export function reconcileReceipt(receipt,snapshot,{legacyGraph}={}) {
  validateRecord(receipt,'receipt');
  if(receipt.sourceRootRealpath!==snapshot.root)throw evidenceError('wrong-workspace');
  const current=baselineOf(snapshot),analysis=analysisOf(snapshot),reasons=[];
  if(snapshot.profile!==PROFILE)reasons.push('unsupported-engine');
  if(hash(receipt.baseline.analyzerIdentity)!==hash(current.analyzerIdentity)||receipt.baseline.optionsDigest!==current.optionsDigest||receipt.baseline.profile!==current.profile)reasons.push('analysis-incompatible');
  const n=snapshot.graph.nodes.find(n=>n.id===receipt.target.id);
  if(!n)reasons.push('target-unresolved');
  if(receipt.analysis.status==='incomplete'||analysis.status==='incomplete')reasons.push('extraction-incomplete');
  const target=n?targetProjection(n,snapshot.sourceHashes):receipt.target;
  let relations={callers:[],callees:[],impact:[]};
  if(n)relations=relationsOf(snapshot,target);
  const context=n?contextEvidence(snapshot,target):null;
  const freshQuestions=n?questionsOf(snapshot,target,relations,receipt.task,context):[];
  const questions=reconcileQuestions(receipt.questions,freshQuestions,snapshot,reasons.length>0);
  const deltas={added:[],removed:[],witnessChanged:[]};
  if(!reasons.length)for(const relation of ['callers','callees','impact']) {
    const before=new Map(receipt.relations[relation].map(r=>[r.id,r])),after=new Map(relations[relation].map(r=>[r.id,r]));
    for(const [id,r] of after)if(!before.has(id))deltas.added.push(r);else if(before.get(id).evidenceDigest!==r.evidenceDigest)deltas.witnessChanged.push(r);
    for(const [id,r] of before)if(!after.has(id))deltas.removed.push(r);
  }
  for(const key of Object.keys(deltas))deltas[key]=sorted(deltas[key]);
  const targetEvidenceChanged=hash(receipt.target)!==hash(target);
  const changed=targetEvidenceChanged||Object.values(deltas).some(a=>a.length)||hash(receipt.questions)!==hash(questions);
  const legacyReviewGraph=legacyGraph?{digest:hash(projectGraph(legacyGraph,undefined,legacyGraph.meta?.profile??null)),profile:legacyGraph.meta?.profile??null}:null;
  const sameGraphAsEvidence=legacyReviewGraph?.digest===current.graphDigest;
  if(legacyReviewGraph&&!sameGraphAsEvidence)analysis.limitations=sorted([...analysis.limitations,'legacy-verdict-not-recomputed-on-evidence-snapshot'],x=>x);
  const result={schemaVersion:1,parentReceiptId:hash(receipt),task:receipt.task,sourceRootRealpath:receipt.sourceRootRealpath,baseline:receipt.baseline,current,query:receipt.query,target,targetEvidenceChanged,inputsChanged:receipt.baseline.inventoryDigest!==current.inventoryDigest,state:reasons.length?'inconclusive':changed?'changed':'unchanged',reasons:reasons.sort(compare),relations,deltas,questions,analysis,legacyReviewGraph,sameGraphAsEvidence};
  result.analysis=qualifyAnalysis(result.analysis,target,questions,context);
  validateRecord(result,'result');return result;
}

// Strict data schemas keep imported records from acquiring undeclared semantics.
function keys(value,expected) {if(!value||typeof value!=='object'||Array.isArray(value))fail();const actual=Object.keys(value).sort(compare);if(canonicalJSON(actual)!==canonicalJSON([...expected].sort(compare)))fail('Unexpected record fields');}
const str = v => {validString(v);};
const digest = v => {if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail('Invalid digest');};
const nullable = (v,fn) => {if(v!==null)fn(v);};
const number = v => {if(!Number.isSafeInteger(v)||v<0)fail('Invalid integer');};
const boolean = v => {if(typeof v!=='boolean')fail('Invalid boolean');};
function list(v,fn,key) {if(!Array.isArray(v))fail('Expected array');v.forEach(fn);if(key){const ids=v.map(key);if(new Set(ids).size!==ids.length||canonicalJSON(ids)!==canonicalJSON([...ids].sort(compare)))fail('Noncanonical set');}}
function targetSchema(t) {keys(t,['id','label','file','line','loc','kind','exports','signature','sourceSha256']);str(t.id);str(t.file);nullable(t.label,str);nullable(t.kind,str);nullable(t.signature,v=>{if(typeof v==='string'){str(v);return;}keys(v,['params','returns','raw']);list(v.params,str);nullable(v.returns,str);str(v.raw);});nullable(t.line,number);nullable(t.loc,number);boolean(t.exports);nullable(t.sourceSha256,digest);}
function baselineSchema(b) {keys(b,['inventoryDigest','graphDigest','analyzerIdentity','optionsDigest','profile']);digest(b.inventoryDigest);digest(b.graphDigest);digest(b.optionsDigest);str(b.profile);const a=b.analyzerIdentity;keys(a,['profile','nodeVersion','runtimeDigest','discoveryDigest','engine','ctags','ast','relationVersion','projectionVersion','schemaVersion']);for(const k of ['profile','nodeVersion','engine'])str(a[k]);digest(a.runtimeDigest);digest(a.discoveryDigest);boolean(a.ctags);boolean(a.ast);for(const k of ['relationVersion','projectionVersion','schemaVersion'])if(a[k]!==1)fail('Unsupported analyzer version');}
function querySchema(q) {keys(q,['selector','targetId','relationVersion','profile','edgeKinds']);str(q.selector);str(q.targetId);if(q.relationVersion!==1||q.profile!==PROFILE)fail('Unsupported query');keys(q.edgeKinds,['callers','callees','impact']);if(canonicalJSON(q.edgeKinds)!==canonicalJSON({callers:['call'],callees:['call'],impact:['call','inherit']}))fail('Invalid edge semantics');}
function analysisSchema(a) {keys(a,['status','diagnosticCount','diagnostics','limitations','profile','sourceAvailable']);if(!['incomplete','no-known-incompleteness'].includes(a.status))fail();str(a.profile);number(a.diagnosticCount);boolean(a.sourceAvailable);list(a.limitations,str,x=>x);list(a.diagnostics,d=>{keys(d,['code','file','line','column','evidence']);str(d.code);str(d.file);nullable(d.line,number);nullable(d.column,number);nullable(d.evidence,str);},canonicalJSON);}
function relationSchema(r) {
  keys(r,['id','relation','targetId','relatedId','witnessPath','nodes','support','evidenceDigest']);digest(r.id);digest(r.evidenceDigest);for(const k of ['relation','targetId','relatedId'])str(r[k]);
  if(!['callers','callees','impact'].includes(r.relation)||r.id!==tupleHash([r.relation,r.targetId,r.relatedId]))fail('Relation identity mismatch');
  list(r.witnessPath,e=>{keys(e,['from','to','kind']);str(e.from);str(e.to);if(!['call','inherit'].includes(e.kind))fail();});
  list(r.nodes,n=>{keys(n,['id','file','line','loc','kind']);str(n.id);str(n.file);nullable(n.line,number);nullable(n.loc,number);nullable(n.kind,str);},n=>n.id);
  list(r.support,s=>{keys(s,['path','sha256']);str(s.path);digest(s.sha256);},s=>s.path);
  if(r.evidenceDigest!==hash({id:r.id,witnessPath:r.witnessPath,nodes:r.nodes,support:r.support}))fail('Witness digest mismatch');
  if(!r.witnessPath.length)fail('Empty witness');
  const start=r.relation==='callees'?r.targetId:r.relatedId,end=r.relation==='callees'?r.relatedId:r.targetId;
  if(r.witnessPath[0].from!==start||r.witnessPath.at(-1).to!==end)fail('Witness endpoints');
  for(let i=1;i<r.witnessPath.length;i++)if(r.witnessPath[i-1].to!==r.witnessPath[i].from)fail('Disconnected witness');
  if(r.relation!=='impact'&&(r.witnessPath.length!==1||r.witnessPath[0].kind!=='call'))fail('Invalid direct witness');
  const ids=new Set(r.nodes.map(n=>n.id));const endpoints=new Set(r.witnessPath.flatMap(e=>[e.from,e.to]));if(ids.size!==endpoints.size)fail('Unexpected witness node');for(const e of r.witnessPath)if(!ids.has(e.from)||!ids.has(e.to))fail('Missing witness node');
  if(canonicalJSON([...new Set(r.nodes.map(n=>n.file))].sort(compare))!==canonicalJSON(r.support.map(s=>s.path)))fail('Missing witness source');
}
function relationSets(r,targetId) {keys(r,['callers','callees','impact']);for(const [kind,items]of Object.entries(r))list(items,item=>{relationSchema(item);if(item.relation!==kind||item.targetId!==targetId)fail('Wrong relation owner');},x=>x.id);}
function questionSchema(q,task,targetId) {keys(q,['id','task','targetId','reason','file','span','originalSourceSha256','currentSourceSha256','state']);for(const k of ['id','task','targetId','reason','file','state'])str(q[k]);keys(q.span,['line','column']);nullable(q.span.line,number);nullable(q.span.column,number);nullable(q.originalSourceSha256,digest);nullable(q.currentSourceSha256,digest);if(q.task!==task||q.targetId!==targetId||q.id!==tupleHash([task,targetId,q.reason,q.file,canonicalJSON(q.span)])||!['unresolved','needs-recheck','no-longer-observed'].includes(q.state))fail('Invalid question identity or state');}
function currentWitnessMatchesTarget(relation,target) {
  const n=relation.nodes.find(n=>n.id===target.id);
  if(!n||['file','line','loc','kind'].some(key=>n[key]!==target[key]))fail('Witness target projection mismatch');
  if(relation.support.find(s=>s.path===target.file)?.sha256!==target.sourceSha256)fail('Witness target source mismatch');
}
function recordSemantics(record,isReceipt) {
  if(isReceipt&&!record.analysis.sourceAvailable)fail('Capture requires source availability');
  if(record.analysis.diagnosticCount<record.analysis.diagnostics.length)fail('Diagnostic count underflow');
  const current=new Map(Object.values(record.relations).flat().map(r=>[r.id,r]));
  for(const relation of current.values())currentWitnessMatchesTarget(relation,record.target);
  if(isReceipt)return;
  const used=new Set();
  for(const [kind,items]of Object.entries(record.deltas))for(const item of items){
    if(used.has(item.id))fail('Overlapping deltas');used.add(item.id);
    if(kind==='removed'){if(current.has(item.id))fail('Removed relation still current');}
    else {currentWitnessMatchesTarget(item,record.target);if(!current.has(item.id)||hash(current.get(item.id))!==hash(item))fail('Delta differs from current evidence');}
  }
  // Removed records deliberately retain baseline source/span evidence, not the current target hash.
  if(record.state==='unchanged'&&(record.targetEvidenceChanged||used.size||record.questions.some(q=>q.state!=='unresolved'||q.originalSourceSha256!==q.currentSourceSha256)))fail('Contradictory unchanged state');
  if(!record.analysis.sourceAvailable&&record.state!=='inconclusive')fail('Missing sources require inconclusive state');
  if((record.analysis.status==='incomplete')&&record.state!=='inconclusive')fail('Incomplete analysis cannot establish equality');
}
export function validateRecord(record,kind) {
  canonicalJSON(record);
  const receipt=kind==='receipt'||kind==='receipts';if(!receipt&&kind!=='result'&&kind!=='results')fail('Unknown record kind');
  keys(record,receipt?['schemaVersion','task','sourceRootRealpath','graphRelativePath','query','baseline','target','relations','questions','analysis']:['schemaVersion','parentReceiptId','task','sourceRootRealpath','baseline','current','query','target','targetEvidenceChanged','inputsChanged','state','reasons','relations','deltas','questions','analysis','legacyReviewGraph','sameGraphAsEvidence']);
  if(typeof record.task!=='string'||record.schemaVersion!==1||!/^[A-Za-z0-9_-]{1,64}$/.test(record.task))fail();str(record.sourceRootRealpath);querySchema(record.query);baselineSchema(record.baseline);targetSchema(record.target);if(record.query.targetId!==record.target.id)fail('Target mismatch');relationSets(record.relations,record.target.id);analysisSchema(record.analysis);list(record.questions,q=>questionSchema(q,record.task,record.target.id),q=>q.id);
  if(receipt){str(record.graphRelativePath);if(record.graphRelativePath.startsWith('/'))fail('Invalid workspace path');const a=record.baseline.analyzerIdentity;if(record.baseline.profile!==PROFILE||a.profile!==PROFILE||a.engine!=='regex'||a.ctags||a.ast||record.analysis.profile!==PROFILE)throw evidenceError('unsupported-engine');digest(record.target.sourceSha256);if(record.questions.some(q=>q.state!=='unresolved'||q.originalSourceSha256!==q.currentSourceSha256))fail('Invalid capture question state');}
  else {digest(record.parentReceiptId);baselineSchema(record.current);boolean(record.targetEvidenceChanged);boolean(record.inputsChanged);boolean(record.sameGraphAsEvidence);if(!['changed','unchanged','inconclusive'].includes(record.state))fail();list(record.reasons,str,x=>x);keys(record.deltas,['added','removed','witnessChanged']);for(const items of Object.values(record.deltas))list(items,r=>{relationSchema(r);if(r.targetId!==record.target.id)fail('Wrong delta owner');},x=>x.id);if(record.state!=='inconclusive'&&record.reasons.length)fail('Reason without inconclusive state');if(record.state==='inconclusive'&&(!record.reasons.length||Object.values(record.deltas).some(a=>a.length)))fail('Invalid inconclusive deltas');if(record.legacyReviewGraph!==null){keys(record.legacyReviewGraph,['digest','profile']);digest(record.legacyReviewGraph.digest);nullable(record.legacyReviewGraph.profile,str);}}
  recordSemantics(record,receipt);
  return record;
}
