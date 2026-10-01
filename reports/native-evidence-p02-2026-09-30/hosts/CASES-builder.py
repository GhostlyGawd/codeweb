#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
identity = json.loads((ROOT / 'IDENTITY.json').read_text())
runs = {r['run']: r for r in json.loads((ROOT / 'RUN-SUMMARIES.json').read_text())}
cases = []

def add(suffix, ned, surface, status, expected, observed, evidence, next_step=None, host='Codex CLI', model='gpt-6-sol/high'):
    run_names = [e.removesuffix('.receipt.json') for e in evidence if e.endswith('.receipt.json')]
    latency = [{k: runs[n][k] for k in ('run', 'duration_seconds', 'request_to_first_source_evidence_seconds', 'per_event_timestamps_available')} for n in run_names if n in runs]
    cases.append({'id': 'H-P02-' + suffix, 'ned_ids': ned, 'surface': surface,
                  'status': status, 'expected': expected, 'observed': observed,
                  'evidence_refs': evidence, 'candidate_commit': identity['commit'],
                  'candidate_path': identity['candidate'], 'host': host,
                  'host_version': identity['versions']['claude' if host == 'Claude Code' else 'codex'],
                  'model': model, 'configuration': 'Exact per-run command, graph paths, prompt and settings are in referenced receipts. Successful Codex sessions expose six tools with per-tool approve, server default prompt, scoped CODEWEB_WS, CODEWEB_NO_AUTOREFRESH=1, workspace-write, apps=false and hooks=false.',
                  'latency': latency, 'owner': 'Codex / P-03' if status == 'fail' else 'Codex / P-04' if status == 'unverified' else 'Codex / P-02 reviewer',
                  'next_step': next_step or 'Review frozen raw receipts and retain the stated surface/scope limit.'})

add('01', ['NED-08'], 'actual Codex exec model startup', 'unverified',
    'The requested native model can run for this authenticated account.',
    'gpt-6.1-sol rejected with HTTP 400 before tools. One parent-authorized correction used installed catalog-supported gpt-6-sol/high; the rejected identifier is not silently equated with the working one.',
    ['cold.receipt.json', 'events/cold.stdout.txt', 'host-versions.receipt.json'],
    'Resolve account/model compatibility before claiming gpt-6.1-sol native availability.', model='gpt-6.1-sol/high')
add('02', ['NED-05','NED-08'], 'actual Codex MCP default-policy denial', 'pass',
    'The host respects ordinary approval requirements and does not edit after denied pre-edit evidence.',
    'Native refresh was denied because approval_policy=never. Original fixture remained byte-identical; no baseline was invented. Linked context/impact were also denied. Raw events describe a policy denial, not an automatic approval-review rejection, despite one model narrative using that phrase.',
    ['cold-corrected-sol.receipt.json','linked-native.receipt.json','events/cold-corrected-sol.stdout.txt','events/linked-native.stdout.txt'])
add('03', ['NED-08'], 'Codex MCP configuration inspection', 'pass',
    'The scoped Codeweb transport resolves to the frozen source candidate.',
    'codex mcp get codeweb reports the candidate stdio transport. This targeted metadata read is not a live tool invocation.',
    ['codex-specific-config-discovery.receipt.json','events/codex-specific-config-discovery.stdout.txt'])
add('04', ['NED-02','NED-07','NED-08'], 'actual Codex MCP exact-target/source opening', 'pass',
    'Low-fan-in rare is inspected with its consequential consumer, separately from popular.',
    'Preauthorized explain/impact/context identify src/consumer.mjs:consequential for rare. Source windows and exact files were opened before apply_patch. Popular full:true independently lists fan0 through fan5.',
    ['preauthorized-cold.receipt.json','events/preauthorized-cold.stdout.txt','RUN-SUMMARIES.json'])
add('05', ['NED-03','NED-07'], 'actual Codex similarity/source comparison', 'pass',
    'Source-linked candidates remain comparison evidence, not behavioral substitutes.',
    'find_similar returned five source-linked candidates, bodyLineCap=400 and lexical ranking. The agent opened duplicates.mjs and acknowledged intentional duplication and no behavioral equivalence. Broader conflicting-contract/body-cap controls belong to the technical matrix.',
    ['preauthorized-cold.receipt.json','events/preauthorized-cold.stdout.txt'])
add('06', ['NED-01','NED-05','NED-06'], 'actual Codex baseline/edit/diff', 'pass',
    'Evidence arrives before edit; refreshed structural result preserves original baseline and separate test/behavior provenance.',
    'rare +1→+2 was applied after source-linked evidence. Baseline 25f343b54f0eb02b9393ac06ad252dd0ecd56f2ff55c34ef26b8fd5c394297fd survived. Diff ok:true explicitly labels duplication and behavior not-evaluated; no tests were run in that session.',
    ['preauthorized-cold.receipt.json','events/preauthorized-cold.stdout.txt','snapshots/native-original-baseline.json'])
