# P-02 native-host evidence — September 30, 2026

This packet verifies scoped Codex MCP use on the frozen P-01 candidate and preserves material gaps. It does **not** certify full field readiness, trusted ambient delivery, Claude runtime delivery, natural adoption or customer benefit. The independent P-02 reviewer should judge [CASES.json](CASES.json) against the technical packet, not convert the count of passing subcases into overall readiness.

The exact candidate is `5da4d883c6e7056a4a419f23df86ab6f1c546a75`, checked out at `$LOCAL_TMP/codeweb-p02-nhppa5tq`. [IDENTITY.json](IDENTITY.json) pins the canonical path, candidate file hashes, fixture source hashes and host versions: Codex CLI 0.157.1, Claude Code 2.1.265, Node 26.7.0 and Apple Git 2.54.0. Source package metadata says 0.15.0; this is the newer corrected source commit, not proof about the published 0.15.0 tarball.

## Verified native Codex behavior

The first `gpt-6.1-sol/high` exec failed before tool use: the ChatGPT-authenticated account returned HTTP 400, saying that model was unsupported. The parent authorized one explicit correction to the installed catalog-supported `gpt-6-sol/high`. These identities remain separate from the delegated worker model. [Rejected run](cold.receipt.json), [raw error](events/cold.stdout.txt).

Under default MCP permissions with `approval_policy=never`, the corrected model discovered Codeweb but its baseline refresh required approval and was denied. It stopped before editing. The linked-worktree run likewise received denials for refresh, context and impact; it did not invent a fresh baseline. These are policy-denial receipts, **not automatic approval-review rejections**. One model narrative uses the latter phrase; raw host events do not. [Ordinary denial](cold-corrected-sol.receipt.json), [linked denial](linked-native.receipt.json).

The user's P-02 authorization covers known disposable fixture reads and graph writes. The parent therefore authorized a distinct session-only condition with `approval_mode="approve"` on exactly six tools: refresh, explain, impact, context, find_similar and diff. Server default remains `prompt`, its tool allowlist contains only those six, and `CODEWEB_WS` plus every graph/after argument identifies an owned disposable fixture. This condition is explicitly preauthorized; it is not the default out-of-box permission behavior. Shell sandbox stays `workspace-write`; user config is suppressed with `--ignore-user-config`, authentication preserved, apps disabled, hooks disabled, sessions ephemeral. No approval/sandbox/hook-trust bypass flag or ignored rule flag was used.

The preauthorized [native first session](preauthorized-cold.receipt.json) delivered `rare`'s exact explain/impact/context result and its consequential consumer before editing. Its source windows identify `src/consumer.mjs:consequential`, while a separate `popular` full expansion lists six unrelated consumers. The agent opened library, consumer and similarity-candidate files, then changed only the fixture's `rare` from `value + 1` to `value + 2`. The refreshed diff returned structural `ok:true`, with duplication and behavior explicitly `not-evaluated`, and the agent said tests were not run. The original baseline SHA-256 stayed `25f343b54f0eb02b9393ac06ad252dd0ecd56f2ff55c34ef26b8fd5c394297fd` before and after the edit. [Raw events](events/preauthorized-cold.stdout.txt), [original baseline](snapshots/native-original-baseline.json).

Similarity returned five linked candidates, including the intentionally duplicated functions, and exposed `bodyLineCap:400` and lexical ranking. Source was opened and the model did not assert behavioral equivalence or safe reuse. This native smoke does not replace the technical conflicting-contract, equivalent-syntax, missing-body and body-cap matrix.

The [preauthorized detached linked-worktree session](preauthorized-linked.receipt.json) used its own source root, graph and baseline. `rare`'s consumer arrived through actual MCP results and exact source was opened there. Its independent baseline is `f2d4c34eaefc9a227a4d36733d398d5a0bbcfe41101828564c732b22b3ffa3b6`. The `/var` and `/private/var` aliases resolve to the same linked fixture; the original fixture is separate. [Worktree identity](LINKED.json), [raw events](events/preauthorized-linked.stdout.txt).

