"""Verify and copy completed lens artifacts; never assign or wake workers."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess

OUT = Path(__file__).resolve().parent
STAGE = Path('$LOCAL_HOME/.local/share/codeweb-paperclip-pilot/cycle-01/workspace/reports/hypothesis-pressure-test-2026-09-29')
CLI = ['npx', '--yes', 'paperclipai@2026.831.1']
CTX = ['--context', '$LOCAL_HOME/.local/share/codeweb-paperclip-pilot/terminal-context.json', '--json']


def copy_verified(relative, expected=None):
    rel = Path(relative)
    if rel.is_absolute() or '..' in rel.parts or rel.parts[0] == 'inputs':
        raise ValueError('Unexpected derived output path: ' + relative)
    content = (STAGE / rel).read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if expected is not None and digest != expected:
        raise ValueError('Declared hash mismatch: ' + relative)
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.read_bytes() != content:
        old = target.read_bytes()
        archive = OUT / 'delivery-history' / hashlib.sha256(old).hexdigest() / rel
        archive.parent.mkdir(parents=True, exist_ok=True)
        archive.write_bytes(old)
    target.write_bytes(content)
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise ValueError('Copy hash mismatch: ' + relative)
    return {'path': relative, 'sha256': digest}


control = json.loads((STAGE / 'CONTROL-PLANE.json').read_text())
result = subprocess.run([*CLI, 'issue', 'list', '--company-id', 'a3d32595-a6ed-4347-ad78-8d3543b47cd7', *CTX], capture_output=True, text=True, check=True)
data = json.loads(result.stdout)
rows = data if isinstance(data, list) else data.get('issues', data.get('items', []))
actual = {row['id']: row for row in rows}
completed, active, copied, warnings = [], [], [], []
for task in control['tasks']:
    current = actual[task['id']]
    if current['status'] == 'in_progress':
        active.append({'assignment': task['key'], 'issue': task['identifier']})
    if not task['key'].startswith('L') or current['status'] != 'done':
        continue
    receipt_path = 'receipts/' + task['key'] + '.json'
    receipt_file = STAGE / receipt_path
    if not receipt_file.exists():
        warnings.append('Missing completed-lens receipt: ' + task['key'])
        continue
    receipt = json.loads(receipt_file.read_text())
    entries = {item['path']: item['sha256'] for item in receipt.get('outputs', [])}
    for key in ['output_sha256', 'outputs_sha256', 'output_hashes']:
        mapping = receipt.get(key)
        if isinstance(mapping, dict):
            for relative, expected in mapping.items():
                if isinstance(expected, str):
                    entries[relative] = expected
    if not entries:
        warnings.append('No supported output-hash declaration: ' + task['key'])
        continue
    for relative, expected in entries.items():
        copied.append(copy_verified(relative, expected))
    copied.append(copy_verified(receipt_path))
    findings_file = f"lenses/{int(task['key'][1:]):02d}-findings.json"
    findings = json.loads((STAGE / findings_file).read_text())
    completed.append({'assignment': task['key'], 'issue': task['identifier'], 'findings': len(findings.get('findings', [])), 'verdict': findings.get('verdict', findings.get('overall_verdict')), 'session': receipt.get('session_identity', receipt.get('session_id'))})
checkpoint = {'checked_at': datetime.now(timezone.utc).isoformat(), 'completed_lenses': completed, 'active_assignments': active, 'verified_copies': copied, 'warnings': warnings, 'completion': False}
(OUT / 'LATEST-CHECKPOINT.json').write_text(json.dumps(checkpoint, indent=2) + '\n')
print(json.dumps({'checked_at': checkpoint['checked_at'], 'completed_lenses': completed, 'active_assignments': active, 'verified_copy_count': len(copied), 'warnings': warnings}, indent=2))
