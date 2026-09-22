# Evidence reconciliation — implementation specification

Status: **implemented locally; unreleased**. Version 1, 2026-09-15 UTC.
Integration base: `2fb533f38ec9d69ecf4ab4a82d1dbe17983983aa` (`main`, 2026-09-22). Original specification was drafted against `e3a09756a13634a858e04d0a0e4957833048a694`.
Authority: [CHARTER](../../CHARTER.md), [controlling product SPEC](../../SPEC.md).
Integration verification: [evidence reconciliation integration](../../reports/evidence-reconciliation-integration/README.md).

## 1. Job and release boundary

An agent shall be able to ask: **“Which mapped evidence changed since the answer I used for this edit?”** The product shall preserve the specific query, complete mapped relationship sets and detected unanswered questions behind that answer, then reconcile them with a newly verified source snapshot.

V1 adds explicit evidence capture to `codeweb_context` and an explicit receipt argument to `codeweb_review`. No new MCP tool or package binary is added. The CLI equivalents are the existing `scripts/context-pack.mjs` and `scripts/review.mjs` commands. Both transports shall share core code.

V1 supports one unambiguously resolved target symbol per receipt and the existing context relation classes: direct callers, direct callees and transitive impact. Exact multi-symbol boundary cuts, HTTP route extraction, new gap detectors, learned ranking, contract compatibility, automatic hook correlation, UI redesign, remote exchange and source mutation are **out of scope**. These remain potential follow-ups, not implicit acceptance criteria.

The differentiator is answer-specific evidence delta and task-owned question continuity. Small context packs, content freshness, directory stamps, preserved graph baselines, hooks and pending-card statistics already exist; this feature shall reuse them where applicable. It shall not equate source inspected, graph fresh, no counterexample, no regression, or receipt intact with behavioral correctness.

## 2. Invariants

ER-01: Analysis shall remain local and deterministic for identical inputs/options. No runtime LLM, target-code execution, telemetry, account, network request or new required dependency is introduced. Local artifacts are free single-repo functionality.

ER-02: Calls without new evidence arguments shall retain existing payloads, error semantics, exit codes, graph side effects and gate behavior. Existing review is a call-caller preflight; it shall not be relabeled as the CI gate.

ER-03: Evidence state shall not override `verdict`, existing `analysis.checks`, or skipped-check labels. An evidence transport/storage/validation failure shall not produce a new structural regression or suppress an existing one.

ER-04: Receipt contents establish recorded analyzer observations. A SHA-256 digest identifies contents; it is neither authentication nor proof that extraction or a statement is correct. The local workspace is trusted in the same sense as current graph artifacts. Malformed artifacts shall still be validated as data and never executed.

## 3. API and CLI contract

The names below are the implemented V1 arguments. Unknown arguments continue to be rejected via the shared tool manifest/schema.

| Operation | MCP arguments | CLI equivalent |
|---|---|---|
| Capture before editing | `codeweb_context {symbol, graph?, captureEvidence:true, task}` | `node scripts/context-pack.mjs <graph> <symbol> --capture-evidence --task <task> --json` |
| Reconcile after editing | `codeweb_review {changed, graph?, before?, gate?, evidenceReceipt, task}` | `node scripts/review.mjs <graph> --changed <files> --receipt <id> --task <task> [--before <graph>] [--gate] --json` |
| Read immutable evidence page | `codeweb_context {symbol, graph?, evidenceReceipt, task, evidenceResult?, evidenceSection, evidenceOffset?}` | `node scripts/context-pack.mjs <graph> <symbol> --receipt <id> --task <task> [--result <id>] --section <name> [--offset <n>] --json` |

Capture and page arguments are mutually exclusive. `task` is required with either evidence mode and on review with a receipt; otherwise `task` is rejected. `evidenceResult` requires a receipt and section. `evidenceOffset` is a nonnegative integer, default 0, and requires a section. `captureEvidence` accepts only true when present. `full`, `bodies`, `window`, and `limit` are rejected in evidence capture/page mode; callers may use an ordinary context request independently. Review receipt mode requires `changed` and rejects CLI `--range`; ordinary review retains its current CLI range behavior. No existing argument behavior changes outside evidence mode.

