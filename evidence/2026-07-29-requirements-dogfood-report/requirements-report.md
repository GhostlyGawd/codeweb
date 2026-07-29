# Requirements artifact report

Status: `BASELINED — AUTHORIZED APPROVAL RECORDED`

Content digest: `sha256:ef6faa2ef30fecc63fb7c2428c5b647266d26ab210efec245d0d979302634ecf`

Claim boundary: Artifact readiness only. This report is not NASA certification or organizational process compliance.

## Release gates

| Gate | Result |
|---|---|
| deterministic_checks | PASS |
| human_semantic_reviews | PASS |
| lifecycle_evidence | PASS |
| npr_authority_evidence | PASS |
| authorized_baseline_approval | PASS |
| clean_output_permitted | PASS |

## Findings

| Location | Check | Result | Basis | Message | Evidence |
|---|---|---|---|---|---|
| document.title | REQ-CTX-001 | PASS | NASA-SEH-REV2 Appendix C | title is present. |  |
| document.objective | REQ-CTX-001 | PASS | NASA-SEH-REV2 Appendix C | objective is present. |  |
| document.system_boundary | REQ-CTX-001 | PASS | NASA-SEH-REV2 Appendix C | system_boundary is present. |  |
| document.intended_readers | REQ-CTX-001 | PASS | NASA-SEH-REV2 Appendix C | Intended readers are identified. |  |
| document.lifecycle_scope | REQ-CTX-001 | PASS | NASA-SEH-REV2 sections 1.2 and 3 | Product layer, lifecycle phase, and process scope are declared. |  |
| source_authorities[0] | REQ-SRC-001 | PASS | NASA-SEH-REV2 Appendix C | Source authority SRC-CHARTER is defined. |  |
| source_authorities[1] | REQ-SRC-001 | PASS | NASA-SEH-REV2 Appendix C | Source authority SRC-SPEC is defined. |  |
| source_authorities[2] | REQ-SRC-001 | PASS | NASA-SEH-REV2 Appendix C | Source authority SRC-SHIPPED is defined. |  |
| document.language_profile | PROFILE-001 | PASS | requirements-rules.yaml | Selected language profile: shall. |  |
| document.lifecycle_profile | PROFILE-001 | PASS | requirements-rules.yaml | Selected lifecycle profile: general. |  |
| CW-PR-001 | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-001 | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-002 | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-002 | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-003A | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-003A | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-003B | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-003B | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-004 | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-004 | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-005A | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-005A | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-005B | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-005B | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-006 | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-006 | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-007 | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-007 | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-008A | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-008A | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-008B | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-008B | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| CW-PR-008C | VRF-PLAN-001 | PASS | NASA-SEH-REV2 sections 5.3 and 6.1; Appendix D | The requirement has a separate verification plan. |  |
| CW-PR-008C | LANG-SHALL-001 | PASS | NASA-SEH-REV2 Appendix C | One profile keyword is present: shall. |  |
| reviews[0] | REVIEW-001 | PASS | requirements-schema.md | Human review passed for source_fidelity. | The operator explicitly approved source fidelity for PR #85 in the Codex review thread after the requirements handoff. |
| reviews[1] | REVIEW-001 | PASS | requirements-schema.md | Human review passed for coverage. | The operator explicitly approved coverage for PR #85 in the Codex review thread after the requirements handoff. |
| reviews[2] | REVIEW-001 | PASS | requirements-schema.md | Human review passed for conflicts. | The operator explicitly approved conflict resolution for PR #85 in the Codex review thread after the requirements handoff. |
| reviews[3] | REVIEW-001 | PASS | requirements-schema.md | Human review passed for feasibility. | The operator explicitly approved feasibility for PR #85 in the Codex review thread after the requirements handoff. |
| reviews[4] | REVIEW-001 | PASS | requirements-schema.md | Human review passed for verification_adequacy. | The operator explicitly approved verification adequacy for PR #85 in the Codex review thread after the requirements handoff. |
| approvals[0] | APPROVAL-001 | PASS | requirements-schema.md | Authorized baseline approval matches the current content digest. |  |

## Traceability and verification matrix

