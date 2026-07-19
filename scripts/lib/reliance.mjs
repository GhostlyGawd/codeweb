// reliance — what callers ACTUALLY depend on. The most common breaking edit is changing a
// return shape while some caller still destructures `.timeout` off it; the call sites are all
// in the graph, so read the dependency off them and say it in one line: "callers rely on
// {timeout, retries} · awaited 3/4 · args 1-2". Conservative by construction: only patterns
// visible on the call-site line count; absence of a report means "nothing detected", never
// "nothing relied on".

import { callersOf } from './graph-ops.mjs';

const MAX_SITES = 40;
const PROMISE_PLUMBING = new Set(['then', 'catch', 'finally']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Count top-level commas of the first LABEL(...) call on the line; null when unparsable. */
function argCount(line, label) {
  const start = line.search(new RegExp(`\\b${escapeRe(label)}\\s*\\(`));
  if (start === -1) return null;
  let i = line.indexOf('(', start);
  let depth = 0, args = 0, sawAny = false, quote = null;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote && line[i - 1] !== '\\') quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return sawAny ? args + 1 : 0;
    } else if (depth === 1) {
      if (ch === ',') args++;
      else if (!/\s/.test(ch)) sawAny = true;
    }
  }
  return null; // call spans lines — skip this site for arg counting
}

/**
 * Inspect the call sites of `node` (via its graph callers + on-disk source) and report the
 * observable reliance. Returns null when source is unreadable or no call sites were found.
 */
