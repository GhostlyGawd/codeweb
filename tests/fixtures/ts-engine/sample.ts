// Fixture for the --engine tree-sitter integration test. Annotated EXACT cyclomatic values are what
// the tree-sitter engine must produce through the extractor; the regex F4 diverges on the marked ones.
//
// Methods omit return-type annotations on purpose: the --no-ctags regex SCANNER (which the suite uses
// for host-independence) doesn't detect `method(): T {` — a separate, pre-existing scanner gap, not a
// complexity concern. The divergence triggers (optional param, .catch, template logic) are preserved.

export class Pipeline {
  run() {                  // exact 1
    this.validate();
    this.execute();
  }

  validate(cfg?: Config) {            // exact 3 (if + &&); regex 4 (counts the cfg?: `?` as a ternary)
    if (cfg && cfg.enabled) {
      return true;
    }
    return false;
  }

  execute() {              // exact 1; regex 2 (counts `.catch` as \bcatch\b)
    doWork().catch(onError);
  }
}

export function render(items: string[]) {   // exact 3 (&& + ternary in the template); regex 1
  return `${items.map((x) => (x && x.length > 0 ? x : 'none')).join(',')}`;
}

interface Config { enabled: boolean; }
declare function doWork(): Promise<void>;
declare function onError(e: unknown): void;
