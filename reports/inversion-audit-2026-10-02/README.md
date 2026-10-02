# Codeweb inversion audit

Seven issue families were reproduced on main `9324a6a`. The highest-priority cases put a live outer function and literal JSX text into campaign deletion proposals. No deletion was executed, and no customer source was available or inspected.

The block-shadow failure is a regression introduced by P-05. The namespace/private-export false edge is also new in its JSX member path. Parameter shadowing, phantom JSX-text definitions, callable alias resolution and decorator coverage are older gaps.

[FINDINGS.json](FINDINGS.json) preserves expected evidence, observations, independent oracles and repair directions. [LENSES.json](LENSES.json) accounts for all twelve proposed lenses; their observations are bounded checks, not complete product certification.

The inversion was: **what would make a developer stop trusting Codeweb after relying on it?** We worked backward from deleting live code, changing the wrong implementation, missing a consumer, trusting stale facts, and accepting a misleading green check. Each case then received an expectation established outside Codeweb and a check of the actual downstream output.

| Finding | Reproduced failure | Consequence |
| --- | --- | --- |
| INV-F01 | A binding inside a finished block suppresses the outer call | Live function enters a deletion proposal; P-05 regression |
| INV-F02 | Literal JSX text is extracted as a function | UI text enters a deletion proposal |
| INV-F03 | A parameter call resolves to the same-named global function | Invented caller and impact |
| INV-F04 | A namespace JSX member resolves to a private function | Invented exported member; new P-05 path |
| INV-F05 | Known immutable callable aliases lose their invoking consumer | Understated impact in two fixtures |
| INV-F06 | A literal Python decorator contributes no dependency | Missing affected function |
| INV-F07 | Partial-analysis visibility and result usefulness vary by transport | Warnings disappear from JSON or useful partial answers are discarded |

## Reproductions and controls

[CASEFILES.json](CASEFILES.json) contains only synthetic handwritten source. Run `node reproduce.mjs` from this folder to repeat the extraction/impact/cleanup checks against the current checkout. It writes generated fixtures and results outside the repository and does not modify product source.

The runner also exercises eight actual CLI/MCP pairs on a ninth, explicitly incomplete fixture. Exit zero means the audit completed; it does **not** mean the product passed. Use `node reproduce.mjs --fail-on-gap` to return nonzero for unmet primary expectations. On the pinned main baseline, the public runner reproduced 28 unmet expectations across 16 primary observations and completed all eight transport pairs. Those expectations and engine repetitions are not 28 independent bugs.

[OBSERVATIONS.json](OBSERVATIONS.json), [TRANSPORT-SUMMARY.json](TRANSPORT-SUMMARY.json), [CONTROLS.json](CONTROLS.json) and [NATIVE-SUMMARY.json](NATIVE-SUMMARY.json) preserve allowlisted observed facts. The runner uses existing repository code and reads the MCP harness; it does not change the protected harness or install a dependency.

The eight primary fixtures ran in both requested engine modes. These repetitions share extraction paths and do not establish independent parser verification. Babel JSX AST, Python AST, controlled Node execution and actual CLI/MCP calls provide separate evidence.

Thirty-four existing focused controls passed. Baseline bytes survived refresh, structural red and repair. Structural green remained distinct from a deliberately failing behavioral oracle. Missing/corrupt/empty graph diagnostics remained actionable.

Normal size/mtime-based cache reuse can miss a same-size edit with preserved timestamps. Full extraction and immutable content inventory detected it. This is a documented cache boundary, not proof that all normal edits are stale.

## Native observations and boundaries

Controlled Codex runs requested GPT-6.1 Sol/xhigh on CLI0.159.2. The initial small-task trials ignored user config and included a no-external-services instruction; they are confounded observations. Their task postconditions passed, including the native control.

A subsequent uncued trial required server startup, preapproved owned-fixture tools and observed stdio traffic. Codeweb initialized and listed 28 definitions, but received no tool calls. Its independent normalization/display postconditions passed. A separate explicit availability control successfully called map, context and dependents.

One small task is insufficient to establish native adoption or net product value. No human participants, retention, paid demand or causal time savings were measured. Claude remains deferred by the existing user decision.

## Repair sequence

1. Repair lexical block binding and JSX-text definition masking with independent positive/negative oracles.
2. Repair parameter and namespace export resolution; preserve external-import and valid member controls.
3. Add bounded immutable alias/decorator support or explicit limitations.
4. Unify uncertainty envelopes across informational and action surfaces; preserve useful partial answers and inconclusive gates.
5. Recheck hard eligible native tasks and package delivery after correctness repairs.

The evidence supports improving binding/definition models and cross-tool confidence, rather than adding isolated name patterns. Every repair needs a minimal counterexample, negative controls and downstream impact/cleanup checks. No product source changes were made in this audit.

[The proposed repair requirements](../../docs/specs/inversion-correctness-repair.md) and work records P-06/P-07 connect this packet to the living plan. P-06 is the completed audit; P-07 is proposed implementation, with its own verification and delivery steps.

## Preservation

Raw fixture runs, revised inputs, native sessions, source hashes and intermediate results remain in private evidence storage. The original block probe was provisional and used an undefined external identifier; the corrected valid fixture is published. Original stdout and the correction record are retained.

Public summaries do not certify private host/session bytes. Personal paths, authentication, host settings and raw correspondence stay outside this packet.

The independent JSX oracle used pinned [Babel parser](https://babeljs.io/docs/babel-parser) options. Controlled native configuration followed the official [Codex MCP](https://developers.openai.com/codex/mcp/) and [noninteractive execution](https://developers.openai.com/codex/noninteractive/) documentation. Configuration availability is distinct from observed use and user benefit.