add('07', ['NED-05','NED-08'], 'actual Codex detached linked worktree', 'pass',
    'Linked source/graph/baseline are independent from the original fixture.',
    'Native refresh/impact/context/source reads used the detached worktree graph/root. It captured its own f2d4c34eaefc9a227a4d36733d398d5a0bbcfe41101828564c732b22b3ffa3b6 baseline and made no source edit.',
    ['preauthorized-linked.receipt.json','events/preauthorized-linked.stdout.txt','LINKED.json'])
add('08', ['NED-01','NED-04','NED-05'], 'actual Codex stale/zero/recovery', 'pass',
    'Stale evidence is visible, a matched zero differs from failure, and ordinary refresh preserves original baseline.',
    'After rare +2→+3 fixture preparation, impact/context warned stale and context freshness=stale. quiet matched with count0 and the same stale disclaimer. Ordinary refresh and refreshed diff retained the original 25f343... baseline; tests/behavior were not inferred.',
    ['preauthorized-warm-recovery.receipt.json','events/preauthorized-warm-recovery.stdout.txt','warm-preparation.json'])
add('09', ['NED-01','NED-04'], 'actual Codex missing/corrupt/unmapped/empty states', 'pass',
    'Unsupported-empty evidence and missing/corrupt/unmapped failures remain distinct.',
    'Native context returned graph-not-found, invalid-JSON, found:false with search hint, and EMPTY/vacuous-not-zero warning. Empty map came from a real unsupported-extension CLI --allow-empty fixture. Unmapped-symbol query used the owned primary graph; other paths are inside owned states.',
    ['native-state-matrix.receipt.json','events/native-state-matrix.stdout.txt','STATE-FIXTURES.json','state-empty-cli-prep.receipt.json'])
add('10', ['NED-04'], 'actual Codex recognized generated-dependency scope', 'unverified',
    'A legitimately generated/dependency-excluded scope reports its boundary distinctly.',
    'The actual src/generated.mjs with @generated comment mapped as role:product and captureEvidence returned state:captured with zero relation totals. This generated-like input does not establish the required recognized generated/dependency exclusion behavior; no manual role was invented.',
    ['native-state-matrix.receipt.json','events/native-state-matrix.stdout.txt','state-generated-cli-prep.receipt.json'],
    'Run the documented recognized generated/dependency path in a scoped native host after technical scope rules are reviewed.')
add('11', ['NED-09'], 'actual Codex request/result/source-open/edit timing', 'pass',
    'Report observed per-run end-to-end timings and evidence ordering without tiny-sample promises.',
    'Preauthorized first session 69.473s: first source evidence 23.402s, exact source opened 29.650s, edit 48.247s. Linked session 60.318s: first source evidence 30.255s, source opening 43.273s. Warm recovery 52.253s: first stale evidence 20.635s. Permission waits are unmeasured; these are process/model-inclusive timings on CLI-prepared tiny maps, not extraction-cold or percentile claims.',
    ['preauthorized-cold.receipt.json','preauthorized-linked.receipt.json','preauthorized-warm-recovery.receipt.json','RUN-SUMMARIES.json'])
add('12', ['NED-10'], 'actual Codex scoped MCP disable and ordinary edit', 'unverified',
    'Disabling the scoped MCP transport removes its native tool use while ordinary work remains usable.',
    'Session config enabled=false and targeted config inspection report disabled. No Codeweb MCP calls occurred; quiet -1→-2 and local checks succeeded. However the enabled control also made no MCP calls, and no runtime catalog or process-launch receipt independently proves absent exposure. Ordinary work survives; disable-stops-delivery proof is incomplete, with hook disable/plugin uninstall separate.',
    ['disabled-native-control.receipt.json','events/disabled-native-control.stdout.txt','codex-specific-config-disable.receipt.json'],
    'Capture runtime tool-catalog or server-launch absence under enabled versus disabled scoped config; separately test ambient disable/uninstall after legitimate hook trust.')
add('13', ['NED-10'], 'ordinary enabled versus disabled small-edit controls', 'pass',
    'Record ordinary workflow behavior honestly, including non-use of optional evidence.',
    'Equivalent sequential arithmetic edits with identical inspection instructions: disabled 50.514s, enabled 41.867s. Neither made MCP calls; both used local source/graph inspection and Node assertions. Different constants, sequential cache state, one operator and tiny task prevent benefit/adoption inference. This is a single native non-use observation, not a customer result.',
    ['disabled-native-control.receipt.json','enabled-native-control.receipt.json','events/enabled-native-control.stdout.txt','RUN-SUMMARIES.json'])
add('14', ['NED-02','NED-08'], 'supplementary shipped hook documented-payload compatibility', 'fail',
    'Shipped adapter can consume an actual Codex edit payload and show relevant known-target evidence.',
    'Standalone canonical-path documented Codex apply_patch payload with tool_input.command produced no output. Claude Edit file_path/old_string/new_string changing rare instead produced popular ×6 and popular callers, omitting rare consequential consumer. Edit/Write matcher aliases alone are not inferred to fail. These are adapter subprocess facts, not trusted native hook delivery.',
    ['supplementary-codex-adapter-canonical.receipt.json','supplementary-claude-adapter-canonical.receipt.json','events/supplementary-claude-adapter-canonical.stdout.txt'],
    'P-03 should review supported payload extraction and exact-target/file-scope claims, then perform actual trusted native hook delivery.', host='Codex CLI', model='none (standalone adapter)')
