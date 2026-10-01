"""Pin review inputs and validate material facts without emitting private configuration."""
import json,hashlib,subprocess
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone
OUT=Path(__file__).resolve().parent;R=OUT.parent;CANDIDATE=OUT.parents[2]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def receipt(i):return read(OUT/'receipts'/(i+'.json'))
def textresult(i):
    rows=[json.loads(l) for l in receipt(i)['stdout'].splitlines()]
    return rows[-1]['result']['content'][0]['text']
start=read(R/'START.json');product_bad=[]
for p in start['product_manifest']:
    if sha(CANDIDATE/p['path'])!=p['sha256']:product_bad.append(p['path'])
integrity=[];reviewed=[]
for manifest in ['technical/MANIFEST.json','hosts/FREEZE.json','hosts-global-model-update/FREEZE.json']:
    p=R/manifest;d=read(p);rows=d.get('files') or [{'path':k,'sha256':v} for k,v in d['files_sha256'].items()]
    bad=[]
    for row in rows:
        q=p.parent/row['path'];actual=sha(q)
        if actual!=row['sha256']:bad.append(row['path'])
        reviewed.append({'path':str(q.relative_to(CANDIDATE)),'sha256':actual,'review_method':'frozen-file integrity; relevant structured/raw material inspection separately recorded'})
    integrity.append({'manifest':manifest,'manifest_sha256':sha(p),'files_checked':len(rows),'mismatches':bad})
extra=['ACCEPTANCE.md','START.json','MATRIX.json','GLOBAL-MODEL-SETTINGS.json','technical/MANIFEST.json','hosts/FREEZE.json','hosts-global-model-update/FREEZE.json']
for name in extra:reviewed.append({'path':str((R/name).relative_to(CANDIDATE)),'sha256':sha(R/name),'review_method':'read and scoped factual audit'})
authority=Path('$LOCAL_HOME/Repositories/codeweb/docs/specs/native-evidence-delivery.md')
reviewed.append({'path':str(authority),'sha256':sha(authority),'review_method':'acceptance authority read'})
product_sources=['hooks/pre-edit-impact.mjs','hooks/post-edit-diff.mjs','scripts/deadcode.mjs','scripts/lib/cli.mjs','scripts/mcp-server.mjs']
for name in product_sources:reviewed.append({'path':name,'sha256':sha(CANDIDATE/name),'review_method':'source mechanism inspection'})
frozen_tech=read(R/'technical/CASES.json');frozen_hosts=read(R/'hosts/CASES.json');add=read(R/'hosts-global-model-update/CASES.json')
counts={'original':dict(Counter(c.get('outcome',c.get('status')) for c in frozen_tech['cases']+frozen_hosts['cases'])),'addendum':dict(Counter(c['status'] for c in add['cases']))}
checks={
 'exact_cli_low_both_consumers':set(json.loads(receipt('R02-exact-impact')['stdout'])['results'])=={'consumer.mjs:consequential','subject.mjs:local'},
 'exact_mcp_low_consumer':'consumer.mjs:consequential' in textresult('R04-exact-mcp'),
 'fresh_known_hook_popular_omits_low_consumer':'popular ×5' in receipt('R09-known-target-fresh')['stdout'] and 'consequential' not in receipt('R09-known-target-fresh')['stdout'],
 'repeat_card_identical':receipt('R09-known-target-fresh')['stdout']==receipt('R10-known-target-repeat')['stdout'],
 'cli_graph_only_stale':'stale' in receipt('R06-stale-context')['stdout'],
 'hook_graph_only_no_stale':'map behind' not in receipt('R07-stale-graph-only')['stdout'],
 'hook_stamped_stale':'map behind' in receipt('R13-stale-with-sidecar')['stdout'],
 'alias_hook_entry_silent':receipt('R11-entry-alias')['exit']==0 and not receipt('R11-entry-alias')['stdout'],
 'canonical_codex_payload_silent':receipt('R12-codex-payload')['exit']==0 and not receipt('R12-codex-payload')['stdout'],
 'invalid_shape_cli_misreported_as_miss':json.loads(receipt('R19-invalid-shape-cli')['stdout'])['found']==False,
 'invalid_shape_mcp_misreported_empty':'EMPTY (built with --allow-empty' in textresult('R20-invalid-shape-mcp'),
 'incomplete_cli_safe_claim':'1 safe to delete' in receipt('R21-incomplete-deadcode')['stdout'],
 'incomplete_mcp_safe_claim':'1 safe to delete' in textresult('R22-incomplete-deadcode-mcp'),
 'incomplete_mcp_warning_not_carried':'analysis incomplete' not in textresult('R22-incomplete-deadcode-mcp'),
 'mapped_corrupt_pre_and_post_silent':not receipt('R23-pre-corrupt')['stdout'] and not receipt('R24-post-corrupt')['stdout'],
 'mapped_empty_pre_and_post_silent':not receipt('R23-pre-empty')['stdout'] and not receipt('R24-post-empty')['stdout'],
 'mapped_extraction_failure_post_silent':receipt('R24-post-extraction-failure')['exit']==0 and not receipt('R24-post-extraction-failure')['stdout'],
 'explicit_extraction_failure_nonzero':receipt('R25-explicit-refresh-failure')['exit']==2,
 'ordinary_post_ctags_stderr':'ctags: illegal option' in receipt('R24-post-zero')['stderr'],
 'baseline_direct_refresh_rejected':receipt('R17-deny-baseline-refresh')['exit']==2,
 'structural_green_behavior_not_evaluated':json.loads(receipt('R15-diff-refresh')['stdout'])['analysis']['checks']['behavior']=='not-evaluated',
}
probes=read(OUT/'PROBES.json');checks['review_baseline_preserved']=len(set(probes['baseline_hashes'].values()))==1
checks['actual_dist_generated_excluded']=probes['generated_excluded_from_actual_extraction']
original_baselines={}
paths={'technical_baseline':read(R/'technical/baseline-hashes.json')['path'],'technical_receipt':read(R/'technical/receipt-hashes.json')['receiptPath'],'host_baseline':str(Path(read(R/'hosts/IDENTITY.json')['fixture'])/'.codeweb/graph.baseline.json'),'linked_baseline':str(Path(read(R/'hosts/LINKED.json')['fixture']) /'.codeweb/graph.baseline.json')}
for key,path in paths.items():
    if Path(path).is_file():original_baselines[key]={'path':path,'sha256':sha(path)}