| Requirement | Source document | Paragraph | Method | Criteria | Level | Lead | Facility | Phase | Acceptance | Preflight | Organization | State | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CW-PR-001 | SPEC.md | Acceptance criteria, AC-1 | test | `npm test` returns exit code 0 from a clean worktree that has no node_modules directory. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:npm test"] |
| CW-PR-002 | SPEC.md | Acceptance criteria, AC-2 | test | `node scripts/check-consistency.mjs` returns exit code 0 for the reviewed commit, and its regression tests reject each supported drift class. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:node scripts/check-consistency.mjs", "test:tests/test_ac_pins.py::TestAcPins::test_ac_2_consistency_gate_green"] |
| CW-PR-003A | SPEC.md | Acceptance criteria, AC-3 | inspection | The package.json dependencies field is absent or contains no entries. | product | codeweb-maintainer | repository checkout | regression | True | False | Codeweb project | PASS | ["test:tests/test_ac_pins.py::TestAcPins::test_ac_3_zero_runtime_dependencies", "test:tests/package-shape.test.mjs"] |
| CW-PR-003B | SPEC.md | Acceptance criteria, AC-3 | test | An installation from the packed artifact returns exit code 0 without a required runtime dependency fetch. | product | codeweb-maintainer | isolated temporary npm prefix | package acceptance | True | False | Codeweb project | PASS | ["test:tests/package-shape.test.mjs::P3", "command:node --test tests/package-shape.test.mjs"] |
| CW-PR-004 | SPEC.md | Acceptance criteria, AC-4 | test | `sh scripts/check --prove-red` observes the expected canary failure, prints `PROVE-RED OK`, and returns exit code 0. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:sh scripts/check --prove-red", "test:tests/test_ac_pins.py::TestAcPins::test_ac_4_prove_red_and_hooks_wired"] |
| CW-PR-005A | SPEC.md | Acceptance criteria, AC-5 | test | `node --test tests/package-shape.test.mjs` returns exit code 0 and its packed-file assertions find no prohibited repository-only path. | product | codeweb-maintainer | supported local runtime | package acceptance | True | False | Codeweb project | PASS | ["command:node --test tests/package-shape.test.mjs"] |
| CW-PR-005B | SPEC.md | Acceptance criteria, AC-5 | test | `node --test tests/package-shape.test.mjs` returns exit code 0 and its packed-file assertions find no prohibited harness file. | product | codeweb-maintainer | supported local runtime | package acceptance | True | False | Codeweb project | PASS | ["command:node --test tests/package-shape.test.mjs"] |
| CW-PR-006 | SPEC.md | Acceptance criteria, AC-6 | test | Each `bin/*.mjs` file returns exit code 0 when invoked with `--help`. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:sh -c 'for b in bin/*.mjs; do node \"$b\" --help >/dev/null \|\| exit 1; done'", "test:tests/test_ac_pins.py::TestAcPins::test_ac_6_cli_front_door_answers_help"] |
| CW-PR-007 | SPEC.md | Acceptance criteria, AC-7 | test | `python3 evals/run.py` executes every discovered golden case, reports no failed case, and returns exit code 0. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:python3 evals/run.py", "test:tests/test_ac_pins.py::TestAcPins::test_ac_7_evals_floor_holds"] |
| CW-PR-008A | SPEC.md | Acceptance criteria, AC-8 | test | `node --test tests/json-support.test.mjs` confirms that every supported imported JSON fixture has one `<module>` node and that an orphan JSON fixture has no node. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:node --test tests/json-support.test.mjs"] |
| CW-PR-008B | SPEC.md | Acceptance criteria, AC-8 | test | `node --test tests/json-support.test.mjs` confirms that the staleness check names an imported JSON file after its mapped bytes change. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:node --test tests/json-support.test.mjs"] |
| CW-PR-008C | SPEC.md | Acceptance criteria, AC-8 | test | `node --test tests/json-support.test.mjs` confirms that the pre-edit hook names the imported JSON file, reports the importer count, and lists the importers. | product | codeweb-maintainer | supported local runtime | regression | True | False | Codeweb project | PASS | ["command:node --test tests/json-support.test.mjs"] |

## Product validation matrix

| Product | Activity | Objective | Method | Facility | Phase | Organization | State | Stakeholder trace | ConOps trace | MOE trace | Environment | Users | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Limitations

- Pattern checks do not prove semantic correctness, completeness, feasibility, safety, or conflict freedom.
- Human reviewers must compare the requirements with authoritative sources.
- NASA process compliance requires authorized applicability, tailoring, SEMP, ETA, and complete compliance-matrix decisions outside this checker.
