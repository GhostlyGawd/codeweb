#!/usr/bin/env python3
"""Sanitize host receipts and derive audit-friendly event/latency summaries."""
from pathlib import Path
import json, re, hashlib
import probe

ROOT, PRIVATE = probe.ROOT, probe.PRIVATE
EVENTS = ROOT / 'events'
EVENTS.mkdir(exist_ok=True)
published = []
for source in sorted(PRIVATE.glob('*.txt')):
    if source.name.startswith('claude-auth-status'):
        continue
    original = source.read_text()
    clean = re.sub(r'[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[REDACTED_EMAIL]', original)
    clean = re.sub(r'(?i)(bearer\s+)[A-Za-z0-9._-]+', r'\1[REDACTED_TOKEN]', clean)
    clean = re.sub(r'\bsk-[A-Za-z0-9_-]{16,}\b', '[REDACTED_TOKEN]', clean)
    clean = clean.replace('rhenmcleod', '[LOCAL_USER]')
    (EVENTS / source.name).write_text(clean)
    published.append({'file': 'events/' + source.name,
                      'private_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                      'published_sha256': hashlib.sha256(clean.encode()).hexdigest(),
                      'redacted': original != clean})
(ROOT / 'PUBLISHED-EVIDENCE.json').write_text(json.dumps(published, indent=2) + '\n')
(EVENTS / 'claude-auth-status.sanitized.json').write_text(json.dumps({'loggedIn': False, 'authMethod': 'none'}, indent=2) + '\n')

summaries = []
for receipt_file in sorted(ROOT.glob('*.receipt.json')):
    receipt = json.loads(receipt_file.read_text())
    name = receipt['id']
    stdout = PRIVATE / f'{name}.stdout.txt'
    if not stdout.exists(): continue
    times = PRIVATE / f'{name}.timestamps.json'
    stamps = {x['line_index']: x['epoch'] for x in json.loads(times.read_text()) if x['channel'] == 'stdout'} if times.exists() else {}
    if times.exists(): (EVENTS / times.name).write_bytes(times.read_bytes())
    entries, started, calls, opens, edits = [], {}, [], [], []
    for index, line in enumerate(stdout.read_text().splitlines()):
        try: event = json.loads(line)
        except ValueError: continue
        if not isinstance(event, dict): continue
        item = event.get('item', {})
        when = stamps.get(index)
        elapsed = when - receipt['start_epoch'] if when else None
        if event.get('type') == 'item.started': started[item.get('id')] = when
        if event.get('type') != 'item.completed': continue
        if item.get('type') == 'mcp_tool_call':
            payload = None
            try: payload = json.loads(item['result']['content'][0]['text'])
            except (KeyError, TypeError, ValueError): pass
            calls.append({'event_line': index + 1, 'tool': item.get('tool'),
                          'server': item.get('server'), 'arguments': item.get('arguments'),
                          'status': item.get('status'), 'error': item.get('error'),
                          'result': item.get('result'), 'parsed_result': payload,
                          'request_to_result_seconds': elapsed,
                          'tool_elapsed_seconds': when - started[item['id']] if when and started.get(item['id']) else None})
        if item.get('type') == 'command_execution':
            command = item.get('command', '')
            if 'src/' in command and any(reader in command for reader in ('nl -ba', 'cat ', 'sed -n')):
                opens.append({'event_line': index + 1, 'command': command,
                              'request_to_source_open_seconds': elapsed,
                              'exit_code': item.get('exit_code')})
        if item.get('type') == 'file_change':
            edits.append({'event_line': index + 1, 'changes': item.get('changes'),
                          'request_to_edit_seconds': elapsed, 'status': item.get('status')})
    useful = next((c['request_to_result_seconds'] for c in calls
                   if c['status'] == 'completed' and c['tool'] in ('codeweb_explain', 'codeweb_impact', 'codeweb_context')
                   and isinstance(c['parsed_result'], dict)
                   and any(c['parsed_result'].get(key) for key in ('matched', 'target', 'cards'))), None)
    summary = {'run': name, 'receipt': receipt_file.name,
               'duration_seconds': receipt['duration_seconds'], 'exit_code': receipt['exit_code'],
               'timed_out': receipt['timed_out'], 'per_event_timestamps_available': bool(stamps),
               'request_to_first_source_evidence_seconds': useful,
               'permission_wait_seconds': None,
               'permission_note': 'No interactive permission wait measured; original denials and explicitly preauthorized conditions are separate.',
               'calls': calls, 'source_open_events': opens, 'edit_events': edits}
    summaries.append(summary)
(ROOT / 'RUN-SUMMARIES.json').write_text(json.dumps(summaries, indent=2) + '\n')
print(json.dumps({'published_files': len(published), 'runs': len(summaries),
                  'redacted_files': sum(x['redacted'] for x in published)}))
