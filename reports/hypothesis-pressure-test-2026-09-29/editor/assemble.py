import json,pathlib,hashlib,copy,difflib,os,urllib.request,concurrent.futures,datetime
P=pathlib.Path(__file__).resolve().parents[1]
def read(n):return json.loads((P/n).read_text())
def write(n,d): (P/n).write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
A=read('SYNTHESIS-A-MAPPING.json'); B=read('SYNTHESIS-B-MAPPING.json'); acceptance=read('ACCEPTANCE.json')
H=P/'history/final-edit'; H.mkdir(exist_ok=True)
for n in ['RUNS.json','COMPLETION.json']:
 if not (H/n).exists(): (H/n).write_bytes((P/n).read_bytes())
checks=[]
for name,key in [('INPUT-MANIFEST.json','snapshot_path'),('SYNTHESIS-INPUT-MANIFEST.json','path')]:
 rows=read(name)['files']; bad=[x[key] for x in rows if sha(P/x[key])!=x['sha256']];assert not bad,bad
 checks.append({'manifest':name,'files':len(rows),'mismatches':bad,'sha256':sha(P/name)})
for n,h in acceptance['frozen_artifacts'].items(): assert sha(P/n)==h,n
for prefix in ['A','B']:
 for suffix in ['.md','-MAPPING.json']:
  n=f'SYNTHESIS-{prefix}{suffix}'; assert (P/n).read_bytes()==(P/f'history/synthesis-{prefix}'/n).read_bytes(),n
# Verify runtime without retaining logs, secrets or adapter config.
receipts=[read(f'receipts/L{i:02d}.json') for i in range(1,13)]+[read('receipts/SA.json'),read('receipts/SB.json'),read('receipts/L15.json')]
def runtime(r):
 run=r.get('run_id') or r.get('runId'); assert run,r.keys()
 req=urllib.request.Request(os.environ['PAPERCLIP_API_URL'].rstrip('/')+'/api/heartbeat-runs/'+run,headers={'Authorization':'Bearer '+os.environ['PAPERCLIP_API_KEY']})
 d=json.load(urllib.request.urlopen(req)); return {k:d.get(k) for k in ['id','agentId','status','startedAt','finishedAt','sessionIdBefore','sessionIdAfter','contextSnapshot']}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: runs=list(ex.map(runtime,receipts))
assert all(r['status']=='succeeded' for r in runs)
a,b=runs[12:14];assert a['sessionIdBefore'] is None and b['sessionIdBefore'] is None and a['sessionIdAfter']!=b['sessionIdAfter']
assert a['sessionIdAfter']==A['session_identity'] and b['sessionIdAfter']==B['session_id']
assert A['synthesis_input_manifest_sha256']==B['synthesis_input_manifest_sha256']==sha(P/'SYNTHESIS-INPUT-MANIFEST.json')
write('RUNS.json',{'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':runs,'editor_run_id':os.environ['PAPERCLIP_RUN_ID'],'editor_session_id':os.environ.get('CODEX_THREAD_ID'),'synthesis_independence':{'fresh_distinct_sessions_verified':True,'identical_packet_sha256':sha(P/'SYNTHESIS-INPUT-MANIFEST.json'),'limitation':'Procedural blinding only: shared model family, roles and filesystem; each role authored earlier lenses. No access-control isolation or independent customer corroboration claimed.'},'historical_activation':'CONTROL-PLANE.json and history/final-edit/RUNS.json preserve dispatch/activation states; these are not current status snapshots.'})
# Final claims use B as the explicit editorial base; A remains visible at each shared finding.
claims=copy.deepcopy(B['claims'])
for i,c in enumerate(claims,1):
 c['origin_synthesis_claim']='SB-C%02d'%i;c['id']='F-C%02d'%i;c['test_id']='F-T%02d'%i
 c['synthesis_claim_ids']=['SB-C%02d'%i]+[x['id'] for x in A['claims'] if set(x['finding_ids'])&set(c['finding_ids'])]
 c['decision_id']='F-D%02d'%i
 c['editorial_status']='hypothesis_or_boundary_not_customer_validation'