config=read(R/'GLOBAL-MODEL-SETTINGS.json')
settings_checks={'current_config_matches_after':sha(config['config'])==config['after_sha256'],'private_backup_matches_before':sha(config['backup_private_local'])==config['before_sha256'],'contents_emitted':False,'global_defaults_runtime_reload_tested':False}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=CANDIDATE,text=True).strip();diff=subprocess.run(['git','diff','--exit-code','HEAD'],cwd=CANDIDATE,capture_output=True).returncode
original_matrix=read(R/'MATRIX.json')
ver={'schema_version':1,'reviewed_at':datetime.now(timezone.utc).isoformat(),'reviewer':{'agent':'p02_reviewer','requested_model':'gpt-6.1-sol','reasoning_effort':'high','separate_from_technical_and_hosts_workers':True},'verdict':'APPROVE factual P-02 delivery with reviewer qualifications recorded in REVIEW.md','full_field_readiness':False,'product_identity':{'head':head,'expected_head':start['candidate_sha'],'tracked_diff_exit':diff,'start_product_files_checked':len(start['product_manifest']),'mismatches':product_bad},'frozen_packets':integrity,'original_counts':counts['original'],'addendum_counts':counts['addendum'],'counts_are_surface_dispositions_not_independent_defects':True,'global_settings_record_hash_verification':settings_checks,'original_surviving_evidence_hashes':original_baselines,'reviewed_files':reviewed,'material_raw_inspection':{'technical':'Exact-selector results; hook states, target/freshness/entry behavior; deadcode safety; invalid-shape transports; before/receipt recovery; source links/expansion; current/failed/skipped/malformed runner and synthetic versus measured coverage receipts; selected suites original failure and corrected stats test. Raw receipt commands/env and probe setup inspected.','hosts':['cold','cold-corrected-sol','linked-native','preauthorized-cold','preauthorized-linked','preauthorized-warm-recovery','disabled-native-control','enabled-native-control','native-state-matrix','supplementary-codex-adapter','supplementary-claude-adapter','supplementary-codex-adapter-canonical','supplementary-claude-adapter-canonical'],'addendum':'All public native/version events, command/prompt/flags, parsed summary, cases and predecessor integrity.'},'tested_probes':[{'path':str(p.relative_to(CANDIDATE)),'sha256':sha(p),'id':read(p)['id'],'exit':read(p)['exit']} for p in sorted((OUT/'receipts').glob('*.json'))],'probe_count':len(list((OUT/'receipts').glob('*.json'))),'probe_observation_checks':checks,'correction_requests':[{'id':'REVIEW-Q01','case':'TECH-15','correction':'Narrow repair scope to mapped corrupt/empty/unavailable extraction states. Unmapped/no-.codeweb repositories intentionally lie outside mapped hook scope; their silence alone is not a defect. Preserve frozen row.','disposition':'Included here and in REVIEW.md; root acknowledged integration overlay.'},{'id':'REVIEW-Q02','case':'TECH-08','correction':'Self candidate a.mjs:addTax scores 1.0; conflicting b.mjs:discount and duplicate bodies score .714286. Both conflicting bodies are retrieved; do not say they have equal self versus non-self scores.','disposition':'Included here and in REVIEW.md; root acknowledged integration overlay.'},{'id':'REVIEW-Q03','case':'H-P02-GM-04','correction':'Keep the failed fixture-only read condition as probe confinement/attention contamination, separate from product defects; scoped MCP results remain observed.','disposition':'Already disclosed in frozen addendum; reviewer confirms.'}],'limits':['No product implementation or full gate repeat; product source unchanged.','No new native-host run by reviewer, login, contacts, GitHub operation, commit, release, Paperclip or subagent.','Passing scoped cases do not pass whole NED criteria. Unobserved runtime boundaries remain unverified.','CLI 0.159.3 explicit gpt-6.1-sol/high accepted invocation has no independent backend model/effort echo and ignores global user config. Global-default reload and later installed-CLI operational alignment are outside this evidence.','Forced prompts and synthetic fixtures do not measure natural developer adoption, customer value, comparative performance or field readiness.']}
assert not product_bad and diff==0 and head==start['candidate_sha']
assert all(not p['mismatches'] for p in integrity)
assert all(checks.values())
(OUT/'VERIFICATION.json').write_text(json.dumps(ver,indent=2)+'\n')
print(json.dumps({'product_files':len(start['product_manifest']),'packet_files':sum(x['files_checked'] for x in integrity),'probes':ver['probe_count'],'observation_checks':len(checks),'all_observation_checks_true':all(checks.values()),'counts':counts},indent=2))
