// Evidence-only argument contracts shared by CLI and MCP. No runtime analysis imports.
const OWN = (o,k) => Object.hasOwn(o,k) && o[k] !== undefined;
export const EVIDENCE_KEYS = ['captureEvidence','task','evidenceReceipt','evidenceResult','evidenceSection','evidenceOffset'];
export const hasEvidenceArguments = (a) => EVIDENCE_KEYS.some(k=>OWN(a,k));
export function validateEvidenceArgs(tool,a) {
  if (!hasEvidenceArguments(a)) return null;
  if (typeof a.task !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(a.task)) return 'evidence requires task: 1–64 ASCII letters, digits, underscores or hyphens';
  for (const k of ['evidenceReceipt','evidenceResult']) if (OWN(a,k) && (typeof a[k] !== 'string' || !/^[a-f0-9]{64}$/.test(a[k]))) return `${k} must be a lowercase SHA-256 record ID`;
  if (tool === 'codeweb_review') {
    if (!OWN(a,'evidenceReceipt')) return 'review task requires evidenceReceipt';
    if (['captureEvidence','evidenceResult','evidenceSection','evidenceOffset'].some(k=>OWN(a,k))) return 'review accepts only evidenceReceipt and task evidence arguments';
    if (typeof a.changed !== 'string' || !a.changed.trim() || OWN(a,'range')) return 'evidence review requires changed and does not accept range';
    return null;
  }
  if (['full','bodies','window','limit'].some(k=>OWN(a,k))) return 'evidence mode does not accept full, bodies, window or limit; use an ordinary context request for source bodies';
  if (OWN(a,'captureEvidence')) {
    if (a.captureEvidence !== true) return 'captureEvidence must be true when supplied';
    if (['evidenceReceipt','evidenceResult','evidenceSection','evidenceOffset'].some(k=>OWN(a,k))) return 'capture and historical page modes are mutually exclusive';
  } else {
    if (!OWN(a,'evidenceReceipt')) return 'historical page requires evidenceReceipt';
    const sections = OWN(a,'evidenceResult') ? ['added','removed','witnessChanged','questions'] : ['callers','callees','impact','questions'];
    if (!sections.includes(a.evidenceSection)) return `evidenceSection must be one of ${sections.join(', ')}`;
    if (OWN(a,'evidenceOffset') && (!Number.isSafeInteger(a.evidenceOffset) || a.evidenceOffset<0)) return 'evidenceOffset must be a non-negative safe integer';
  }
  return null;
}
export function evidenceCliArgs(a) {
  const out=[];
  if (a.captureEvidence===true) out.push('--capture-evidence');
  for (const [key,flag] of [['task','--task'],['evidenceReceipt','--receipt'],['evidenceResult','--result'],['evidenceSection','--section'],['evidenceOffset','--offset']]) if (OWN(a,key)) out.push(flag,String(a[key]));
  return out;
}
export function evidenceArgsFromCli(opts) {
  const out={};
  for(const [flag,key] of [['capture-evidence','captureEvidence'],['task','task'],['receipt','evidenceReceipt'],['result','evidenceResult'],['section','evidenceSection'],['offset','evidenceOffset']]) {
    if(opts[flag]!==undefined) out[key]=flag==='offset' ? (/^\d+$/.test(opts[flag]) ? Number(opts[flag]) : NaN) : opts[flag];
  }
  return out;
}