export function callerReliance(graph, index, node, reader) {
  if (!reader?.available || !node?.label) return null;
  const label = node.label;
  const callRe = new RegExp(`\\b${escapeRe(label)}\\s*\\(`);
  const destructureRe = new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*(?:await\\s+)?[\\w.$]*\\b${escapeRe(label)}\\s*\\(`);
  const memberRe = new RegExp(`\\b${escapeRe(label)}\\s*\\([^()]*\\)\\s*\\.(\\w+)`);
  const awaitRe = new RegExp(`\\bawait\\s+[\\w.$]*\\b${escapeRe(label)}\\s*\\(`);
  // v2 (Spec G): exception + nullability reliance, same line-visible conservatism.
  const catchChainRe = new RegExp(`\\b${escapeRe(label)}\\s*\\([^()]*\\)\\s*\\.catch\\s*\\(`);
  const negatedRe = new RegExp(`!\\s*[\\w.$]*\\b${escapeRe(label)}\\s*\\(`);
  const optChainRe = new RegExp(`\\b${escapeRe(label)}\\s*\\([^()]*\\)\\s*\\?\\.`);
  const coalesceRe = new RegExp(`\\b${escapeRe(label)}\\s*\\([^()]*\\)\\s*\\?\\?`);
  const nullCmpRe = new RegExp(`\\b${escapeRe(label)}\\s*\\([^()]*\\)\\s*[!=]==?\\s*(?:null|undefined)`);

  const fields = new Set();
  let sites = 0, awaited = 0, minArgs = null, maxArgs = null, handlesErrors = 0, nullChecked = 0;
  for (const callerId of callersOf(index, [node.id])) {
    if (sites >= MAX_SITES) break;
    const caller = index.byId.get(callerId);
    const lines = caller && reader.linesOf(caller.file);
    if (!lines) continue;
    const from = caller.line - 1, to = Math.min(lines.length, from + (caller.loc || 1));
    let tryDepth = 0; // line-granular try-enclosure inside THIS caller's body
    for (let i = from; i < to && sites < MAX_SITES; i++) {
      const line = lines[i].replace(/(^|[^:])\/\/.*$/, '$1'); // strip line comments, keep ://
      const opens = (line.match(/\btry\s*\{/g) || []).length;
      const closes = (line.match(/\}\s*(?:catch|finally)\b/g) || []).length;
      if (!callRe.test(line)) { tryDepth = Math.max(0, tryDepth + opens - closes); continue; }
      sites++;
      let thenable = false;
      const d = destructureRe.exec(line);
      if (d) {
        for (const part of d[1].split(',')) {
          const name = part.trim().split(/[:=]/)[0].trim();
          if (name && !name.startsWith('...')) fields.add(name);
        }
      } else {
        const m = memberRe.exec(line);
        if (m) {
          if (PROMISE_PLUMBING.has(m[1])) thenable = true;
          else fields.add(m[1]);
        }
      }
      if (awaitRe.test(line) || thenable) awaited++;
      if (tryDepth > 0 || catchChainRe.test(line)) handlesErrors++;
      if (optChainRe.test(line) || coalesceRe.test(line) || nullCmpRe.test(line) || negatedRe.test(line)) nullChecked++;
      const a = argCount(line, label);
      if (a != null) {
        minArgs = minArgs == null ? a : Math.min(minArgs, a);
        maxArgs = maxArgs == null ? a : Math.max(maxArgs, a);
      }
      tryDepth = Math.max(0, tryDepth + opens - closes);
    }
  }
  if (!sites) return null;
  const out = { sites, awaited };
  if (fields.size) out.fields = [...fields].sort();
  if (minArgs != null) out.argRange = [minArgs, maxArgs];
  if (handlesErrors) out.handlesErrors = handlesErrors;
  if (nullChecked) out.nullChecked = nullChecked;
  const mutated = paramMutations(node, reader);
  if (mutated.length) out.mutatesParams = mutated;
  return out;
}

// v2 (Spec G): parameter-mutation hazard — the CALLEE writing through a named parameter means
// callers share that object. Body-line patterns only: `p.x =`, `p[..] =`, `Object.assign(p`,
// and the mutating array methods. No parameters or no source -> no claim.
const MUTATING_METHODS = 'push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';
function paramMutations(node, reader) {
  const params = node?.signature?.params || [];
  if (!params.length) return [];
  const lines = reader.linesOf(node.file);
  if (!lines) return [];
  const from = node.line - 1, to = Math.min(lines.length, from + (node.loc || 1));
  const mutated = new Set();
  for (const p of params) {
    const pe = escapeRe(p);
    const res = [
      new RegExp(`\\b${pe}\\s*(?:\\.[\\w$]+|\\[[^\\]]+\\])\\s*[+\\-*/]?=(?!=)`),
      new RegExp(`Object\\.assign\\(\\s*${pe}\\b`),
      new RegExp(`\\b${pe}\\s*(?:\\.[\\w$]+)*\\.(?:${MUTATING_METHODS})\\s*\\(`),
    ];
    for (let i = from; i < to; i++) {
      const line = lines[i].replace(/(^|[^:])\/\/.*$/, '$1');
      if (res.some((re) => re.test(line))) { mutated.add(p); break; }
    }
  }
  return [...mutated].sort();
}

/** One compact line for cards/hooks, or null when there is nothing worth saying. */
export function relianceLine(r) {
  if (!r) return null;
  const parts = [];
  if (r.fields?.length) parts.push(`callers use {${r.fields.join(', ')}} of the result — keep those`);
  if (r.awaited > 0) parts.push(`awaited ${r.awaited}/${r.sites}`);
  if (r.argRange) parts.push(`args ${r.argRange[0] === r.argRange[1] ? r.argRange[0] : `${r.argRange[0]}-${r.argRange[1]}`}`);
  if (r.handlesErrors) parts.push(`${r.handlesErrors} caller(s) handle errors from this — thrown types are contract`);
  if (r.nullChecked) parts.push(`${r.nullChecked} caller(s) null-check the result — keep null/undefined returns possible`);
  if (r.mutatesParams?.length) parts.push(r.mutatesParams.map((p) => `mutates its argument "${p}" — callers share that object`).join(' · '));
  return parts.length ? parts.join(' · ') : null;
}