`task` shall match `[A-Za-z0-9_-]{1,64}`. Receipt/result IDs shall be lowercase 64-character SHA-256 hex values; they are never filesystem paths. All graph discovery rules remain current rules. Page mode's `symbol` must equal the capture selector or resolved target ID; page reads never resolve it against current source. This retains the existing required MCP symbol argument without retargeting a historical record.

Capture shall reject a selector matching zero targets (`target-not-found`) or multiple targets (`ambiguous-target`, bounded suggestions). It shall not choose the first result. Target IDs, labels and source paths shall be compared literally, not executed or interpreted as patterns.

### Responses and exits

Capture/page return an evidence-mode envelope instead of the ordinary context shape, explicitly tagged `mode:"evidence"`. No source bodies are embedded; bounded source locations allow deliberate follow-up reads. Capture envelope: `mode`, `schemaVersion`, `state`, `task`, `receiptId`, `baseline`, `target`, `sections`, `limitations`, `nextSteps`. A successful capture state is `captured`, never `safe` or `passed`. Page response additionally contains `section`, `offset`, `items`, `total`, `remaining`, `nextOffset` and whether the page is historical (`true`).

Review retains its normal payload and adds `evidence` containing `state`, `receiptId`, `resultId` when stored, `task`, `baseline`, `current`, relation totals/delta counts, question counts, limitations and next actions. The **new evidence field** shall be at most 8,192 UTF-8 bytes; this does not retroactively claim the existing entire review payload is byte-bounded. Capture/page entire envelopes have the same 8,192-byte bound. No full-body escape exists for these envelopes.

CLI capture/page: exit 0 for successful recorded evidence (including explicit known limitations); exit 2 for invalid arguments or unavailable/invalid evidence; a capture target-not-found retains context's existing exit 1 with its structured evidence error. MCP capture/page use corresponding existing tool error conventions; not-found remains a found:false result, not fabricated success. Review first computes the legacy review result and code. Invalid evidence argument syntax fails validation before analysis (exit 2 / tool argument error). For a syntactically valid request whose receipt cannot be reconciled, emit the normal review plus `evidence.state:"unavailable"` or `"inconclusive"` and preserve the legacy review exit code/MCP error status. **Consumers must read evidence.state separately from process exit and verdict.ok.**

Text CLI shall render the same states/counts/next actions on stdout; `--json` selects machine-only stdout. Runtime diagnostics go to stderr. MCP/CLI JSON shall be equal after normalizing existing transport-only wrapper fields; the shared evidence object shall be byte-identical for identical artifact/query inputs.

## 4. Storage, identity and limits

ER-05: Files shall live only under `<graph-directory>/evidence/v1/receipts/<receiptId>.json` and `.../results/<resultId>.json`. The root target realpath is part of capture identity; moving the workspace requires recapture. No global last-receipt file, implicit session association, remote upload, clock-based expiry or destructive automatic cleanup.

Receipts are immutable content-addressed records. `receiptId = sha256(canonicalJSON(receiptPayload))`; the ID is not inside the hashed payload. Canonical JSON recursively sorts object keys, sorts explicitly set-valued arrays, preserves ordered arrays, uses UTF-8 and JSON number/string representation, and excludes wall clock, mtime, absolute invocation CWD and display-only text. `sourceRootRealpath` remains intentionally included as workspace identity. Result IDs use the same rule with the parent receipt ID and current identity in the payload.

A receipt payload shall contain:

- `schemaVersion:1`, `task`, `sourceRootRealpath`, canonical graph-relative workspace identity.
- `query`: original selector, resolved target ID, relation semantics version, extractor identity/options and relation edge-kind definitions.
- `baseline`: immutable source-inventory digest, normalized graph digest, engine/analyzer identity, effective scope/options digest. Git commit, if available without requiring Git, is informational; dirty working-tree content is authoritative.
- `target`: exact ID, label, file, kind, source span and source-content digest.
- `relations`: **complete**, sorted, deduplicated sets for direct caller IDs, direct callee IDs and transitive impact IDs, plus each relation's evidence record, deterministic supporting path and source locations. Both full sets and query identity are required; a digest or first page alone is insufficient.
- `questions`: complete bounded detected-question records from section 7.
- `analysis`: snapshot of source availability, extractor provenance, known incompleteness and unsupported-edge limitations. Capture format shall preserve all existing limitation categories even if new ones are unknown to the reader.