add('15', ['NED-08'], 'supplementary hook symlink entry execution', 'fail',
    'Invoking the same hook through a valid filesystem alias executes its entry path.',
    '/var candidate script entry returned silently for both payloads; canonical /private path corrected Claude output. Source entry guard compares resolve(argv[1]) with canonical fileURLToPath(import.meta.url). Candidate source remained unchanged.',
    ['supplementary-codex-adapter.receipt.json','supplementary-claude-adapter.receipt.json','supplementary-claude-adapter-canonical.receipt.json','IDENTITY.json'],
    'P-03 should decide whether supported aliased checkouts require an entry-guard repair and retest exact native install paths.', model='none (standalone adapter)')
add('16', ['NED-01','NED-02','NED-04','NED-05','NED-07','NED-08','NED-09','NED-10'], 'Codex native ambient hooks/trust/quiet/noisy/uninstall', 'unverified',
    'Actual supported adapter/event/trust delivers advisory context before edits; disable/uninstall and ordinary quiet events behave correctly.',
    'Successful exec sessions deliberately use features.hooks=false. A user hooks file exists; it was not read or trusted, so unrelated hooks were not enabled. No trusted native Codeweb hook event was observed and no global plugin uninstall was attempted.',
    ['IDENTITY.json','preauthorized-cold.receipt.json','disabled-native-control.receipt.json'],
    'Use a legitimately isolated active hook layer, obtain normal exact-definition trust when available, observe actual payload/context and disable/uninstall behavior.')
add('17', ['NED-08'], 'Claude shipped plugin manifest validation', 'pass',
    'Installed Claude validates the exact shipped plugin manifest without sign-in.',
    'claude plugin validate .claude-plugin/plugin.json success:true. Warning: root CLAUDE.md is not loaded as project context; a skill is required to ship context. Marketplace validation was separate. Validation does not establish startup/tool/hook delivery.',
    ['claude-shipped-plugin-manifest.receipt.json','events/claude-shipped-plugin-manifest.stdout.txt'],host='Claude Code',model='none (validator)')
add('18', ['NED-%02d' % n for n in range(1,11)], 'Claude actual authenticated tools/model/hooks/linked worktree', 'unverified',
    'Real authenticated native discovery/tool invocation/pre-edit hook delivery is demonstrated without bypassing permission/trust.',
    'Claude auth status loggedIn:false/authMethod:none. No sign-in/model/tool/hook session attempted. Scoped mcp-list setup failed variadic option parsing; one correction rejected --restricted. Those are probe setup errors, not product failures.',
    ['claude-auth-status.receipt.json','events/claude-auth-status.sanitized.json','claude-scoped-discovery.receipt.json','claude-scoped-discovery-corrected.receipt.json'],
    'After separately authorized authentication and legitimate scoped client setup, perform actual tools/hooks/worktree/disable matrix with ordinary trust.',host='Claude Code',model='unavailable')
add('19', ['NED-03','NED-06','NED-07'], 'broader native similarity/provenance/truncation controls', 'unverified',
    'Actual host verifies conflicting contracts, body caps, omitted counts, stale/failed/skipped test provenance and invalid oracles.',
    'Native smokes cover source-linked candidates, explicit full expansion, structural versus unrun-test distinctions and actual ordinary-control assertions. Broader boundary matrix is delegated technical evidence, not observed in these native sessions.',
    ['preauthorized-cold.receipt.json','RUN-SUMMARIES.json'],
    'Review the technical matrix and explicitly declare remaining native boundary exclusions or run bounded targeted host cases before readiness.')
add('20', ['NED-04'], 'actual Codex Codeweb child invocation unavailable/timeout state', 'unverified',
    'The Codeweb tool child failing to start or timing out is distinct from supported zero.',
    'Observed host failures include model rejection and approval denial, plus native missing/corrupt/empty graph states. A Codeweb child executable/unavailable/timeout fault was not injected in the live host; those other failures are not relabeled as this case.',
    ['cold.receipt.json','cold-corrected-sol.receipt.json','native-state-matrix.receipt.json'],
    'Review technical invocation-fault receipts and run a bounded legitimately scoped native transport/child fault case or declare a valid surface exclusion before readiness.')

(ROOT / 'CASES.json').write_text(json.dumps({'schema_version':1, 'candidate':identity,
    'scope':'Native-host evidence and separately labeled supplementary setup/adapter probes; no full readiness or customer benefit claim.',
    'cases':cases}, indent=2) + '\n')
print(json.dumps({'cases':len(cases),'statuses':{s:sum(c['status']==s for c in cases) for s in ['pass','fail','unverified']}}))
