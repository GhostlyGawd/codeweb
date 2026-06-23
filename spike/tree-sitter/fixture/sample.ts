// Tiny TypeScript fixture for the tree-sitter spike.
//
// Each function records the human-counted EXACT cyclomatic complexity, using the SAME decision
// definition the regex F4 lib uses (1 + decisions; decisions = if/for/while/case/catch keywords
// + && || ?? + ternary). Holding the definition constant means any exact-vs-regex gap is a
// PRECISION gap (what the regex mis-reads), not a definitional one. The dispatch cases exercise
// `obj.method()` resolution the regex extractor deliberately drops.

interface Config {
  enabled: boolean;
}

export class Pipeline {
  // exact CX = 1 (no decisions). Calls two sibling methods via `this` — dispatch the regex drops.
  run(): void {
    this.validate();
    this.execute();
  }

  // exact CX = 3: `if` + `&&`. The optional param `cfg?:` is NOT a decision — but the regex counts
  // the lone `?` as a ternary (+1), a TS-specific over-count.
  validate(cfg?: Config): boolean {
    if (cfg && cfg.enabled) {
      return true;
    }
    return false;
  }

  // exact CX = 1. `.catch(...)` is a Promise method, NOT a try/catch — but the regex matches
  // `\bcatch\b` and over-counts it (+1).
  execute(): void {
    doWork().catch(onError);
  }
}

// exact CX = 3: `&&` + ternary, both INSIDE a template interpolation. The regex strips the whole
// template literal (including `${...}`) before counting, so it sees NO decisions and reports CX = 1
// — a 2-point under-count of real branching logic.
export function render(items: string[]): string {
  return `${items.map((x) => (x && x.length > 0 ? x : 'none')).join(',')}`;
}

// Dispatch via a typed parameter: the annotation `p: Pipeline` lets the AST resolve `p.run()` to
// Pipeline.run. The regex engine drops every `obj.method()`, so this edge does not exist today.
export function bootstrap(p: Pipeline): void {
  p.run();
}

declare function doWork(): Promise<void>;
declare function onError(e: unknown): void;
