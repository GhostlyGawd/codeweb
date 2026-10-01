"""Reproduce the research exports and report from preserved reviewed handoffs."""
import json,csv,pathlib,collections,urllib.parse,hashlib,datetime,math
P=pathlib.Path(__file__).parent; REPO=pathlib.Path('$LOCAL_HOME/Repositories/codeweb')
inputs=['EVIDENCE-SEED.jsonl','PILOT-EVIDENCE.jsonl','L123-EVIDENCE.jsonl','L123-SUPPLEMENT-EVIDENCE.jsonl','L456-EVIDENCE.jsonl','L456-SUPPLEMENT-EVIDENCE.jsonl','FINAL-TECH-EVIDENCE.jsonl','FINAL-MARKET-EVIDENCE.jsonl']
rows=[];provenance={}
for fn in inputs:
 for line in (P/fn).read_text().splitlines():
  r=json.loads(line);rows.append(r);provenance[r['id']]={'file':fn,'sha256':hashlib.sha256((P/fn).read_bytes()).hexdigest(),'annotations':[]}
assert len(rows)==len({r['id'] for r in rows})==len({r['incident_dedup_key'] for r in rows})
by={r['id']:r for r in rows}
# Apply independently approved access annotations only to derivative export.
for fn in ['FINAL-TECH-ACCESS-ANNOTATIONS.jsonl','FINAL-MARKET-RECOVERY.jsonl']:
 for line in (P/fn).read_text().splitlines():
  a=json.loads(line);id=a.get('accepted_id') or a.get('id');r=by[id]
  if a.get('source_access')=='opened_full':r['source_access']='opened_full'
  note=a.get('status_annotation') or a.get('annotation');r['notes_and_limits']+=' Later additive review: '+note
  provenance[id]['annotations'].append({'file':fn,'annotation':a})
schema=json.loads((REPO/'reports/user-pain-research-plan-2026-09-27/EVIDENCE-SCHEMA.json').read_text())
for r in rows:
 if 'review_priority' in r: provenance[r['id']]['source_review_priority']=r.pop('review_priority')
assert all(set(r)==set(schema['required_fields']) for r in rows)
def dump(fn,x): (P/fn).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def jl(fn,items): (P/fn).write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in items))
override_path=P/'PARENT-CORRECTION-1-FIT-OVERRIDES.json'
if override_path.exists():
 for a in json.loads(override_path.read_text())['records']:
  r=by[a['id']];r['codeweb_fit']=a['codeweb_fit'];r['fit_reasoning']=a['fit_reasoning']
  provenance[a['id']]['parent_correction']={'number':1,'file':override_path.name,'sha256':hashlib.sha256(override_path.read_bytes()).hexdigest(),'changed_fields':['codeweb_fit','fit_reasoning']}