Relationship identity is the SHA-256 of `(relation class, target ID, related symbol ID)` serialized as each UTF-8 string prefixed by its unsigned 32-bit big-endian byte length, in that order; reject an element exceeding that length representation. This is not delimiter-joined text. Relation evidence digest binds IDs, edge kinds where available, symbol spans and hashes of the supporting source files. V1 has file-level evidence freshness: an unrelated edit in a supporting file can mark the witness changed. It shall not claim a specific call site changed without such evidence.

Record cap: 2 MiB encoded UTF-8 per receipt/result. Store cap: 32 MiB total regular JSON record bytes beneath evidence/v1 per workspace. If complete evidence cannot fit, return `record-too-large` with counts and “narrow target / use ordinary context”; never store a receipt claiming a complete set after truncation. If the store limit is reached, return `store-full` and the local directory to clear deliberately. Identical records are reused without counting them twice. New record write uses temp-file + atomic rename, owner-only permission where supported, and immutable create semantics; concurrent writers use one bounded local lock (1 second maximum wait) around cap accounting and publication. Lock failure returns `store-busy`, not a partial record. Stale-lock recovery is explicit user file cleanup, not guessed PID ownership. Temporary files are cleaned in finally; unreadable/corrupt records count toward store byte cap.

Artifact readers reject symlink record files, symlinked evidence storage directories, paths escaping the graph directory, invalid schema, oversized input, mismatched ID/content digest or task/workspace identity. Returned paths are data. Result reads shall additionally require `result.parentReceiptId === supplied receiptId`, including when both receipts have the same task/workspace. Imported/copied receipts from other workspaces are unsupported. Process crashes may leave a temp file or lock: document cleanup; they must not yield an accepted partial receipt. `release`/garbage-collection commands are deferred; deleting this evidence directory shall not affect maps, baselines or the gate.

### Normative evidence projection and supporting paths

Direct callers use `callersOf`/callIn; direct callees use `calleesOf`/callOut. A self-recursive direct call remains in these sets as today. Impact uses reverse call+inherit reachability, excludes the target, and does not traverse import/test/ref. Relations may legitimately name the same symbol in different classes.

For direct relations, witnessPath is the one direct call edge, including a self-loop when present. For each impact record, select a shortest reverse-traversal path from target to related symbol; among equal lengths choose the lexicographically smallest ordered sequence of `(fromID,toID,kind)` tuples, compared by UTF-8 bytes after canonical tuple encoding. Only call/inherit edges qualify. Tie comparison uses target-outward reverse-traversal order; reverse the chosen path only for storage. Store the path in original dependency direction, related symbol toward target. The support file set is every endpoint node file on that path plus the target file, sorted/deduplicated. The evidence digest hashes relationship identity, path edge tuples, each endpoint's `(id,file,line,loc,kind)` projection and support `(path,sha256)` pairs. An intermediate-file edit therefore changes the witness even when the related ID is retained. An alternate path can change the selected witness without changing reachability; call this witnessChanged, not a behavioral regression. Failure to produce the claimed path yields inconclusive invalid-witness, never an unsupported path assertion.

Target evidence projection: `{id,label,file,line,loc,kind,exports,signature,sourceSha256}` with missing optional fields encoded null. Graph projection version1: nodes projected to the same target fields except replace sourceSha256 with `sourceDigest:{algorithm,value}` (SHA-256 from inventory for private evidence; explicitly labeled recorded algorithm/value or null for a loaded historical graph); edges projected to `{source,target,kind}` using actual normalized graph edge field meanings and sorted/deduplicated by the tuple; analysis diagnostics projected to `{code,file,line,column,evidence}` and sorted by those keys; fixed provenance profile. Exclude domains, coordinates, graph.meta timestamps, stat stamps, cache counters/paths, renderer metadata, arbitrary node extras and graph array encounter order. No invocation wall time enters hashes. Structural review's loaded graph digest uses the same projection with sourceDigest from its recorded source hashes when available, otherwise null; its recorded hash algorithm is included and must not be relabeled SHA-256. Thus identity equality requires equal actual projected fields and algorithm labels, not a claim of source currency.

