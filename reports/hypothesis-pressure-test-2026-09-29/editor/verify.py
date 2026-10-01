import json,pathlib,hashlib
p=pathlib.Path(__file__).resolve().parents[1]
def r(n):return json.loads((p/n).read_text())
def h(f):return hashlib.sha256(f.read_bytes()).hexdigest()
checks=[]
for n,k in [('INPUT-MANIFEST.json','snapshot_path'),('SYNTHESIS-INPUT-MANIFEST.json','path')]:
 rows=r(n)['files']; assert all(h(p/x[k])==x['sha256'] for x in rows);checks.append(f'{len(rows)} files match {n}')
for n,v in r('ACCEPTANCE.json')['frozen_artifacts'].items():assert h(p/n)==v
f=r('FINDING-COVERAGE.json')['findings'];c=r('CLAIM-LEDGER.json')['claims'];u=r('EVIDENCE-USE.json')['records'];b=r('BREADCRUMBS.json');edges={e['id']:e for e in b['edges']}
original={x['id']:x for i in range(1,13) for x in r(f'lenses/{i:02d}-findings.json')['findings']}
assert len(f)==65 and {x['finding_id'] for x in f}==set(original)
for row in f:assert row['preserved_finding']==original[row['finding_id']] and row['claim_ids'] and row['test_ids'] and row['reason']
original_ids={json.loads(l)['id'] for l in (p/'inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl').read_text().splitlines()}
assert len(u)==132 and {x['evidence_id'] for x in u}==original_ids
for e in b['edges']:
 assert e['id'] in b['forward'][e['from']] and e['id'] in b['reverse'][e['to']] and e['role'] and e['passage_pointer']
for row in c:
 assert row['evidence_edges'] and row['finding_ids'] and row['test_id']
 for e in row['evidence_edges']:assert any(x['from']==e['evidence_id'] and x['to']==row['id'] and x['role']==e['role'] and x['passage_pointer']==e['passage_pointer'] for x in b['edges'])
 assert row['id'] in (p/'FINAL-HYPOTHESIS.md').read_text() and row['test_id'] in (p/'VALIDATION-TESTS.md').read_text()
for row in u:
 assert row['reason']
 for capture in row['capture_pointers']:assert (p/capture).is_file(),capture
for letter in ['A','B']:
 for suffix in ['.md','-MAPPING.json']:
  n=f'SYNTHESIS-{letter}{suffix}';assert (p/n).read_bytes()==(p/f'history/synthesis-{letter}'/n).read_bytes()
for i in ['CW-L020','CW-L021','CW-L056','CW-Z002']:assert next(x for x in u if x['evidence_id']==i)['usage']=='qualified'
assert not any(e['from']=='CW-L023' and e['to']=='F-C09' and e['role']=='direct_support' for e in b['edges'])
assert any(e['from']=='CW-Y007' and e['to']=='F-C09' and e['role']=='direct_support' for e in b['edges'])
for row in c:
 for ptr in row['capability_or_proposal_pointers']:assert (p/ptr.split('#')[0].split(':')[0]).is_file(),ptr
checks+=['65 exact original findings with final dispositions','132 original records with usage/nonuse and existing capture paths','12 decisions with backwards evidence and forward tests','all reciprocal indices and claim roles match','A/B frozen first drafts unchanged','four specific countercase dispositions','paid coordination does not inherit CW-L023 as direct support','capability/proposal file paths exist']
print(json.dumps({'status':'pass','checks':checks,'edges':len(edges)},indent=2))
