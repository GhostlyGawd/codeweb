import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const fileOf = id => id.split(':').slice(0,-1).join(':');
function cwDeps(graph, sym){
  const out = execFileSync('node',['scripts/query.mjs',graph,'--dependents',sym,'--json'],{encoding:'utf8',maxBuffer:1<<28});
  const j = JSON.parse(out); const arr = j.dependents||j.results||[];
  return arr.map(x=>x.id||x);
}
function grade(name, truth, cw){
  const T=new Set(truth), C=new Set(cw);
  const symHit=[...T].filter(x=>C.has(x)).length;
  const TF=new Set(truth.map(fileOf)), CF=new Set(cw.map(fileOf));
  const fileHit=[...TF].filter(x=>CF.has(x)).length;
  console.log(`\n== ${name} ==  truthN=${T.size} cwN=${C.size}`);
  console.log(`SYMBOL recall=${(symHit/T.size).toFixed(2)} (${symHit}/${T.size})  prec=${(symHit/C.size).toFixed(2)} (${symHit}/${C.size})`);
  console.log(`FILE   recall=${(fileHit/TF.size).toFixed(2)} (${fileHit}/${TF.size})  prec=${(fileHit/CF.size).toFixed(2)} (${fileHit}/${CF.size})`);
  console.log(`cw extra (false+): ${[...C].filter(x=>!T.has(x)).slice(0,12).join(', ')||'none'}`);
  console.log(`cw missed (false-): ${[...T].filter(x=>!C.has(x)).slice(0,15).join(', ')}`);
}
const go = JSON.parse(readFileSync('paper/experiments/phase1/truth.go-route.json'));
const rs = JSON.parse(readFileSync('paper/experiments/phase1/truth.rust-escape.json'));
grade('GO route.go:Route', go.truth, cwDeps('.codeweb/phase1/gorilla-mux.json','route.go:Route'));
grade('RUST escape', rs.truth, cwDeps('.codeweb/phase1/ripgrep.json','crates/cli/src/escape.rs:escape'));
