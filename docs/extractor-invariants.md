# Extractor cache invariants — the one-page soundness map

**Written 2026-08-17** (PLAN finding 33 / ENG-F9). `scripts/extract-symbols.mjs`'s `runExtract`
is deliberately one large function — 4 true edits and 0 fixes across its recorded history earned
it the big-and-quiet ruling (`reports/HOTSPOTS.md`): **measure it, don't refactor it**. What it
lacked was a map of the soundness argument, which lives in excellent but scattered comments.
This page is that map, for the next engine contributor. Line references drift; the signature and
transition NAMES below are stable anchors to grep for.

**The contract everything serves: warm output is byte-identical to a cold rebuild.** Pinned by
the IE-EQUIVALENCE property suite (40 trials) and the independent-oracle correctness bench.
Every tier below is an optimization that must be *provably* unable to change bytes — when in
doubt, a tier falls back to the tier below it, per file, and the bottom tier is a full read.

## The signatures (each answers "may I reuse X?")

| Signature | Over | Gates the reuse of |
|---|---|---|
| `SCANNER_VERSION` + `engineMode` | scanner code version; `ctags\|regex` (+`+ts`) | the whole cache file — a version or engine change is a cold start; tree-sitter products can never serve a regex run (separate namespace) |
| `rulesSig` | sha1 of `codeweb.rules.json` | everything — role overrides are baked into cached nodes, so a rules change invalidates the stamp tier wholesale |
| `fileSig` | sorted file list, `.json` universe included | anything that resolves against the file SET (re-export targets, import bindings): a file appearing or vanishing changes what specifiers resolve to |
| `pkgSig` | package-boundary partition | the unique-in-package edge rule — a boundary move repartitions `inPkg` with zero label delta |
| `rexSig` | the re-export landscape (+ the Python `(srcMod, orig)` membership belt) | edge chains through forwarding files — a forward flip retargets OTHER files' chains invisibly |
| `symbolSig` | all labels × def-ids (with the closure-local `` marker) | the bare-name resolution universe — when unchanged, the whole derive replays |

## The three reuse tiers (strongest first, each falls back per file)

1. **Stamp tier** — mtime+size match ⇒ reuse every cached per-file product *without reading the
   file*. Trusts the same stamps `checkStaleness` trusts. Disabled wholesale by `--full`,
   `CODEWEB_VERIFY_FRESHNESS=1`, or a `rulesSig` change.
2. **Content-hash tier** — stamp missed; read the file; sha1 matches the cached entry ⇒ reuse
   its products. The read is stat→read→re-stat with retry: a file that keeps changing gets a
   **never-fresh stamp** (`s:-1`) so staleness always flags it — *fail-stale, never fail-fresh*.
3. **Name-delta tier** — the file changed for real; instead of a wholesale re-derive, compute
   the per-label def-id delta and re-derive only dirty labels. Kill switch:
   `CODEWEB_NAME_DELTA=0` (rollback lever — both paths emit identical bytes; only wall-time
   moves).

## The wholesale-flip transitions (delta ineligible — full re-derive)

Grep anchor: "WHOLESALE-FLIP transitions" in `extract-symbols.mjs`.

- **(a)** `pkgSig` moved — repartition with zero label delta.
- **(b)** `fileSig` changed — the specifier + `<module>` landscape moved (add/delete).
- **(c)** the old cache predates the current per-entry fields (`cand`/`bindCand`/`bindDeps`,
  Python `pyrex`) — additive migration: one wholesale run records them, no version bump.
- **(d)** `--full` or `CODEWEB_VERIFY_FRESHNESS=1` — the operator asked for the read path.
- **(e)** the re-export landscape moved (`rexSig`), including the Python belt: a changed `.py`
  file whose own def set gained/lost a chain landing pad (`srcMod:orig`) flips edge-time
  resolution invisibly to every consumer's `cand`/`bindDeps`.
- **(f)** `CODEWEB_NAME_DELTA=0` — the kill switch.

## Two easy-to-miss soundness details

- **Closure-local markers**: a nesting flip keeps a symbol's id but changes its
  closure-locality; both delta lists carry the `` marker so that label still dirties —
  the fallback's verdict changed while every table looked identical.
- **Edge interning**: cached edges are stored as `[fromIdx, toIdx, kindIdx]` triples and
  decoded to FRESH objects per run — cached state must never alias the live fragment.

## What to do when touching any of this

Change behavior → the property suite (IE-EQUIVALENCE) is the referee; add a signature rather
than widening an existing one; and if a new per-file product ships, add it to transition (c)'s
field check so old caches migrate wholesale instead of replaying incomplete entries.
