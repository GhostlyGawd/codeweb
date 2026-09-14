// Known extraction omissions, not a claim that an unflagged graph is complete.
// Samples are bounded independently of the exact diagnostic count. Evidence is
// masked code only: string/comment contents must never enter diagnostics.
export const DIAGNOSTIC_CAP = 20;
export const INCOMPLETE_STEP = 'Analysis incomplete: same-line JS/TS declarations may be missing or have incorrect call ownership. Inspect the diagnostic locations and their callers in source; do not accept this graph as a clean gate.';

export function sameLineDeclarations(masked, file) {
  let count = 0;
  const diagnostics = [];
  const lines = masked.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only statement declarations. Assigned/named function expressions, callbacks,
    // object properties and class methods are deliberately outside this detector.
    // Arrow parameter lookahead is capped; this is containment, not a general parser.
    const declarations = /\b(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b\s*\*?\s*[A-Za-z_$][\w$]*|(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+[A-Za-z_$][\w$]*|(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\([^;]{0,4096}?\)\s*=>|[A-Za-z_$][\w$]*\s*=>))/g;
    for (const match of line.matchAll(declarations)) {
      const prefix = line.slice(0, match.index).trimEnd();
      if (!prefix) continue; // the supported line-leading declaration
      // A declaration follows a statement/block, not an expression operator.
      // `export` is also an unambiguous declaration marker after an import.
      if (!/[;{}]$/.test(prefix) && !(match[0].startsWith('export ') && /^\s*import\b/.test(prefix))) continue;
      count++;
      if (diagnostics.length < DIAGNOSTIC_CAP) diagnostics.push({
        code: 'unsupported-same-line-declaration', file, line: i + 1,
        column: match.index + 1,
        evidence: line.slice(Math.max(0, match.index - 40), match.index + 120).trim(),
      });
    }
  }
  return { count, diagnostics };
}

export function extractionAnalysis(parts) {
  const count = parts.reduce((n, p) => n + p.count, 0);
  return {
    status: count ? 'incomplete' : 'no-known-incompleteness',
    diagnosticCount: count,
    diagnostics: parts.flatMap((p) => p.diagnostics).slice(0, DIAGNOSTIC_CAP),
  };
}

// Include BOTH snapshots: a repaired after-map cannot validate an incomplete baseline.
export function incompleteAnalysis(...graphs) {
  const parts = graphs.map((g, i) => ({ analysis: g?.meta?.analysis, snapshot: graphs.length > 1 ? (i === 0 ? 'before' : 'after') : 'current' }))
    .filter(({ analysis }) => analysis?.status === 'incomplete');
  if (!parts.length) return null;
  return {
    status: 'incomplete',
    diagnosticCount: parts.reduce((n, { analysis }) => n + (analysis.diagnosticCount || analysis.diagnostics?.length || 0), 0),
    diagnostics: parts.flatMap(({ analysis, snapshot }) => (analysis.diagnostics || []).map((d) => ({ ...d, snapshot }))).slice(0, DIAGNOSTIC_CAP),
    nextSteps: [INCOMPLETE_STEP],
  };
}
