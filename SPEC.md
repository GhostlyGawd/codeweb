# SPEC — codeweb (scaffold skeleton; brief 142 fills this file)

Date: 2026-07-26

This is the skeleton the scaffold leaves (141 · Scaffold the Rails). Brief
142 · Spec the Product replaces the placeholders with the ratified contract;
until then the single AC below keeps the gate honest: the repo's own suite,
inside the gate, from day zero.

## Job

(Brief 142 writes the ratified sentence. The charter's one-liner, ratified
2026-07-25: "Your agents break less code and burn fewer tokens.")

## Non-goals

- (Brief 142 imports the charter's non-goals — CHARTER.md is the source.)

## Acceptance criteria

Grammar (parsed by `scripts/spec_lint.py` — one line per AC):
`- **AC-n** — <criterion> | check: ` `` `<command>` `` ` | status: next|built|dropped`

- **AC-1** — the product suite passes from a bare checkout | check: `npm test` | status: next

## Interfaces

(Brief 142: the 27 MCP tools, the four bins, the gate Action — exact enough
to test against.)

## Evals

- floor: all cases pass (`python3 evals/run.py` exits non-zero on any
  failing golden case; it is gate step 5/5)

## Dependencies

- none at runtime — the product is zero-dependency (CHARTER.md invariant).
  `web-tree-sitter` is an optional AST tier (`optionalDependencies`); the
  no-AST CI leg proves the product works without it.
- Python 3 is dev tooling only (harness: spec lint, harness tests, evals) —
  ADR-0001 in DECISIONS.md records this; nothing Python ships.
- Adding a Python package requires an ADR in DECISIONS.md naming it;
  `scripts/spec_lint.py` enforces this via requirements.txt.

## Kill criteria

- (Brief 142: the measurable tripwires that mean stop building.)
