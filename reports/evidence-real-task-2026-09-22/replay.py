import json,os,pathlib,subprocess,tempfile,time,re
TOOL=pathlib.Path('$LOCAL_HOME/Repositories/codeweb-evidence-integration')
OUT=pathlib.Path('$LOCAL_HOME/Repositories/codeweb/reports/evidence-real-task-2026-09-22/RESULT.json')
BASE='2fb533f38ec9d69ecf4ab4a82d1dbe17983983aa'
MERGE='2bd8c19452e742213ec9f7aab0cfce7c10662f7d'
ENV={**os.environ,'CODEWEB_ENGINE':'regex','CODEWEB_NO_AUTOREFRESH':'1','CODEWEB_NO_PROMO':'1','CODEWEB_NO_STATS':'1'}

def call(cmd,cwd=None,expect=(0,),json_out=False):
 start=time.perf_counter()
 p=subprocess.run(cmd,cwd=cwd or TOOL,env=ENV,capture_output=True,text=True)
 row={'command':pathlib.Path(cmd[1]).name if len(cmd)>1 else cmd[0],'args':[str(x) for x in cmd[2:]] if len(cmd)>2 else [],'exit':p.returncode,'wallMs':round((time.perf_counter()-start)*1000,1),'stdoutBytes':len(p.stdout.encode())}
 if p.returncode not in expect:raise RuntimeError(f'{cmd} exit {p.returncode}: {p.stderr[-1500:]} {p.stdout[-700:]}')
 if json_out:row['data']=json.loads(p.stdout)
 return row

def summarize_context(d):
 return {'matched':d.get('matched'),'callers':[x.get('id') for x in d.get('callers',[])],'callerCount':len(d.get('callers',[])),'blastRadiusCount':d.get('blastRadius',{}).get('count'),'analysis':d.get('analysis')}

