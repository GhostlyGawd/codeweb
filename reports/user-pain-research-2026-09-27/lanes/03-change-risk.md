# Lane 3 — Cross-file change risk

Coverage: one complete engineering article, one complete HN story/comment tree, a complete repository-documentation issue and partial Reddit narratives. Host-specific incidents stay in their original lanes and are cited by shared IDs. This is not enough for a high-confidence cross-family recurring demand claim.

## Findings

1. **High priority: ordinary tests/history can solve distant regressions.** CW-T019 reports a base-model scope change breaking three feature areas and successful git bisect plus full tests. Static reachability might help locate consumers, but dynamic record filtering still needs behavioral checks. The author is an AI-service/academy operator, and the success is self-reported. CW-T019 is coded Claude Code/resolved for this reported fix only.
2. **High priority: green tests can have an invalid oracle.** CW-T022 reports runtime JavaScript patching inside E2E tests hiding broken UI. The author added CLAUDE.md test rules; their effectiveness is unknown. Structural context alone cannot repair the meaning of an assertion. This older partial account is mechanism evidence, not a current prevalence estimate.
3. Duplicate utility implementation (CW-T018) is a plausible discovery problem. Codeweb lexical lookup might expose an existing method; deciding whether to extend it remains design work. Upfront review already costs the reporter time.
4. Fresh implementation after reflection improved a state-machine feature (CW-T021). The author promotes a workflow tool. This is a builder narrative with a reported resolved example; the specific host is unknown, not demonstrated mixed-host usage. It does not establish independent demand for graph analysis.
5. Characterization tests and incremental edits reportedly supported a large Django refactor (CW-T023). Only the opening part was read, dates remain null, and estimated counterfactual time is not treated as measured savings. CW-T023 is coded Claude Code/resolved for the author’s reported completed refactor.
6. Documentation references can drift after module moves (CW-T012). Deterministic path/structure checks might help some cases; local-versus-CI toolchain mismatch and unenforced policy require different mechanisms. The source is an audit-tool builder.

## Workflow, audit change, and proposed test

Jobs cluster around before-edit discovery, preserving behavior during refactors, and proving a fix after edits. The mechanism split matters more than raw complaint counts: static consumers, runtime/data contracts, test-oracle validity, host execution and design judgment are different problems.

Change to audit interpretation: a change brief or receipt should expose its blind spots and cite exact revision/edges; it must not imply that all passing-test regressions were foreseeable from a static map. The dated screenshots remain untouched, and this is not a visual verdict on the newer candidate.

Proposed, not executed: a supported-language fixture set with explicit imports/callers, dynamic dispatch, string/config consumers, and an intentionally misleading test. Ask the native loop and proposed structural brief to identify affected consumers and unknowns. A false assurance on dynamic/test semantics rejects an overbroad safety claim. Charter-gated experiments require separate authorization.

Unknowns: real cost of missed consumers, prevalence among ordinary developers, repeated Codeweb use, and willingness to pay. Local one-repo functionality stays free. No theme completed two empty targeted sweeps; priority remaining work is concrete non-promotional change narratives and native-success cases.
