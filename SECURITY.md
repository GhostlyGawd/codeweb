# Security

codeweb is a local, read-only code-analysis tool. The security posture, in full:

**What it reads:** source files under the target you point it at, plus its own workspace
(`<target>/.codeweb/`). Optional configs it honors: `codeweb.rules.json`, an lcov file you pass
explicitly.

**What it writes:** only the workspace — `graph.json`, `report.html`, findings markdown, caches,
and sidecars, all under `.codeweb/`. It never modifies your source (`codemod --write` is an
explicit, separate CLI opt-in and is deliberately not exposed over MCP).

**What it never does:** execute target code · make network calls · send telemetry (the local
outcome ledger in `.codeweb/stats.json` is documented in-file as strictly local and never
transmitted) · require dependencies (it runs on an empty `node_modules`; one *optional* wasm
grammar sharpens extraction).

**Supply chain:** releases are published from CI with **npm provenance attestation** (SLSA) —
verify any install with `npm audit signatures`. The vendored tree-sitter grammars are pinned with
provenance notes in `scripts/grammars/PROVENANCE.md`.

**Reporting:** open a GitHub issue for non-sensitive reports, or email the maintainer
(address in `package.json`) for anything you'd rather not post publicly. No bounty program;
reports are triaged with priority.
