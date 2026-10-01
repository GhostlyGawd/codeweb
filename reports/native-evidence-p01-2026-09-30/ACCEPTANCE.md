# P-01 bounded implementation acceptance

The user approved proceeding after the recommendation to complete P-01 using Sol high implementation and a separate reviewer. Routing clarification was asked because restoration was also discussed; direct Codex is the stated working assumption, and no Paperclip restore is performed by this assignment.

Original work acceptance: "NED-01/03/06/07 pass; empty/similar outputs retain compatible behavior and bounded truth; current gate/review recorded."

The NED spec explicitly says P-01 alone does not pass the full matrix. This assignment verifies those cases on the changed similarity-output surface: no unsupported novelty/safety/substitutability inference, named source candidates rather than automatic reuse, visible existing threshold/body-cap/truncation limits, ordinary exit/failure behavior and unchanged JSON/ranking contracts. Structural/test behavior must not be relabeled by this correction. Document broader NED cases as pending P-02 rather than claiming global host/readiness success. Do not silently weaken or change a required test/harness.

Inspect CHARTER.md, CLAUDE.md, docs/harness.md, SPEC.md and DECISIONS.md. Work in the isolated main-based checkout recorded in START.json. Add a central executable AC and a meaningful failing-before/passing-after regression if required by the existing specification process. Product tests outside tests/harness/ may be changed; protected harness and unrelated work remain untouched. No dependency, release, outreach, hosted service, runtime Paperclip operation or mutation of the original dirty checkout is part of this task.

The implementer writes changes, focused verification and an exact file/commit handoff. The reviewer independently checks the final diff and applicable behavior, including compatibility/limits, and records a verdict without implementing fixes. Root owns integration, required full-gate execution, live-plan updates and publication as GhostlyGawd under existing session authority. Customer value and comparative coordination benefit remain unobserved.
