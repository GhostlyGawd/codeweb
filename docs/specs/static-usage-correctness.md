# Static usage correctness

Work: P-05. Baseline: `95bf6178f1c3979d3ed169329002daa9a41fb73d`.
The supplied React and Python totals are user-reported; their repositories are unavailable for independent reproduction.

## Required behavior

- Record JSX component use through same-file declarations and supported import bindings, including aliases and namespace members.
- Record known function values in Python keyword arguments, assignment/containers and JS/TS event properties as references rather than direct calls.
- Include reference dependents in transitive impact and keep count-only, risk and editor calculations consistent.
- Preserve direct-call query semantics and expose known reference users when a function has zero direct callers.
- Report unresolved supported usage and genuine ambiguous call candidates through bounded, cached completeness diagnostics.
- Keep JSX component orphans, incomplete maps and detected dynamic dispatch out of the lower-review cleanup tier.
- Preserve zero required dependencies, deterministic output, original baselines, optional parser behavior and the protected harness.

## Verification

Generic fixtures must reproduce the failures before implementation. Cover same-file/imported/member JSX, callback references, shadowed names, comments/strings, type syntax, cold/warm/full caches, CLI/MCP and negative controls.
Run the complete existing gate after focused checks.

## Repository organization

Retain original dirty work and immutable research. Integrate reviewed source and sanitized product plans into an identifiable clean candidate, with current-contract and historical-evidence entry points.
Personal setup, raw correspondence and client source stay outside public publication.

## Scope limits

References establish mapped use, not an actual runtime invocation. Computed dispatch, component factories and unresolved runtime bindings remain bounded analysis.
The shipped apply command currently executes ready-tier merges; campaign deletion proposals are separate advisory output.
