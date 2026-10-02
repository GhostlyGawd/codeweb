// Bounded JS binding inventory over aligned, executable source. No target execution or parser dependency.
// Curly extents retain lexical let/const scope; var uses its enclosing mapped function.
export function createLexicalBindings(code, ranges) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') starts.push(i + 1);
  const lineAt = (at) => {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid] <= at) lo = mid; else hi = mid; }
    return lo + 1;
  };
  const root = { start: 0, end: code.length, depth: 0, parent: null };
  const scopes = [], stack = [root];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') {
      const scope = { start: i, end: code.length, depth: stack.length, parent: stack.at(-1) };
      scopes.push(scope); stack.push(scope);
    } else if (code[i] === '}' && stack.length > 1) stack.pop().end = i;
  }
  const scopeAt = (at) => {
    let lo = 0, hi = scopes.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (scopes[mid].start <= at) lo = mid + 1; else hi = mid; }
    let scope = lo ? scopes[lo - 1] : root;
    while (scope.end < at && scope.parent) scope = scope.parent;
    return scope;
  };
  const bindings = new Map(), diagnostics = [];
  const insert = (binding) => {
    if (!bindings.has(binding.name)) bindings.set(binding.name, []);
    bindings.get(binding.name).push(binding);
  };
  const mappedDeclarations = new Set(ranges.map(r => `${r.start}:${r.name}`));
  const namesOf = (pattern) => {
    const tokens = [...pattern.matchAll(/\.\.\.|[A-Za-z_$][\w$]*|[^\s]/g)].map(m => m[0]); let i=0;
    const skipDefault = () => {
      const stack=[];
      while(i<tokens.length) {
        const t=tokens[i]; if(!stack.length && [',','}',']'].includes(t)) break;
        if(['(','{','['].includes(t))stack.push(t); else if([')','}',']'].includes(t))stack.pop(); i++;
      }
    };
    const binding = () => {
      if(tokens[i]==='...')i++;
      const first=tokens[i++]; const names=[];
      if(first==='{' || first==='[') {
        const close=first==='{'?'}':']';
        while(i<tokens.length && tokens[i]!==close) {
          if(tokens[i]===','){i++;continue;}
          if(first==='{' && tokens[i]!=='...') {
            const key=tokens[i++];
            if(tokens[i]===':'){i++;names.push(...binding());}
            else if(/^[A-Za-z_$][\w$]*$/.test(key))names.push(key);
            if(tokens[i]==='='){i++;skipDefault();}
          } else names.push(...binding());
          if(tokens[i]===',')i++;
        }
        if(tokens[i]===close)i++;
      } else if(/^[A-Za-z_$][\w$]*$/.test(first || '')) names.push(first);
      if(tokens[i]==='='){i++;skipDefault();}
      return names;
    };
    return binding();
  };
  const patternAt = (part) => {
    const start=/\S/.exec(part)?.index ?? part.length;
    if(!['{','['].includes(part[start]))return /^\s*([A-Za-z_$][\w$]*)/.exec(part);
    const stack=[];
    for(let i=start;i<part.length;i++) {
      if(['{','['].includes(part[i]))stack.push(part[i]);
      else if(['}',']'].includes(part[i])) {
        stack.pop();
        if(!stack.length)return [part.slice(0,i+1),part.slice(start,i+1)];
      }
    }
    return null;
  };
  // Split declarations only on top-level commas. Commas in objects, calls or patterns are not new bindings.
  for (const m of code.matchAll(/\b(const|let|var)\s+/g)) {
    const line = lineAt(m.index); let scope = scopeAt(m.index);
    if (m[1] === 'var') {
      const owner = ranges.filter(r => ['function','method'].includes(r.kind) && r.start <= line && r.end >= line)
        .sort((a,b) => b.start - a.start || a.end - b.end)[0];
      scope = owner ? { start: starts[owner.start - 1], end: starts[owner.end] ?? code.length,
        depth: scopeAt(starts[owner.start - 1]).depth + 1 } : root;
    }
    const pieces = []; let begin = m.index + m[0].length, braces = 0, parens = 0, brackets = 0, angles = 0;
    for (let i = begin; i <= code.length; i++) {
      const c = code[i], top = !braces && !parens && !brackets && !angles;
      if (top && (c === ',' || c === ';' || c === '}' || c === ')' || c === '\n' || c === undefined)) {
        pieces.push([begin, i]);
        if (c !== ',') break;
        begin = i + 1; continue;
      }
      if (c === '{') braces++; else if (c === '}') braces--;
      if (c === '(') parens++; else if (c === ')') parens--;
      if (c === '[') brackets++; else if (c === ']') brackets--;
      if (c === '<' && !angles) {
        const close = code.indexOf('>', i + 1);
        if (close >= 0 && !/[;=\n]/.test(code.slice(i + 1, close)) && /^\s*[=(]/.test(code.slice(close + 1))) angles++;
      } else if (c === '>' && angles) angles--;
    }
    for (const [begin,end] of pieces) {
      const part = code.slice(begin,end), match = patternAt(part);
      if (!match) { diagnostics.push({ code:'unsupported-binding-pattern', line:lineAt(begin) }); continue; }
      const pattern = match[1], simple = /^[A-Za-z_$][\w$]*$/.test(pattern);
      const tail = part.slice(match[0].length);
      const ref = /^\s*(?::[^=;]+)?=\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(tail);
      const afterRef = ref ? tail.slice(ref[0].length) : '';
      const alias = simple && m[1] === 'const' && ref && /^\s*$/.test(afterRef) ? ref[1] : null;
      for (const name of namesOf(pattern)) {
        if (mappedDeclarations.has(`${lineAt(begin)}:${name}`)) continue;
        const init = begin + match[0].length + (ref ? ref[0].length - ref[1].length : 0);
        const reference = ref?.[1]==='require' || (simple && /^\s*$/.test(afterRef)) ? ref?.[1] ?? null : null;
        insert({ name, scope, declaration:m.index, init, alias, reference, line:lineAt(begin), declarationKind:m[1] });
      }
    }
  }
  // Parameters of callbacks that have no mapped node still shadow outer declarations.
  const expressionEnd = (start) => {
    let parens=0, braces=0, brackets=0;
    for (let i=start; i<code.length; i++) {
      const c=code[i];
      if (!parens && !braces && !brackets && /[,;)\n\]}]/.test(c)) return i;
      if(c==='(')parens++; else if(c===')')parens--;
      if(c==='{')braces++; else if(c==='}')braces--;
      if(c==='[')brackets++; else if(c===']')brackets--;
    }
    return code.length;
  };
  const addParameters = (raw, body) => {
    const scope = { start:body, end:code[body]==='{' ? scopeAt(body).end : expressionEnd(body), depth:scopeAt(body).depth+1 };
    const parts=[]; let begin=0,depth=0;
    for(let i=0;i<=raw.length;i++){if(['{','[','('].includes(raw[i]))depth++; else if(['}',']',')'].includes(raw[i]))depth--; if(!depth&&(raw[i]===','||i===raw.length)){parts.push(raw.slice(begin,i));begin=i+1;}}
    for (const part of parts) {
      const match=patternAt(part.trim().replace(/^\.\.\./,'')); const pattern=match?.[1] || '';
      for (const name of namesOf(pattern)) insert({ name, scope, declaration:body, init:body, alias:null, reference:null, line:lineAt(body), declarationKind:'parameter' });
    }
  };
  for (const m of code.matchAll(/(\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/g)) {
    const raw=m[1].startsWith('(') ? m[1].slice(1,-1) : m[1]; addParameters(raw,m.index+m[0].length);
  }
  for (const m of code.matchAll(/\b(?:function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?|catch)\s*\(([^()]*)\)\s*(?:\:[^{]+)?(?=\{)/g))
    addParameters(m[1],m.index+m[0].length);
  // for-let/const bindings end with their loop, not the surrounding function.
  for (const list of bindings.values()) for (const b of list) {
    if (b.declarationKind === 'var') continue;
    const prefix = code.slice(Math.max(0, b.declaration - 80), b.declaration);
    if (!/\bfor\s*(?:await\s*)?\(\s*$/.test(prefix)) continue;
    const open = code.lastIndexOf('(', b.declaration); let end = open + 1, depth = 1;
    while (end < code.length && depth) { if (code[end] === '(') depth++; if (code[end] === ')') depth--; end++; }
    while (/\s/.test(code[end] || '') && end < code.length) end++;
    if (code[end] === '{') end = scopeAt(end).end;
    else { const semicolon = code.indexOf(';', end); end = semicolon < 0 ? code.length : semicolon; }
    b.scope = { start: open, end, depth: b.scope.depth + 1 };
  }
  const bindingAt = (name, at) => {
    const hits = (bindings.get(name) || []).filter(b => b.scope.start <= at && b.scope.end >= at);
    hits.sort((a,b) => b.scope.depth - a.scope.depth || b.declaration - a.declaration);
    return hits[0] || null;
  };
  return { starts, lineAt, scopeAt, bindingAt, diagnostics };
}