After a deliberate fixture edit from `rare +2` to `rare +3`, the [warm recovery session](preauthorized-warm-recovery.receipt.json) received visibly stale impact/context results before refresh, including `freshness:"stale"` and actionable refresh advice. `quiet` matched with count zero and the same stale disclaimer, distinguishing a supported matched zero from a query failure. Ordinary refresh and refreshed baseline diff preserved the original `25f343...` baseline. The no-autorefresh setting is verified in candidate `scripts/mcp-server.mjs:120–121`; it is not an invented environment flag. [Preparation](warm-preparation.json), [raw events](events/preauthorized-warm-recovery.stdout.txt).

One bounded [native state session](native-state-matrix.receipt.json) returned distinct missing graph, corrupt JSON, unmatched symbol and unsupported-empty map states. Empty scope came from actual unsupported-extension source mapped using CLI `--allow-empty`. The missing/corrupt/empty/generated paths are under owned `states`; the unmapped-symbol control references the existing owned primary graph. Raw tool output is retained separately from the model interpretation. [Manifest](STATE-FIXTURES.json), [raw events](events/native-state-matrix.stdout.txt).

The actual `src/generated.mjs` fixture has an `@generated` header but mapped as `role:"product"`; evidence capture returned `state:"captured"`, zero relationship totals and one question. This records what happened. It does **not** verify the recognized generated/dependency exclusion boundary and is marked unverified in the case matrix. No manually declared generated role is presented as a real extractor result.

## User control and ordinary sessions

With scoped `mcp_servers.codeweb.enabled=false`, an ordinary edit session made no Codeweb MCP calls and changed `quiet -1` to `quiet -2`, using local source/graph reads, Node assertions and `git diff --check`. A second enabled session made the corresponding `quiet -2` to `quiet -3` edit with the same inspection instruction; it also chose no MCP calls and used local checks. Both preserved the original linked baseline. [Disabled](disabled-native-control.receipt.json), [enabled](enabled-native-control.receipt.json).

The scoped config inspection reports disabled and ordinary fixture work survives. Since the enabled control also made no MCP calls, absence of calls alone does not independently prove runtime tool exposure stopped; no runtime catalog or server-launch receipt was captured. That stronger disable result remains unverified. This is a tiny sequential arithmetic control with different constants and warmed caches, not an independent developer comparison or evidence of benefit. The enabled run's non-use is retained as an observation. Hooks were disabled throughout, so these sessions cannot establish ambient quiet/noisy behavior, hook disable or plugin uninstall.

## Timing receipts

[RUN-SUMMARIES.json](RUN-SUMMARIES.json) pairs timestamped native events with exact commands, arguments, results, source-opening events and file changes. Whole-process durations include startup and model reasoning; tool elapsed times are separately available. No latency percentile or one-second promise is inferred.

| Native condition | Whole run | Request to first source-linked result | Request to exact source opening | Request to edit |
|---|---:|---:|---:|---:|
| First preauthorized session, CLI-prepared map | 69.473 s | 23.402 s | 29.650 s | 48.247 s |
| Preauthorized linked worktree | 60.318 s | 30.255 s | 43.273 s | No edit |
| Warm stale/recovery | 52.253 s | 20.635 s | 41.325 s | No edit |
| Scoped disabled ordinary control | 50.514 s | No MCP result | See event summary | 37.119 s |
| Enabled ordinary control | 41.867 s | No MCP result | 18.756 s | 29.593 s |
| Native missing/corrupt/unmapped/empty state session | 26.213 s | State outputs, not useful consumer evidence | No source opening | No edit |

The first session is a new host/server process against an already CLI-prepared tiny map; it is not a cold extraction or first-ever-install benchmark. No interactive permission-wait duration was measured. Original failed/denied runs have whole-run timing but no per-event timestamps because timestamp collection was added before the successful runs.

