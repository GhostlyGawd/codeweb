import os,json,pathlib,re,urllib.request,datetime
root=pathlib.Path('reports/hypothesis-pressure-test-2026-09-29').resolve()
base=os.environ['PAPERCLIP_API_URL'].rstrip('/');company=os.environ['PAPERCLIP_COMPANY_ID'];parent=os.environ['PAPERCLIP_TASK_ID']
lead='47d9b132-0c5f-45f1-9cb1-e1143ba53e00';tech='79d272db-70e2-483b-b817-292dac08593e';qa='86badd16-e228-46d5-81f2-d471f9eb21c4'
headers={'Authorization':'Bearer '+os.environ['PAPERCLIP_API_KEY'],'X-Paperclip-Run-Id':os.environ['PAPERCLIP_RUN_ID'],'Content-Type':'application/json'}
def api(method,path,data=None):
 req=urllib.request.Request(base+'/api/'+path,headers=headers,data=json.dumps(data).encode() if data is not None else None,method=method)
 try:
  with urllib.request.urlopen(req) as r: out=json.load(r)
 except urllib.error.HTTPError as e:
  print(e.code,e.read().decode());raise
 return out
plan=(root/'PLAN.md').read_text();assign=(root/'ASSIGNMENTS.md').read_text();parts=re.split(r'(?m)^## (?=\d\d —)',assign);sections={int(p[:2]):p for p in parts[1:]}
common=f'''Authorized read-only pressure test for [COD-76](/COD/issues/COD-76). This is a separate substantive assignment, not a generic plausibility critique.

Root: `{root}`. Read PLAN.md, ASSIGNMENTS.md, ACCEPTANCE.json and INITIAL-VERIFICATION.json. Verify INPUT-MANIFEST.json SHA256 748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852 and relevant originals under inputs/. Frozen inputs must never be edited. Complete frozen packet is available to every assignment; use original evidence records/source passages, not summaries alone.

Use a fresh first-draft task context. Record actual issue ID, run ID, session identity if available (otherwise explicitly unavailable), input-manifest hash and output SHA256 in receipts/<assignment>.json. Lead will independently check runtime sessions. Do not read other lens outputs while preparing a lens first draft. Shared filesystem isolation is procedural, not an access-control guarantee. Preserve the first draft before any correction under history/. One corrective attempt only; preserve diff/review history. Existing 600-second windows and one concurrent run per role remain unchanged. No manual wake loops, new agents, services, product edits, external sends or invented customer evidence. Targeted original public reopens allowed with captured provenance; no interview simulation.

Return the full common finding schema with stable Lxx-Fxx IDs, strongest for/against evidence, original URL and passage/capture pointers, supported actor/task/conditions, failure scenario, verdict, weakest assumption, local-versus-paid implication and minimal falsification test. Every material finding must be machine-readable in lenses/NN-findings.json alongside its Markdown report; include evidence_ids and opposing_evidence_ids. Source gaps remain explicit. Do not treat source counts as prevalence, static checks as behavior, similarity as semantic reuse, mapped consumers as runtime completeness, or model agreement as customer evidence.

Upload your report and finding JSON/receipt as portable attachments/work products on THIS issue. Post verdict and paths on THIS issue only; mark done once the assignment's report is delivered (a negative verdict can be done). Do not post to parent; native dependencies route continuation. A concrete inability to deliver must name the blocker. No self-review approval.
'''
records=[]
def create(key,title,desc,parentid,owner,reason):
 out=api('POST','companies/'+company+'/issues',{'title':title,'description':desc,'parentId':parentid,'status':'backlog','priority':'medium'})
 rec={'key':key,'id':out['id'],'identifier':out['identifier'],'parentId':parentid,'owner':owner,'qualifying_reason':reason,'blockedByIssueIds':[],'initial_status':'backlog'};records.append(rec)
 (root/'CONTROL-PLANE.json').write_text(json.dumps({'parent':parent,'dispatch_run':os.environ['PAPERCLIP_RUN_ID'],'tasks':records},indent=2)+'\n')
 print(key,out['identifier'],flush=True);return rec
