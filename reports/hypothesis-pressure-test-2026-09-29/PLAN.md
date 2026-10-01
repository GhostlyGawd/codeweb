# Approved hypothesis pressure test

User approval: “approved.” Scope agreed in the terminal: twelve distinct lens assignments; two independent syntheses; one adversarial evidence/fidelity review; lead-owned final editing and a final review; preservation and bidirectional breadcrumbs for the collected source research. This approval authorizes execution of the review packet, not a product build, participant outreach, a paid offer, or publication.

## Hypotheses under review

**Local:** a short conditional pre-edit consumer/reuse brief improves an agent-heavy developer's decisions enough to offset its added work and earn repeated voluntary use.

**Paid:** managed coordination of agreed checks and source-linked shared evidence removes recurring team work beyond free local Codeweb, ordinary CI, and existing PR practice, enough to earn purchase and renewal.

Review the exact frozen strategy and proof-sprint proposal. The twelve lenses may reject or substantially change these hypotheses. A proposal can be coherent while its customer effect remains unproven. Do not reuse “PASS as a falsifiable strategy” as validation of demand or indispensability.

## Inputs and preservation

`INPUT-MANIFEST.json` and `INPUTS.zip` freeze the collected audit, research packet, strategy with prior versions/reviews, proof-sprint proposal, earlier research plan, founder context, charter, and selected existing capability documentation. Individual files are also readable in `inputs/`, preserving their original relative paths. No prior research artifact is replaced. Available temporary reference captures are inventoried; missing captures remain explicit gaps.

The canonical evidence IDs, source URLs, retrieved/publication dates, passage locators, provenance, source registry, query logs, original excerpts/notes, snapshots, limitations, and correction history remain part of the full packet. This is preservation of collected materials, not a claim that every external article or thread was fully archived. External sites may change; record inaccessible material honestly. Preserve new targeted source checks separately with dates and access boundaries.

Verify input hashes at initialization and final delivery. If sandboxed workers need writable copies, extract the same archive into their existing management workspace and verify it against the manifest. Write outputs separately from frozen inputs. Root will mirror the final approved packet into the requested repository directory if the worker cannot write it directly.

## Orchestration

The existing Product Lead owns the entire objective, including decomposition, native dependencies, continuations, review, corrections, and final synthesis delivery. Use the existing Paperclip CLI and existing roles. One run per role, at most three concurrent runs including review. Preserve the configured 600-second run window and one corrective attempt per task; normal checkpoint continuations are not new assignments or hidden retries.

Use three linked phase objectives to respect the six-child limit per objective: phase A has lenses 01–06, phase B has lenses 07–12, phase C has syntheses A/B and the adversarial/fidelity review. These are fifteen substantive assignments. A coordinating parent may contain these three phase objectives and own final editing. Avoid cycles: synthesis depends on the twelve lens outputs, and final review depends on the edited synthesis. Do not close the coordinating objective based on a phase or successful dispatch alone.

All fifteen assignments must remain separate work units and separate artifacts. Do not combine lens pairs or collapse twelve reviews into fewer reports. Reuse roles through separate task contexts; record actual issue/run/session identities. Verify fresh contexts for independent first drafts, particularly syntheses A/B. Both syntheses receive the identical complete input and lens packet, without the other synthesis draft or verdict. Record any isolation limitation rather than claiming perfect independence.

The final reviewer must not author either synthesis or the edited recommendation it approves. Its adversarial review and final edited-artifact check can use the same assignment/native review stage. Product Lead may edit the final recommendation after reviewed syntheses; it cannot approve its own edited work.

At pre-dispatch, no workers were running and no duplicate pressure-test objective was found. Preserve other historical/current website tasks and their user gates. Do not revive or retask them.

## Method per lens

Start from the full existing evidence packet, including counterexamples, original read boundaries, and independent research review. Evidence counts describe the collected corpus, not population prevalence. Builders, investigations, demonstrations, and ordinary users must not be conflated. The earlier corpus had 132 records and 110 declared fully read source units, with a source-volume shortfall and known date/coverage gaps.

Each lens returns the supported case, the strongest countercase, a concrete failure scenario, a verdict, and the smallest test that could settle uncertainty. Use the schema in `ASSIGNMENTS.md`. Distinguish public self-report, repository-observed capability, inference, and untested proposed behavior. Check the original record/source when a summary does not support a load-bearing conclusion. Targeted public source reopens/search are allowed where necessary to resolve a specific gap; a new unbounded collection campaign is not required.

