# Private source-build install and controlled-session runbook

Preparation only; no participant setup performed. Candidate source is `95bf6178f1c3979d3ed169329002daa9a41fb73d`. Do not use the published npm 0.15.0 global-install instructions for this newer candidate. Claude is deferred. Use normal participant-owned source and native tools; no global config write, HOME/CODEX_HOME override, credential collection or automatic recording is prescribed.

## Before counted observation

Confirm actual observation, install, per-session permission and named adjudicator/source-access consent. Agree the source boundary, privacy choices and minimal event-note method. Verify Node ≥22 and the actual Codex CLI version/model permission with the participant. P-04 tested CLI 0.159.2 with requested gpt-6.1-sol/xhigh and the regex source profile; another version/configuration needs scoped preflight evidence rather than an assumed pass. Record accepted requested identities separately from independently confirmed backend identities. No new account, paid model run or package/dependency download is authorized by this packet.

Use a read-only local copy/worktree of the approved source already supplied by the authorized operator. The participant chooses its local destination; the source ID and byte/hash receipt are reviewed before running. Do not run from a dirty development checkout or distribute a raw host packet. Do not install optional parsers; the tested source regex profile requires no mandatory dependencies. Running ordinary participant checks may execute their own code under their normal permissions; Codeweb mapping itself reads source. Source access also remains subject to their existing coding provider's policies.

With participant permission, verify the destination in a local terminal:

```sh
node --version
codex --version
git -C /ABS/APPROVED-SOURCE rev-parse HEAD
git -C /ABS/APPROVED-SOURCE status --short
```

The source commit must match exactly and product files must match the approved byte receipt. If Git metadata is absent, compare the authorized source manifest instead. Metadata version 0.15.0 does not establish a released build. Do not repair, fetch, switch accounts or update global tools silently. Record setup/access failure and time; participant-owned corrective action requires their permission.

## Native and treatment configuration

Create **reviewed per-session values**, not a persistent global installation. Official OpenAI documentation describes stdio command/args/cwd, `enabled_tools`, a server default prompt and per-tool approval overrides in [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), with keys in the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). These syntax references do not prove this client's frontend filtering, ordinary usability or source boundary confinement. Confirm local help/version before use.

The source server is launched directly as Node with one argument `/ABS/APPROVED-SOURCE/bin/codeweb-mcp.mjs`, using an absolute Node ≥22 executable if needed, and the authorized workspace as cwd. There is no npm install requirement. Participant-selected `CODEWEB_NO_STATS=1` may be passed in server env to stop local receipts; a participant who keeps them still shares nothing automatically. Preserve their choice and do not request the receipt files.

Use the following TOML values as a **reviewable configuration fragment**, after replacing placeholders locally. It is not an instruction to overwrite config.toml:

```toml
[mcp_servers.codeweb]
command = "/ABS/NODE22"
args = ["/ABS/APPROVED-SOURCE/bin/codeweb-mcp.mjs"]
cwd = "/ABS/AUTHORIZED-WORKSPACE"
enabled = true
default_tools_approval_mode = "prompt"
enabled_tools = ["codeweb_map", "codeweb_refresh", "codeweb_explain", "codeweb_impact", "codeweb_context", "codeweb_find_similar", "codeweb_diff", "codeweb_deadcode"]

[mcp_servers.codeweb.tools.codeweb_map]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_refresh]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_explain]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_impact]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_context]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_find_similar]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_diff]
approval_mode = "approve"
[mcp_servers.codeweb.tools.codeweb_deadcode]
approval_mode = "approve"
```

The eight exact permissions need participant acceptance and the bounded approved client condition. Do not set the whole server to approve or include `codeweb_review`, ambient hooks or a product skill. The source server serves 28 definitions; an eight-tool policy is not proof that all other frontend definitions are absent. Preauthorization is scoped learning, not default permission usability. Never describe it as security confinement: it does not prevent other filesystem or host activity by itself.