Analyzer identity includes profile version, relation/projection/schema versions, exact SHA-256 of the shipped runtime source tree (all .mjs files in scripts/lib plus extract-symbols.mjs and context/review entrypoints; sorted normalized relative paths), the Node runtime version, SRC_RE/SKIP implementation digest and fixed engine options. V1 loads no grammar/runtime extension; profile declares `ctags:false, ast:false`. The rules/config input digest is distinct from analyzer identity; root rules content changes invalidate compatibility conservatively. Package-manifest changes alter inventory and recompute evidence rather than automatically declaring incompatibility. An implementation shall freeze this projection in tests; changed projection rules require a version bump.

Canonical arrays treated as sets: relation memberships, support files, nodes, edges, diagnostics, limitations/reason codes, questions (by ID), inventory entries and directory entries; sort by the stated UTF-8 key. Ordered arrays: witnessPath and fixed protocol nextSteps. NextSteps are renderer-derived fixed strings and excluded from receipt/result payload identity. Source text and diagnostic evidence are data; no Unicode normalization; reject invalid/unpaired surrogate input rather than replace bytes. Canonical serializer emits finite numbers only, no undefined properties (optional absent data is null), JSON escaping, recursively sorted UTF-8 object keys, compact separators and no trailing newline. Display text can accompany rendered output but is not an extra canonical payload field. Any unknown schema payload field is rejected for version1 so hashing does not silently accept new semantics.

Result payload fields are `schemaVersion`, `parentReceiptId`, `task`, `sourceRootRealpath`, `baseline`, `current`, `query`, `target`, `targetEvidenceChanged`, `inputsChanged`, `state`, `reasons`, `relations` (current complete records), `deltas` (added/removed/witnessChanged complete records), `questions`, `analysis`, `legacyReviewGraph` and `sameGraphAsEvidence`. Receipt fields are exactly those listed in section4, with the canonical workspace field named `graphRelativePath`. Error envelopes are not hashed result records. Runtime schemas shall encode these fields/types, enums and conditional nulls; JSON reference fixtures shall pin complete examples before implementation.

## 5. Capture and coherent source snapshots

ER-06: Capture shall derive evidence from an analysis that corresponds to the inventory it records. Reuse existing extraction, inventory, source-reading and graph-index functions; do not rely solely on current stat-only freshness or graph sidecar mtime+size. No new parser or source format tier is introduced. The isolated profile below is explicit and may differ from ordinary mapping scope.

### Fixed V1 evidence extraction profile

The private evidence profile is `native-regex-snapshot-v1`: `engine:"regex"`, `ctags:false`, no AST/ctags subprocess, no ambient `CODEWEB_ENGINE` override, and no shared extraction-cache reads/writes. This deliberately reproduces the extractor's deterministic filesystem-walk selection, not its optional `rg` discovery branch. Record the profile in every capture/review evidence summary. It may differ from the existing saved graph; the two identities shall remain separately labeled. No silent fallback between profiles is permitted.

Discovery uses the current extractor's SRC_RE and fixed SKIP directory names (node_modules, .git, dist, build, out, vendor, third_party, .codeweb, coverage), pinned by the profile's implementation digest. Walk sorted root-relative paths without following symlinks. V1 conservatively rejects any nonexcluded symlink with unsupported-source-layout, since a link’s contents/type are not inspected. This can reject repositories with otherwise irrelevant symlinks; ordinary mapping is unchanged. Include hidden files otherwise. `.gitignore`, `.ignore`, global Git ignores and rg availability do not influence this isolated profile. State `isolated-discovery-does-not-apply-ignore-files` in limitations. This is an explicit evidence-only scope choice; ordinary mapping is unchanged.

