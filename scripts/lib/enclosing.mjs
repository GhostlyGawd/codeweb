// Round 2, finding #21 — the per-file range-containment indexes that replace two quadratic scans
// in the extractor (kept as a cohesive lib so WS-H's #40 can move the derivation whole):
//   - deriveFileEdges' `enclosing(lineNo)` linearly scanned ALL ranges per call-site match
//     (O(sites x ranges) — 1,446 ms on one 8,000-fn file vs ~579 ms for the same code split
//     across files; addEdge 50.8 % self in the profile). buildInnermostIndex precomputes the
//     answer for every line in one O(lines + R log R) sweep; lookup is O(1).
//   - the method-owner scan in the node-build loop re-scanned ranges-so-far per method for the
//     innermost enclosing CLASS. createOwnerStack keeps a live open-class stack across the
//     line-sorted loop — O(syms) total.
// Both are BEHAVIOR-IDENTICAL to the linear reference scans (including their first-in-array-order
// tie-break on duplicate starts) — pinned by the property suite in tests/enclosing-index.test.mjs,
// which embeds the old loops verbatim as oracles.

/**
 * Innermost enclosing range per line. Returns a 1-indexed array of length lineCount+1:
 * index l holds the range covering line l with the LARGEST start (ties: first in the original
 * `ranges` order — the linear scan's `rg.start > best.start` strict-compare semantics), or
 * undefined when no range covers l.
 *
 * Sweep: sort a COPY by (start asc, original index DESC) — `ranges` order is cached/emitted
 * elsewhere and must not move — then walk l = 1..lineCount with a stack: push ranges as their
 * start arrives, lazily pop while top.end < l (a popped range can never cover a later line),
 * then innermost[l] = top. The stack stays start-ascending, so top = max start among still-open
 * ranges; the desc-index order within an equal-start group puts the FIRST-in-original-order
 * range nearest the top, so ties resolve exactly like the linear scan. An ended BURIED range
 * surfaces when everything above it pops and is discarded by the same lazy pop. Degenerate
 * ranges (end < start) push and pop immediately — covering nothing, as in the reference.
 */
export function buildInnermostIndex(ranges, lineCount) {
  const innermost = new Array(lineCount + 1);
  if (!ranges.length || lineCount <= 0) return innermost;
  const sorted = ranges.map((rg, idx) => ({ rg, idx }))
    .sort((a, b) => a.rg.start - b.rg.start || b.idx - a.idx);
  const stack = [];
  let p = 0;
  for (let l = 1; l <= lineCount; l++) {
    while (p < sorted.length && sorted[p].rg.start <= l) stack.push(sorted[p++].rg);
    while (stack.length && stack[stack.length - 1].end < l) stack.pop();
    if (stack.length) innermost[l] = stack[stack.length - 1];
  }
  return innermost;
}

/**
 * Live open-class stack for the node-build loop's method-owner attribution. Contract mirrors the
 * hoisted scan exactly: push(rg) every time a CLASS range lands in `ranges` (the loop is
 * line-sorted, so pushes arrive start-ascending); ownerOf(line) returns the innermost class with
 * `line > rg.start && line <= rg.end` — strict on the start, so a class starting on the method's
 * own line never owns it — with the reference's first-in-arrival-order tie-break on equal starts.
 * ownerOf is amortized O(1): the lazy pop is monotone (lines only grow), and the top-down probe
 * walks past at most the buried already-ended ranges above the answer.
 */
export function createOwnerStack() {
  const stack = [];
  return {
    push(rg) { stack.push(rg); },
    ownerOf(line) {
      while (stack.length && stack[stack.length - 1].end < line) stack.pop();
      for (let k = stack.length - 1; k >= 0; k--) {
        const e = stack[k];
        if (e.start >= line || e.end < line) continue; // same-line start never owns; buried ended range
        let best = e;
        // equal-start group is contiguous (pushes arrive start-ascending): the reference linear
        // scan keeps the FIRST qualifying range in arrival order, which sits deepest.
        for (let q = k - 1; q >= 0 && stack[q].start === e.start; q--) {
          if (stack[q].end >= line) best = stack[q];
        }
        return best;
      }
      return null;
    },
  };
}