Prefer the participant's existing safe per-session override method. Codex CLI local `exec --help` accepts dotted `-c key=value` overrides, `--ephemeral` and `--ignore-user-config`. These flags do not authorize changing policy. If a controlled session needs ignored user config, reproduce all their useful usual grep/LSP/tests/instructions and expert-help access in both conditions via participant-reviewed session settings. Avoid copying raw personal config or suppressing helpful tools. The exact P-04 fixture used apps/hooks disabled and workspace-write/never; if preserving competent usual controls needs broader runtime permissions or unsupported integration, classify it as a readiness gap and defer counted work. Never prescribe dangerous bypass flags or a provider/account change.

Native configuration sets only the owned Codeweb server disabled/absent and deactivates only Codeweb instructions/hooks/skill. Keep useful native controls identical. Do not trust `enabled=false` alone as complete absence: inspect actual effective tool/frontend state and Codeweb process/call absence using participant-reviewed minimal notes. The existing frontend evidence gap must be resolved in the participant's actual session before a clean comparison. If catalog absence cannot be observed, mark absence unverified and retain the access/setup case outside a passing comparison.

## Task session and minimal evidence

Freeze allocation and bounded oracle before condition outcomes. Record actual screening, qualification and final trial-consent dates before allocation; actual adjudicator consent/availability must also precede allocation. Pin each case's actual source identity after allocation, record its timestamp and tie the oracle to that same pin. Record condition configuration verification before task start and actual source-build setup start/confirmation before treatment. The decision-maker actor is this enrolled participant's ID; use that same ID for their effort and the appointed adjudicator's ID for separate adjudicator effort. Use separate new sessions with the agreed configuration and normal source workspace. Do not repeat one change to generate timings. For native-first participants, complete the native case before introducing Codeweb to avoid leaking setup findings; charge actual Codeweb installation/mapping to their later first treatment case. For treatment-first participants, record possible carryover to the distinct native task.

Start manual actor-effort intervals when work starts, including source-build setup, permissions and facilitator help. Record exclusive category/mode and actor. Pause blocked-wait timing when the person works on another activity. Record request/start/decision/end timestamps and model waits separately. No autocollection helper or recording wrapper is provided.

Observe initialization and a naturally relevant approved call in treatment. Do not force a call for eligibility. `codeweb_map` receives the agreed local `path` and `outDir`; subsequent tools receive the actual `graphPath`/target as defined by the installed served schema. Review arguments locally before the preauthorization: these parameters can write artifacts/refresh graphs and are not filesystem security boundaries. Record current source identity, graph/baseline identity and currency; do not overwrite the original before snapshot. Preserve normal tests and CI; structural green, skipped checks, historical coverage, graph neighbors and fresh execution remain distinct.

Let competent normal inspection finish and record its plan before adding evidence. Open source for each relationship/candidate, decide and check normally. Preserve null matches, intentional duplication, familiar native successes, generated/runtime omissions and errors. Recovery, permission reading, mapping/refresh, worktree handling, baseline reconstruction, source reading and facilitation all count. If first mapping takes time or fails, keep it. No latency percentile, token advantage or onboarding claim follows from a successful query.

Record event notes minimally: approved tool name, timestamp, source/graph identity, result category, source inspected and actual changed/unchanged decision. Source/raw transcripts stay with the participant unless explicit scope permits a private extract. Review notes with the participant before retention. Adjudicator independently signs correctness/harms and their time. Missing findings/effort or a material unresolved result cannot pass.

## Close and remove

End the ephemeral owned session and stop only its owned server if needed. Remove/disable only the per-session definition, with participant permission; verify no further owned launch/call and a normal native edit works. Do not uninstall a global plugin, alter shared settings or claim all frontend tools absent without observing them. Leave or delete only this trial's local artifacts under the participant's chosen retention instruction; preserve their unrelated work and original baseline.

Record cleanup/recovery effort and any access failure, then confirm the consented follow-up route/window. Optional return is their choice. No telemetry, reminder schedule, dashboard or service is installed.
