# codeweb CodeLens

`76 callers · blast 242` above every mapped function, class, and method — served straight
from the repo's `.codeweb/graph.json`, the same graph every codeweb tool answers from.
Click a lens to open the symbol in the interactive `report.html` (`#s=<id>` deep link).

- **callers** = direct reverse `call` edges (what `codeweb_callers` returns)
- **blast** = the `codeweb_impact` closure: transitive callers + subclasses

Zero dependencies, no build step, read-only. If the numbers look stale, refresh the map
(`codeweb_refresh` or re-run the pipeline) — the lens re-reads the graph on change.

## Requirements

A mapped repo: `.codeweb/graph.json` anywhere at/above the files you edit
(build one with `/codeweb`, `codeweb_map`, or `node scripts/run.mjs <target> --out-dir <target>/.codeweb`).

## Install

Dev (fastest): open this folder in VS Code and press **F5** (Run Extension).

Packaged:

```sh
cd editor/vscode-codeweb
npx --yes @vscode/vsce package        # -> codeweb-lens-0.1.0.vsix
code --install-extension codeweb-lens-0.1.0.vsix
```

## Settings

| setting | default | effect |
| --- | --- | --- |
| `codeweb.lens.enabled` | `true` | master switch |
| `codeweb.lens.minCallers` | `0` | hide lenses below this caller count |
