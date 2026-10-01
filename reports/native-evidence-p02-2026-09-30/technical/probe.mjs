import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,existsSync,readdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const candidate=resolve(process.argv[2]||'.');
const out=resolve(process.argv[3]||'reports/native-evidence-p02-2026-09-30/technical');
mkdirSync(out,{recursive:true}); mkdirSync(join(out,'receipts'),{recursive:true});
const fixtures=mkdtempSync(join(tmpdir(),'codeweb-p02-tech-')); const events=[];
const digest=s=>createHash('sha256').update(s).digest('hex');
const env={...process.env,CODEWEB_NO_STATS:'1',CODEWEB_NO_AUTOREFRESH:'1',CODEWEB_NO_RECEIPTS:'1',CODEWEB_NO_PROMO:'1'};
function run(id,script,args=[],input,extraEnv={},cwd=fixtures){
 const argv=[join(candidate,script),...args];const start=new Date().toISOString(),t=performance.now();
 const r=spawnSync(process.execPath,argv,{cwd,env:{...env,...extraEnv},input,encoding:'utf8',timeout:90000,maxBuffer:32*1024*1024});
 const record={id,command:[process.execPath,...argv],cwd,envOverrides:{CODEWEB_NO_STATS:'1',CODEWEB_NO_AUTOREFRESH:'1',...extraEnv},stdin:input??null,start,end:new Date().toISOString(),durationMs:performance.now()-t,exit:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''};
 writeFileSync(join(out,'receipts',id+'.json'),JSON.stringify(record,null,2)+'\n'); events.push(record);return record;
}
function ownrun(id,args,cwd=fixtures){const start=new Date().toISOString(),t=performance.now();const r=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',timeout:90000,maxBuffer:32*1024*1024});const record={id,command:[process.execPath,...args],cwd,start,end:new Date().toISOString(),durationMs:performance.now()-t,exit:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''};writeFileSync(join(out,'receipts',id+'.json'),JSON.stringify(record,null,2)+'\n');events.push(record);return record;}
function write(root,file,text){mkdirSync(join(root,file,'..'),{recursive:true});writeFileSync(join(root,file),text);}
function saveGraph(root,graph,name='graph.json'){mkdirSync(join(root,'.codeweb'),{recursive:true});const p=join(root,'.codeweb',name);writeFileSync(p,JSON.stringify(graph));return p;}
function extract(id,root){const r=run(id,'scripts/extract-symbols.mjs',[root,'--no-ctags','--engine','regex']);if(r.exit!==0)throw Error(r.stderr);const g=JSON.parse(r.stdout);g.meta={...g.meta,root};g.domains??=[];g.overlaps??=[];return g;}
function hook(id,root,which='pre',inputExtra={}){return run(id,'hooks/'+(which==='pre'?'pre-edit-impact':'post-edit-diff')+'.mjs',[],JSON.stringify({tool_name:'Edit',tool_input:{file_path:join(root,'subject.mjs'),...inputExtra}}));}
function mcp(id,name,args){return run(id,'scripts/mcp-server.mjs',[],JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'p02-own-probe',version:'1'}}})+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}})+'\n');}
function parsed(r){try{return JSON.parse(r.stdout)}catch{return null}}
const target=join(fixtures,'target');mkdirSync(target);
const subject=`export function low(value) {\n  return value + 1;\n}\nexport function popular(value) {\n  return value * 2;\n}\nfunction local(value) {\n  return low(value);\n}\nexport function zero(value) {\n  return value - 1;\n}\n`;
write(target,'subject.mjs',subject);write(target,'consequential.mjs',`import { low } from './subject.mjs';\nexport function consequential() {\n  return low(10);\n}\n`);
for(let i=0;i<8;i++)write(target,`popular${i}.mjs`,`import { popular } from './subject.mjs';\nexport function frequent${i}() {\n  return popular(${i});\n}\n`);
write(target,'subject.test.mjs',`import { low } from './subject.mjs';\nexport function testNeighbor() {\n  return low(2);\n}\n`);
const g=extract('T00-extract-fixture',target),gp=saveGraph(target,g);
run('T01-cli-exact-impact','scripts/query.mjs',[gp,'--impact','subject.mjs:low','--json']);
run('T02-cli-exact-context','scripts/context-pack.mjs',[gp,'subject.mjs:low','--json']);
mcp('T03-mcp-exact-impact','codeweb_impact',{graph:gp,symbol:'subject.mjs:low'});
mcp('T04-mcp-exact-context','codeweb_context',{graph:gp,symbol:'subject.mjs:low'});
hook('T05-hook-known-low-edit',target,'pre',{old_string:'return value + 1;',new_string:'return value + 2;',symbol:'subject.mjs:low'});
hook('T06-hook-file-only',target);hook('T07-hook-known-low-repeat',target,'pre',{old_string:'return value + 1;',new_string:'return value + 2;'});
run('T08-cli-zero','scripts/query.mjs',[gp,'--impact','subject.mjs:zero','--json']);
run('T09-cli-unmapped-symbol','scripts/query.mjs',[gp,'--impact','missing','--json']);
run('T10-cli-missing-map','scripts/query.mjs',[join(fixtures,'absent.json'),'--impact','low','--json']);
const corrupt=join(fixtures,'corrupt.json');writeFileSync(corrupt,'{broken');run('T11-cli-corrupt-map','scripts/query.mjs',[corrupt,'--impact','low','--json']);
const invalid=join(fixtures,'invalid-shape.json');writeFileSync(invalid,JSON.stringify({meta:{root:target},nodes:{},edges:[]}));run('T12-cli-invalid-shape','scripts/query.mjs',[invalid,'--impact','low','--json']);
write(target,'subject.mjs',subject+'// staleness probe\n');run('T13-cli-stale-context','scripts/context-pack.mjs',[gp,'low','--json']);hook('T14-hook-stale',target);write(target,'subject.mjs',subject);
for(const state of ['zero','unmapped','corrupt','missing','generated','unsupported','extraction-failure']){
 const root=join(fixtures,state);mkdirSync(root);write(root,'subject.mjs','export function standalone() { return 1; }\n');
 if(state==='zero')saveGraph(root,{meta:{root},nodes:[{id:'subject.mjs:standalone',label:'standalone',file:'subject.mjs',line:1,loc:1,kind:'function'}],edges:[]});
 if(state==='corrupt') {mkdirSync(join(root,'.codeweb'));writeFileSync(join(root,'.codeweb','graph.json'),'{broken');}
 if(state==='generated'||state==='unsupported')saveGraph(root,{meta:{root},nodes:[],edges:[]});
 if(state==='extraction-failure')saveGraph(root,{meta:{root:join(root,'absent')},nodes:[{id:'subject.mjs:standalone',label:'standalone',file:'subject.mjs',line:1,loc:1,kind:'function'}],edges:[{from:'consumer.mjs:consumer',to:'subject.mjs:standalone',kind:'call'}]});
 hook(`T15-hook-${state}`,root);hook(`T16-post-${state}`,root,'post');
 if(state==='generated'){write(root,'dist/generated.mjs','export function generated() {}\n');run('T17-extract-generated','scripts/extract-symbols.mjs',[root,'--no-ctags','--engine','regex']);}
 if(state==='unsupported'){write(root,'unmapped.xyz','def unsupported(): pass');run('T18-extract-only-unsupported','scripts/extract-symbols.mjs',[join(root,'unmapped.xyz'),'--no-ctags','--engine','regex']);}
 if(state==='extraction-failure')run('T19-refresh-extraction-failure','scripts/refresh.mjs',[join(root,'.codeweb','graph.json'),'--json']);
}
run('T20-cli-invalid-invocation','scripts/query.mjs',[gp,'--impcat','low','--json']);
mcp('T21-mcp-missing-map','codeweb_context',{graph:join(fixtures,'absent.json'),symbol:'low'});
mcp('T22-mcp-corrupt-map','codeweb_context',{graph:corrupt,symbol:'low'});
mcp('T23-mcp-zero','codeweb_impact',{graph:gp,symbol:'zero'});
mcp('T24-mcp-unmapped','codeweb_impact',{graph:gp,symbol:'missing'});
mcp('T25-mcp-invalid-selector','codeweb_impact',{graph:gp,symbol:23});
run('T26-impact-cap','scripts/query.mjs',[gp,'--impact','popular','--limit','2','--json']);run('T27-impact-expand','scripts/query.mjs',[gp,'--impact','popular','--limit','2','--offset','2','--json']);
run('T28-context-cap','scripts/context-pack.mjs',[gp,'popular','--limit','2','--json']);
run('T29-context-expand','scripts/context-pack.mjs',[gp,'popular','--full-bodies','--json']);
// Read exactly the source locations returned, preserving bytes and timestamps as a source-open receipt.
const ctx=parsed(events.find(e=>e.id==='T02-cli-exact-context'));
writeFileSync(join(out,'source-opening.json'),JSON.stringify({openedAt:new Date().toISOString(),fixtureRoot:target,contextReceipt:'receipts/T02-cli-exact-context.json',files:[...new Set([...(ctx?.target||[]),...(ctx?.callers||[])].map(n=>n.file))].map(file=>({file,path:join(target,file),sha256:digest(readFileSync(join(target,file))),text:readFileSync(join(target,file),'utf8')}))},null,2));
// Missing original must fail before refresh; deliberately incomplete before evidence must remain unknown.
run('T30-missing-original-baseline','scripts/diff.mjs',['baseline',gp,'--refresh','--json']);
run('T31-capture-baseline','scripts/refresh.mjs',[gp,'--baseline','--json']);const bp=join(target,'.codeweb','graph.baseline.json'),bhash=digest(readFileSync(bp));
write(target,'consequential.mjs',`import { low } from './subject.mjs';\nexport function consequential() {\n  return 11;\n}\n`);
run('T32-ordinary-refresh','scripts/refresh.mjs',[gp,'--json']);run('T33-verify-baseline','scripts/diff.mjs',['baseline',gp,'--refresh','--json']);
write(target,'consequential.mjs',`import { low } from './subject.mjs';\nexport function consequential() {\n  return low(10);\n}\n`);
run('T34-repair-refresh','scripts/refresh.mjs',[gp,'--json']);run('T35-verify-repair','scripts/diff.mjs',['baseline',gp,'--refresh','--json']);
writeFileSync(join(out,'baseline-hashes.json'),JSON.stringify({path:bp,beforeSha256:bhash,afterOrdinaryRefreshAndRepairSha256:digest(readFileSync(bp)),capturedAt:new Date().toISOString()},null,2));
run('T36-deny-baseline-refresh','scripts/refresh.mjs',[bp,'--json']);
const inc=join(fixtures,'incomplete');mkdirSync(inc);write(inc,'subject.mjs','export function low() { return 1; }\n');const ig={meta:{root:inc,analysis:{status:'incomplete',diagnosticCount:1,diagnostics:[{code:'unsupported-declaration',file:'subject.mjs',line:1}]}},nodes:[],edges:[],overlaps:[]};const ip=saveGraph(inc,ig);saveGraph(inc,ig,'graph.baseline.json');run('T37-incomplete-before','scripts/diff.mjs',['baseline',ip,'--refresh','--json']);
// Hook quiet after an ordinary edit; regression warning once per baseline, then repeat suppressed.
hook('T38-post-normal',target,'post');write(target,'consequential.mjs',`export function consequential() {\n return 11;\n}\n`);write(target,'subject.mjs',subject.replace('return low(value);','return value;'));write(target,'subject.test.mjs','export function testNeighbor() { return 3; }\n');
hook('T39-post-regression-first',target,'post');hook('T40-post-regression-repeat',target,'post');
// Comparison bodies: lexical matches with conflicting contracts, a semantic equivalent with different syntax, missing body and body cap.
const sim=join(fixtures,'similarity');mkdirSync(sim);
write(sim,'a.mjs','export function addTax(cents) {\n return Math.round(cents * 1.2);\n}\n');
write(sim,'b.mjs','export function discount(cents) {\n return Math.round(cents * 0.8);\n}\n');
write(sim,'equivalent.mjs','export function addTaxAlternative(n) {\n const fifth = n / 5;\n const total = n + fifth;\n return Math.floor(total + 0.5);\n}\n');
write(sim,'long.mjs','export function huge(cents) {\n'+Array.from({length:420},(_,i)=>` const v${i} = cents + ${i};`).join('\n')+'\n return Math.round(cents * 1.2);\n}\n');
for(let i=0;i<4;i++)write(sim,`intentional${i}.mjs`,`export function duplicate${i}(cents) {\n return Math.round(cents * 1.2);\n}\n`);
const sg=extract('T41-extract-similarity',sim);sg.nodes.push({id:'missing.mjs:missing',label:'missing',file:'missing.mjs',line:1,loc:3,kind:'function'});const sp=saveGraph(sim,sg);
run('T42-similar-conflicting-contract','scripts/find-similar.mjs',[sp,'--body',join(sim,'a.mjs')]);run('T43-similar-json-cap','scripts/find-similar.mjs',[sp,'--body',join(sim,'a.mjs'),'--k','2','--json']);run('T44-similar-expand','scripts/find-similar.mjs',[sp,'--body',join(sim,'a.mjs'),'--k','20','--json']);run('T45-similar-equivalent-syntax','scripts/find-similar.mjs',[sp,'--body',join(sim,'equivalent.mjs'),'--json']);
run('T46-similar-zero-text','scripts/find-similar.mjs',[sp,'--signature','totally unrelated symbol string xxyyzz']);run('T47-similar-zero-json','scripts/find-similar.mjs',[sp,'--signature','totally unrelated symbol string xxyyzz','--json']);
run('T48-similar-body-cap','scripts/find-similar.mjs',[sp,'--body',join(sim,'long.mjs'),'--json']);
mcp('T49-mcp-similarity','codeweb_find_similar',{graph:sp,body:readFileSync(join(sim,'a.mjs'),'utf8'),k:2});
run('T50-overlap','scripts/overlap.mjs',[sp,'--json']);
// Behavioral controls are author-owned fixtures only; product never executes participant code.
const behave=join(fixtures,'behavior');mkdirSync(behave);write(behave,'package.json','{"type":"module"}');write(behave,'subject.mjs',subject);
write(behave,'current.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {low} from './subject.mjs';\ntest('current valid oracle',()=>assert.equal(low(2),3));\n`);
write(behave,'failed.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {low} from './subject.mjs';\ntest('deliberately invalid oracle',()=>assert.equal(low(2),999));\n`);
write(behave,'skipped.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {low} from './subject.mjs';\ntest('skipped oracle',{skip:true},()=>assert.equal(low(2),999));\n`);
write(behave,'malformed.test.mjs',`import test from 'node:test';\ntest('malformed oracle',()=> {\n`);
const bg=extract('T51-extract-behavior',behave),bgp=saveGraph(behave,bg);
const bstart=digest(readFileSync(join(behave,'subject.mjs')));ownrun('T52-behavior-current',['--test',join(behave,'current.test.mjs')]);ownrun('T53-behavior-failed',['--test',join(behave,'failed.test.mjs')]);ownrun('T54-behavior-skipped',['--test',join(behave,'skipped.test.mjs')]);ownrun('T55-behavior-malformed',['--test',join(behave,'malformed.test.mjs')]);
run('T56-structural-green-with-failed-oracle','scripts/diff.mjs',[bgp,bgp,'--json']);run('T57-test-neighbor','scripts/query.mjs',[bgp,'--tests','low','--json']);
write(behave,'recorded.lcov',`TN:own-current-fixture\nSF:${join(behave,'subject.mjs')}\nDA:2,1\nDA:5,0\nend_of_record\n`);run('T58-import-historical-coverage','scripts/coverage.mjs',[bgp,join(behave,'recorded.lcov'),'--json']);run('T59-recorded-coverage-explain','scripts/explain.mjs',[bgp,'low','--json']);
write(behave,'subject.mjs',subject.replace('value + 1','value + 2'));run('T60-stale-coverage-explain','scripts/explain.mjs',[bgp,'low','--json']);ownrun('T61-stale-test-now-fails',['--test',join(behave,'current.test.mjs')]);
writeFileSync(join(out,'behavior-provenance.json'),JSON.stringify({subjectPath:join(behave,'subject.mjs'),testBeforeSha256:bstart,afterEditSha256:digest(readFileSync(join(behave,'subject.mjs'))),coverageNote:'recorded.lcov is an explicitly synthetic historical coverage import, not a measured runner output; current/failed/skipped/malformed results are actual own-fixture Node runs'},null,2));
// Preserve bounded targeted regression suites as supplemental assertions, not host evidence.
ownrun('T62-targeted-suites',['--test',...['find-similar-output','find-similar','edit-baseline','context-analysis','evidence-snapshot','evidence-core','evidence-store','evidence-transport','retention','coverage','annotations'].map(n=>join(candidate,'tests',n+'.test.mjs'))],candidate);
writeFileSync(join(out,'RUN.json'),JSON.stringify({candidate,fixtures,node:process.version,runAt:new Date().toISOString(),receipts:events.map(r=>({id:r.id,exit:r.exit,durationMs:r.durationMs})),fixtureFiles:[],note:'Disposable fixture directories retained for review; no product source mutation.'},null,2));
// Retain fixture manifest and bytes in reports for reproducibility without requiring temp lifetime.
const inventory=[];function walk(root,rel=''){for(const entry of readdirSync(join(root,rel),{withFileTypes:true})){const file=join(rel,entry.name);if(entry.isDirectory())walk(root,file);else {const bytes=readFileSync(join(root,file));inventory.push({file,sha256:digest(bytes),size:bytes.length});}}}walk(fixtures);writeFileSync(join(out,'fixture-manifest.json'),JSON.stringify({root:fixtures,files:inventory},null,2));
console.log(JSON.stringify({candidate,fixtures,runs:events.length,unexpectedProcessErrors:events.filter(r=>r.error).map(r=>({id:r.id,error:r.error})),testSuiteExit:events.find(r=>r.id==='T62-targeted-suites').exit}));
