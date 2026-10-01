"""Independent bounded review probes. Writes confined to this review directory."""
import json, hashlib, os, shutil, subprocess, time
from pathlib import Path
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
CANDIDATE = OUT.parents[2]
FIX = OUT / 'fixtures'
FIX.mkdir(exist_ok=False)
RECEIPTS = OUT / 'receipts'
RECEIPTS.mkdir(exist_ok=True)
ENV = dict(os.environ)
ENV.pop('CODEWEB_WS', None)
OVERRIDES = {'CODEWEB_NO_STATS':'1','CODEWEB_NO_AUTOREFRESH':'1','CODEWEB_NO_RECEIPTS':'1','CODEWEB_NO_PROMO':'1'}
ENV.update(OVERRIDES)
NODE = shutil.which('node')
records = []
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p, s):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(s)
def run(i, script, args=(), stdin=None, canonical=True):
    scriptpath = CANDIDATE/script
    if not canonical: scriptpath = Path(str(scriptpath).replace('/private/var/', '/var/', 1))
    cmd = [NODE,str(scriptpath),*map(str,args)]
    start = datetime.now(timezone.utc).isoformat(); t=time.monotonic()
    p=subprocess.run(cmd,input=stdin,text=True,cwd=FIX,env=ENV,capture_output=True,timeout=60)
    r={'id':i,'command':cmd,'cwd':str(FIX),'envOverrides':OVERRIDES,'stdin':stdin,'start':start,'end':datetime.now(timezone.utc).isoformat(),'durationSeconds':time.monotonic()-t,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
    write(RECEIPTS/(i+'.json'),json.dumps(r,indent=2)+'\n');records.append(r);return r
def mcp(i,name,args):
    init={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'independent-p02-review','version':'1'}}}
    call={'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':name,'arguments':args}}
    return run(i,'scripts/mcp-server.mjs',stdin=json.dumps(init)+'\n'+json.dumps(call)+'\n')
def hook(i,root,post=False,canonical=True,payload=None):
    payload=payload or {'tool_name':'Edit','tool_input':{'file_path':str(root/'subject.mjs'),'old_string':'value + 1','new_string':'value + 2','symbol':'subject.mjs:low'}}
    return run(i,'hooks/'+('post-edit-diff' if post else 'pre-edit-impact')+'.mjs',stdin=json.dumps(payload),canonical=canonical)
def graph(root):return root/'.codeweb/graph.json'

target=FIX/'target';(target/'.codeweb').mkdir(parents=True)
subject='export function low(value) {\n return value + 1;\n}\nexport function popular(value) {\n return value * 2;\n}\nexport function quiet(value) {\n return value - 1;\n}\nfunction local(value) {\n return low(value);\n}\n'
write(target/'subject.mjs',subject)
write(target/'consumer.mjs',"import { low } from './subject.mjs';\nexport function consequential() {\n return low(10);\n}\n")
for i in range(5):write(target/f'fan{i}.mjs',f"import {{ popular }} from './subject.mjs';\nexport function fan{i}() {{\n return popular({i});\n}}\n")
write(target/'dist/generated.mjs','export function generated() { return 1; }\n')
ex=run('R01-extract','scripts/extract-symbols.mjs',[target,'--no-ctags','--engine','regex'])
g=json.loads(ex['stdout']); g['overlaps']=[];g['domains']=[];write(graph(target),json.dumps(g))
run('R02-exact-impact','scripts/query.mjs',[graph(target),'--impact','subject.mjs:low','--json'])
run('R03-exact-context','scripts/context-pack.mjs',[graph(target),'subject.mjs:low','--json'])
mcp('R04-exact-mcp','codeweb_context',{'graph':str(graph(target)),'symbol':'subject.mjs:low'})
hook('R05-known-target-graph-only',target)
write(target/'subject.mjs',subject+'// source changed before refresh\n')
run('R06-stale-context','scripts/context-pack.mjs',[graph(target),'subject.mjs:low','--json'])
hook('R07-stale-graph-only',target)
write(target/'subject.mjs',subject)
run('R08-refresh-baseline','scripts/refresh.mjs',[graph(target),'--baseline','--json'])
baseline=target/'.codeweb/graph.baseline.json';before=digest(baseline)
hook('R09-known-target-fresh',target)
hook('R10-known-target-repeat',target)
hook('R11-entry-alias',target,canonical=False)
patch={'tool_name':'apply_patch','tool_input':{'command':'*** Begin Patch\n*** Update File: '+str(target/'subject.mjs')+'\n@@\n- return value + 1;\n+ return value + 2;\n*** End Patch'}}
hook('R12-codex-payload',target,payload=patch)
write(target/'subject.mjs',subject.replace('value + 1','value + 2'))
hook('R13-stale-with-sidecar',target)
run('R14-ordinary-refresh','scripts/refresh.mjs',[graph(target),'--json'])
run('R15-diff-refresh','scripts/diff.mjs',['baseline',graph(target),'--refresh','--json'])
after_edit=digest(baseline)
write(target/'subject.mjs',subject)
run('R16-repair-refresh','scripts/refresh.mjs',[graph(target),'--json'])
after_repair=digest(baseline)
run('R17-deny-baseline-refresh','scripts/refresh.mjs',[baseline,'--json'])
run('R18-generated-selector','scripts/context-pack.mjs',[graph(target),'dist/generated.mjs:generated','--json'])

