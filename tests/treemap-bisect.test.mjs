// Regression for the treemap tiler in scripts/report-template.html.
// `bisect` is the slice-and-dice layout that powers the Treemap tab. It is inlined in the
// self-contained report (no module system in the browser), so — per this suite's "what ships is
// what's tested" rule — we extract the REAL function source from the template and exercise it.
//
// The bug it guards: the original split could leave EVERY item on one side (a dominant final item,
// or all-zero `value`s), so `bisect(a, ...)` recursed on the full array forever and a large graph
// blew the stack with "RangeError: Maximum call stack size exceeded" — the Treemap tab rendered one
// box and died on any real-world-sized codebase.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRIPTS } from './helpers.mjs';

// Pull the shipped `bisect` out of the template by brace-balancing from its declaration.
function extractFn(name, source) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, `template no longer defines function ${name}() — update this test`);
  const open = source.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { i++; break; }
  }
  const src = source.slice(start, i);
  // eslint-disable-next-line no-new-func — pure geometry helper, no closure/DOM deps.
  return { fn: new Function('return (' + src + ')')(), src };
}

const TEMPLATE = readFileSync(join(SCRIPTS, 'report-template.html'), 'utf8');
const { fn: bisect, src: BISECT_SRC } = extractFn('bisect', TEMPLATE);

const W = 800, H = 600, EPS = 1e-6;
const tile = (items) => { const out = []; bisect(items, 0, 0, W, H, out); return out; };
const items = (...vals) => vals.map((v, i) => ({ value: v, id: i }));

function assertInBounds(rects) {
  for (const r of rects) {
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(r[k]), `rect.${k} is finite`);
    assert.ok(r.w >= -EPS && r.h >= -EPS, 'non-negative size');
    assert.ok(r.x >= -EPS && r.y >= -EPS && r.x + r.w <= W + EPS && r.y + r.h <= H + EPS, 'within the parent box');
  }
}

test('the no-progress guard is present in the shipped template (cannot silently regress out)', () => {
  assert.match(BISECT_SRC, /Math\.min\(k \+ 1, items\.length - 1\)/, 'split must clamp so each side keeps >=1 item');
});

test('a dominant final item terminates instead of overflowing the stack', () => {
  // Pre-fix: nothing before the last item exceeds total/2, so the split returned a = all items.
  const rects = tile(items(1, 1, 1, 1, 1, 1, 1, 1, 1, 1000));
  assert.equal(rects.length, 10, 'one leaf rect per item');
  assertInBounds(rects);
});

test('all-zero values terminate and still fully tile (no NaN from /0)', () => {
  const rects = tile(items(0, 0, 0, 0, 0));
  assert.equal(rects.length, 5);
  assertInBounds(rects);
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - W * H) < 1e-3, 'zero-value items split by count, tiling stays exact');
});

test('large uniform input (the .live-scale case) terminates', () => {
  const rects = tile(items(...Array(500).fill(1)));
  assert.equal(rects.length, 500);
  assertInBounds(rects);
});

test('areas are proportional to value and tile the box exactly', () => {
  const rects = tile(items(50, 30, 15, 5));
  const total = 100, area = W * H;
  assert.equal(rects.length, 4);
  assertInBounds(rects);
  for (const r of rects) {
    const expected = (r.value / total) * area;
    assert.ok(Math.abs(r.w * r.h - expected) / expected < 1e-6, `rect area tracks value ${r.value}`);
  }
  const covered = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(covered - area) < 1e-3, 'leaves cover the whole box');
});

test('degenerate single and empty inputs are handled', () => {
  assert.equal(tile([]).length, 0, 'empty -> no rects');
  const one = tile(items(7));
  assert.equal(one.length, 1);
  assert.deepEqual([one[0].x, one[0].y, one[0].w, one[0].h], [0, 0, W, H], 'single item fills the box');
});
