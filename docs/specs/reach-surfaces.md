# Spec J: reach — report→editor links, npm publishability, VS Code packaging

## Problem
The report is where humans decide to act, but the last link (report → editor) is missing;
the npm package is `private: true` so only Claude-plugin and git-clone users can install; the
VS Code extension has no distributable artifact. Reach items — the engine is done, the
packaging isn't.

## Behavior (testable contract)
1. **Open in editor.** The report inspector's detail panel shows an `Open in editor` link for
   the selected node: `vscode://file/<meta.root>/<file>:<line>` (falls back to a copyable
   relative `file:line` when `meta.root` is absent). Deep-link (`#s=<id>`) selections get the
   same link.
2. **npm publishability (prep, publish gated).** `package.json`: `private` removed, `bin`
   entry (`codeweb` → `scripts/run.mjs` with a shebang + arg passthrough), `files` whitelist
   (scripts, hooks, skills, agents, commands, plugin manifest — no bench/, no site/, no docs/),
   `publishConfig.access public`. The release workflow gains an `npm publish --provenance`
   step that runs **only when `NPM_TOKEN` is configured** and is a no-op otherwise (the actual
   first publish is the maintainer's token away — prep is this spec's deliverable).
3. **VS Code artifact.** The release workflow packages `editor/vscode-codeweb` with
   `@vscode/vsce package` (dev-time tool, not a runtime dep) and attaches the `.vsix` to the
   GitHub Release; marketplace publish likewise exists but gates on `VSCE_PAT`.
4. **Zero-dependency stance intact:** runtime `dependencies` stay empty; vsce runs only in CI.

## Tests (BDD — tests/report-editor-link.test.mjs + tests/package-shape.test.mjs)
- **E1 given** a built report for a fixture **when** a node is selected (template function
  unit-level) **then** the inspector HTML contains the `vscode://file/` link with the node's
  absolute path + line.
- **E2 given** a graph without `meta.root` **then** the link degrades to the copyable form.
- **P1** package.json: not private, bin points at an existing executable file with a shebang,
  every `files` entry exists, no runtime deps.
- **P2** `npm pack --dry-run` (offline) succeeds and the tarball file list contains the engine
  + plugin surfaces and excludes bench/site/docs.

## Done when
Tests pass; suite green; a locally produced `.vsix` and `npm pack` tarball verified in the PR;
release workflow carries both gated publish steps.
