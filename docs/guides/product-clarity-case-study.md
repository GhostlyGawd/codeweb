# CodeWeb case-study template

Status: template; no completed study. Replace fields only with recorded evidence. A generated example is not a maintainer decision.

| Evidence | Value |
|---|---|
| Study date and author | [not recorded] |
| Repository URL and source commit before the change | [not recorded] |
| Source commit after the change, or saved patch hash | [not recorded] |
| CodeWeb engine version and engine commit | [not recorded] |
| Runtime, operating system, extraction options | [not recorded] |
| Exact reproduction commands | [not recorded] |
| Finding ID, rule, source location, affected callers | [not recorded] |
| Confidence, action priority, effort, and limitations | [not recorded] |
| Maintainer decision: accept, reject, or defer | [not recorded] |
| Maintainer reason and decision date | [not recorded] |
| Independent test command and result | [not recorded] |
| Change actually made and observed result | [not recorded] |
| Remaining uncertainty and follow-up | [not recorded] |
| Publication permission for source, name, and quotes | [not recorded] |

Explain the original task first. Show the affected caller outside the changed file, the new finding, and the maintainer's decision. Include the reason to leave code unchanged when the expected benefit is small or new coupling would be harmful.

Keep the original output, patch, and independent test result beside the commands. Distinguish a CodeWeb structural verdict from evidence that the application still works. Do not treat a suppressed finding as a fixed defect. Do not treat an unrun test as a pass.

Publish only after checking the reproduction and publication permission. If a maintainer has not reviewed the change, label the document a technical example and leave the decision fields unfilled. Use the [pilot procedure](product-clarity-pilot.md) to collect decisions with consent.
