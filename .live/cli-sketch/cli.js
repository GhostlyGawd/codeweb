// PROPOSED shared CLI module for ecc/scripts (proof-of-concept; lives in codeweb, not yet in the target).
// Zero dependencies. Replaces the ~1,800 LOC of hand-rolled parseArgs/usage/showHelp across 37 scripts
// with one declarative flag spec per script. Read-only over argv.
//
// spec = {
//   name, summary, usage?,                      // for help text
//   onUnknown?: 'error' | 'ignore' | 'collect', // unknown --flag: throw / skip / push to _  (default 'error')
//   flags: {
//     '<name>': {                               // key may be 'json' or '--json'
//       type?: 'boolean'|'string'|'number',     // default 'boolean'
//       alias?: '-x',                           // short flag
//       dest?: 'outKey',                         // output property (default camelCase of name)
//       value?: any,                            // default (booleans->false, many->[])
//       min?: number,                           // numeric lower bound; out-of-range keeps default
//       many?: boolean,                         // collect repeats into an array
//       help?: string,
//     }
//   }
// }

const camel = (s) => s.replace(/^-+/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const flagOf = (name) => (name.startsWith('-') ? name : '--' + name);

export function parseArgs(spec, argv = process.argv) {
  const args = argv.slice(2);
  const byFlag = new Map();
  const defs = [];
  for (const [name, f] of Object.entries(spec.flags || {})) {
    const def = { flag: flagOf(name), dest: f.dest || camel(name), type: f.type || 'boolean', ...f };
    defs.push(def);
    byFlag.set(def.flag, def);
    if (f.alias) byFlag.set(f.alias, def);
  }
  const out = { help: false, _: [] };
  for (const d of defs) out[d.dest] = d.many ? (d.value ?? []) : d.type === 'boolean' ? (d.value ?? false) : (d.value ?? null);

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    const f = byFlag.get(a);
    if (!f) {
      const policy = spec.onUnknown || 'error';
      if (a.startsWith('-')) {
        if (policy === 'error') throw new Error(`Unknown argument: ${a}`);
        if (policy === 'collect') out._.push(a);
        // 'ignore' -> drop
      } else {
        out._.push(a); // positionals always collected
      }
      continue;
    }
    if (f.type === 'boolean') { out[f.dest] = true; continue; }
    const raw = args[++i];
    let val = raw;
    if (f.type === 'number') { const n = Number(raw); val = Number.isFinite(n) && (f.min == null || n >= f.min) ? n : out[f.dest]; }
    if (f.many) out[f.dest].push(val); else out[f.dest] = val;
  }
  return out;
}

export function renderHelp(spec) {
  const lines = [`Usage: ${spec.name} ${spec.usage || '[options]'}`, ''];
  if (spec.summary) lines.push(spec.summary, '');
  lines.push('Options:');
  const rows = Object.entries(spec.flags || {}).map(([name, f]) => {
    const arg = f.type && f.type !== 'boolean' ? ` <${f.dest || camel(name)}>` : '';
    return [(f.alias ? `${f.alias}, ` : '') + flagOf(name) + arg, f.help || ''];
  });
  rows.push(['-h, --help', 'Show this help']);
  const w = Math.max(...rows.map((r) => r[0].length));
  for (const [l, h] of rows) lines.push('  ' + l.padEnd(w + 2) + h);
  return lines.join('\n');
}