For technical capability claims prefer primary documentation or source. Use first-person original accounts for user experience. Avoid search snippets as final evidence. Preserve resolved/version-specific complaints and genuine null results. Do not simulate a customer or buyer, or treat imagined persona dialogue as user research. Visual claims require inspected screenshots; the dated published-site audit is not evidence about newer homepage candidates.

Verdicts: `retain`, `narrow`, `revise`, `reject`, or `unresolved_from_existing_evidence`. A lens may retain a hypothesis for testing while leaving customer effects unresolved. Agreement between agents is not additional customer evidence. Native-tool, compiler/CI, private-source, and intentional-duplication counterexamples may change the recommendation.

## Synthesis and nuance protection

Each independent synthesis must account for all twelve lens reports and the original evidence packet. Reconstruct needs by supported segment/task/context, then state the product hypothesis and paid hypothesis that best survive. Include the strongest rival interpretation and why it may win. Produce source/finding-linked claims, proposed tests, and explicit uncertainties. Do not simply shorten reports or count majority votes.

Create a coverage ledger for every material lens finding: carried forward, qualified, contradicted, rejected, or unresolved, with a reason and downstream IDs. Preserve disagreements between segments, tasks, source versions, and local/paid attribution. Create bidirectional edges:

`source/capture → evidence ID → lens finding ID → synthesis claim ID → final decision/test ID`

Every decision must link backward to its evidence and forward to a test if it remains a hypothesis. Every original evidence record must have a usage entry, including `not_used` with a reason where applicable; not every record needs to support a recommendation. Retain full original reports, both synthesis drafts, review/correction history, and final editing diffs.

The adversarial reviewer checks all material final claims, all quantitative/pricing/capability claims, all marked disagreements, and the coverage ledger against the twelve reports. Reopen supporting originals where needed. Its report names omitted findings, distorted conditions, unsupported inference, and shared interpretive errors. If a key gap cannot be settled, the edited recommendation must retain that uncertainty or reject the claim. The final reviewer rechecks the exact edited artifact hash and breadcrumb links.

## Required output packet

- `README.md`: clear final recommendation, what survived/changed/was rejected, strongest unresolved questions, and actual completion/limits.
- `lenses/01-...md` through `lenses/12-...md`: twelve separate reports and their finding tables.
- `SYNTHESIS-A.md` and `SYNTHESIS-B.md`: independent complete drafts, with identities and input-manifest hash.
- `ADVERSARIAL-REVIEW.md`, `FINAL-REVIEW.md`, and retained correction history.
- `FINAL-HYPOTHESIS.md` and `VALIDATION-TESTS.md`: the narrower/rebuilt product and paid hypotheses, conditions, failure rules and ranked minimal tests. Tests are proposals unless separately authorized and actually executed.
- `FINDING-COVERAGE.json`, `CLAIM-LEDGER.json`, `BREADCRUMBS.json`, `EVIDENCE-USE.json`, `DISAGREEMENTS.md`: traceability in both directions and preserved nuance.
- `SOURCE-ADDENDUM.*` and `SOURCE-GAPS.md`: any new targeted reads, originals, access boundaries, and uncaptured sources.
- `CONTROL-PLANE.json`, `RUNS.json`, `OUTPUT-MANIFEST.json`, `COMPLETION.json`: actual tasks/runs, independence checks, hashes, review, limits, interventions and placement.
- The complete frozen inputs, original collected source records and available captures, directly or through the included verified archive and index.

This packet must be locally accessible in `$LOCAL_HOME/Repositories/codeweb/reports/hypothesis-pressure-test-2026-09-29/`. Worker staging may use `$LOCAL_HOME/.local/share/codeweb-paperclip-pilot/cycle-01/workspace/reports/hypothesis-pressure-test-2026-09-29/`; include portable artifacts and root delivery verification when sandbox placement requires it.

## Completion standard

Fifteen separate assignments delivered; twelve lens findings accounted for; two independently produced syntheses verified; adversarial and final review completed; recommendations and proposed tests trace to evidence; original input hashes preserved; final files delivered and verified in the requested repository. Name gaps and actual limits without quietly lowering scope. A final concise narrative is sufficient only because the full original packet and breadcrumb ledgers accompany it.
