// Package command dispatch. Explicit paths keep directories named after commands addressable.
import { resolve } from 'node:path';

const routes = { setup: './setup.mjs', doctor: './doctor.mjs', review: './review.mjs', gate: './ci-gate.mjs' };
const first = process.argv[2];
if (first === '--') {
  process.argv.splice(2, 1);
  if (process.argv[2]) process.argv[2] = resolve(process.argv[2]);
  await import('./run.mjs');
} else if (Object.hasOwn(routes, first)) {
  process.argv.splice(2, 1);
  await import(routes[first]);
} else {
  await import('./run.mjs');
}
