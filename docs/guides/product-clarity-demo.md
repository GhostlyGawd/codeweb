# Reproduce a code-change review

This walkthrough uses a synthetic fixture. It is not a maintainer-approved case study and does not measure agent edit quality. The example introduces a dependency cycle across source files, then shows the affected caller and the gate result.

## Run the example

Use a checkout of this CodeWeb change with Node 22 or later and Git available. This reproduction script is development tooling; it is not part of the installed package interface. Run from the CodeWeb repository root and choose a new output directory:

```sh
node scripts/product-demo.mjs --out /tmp/codeweb-change-demo
```

Use another new path for each run. The script creates a local fixture repository, builds before and after graphs, checks caller evidence, creates a review page, and checks blocking and report-only gate behavior. It does not execute the fixture source. It does not call a model or send the fixture to a service.

Open `receipt.json` in the output directory. The receipt records these fields:

| Field | Expected evidence |
|---|---|
| `schemaVersion` | `1` |
| `productVersion` | The engine version used for this run. |
| `fixture` | `cross-file-cycle`; a controlled example. |
| `beforeGraph`, `afterGraph`, `reviewHtml` | Artifact paths relative to the output directory. |
| `changedFile` | `feature.js` |
| `expectedCaller` | `app.js:run` |
| `gate.blockingExitCode` | `1`: the new structural regression blocks. |
| `gate.reportOnlyExitCode` | `0`: the same finding is reported without blocking. |
| `gate.verdict` | `regression`: report-only did not erase the finding. |
| `verified` | `true` only after the script's assertions pass. |

Open the file named by `reviewHtml` in a browser. Inspect the changed file, its caller in another file, the cycle finding, and analysis limits. Preserve the receipt and the CodeWeb checkout commit with any shared recording. A failed script is a failed demonstration; do not use an older receipt to claim the new run passed.

For your own repository, follow [package setup](../cli.md), use `codeweb setup` and `codeweb doctor`, and check each command's help for client and graph options. Use `codeweb review` for the supporting change report and `codeweb gate` for the base-versus-working-tree gate. The fixture script above is separate from this installed-package workflow.

## 60-second recording script

| Time | Screen and explanation |
|---|---|
| 0–10 seconds | Show `feature.js` and its change. Say: “This example changes one file. Another file calls this code.” |
| 10–25 seconds | Show `app.js:run` in the caller evidence and open its source location. Say: “Inspect this caller before you finish the edit.” |
| 25–40 seconds | Show the new cycle in the review. Say: “The structural gate found a new dependency cycle.” |
| 40–50 seconds | Show the two gate exit codes and the retained regression verdict. Say: “Report-only lets you assess findings before you use blocking checks.” |
| 50–60 seconds | Show analysis limits and the receipt. Say: “This is a synthetic example. A structural pass does not prove that the program works correctly.” |

Run the commands before recording. Show their actual output. If any expected evidence is absent, stop and investigate. The timing is a recording outline, not a measured setup time. Use the [case-study template](product-clarity-case-study.md) for future work with a real maintainer decision.