claims[3]['statement']='Require additional correct actionable decisions with no higher median total effort under the provisional sprint gate; score harms separately. A reviewer artifact must remove a named reconstruction step.'
claims[3]['minimal_falsification_test']='F-T04 applies the original provisional gate: two additional actionable findings across ten changes, no higher median combined inspection/review time; faster incorrect output fails. Equal-time correct additions count. Examine every severe miss and unwanted edit; unresolved material harm prevents an unqualified pass. No new numerical safety tolerance is asserted.'
claims[0]['minimal_falsification_test']='Compare natural scope and reuse tasks separately with competent native controls. Apply F-T04 quality/effort rule; include familiar success, same-file references and intentional duplication. No incremental correct decision or equal-quality burden benefit defeats the case; efficiency alone does not pass the original actionable-findings gate.'
extras={
 'CW-L020':(9,'counterevidence','A team reports satisfactory internal per-repository review, with human review retained for knowledge sharing. Include the selected team\'s actual internal tooling in the baseline; reject generic external-artifact value. One self-report is not comparative population evidence.','sources/L15/CW-L020.json','comment 48407230'),
 'CW-L021':(10,'direct_support','Centralized coverage can serve a legitimate governance job because local review cannot be assumed. Retained automation must be scored for coverage and cost separately from voluntary individual return; mandate alone is not earned reliance.','sources/L15/CW-L021.json','comment 48408485'),
 'CW-L056':(9,'counterevidence','Vendor internal orchestration, incremental re-review and recovery challenge coordinator distinctiveness. Compare these functions where actually available to the selected team; vendor self-use is not independent accuracy, procurement or Codeweb demand evidence.','sources/L15/CW-L056.html','orchestration, incremental re-review and failure recovery sections'),
 'CW-Z002':(3,'counterevidence','Successful lexical migration coexists with a model-name/pricing-table dependency failure. Include nonstructural dependencies and scope uncertainty; no claim a graph discovers that relation. AI-coauthored builder report and inconsistent headline/table multiplier are not a measured cost fact.','sources/L15/CW-Z002.html','What went wrong; Where it excelled/struggled')}
source=B['source_index']; canonical=[json.loads(l) for l in (P/'inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl').read_text().splitlines()]; records={r['id']:r for r in canonical}
# Claim-specific direct roles; opposing evidence stays opposing. Public observations support mechanisms only.
edges=[]
def edge(s,t,role,pointer,detail=''):
 edges.append({'from':s,'to':t,'role':role,'passage_pointer':pointer,'detail':detail})
for c in claims:
 c['evidence_edges']=[]
 for eid,role in [(e,'direct_support') for e in c['evidence_ids']]+[(e,'counterevidence') for e in c['opposing_evidence_ids']]:
  if records[eid]['evidence_type']=='independent_measurement' and role=='direct_support':role='methodological_context'
  if c['id'] in ['F-C05','F-C06','F-C07','F-C11','F-C12'] and role=='direct_support':role='methodological_context'
  pointer=source[eid]['passage_pointer']
  item={'evidence_id':eid,'role':role,'passage_pointer':pointer,'qualification':'Supports only the attributed mechanism, alternative or limitation in this claim; proposed Codeweb effect remains unobserved.'}
  c['evidence_edges'].append(item);edge(eid,c['id'],role,pointer,item['qualification'])
 for ptr in c.get('capability_or_proposal_pointers',[]):
  # Preserve explicit namespace, never conflate repository premises with customer records.
  key='CAP:'+hashlib.sha256(json.dumps(ptr,sort_keys=True).encode()).hexdigest()[:12]
  edge(key,c['id'],'capability_premise',ptr,'Frozen capability or proposal; not a customer outcome.')
 for sid in c['synthesis_claim_ids']:edge(sid,c['id'],'editorial_derivation','SYNTHESIS-'+sid[1]+'-MAPPING.json#'+sid)
 edge(c['id'],c['decision_id'],'final_decision','FINAL-HYPOTHESIS.md#'+c['id'].lower());edge(c['decision_id'],c['test_id'],'unresolved_test','VALIDATION-TESTS.md#'+c['test_id'].lower())
