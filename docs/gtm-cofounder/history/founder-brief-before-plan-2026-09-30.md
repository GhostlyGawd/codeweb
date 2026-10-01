# Codeweb founder brief

Initial brief from repository evidence and founder input, 2026-09-14. Product and audience follow the existing charter; unconfirmed commercial assumptions remain labeled.

## Strongest asset

[assumption] The strongest asset visible in this checkout is the working local product together with reproducible benchmark receipts. The founder may have a stronger asset in direct user feedback or repeat usage; that has not been established in this intake.

[validated: repository evidence] The [launch receipt ledger](../../reports/launch/receipts.md) links specific measurements to committed artifacts and distinguishes historical benchmarks from launch claims. These measurements support bounded technical claims, not customer demand or a guarantee that agents produce better edits.

## Core five

1. **What does it do?**
   [validated: documented product] Codeweb maps relationships in a repository so your coding agents can inspect callers before editing and check supported structural regressions afterward. Current founder-selected wording: “Your agents break less code and burn fewer tokens.” Sources: [charter](../../CHARTER.md), [README](../../README.md).

2. **Who exactly is it for?**
   [validated: founder-ratified direction] The agent-heavy individual developer working in their own repository, including gating their own pull requests. Team leads are the secondary audience for the planned hosted Teams service. Source: [charter](../../CHARTER.md).
   [assumption] The company size, technical context, and user segment with the strongest repeated demand remain unconfirmed. Ratified targeting is not evidence of adoption.

3. **What do they use instead, and why choose this?**
   [validated: documented comparison] Current materials compare text search, one-hop symbol lookup, and a whole-graph artifact. Codeweb offers bounded structural answers and a local deterministic gate. Source: [README](../../README.md).
   [assumption] Actual users' previous workflows and reasons for switching need direct confirmation. Historical benchmark outcomes do not establish those reasons.

4. **Stage and traction: how many users, and do they come back?**
   [validated: repository evidence] The package manifest is at 0.15.0; the GitHub release PR #94 was open when inspected on 2026-09-14. This identifies checkout and PR state, not npm release availability. Sources: [manifest](../../package.json), [release PR](https://github.com/GhostlyGawd/codeweb/pull/94).
   [validated: documented limit] Package downloads count retrievals, not users. The local product has no telemetry. Sources: [README](../../README.md), [charter](../../CHARTER.md).
   [validated: founder statement, 2026-09-14] Asked about real users who tried Codeweb and returned, the founder said: “i dont know anything about them”. User identity and repeat usage are unknown to the founder. This does not establish zero users or zero retention.
   [unknown] Interview history, revenue, and hosted availability are not established by this bounded intake.

5. **Single strongest asset?**
   [assumption] Working product plus inspectable evidence, as described above. Pending founder confirmation or a stronger demand signal.

## Established constraints

- [validated: founder-ratified direction] Anything running on one laptop against one repo stays free. Hosting, multi-repo aggregation, and human attention define the paid boundary.
- [validated: founder-ratified direction] Teams development was authorized in the August charter amendment. Do not restore the superseded distribution threshold.
- [validated: founder-ratified direction] Preserve the selected positioning and brand. Any proposed changes must respect the charter and evidence limits.
- [validated: documented limits] A green gate does not establish behavioral correctness or complete dependency coverage. Skipped checks are not passes.

Source: [charter](../../CHARTER.md) and [gate documentation](../ci-gate.md).

## Intake evidence and handoff

[validated: public statements, not product outcomes] The [2026-09-15 customer-voice study](research-2026-09-15/README.md) retained 25 distinct accounts across 13 public conversations, including four counterexamples. Counts describe selected evidence, not market prevalence. The strongest direct job match is checking callers and affected relationships during agent-driven changes.

[assumption] Three provisional workflow-defined ICPs are maintainers checking cross-file changes, developers paying repeatedly for code discovery, and developers reviewing team-generated changes. Company sizes, buyer authority, Codeweb adoption, and willingness to pay remain unvalidated. The study preserves the charter's primary individual-developer audience.

[validated: public self-report, inspected 2026-09-14] Felipe Truman (`felipetruman`) reports installing Codeweb 0.13.0 with Claude Code on Linux, patching hook configuration locally, and verifying a fresh session. This identifies one person reporting hands-on use; continued use, value received, and willingness to pay remain unknown. Source: [issue #92](https://github.com/GhostlyGawd/codeweb/issues/92).

The bounded scan covered the README, documentation index, manifest, charter, launch receipts, the latest 15 commit subjects, eight recent PR titles, and two open issue titles. Issue titles provide insufficient evidence to infer a recurring customer problem.

The founder's answer establishes a customer-knowledge gap. It does not establish that distribution, activation, or retention is failing.

See the [proposed roadmap](gtm-roadmap.md). This GTM experiment preserves the charter's product direction; the strongest commercial asset and actual switching reasons still need validation.