with tempfile.TemporaryDirectory(prefix='codeweb-pr97-replay-') as tmp:
 temp=pathlib.Path(tmp)
 patch=subprocess.run(['git','diff',BASE,MERGE,'--','scripts'],cwd=TOOL,capture_output=True,check=True).stdout
 patch_path=temp/'actual-pr97.patch';patch_path.write_bytes(patch)
 records={}
 for arm in ('ordinary','receipt'):
  repo=temp/(arm+'-repo')
  subprocess.run(['git','worktree','add','--detach',str(repo),BASE],cwd=TOOL,capture_output=True,text=True,check=True)
  try:
   src=repo/'scripts';gp=src/'.codeweb'/'graph.json'
   src.mkdir(exist_ok=True)
   steps=[]
   steps.append(call(['node',str(TOOL/'scripts/run.mjs'),str(src),'--out-dir',str(src/'.codeweb'),'--stages','through-overlap','--json'],json_out=True))
   steps.append(call(['node',str(TOOL/'scripts/refresh.mjs'),str(gp),'--baseline','--json'],json_out=True))
   before=steps[-1]['data']['baseline']
   if arm=='ordinary':
    pre=call(['node',str(TOOL/'scripts/context-pack.mjs'),str(gp),'buildContextPack','--json'],json_out=True)
    pre_summary=summarize_context(pre.pop('data'));steps.append(pre)
    receipt=None
   else:
    pre=call(['node',str(TOOL/'scripts/context-pack.mjs'),str(gp),'buildContextPack','--capture-evidence','--task','pr97-replay','--json'],json_out=True)
    d=pre.pop('data');pre_summary={'state':d.get('state'),'target':d.get('target',{}).get('id'),'sections':{k:v.get('total') for k,v in d.get('sections',{}).items()},'limitations':d.get('limitations')}
    receipt=d.get('receiptId');steps.append(pre)
   subprocess.run(['git','apply','--check',str(patch_path)],cwd=repo,capture_output=True,text=True,check=True)
   subprocess.run(['git','apply',str(patch_path)],cwd=repo,capture_output=True,text=True,check=True)
   changed_text=(src/'lib/evidence-core.mjs').read_text()
   assert "import { buildContextPack } from './context-core.mjs'" in changed_text and 'function contextEvidence' in changed_text
   steps.append(call(['node',str(TOOL/'scripts/refresh.mjs'),str(gp),'--json'],json_out=True))
   args=['node',str(TOOL/'scripts/review.mjs'),str(gp),'--changed','lib/evidence-core.mjs','--before',str(before)]
   if receipt:args+=['--receipt',receipt,'--task','pr97-replay']
   rv=call(args+['--json'],json_out=True)
   review=rv.pop('data')
   review_summary={'verdict':review.get('verdict'),'changedSymbols':review.get('changedSymbols'),'review':review.get('review'),'analysis':review.get('analysis')}
   if receipt:
    e=review.get('evidence',{});review_summary['evidence']={'state':e.get('state'),'reason':e.get('reasons'),'deltas':e.get('deltas'),'questions':e.get('questions'),'resultId':e.get('resultId'),'sameGraphAsEvidence':e.get('sameGraphAsEvidence')}
   steps.append(rv)
   pages=[]
   if receipt and review_summary['evidence']['resultId']:
    off=0
    while True:
     p=call(['node',str(TOOL/'scripts/context-pack.mjs'),str(gp),'buildContextPack','--receipt',receipt,'--task','pr97-replay','--result',review_summary['evidence']['resultId'],'--section','added','--offset',str(off),'--json'],json_out=True)
     data=p.pop('data');steps.append(p)
     pages.extend({'relation':x.get('relation'),'relatedId':x.get('relatedId'),'id':x.get('id'),'itemOmitted':x.get('itemOmitted',False)} for x in data.get('items',[]))
     if data.get('nextOffset') is None:break
     off=data['nextOffset']
    review_summary['pagedAdded']=pages
   if arm=='ordinary':
    # A changed-symbol row only names contextEvidence; it does not establish
    # contextEvidence -> buildContextPack. Require the target to appear in
    # the review's relationship evidence before calling the link explicit.
    review_relationships=review_summary.get('review',{})
    target_named='buildContextPack' in json.dumps(review_relationships)
    caller_named='lib/evidence-core.mjs:contextEvidence' in json.dumps(review_relationships)
    found_in_review=target_named and caller_named
    review_summary['oracleTargetNamedInReview']=target_named
    review_summary['oracleCallerDirectlyNamedInReview']=found_in_review
    if not found_in_review:
     follow=call(['node',str(TOOL/'scripts/context-pack.mjs'),str(gp),'buildContextPack','--json'],json_out=True)
     review_summary['followupContext']=summarize_context(follow.pop('data'));steps.append(follow)
   records[arm]={'steps':steps,'pre':pre_summary,'after':review_summary,'totalWallMs':round(sum(x['wallMs'] for x in steps),1),'totalStdoutBytes':sum(x['stdoutBytes'] for x in steps)}
  finally:
   subprocess.run(['git','worktree','remove','--force',str(repo)],cwd=TOOL,capture_output=True,text=True,check=True)
 result={'status':'internal-replay-of-real-merged-change','task':'Review new callers of buildContextPack across merged PR #97','sourceBase':BASE,'sourceAfter':MERGE,'toolSourceCommit':'2bd8c19452e742213ec9f7aab0cfce7c10662f7d','oracle':{'newMappedCaller':'lib/evidence-core.mjs:contextEvidence','basis':'The actual merged source adds an import and a direct call in contextEvidence.'},'conditions':records,'limits':['Two serial tool flows run by the same script; no independent participant or agent decision','Timing includes process startup and can reflect cache/order effects','stdout bytes are not LLM tokens','One source relationship does not establish API completeness, behavioral correctness or user value']}
OUT.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'oracle':result['oracle'],'ordinary':{'ms':records['ordinary']['totalWallMs'],'bytes':records['ordinary']['totalStdoutBytes'],'reviewLinked':records['ordinary']['after']['oracleCallerDirectlyNamedInReview'],'followupCallerCount':records['ordinary']['after'].get('followupContext',{}).get('callerCount')},'receipt':{'ms':records['receipt']['totalWallMs'],'bytes':records['receipt']['totalStdoutBytes'],'state':records['receipt']['after']['evidence']['state'],'added':records['receipt']['after'].get('pagedAdded')}},indent=2))
