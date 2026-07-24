'use strict';
// codeweb CodeLens — "76 callers · blast 242" above every mapped symbol, served straight from
// the nearest .codeweb/graph.json (the same walk-up discovery the MCP server uses). Zero
// dependencies, no build step: the answers already exist in the graph; this just puts them
// where people already look. Click-through opens the interactive report at the symbol
// (#s=<id> deep link).

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { buildLensIndex, lensesForFile } = require('./lens-core');

const graphCache = new Map(); // graphPath -> { mtimeMs, size, index }

/** Nearest .codeweb/graph.json at or above dir (the MCP server's discovery rule). */
function findGraph(dir) {
  let cur = dir;
  for (;;) {
    const cand = path.join(cur, '.codeweb', 'graph.json');
    if (fs.existsSync(cand)) return cand;
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

function loadIndex(graphPath) {
  let st;
  try { st = fs.statSync(graphPath); } catch { graphCache.delete(graphPath); return null; }
  const hit = graphCache.get(graphPath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.index;
  try {
    // #38: hand the previous index to buildLensIndex so the unchanged symbols' blast radii carry
    // across the rebuild (memo persistence) instead of every closure recomputing from scratch.
    const index = buildLensIndex(JSON.parse(fs.readFileSync(graphPath, 'utf8')), hit && hit.index);
    graphCache.set(graphPath, { mtimeMs: st.mtimeMs, size: st.size, index });
    return index;
  } catch { return null; }
}

class CodewebLensProvider {
  // #7 (IMPROVEMENTS.md): the README promised "re-reads the graph on change" but nothing ever
  // re-invoked the provider — lenses showed yesterday's numbers until the file was reopened.
  // A FileSystemWatcher on **/.codeweb/graph.json fires this emitter (debounced), and VS Code
  // re-renders every visible lens.
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this._emitter.event;
  }
  // #38: refresh no longer clears graphCache. loadIndex detects the graph.json mtime/size change
  // and rebuilds on the next provideCodeLenses, carrying the blastMemo entries the edge delta
  // leaves untouched (buildLensIndex(graph, prevIndex)); a stale entry for a deleted graph is
  // dropped by loadIndex's stat-failure path. Clearing here would throw that memo away every save.
  refresh() { this._emitter.fire(); }
  dispose() { this._emitter.dispose(); }

  provideCodeLenses(doc) {
    const cfg = vscode.workspace.getConfiguration('codeweb');
    if (!cfg.get('lens.enabled', true)) return [];
    const graphPath = findGraph(path.dirname(doc.uri.fsPath));
    if (!graphPath) return [];
    const index = loadIndex(graphPath);
    if (!index || !index.root) return [];
    const rel = path.relative(index.root, doc.uri.fsPath).split(path.sep).join('/');
    if (rel.startsWith('..')) return [];
    // RETENTION R9: the lens presents map-time numbers — its tooltip says WHEN that was, so a
    // week-old count is never mistaken for a live one. One stat per render, fail-open.
    let mapped = '';
    try {
      const days = Math.floor((Date.now() - fs.statSync(graphPath).mtimeMs) / 86400000);
      mapped = ` · mapped ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'}`;
    } catch { /* age is best-effort */ }
    return lensesForFile(index, rel, { minCallers: cfg.get('lens.minCallers', 0) }).map((l) =>
      new vscode.CodeLens(new vscode.Range(l.line - 1, 0, l.line - 1, 0), {
        title: `${l.callers} caller${l.callers === 1 ? '' : 's'} · blast ${l.blast}`,
        tooltip: `codeweb: ${l.id}${mapped} — blast = symbols affected if this changes. Click to open the report. Re-map: npx -y @ghostlygawd/codeweb .`,
        command: 'codeweb.openReport',
        arguments: [graphPath, l.id],
      })
    );
  }
}

function activate(context) {
  // All 11 native engine languages (extract-symbols SRC list) — the selector previously stopped at
  // nine, so Ruby/PHP/Kotlin/Swift symbols in the graph never got lenses (#7).
  const selector = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'rust', 'go', 'java', 'csharp', 'ruby', 'php', 'kotlin', 'swift']
    .map((language) => ({ language, scheme: 'file' }));
  const provider = new CodewebLensProvider();
  // Re-render lenses whenever any mapped graph is rebuilt (pipeline, codeweb_refresh, post-edit
  // hook). Debounced: a refresh writes graph.json + sidecars back-to-back.
  const watcher = vscode.workspace.createFileSystemWatcher('**/.codeweb/graph.json');
  let pending = null;
  const kick = () => { if (pending) clearTimeout(pending); pending = setTimeout(() => { pending = null; provider.refresh(); }, 250); };
  watcher.onDidChange(kick); watcher.onDidCreate(kick); watcher.onDidDelete(kick);
  context.subscriptions.push(
    provider,
    watcher,
    vscode.languages.registerCodeLensProvider(selector, provider),
    vscode.commands.registerCommand('codeweb.refreshLenses', () => provider.refresh()),
    vscode.commands.registerCommand('codeweb.openReport', (graphPath, id) => {
      // MICROCOPY A8: from the Command Palette there are no arguments — say what supplies them
      // instead of falling over on path.dirname(undefined).
      if (!graphPath) {
        vscode.window.showInformationMessage('codeweb: this command needs a symbol — open a mapped file and click a codeweb lens.');
        return;
      }
      const report = path.join(path.dirname(graphPath), 'report.html');
      if (!fs.existsSync(report)) {
        vscode.window.showInformationMessage(`codeweb: no report.html beside ${graphPath} — build one with the codeweb pipeline (run.mjs).`);
        return;
      }
      vscode.env.openExternal(vscode.Uri.file(report).with({ fragment: `s=${id}` }));
    })
  );
}

function deactivate() { graphCache.clear(); }

module.exports = { activate, deactivate };
