# Spec G: caller-reliance contracts v2 — throws, mutation, nullability

## Problem
The reliance contract (`lib/reliance.mjs`) covers the most common breaking edit (return-shape +
argument counts) but says nothing about three other contract classes agents break: exceptions
callers already handle, parameter objects the callee mutates, and results callers null-check.

## Behavior (testable contract)
All three follow the standing conservatism rule: **only call-site-line (or body-line) patterns
count; no evidence → no claim; confident answers stay caveat-free.**

1. **Exception reliance (call sites):** a caller line (±1 line window) matching
   `try {`-enclosed call, `.catch(`, or `await ... .catch` marks `handlesErrors`. Card line:
   `N caller(s) wrap this in try/catch — thrown types are contract`.
2. **Mutation hazard (callee body):** body lines matching `param.prop = `, `param[...] = `,
   `Object.assign(param`, `param.push(`/`splice(` for a named parameter mark
   `mutatesParams: [name]`. Card line: `mutates its argument "opts" — callers share that
   object`.
3. **Nullability reliance (call sites):** result-consuming patterns `if (!x)` / `x == null` /
   `x?.` / `?? ` on the assigned result within the window mark `nullChecked`. Card line:
   `M caller(s) null-check the result — keep null/undefined returns possible`.
4. **Budget:** the explain card gains at most 3 new lines, each only when its evidence count
   > 0; the pre-edit hook embeds the same summary unchanged.

## Tests (TDD — extends tests/reliance.test.mjs)
Per pattern: a fixture where the evidence exists → the field + card line appear with the right
counts; a control fixture (plain call, no try/catch/null-check/mutation) → field absent and
card line absent; a mixed fixture → counts exact. Plus: determinism, and a property test that
adding an unrelated caller never changes existing claims.

## Done when
Tests pass; suite green; explain card + pre-edit hook show the new lines on a real fixture;
budgets hold (card ≤ its current byte budget + 3 lines).
