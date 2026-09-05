import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, runNode, tmpDir, cleanup } from './helpers.mjs';
const out=tmpDir('codeweb-clarity-site-');
after(()=>cleanup(out));
const read=p=>readFileSync(join(PLUGIN_ROOT,p),'utf8');
test('AC-14 built setup offers a labeled selector and canonical full-width recipes', async () => {
  const r=runNode(join(PLUGIN_ROOT,'site/build.mjs'),['--out',out]);
  assert.equal(r.status,0,r.stderr);
  const html=readFileSync(join(out,'start.html'),'utf8');
  assert.match(html,/<label[^>]+for="setup-client"/);
  assert.match(html,/<select[^>]+id="setup-client"/);
  const {clientRecipes}=await import('../scripts/lib/client-setup.mjs');
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  for (const recipe of clientRecipes) {
    assert.ok(html.includes(`value="${recipe.id}"`));
    assert.ok(html.includes(esc(recipe.content)),recipe.id);
  }
  assert.match(html,/class="setup-recipe"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/Copy recipe/);
  assert.match(html,/Source checkout alternative/);
  assert.match(html,/codeweb doctor/);
  assert.match(html,/does not (?:confirm|prove|establish) an editor connection/i);
  assert.match(html,/codeweb_callers/);
  const beforeSource=html.slice(0,html.indexOf('Source checkout alternative'));
  assert.doesNotMatch(beforeSource,/node scripts\//);
});
test('AC-14 setup copy reports failure and allows manual selection; styles preserve square readable controls', () => {
  const script=read('site/assets/setup.js');
  assert.match(script,/clipboard\.writeText/);
  assert.match(script,/Copied/);
  assert.match(script,/catch/);
  assert.match(script,/select.*copy|copy.*select/i);
  assert.match(read('site/styles.css'),/\.setup-recipe[\s\S]*white-space: pre-wrap/);
  assert.match(read('site/styles.css'),/:focus-visible/);
  assert.match(read('site/tokens.css'),/--fs-body: 16px/);
});

test('AC-14 client selection and copy feedback work with clipboard success and failure', async () => {
  const { runInNewContext } = await import('node:vm');
  let clipboardText, selectedText, focused = false;
  const selector = {value:'claude',addEventListener(type,fn){this[type]=fn;}};
  const panels=['claude','cursor','windsurf','gemini','codex'].map(id=>{
    const code={textContent:`recipe for ${id}`,parentElement:{focus(){focused=true;}}};
    const button={hidden:true,addEventListener(type,fn){this[type]=fn;}};
    const status={textContent:''};
    return {dataset:{setupClient:id},button,code,status,querySelector(selector){return selector==='pre code'?code:selector==='[role="status"]'?status:button;}};
  });
  const sandbox={
    document:{getElementById:()=>selector,querySelectorAll:()=>panels,createRange:()=>({selectNodeContents(code){selectedText=code.textContent;}})},
    navigator:{clipboard:{async writeText(text){clipboardText=text;}}},
    window:{getSelection:()=>({removeAllRanges(){},addRange(){}})},
  };
  runInNewContext(read('site/assets/setup.js'),sandbox);
  assert.equal(panels.filter(p=>!p.hidden).length,1);
  assert.equal(panels[0].hidden,false);
  for (const panel of panels) {
    selector.value=panel.dataset.setupClient;selector.change();
    assert.equal(panels.filter(p=>!p.hidden).length,1);
    assert.equal(panel.hidden,false);
    assert.equal(panel.button.hidden,false);
    await panel.button.click();
    assert.equal(clipboardText,panel.code.textContent);
    assert.match(panel.status.textContent,/Copied/);
  }
  sandbox.navigator.clipboard.writeText=async()=>{throw new Error('denied');};
  await panels[4].button.click();
  assert.match(panels[4].status.textContent,/copy it manually/);
  assert.equal(selectedText,panels[4].code.textContent);
  assert.equal(focused,true);
});

test('site builds the supporting live map from the current demo graph with traceable nodes and edges', () => {
  const r=runNode(join(PLUGIN_ROOT,'site/build.mjs'),['--out',out]);
  assert.equal(r.status,0,r.stderr);
  const script=readFileSync(join(out,'assets/livemap.js'),'utf8');
  const data=JSON.parse(/var DATA = (\{[^\n]+\});/.exec(script)[1]);
  const graph=JSON.parse(read('docs/demo/axios.graph.json'));
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  assert.equal(data.nodes.length,Math.min(70,graph.nodes.length));
  for (const n of data.nodes) {
    assert.ok(nodes.has(n.id),n.id);
    assert.equal(n.l,nodes.get(n.id).label);
    assert.equal(n.f,nodes.get(n.id).file);
    assert.equal(data.domains[n.d],nodes.get(n.id).domain);
  }
  const edges=new Set(graph.edges.map(e=>`${e.from}\0${e.to}`));
  for (const [from,to] of data.edges) assert.ok(edges.has(`${data.nodes[from].id}\0${data.nodes[to].id}`));
  for (const label of ['merge','AxiosError','httpAdapter']) assert.ok(data.nodes.some(n=>n.l===label),label);
  assert.match(script,/within this displayed subset/);
});
