#!/usr/bin/env python3
"""Offline consistency check for the living plan; does not run tasks or research."""
from pathlib import Path
import datetime
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
REPORT = Path(__file__).resolve().parent
PACKET = ROOT / 'reports/hypothesis-pressure-test-2026-09-29'


def read(path):
    return json.loads(path.read_text())


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def validate():
    source = read(PACKET / 'FINDING-COVERAGE.json')['findings']
    originals = {f['finding_id']: f for f in source}
    claims = {c['id']: c for c in read(PACKET / 'CLAIM-LEDGER.json')['claims']}
    registry = read(ROOT / 'docs/product-team/DECISIONS.json')
    records = registry['findings']
    findings = {f['finding_id']: f for f in records}
    work = read(ROOT / 'docs/product-team/TASKS.json')['tasks']
    tasks = {t['id']: t for t in work}
    require(len(findings) == len(records) == 65, 'Duplicate/missing finding records')
    require(set(findings) == set(originals), 'Finding coverage differs from frozen packet')
    require(len(tasks) == len(work), 'Duplicate work IDs')
    require(registry['source_coverage_sha256'] == hashlib.sha256(
        (PACKET / 'FINDING-COVERAGE.json').read_bytes()).hexdigest(), 'Source coverage identity changed')
    known_tests = {f'F-T{i:02d}' for i in range(1, 13)}
    allowed = set(registry['disposition_meanings'])
    for fid, finding in findings.items():
        original = originals[fid]
        require(finding['statement'] == original['preserved_finding']['statement'], fid + ': statement changed')
        require(finding['disposition'] in allowed, fid + ': invalid disposition')
        require(bool(finding['decision_reason']) and bool(finding['owner']), fid + ': missing decision/owner')
        require(bool(finding['work_ids']), fid + ': no next work')
        for key in ['test_ids', 'evidence_ids', 'opposing_evidence_ids']:
            require(finding[key] == original.get(key, []), fid + ': original ' + key + ' changed')
        expected = {cid for cid, c in claims.items() if fid in c['finding_ids']}
        require(set(finding['claim_ids']) == expected, fid + ': claim mapping changed')
        require(set(finding['test_ids']) <= known_tests, fid + ': unknown test ID')
        require((PACKET / finding['source_pointer']['lens_file']).is_file(), fid + ': missing lens file')
        for wid in finding['work_ids']:
            require(wid in tasks and fid in tasks[wid]['finding_ids'], fid + ': broken reverse work link')
        for ref in finding['result_refs']:
            require((ROOT / ref).exists(), fid + ': missing result ' + ref)
    require({c for f in findings.values() for c in f['claim_ids']} == set(claims), 'Claim omitted')
    require({t for f in findings.values() for t in f['test_ids']} == known_tests, 'Test omitted')
    for wid, task in tasks.items():
        require(bool(task['owner']) and bool(task['acceptance']), wid + ': missing owner/acceptance')
        require(set(task['claim_ids']) <= set(claims), wid + ': unknown claim')
        require(set(task['test_ids']) <= known_tests, wid + ': unknown test')
        for fid in task['finding_ids']:
            require(fid in findings and wid in findings[fid]['work_ids'], wid + ': broken reverse finding link')
        for dep in task['depends_on']:
            require(dep in tasks and dep != wid, wid + ': invalid dependency')
            if task['execution_status'] == 'ready':
                require(tasks[dep]['execution_status'] == 'done', wid + ': ready before dependency ' + dep)
        if task['execution_status'] in ['later', 'conditional']:
            require(bool(task.get('entry_condition')), wid + ': missing conditional entry rule')
        for ref in task['result_refs']:
            require((ROOT / ref).exists(), wid + ': missing result ' + ref)
    visiting, visited = set(), set()

    def walk(wid):
        require(wid not in visiting, 'Dependency cycle at ' + wid)
        if wid in visited:
            return
        visiting.add(wid)
        for dep in tasks[wid]['depends_on']:
            walk(dep)
        visiting.remove(wid)
        visited.add(wid)

    for wid in tasks:
        walk(wid)
    manifest = read(PACKET / 'FINAL-DELIVERY-MANIFEST.json')['files']
    for entry in manifest:
        path = PACKET / entry['path']
        require(path.is_file() and path.stat().st_size == entry['bytes'], 'Frozen file missing/size changed: ' + entry['path'])
        require(hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], 'Frozen bytes changed: ' + entry['path'])
    carry = read(REPORT / 'CARRY-OVER.json')['items']
    require(len(carry) == 6 and all(i['mapped_work'] == 'WEB-01' for i in carry), 'Carry-over work omitted')
    reproduction = read(REPORT / 'EMPTY-RESULT-REPRO.json')
    require(reproduction['exit_code'] == 0 and reproduction['unsupported_safety_claim_observed'], 'Published reproduction evidence absent')
    live = [ROOT / 'docs/product-team' / name for name in [
        'CURRENT.md', 'PLAN.md', 'DECISIONS.md', 'BACKLOG.md', 'SCORECARD.md']]
    live += [ROOT / rel for rel in [
        'docs/specs/native-evidence-delivery.md', 'docs/experiments/codeweb-local-value-pilot.md',
        'docs/gtm-cofounder/founder-brief.md', 'docs/gtm-cofounder/gtm-roadmap.md',
        'docs/gtm-cofounder/first-cohort-plan.md', 'docs/gtm-cofounder/PROSPECTS.md']]
    live += [REPORT / 'README.md', REPORT / 'REVIEW.md']
    link_count = 0
    for path in live:
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', path.read_text()):
            target = target.split('#', 1)[0]
            if not target or re.match(r'^(?:https?:|mailto:)', target):
                continue
            require((path.parent / target).resolve().exists(), str(path.relative_to(ROOT)) + ': missing link ' + target)
            link_count += 1
    roadmap = (ROOT / 'docs/gtm-cofounder/gtm-roadmap.md').read_text()
    require(roadmap.startswith('Diagnosis:'), 'Roadmap lost diagnosis')
    require(all('\n## ' + heading + '\n' in roadmap for heading in ['Now', 'Next', 'Later', 'Log']), 'Roadmap lost horizons/log')
    return {
        'verified_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'pass', 'material_findings': len(findings), 'claims': len(claims),
        'test_ids': len(known_tests), 'work_records': len(tasks), 'task_dependencies': 'acyclic',
        'frozen_packet_files_hash_verified': len(manifest), 'carry_over_records': len(carry),
        'live_local_links_checked': link_count, 'source_or_reference_mismatches': [],
        'scope': 'Offline artifact consistency and preservation; not host readiness, strategic proof or customer validation.'}


if __name__ == '__main__':
    result = validate()
    (REPORT / 'VALIDATION.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