for eid,(num,role,reason,capture,passage) in extras.items():
 c=claims[num-1];c['evidence_edges'].append({'evidence_id':eid,'role':role,'passage_pointer':passage,'qualification':reason});edge(eid,c['id'],role,passage,reason)
 c.setdefault('editor_additions',[]).append(reason)
# Do not inherit A's union of supporting IDs as direct support. Preserve every original A association as typed context.
for c in A['claims']:
 for eid in c['evidence_ids']:
  role='capability_premise' if not eid.startswith('CW-') else 'inherited_lens_context'
  pointer=source[eid]['passage_pointer'] if eid in source else 'lenses/04-findings.json#'+eid
  edge(eid if eid.startswith('CW-') else 'CAP:'+eid,c['id'],role,pointer,'Historical synthesis association, not an additional direct final-claim observation. CW-L023 establishes inspection tradeoffs, never paid coordination demand.')
 for eid in c['opposing_evidence_ids']:edge(eid if eid.startswith('CW-') else 'CAP:'+eid,c['id'],'counterevidence',source[eid]['passage_pointer'] if eid in source else 'lenses/04-findings.json#'+eid)
for c in B['claims']:
 for eid in set(c['evidence_ids']+c['opposing_evidence_ids']):edge(eid,c['id'],'counterevidence' if eid in c['opposing_evidence_ids'] else 'inherited_lens_context',source[eid]['passage_pointer'],'Original draft association; consult final claim edges for final evidential role.')
coverage=[]
for row in B['finding_coverage']:
 r=copy.deepcopy(row); arow=next(x for x in A['finding_dispositions'] if x['finding_id']==r['finding_id'])
 r['synthesis_A_disposition']={k:v for k,v in arow.items() if k!='original_finding'};r['synthesis_B_claim_ids']=r.pop('claim_ids')
 r['claim_ids']=[x.replace('SB-','F-') for x in r['synthesis_B_claim_ids']];r['test_ids']=[x.replace('SB-','F-') for x in r['test_ids']]
 r['editor_reason']=r['reason']+' Final scoring is governed by F-T04; inherited associations do not establish measured outcomes.'
 coverage.append(r)
 f=r['preserved_finding']
 for eid in set(f.get('evidence_ids',[])+f.get('opposing_evidence_ids',[])):
  role='counterevidence' if eid in f.get('opposing_evidence_ids',[]) else ('inherited_lens_context' if eid.startswith('CW-') else 'capability_premise')
  edge(eid if eid.startswith('CW-') else 'CAP:'+eid,r['finding_id'],role,source[eid]['passage_pointer'] if eid in source else r['source_file']+'#'+eid,'Lens-level context retained without promoting it to direct final support.')
 for sid in r['synthesis_B_claim_ids']+arow['downstream_claim_ids']:edge(r['finding_id'],sid,'finding_interpretation',r['source_file']+'#'+r['finding_id'])
 for cid in r['claim_ids']:edge(r['finding_id'],cid,'finding_disposition',r['source_file']+'#'+r['finding_id'],r['editor_reason'])
