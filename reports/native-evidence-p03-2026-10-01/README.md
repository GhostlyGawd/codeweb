# P-03 — trustworthy source evidence during edits

Status: separately reviewed source candidate, stacked on P-01. Deadcode results now carry bounded source/completeness/freshness information, edit hooks prioritize a resolvable mapped target, and mapped failures provide non-blocking recovery. Valid quiet/out-of-scope behavior and original baselines remain intact.

## Repairs and trace

| Repair | Result | Original reproduction | Research rationale |
|---|---|---|---|
| R01 | Deletion guarantees removed; legacy tier keys/counts retained with in-band provenance through CLI/MCP | TECH-02 | L04-F01, L07-F02 |
| R02 | Known edit targets receive same-file/external consumers; ambiguity is explicit; caller caps disclose omissions and expansion | TECH-06, TECH-36 | L03-F02, L08-F01 |
| R03 | Mapped invalid/empty/incomplete/failed analysis receives advisory recovery; supported quiet and excluded cases remain quiet | TECH-15, narrowed by independent P-02 review | L03-F04, L03-F05, L04-F04, L08-F02 |
| R04 | Malformed graph shapes fail actionably; supported sparse and legacy maps remain compatible | TECH-12 and unchanged D-sparse control | L03-F04, L04-F04 |
| R05 | Graph-only fallback qualifies stale/unknown freshness using existing stamps | TECH-14 | L03-F05, L04-F03, L08-F02 |
| R06, bounded portion | All three shipped handler entrypoints work through filesystem aliases; Claude-shaped envelopes are explicitly documented | TECH-31, H-P02-14/15 | L03-F01 |
| R07 | Optional subprocess stderr is captured during fallback; real extractor failure remains observable | TECH-37 | L05-F04 |

Original findings and counterevidence remain in the approved research packet. [VERIFICATION.json](VERIFICATION.json) carries NED/finding/case/file/test breadcrumbs and exact reviewed edited-file hashes. AC-35 pins the product regressions.

## Verification

The required `sh scripts/check` passes: **1,227 product tests passed, 60 skipped; 47 Python checks, consistency and five golden evals passed.** Skipped cases are not passes. The separate reviewer approved the revised exact source after independently replaying the demonstrated cases and running 30 further sparse/legacy/malformed CLI/MCP controls. Source and protected harness stayed unchanged during the gate.

An initial full gate caught an omitted-array legacy-format regression. That format was restored without weakening the existing test. The failed gate and first review remain in private original evidence alongside the successful revision. Raw commands, fixture paths, local instructions and setup information stay private.

## Remaining boundaries

R06 is source entry compatibility plus documented envelope scope. The shipped hooks are Claude-shaped; a Codex `apply_patch` adapter and actual trusted Codex ambient delivery remain unverified under P-04. Authenticated Claude delivery, lifecycle controls and the remaining applicable native matrix also need their own evidence.

This candidate is not a merge, package release, field-readiness approval or user-value result. Real task benefit, voluntary return and payment remain separate observations.
