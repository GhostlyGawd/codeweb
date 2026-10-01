# L123 single correction — 2026-09-28

Responds to all three requirements in L123-REVIEW.md. This is the one allowed correction, not expanded collection. Original uploaded artifacts and reviewer report remain intact. The revised corpus is frozen by the regenerated L123-VALIDATION.json.

- All 28 records checked for consequence, workaround, event date, host, segment, status and attribution. Consequences now carry the already-reported effects for 26 experience/investigation records. Two capability records retain unknown user consequences. Unknown dates and unsupported segments remain unknown; publication dates were not substituted for event dates. CW-T002 has its explicitly dated August 20 observation.
- CW-T019/021/023 encode author-reported resolution of the particular case; CW-T020/025/026 encode unclear current outcome with reported progress/workaround in prose. CW-T010 retains stock-version uncertainty. No universal reliability claim or maintainer resolution is inferred.
- CW-T014 keeps reporter-confirmed recovery and separate idle-session caveat; the schema-reserved maintainer resolution URL is null and the reporter anchor is in source_locator.
- CW-T001 identifies the two successful commenters and exact anchors independently verified in the review. Original reporter ytchenak remains unresolved. Conservatively count one retained group. CW-T011/013 remove other people’s narratives; CW-T012 excludes later-comment additions. No added incident counts.
- GitHub REST reopens were rate-limited. Existing reviewed narratives support the corrections; web opens recovered selected original bodies and visible Reddit passages but did not recover complete comments. Registry correction_check metadata records these limits. No full-read counts increased.
- Lead allocation is preserved: reuse CW-L022–025 for Synthesia, ecro, Checkly and Nick Perkins. HN 48406358 is one source; Synthesia and gbrindisi describe the same workflow. None is newly collected here. Parent owns global dedup and source-word budgets, including ecro’s small author-adjudicated sample and recall/precision tradeoff.

## Record-by-record check

| ID | Changed fields after semantic review |
| --- | --- |
| CW-T001 | reported_problem_or_success, consequence, workaround_or_alternative, source_locator, notes_and_limits |
| CW-T002 | event_at, consequence |
| CW-T003 | consequence |
| CW-T004 | consequence |
| CW-T005 | consequence |
| CW-T006 | consequence |
| CW-T007 | consequence |
| CW-T008 | consequence |
| CW-T009 | segment, segment_basis, consequence |
| CW-T010 | consequence, status_now, notes_and_limits |
| CW-T011 | reported_problem_or_success, consequence, workaround_or_alternative, source_locator, notes_and_limits |
| CW-T012 | host, reported_problem_or_success, consequence, source_locator, notes_and_limits |
| CW-T013 | reported_problem_or_success, consequence, source_locator, notes_and_limits |
| CW-T014 | segment, segment_basis, consequence, source_locator, resolution_source_url |
| CW-T015 | consequence |
| CW-T016 | consequence |
| CW-T017 | consequence, workaround_or_alternative, notes_and_limits |
| CW-T018 | consequence |
| CW-T019 | host, consequence, status_now, notes_and_limits |
| CW-T020 | consequence, status_now, notes_and_limits |
| CW-T021 | host, consequence, workaround_or_alternative, status_now, notes_and_limits |
| CW-T022 | host, segment_basis, consequence, workaround_or_alternative, notes_and_limits |
| CW-T023 | host, segment_basis, consequence, workaround_or_alternative, status_now, notes_and_limits |
| CW-T024 | consequence, workaround_or_alternative, notes_and_limits |
| CW-T025 | consequence, workaround_or_alternative, status_now, notes_and_limits |
| CW-T026 | consequence, workaround_or_alternative, status_now, notes_and_limits |
| CW-T027 | notes_and_limits |
| CW-T028 | notes_and_limits |
