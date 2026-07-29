# Codeweb requirements dogfood review

Date: 2026-07-29

Status: `BASELINED — AUTHORIZED APPROVAL RECORDED`

Mode: Review. This review does not change the source requirements. It records
the operator's human review and baseline approval against the final content
digest.

## Scope and authority

This review applies the `write-verifiable-requirements` skill to the acceptance
criteria in `SPEC.md`.

Source precedence:

1. `CHARTER.md` controls ratified product intent, invariants, non-goals, and
   operator decisions.
2. `SPEC.md` controls the current product acceptance criteria.
3. `package.json`, implementation files, and tests supply shipped-behavior
   evidence. They do not silently overrule the charter or specification.

The selected profiles are `shall` for requirement language and `general` for
the lifecycle. Local identifiers such as `REQ-CLR-001` refer to trace records
in the skill. They are not NASA rule numbers. The NASA Systems Engineering
Handbook is guidance for this review. This review does not make a NASA
compliance claim.

## Review findings

| ID | Location | Source text | Finding | Proposed correction | Basis | Release effect |
|---|---|---|---|---|---|---|
| DR-001 | `SPEC.md`, AC-1 | “the full product suite passes from a bare, dependency-free checkout” | “Bare” does not identify the initial checkout state. The product subject is implicit. | State that the Codeweb product suite passes when `npm test` runs from a checkout that has no installed project dependencies. | `REQ-FORM-001`, `REQ-CLR-001`, `REQ-VRF-001` | Correct in the structured rewrite. |
| DR-002 | `SPEC.md`, AC-2 | “every public claim surface agrees” | “Every” creates an unbounded scope. The check only inspects the surfaces that `scripts/check-consistency.mjs` enumerates. | Bind the requirement to the public claim surfaces that the consistency gate enumerates. | `REQ-CTX-001`, `REQ-CLR-001`, `REQ-VRF-002` | Correct in the structured rewrite. |
| DR-003 | `SPEC.md`, AC-3 | “the product installs and runs with zero required dependencies” | The check inspects the `dependencies` field. It does not install the package or run the installed package. The evidence does not verify the complete source claim. | Separate the zero-dependency declaration from installation and execution. Add objective installation and execution evidence before a baseline claim. | `REQ-ATM-001`, `REQ-VRF-001`, `REQ-VRF-002` | Resolved by `tests/package-shape.test.mjs` P3. |
| DR-004 | `SPEC.md`, AC-5 | “no repo-only trees, no harness files” | The two excluded content classes are not defined in the criterion. | Define both controlled terms by the exclusion policy in `tests/package-shape.test.mjs`. | `REQ-AMB-001`, `REQ-FORM-003`, `REQ-VRF-002` | Correct in the structured rewrite; human source-fidelity review passed. |
| DR-005 | `SPEC.md`, AC-8 | “resolve, stamp staleness, and feed the pre-edit importer card” | The criterion contains three independently verifiable obligations. | Create one structured requirement for each obligation and trace all three to AC-8. | `REQ-ATM-001`, `REQ-TRACE-001` | Correct in the structured rewrite. |
| DR-006 | `SPEC.md`, all acceptance criteria | One-line criteria contain the check command and build status, but they do not record the source excerpt, rationale, owner, allocation, verification method, or evidence state. | Add a structured companion artifact. Keep `SPEC.md` as the controlling source. | `REQ-STRUCT-001`, `REQ-META-001`, `REQ-SRC-001`, `REQ-VRF-002` | Correct in the structured rewrite. |
| DR-007 | Review and approval | No digest-bound human review or baseline approval existed for the structured rewrite. | Obtain the required human reviews, correct the artifact, rerun the checker, and then obtain operator baseline approval against the final digest. | `REVIEW-001`, `APPROVAL-001` | Resolved by the operator's review and approval on 2026-07-29. |
| DR-008 | Temporary Git repositories in tests | Synthetic commits inherited the user-level identity guard but used unapproved fixture identities. Thirteen product tests failed before they exercised Codeweb. | Keep the guard active. Resolve the current checkout identity at runtime for ephemeral fixture commits. Use a non-personal fallback only when no checkout identity exists, such as in CI without the local guard. | AC-1 verification integrity; global identity policy | Resolved in the shared test helper and four Git-fixture suites. |

