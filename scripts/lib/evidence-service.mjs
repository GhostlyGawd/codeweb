// Shared evidence orchestration for explicit CLI/MCP modes. Never mutates graph baselines.
import { realpathSync } from 'node:fs';
import { relative, resolve, dirname, basename, join } from 'node:path';
import { createReceipt, reconcileReceipt, hash, projectGraph, EvidenceError } from './evidence-core.mjs';
import { captureSnapshot } from './evidence-snapshot.mjs';
import { putRecord, readRecord, pageRecord, summarizeReceipt, summarizeResult, boundedError } from './evidence-store.mjs';
import { resolveSymbol } from './graph-ops.mjs';
import { checkStaleness } from './cli.mjs';

function rootOf(graph) {
  if(typeof graph?.meta?.root !== 'string' || !graph.meta.root) throw new EvidenceError('source-unavailable');
  try { return realpathSync(graph.meta.root); } catch { throw new EvidenceError('source-unavailable'); }
}
const analysisErrors = new Set(['analysis-incompatible','source-unavailable','source-changing','unsupported-source-layout','unsupported-engine','target-unresolved','extraction-incomplete','invalid-witness']);
function failure(error,args,receipt=null) {
  const code=error?.code || 'evidence-unavailable';
  const e=boundedError(error,{task:args.task,receiptId:args.evidenceReceipt});
  if(analysisErrors.has(code)) e.state='inconclusive';
  if(receipt) e.questionCounts={needsRecheck:receipt.questions.length};
  return e;
}
export async function evidenceContext(graphPath,graph,args) {
  let snapshot;
  try {
    const root=rootOf(graph);
    if(args.captureEvidence) {
      snapshot=await captureSnapshot(root);
      const receipt=createReceipt(snapshot,{task:args.task,symbol:args.symbol,graphRelativePath:relative(root,join(realpathSync(dirname(resolve(graphPath))),basename(graphPath))).replaceAll('\\','/')});
      const id=hash(receipt);
      const payload=summarizeReceipt(receipt,id); // envelope feasibility before any publication
      payload.savedGraphProvenance={engine:graph.meta?.engine ?? null};
      if(Buffer.byteLength(JSON.stringify(payload))>8192) throw new EvidenceError('summary-too-large');
      await putRecord(graphPath,'receipts',receipt);
      return {payload,code:0};
    }
    const receipt=await readRecord(graphPath,'receipts',args.evidenceReceipt,{task:args.task,root});
    if(args.symbol!==receipt.query.selector && args.symbol!==receipt.target.id) throw new EvidenceError('wrong-selector');
    const record=args.evidenceResult ? await readRecord(graphPath,'results',args.evidenceResult,{task:args.task,root,receiptId:args.evidenceReceipt}) : receipt;
    const payload=pageRecord(record,{receiptId:args.evidenceReceipt,resultId:args.evidenceResult,task:args.task,section:args.evidenceSection,offset:args.evidenceOffset ?? 0});
    return {payload,code:0};
  } catch(error) {
    const payload=failure(error,args);
    if(error?.code==='ambiguous-target' && snapshot) {
      const ids=resolveSymbol(snapshot.graph,args.symbol); payload.matchedCount=ids.length; payload.suggestions=[];
      for(const id of ids.slice(0,8)) {
        const next={...payload,suggestions:[...payload.suggestions,id],omittedSuggestions:ids.length-payload.suggestions.length-1};
        if(Buffer.byteLength(JSON.stringify(next))<=8192) payload.suggestions.push(id);
      }
      payload.omittedSuggestions=ids.length-payload.suggestions.length;
    }
    if(error?.code==='target-not-found') {payload.found=false;return {payload,code:1};}
    return {payload,code:2};
  }
}
export async function evidenceReview(graphPath,graph,args) {
  let receipt;
  try {
    const root=rootOf(graph);
    receipt=await readRecord(graphPath,'receipts',args.evidenceReceipt,{task:args.task,root});
    const snapshot=await captureSnapshot(root);
    const record=reconcileReceipt(receipt,snapshot,{legacyGraph:graph});
    const id=hash(record);
    const summary=summarizeResult(record,args.evidenceReceipt,id);
    summary.legacyReviewBefore=args.beforeGraph ? {path:args.beforePath,digest:hash(projectGraph(args.beforeGraph,undefined,args.beforeGraph.meta?.profile ?? null))} : null;
    // Reserve the live advisory before publication; an unrenderable summary must not hide a stored result.
    const stale=checkStaleness(graph);
    summary.legacyReviewFreshness=stale ? 'stale' : Object.keys(graph.meta?.sources || {}).length ? 'unchanged-stamps' : 'unknown';
    if(Buffer.byteLength(JSON.stringify(summary))>8192) throw new EvidenceError('summary-too-large');
    try { await putRecord(graphPath,'results',record); }
    catch(error) {
      const unavailable={...failure(error,args,receipt),persistence:'not-persisted',computedState:record.state,
        computedSummary:{relations:summary.relations,deltas:summary.deltas,questions:summary.questions,
          targetEvidenceChanged:record.targetEvidenceChanged,inputsChanged:record.inputsChanged}};
      // Counts are bounded primitives; keep this check if future schemas add larger metadata.
      return Buffer.byteLength(JSON.stringify(unavailable))<=8192 ? unavailable : failure(new EvidenceError('summary-too-large'),args);
    }
    return summary;
  } catch(error) { return failure(error,args,receipt); }
}
export function renderEvidence(payload) {
  const lines=[`evidence: ${payload.state}${payload.code ? ' ('+payload.code+')' : ''}`];
  if(payload.receiptId) lines.push(`receipt: ${payload.receiptId}`);
  if(payload.resultId) lines.push(`result: ${payload.resultId}`);
  if(payload.section) lines.push(`${payload.section}: ${payload.total} total; ${payload.remaining} remaining${payload.nextOffset==null?'':'; next offset '+payload.nextOffset}`);
  if(payload.baseline?.profile) lines.push(`evidence profile: ${payload.baseline.profile}`);
  if(payload.savedGraphProvenance) lines.push(`saved graph provenance: ${JSON.stringify(payload.savedGraphProvenance)}`);
  if(payload.persistence) lines.push(`persistence: ${payload.persistence}; computed state: ${payload.computedState}`);
  if(payload.computedSummary) lines.push(`computed summary (not persisted): ${JSON.stringify(payload.computedSummary)}`);
  if(payload.target) lines.push(`target: ${payload.target.id} (${payload.target.file}:${payload.target.line})`);
  if(payload.inputsChanged!==undefined) lines.push(`inputs changed: ${payload.inputsChanged}; target evidence changed: ${payload.targetEvidenceChanged}`);
  if(payload.legacyReviewBefore!==undefined) lines.push(`legacy review before: ${JSON.stringify(payload.legacyReviewBefore)}`);
  if(payload.sections) lines.push(`sections: ${JSON.stringify(payload.sections)}`);
  if(payload.questionCounts || payload.questions) lines.push(`questions: ${JSON.stringify(payload.questionCounts || payload.questions)}`);
  if(payload.deltas) lines.push(`changed relationships: ${JSON.stringify(payload.deltas)}`);
  if(payload.sameGraphAsEvidence===false) lines.push('The legacy structural verdict was not recomputed on this private evidence snapshot.');
  if(payload.historical) lines.push('Historical evidence page; not a claim of current source currency.');
  if(payload.items) for(const item of payload.items) lines.push(JSON.stringify(item));
  for(const step of payload.nextSteps || []) lines.push(step);
  return lines.join('\n');
}