## Claude and ambient delivery limits

Installed Claude validates the exact shipped `.claude-plugin/plugin.json` with `success:true`. It warns that root `CLAUDE.md` is not loaded as project context and recommends shipping a skill. Marketplace validation is a separate receipt. Neither validator establishes actual model/MCP/hook startup. [Plugin validation](claude-shipped-plugin-manifest.receipt.json).

Claude's current auth status is `loggedIn:false`, `authMethod:none`. No sign-in or authenticated model/tool/hook trial was attempted. An attempted scoped `mcp list` preparation hit variadic-option parsing; its one correction rejected `--restricted`. Those are probe setup errors, not Codeweb product failures. Actual Claude delivery, linked-worktree behavior and lifecycle control remain unverified. The auth publication contains only the two needed fields; full auth output stays private.

Codex's successful smokes use `features.hooks=false`. A user hooks file exists, so enabling hooks without legitimate isolation could activate unrelated definitions. It was neither read nor trusted. No trusted native Codeweb hook event or hook-context delivery is claimed.

Separately labeled standalone adapter probes show two repair candidates:

- The canonical shipped hook consumes a Claude `Edit` file-path payload but ignores the documented Codex `apply_patch` payload containing `tool_input.command`. Codex's matcher aliases can cover Edit/Write; failure is not inferred from matcher spelling alone. The Claude payload identifying a change to low-fan-in `rare` emits a file/popular summary and popular callers, omitting the consequential consumer. [Codex adapter](supplementary-codex-adapter-canonical.receipt.json), [Claude adapter](supplementary-claude-adapter-canonical.receipt.json).
- Calling the direct hook entry through the `/var` alias yielded zero output for both payloads. One canonical `/private`-path correction exposed Claude output. The source guard compares resolved argv spelling against the canonical module URL. These are standalone compatibility facts, not a trusted host hook trial. [Aliased probe](supplementary-claude-adapter.receipt.json).

P-03 owns demonstrated adapter/entry issues. P-04 owns actual native hook trust/delivery, Claude authentication-dependent trials, generated/dependency boundaries and remaining native provenance/truncation/invocation-failure controls or explicit valid exclusions. The broader deterministic technical matrix remains separate evidence.

## Reproduction and preservation

[probe.py](probe.py) contains the scoped runner and exact successful permission configuration. Each `*.receipt.json` retains the executable argument array, prompt, cwd, timeout, start/end times and baseline hashes. Original fixture files are copied into [fixture-source](fixture-source), with their original hashes in IDENTITY. For clean reruns, copy those files into a **new disposable fixture**, initialize/map it, create a new detached linked worktree, and replace only fixture/graph paths in the relevant recorded command and prompt. Do not replay `baseline:true` against the retained evidence fixture because it would replace the original baseline.

Raw events stay in a private disposable directory while collecting. Published copies redact local personal identifiers; [PUBLISHED-EVIDENCE.json](PUBLISHED-EVIDENCE.json) preserves original and published hashes. No credential files, tokens or auth email were read or printed. Candidate/product source, global profile/auth/trust, protected harness, unrelated work and Paperclip state were not changed. There were no GitHub operations, releases, outreach or purchases. Local fixture Git commits used a scoped selected-account author override.

[FINAL-PRESERVATION.json](FINAL-PRESERVATION.json) rechecks both surviving baseline hashes and all pinned candidate file hashes after the native sessions. [FREEZE.json](FREEZE.json) pins the review packet files. The reported case dispositions are 11 pass, two supplementary adapter/entry failures and seven unverified boundaries; these are surface-level dispositions, not a field-readiness score.

Official references actually opened for this preflight: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp), [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude CLI](https://code.claude.com/docs/en/cli-reference), [Claude hooks](https://code.claude.com/docs/en/hooks). They support setup contracts, not a claim that this candidate's runtime surfaces passed.
