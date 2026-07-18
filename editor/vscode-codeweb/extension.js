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
  try { st = fs.statSync(graphPath); } catch { return null; }
  const hit = graphCache.get(graphPath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.index;
  try {
    const index = buildLensIndex(JSON.parse(fs.readFileSync(graphPath, 'utf8')));
    graphCache.set(graphPath, { mtimeMs: st.mtimeMs, size: st.size, index });
    return index;
  } catch { return null; }
}

class CodewebLensProvider {
  provideCodeLenses(doc) {
    const cfg = vscode.workspace.getConfiguration('codeweb');
    if (!cfg.get('lens.enabled', true)) return [];
    const graphPath = findGraph(path.dirname(doc.uri.fsPath));
    if (!graphPath) return [];
    const index = loadIndex(graphPath);
    if (!index || !index.root) return [];
    const rel = path.relative(index.root, doc.uri.fsPath).split(path.sep).join('/');
    if (rel.startsWith('..')) return [];
    return lensesForFile(index, rel, { minCallers: cfg.get('lens.minCallers', 0) }).map((l) =>
      new vscode.CodeLens(new vscode.Range(l.line - 1, 0, l.line - 1, 0), {
        title: `${l.callers} caller${l.callers === 1 ? '' : 's'} · blast ${l.blast}`,
        tooltip: `codeweb: ${l.id} — click to open in the interactive report`,
        command: 'codeweb.openReport',
        arguments: [graphPath, l.id],
      })
    );
  }
}

function activate(context) {
  const selector = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'rust', 'go', 'java', 'csharp']
    .map((language) => ({ language, scheme: 'file' }));
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, new CodewebLensProvider()),
    vscode.commands.registerCommand('codeweb.openReport', (graphPath, id) => {
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
