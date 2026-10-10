import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {projectRuntimeMaster,RUNTIME_MASTER_KEYS} from '../lib/runtime-master-projection.mjs';

const html=readFileSync('index.html','utf8');
const full=JSON.parse(readFileSync('data/board-master.full.v1.json','utf8'));
const dataTag=html.match(/<script id="MASTER_DATA" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(dataTag,'Inline MASTER_DATA missing');
const runtime=JSON.parse(dataTag[1]);

test('runtime Master is the exact reproducible projection of canonical full Master',()=>{
  assert.deepStrictEqual(runtime,projectRuntimeMaster(full));
  assert.deepStrictEqual(Object.keys(runtime),RUNTIME_MASTER_KEYS);
});
test('requests, migration rules, plant and crop facts are retained verbatim',()=>{
  assert.equal(full.requests.length,128);
  assert.deepStrictEqual(runtime.requests,full.requests);
  assert.deepStrictEqual(runtime.entities,full.entities);
  assert.deepStrictEqual(runtime.facts,full.facts);
  assert.deepStrictEqual(runtime.meta.request_master.player_state_migration,
    full.meta.request_master.player_state_migration);
  assert.equal(runtime.meta.request_master.audit_version,full.meta.request_master.audit_version);
});
test('cooking effect labels and recipe effect IDs are identical',()=>{
  assert.equal(runtime.cooking_recipes.length,266);
  assert.deepStrictEqual(runtime.cooking_effects,full.cooking_effects);
  assert.deepStrictEqual(runtime.cooking_recipes,full.cooking_recipes.map(x=>({id:x.id,effect_id:x.effect_id})));
  assert.equal(new Set(runtime.cooking_recipes.map(x=>x.id)).size,266);
});
test('dormant domains stay available in the canonical Master but not startup',()=>{
  for(const domain of ['windmill_recipes','windmill_items','resource_items','animals','flowers','cooking_groups']){
    assert.ok(full[domain]?.length,domain+' missing in canonical Master');
    assert.equal(Object.hasOwn(runtime,domain),false,domain+' should not load during startup');
  }
  assert.ok(Buffer.byteLength(html,'utf8')<650000,'Startup HTML grew unexpectedly');
});
test('all explicit app Master references resolve, and inline JS is syntactically valid',()=>{
  const start=html.indexOf('const MASTER=JSON.parse');
  assert.ok(start>=0);
  const js=html.slice(start,html.indexOf('</script>',start));
  for(const m of js.matchAll(/\bMASTER\.([a-zA-Z_][a-zA-Z0-9_]*)/g))
    assert.ok(Object.hasOwn(runtime,m[1]),'Unprojected Master reference: '+m[1]);
  new Script(js);
});
test('Player State, offline cache and request spoiler guards remain in place',()=>{
  const worker=readFileSync('sw.js','utf8');
  assert.ok(worker.includes("const CORE=['./','./index.html'"));
  assert.ok(!worker.includes('board-master.full.v1.json'));
  assert.ok(html.includes("const STORAGE='gb-board-data'"));
  assert.ok(html.includes("function requestMasterMatches"));
  assert.ok(html.includes("if(!rq)return[]"));
});
