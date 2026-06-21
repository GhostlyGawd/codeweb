# Overlap detection heuristics

The overlap graph is the payoff of codeweb: it shows where the system does the **same work in
more than one place**, so it can be restructured into well-defined, non-duplicative systems.

## The four overlap kinds

| Kind | Signal | Example |
|---|---|---|
| `duplicate-logic` | The same algorithm/validation/transform appears in 2+ symbols with near-identical bodies or behaviour. | Three modules each parse the same date format by hand. |
| `parallel-impl` | Two or more competing implementations of one capability, often with diverging behaviour. | A `fetch` wrapper and an `axios` wrapper both used for API calls. |
| `shared-responsibility` | One concern is smeared across many domains with no single owner. | Retry/backoff logic copy-pasted into every network call site. |
| `tangled-domain` | A single symbol mixes responsibilities from multiple domains and should be split. | `saveOrder()` that also sends email, writes audit logs, and charges a card. |

## How to find them

1. **Name + signature clustering.** Group symbols whose names/params suggest the same job
   (`validateUser`, `checkUser`, `assertUser`). Read the bodies to confirm they overlap.
2. **Edge-pattern clustering.** Symbols in different domains that call the same downstream set,
   or that are called from the same set of callers, are candidates for consolidation.
3. **Structural similarity.** Similar control flow / similar literal sets (regexes, status
   codes, field names) across symbols signals copy-paste drift.
4. **Cross-domain fan-in.** A utility imported by many domains may be fine (good reuse) — but a
   *behaviour* re-implemented in many domains is overlap. Distinguish "one shared function used
   widely" (healthy) from "the same idea coded N times" (overlap).

## Severity rubric

Score each overlap on three axes, then take the max-weighted band:

- **Duplication count** — 2 places = low, 3–4 = medium, 5+ = high.
- **Blast radius** — how many domains / how much traffic flows through the duplicated path.
  Touches 1 domain = low, 2 = medium, 3+ or a core path = high.
- **Divergence risk** — have the copies already drifted (different edge cases, different bug
  fixes)? Drift present = bump one band; security/correctness-sensitive logic = high.

`high` = block-worthy simplification target. `medium` = worth a refactor ticket. `low` = note.

## Writing the recommendation

Always name the **single well-defined system** the pieces should collapse into, and who should
depend on it. Good: *"Extract `auth.validateUser` as the one validator; billing and api import
it; delete the local copies."* Bad: *"Reduce duplication."* The recommendation is the bridge
from diagnosis to a concrete restructure.

## What is NOT overlap

- Genuinely independent logic that merely looks similar (different domains, different invariants).
- Intentional layering (an interface + one implementation).
- Test doubles / fixtures mirroring production shapes.
Flagging these erodes trust in the report — when unsure, mark `low` with explicit evidence
rather than inflating severity.