Inventory includes every selected supported-source file and JSON config candidate, all files read for role/package resolution (root codeweb.rules.json, package.json, and existing manifest names including *.csproj/*.sln), and directory membership used in package discovery. Hash manifest bytes without adding any new format parser. Capture absent/present state as well as contents of required discovery/config inputs. Resolve package lookups only inside the target; reject an attempted outside-root read. The same shared resolver/extractor functions must use the snapshot's readFile/exists/readdir interface for every such read. Do not substitute the saved graph's unstamped/unknown options for this declared profile. Any future profile change requires a semantics version change.

The inventory is a canonical `entries` array of `{path, kind, sha256}` sorted by UTF-8 path then kind, where kind is source/json/manifest/config and a file appearing in multiple roles has one entry per role; `directories` is the sorted set of visited relative directories and their sorted entry-name/type lists. All hashes cover raw bytes, including manifests not represented as graph nodes. Required absent configuration records use `sha256:null` with kind=config. Capture complete selected bytes in memory and enforce the read adapter. Failure to enumerate/read them yields source-unavailable; no partial inventory is valid.

For each capture/reconcile, enumerate/hash inventory I0; derive a graph solely from immutable captured bytes and directory/exists observations under the fixed profile; enumerate/hash I1. Accept only I0=I1 and an extractor result demonstrably tied to that inventory. One retry is allowed; a second mismatch yields `source-changing` with no current/unchanged claim. Read bodies/evidence from the same captured bytes or verify their hashes against accepted inventory before publishing. A file that changes and reverts during a run still requires the derived graph to match captured bytes; matching before/after inventories alone is insufficient. runExtract uses an immutable input adapter for evidence mode; ordinary extraction retains filesystem reads. It must cover source reading, package resolution, rules reading and all discovery operations; path-reading ctags and AST engines are disabled in this profile. No unverified cache hit satisfies this requirement.

V1 rebuilds/validates a private normalized analysis in memory and does not overwrite graph.json, graph.prev.json, graph.baseline.json or hook baseline files. V1 evidence derivation performs no extraction-cache writes or reads; it therefore does not race current shared scan-cache writers. Immutable artifact publication uses only its dedicated bounded store lock. The normal MCP auto-refresh policy outside evidence mode remains unchanged. Dispatch evidence capture/page/review before ordinary context cache guards, automatic refresh, default limit injection and stale-response suffixing. Capture/reconcile use this coherent path; historical pages validate the artifact without requiring a current symbol or fresh graph, and append no current-staleness text. A valid graph location/root is needed to establish workspace identity; historical source files need not still exist.

ER-07: Capture may record known incomplete extraction with limitations intact. The evidence itself always comes from the declared native profile. A saved graph with agent-derived provenance is only a workspace locator, never substituted as evidence; expose that saved-graph provenance separately. A receipt containing agent-built or unsupported evidence derivation shall be rejected as unsupported-engine; do not relabel it native and declare equivalence. For V1 capture, inability to derive the target from a deterministic native run yields `unsupported-engine` rather than minting a comparable receipt. Static analysis always retains `unmapped-calls` as a limitation, including when no known diagnostic fires.

## 6. Reconciliation algorithm

ER-08: Load and validate explicit receipt/task/workspace; compute a coherent current analysis as above. Compare engine identity, relation semantics and effective options before comparing sets. Any analyzer/semantics/options change returns `inconclusive` with reason `analysis-incompatible` and requests recapture. Source changes are expected and trigger recomputation, not automatic incompatibility. The supplied review `before` is independent and controls only legacy structural review; receipt baseline controls evidence delta. Label both, never silently replace either. Evidence metadata shall also include `legacyReviewGraph:{digest, profile}` for the loaded AFTER graph used by ordinary review and `sameGraphAsEvidence:boolean`. Ordinary stat-based freshness is a live envelope-only advisory named `legacyReviewFreshness`; exclude it from immutable records and all hashes. Mixed-snapshot explanatory prose is likewise rendered from digest/profile comparison, not hashed as changing live text. If projections differ, include `legacy-verdict-not-recomputed-on-evidence-snapshot` in limitations and render this in text output. The normal review may also read current source for duplication, as it does today; label it a mixed graph/source preflight, not a verified coherent snapshot. Do not claim its verdict covers the private evidence graph.

1. Re-find the original exact target ID. V1 does not infer moves/renames or select another same-name symbol. If absent, return `inconclusive`, reason `target-unresolved`, with the historical target and explicit recapture guidance. Do not infer deletion from absence in a possibly incomplete map.
2. Evaluate the canonical relation query against current graph. Do not reuse only the old displayed list or constrain it to review's `changed` files. A caller elsewhere may have been added by another agent.
3. Compare complete sets: added = current minus baseline; removed = baseline minus current; retained = intersection. For retained records compare evidence digests to produce `witnessChanged`. All sets/classes sorted deterministically and deduplicated.
4. Compare the target record itself and set `targetEvidenceChanged` when its file/span/kind/source digest changes, including a target with empty relationship sets. Publish an immutable result with original/current identity, complete deltas, current evidence, historical source references, question reconciliation and compatibility/completeness state. It never overwrites the receipt. A second review against the same receipt compares with the original capture, not the prior result.
5. Report `unchanged` only when target evidence, query relation sets, retained witness evidence and question evidence/status match. Inputs may have changed outside the answer; expose `inputsChanged:true` with `state:"unchanged"` only after successful recomputation. Report `changed` for evidence/question differences. Known extraction incompleteness in either snapshot makes state `inconclusive`; diagnostic set differences may be displayed but no definitive added/removed claim is emitted. Missing source or unstable source similarly prevents comparison. Unknown possible unmapped calls remain a standing scope limit, not a claim that every clean graph is inconclusive.

State precedence: request syntax error → unavailable artifact (`missing`, `corrupt`, `wrong-task`, `wrong-workspace`, `store-*`) → inconclusive analysis (`analysis-incompatible`, `source-*`, `unsupported-engine`, `target-unresolved`, `extraction-incomplete`) → changed/unchanged. Storage failure after computation returns `unavailable` with computed summary explicitly labeled `not-persisted`; no result ID or page promises. Never use a successful verdict to resolve an unavailable evidence result.

A valid clean-gate result can have `evidence.state:"changed"`, or unanswered questions. This path shall not depend on `hooks/post-edit-diff.mjs` returning a warning. Automatic hook invocation is not in V1.

## 7. Questions and provenance

ER-09: V1 only creates deterministic questions from existing evidence: detected extraction diagnostics relevant to the target file or a returned mapped symbol's file; exported target with unknown external consumers; missing caller source evidence if capture otherwise has sufficient inputs. Source-unavailable inventory blocks capture; source-window absence within available files is a distinct evidence gap. Global dynamic/unmapped warnings with no precise diagnostic span remain limitations, not invented localized questions.

Question identity: hash of receipt-independent `(task, target ID, reason code, file, diagnostic span)` with length-delimited encoding. Store original/current source file hash. Relocation without a proven stable identity retains the old question as `needs-recheck` and may create a new one; do not silently mark it answered.

States: `unresolved`, `needs-recheck`, `no-longer-observed`. Capture creates unresolved. Reconciliation evaluates the following rows in order against the original receipt; first applicable row wins. Always preserve the original question/source hash and add current observations.

| Priority | Condition | Result |
|---|---|---|
| 1 | Target missing, source unavailable/unstable, incompatible or incomplete analysis | needs-recheck; no disappearance/closure claim |
| 2 | Original exact reason/span ID is absent, but the same reason is found at a different span in the same file; V1 cannot prove relocation | Old question needs-recheck; a candidate not already in baseline gets a new unresolved question. Existing candidate IDs are reconciled once against their own original records |
| 3 | Original exact reason/span still observed and its supporting file hash differs | needs-recheck |
| 4 | Original exact reason/span still observed and supporting bytes match | unresolved |
| 5 | Original reason no longer observed in a complete compatible current analysis, with no same-file relocation candidate | no-longer-observed, even if source bytes changed; explicitly not semantic resolution |

For exported-consumer questions the condition is the target's mapped export flag; a provably nonexported same-ID target takes row 5, not a claim about all consumers. A missing target takes row 1. A disappeared original question remains visible in the result. New questions not present at capture are unresolved. Global limitations lacking question identities remain limitations. The source edit itself, a read, or a user assertion never supplies proof of resolution.

V1 accepts no client-supplied resolution, `agent-reviewed` update or arbitrary question text. Such annotations are deferred. There is no `source-supported` state until a future spec defines a specific machine-checkable resolution predicate. Reading a file, passing a test, changing source or correlating a pending card cannot resolve a V1 question.

## 8. Pagination and display

ER-10: Capture sections: callers, callees, impact, questions. Result sections: added, removed, witnessChanged, questions. Delta items include relation class. Initial summaries provide counts and page descriptors, not an arbitrary claim that the first page is the full answer. Pages reference receiptId and optionally resultId; IDs pin immutable historical contents. Page reads do not refresh or claim present currency.

Items ordered by canonical relation identity or question identity. Before packing items, measure mandatory summary/error metadata. If it exceeds the envelope cap, return a compact `summary-too-large` error containing only fixed mode/state/code, a bounded task/receipt/result ID where available and fixed nextSteps. Do not echo the oversized selector, path, label or invalid input in that error. Unknown reason codes and full limitation strings remain in the bounded local record; summary may replace the list with exact counts and a record locator explicitly marked metadataOmitted. If capture cannot return its required target summary, it fails and does not publish a new receipt. Error envelopes obey the same byte cap. Pack as many complete items as fit the 8,192-byte envelope, reserving serialized counts/status/next actions first. Never split an item. For an item too large even alone, return a compact item locator (ID, record section/index, source file/line when representable) and `itemOmitted:true`; count it as one advanced item and state that full detail requires reading the local JSON record. If even the locator cannot fit, return `item-too-large` (exit 2), not a looping cursor. Paths/labels are not silently sliced to fit. Offset >total returns a typed argument error; offset=total returns empty final page. `remaining = total - (offset + itemsAdvanced)`; `nextOffset` equals offset+itemsAdvanced iff remaining>0. Reading all pages reconstructs all identities or explicitly omitted detail locators, never an unmarked omission.

Pagination does not mutate timestamps, receipt status or baseline. Deleting a referenced artifact returns unavailable, not a recomputed page with different contents. A changed current workspace cannot alter old page membership. Symlink paths/source limits continue to apply.

## 9. Implementation modules and sequencing

| Stage | Change | Existing seam / constraint |
|---|---|---|
| 1 | Pure evidence identity, relation projection, validation and reconciliation core | New `scripts/lib/evidence-core.mjs`; `graph-ops.mjs` and context semantics reused; no second impact algorithm |
| 2 | Coherent input snapshot and bounded immutable store | New `scripts/lib/evidence-store.mjs`; existing source enumeration/extraction cache primitives, `cli.mjs` freshness, atomic write; storage strict unlike best-effort stats |
| 3 | Explicit capture/page context mode | `context-pack.mjs`, `context-core.mjs`, `tool-specs.mjs`, MCP schema/validation/fast path; one response truth |
| 4 | Explicit receipt review extension | `review.mjs` plus MCP binding; compute legacy review unchanged and add separately computed evidence; no hook warning dependency |
| 5 | Documentation and parity/compatibility checks | CLI/help/MCP guidance, generated interface consistency and package-shape; no new tool count or dependency |

Tests precede implementation. Coherent snapshot support is a prerequisite, not optional hardening. If implementing it reveals material extractor limitations, document that finding and revise the design before claiming currency. No update to harness files is authorized by this spec.

## 10. Acceptance and verification matrix

The cases below map to implemented evidence test suites. See the implementation verification record for executed commands and coverage. A spec-lint pass alone does not establish feature correctness.

| ID | Setup/action | Required observable result | Suite |
|---|---|---|---|
| ER-T01 | Two direct callers, one callee, transitive caller; capture then unchanged review | Exact full sets preserved; unchanged, persistent question retained | evidence-core.test.mjs |
| ER-T02 | New eligible caller file after capture | Fresh enumeration; caller added regardless of changed-file filter | evidence-snapshot.test.mjs |
| ER-T03 | Intermediate witness edit/alternate path; alter caller contents while preserving mtime/size | Verified digest changes; witnessChanged or relation delta, never cache-only unchanged | evidence-snapshot.test.mjs |
| ER-T04 | Add/delete eligible directories; change ignore files, root rules and package manifests | Membership changes observed; ignore-only change has no effect; rules change incompatible; manifest change recomputes | evidence-snapshot.test.mjs |
| ER-T05 | Change then revert file during extraction; repeated concurrent writes | Derived graph tied to captured bytes or source-changing after one retry | evidence-snapshot.test.mjs |
| ER-T06 | Analyzer/engine/relation version changed | Inconclusive, recapture required, no set equality claim | evidence-core.test.mjs |
| ER-T07 | Target renamed/deleted, same-name unrelated symbol exists | target-unresolved; no heuristic retarget; questions need recheck | evidence-core.test.mjs |
| ER-T08 | Large degree exceeds one page; huge item/path; missing page file | Exact totals/cursors; explicit detail omissions/errors; no loops or silent loss | evidence-store.test.mjs |
| ER-T09 | Two task receipts in same workspace; wrong task/workspace; altered record | Isolation; explicit typed errors, digest/schema verified | evidence-store.test.mjs |
| ER-T10 | Incomplete baseline or current extraction; stale source windows | Inconclusive state; no definitive removal; questions never closed | evidence-core.test.mjs |
| ER-T11 | Clean legacy gate plus new caller or old unanswered question | Existing verdict/exit unchanged; evidence still returned | evidence-transport.test.mjs |
| ER-T12 | Legacy failing gate plus missing receipt | Existing failing verdict/exit retained with evidence unavailable | evidence-transport.test.mjs |
| ER-T13 | Missing flags, mixed modes, ambiguous selector, negative/fractional offset | Deterministic usage errors; no artifact writes | evidence-transport.test.mjs |
| ER-T14 | Same inputs via CLI/MCP, repeated runs, varied key/set ordering | Canonical IDs/evidence bytes identical despite source mtime/cache-path differences; old calls unchanged | evidence-transport.test.mjs |
| ER-T15 | Record/store cap, concurrent writes, crash after temp write, symlink file/dir | No partial accepted artifact/escape; cap preserved; actionable errors | evidence-store.test.mjs |
| ER-T16 | Wrong-parent result from same task; successful reconcile invoked twice against original receipt | Wrong-parent page rejected; both reviews use original baseline, not prior result | evidence-core.test.mjs |
| ER-T17 | Change only unrelated file; recompute same answer | inputsChanged=true and unchanged allowed only after coherent recompute | evidence-core.test.mjs |
| ER-T18 | Diagnostic disappears or source read/agent claim says done | No semantic resolved state; no-longer-observed or needs-recheck retains provenance | evidence-core.test.mjs |
| ER-T19 | Old saved graph vs fresh private evidence; capture/reconcile/page after explicit graph baseline saved | Preserved baseline/hook metadata; loaded-review/private-evidence discrepancy labeled | evidence-transport.test.mjs |
| ER-T20 | Oversized mandatory target/selector/error metadata; entire capture/page and review evidence payloads including multibyte paths | ≤8192 UTF-8 bytes with recoverable paging/error; complete record ≤2MiB | evidence-store.test.mjs |

Property checks: set-delta partition/disjointness; canonical-order invariance; page reconstruction; no accepted receipt with missing inputs; task noninterference; receipt immutability; old-surface transport regression parity. Exercise target/caller source evidence and required file scope with fixtures, not only synthetic graphs.

Release technical floor: all ER-T01–20 and existing `sh scripts/check` pass; no source mutations, network operations or dependency addition. Performance report shall measure capture/reconcile wall time, total bytes across pages, store growth and unrelated-change recomputation against existing context+baseline+refresh+review. No token/time improvement target is asserted as achieved.

User outcome validation remains pending. **V1 is the single-symbol reconciliation slice and cannot validate a broader multi-symbol boundary workflow.** Freeze a V1 task protocol before participant testing; do not infer savings or improved edits from structural test results.

## 11. Decisions and remaining uncertainty

Settled for this implementation: explicit task/receipt, one target, conservative complete inventory, immutable records, 8KiB envelopes, no automatic hook association, no semantic question resolution, no new tool, no gate changes. These are implementation choices within the existing local charter.

Uncertainty requiring engineering verification: ability to reuse extraction against immutable captured bytes without duplicating discovery semantics; runtime cost of fresh inventory; high-degree receipt size; user benefit over existing Codeweb. They are acceptance risks with defined failure states, not unspecified API behavior. Prototype estimates from the invention report are not commitments; coherent snapshot work may expand them.

Follow-up candidates only: exact multi-symbol boundary packets, API route evidence, session-bound automatic hooks, evidence annotations with explicit provenance, selective invalidation, cleanup command, report UI. None is required to mark V1 implemented. Built criteria are recorded in controlling SPEC.md; this is not a release or deployment.