phase_desc=f'''Phase coordination for [COD-76](/COD/issues/COD-76), not a substantive lens assignment. Read `{root}/PLAN.md`, ASSIGNMENTS.md and ACCEPTANCE.json; exact approved criteria remain binding. Lead owns original criteria, verification, one correction per task, and native dependency continuation. Do not create duplicates or additional children. CONTROL-PLANE.json lists the complete graph. Read dependency artifacts, verify hashes and identities; inspect queued native comments before any recovery. Preserve all first drafts. Never equate phase closure to objective completion. Final source placement in the canonical repository remains required; worker staging alone is not completion.''' 
a=create('phase-A','Pressure test phase A — six distinct foundational lenses',phase_desc+'\nWhen six lens dependencies finish, verify all six reports/finding tables, receipts, evidence pointers and session freshness. Record PHASE-A-RECEIPT.json, request at most one correction on the existing task with structured resume:true if needed; use native blockers for any correction. Mark done only when all six artifacts are delivered and checked.',parent,lead,'Phase ownership and six-child governance boundary')
b=create('phase-B','Pressure test phase B — six distinct reliance and ceiling lenses',phase_desc+'\nAfter phase A and lenses 07–12 finish, verify six complete outputs and receipts. Create the deterministic SYNTHESIS-INPUT-MANIFEST.json: sorted relative paths plus SHA256 for frozen INPUT-MANIFEST.json, PLAN.md, ASSIGNMENTS.md, all files under inputs/, and exactly twelve lens Markdown reports plus twelve findings JSON files and any lens source addenda. Exclude other drafts, phase verdicts and synthesis outputs. Freeze this identical full packet before marking phase B done. Record PHASE-B-RECEIPT.json and session checks. Do not inject a preferred recommendation into synthesis handoffs.',parent,lead,'Phase ownership and six-child governance boundary')
c=create('phase-C','Pressure test phase C — independent syntheses, fidelity review and final edit',phase_desc+'\nWait for both independent synthesis drafts and adversarial verdict. Then Product Lead edits final hypothesis/tests and all required ledgers, preserves justified disagreements and edit diffs. Own README.md, FINAL-HYPOTHESIS.md, VALIDATION-TESTS.md, FINDING-COVERAGE.json, CLAIM-LEDGER.json, BREADCRUMBS.json, EVIDENCE-USE.json, DISAGREEMENTS.md, SOURCE-ADDENDUM.*, SOURCE-GAPS.md, RUNS.json, OUTPUT-MANIFEST.json and preliminary COMPLETION.json. Every original evidence record needs usage or justified nonuse; every major decision needs backwards evidence and forward unresolved test. Verify run/session identities and identical synthesis packet hashes, report procedural blinding limits. Preserve originals. Package and upload full packet; mark this phase done after editing/validation, explicitly pending final native review on the coordinating parent. Parent owns final reviewer routing, correction, source placement and final completion.',parent,lead,'Synthesis/edit phase ownership and three-child governance boundary')
lenses=[]
for n in range(1,13):
 title=sections[n].splitlines()[0][5:]
 slug=re.sub('[^a-z0-9]+','-',title.lower()).strip('-')
 owner=qa if n%2 else tech
 desc=common+'\n## Exact assignment\n'+sections[n]+f'\nDeliver lenses/{n:02d}-{slug}.md and lenses/{n:02d}-findings.json and receipts/L{n:02d}.json. This assignment is separate because its analytical question and first draft are independently reviewable. '+('Can start now: frozen inputs verified and no analytical predecessor required.' if n<=6 else 'Starts after phase A verification; its own analysis must use the original packet, not preceding verdicts.')
 lenses.append(create(f'L{n:02d}',f'Pressure test lens {n:02d} — {title}',desc,(a if n<=6 else b)['id'],owner,'Separately approved independent analytical deliverable'))
synth=[]
for n,label,owner in [(13,'A',tech),(14,'B',lead)]:
 desc=common+'\n## Exact assignment\n'+sections[n]+f'''\nDeliver SYNTHESIS-{label}.md, SYNTHESIS-{label}-MAPPING.json and receipts/S{label}.json. Use stable S{label}-Cxx claim IDs. Read and verify the complete SYNTHESIS-INPUT-MANIFEST.json created by phase B. Both syntheses receive exactly this same full original corpus plus all twelve reports/finding tables and source addenda. DO NOT read the other synthesis draft, verdict, mapping, receipt or review before your complete first draft is frozen. Do not read phase recommendations or the coordinating parent's running analysis. Record packet hash and files actually read. Your fresh issue context and runtime session must be checked, not assumed. Freeze an immutable first-draft copy under history/synthesis-{label}/ before marking done. Any shared-model/shared-filesystem limitation must be explicit. Synthesis is not a lens: account for every material finding with a disposition and reason in your mapping, preserve counterevidence and unresolved tests. No customer evidence can be added by consensus. Starts only after phase A and phase B have verified all twelve lenses and the identical input manifest.'''
 synth.append(create('S'+label,f'Pressure test independent synthesis {label}',desc,c['id'],owner,'Independent full-packet synthesis and blinded first-draft boundary'))
