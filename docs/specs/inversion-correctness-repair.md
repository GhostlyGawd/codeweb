# Proposed inversion correctness repair

Work record: P-07. Evidence: [P-06 inversion audit](../../reports/inversion-audit-2026-10-02/README.md), pinned to main `9324a6a1f422ef41d5f1c5b89e87d59fd1e9175e`. This specification proposes implementation; the audit made no product source changes. Earlier completed gates remain historical evidence, with their bounded scope.

## User problem and acceptance boundary

A developer asks what an edit affects or what can be removed. Codeweb can currently omit a real consumer, invent a declaration or caller, and still report no known incompleteness. Two bounded cases enter cleanup deletion proposals. The first repair must prevent those proposals and correct their source facts; a bigger feature list does not address this trust failure.

Keep the charter: local static analysis, no target execution, zero required dependencies, deterministic output, compact agent answers and no local telemetry. Independent test oracles may parse or execute our owned fixtures outside the analysis path. This is not permission to add a runtime Babel dependency, broaden paid features or publish a release.

## Stages and criteria

### A: Declaration boundaries and lexical scope

INV-F01 and INV-F02 receive first priority. Model the extent of bindings rather than collecting shadow names for a whole function. Keep declaration discovery out of strings, comments and JSX child text; treat JSX expressions as executable source. Reuse a consistent source/binding model across definition and usage paths where practical.

Acceptance: the valid block fixture records invoke → outer target and its impact consumer. Neither that target nor the phantom JSX text appears in safe cleanup or campaign deletions. No pretend declaration exists. Retain positive controls for declarations inside real JSX expressions, and negative controls for text containing function syntax, nested scopes, block-local calls and same-named siblings. Record unresolved cases explicitly rather than fabricating a binding.

### B: Parameters and module export surfaces

INV-F03 and INV-F04 require resolution by binding identity, scope and import/export surface. A parameter must shadow the same-named module function. Namespace imports expose exports; default objects and class members are separate resolution cases.

Acceptance: the parameter fixture has no call to the module target. The private namespace member has no resolved call to Hidden and receives an appropriate unresolved-member limitation. An exported Visible member resolves. Preserve named/default imports, valid namespace JSX members, external imports, nested closures and same-name files as controls. Do not erase valid calls to avoid false positives.

### C: Bounded known references and honest unsupported coverage

INV-F05 and INV-F06 cover simple immutable callable aliases and literal Python decorators. Support the narrow cases with documented semantics, or mark them as unresolved dependencies with precise diagnostics. Unknown decorators, mutable aliases, wrappers and framework dispatch must retain their own limits.

Acceptance: local/imported immutable aliases expose the invoking consumer through impact, or clearly qualify the omitted relationship. Literal @decorate records a dependency associated with the affected action, or explicitly reports the missing dependency. Assignment-only references must continue protecting a known function from cleanup. Reassignment, destructuring, parameter/block shadowing and decorator factories must not silently resolve to an unrelated declaration.

### D: One confidence contract across CLI and MCP

INV-F07 requires consistent machine-readable analysis: scope, completeness/diagnostics, freshness, omitted results and next steps. Informational tools should retain useful partial results with their limitations. Decision/action tools must remain inconclusive when their required scope cannot be evaluated. Transport-level failure, valid empty output, partial information and a failed structural gate need distinct semantics.

Acceptance: rerun all eight paired surfaces from the audit. Find, explain, context and risk include in-band incompleteness on both transports without dropping useful mapped results. Impact, deadcode, review and diff retain their existing conservative behavior. Preserve fresh/stale, sparse/legacy, missing/corrupt/empty, quiet/excluded and JSON parsing controls. Behavior remains explicitly not evaluated.

## Verification and delivery

Every repaired family needs its original counterexample, positive and negative controls, source oracle, impact output and relevant downstream cleanup/gate check. Compare cold, warm and full extraction; record optional engine availability rather than treating requested modes as independent parsers.

Add invariance checks where useful: inserting a same-named binding into a completed sibling block must not remove an outer call; changing JSX literal text must not create a function; renaming a local binding must preserve relationships; changing an export surface must change namespace resolution. Keep independent expected facts rather than assertions that copy the implementation.

Run the required source gate and declared CI profiles after product edits, preserving the protected harness and unrelated local changes. Freeze the exact candidate and report independent review only if it actually occurs. Source merge and package release remain distinct actions. The bounded target is zero silent dangerous outcomes in the declared suite; no universal completeness or runtime-safety guarantee follows.

After correctness repairs, verify packaged artifacts and harder native tasks with actual opportunities for caller discovery. Separate server availability, uncued tool use, successful decisions, total effort and voluntary return. A tiny successful native-control task or a source check does not demonstrate indispensability or willingness to pay.

## Traceability

Preserve INV-F01–07 in the new packet, with cases and independent oracles. They supplement the original 65 research findings rather than rewriting that frozen ledger. Update task/result/current records per stage; retain the first failed runs and counterevidence. Personal settings, device paths, authentication and raw native sessions remain private.
