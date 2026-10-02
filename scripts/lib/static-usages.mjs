// Bounded usage scanning over already masked source. No target code executes.
// JSX uses require a self-closing or paired tag; TS generics are not render sites.
export function scanStaticUsages(masked, file) {
  const jsx = [], values = [], tags = [];
  const isJs = /\.(jsx?|mjs|cjs|tsx?|mts|cts)$/.test(file);
  if (!isJs && !file.endsWith('.py')) return { jsx, values, code: masked };
  const starts = [0];
  for (let i = 0; i < masked.length; i++) if (masked[i] === '\n') starts.push(i + 1);
  const position = (offset) => {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid] <= offset) lo = mid; else hi = mid; }
    return { line: lo + 1, column: offset - starts[lo] + 1, offset };
  };
  if (isJs) {
    const closed = new Set([...masked.matchAll(/<\/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)?\s*>/g)].map(m => m[1] || ''));
    let jsxDepth = 0, expressionDepth = 0, lastEnd = 0;
    for (const m of masked.matchAll(/(?:<(\/?)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?=[\s/<>])|<(\/?)>)/g)) {
      const name = m[2] || '';
      if (jsxDepth > 0) for (let i = lastEnd; i < m.index; i++) {
        if (masked[i] === '{') expressionDepth++;
        else if (masked[i] === '}') expressionDepth--;
      }
      else expressionDepth = 0;
      lastEnd = Math.max(lastEnd, m.index);
      let before = m.index - 1; while (before >= 0 && /\s/.test(masked[before])) before--;
      const prefix = masked.slice(Math.max(0, before - 12), before + 1);
      if (!m[1] && !m[3] && !(jsxDepth > 0 && expressionDepth === 0) && prefix && !/[=(:,[{}>?|&!]$/.test(prefix) && !/\b(?:return|yield)$/.test(prefix)) continue;
      let depth = 0, types = 0, end = m.index + m[0].length - (m[2] ? 0 : 1);
      for (; end < masked.length; end++) {
        if (masked[end] === '{') depth++;
        else if (masked[end] === '}') depth--;
        else if (masked[end] === '<' && depth === 0) types++;
        else if (masked[end] === '>' && depth === 0) { if (types > 0) types--; else break; }
      }
      if (end === masked.length) continue;
      const close = !!(m[1] || m[3]), selfClosing = masked[end - 1] === '/';
      if (!close && !selfClosing && !closed.has(name)) continue;
      // `extends` and commas indicate a generic parameter, even if another JSX
      // element happens to use the same identifier elsewhere in this file.
      if (!close && /^\s*(?:extends\b|,)/.test(masked.slice(m.index + m[0].length, end))) continue;
      tags.push({ start: m.index, end: end + 1, close, selfClosing, name });
      if (close) jsxDepth = Math.max(0, jsxDepth - 1); else if (!selfClosing) jsxDepth++;
      lastEnd = end + 1;
      if (!close && (/^[A-Z_$]/.test(name) || name.includes('.'))) jsx.push({ name, ...position(m.index), kind: 'call' });
    }
  }
  // JSX child text is not executable JavaScript. Keep expression containers and
  // tag attributes intact so callbacks inside them retain their real use sites.
  const chars = tags.length ? masked.split('') : null; let depth = 0, brace = 0, previous = 0;
  for (const tag of tags) {
    if (tag.start < previous) continue; // nested JSX in attributes is already inside this preserved tag
    if (depth > 0) for (let i = previous; i < tag.start; i++) {
      if (chars[i] === '{') brace++;
      else if (chars[i] === '}') brace--;
      else if (brace === 0 && chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    }
    if (tag.close) depth = Math.max(0, depth - 1);
    else if (!tag.selfClosing) depth++;
    previous = tag.end;
  }
  const code = chars ? chars.join('') : masked;
  const bindingSpans = [];
  if (isJs) for (const m of code.matchAll(/^[\t ]*(?:import\b(?!\s*\()|export\s+(?:type\s+)?\{)/gm)) {
    let braces = 0, end = m.index;
    for (; end < code.length; end++) {
      if (code[end] === '{') braces++;
      else if (code[end] === '}') braces--;
      if (braces === 0 && (code[end] === ';' || code[end] === '\n')) break;
    }
    bindingSpans.push([m.index, end]);
  }
  if (isJs || file.endsWith('.py')) {
    const value = /(?:[=:\[,({]|\breturn\b)\s*(?:\{\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?=[,;)\]}]|$)/gm;
    for (const m of code.matchAll(value)) {
      const at = m.index + m[0].lastIndexOf(m[1]);
      if (bindingSpans.some(([start, end]) => at >= start && at <= end)) continue;
      values.push({ name: m[1], ...position(at), kind: 'ref' });
    }
  }
  return { jsx, values, code };
}