bad=FIX/'bad-shape.json';write(bad,json.dumps({'meta':{'root':str(target)},'nodes':{},'edges':[]}))
run('R19-invalid-shape-cli','scripts/query.mjs',[bad,'--impact','low','--json'])
mcp('R20-invalid-shape-mcp','codeweb_impact',{'graph':str(bad),'symbol':'low'})
incomplete=FIX/'incomplete.json';write(incomplete,json.dumps({'meta':{'root':str(FIX),'analysis':{'status':'incomplete','diagnosticCount':1,'diagnostics':[{'code':'unsupported-declaration','file':'missing.mjs','line':1}]}},'nodes':[{'id':'missing.mjs:risky','label':'risky','kind':'function','file':'missing.mjs','line':1,'loc':3,'exports':False}],'edges':[],'overlaps':[]}))
run('R21-incomplete-deadcode','scripts/deadcode.mjs',[incomplete,'--json'])
mcp('R22-incomplete-deadcode-mcp','codeweb_deadcode',{'graph':str(incomplete)})

for state in ['zero','missing','corrupt','unmapped','empty','extraction-failure']:
    root=FIX/state;root.mkdir();write(root/'subject.mjs','export function alone(value) { return value + 1; }\n')
    if state=='corrupt':write(graph(root),'{broken')
    elif state in ['zero','empty','extraction-failure']:
        nodes=[] if state=='empty' else [{'id':'subject.mjs:alone','label':'alone','kind':'function','file':'subject.mjs','line':1,'loc':1}]
        edges=[] if state!='extraction-failure' else [{'from':'consumer.mjs:consumer','to':'subject.mjs:alone','kind':'call'}]
        write(graph(root),json.dumps({'meta':{'root':str(root)},'nodes':nodes,'edges':edges}))
    if state=='extraction-failure':(root/'subject.mjs').unlink()
    hook('R23-pre-'+state,root);hook('R24-post-'+state,root,post=True)
    if state=='extraction-failure':run('R25-explicit-refresh-failure','scripts/refresh.mjs',[graph(root),'--json'])

summary={'candidate':str(CANDIDATE),'fixture_root':str(FIX),'baseline_hashes':{'before':before,'after_edit_refresh_and_diff':after_edit,'after_repair':after_repair},'generated_excluded_from_actual_extraction':not any(n.get('file','').startswith('dist/') for n in g['nodes']),'runs':[{'id':r['id'],'exit':r['exit'],'stdoutBytes':len(r['stdout'].encode()),'stderrBytes':len(r['stderr'].encode())} for r in records]}
write(OUT/'PROBES.json',json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
