# Independent P-01 review — September 30, 2026

**Verdict: PASS** for the exact frozen candidate below. No blocking finding. This is a bounded similarity-output review, not an unqualified native-delivery or ship verdict. Root must still record the required full `sh scripts/check` result before integration.

Base and unchanged HEAD: `fd3b637e9ad4e1f7265799298761bc1ee83fe76c`. Worktree: `$LOCAL_TMP/codeweb-p01-3tylipwm`. Node v26.7.0; Python 3.14.7. Reviewed actual tracked diff and untracked regression suite against the base, read CHARTER.md, CLAUDE.md, docs/harness.md, DECISIONS.md, central SPEC.md, the task acceptance and NED spec. Candidate hashes match the implementer handoff and were rechecked after verification.

| Reviewed file | SHA-256 |
| --- | --- |
| `SPEC.md` | `b330997cd7f5499bfff99446dcb9d9573d5d8663ff6b32eb90a1e17432e0978d` |
| `scripts/find-similar.mjs` | `a9b9cd3a7f3c097e4a0cc3ba8fefee1f98349bfe58fba518a9882e7c5ef3bf0b` |
| `scripts/mcp-server.mjs` | `67bea39f000592963826db38b6078da40c6a8b46e5d12892d5d8d020c8800453` |
| `tests/find-similar-output.test.mjs` | `1a3151af95c3fcd97ce81fc82e215b6e4bfbcbf083084a91d91e58c52b45052a` |
| `tests/test_ac_pins.py` | `66d1fc4b7d154fd67e7d9e8d3dd4b7128c65f9b769ca8d56d1e672267dc0bf7a` |

## Decision and evidence

The empty result now means no candidates at or above the threshold in available mapped bodies. Positive results offer source locations for comparison. Neither changed CLI output nor the changed MCP description asserts novelty, behavioral correctness, safe writing or semantic substitutability. Both identify mapped non-test function/method scope, unavailable/unmapped bodies, the existing 15% floor, first-400-line existing-body cap and uncapped candidate. Structural mode identifies the mode rather than claiming equivalent behavior. Human truncation reports the true omitted count and a working `--k <total>` expansion.

The diff changes human output/comments and one MCP tool description plus an import from existing constants; it changes no scoring, eligibility, sorting, source access, sidecar loader, payload generation, CLI parsing, MCP arguments/schema or exit handling. Four tracked modifications and the one new product test are the declared scope. No protected harness, dependency, unrelated product feature or original dirty checkout was changed by this candidate or review. The reviewer wrote only this report and its verification JSON in the candidate worktree; fixtures and archived-base probes used temporary directories. No GitHub, commit, deploy or Paperclip operation was performed.

The new AC-34 is executable and meaningfully tied to the corrected observable behavior. Its tests exercise supported-zero, incomplete and empty maps; conflicting numeric contracts with identical lexical scores; deliberate same-file duplication and excluded test files; exact source opening; different-syntax/missing-body controls; cap/truncation/expansion; source/usage/graph failures and actual MCP discovery/call transport. The tests leave source comparison and actual test execution distinct. Independently running those tests on an archived base reproduced **six failures and one pass**; the ordinary error control remained green. This verifies the regression against base behavior rather than trusting the implementer's before report.

## Verification actually run

- `node --test tests/find-similar-output.test.mjs tests/find-similar.test.mjs tests/structural-clone.test.mjs`: **18 passed, 0 failed, 0 skipped**. Includes the existing randomized independent similarity/ranking oracle, count/determinism and live/sidecar parity controls.
- `node --test tests/mcp.test.mjs tests/mcp-budget.test.mjs tests/mcp-staleness-parity.test.mjs tests/mcp-scenarios.test.mjs`: **52 passed, 0 failed, 0 skipped**. Covers schemas, inline body/structural args, failure survival and existing transport/verdict behavior.
- `python3 scripts/spec_lint.py`: pass, **34 live ACs, 34 built and test-pinned**.
- `python3 -m unittest tests.test_ac_pins.TestAcPins.test_ac_34_bounded_similarity_output`: pass.
- `git diff --check`: pass.
- Independent base/candidate probes: **36 byte-identical CLI JSON/stdout/stderr/exit comparisons** over live, fresh-sidecar and stale-sidecar paths, with body-file/stdin/signature, empty/zero-shingle candidate, structural, capped-tail and k edge cases. Exact threshold fixture includes 3/20 = 15% and excludes 3/21; methods remain eligible, classes/test files excluded; 16 matches/19 scanned/6 omitted remain true.
- Independent MCP probes: **8 identical base/candidate tool-call replies**, including signature/body/structural, existing simultaneous-body-and-signature precedence, absent candidate, unknown arg, wrong boolean type and >64KB body with missing graph. Initialize results and all tool names/schemas are identical; only the selected tool description differs.
- Additional uncapped-candidate probe: a 401-line stdin candidate retains the tail's shingles and matches its corresponding body at 1/6; the existing-body capped-tail negative control remains green.

Commands, detailed archived-base failure output, direct parity samples and exact identities are in [REVIEWER-VERIFICATION.json](REVIEWER-VERIFICATION.json). An initial temporary probe used the `/var` alias while Node canonicalized imports to `/private/var`, so the existing entrypoint guard did not start MCP. That probe yielded no MCP evidence; it was rerun successfully with canonical paths. It required no product change.

## Scope of the pass

NED-01 and NED-03 pass on the changed similarity surface. NED-06 passes for preservation: unchanged structural/test behavior plus existing controls, with no new execution or coverage claim. NED-07 passes for similarity source locations, valid same-file candidates, omissions/expansion and visible limits. The complete native-delivery matrix, actual host sessions, relevant edited-target coverage, recovery/permissions, freshness and intentional-duplication dismissal workflows remain P-02 work. The unchanged initialization shorthand `(does this exist?)` is still a question rather than an equivalence guarantee; the new tool description bounds its answer. This review does not establish broader initialization/host-copy readiness.

No full gate was run by this reviewer. No safe reuse, complete dependency coverage, actual program correctness, user benefit, retention, payment or comparative coordination benefit is established. JSON intentionally retains its established schema and receives no new uncertainty fields in P-01. Its raw scores/tier labels remain similarity evidence interpreted under the bounded tool description, not semantic proof.