## Human review and baseline approval

The `codeweb-operator` reviewer recorded `PASS` for source fidelity, coverage,
conflicts, feasibility, and verification adequacy on 2026-07-29. The same
operator, acting as the declared `baseline_approver`, recorded `APPROVED`.
Each record is bound to content digest
`sha256:ef6faa2ef30fecc63fb7c2428c5b647266d26ab210efec245d0d979302634ecf`.

No requirements review action remains open. PR #85 remains unmerged until the
operator gives separate merge authorization.

## Task list

- [x] Confirm the controlling sources and precedence.
- [x] Select the language and lifecycle profiles.
- [x] Review the source criteria without changing them.
- [x] Add the structured rewrite and traceability data.
- [x] Run the deterministic checker and preserve its report.
- [x] Reconcile specification, implementation, tests, and documentation.
- [x] Obtain human requirements review.
- [x] Obtain operator baseline approval.

## Alignment workpad

| Contract item | Normative level | Implementation | Test | Docs/example | Status |
|---|---|---|---|---|---|
| Ratified product intent and invariants | Required | Existing product behavior | Existing product suite | `CHARTER.md` | Reviewed; unchanged. |
| Product acceptance criteria | Required | Shipped behavior | Commands and pins named by `SPEC.md` | `SPEC.md` | Reviewed; findings DR-001 through DR-006 are resolved in the structured companion and tests. |
| Structured requirement records | Supporting trace artifact | No behavior change | Requirements checker | Companion YAML and generated report | Baselined against the current content digest. |
| Installation and execution with zero required dependencies | Required source claim | Package and CLI behavior | Manifest inspection plus `tests/package-shape.test.mjs` P3 | `SPEC.md`, AC-3; `docs/specs/reach-surfaces.md` | Required conflict resolved with direct packed-artifact evidence. |
| Setup and examples | Informational | No behavior change | Existing tests | `README.md`, `docs/cli.md` | Reviewed and unaffected because this work does not change commands or setup. |
| Security and privacy boundaries | Required policy | No behavior change | Existing security tests | `SECURITY.md` | Reviewed and unaffected because this work does not change data flow, network use, or trust boundaries. |
| Architecture and interfaces | Required product contract | No behavior change | Existing interface tests | `SPEC.md`, `docs/reference.md` | Reviewed and unaffected except for trace metadata about existing requirements. |
| Visuals, version, and release claims | Informational and release policy | No behavior change | Existing consistency checks | `README.md`, site assets, `CHANGELOG.md` | Reviewed and unaffected because this work adds no release or readiness claim. |

## Verification evidence

- `npm test`: 943 tests; 893 passed; 50 skipped; 0 failed.
- Git-fixture regression set: 19 tests passed.
- `tests/package-shape.test.mjs`: 3 tests passed, including the real offline
  package installation and installed-bin execution test.
- `scripts/check-consistency.mjs`: passed for version 0.12.0 and 27 tools.
- `scripts/check --prove-red`: reported `PROVE-RED OK`.
- `evals/run.py`: 2 of 2 golden cases passed.
- `tests/json-support.test.mjs`: 8 tests passed.
- `scripts/spec_lint.py`: 8 live acceptance criteria; all 8 are built and
  test-pinned.
- Codeweb structural diff: no new cycle, confirmed duplication, orphan, or
  lost caller.
- Requirements checker output:
  `evidence/2026-07-29-requirements-dogfood-report/`.
- Requirements content digest:
  `sha256:ef6faa2ef30fecc63fb7c2428c5b647266d26ab210efec245d0d979302634ecf`.

## Limitations

The deterministic checker validates structure and selected text patterns. It
does not independently establish semantic correctness, feasibility,
completeness, safety, or source fidelity. The recorded human review and
operator approval apply only to the identified content digest.
