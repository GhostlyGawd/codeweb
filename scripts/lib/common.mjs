// codeweb side-effect-free shared helpers (finding 24). lib/cli.mjs installs a module-level
// stdout EPIPE handler the moment it is imported — correct for CLIs, wrong for pure stages and
// libraries that only want a constant. The pure pieces live here; cli.mjs re-exports them so
// existing importers keep working, and anything that needs SRC_RE or capList without process
// plumbing imports THIS module.

// One truth for "what counts as a mappable source file" — the extractor's SRC list, mirrored
// here for the hooks (Spec E consolidation; the hooks previously trailed the extractor's list).
export const SRC_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|cs|rb|php|kt|kts|swift)$/;

// finding 17: THE scan-cache filename — run.mjs, the post-edit hook, and refresh.mjs previously
// used three different names for the same workspace (the first hook fire after every map ran a
// cold full re-scan). Engine-namespaced; callers must also agree on engine flags (they do).
export const SCAN_CACHE_NAME = '.scan-cache.json';

/** Signed-delta formatter for renderers ("+3", "-2", "+0" — a delta always shows its direction). */
export const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Shared list-truncation for budgeted output: keep the first `limit` items and describe the rest,
 * so a tool can return top-N + an explicit remainder instead of an unbounded dump (no silent caps).
 * limit == null / Infinity -> untouched.
 */
export function capList(items, limit, offset = 0) {
  const all = Array.isArray(items) ? items : [];
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  if (limit == null || !Number.isFinite(limit)) {
    return { items: off ? all.slice(off) : all, total: all.length, offset: off, truncated: false, remaining: 0 };
  }
  const lim = Math.max(0, Math.floor(limit));
  const slice = all.slice(off, off + lim);
  const remaining = Math.max(0, all.length - (off + slice.length));
  return { items: slice, total: all.length, offset: off, truncated: remaining > 0, remaining };
}
