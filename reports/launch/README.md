# Launch drafts — v0.14.0

The posts that go out for the v0.14.0 launch, and the receipt behind every number in them.

Written 2026-09-02, against the released tag `v0.14.0` (`2e97e29`). The LAUNCH-KIT
(`reports/LAUNCH-KIT.md`) is the strategy; this directory is the executed copy.

| File | Channel | Status |
|---|---|---|
| `show-hn.md` | Show HN (news.ycombinator.com) | **Operator-owed** — submission requires an account; see §Operator actions |
| `github-release-discussion.md` | GitHub Discussions, Announcements | **POSTED** — https://github.com/GhostlyGawd/codeweb/discussions/89 |
| `receipts.md` | — | The claim→receipt table both drafts are bound to |

## The rule these drafts follow

Every number that appears in outward copy must equal a value in a **committed, mission-fresh**
artifact — regenerated during this mission window (post-2026-08-17), not carried over from a
pre-mission run. `receipts.md` is that table, and `tests/launch-drafts.test.mjs` enforces it: a
number in either draft that is not in the table, or a table value that no longer equals what the
artifact records, fails `sh scripts/check`.

This is stricter than "the number is true". A pre-mission receipt can be perfectly true and still
be barred here, because the launch is the moment the numbers get the most scrutiny and the least
context. Three figures the site legitimately publishes are therefore **absent from these drafts**:

- **126×** (blast-radius cost ratio) — `bench/results/oracle-ab.json` was last regenerated
  2026-07-19, before this mission. The LAUNCH-KIT already bars it unframed; the freshness rule
  bars it outright, framed or not.
- **0.44 → 0.74 / +0.31 recall** — `bench/experiments/efficiency-pilot.reps5-v090.json` is a
  v0.9.0 pilot (2026-07-21) on an engine five minor versions behind what shipped. It is honest,
  it is the replicated result, and it is still the right number for the site's comparison page,
  which frames it as a v0.9.0 pilot. In a launch post, stripped of that frame, it would read as
  a claim about v0.14.0. Left out.
- **32 / 33 pre-registered checks** — the "33" counts H7 (sharded-subgraph query equivalence),
  whose subject was deleted in July and which `bench/results/edit-safety.json` now records under
  `retiredHypotheses`. The mission-fresh receipts carry **32 checks, all 32 passing**. The drafts
  say that, and only that. (See "A note on 32/33" below — this is a live inconsistency in the
  published copy, not something these drafts introduced.)

## A note on 32/33 (pre-existing, flagged not fixed)

`site/content/research.html` and `bench/preregistration.md` say "33 pre-registered checks, 32
pass". Both predate this mission. Since then the instrument repair (`5bca205`) retired H7 with
the feature it measured, so the six fresh receipts enumerate 32 checks and all 32 pass. The
honest statement today is **32 of 32**, with H7 recorded as retired and H15 (the historical
"miss") now passing on the repaired harness.

Reconciling the research page and the pre-registration page is a copy change across two
claim-bearing surfaces with its own test surface, and it is not this feature's scope — the
drafts simply refuse to restate the stale framing. Recorded for the operator in
`OPERATOR-ACTIONS.md` §10.

## Operator actions

**Show HN submission** (~3 minutes). `show-hn.md` is submission-ready: the title is inside HN's
80-character limit, and the body is the first comment. Submitting needs an account —
https://news.ycombinator.com/submit returns "You have to be logged in to submit." No API,
no token route; HN's guidelines also expect the submitter to be a person, which is the same
reason `hesreallyhim/awesome-claude-code` is operator-owed in `reports/submissions/README.md`.

1. Sign in at https://news.ycombinator.com/login
2. https://news.ycombinator.com/submit
3. Title + URL from `show-hn.md`'s front matter, then post the body as the first comment.

**Timing note:** the LAUNCH-KIT's checklist asks for the release to be cut first. It is —
v0.14.0 is on npm, the GitHub release is published, the site is live at the new version, and the
gate is green at the released tag. Nothing blocks the post.