assert len(coverage)==65
write('FINDING-COVERAGE.json',{'findings':coverage,'corrections':['L15-F01','L15-F02','L15-F03'],'all_material_lens_findings':65})
write('CLAIM-LEDGER.json',{'claims':claims,'edge_policy':'Only final evidence_edges declare direct support. Historical synthesis/lens associations are contextual unless explicitly typed otherwise. Direct support for a proposed mechanism is not observed Codeweb effect.','capability_namespace':'CAP:; original capability/proposal pointers retained on each claim and in original lens records.'})
usage=[]
for old in B['evidence_use']:
 r=copy.deepcopy(old);eid=r['evidence_id'];r['original_synthesis_B_usage']=old['usage']; r['claim_ids']=sorted({c['id'] for c in claims if any(e['evidence_id']==eid for e in c['evidence_edges'])})
 r['roles']=[{'claim_id':c['id'],**e} for c in claims for e in c['evidence_edges'] if e['evidence_id']==eid]
 r['original_record']=records[eid]
 if eid in extras:r['usage']='qualified';r['reason']=extras[eid][2];r['capture_pointers']=sorted(set(r['capture_pointers']+[extras[eid][3]]));r['passage_pointer']=extras[eid][4]
 elif r['claim_ids']:r['usage']='used_with_typed_roles';r['reason']='Used only in the listed claim-specific roles; original source limits remain binding. '+records[eid]['reported_problem_or_success']
 elif r['finding_ids']:r['usage']='preserved_lens_context';r['reason']='Retain the named lens context and original record; no additional direct final-claim inference. '+records[eid]['notes_and_limits']
 else:r['usage']='not_used';r['reason']='No distinct final consumer/reuse or residual-coordination decision is established by this record: '+records[eid]['reported_problem_or_success']+' Retained for audit; '+records[eid]['notes_and_limits']
 usage.append(r)
 edge('SOURCE:'+eid,eid,'source_record',r['record_pointer'],r['passage_pointer'])
 for capture in r['capture_pointers']:edge('CAPTURE:'+capture,eid,'captured_passage',r['passage_pointer'],r['limits'])
assert len(usage)==132
write('EVIDENCE-USE.json',{'records':usage,'record_count':132,'population_inference':False})
for eid,(num,role,reason,capture,passage) in extras.items():
 edge(eid,'L15-F02',role,passage,reason)
 edge('L15-F02',claims[num-1]['id'],'editorial_correction','lenses/15-findings.json#L15-F02',reason)
# One shared edge identity powers both directions, preventing divergent roles.
forward={};reverse={}
for i,e in enumerate(edges):e['id']='E%04d'%(i+1);forward.setdefault(e['from'],[]).append(e['id']);reverse.setdefault(e['to'],[]).append(e['id'])
write('BREADCRUMBS.json',{'edges':edges,'forward':forward,'reverse':reverse,'source_index':source,'navigation':'Resolve an edge ID in edges; both indices reference the same role and passage. CAP namespace denotes capability/proposal premises, never canonical customer IDs.'})
intro='''# Final edited hypothesis — pending independent final review

Revise the strategy. Narrow the free local product hypothesis to conditional factual inspection, split into consumer scope and reuse-candidate discovery. Leave paid coordination unresolved and reject automatic progression from useful free inspection to a durable paid business. The corpus supports investigating mechanisms, not prevalence, causal product outcomes, customer dependence or willingness to pay.

The strongest rival is competent native search/LSP, small changes, normal source inspection, tests, clone checking, maintained instructions and ordinary PR/CI practice. Human semantic and architectural judgment remains necessary. A useful episodic free tool is a legitimate ceiling. The charter remains unchanged; this report neither implements nor authorizes a new product, trial, outreach, offer or release.

'''
text=intro
for c in claims:
 text+=f"## {c['id']} — {c['statement']}\n\nDecision {c['decision_id']}: **{c['verdict']}**. {c['supported_actor_task']}\n\nConditions: {c['conditions']}\n\nSupported case: {c['strongest_supported_case']}\n\nStrongest countercase: {c['strongest_countercase']}\n\nFailure: {c['failure_scenario']} Weakest assumption: {c['weakest_assumption']}\n\nLocal: {c['local_implication']} Paid: {c['paid_implication']}\n\n"
 for add in c.get('editor_additions',[]):text+=add+'\n\n'
 text+='Sources and roles: '+', '.join(e['evidence_id']+' ('+e['role']+')' for e in c['evidence_edges'])+'. Exact passages, captures and limits: CLAIM-LEDGER.json and EVIDENCE-USE.json.\n\n'
 text+='Findings: '+', '.join(c['finding_ids'])+'. Draft paths: '+', '.join(c['synthesis_claim_ids'])+'. Unresolved test: '+c['test_id']+'.\n\n'
