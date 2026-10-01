#!/usr/bin/env python3
from pathlib import Path
import json, subprocess, time, hashlib, sys, threading, os, signal

ROOT = Path(__file__).resolve().parent
ID = json.loads((ROOT / 'IDENTITY.json').read_text())
FIX = Path(ID['fixture'])
CAND = Path(ID['candidate'])
PRIVATE = FIX / 'private-receipts'
PRIVATE.mkdir(exist_ok=True, mode=0o700)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None

def run(name, command, prompt=None, cwd=None, timeout=180):
    start = time.time()
    active = Path(cwd or FIX)
    before = sha(active / '.codeweb/graph.baseline.json')
    timed = False
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, cwd=cwd or FIX,
                            start_new_session=True)
    lines, errors, timestamps = [], [], []
    def collect(stream, target, channel):
        for line in stream:
            target.append(line)
            timestamps.append({'epoch': time.time(), 'channel': channel,
                               'line_index': len(target) - 1})
    readers = [threading.Thread(target=collect, args=(proc.stdout, lines, 'stdout')),
               threading.Thread(target=collect, args=(proc.stderr, errors, 'stderr'))]
    for reader in readers: reader.start()
    if prompt is not None: proc.stdin.write(prompt)
    proc.stdin.close()
    try:
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        timed, code = True, None
    for reader in readers: reader.join(timeout=5)
    out, err = ''.join(lines), ''.join(errors)
    (PRIVATE / f'{name}.timestamps.json').write_text(json.dumps(timestamps, indent=2) + '\n')
    duration = time.time() - start
    for suffix, data in [('stdout', out), ('stderr', err)]:
        (PRIVATE / f'{name}.{suffix}.txt').write_text(data)
    receipt = {'id': name, 'command': command, 'prompt': prompt,
               'cwd': str(cwd or FIX), 'start_epoch': start, 'end_epoch': time.time(),
               'duration_seconds': duration, 'timeout_seconds': timeout,
               'timed_out': timed, 'exit_code': code,
               'baseline_before_sha256': before,
               'baseline_after_sha256': sha(active / '.codeweb/graph.baseline.json'),
               'private_stdout': str(PRIVATE / f'{name}.stdout.txt'),
               'private_stderr': str(PRIVATE / f'{name}.stderr.txt')}
    (ROOT / f'{name}.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'id': name, 'seconds': round(duration, 3), 'exit': code,
                      'timeout': timed, 'stdout_length': len(out),
                      'stderr_length': len(err)}), flush=True)
    return out, err, receipt

def codex(extra=None, fixture=None):
    return ['codex', 'exec', '--ignore-user-config', '--ephemeral', '--json',
            '--color', 'never', '-m', 'gpt-6.1-sol', '-c',
            'model_reasoning_effort="high"', '-c', 'approval_policy="never"',
            '-s', 'workspace-write', '-C', str(fixture or FIX), '-c',
            'mcp_servers.codeweb.command="node"', '-c',
            'mcp_servers.codeweb.args=' + json.dumps([str(CAND / 'scripts/mcp-server.mjs')]),
            '-c', 'mcp_servers.codeweb.env={CODEWEB_NO_AUTOREFRESH="1"}',
            '-c', 'features.apps=false', '-c', 'features.hooks=false',
            *(extra or []), '-']

TOOLS = ['codeweb_refresh', 'codeweb_explain', 'codeweb_impact',
         'codeweb_context', 'codeweb_find_similar', 'codeweb_diff']

def approved_codex(fixture):
    graph = str(fixture / '.codeweb/graph.json')
    return ['codex', 'exec', '--ignore-user-config', '--ephemeral', '--json',
            '--color', 'never', '-m', 'gpt-6-sol', '-c',
            'model_reasoning_effort="high"', '-c', 'approval_policy="never"',
            '-s', 'workspace-write', '-C', str(fixture), '-c',
            'mcp_servers.codeweb.command="node"', '-c',
            'mcp_servers.codeweb.args=' + json.dumps([str((CAND / 'scripts/mcp-server.mjs').resolve())]),
            '-c', 'mcp_servers.codeweb.env={CODEWEB_NO_AUTOREFRESH="1",CODEWEB_WS=' + json.dumps(graph) + '}',
            '-c', 'mcp_servers.codeweb.default_tools_approval_mode="prompt"',
            '-c', 'mcp_servers.codeweb.enabled_tools=' + json.dumps(TOOLS),
            *[item for tool in TOOLS for item in ['-c', 'mcp_servers.codeweb.tools.' + tool + '.approval_mode="approve"']],
            '-c', 'features.apps=false', '-c', 'features.hooks=false', '-']

if __name__ == '__main__':
    name = sys.argv[1]
    if name == 'cold':
        prompt = """Local fixture acceptance smoke. Use only codeweb MCP and local fixture shell reads. First call codeweb_impact on rare BEFORE any map to observe missing evidence. Then call codeweb_map with target current fixture, then codeweb_refresh baseline:true exactly once BEFORE editing. Call codeweb_explain, codeweb_impact and codeweb_context on src/library.mjs:rare. Identify its consequential consumer and distinguish popular's consumers. Open exact library and consequential consumer source from disk. Expand codeweb_impact with full:true on popular. Call codeweb_find_similar with body export function compareC(value) { return value + 1; }. Inspect candidate source and acknowledge intentional duplication is valid and similarity is not substitutability. Do not edit source. Report actual results, limitations and source links. Do not start subagents or access other tools/services."""
        run(name, codex(), prompt)