jl('EVIDENCE.jsonl',rows);dump('EVIDENCE-PROVENANCE.json',provenance)
with (P/'EVIDENCE.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(schema['required_fields']));w.writeheader();w.writerows({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else '' if v is None else v for k,v in r.items()} for r in rows)
def norm(u):
 v=urllib.parse.urlsplit(u);host=v.netloc.lower().removeprefix('www.');path=v.path.rstrip('/');q=urllib.parse.parse_qs(v.query)
 if host=='dev.to' and 'nobody-reads-your-setup-docs' in path:return 'hanzilla.co/blog/mcp-onboarding-ten-agents-one-command'
 if host=='news.ycombinator.com':return host+path+('?id='+q['id'][0] if 'id' in q else '')
 if host.startswith(('forum.','community.')) and '/t/' in path:
  seg=path.split('/');ids=[s for s in seg if s.isdigit()]
  if ids:return host+'/t/'+ids[0]
 return host+path
reg={}
def insert(u,obs):
 k=norm(u);e=reg.setdefault(k,{'canonical_key':k,'url':u,'observations':[],'fully_read':False});e['observations'].append(obs);e['fully_read']|=bool(obs.get('full_credit'))
for l in (P/'SOURCE-REGISTRY-CANDIDATE.jsonl').read_text().splitlines():
 r=json.loads(l)
 for o in r['observations']:insert(r['url'],o)
for fn in ['FINAL-TECH-SOURCES.jsonl','FINAL-MARKET-SOURCES.jsonl']:
 for line in (P/fn).read_text().splitlines():
  r=json.loads(line);insert(r['url'],{'file':fn,'source_id':r.get('source_id'),'access':r['source_access'],'full_credit':r['fully_read'],'boundary':r['read_boundary'],'notes':r.get('notes'),'ids':r.get('evidence_ids',[])})
for n,e in enumerate(reg.values(),1):
 e['source_id']='S%03d'%n;e['best_access']='opened_full' if e['fully_read'] else 'opened_partial' if any(o['access']=='opened_partial' for o in e['observations']) else 'inaccessible'
 e['record_ids']=sorted({r['id'] for r in rows if norm(r['source_url'])==e['canonical_key']}|{id for o in e['observations'] for id in o.get('ids',[])})
 # Six accepted HN comment links belong to one fully read story tree.
 if e['canonical_key']=='news.ycombinator.com/item?id=48406358':e['record_ids']=sorted(set(e['record_ids'])|{'CW-L%03d'%n for n in range(16,22)})
jl('SOURCE-REGISTRY.jsonl',reg.values())
counts={'evidence_records':len(rows),'evidence_types':dict(collections.Counter(r['evidence_type'] for r in rows)),'source_attempts_canonical':len(reg),'source_access':dict(collections.Counter(e['best_access'] for e in reg.values())),'full_sources_supporting_retained_records':sum(e['fully_read'] and bool(e['record_ids']) for e in reg.values()),'record_source_families':dict(collections.Counter(r['source_family'] for r in rows)),'dated_in_preferred_window':sum(bool(r['published_at']) and r['published_at'][:10]>='2026-03-28' for r in rows),'dated_older':sum(bool(r['published_at']) and r['published_at'][:10]<'2026-03-28' for r in rows),'unknown_publication_dates':sum(not r['published_at'] for r in rows)}
full=counts['source_access']['opened_full'];short=150-full;dump('COUNTS.json',counts)
qfiles=['QUERY-LOG-SEED.csv','L123-QUERY-LOG.csv','L123-SUPPLEMENT-QUERY-LOG.csv','L456-QUERY-LOG.csv','L456-SUPPLEMENT-QUERY-LOG.csv','FINAL-TECH-QUERY-LOG.csv','FINAL-MARKET-QUERY-LOG.csv'];qrows=[]
for fn in qfiles:
 for i,r in enumerate(csv.DictReader((P/fn).open()),1):qrows.append({'source_file':fn,'source_row':i,'query':r.get('query',r.get('queries_executed','')),'original_fields_json':json.dumps(r,ensure_ascii=False)})
with (P/'QUERY-LOG.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['source_file','source_row','query','original_fields_json']);w.writeheader();w.writerows(qrows)
# Pilot's three queries were documented in Markdown; retain separate transparent entries.
with (P/'QUERY-LOG.csv').open('a',newline='') as f:
 w=csv.writer(f)
 for i,q in enumerate(['Claude Code grep LSP works experience blog','site.github.com/anthropics/claude-code/issues ignores MCP tools grep','site.github.com/anthropics/claude-code/issues "MCP" "never uses"'],1):w.writerow(['PILOT-SOURCE-MAP.md',i,q,json.dumps({'method':'web.search_query','date':'2026-09-28','result':'See accepted pilot source map'})])

def refs(*ids):return ', '.join('['+id+']('+by[id]['source_url']+')' for id in ids)
def write(fn,text):(P/fn).write_text(text.strip()+'\n')
write('README.md',f'''# Codeweb user-pain research — holistic synthesis

Prepared 28 September 2026. **Research package delivered for independent final review; breadth target missed.** {full} fully read original source units versus the 150–200 target ({short} below the lower bound). There are 132 deduplicated evidence records, including 119 labeled firsthand reports; these include builders, technical investigations and a demonstration, not 119 verified ordinary users. No interviews or Codeweb retention/purchase tests occurred. [Counts](COUNTS.json), [source boundaries](SOURCE-MAP.md), [review](REVIEW.md).

**Recommendation:** retain agent-heavy developers working their own repositories as the primary audience. Test one conditional job: before a risky cross-file edit, identify mapped consumers and existing implementation candidates that the agent would otherwise miss. Deliver a small optional in-agent evidence brief with coverage limits. Do not require it for every edit. Reviewers are a secondary audience for the same source-linked evidence. This is a product hypothesis to test, not a validated feature or charter change.

## What the evidence changes

**Reuse and change scope are plausible recurring pains.** Independent accounts describe duplicated utilities, repeated reuse prompts and difficult structural review. The mechanism can be visible in repository structure, but reuse also requires judgment about whether two pieces of code should share an abstraction. {refs('CW-T018','CW-Z003','CW-L048','CW-Z006')}.

**More context can help and still have a cost.** One small author-adjudicated experiment removed recurring false positives when reviewers could inspect callers, while recall fell. A separate small pilot found native search sufficient on clean code. Neither measures Codeweb’s incremental effect. {refs('CW-L023','CW-X001')}.

**Native integration is an outcome, not an installation checkbox.** Public reports show tools missing from particular host surfaces or worktrees, and an invocation error that was fixed by exact command syntax. Test actual availability and invocation in the intended session before interpreting non-use as rejection. {refs('CW-T002','CW-T004','CW-X009','CW-L026')}.

**A receipt must reduce decision work.** Team accounts describe voluntary tool adoption concentrating in already careful engineers, internal review alternatives and summaries that did not make large diffs reviewable. Existing CI, smaller changes and PR artifacts are strong substitutes. {refs('CW-L022','CW-Y005','CW-Y012')}.

**Paying for AI review is real in some accounts; paying Codeweb is unproven.** Annual Bugbot payment, reported cancellations and current manual cross-repo checking identify service expectations and possible jobs. They do not establish Codeweb demand or a budget owner. {refs('CW-Y001','CW-Y002','CW-Y007')}.

## Choices to carry forward

1. **First free experiment:** conditional pre-edit consumer/reuse evidence for agent-heavy developers making changes in repositories with nontrivial mapped relationships. Compare against their existing grep/LSP/tests and measure total effort, false warnings and changed decisions.
2. **First paid hypothesis:** hosted coordination of cross-repository consumer checks and shared evidence. Compare against checking both repos in CI and ordinary PR history. Require an actual recurring coordination problem and a named buyer before a paid pilot.
3. **Defer:** a generic paid change receipt, universal mandatory hooks, replacement of behavioral/security review, or a separate graph-view product. Evidence does not justify these leaps. The charter keeps all local single-repo capability free.

See [opportunity decisions and falsification tests](OPPORTUNITY-DECISIONS.md), [prioritized pain map](PAIN-MAP.md), [contradictions](CONTRADICTIONS.md), and [six-lens audit overlay](AUDIT-OVERLAY.md). Six integrated briefs: [Claude](lanes/01-claude-final.md), [Codex](lanes/02-codex-final.md), [change risk](lanes/03-change-risk-final.md), [adoption](lanes/04-adoption-final.md), [trust](lanes/05-trust-final.md), [value](lanes/06-value-final.md).

## What remains unknown

Whether Codeweb changes real edit/review outcomes, week-two voluntary use, incremental token savings after verification cost, ordinary-user retention, frequency of cross-repo incidents, procurement authority, acceptable private-data flows, paid conversion and renewal. Public anecdotes cannot estimate prevalence. Source selection favors public tool communities and builders; 33 records lack exact publication dates. Dynamic/generated/multi-repo coverage is especially thin.

The original audit and four screenshots retain their hashes. The September 26 published-site audit is historical; this research did not inspect newer website candidates or perform new visual/accessibility testing. No code, charter, harness, outreach, purchase, release or publication changed. Artifacts are in the writable management workspace and attached to the parent; the originally requested repository directory remains outside this run’s writable roots. [Operational receipt](COMPLETION.json) records the source shortfall, two collection timeouts, recovery failures, and the reported pre-dispatch operator workaround.
''')
write('PAIN-MAP.md',f'''# Prioritized jobs and pains

Priorities are judgments for experiment selection, not multiplied scores or population frequencies. Severity describes reported consequences; recurrence describes independent collected contexts. Fit is inference about actual Codeweb mechanisms.

| Priority/job | Reported consequence and workaround | Recurrence / confidence | Codeweb fit and decisive limit |
|---|---|---|---|
| P1: locate existing logic and consumers before a cross-file change | Duplicate code and repeated human reuse prompts; users review small commits or use duplication tools. {refs('CW-T018','CW-Z002','CW-Z003','CW-X016')} | Several unrelated contexts across HN, blogs and Reddit; medium confidence in pain, low in incremental product effect | Mapped callers and body-similarity candidates can guide inspection. They do not establish semantic equivalence or correct architecture. |
| P1: establish enough context to judge a change | False positives, rereads and large-review burden. {refs('CW-L023','CW-L048','CW-Y012')} | Multiple contexts and families; medium confidence, no general effect size | Source-linked evidence may aid triage; business intent and runtime behavior remain outside the map. |
| P1 enabling requirement: integration actually activates | Plugins absent on a surface, hooks absent in worktrees, confusing trigger routes. {refs('CW-T002','CW-T004','CW-X009','CW-L026')} | Several concrete reports, version/surface dependent | Prove activation and expose failures. A better graph cannot repair host discovery. Resolved cases must not become permanent gap claims. |
| P2: check consumers across repositories | Repeated manual compatibility checks; CI/monorepo discussed as alternatives. {refs('CW-Y007','CW-Y004')} | One direct workflow plus one isolation evaluation; low recurrence confidence | Conditional hosted coordination hypothesis. Requires permitted source access; static relationships cannot prove contract compatibility. |
| P2: get predictable paid review service | Cancellations or renewal doubt after reliability/entitlement issues. {refs('CW-Y001','CW-Y002','CW-L012','CW-L013')} | Several provider-specific accounts; medium service-expectation confidence, low Codeweb fit | Reliability, billing clarity and queuing are hosted-service requirements, not proof of a structural-analysis need. |
| P3/outside map: enforce completion and behavioral checks | Green tests hid broken UI; cloud loop stopped before independent validation. {refs('CW-T022','CW-X013','CW-Z004')} | Multiple contexts; reported consequence serious | A structural pass is not behavioral correctness or successful execution. Keep separate checks and unresolved states visible. |

Retain native success as an explicit control: {refs('CW-X003','CW-Z001','CW-Z009','CW-L001')}. Do not target small familiar changes simply because a map can be generated. A high-priority experiment is not a commitment to implement.
''')
write('CONTRADICTIONS.md',f'''# Contradictions and rejected shortcuts

| Tempting conclusion | Counterevidence and resulting decision |
|---|---|
| Every edit needs structural context | Native bounded modularization and cloud fixes succeed; a small comparison found grep sufficient on clean code. {refs('CW-Z001','CW-Z009','CW-X001')}. Use task-conditional evidence. |
| More context always improves review | Repository access reduced false positives while lowering recall in a small case. {refs('CW-L023')}. Measure both missed defects and warning burden. |
| MCP itself is the problem | Some users prefer scripts; others retain MCP or returned after a current comparison. {refs('CW-L025','CW-L037','CW-L038','CW-L024')}. Choose by workflow and measured host behavior. |
| Paid review is pointless | Reported annual payment and continued value coexist with trial rejection and internal alternatives. {refs('CW-Y001','CW-L008','CW-Y005')}. Segment by recurring job and operational burden. |
| A summary/receipt makes any PR reviewable | Existing summaries did not remove large-diff effort. {refs('CW-Y012')}. A receipt must change correct decisions, not add prose. |
| Fewer tokens necessarily mean a cheaper workflow | Maintainers describe verification rereads offsetting prospective edit savings. {refs('CW-Z012')}. Include verification time/tokens. |
| Zero references means unused | Silent empty results after server failure and generated-member gaps undermine this assumption. {refs('CW-Z007','CW-Z011')}. Distinguish incomplete/failed analysis from a known empty set. |
| Similar bodies should be merged | Intentional duplication and human-selected abstractions appear in successful refactoring. {refs('CW-Z006')}. Candidate similarity is evidence for investigation, not an automatic edit. |
| Model subscription spend proves structural-tool value | Corrected buying records do not attribute costs to repository exploration. {refs('CW-L043','CW-L044','CW-L052','CW-L055')}. No savings or paid conversion inference. |
| More AI reviews necessarily settle the change | Review loops can keep proposing changes; some bounded native reviews stop successfully. {refs('CW-L003','CW-L004','CW-L005')}. Define merge criteria and preserve human adjudication. |

Resolution handling: CW-L026 and CW-Y008 carry specific confirmed improvements; CW-Y003’s old eligibility complaint is not a present Teams limitation. CW-Z007 has a merged first-query fix and a separate open follow-up, so blanket resolution is rejected. Stale/closed labels alone never establish a fix.
''')
write('OPPORTUNITY-DECISIONS.md',f'''# Opportunity decisions and experiments

These are ranked hypotheses. No implementation, comparison run, outreach, paid offer or charter change is authorized by this report. Existing charter-gated experiments still need their explicit go. The Product Lead owns later authorized sourcing and asynchronous research; no founder recruitment homework is created.

## 1. Conditional pre-edit consumer and reuse evidence — INVESTIGATE FIRST, FREE

**Segment/job:** agent-heavy developers working their own repository, about to change a shared implementation or extract an abstraction. **Moment:** before the edit, when the answer can change scope or reuse choice. **Evidence:** {refs('CW-T018','CW-Z003','CW-L048')}. **Counter:** {refs('CW-X001','CW-Z001','CW-Z006')}. **Alternatives:** grep, native LSP, compiler, existing duplication tools, smaller commits and human architecture decisions.

**Fit:** exact queries over mapped relations and bounded body-similarity evidence. No claim of all runtime consumers or safe deduplication. **Boundary:** local single-repo feature free forever. **Proposed test:** counterbalanced native-versus-brief comparison on ten real changes from consenting ordinary developers, including small familiar tasks and ambiguous/generated cases. Predeclare success as at least two additional actionable missed-consumer/reuse findings with no increase in median total review time; track false warnings, unnecessary edits and all query/verification cost. Reject or narrow if benefits disappear against native tools. Then observe voluntary reuse two weeks later. Thresholds are proposed decision rules, not measured results.

## 2. Source-linked review evidence packet — TEST AS SUPPORTING FREE WORKFLOW

**Segment/job:** author and reviewer trying to understand the affected scope and what was actually checked. **Evidence:** {refs('CW-L023','CW-L022','CW-Y012')}. **Counter/alternatives:** ordinary PR attachments, small changes, existing CI and in-house review {refs('CW-L001','CW-Y005')}. **Fit:** map snapshot/commit, affected mapped relationships, source links, omissions and actual validation status. Never call a structural pass correctness.

**Boundary:** single-repo generation remains free; merely styling it differently is not paid value. **Proposed test:** reviewers reconstruct what changed and why an alert exists from ordinary PR material versus the packet. Require faster correct triage on a predeclared set without hiding unknowns. Reject if the packet repeats the diff or increases reading. Retain a separate human decision about business invariants.

## 3. Hosted cross-repo consumer checks and shared evidence — FIRST PAID EXPERIMENT CANDIDATE, NOT BUILD COMMITMENT

**Segment/job:** team coordinating backend/frontend or other producer/consumer repositories. **Evidence:** one concrete manual workflow {refs('CW-Y007')}; isolation constraints {refs('CW-Y004')}; reported paid review exists elsewhere {refs('CW-Y001')}. **Confidence:** medium in the existence of the job, low in recurrence, budget ownership and willingness to buy this service.

**Alternatives:** CI checks out both repos and compiles/tests them; monorepo; code search; normal Git/PR history. **Boundary:** money may buy hosting, multi-repo aggregation or human attention, never a withheld local capability. **Proposed test:** a consenting team runs existing CI and a minimal shared packet on the same recurring changes. First identify the person who owns coordination cost and purchasing authority; then, under separate send/spend authorization, offer a concrete paid pilot. Pass only if it saves recurring coordination effort beyond CI and a real buyer purchases and later renews. Stop if policy prohibits needed transfer, existing checks do the job, or demand ends after a temporary migration ({refs('CW-Y010')}). No price has been validated.

## 4. Human-assisted private integration — DISCOVERY ONLY

**Segment/job:** organization needing source-isolation assurances or help fitting existing policies. **Evidence:** {refs('CW-Y004','CW-L034')}. **Alternative:** internal platform/security staff, local tools, no hosted service. **Boundary:** human attention can be paid; accounts/telemetry/license keys stay out of local product. **Proposed test:** a separately authorized architecture/service discussion using synthetic examples of permitted and forbidden sharing. Require a concrete paid assistance job and security-owner approval before any private-source access. Reject if advice is incidental or policy excludes the delivery model. Current evidence is too sparse to prioritize a service build.

## Decisions explicitly deferred

Generic AI-review replacement, autonomous correctness claims, mandatory hook on every edit, broad hosted security scanning, and a graph-first separate product. They exceed demonstrated fit or conflict with the product’s agent-first focus. Individual model cancellations chiefly establish service expectations, not demand for Codeweb.
''')
write('AUDIT-OVERLAY.md',f'''# Overlay on the preserved September 26 audit

Original audit and four screenshots are unchanged. This is secondary web research, not execution of the audit’s interviews, fresh-machine host tests, engine measurement, usability sessions or buyer trials. Published baseline captures are not observations of later v6 or other candidate sites. No new visual claims are made.

| Original lens | What is corroborated or challenged | Decision / still unknown |
|---|---|---|
| 1. User workflow | Reuse/scope uncertainty is reported; native success and deliberate small changes challenge a universal brief. {refs('CW-Z003','CW-T018','CW-X003','CW-Z001')} | Select conditional pre-edit scope/reuse job for direct observation. Actual Codeweb reliance and repeat use unknown. |
| 2. Host-native fit | Surface and worktree availability failures show configuration alone is insufficient. A trigger issue has a confirmed fix. {refs('CW-T002','CW-T004','CW-X009','CW-L026')} | Verify intended surface, actual tool call, returned evidence and recovery. No fresh-client compatibility matrix produced. |
| 3. Engine truth | Missing/generated relationships and false-positive/recall tradeoffs matter. {refs('CW-Z007','CW-Z011','CW-L023')} | Show graph scope/freshness/incompleteness; validate ambiguous/dynamic cases separately. No new Codeweb precision or latency benchmark. |
| 4. Experience/design | Output burden and insufficient summaries matter to review. {refs('CW-L041','CW-Y012')} | Concise consequence-to-source path is a testable requirement. This does not validate layout, accessibility or the newer candidate. Keep existing brand/audit intact. |
| 5. Paid buyer | Annual review payment and cross-repo manual work exist, but budget authority/renewal are weak. {refs('CW-Y001','CW-Y007','CW-Y010')} | Compare hosted shared checks against CI before an offer. Do not validate planned price or assume solo users are team buyers. |
| 6. Competition/distribution | Native tools, skills/scripts and internal wrappers can suffice. {refs('CW-X001','CW-L024','CW-Y005')} | Compete on a measured task outcome, not graph/tool count. Search/installation popularity is not distribution success. |

The original change-brief/receipt hypothesis survives only in narrower form: optional evidence at a consequential edit or review decision, with explicit limits and an incremental-value test. The receipt alone has no demonstrated paid job. The proposed direct observations and separately authorized buyer tests remain the way to resolve those unknowns.
''')
# Integrated lane briefs are new files; frozen original and supplemental briefs remain intact.
lanes=[
('01-claude-final.md','Claude Code', ['CW-P001','CW-T002','CW-T004','CW-X003','CW-Z003','CW-X017'], 'Host-specific tool exposure, invocation and reuse must be separated from model adherence. Native modularization and semantic navigation can succeed.', 'Audit change: prove actual tool use in the intended surface before changing packaging. Test one shared-function edit against native tools; record invocation, misses and review effort.'),
('02-codex-final.md','Codex',['CW-T016','CW-T017','CW-T020','CW-X009','CW-X013','CW-Z009'], 'Repository edits, lifecycle state, environment setup and useful change diffs are separate jobs. Historical failures are not current capability gaps; cloud success is a necessary control.', 'Audit change: validate cloud/CLI/desktop separately. Compare one caller-sensitive change with a small already-understood cloud task; retain runtime tests and actual completion evidence.'),
('03-change-risk-final.md','Cross-file change risk',['CW-T018','CW-X001','CW-X007','CW-L023','CW-Z006','CW-Z007','CW-Z011'], 'The plausible mechanism is exposing mapped consumers/reuse candidates. Runtime behavior, generated symbols and architectural choice can remain outside the map.', 'Audit change: distinguish exact graph queries from complete program knowledge. Test both missing-consumer prevention and false-warning cost, with intentionally unknown dynamic/generated boundaries.'),
('04-adoption-final.md','Adoption and native experience',['CW-L014','CW-L015','CW-L024','CW-L025','CW-L026','CW-L037','CW-Y008'], 'Adoption depends on recurring usefulness, reliable invocation and tolerable output/maintenance cost. Protocol choice is conditional; historical setup problems may already be fixed.', 'Audit change: first useful answer plus next-session voluntary reuse matters more than successful install. Observe setup, fallback, removal and a return task; do not infer retention from a report.'),
('05-trust-final.md','Team review and trust',['CW-L001','CW-L022','CW-L023','CW-L030','CW-Y005','CW-Y012'], 'Review remains accountable human work. Context can improve adjudication, but small diffs, behavioral checks, local knowledge and communication remain essential.', 'Audit change: a receipt must help a correct decision with less total effort. Compare source-linked packets with normal PR material during review and later regression reconstruction.'),
('06-value-final.md','Value, alternatives and buying',['CW-Y001','CW-Y002','CW-Y003','CW-Y004','CW-Y007','CW-Y010','CW-L035'], 'Actual provider payment and cancellation coexist with internal/free alternatives. Cross-repo coordination is a plausible paid job; purchasing authority and Codeweb value remain unproven.', 'Audit change: require a specific shared job and budget owner before hosted scope or price validation. Compare to existing CI first, then a separately authorized real paid pilot and renewal.')]
for fn,title,ids,conclusion,experiment in lanes:
 bullets='\n'.join('- '+refs(id)+': '+by[id]['reported_problem_or_success']+' **Limit:** '+by[id]['notes_and_limits'] for id in ids)
 write('lanes/'+fn,f'''# {title} — integrated brief

Final synthesis candidate; independent final review pending. Claims are reported/qualified as in [corpus](../EVIDENCE.jsonl). Coverage spans pilot, original lanes, supplements and final targeted sweeps; [source map](../SOURCE-MAP.md) gives exact boundaries. No saturation claimed.

{bullets}

**Synthesis/inference:** {conclusion}

**Decision and proposed experiment:** {experiment} No experiment executed or authorized by this report.

**Segments and moments:** use only the source-supported segments in each record. The primary proposed audience remains agent-heavy developers working their own repository, with reviewers secondary; builder demonstrations are distinct from ordinary-user outcomes. Before-edit, review/merge, return-use and buy/renew moments must not be collapsed.

**Unknowns:** incremental Codeweb effect, actual recurrence outside purposive public samples, ordinary-user week-two reuse, current host/version transfer and paid authority. See [contradictions](../CONTRADICTIONS.md) and [opportunity decisions](../OPPORTUNITY-DECISIONS.md). Earlier briefs and correction histories remain unmodified.
''')
write('SOURCE-MAP.md',f'''# Coverage and source map

{len(reg)} canonical attempted source units; **{full} fully read**, {counts['source_access'].get('opened_partial',0)} partial, {counts['source_access'].get('inaccessible',0)} inaccessible at best recorded access. The 150–200 full-read target is missed by {short} at the lower bound. {counts['full_sources_supporting_retained_records']} full units directly support retained IDs; other full units include resolution/capability support, alternatives and exclusions. None becomes an extra customer incident.

132 records: {counts['evidence_types']}. Exact publication dates: 77 within March 28–September 28 2026, 22 older, 33 unknown. Dates describe publication, not necessarily event/current capability. Two 2021 Sonar examples are explicit historical exceptions outside the preferred two years; use only for tentative purchase-process questions, not present capabilities or prices.

Record family mix: {counts['record_source_families']}. This is purposive research dominated by public issue trackers, engineering writers and tool communities, not a prevalence sample. Builder/commercial and AI-assisted accounts are labeled. Ordinary retention, buyer authority, dynamic/multi-repo incidents and private-source procurement remain thin.

[SOURCE-REGISTRY.jsonl](SOURCE-REGISTRY.jsonl) preserves every observation and read boundary; one canonical unit gets at most one full credit even if recovered later. [QUERY-LOG.csv](QUERY-LOG.csv) retains original row fields and origin; a row can contain grouped queries and is not necessarily one search call. Search snippets never supply findings. No null-sweep saturation claim is made: useful material still emerged, while time/access/output limits stopped breadth.

Full means the declared original article prose or exposed public thread text was read; it does not include unvisited attachments, videos, private/deleted comments, linked repositories or downstream papers. Some forum full credits cover all exposed text rather than reconstruction of missing posts. Review independently sampled claims/read boundaries, not every credited unit. Reopens during review add no source credits.

Access limits: public GitHub REST rate limits, direct forum JSON HTTP403, cache misses, inaccessible LinkedIn/blog pages and hidden Reddit replies. Large fetched threads were often only partially inspected and stay partial. Agent-local fallbacks recovered some HTML/API originals; metadata downloads were never equated with reading. See original registries for exact failures and exclusions.

Canonicalization removes fragments/trailing slashes and normalizes forum numeric topic IDs. Hanzilla/DEV syndication is one unit; HN comment IDs CW-L016–021 are one story source. Multiple distinct articles about one author’s continuing project can be multiple pages but remain one incident context, notably CW-Z003 and CW-Y012. [DEDUPLICATION.md](DEDUPLICATION.md) explains record handling.
''')
write('DEDUPLICATION.md','''# Deduplication and provenance

132 stable evidence IDs and 132 incident keys are retained after parent comparison of canonical URLs, author/context and reviewed handoff qualifications. Exact-key uniqueness alone was not treated as semantic proof. No additional duplicate incident was identified; residual hidden crossposting or undisclosed commercial identity cannot be ruled out.

- Shared Reddit/HN/CNCF URLs contain different named participant experiences; source threads count once. No source thread is multiplied by its replies.
- CW-L016–021 are six author contexts in HN story 48406358; repeated comments from each author are grouped. The story is one source unit.
- CW-L022 and HN gbrindisi describe one Synthesia workflow; the HN comment was not an added record.
- CW-X002's retelling of the AgentConnect study is not another measurement; retain its explicitly AI-authored/operator provenance, distinct from CW-X001's pilot.
- CW-Z003 groups Haldimann's original and follow-up. CW-Y012 groups one team across three longitudinal articles. Pages are distinct; incidents are not multiplied.
- CW-Z011 and CW-Z012 share maintainer participation but concern different generated-symbol and editing-cost contexts. They are not two independent users.
- CW-T001 remains a conservative grouped report with original reporter and named successful commenters distinguished. Never attribute commenter recovery to the original author.
- CW-L027 Hanzilla and its DEV mirror are one source and one builder context.
- CW-L026 and CW-T020 received independently reviewed additive full-access annotations; originals remain unchanged. CW-X014 stayed partial.

EVIDENCE-PROVENANCE.json records each accepted source file/hash and derivative annotations. Exported CSV and JSONL are alternate representations, not extra evidence. Unknown dates/segments remain unknown. The 119 first_person_report labels include builder/dogfooding and demonstration evidence, so do not call them 119 independent ordinary customers or observed Codeweb users.
''')
# Explicit high-priority claim-to-evidence ledger for final independent review.
claims=[('H1','Conditional consumer/reuse job, not universal brief',['CW-T018','CW-Z003','CW-X001','CW-Z001']),('H2','Context can reduce false positives with recall/effort tradeoffs',['CW-L023','CW-Z012']),('H3','Actual surface/worktree invocation is a prerequisite',['CW-T002','CW-T004','CW-X009','CW-L026']),('H4','Empty/generated results must not imply completeness',['CW-Z007','CW-Z011']),('H5','Receipt must beat existing PR/CI processes',['CW-L022','CW-Y005','CW-Y012']),('H6','Hosted cross-repo job is plausible, buyer/value unproven',['CW-Y007','CW-Y004','CW-Y001']),('H7','Provider switching does not establish structural demand',['CW-Y002','CW-Y003','CW-L055']),('H8','Structural checks do not replace behavior or execution verification',['CW-T022','CW-X013','CW-Z004'])]
high=sorted({id for _,_,ids in claims for id in ids});dump('CLAIM-LEDGER.json',{'claims':[{'id':id,'claim':claim,'priority':'high','evidence_ids':ids} for id,claim,ids in claims],'high_priority_evidence_ids':high,'other_records':len(rows)-len(high),'minimum_other_sample':math.ceil(.2*(len(rows)-len(high)))})
if not (P/'REVIEW.md').exists(): write('REVIEW.md','''# Independent review status

**Final holistic review pending.** This file is prepared as the review entry point, not an approval authored by the Product Lead. The Independent Reviewer owns the final verdict and may replace this status with its signed report.

Accepted child evidence audits remain available:

- PILOT-REVIEW.md: all five pilot records.
- L123-REVIEW.md: 19 of 28 technical records, including all eight declared high-priority records; one correction.
- L456-REVIEW.md: 32 of 56 records, all 25 declared high-priority plus seven others; one correction.
- L123-SUPPLEMENT-REVIEW.md: all 18 supplement records.
- FINAL-TECH-INDEPENDENT-REVIEW.md: all four high-priority plus two of eight others; six records; no correction.
- FINAL-MARKET-REVIEW.md: all seven high-priority plus two of five others; nine records and recovery support; no correction.

These are sample/source audits of bounded handoffs, not blanket endorsement of the final synthesis or all full-read declarations. Final reviewer must verify every high-priority claim in CLAIM-LEDGER.json against originals and independently audit at least 20% of the remaining records, record actual IDs, inspect corpus/source canonicalization, challenge opportunity fit, check the missed breadth target and all five baseline hashes. Review must not treat task success or first-person labels as proof of customer demand.

Required deliverables: final signed REVIEW.md and review validation/attachment, native approve or one bounded changes request. Completion receipt currently records pending review. Approval may update only independent_review/result fields and final receipt/report hashes; substantive executor corrections return to Product Lead. Do not silently waive the page shortfall or repository placement limitation.
''')
manifest=json.loads((REPO/'reports/user-pain-research-plan-2026-09-27/AUDIT-BASELINE.json').read_text());checks=[]
for r in manifest['files']:
 h=hashlib.sha256((REPO/r['path']).read_bytes()).hexdigest();checks.append({'path':r['path'],'expected':r['sha256'],'actual':h,'matches':h==r['sha256']})
assert all(c['matches'] for c in checks);dump('FINAL-BASELINE-CHECK.json',checks)
receipt={'objective':'COD-56 deep public-source user-pain research','prepared_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'in_review','independent_review':{'status':'pending','owner':'86badd16-e228-46d5-81f2-d471f9eb21c4','gate':'native parent review','claim_ledger':'CLAIM-LEDGER.json'},'counts':counts,'original_targets':{'full_sources':[150,200],'useful_firsthand_records':[80,120]},'breadth_target_met':False,'lower_full_source_shortfall':short,'record_label_count_in_target_band':True,'record_count_caveat':'119 firsthand labels include builders, investigations and demonstration; not independently validated ordinary customer incidents.','all_required_artifacts_prepared':True,'overall_objective_verified_complete':False,'baseline_hashes_match':True,'children_used':6,'max_children':6,'corrections':{'COD-59':1,'COD-60':1,'parent':1},'runtime':{'collection_timeouts':[{'issue':'COD-56','run':'7a7cafd7-8c6b-4ea8-bab1-7d5af6ea7454','seconds':600},{'issue':'COD-63','run':'a0d3e815-d72d-420c-947c-12ff99ea7588','seconds':600}],'recovery_failures':['COD-63 status-only recovery denied artifact/document writes HTTP403; two blocked-status writes failed.','Product Lead recovery checkout on COD-63 returned HTTP409; no retry/override. Native comment continuation then completed normal-model upload/review.'],'operator_interventions':[{'phase':'pre-dispatch','status':'reported in authorization payload','description':'Root exec EMFILE; existing CLI worked from Node execution context.'}],'agent_local_adaptations':['In-memory artifact upload after helper mktemp sandbox failure','Public HTML/API retrieval fallbacks and bounded rereads','Native continuation after timeout and role-preserving comment coordination'],'manual_wake_loops':False,'intervention_free_claim':False},'scope':{'interviews':0,'outreach_sent':0,'purchases':0,'product_changes':0,'charter_changes':0,'releases':0,'publication':False,'experiments_executed':0},'placement':{'actual':str(P.resolve()),'requested':str(REPO/'reports/user-pain-research-2026-09-27'),'requested_path_written':False,'reason':'Repository destination outside current writable roots; board attachments provide portable deliverables.'},'remaining_unknowns':['Incremental Codeweb value and week-two reliance','Ordinary non-builder retention','Paid authority, conversion and renewal','Private-source transfer/isolation policy','Dynamic/generated and multi-repo coverage'],'completion_boundary':'Substantive research/synthesis delivered with explicit coverage shortfall; final native independent review required before done.'}
if (P/'PARENT-CORRECTION-1-VALIDATION.json').exists():
 receipt['parent_correction']={'number':1,'requested_defect':'F1 generic fit in 19 records','changed_ids':json.loads((P/'PARENT-CORRECTION-1-VALIDATION.json').read_text())['changed_ids'],'changed_fields':['codeweb_fit','fit_reasoning'],'validation':'PARENT-CORRECTION-1-VALIDATION.json','status':'addressed; independent verification pending'}
 receipt['independent_review']['prior_decision']='changes_requested'
 receipt['independent_review']['request_report']='PARENT-CORRECTION-1-REQUEST.md'
dump('COMPLETION.json',receipt)
print(json.dumps({'counts':counts,'high_priority_records':len(high),'minimum_other_sample':math.ceil(.2*(len(rows)-len(high))),'exports_ready':True,'baseline_matches':True}))