(P/'FINAL-HYPOTHESIS.md').write_text(text)
testintro='''# Proposed validation tests — none executed or newly authorized

Rank the work by information gained: first F-T02 delivery and F-T03 trust boundaries; then F-T01/F-T04 local incremental value; then F-T09 residual coordination with an adequate baseline and F-T11 feasibility/economics. F-T05 repeat use, F-T06 withdrawal, F-T07 capability expansion, F-T08 compounding and F-T10 shared reliance are stronger follow-on questions, not silently added obligations within the original sprint. F-T12 is the strategic decision checkpoint.

The original five-person, ten-change, two-week sprint is preserved as a proposal. Its provisional local gate is **two additional actionable findings across ten changes and no higher median total inspection/review time**. Correct equal-time additional information counts toward that gate. Faster incorrect answers fail; time savings alone do not meet the actionable-findings gate. Record a separate equal-quality efficiency result if appropriate.

Adjudicate decision correctness, severe misses and unwanted edits separately from effort. Show every case and participant distribution, including setup, source rereading, author/reviewer work, refresh, failed invocation and recovery. A favorable median never cancels a serious adverse case. An unresolved material harm prevents an unqualified pass and requires adjudication before continuation; no numerical safety tolerance is invented here. No-opportunity is inconclusive, distinct from eligible nonuse.

Use competent controls with the same host/model, repository, ordinary tests and expert help. Include familiar native-success tasks, same-file references, intentional duplication, nonstructural model-name/cost-table dependencies and unknown generated/runtime scope. Do not claim that static mapping discovers every dependency. Compare each team's actual internal review/CI workflow, including orchestration and re-review where available. A baseline is adequate only if it actually runs the selected agreed checks on the required producer/consumer revisions, handles changed revisions/failures and reaches the responsible reviewer; benchmark residual work after that, not a deliberately weak CI strawman.

Governance coverage is a legitimate separately scored organizational benefit. Mandatory execution, retained automation, voluntary individual return and purchase/renewal are different outcomes. Record who benefits, who pays, policy permission, failure recovery and total costs. The charter's EUR10 intent is not a live offer. EUR100/EUR750 strategy arithmetic is hypothetical, not observed margin or willingness to pay.

'''
for c in claims:testintro+=f"## {c['test_id']}\n\nBackwards decision: {c['decision_id']} / {c['id']}; evidence and counterevidence remain in CLAIM-LEDGER.json.\n\n{c['minimal_falsification_test']}\n\nAll quality/effort wording is subordinate to the explicit rule above. Outcome: unresolved; no participants, buyer or measured product effect observed in this review.\n\n"
(P/'VALIDATION-TESTS.md').write_text(testintro)
(P/'DISAGREEMENTS.md').write_text('''# Preserved disagreements and editorial resolutions

A and B agree on narrowing local inspection, unresolved paid value and rejection of automatic commercial progression. Agreement is correlated analysis, not new evidence.

- **L15-F01, attribution:** A's union-derived support lists are retained as inherited lens context, not direct observations. CW-L023 supports inspection/precision-recall tradeoffs, not paid coordination. CAP anchors establish frozen capability/proposal premises. Final edges explicitly state their roles and both graph directions share one edge record.
- **L15-F02, alternatives:** CW-L020 qualifies generic service/receipt value with satisfactory internal review and human knowledge sharing. CW-L056 challenges orchestration distinctiveness. CW-L021 preserves legitimate coverage governance while separating it from voluntary reliance. CW-Z002 preserves successful lexical migration plus a nonstructural dependency failure, with no graph-completeness or inconsistent cost-multiplier claim.
- **L15-F03, quality versus effort:** A's acceptable effort and B's lower burden/OR formulations were ambiguous. Final F-T04 retains the original proposed two-additional-findings/no-higher-median-effort rule. Equal-time correct additions count; faster incorrect output fails. Equal-quality efficiency is reported separately. Severe misses/unwanted edits require case-level adjudication, with no invented safety tolerance. Withdrawal and compounding remain separate proposals.
- **Receipt versus handoff:** Reject a generic extra artifact as value. Retain a named revision/check-state reconstruction job only if normal PR/CI artifacts leave measurable work. L020's knowledge-sharing role survives automation.
- **Facts versus intent:** Preserve source reorientation, but reject treating mapped facts as conversational reasons, pending plans or proprietary memory. Maintenance costs can defeat compounding.
- **Convenience versus expansion:** Faster lookup is useful but cannot demonstrate a newly attainable task without a predeclared barrier and held-constant help.
- **Portable learning versus dependence:** Learned knowledge surviving removal is value, not a failed product. No opportunity is not churn. Forced merge blockage is not earned reliance.

The full 65 finding-level A/B dispositions are preserved in FINDING-COVERAGE.json. Frozen drafts remain unchanged; editor/final-from-synthesis-A.diff and final-from-synthesis-B.diff retain literal prose differences. This final edit uses B's twelve-claim structure with A's conditions and the adversarial corrections; it is not a vote count or independent third synthesis.
''')
for name in ['A','B']:(P/f'editor/final-from-synthesis-{name}.diff').write_text(''.join(difflib.unified_diff((P/f'SYNTHESIS-{name}.md').read_text().splitlines(True),text.splitlines(True),fromfile=f'SYNTHESIS-{name}.md',tofile='FINAL-HYPOTHESIS.md')))
write('editor/CORRECTIONS.json',{'editor_run':os.environ['PAPERCLIP_RUN_ID'],'changes':[{'finding':'L15-F01','resolution':'Typed shared forward/reverse edges; no inherited A association promoted into direct support.'},{'finding':'L15-F02','resolution':'Four source-specific final dispositions and comparator/coverage/scope tests.'},{'finding':'L15-F03','resolution':'Original provisional quality/effort gate preserved; equal-time and harm cases explicit.'}],'drafts_modified':False,'approval':'pending independent native final review'})
sourcefiles=[p for folder in ['sources','source-addenda'] for p in (P/folder).rglob('*') if p.is_file()]
write('SOURCE-ADDENDUM.json',{'new_reads_by_editor':False,'description':'Index of retained targeted reads and source addenda from lenses, nonauthor phase checks and adversarial review. Per-source provenance files retain actual URLs, times and access boundaries; no dates are silently repaired.','files':[{'path':str(p.relative_to(P)),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(sourcefiles)]})
(P/'SOURCE-ADDENDUM.md').write_text('# Retained targeted sources\n\nSOURCE-ADDENDUM.json inventories every retained source/addendum byte. sources/L15/PROVENANCE.json binds the four adversarial reopens; phase-A and phase-B source checks and original lens provenance retain read boundaries. The editor adds no new external read. This is an index, not a claim of full external archiving.\n')
gaps=[{'evidence_id':r['evidence_id'],'access':r['source_access'],'captures':r['capture_pointers'],'limits':r['limits']} for r in usage]
write('editor/SOURCE-GAP-INDEX.json',gaps)
(P/'SOURCE-GAPS.md').write_text('''# Source and outcome gaps

The corpus contains 132 canonical records and 110 declared fully read source units in its historical audit; neither number is a population estimate. The earlier source-volume shortfall remains. Some source dates are unresolved, some threads/comments were inaccessible or partial, and many external pages have no full capture. Preserve original EVIDENCE.jsonl, SOURCE-REGISTRY.jsonl, query logs, notes, source snapshots and corrections within inputs/ and INPUTS.zip. REFERENCE-CAPTURE-INVENTORY.json records historical available/missing temporary captures.

EVIDENCE-USE.json and editor/SOURCE-GAP-INDEX.json list all 132 record-specific access boundaries and capture availability. A local capture does not prove every linked source or thread was read. Closure is not a verified fix; vendor/builder accounts and repeated incident bundles are not ordinary independent customer samples. Historical version/price reports are not current capability/price claims. No visual comparison with newer site candidates was performed.

Runtime and capability premises remain frozen observations. No host runtime preflight, participant trial, purchase, renewal, withdrawal or compounding measurement occurred here. Policy feasibility, economic value and sufficient recurring opportunity remain unresolved. No customer answers were simulated. Source placement and independent final approval remain pending parent work.
''')
(P/'README.md').write_text('''# Codeweb hypothesis pressure test — edited packet

**Recommendation: narrow local consumer/reuse inspection; leave paid residual coordination unresolved; reject automatic free-to-paid progression.** A useful free tool is a valid outcome. Neither agent agreement nor report completion validates customer reliance or demand.

Read FINAL-HYPOTHESIS.md for the twelve decisions and VALIDATION-TESTS.md for ranked proposed tests. The strongest rival is capable native search, ordinary source/test/PR practice and adequate internal CI/review. Every proposed gain must survive that baseline. The final edit addresses all three adversarial corrections, including explicit internal-tool, governance-coverage and nonstructural-dependency countercases.

Fifteen separate substantive assignments delivered: twelve lenses, two fresh-session syntheses on identical frozen inputs, one adversarial review. FINDING-COVERAGE.json accounts for all 65 lens findings; EVIDENCE-USE.json preserves usage/nonuse and limits for all 132 canonical records. CLAIM-LEDGER.json and BREADCRUMBS.json connect sources, findings, drafts, final decisions and unresolved tests with typed reciprocal edges. Original drafts, corrections and prose diffs remain available. Frozen originals and complete synthesis packet hashes were checked again.

This is phase-C delivery, **pending independent final native review on COD-76 and verified placement in the canonical repository**. COMPLETION.json is preliminary, not objective completion. OUTPUT-MANIFEST.json defines the exact staged bytes for review; FINAL-REVIEW.md will be supplied by the independent reviewer. The parent owns that routing, one correction if needed, placement and final completion.

RUNS.json records actual completed assignment runs and sessions. Independence is procedural: shared roles/model family/filesystem can cause correlated inference. Source gaps and unexecuted tests remain explicit. No product, charter, protected harness, outreach, purchase or release changed.
''')
write('COMPLETION.json',{'phase':'C','phase_edit_complete':True,'objective_complete':False,'substantive_assignments_delivered':15,'lens_findings':65,'canonical_evidence_records':132,'frozen_checks':checks,'final_review':{'status':'pending','owner':'Independent Reviewer','routing_owner':'Product Lead on COD-76','required':'Exact final artifact hashes, all typed links, corrections and source fidelity'},'placement':{'status':'pending','staging':str(P),'required':acceptance['requested_output_directory'],'owner':'Coordinating parent; root mirror if sandbox cannot write canonical repository'},'customer_validation':False,'tests_executed':False,'correction_count_final_edit':0,'adversarial_requests_addressed':['L15-F01','L15-F02','L15-F03'],'interventions':'Historical dispatch cap/recovery and activation repair preserved in CONTROL-PLANE.json; no new recovery, children or manual wakes this phase. Parent must reconcile final intervention record.','limits':['procedural blinding, shared filesystem/roles/model','selective original passage inspection, not complete external reread','source coverage/date/archive gaps retained','no participant, purchase or renewal outcome'],'next_native_path':'Mark COD-79 done to resolve COD-76 dependency; parent routes existing independent native final review.'})
print(json.dumps({'checks':checks,'runs':len(runs),'claims':len(claims),'findings':len(coverage),'evidence':len(usage),'edges':len(edges)}))
