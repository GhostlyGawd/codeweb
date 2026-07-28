# Security

codeweb is a local, read-only code-analysis tool.

## Data access

codeweb reads source files under the selected target and files in `<target>/.codeweb/`. It also
reads `codeweb.rules.json` and an lcov file when you supply them.

codeweb writes `graph.json`, `report.html`, findings Markdown, caches, and sidecars under
`<target>/.codeweb/`. It does not modify source files. `codemod --write` is a separate,
explicit CLI option and is not available through MCP.

codeweb does not:

- execute target code
- make network requests
- send telemetry
- require dependencies

The local activity ledger remains in `.codeweb/stats.json` and is never transmitted. Set
`CODEWEB_NO_STATS=1` to disable the ledger. codeweb runs with an empty `node_modules` directory.
The optional wasm grammar improves extraction.

## Supply chain

CI publishes releases with **npm provenance attestation** (SLSA). Run `npm audit signatures` to
verify an installation. The repository pins each vendored tree-sitter grammar and records its
provenance in `scripts/grammars/PROVENANCE.md`.

## Report a security issue

Open a GitHub issue for a non-sensitive report. For sensitive information, use the maintainer
email address in `package.json`. The project does not have a bounty program. The maintainer gives
security reports priority.