adv=create('adversarial','Pressure test adversarial evidence and fidelity audit',common+'\n## Exact assignment\n'+sections[15]+'''\nBoth frozen syntheses and their full finding mappings are prerequisites. Deliver ADVERSARIAL-REVIEW.md and structured findings/correction requests plus receipt. Audit every material claim, all quantities/pricing/capabilities, disagreements and all twelve finding sets against originals; identify missing usage-ledger work for the editor. You do not write either synthesis or final recommendation. Initial adverse verdict is delivered work and can be done. The final exact edited-artifact review will be the native review stage on the coordinating parent after phase C editing; this is the second stage of this same substantive review assignment, not a sixteenth assignment. On that native stage write FINAL-REVIEW.md with exact reviewed hashes and breadcrumb validation, approve only complete original acceptance or request the single bounded correction. Post only on your own assigned issue/current native review issue.''',c['id'],qa,'Independent adversarial evidence review boundary')
for r in lenses:r['blockedByIssueIds']=[] if int(r['key'][1:])<=6 else [a['id']]
a['blockedByIssueIds']=[r['id'] for r in lenses[:6]];b['blockedByIssueIds']=[a['id']]+[r['id'] for r in lenses[6:]]
for r in synth:r['blockedByIssueIds']=[a['id'],b['id']]
adv['blockedByIssueIds']=[r['id'] for r in synth];c['blockedByIssueIds']=[r['id'] for r in synth]+[adv['id']]
(root/'TASK-MATRIX.md').write_text('# Approved task graph\n\n|Assignment|Owner|Initial status|Blockers|Separate boundary|\n|---|---|---|---|---|\n'+''.join(f"|{r['key']} ({r['identifier']})|{r['owner']}|{'blocked' if r['blockedByIssueIds'] else 'todo'}|{', '.join(r['blockedByIssueIds']) or 'None: frozen inputs verified'}|{r['qualifying_reason']}|\n" for r in records))
# Wire every dependency before assigning workers, avoiding partial-graph dispatch.
for r in records:
 d=api('PATCH','issues/'+r['id'],{'blockedByIssueIds':r['blockedByIssueIds'],'status':'blocked' if r['blockedByIssueIds'] else 'backlog'})
 assert set(d['blockedByIssueIds'])==set(r['blockedByIssueIds'])
policy={'stages':[{'type':'review','participants':[{'type':'agent','agentId':qa}]}]}
p=api('PATCH','issues/'+parent,{'executionPolicy':policy,'blockedByIssueIds':[c['id']],'status':'blocked','comment':'Execution started; frozen inputs verified.\n\n- 192 files and approval-pinned hashes match in the permitted staging directory.\n- Three phase objectives and fifteen separate substantive assignments created; no lens compression.\n- Native dependencies route phase verification, two blinded syntheses, adversarial audit and lead editing. Final native review belongs to the Independent Reviewer, who authors neither synthesis.\n- Full completion, final hashes and repository placement remain pending. Product Lead owns phase verification/editing; assigned workers own each lens. No operator execution action is needed at this checkpoint.'})
assert p['status']=='blocked' and p['blockedByIssueIds']==[c['id']]
for r in records:
 d=api('PATCH','issues/'+r['id'],{'assigneeAgentId':r['owner'],'status':'blocked' if r['blockedByIssueIds'] else 'todo'})
 assert d['assigneeAgentId']==r['owner']
# Verify committed graph via actual GET, not intended payloads.
for r in records:
 d=api('GET','issues/'+r['id']);actual={x['id'] for x in d.get('blockedBy',[])}
 assert actual==set(r['blockedByIssueIds']),(r['key'],actual)
 assert d['parentId']==r['parentId'];r['verified_status']=d['status'];r['verified_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(root/'CONTROL-PLANE.json').write_text(json.dumps({'parent':parent,'dispatch_run':os.environ['PAPERCLIP_RUN_ID'],'tasks':records,'verified':True,'native_final_review':policy,'completion':False},indent=2)+'\n')
print('VERIFIED',len(records),'tasks including 3 phases and 15 substantive assignments')
