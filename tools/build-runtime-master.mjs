#!/usr/bin/env node
// Generate or verify the inline, offline-safe runtime Master projection.
// Run from repository root:
//   node tools/build-runtime-master.mjs --write
//   node tools/build-runtime-master.mjs --check
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {projectRuntimeMaster} from '../lib/runtime-master-projection.mjs';

const canonicalPath='data/board-master.full.v1.json';
const htmlPath='index.html';
const full=JSON.parse(readFileSync(canonicalPath,'utf8'));
const projected=projectRuntimeMaster(full);
const html=readFileSync(htmlPath,'utf8');
const tag=/(<script id="MASTER_DATA" type="application\/json">)([\s\S]*?)(<\/script>)/;
const existing=html.match(tag);
if(!existing)throw new Error('MASTER_DATA not found in index.html');
const start=html.indexOf('const MASTER=JSON.parse');
if(start<0)throw new Error('Cannot locate inline application bootstrap');
const app=html.slice(start,html.indexOf('</script>',start));
const accesses=[...app.matchAll(/\bMASTER\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map(x=>x[1]);
const missing=[...new Set(accesses)].filter(k=>!Object.hasOwn(projected,k));
if(missing.length)throw new Error('Missing projected MASTER accesses: '+missing.join(', '));
const encoded=JSON.stringify(projected).replace(/</g,'\\u003c');
if(process.argv.includes('--write')){
  writeFileSync(htmlPath,html.replace(tag,(_all,open,_old,close)=>open+encoded+close));
}else if(process.argv.includes('--check')){
  assert.deepStrictEqual(JSON.parse(existing[2]),projected,
    'Runtime Master is stale; run node tools/build-runtime-master.mjs --write');
}else{
  throw new Error('Use --write or --check');
}
console.log(JSON.stringify({
  mode:process.argv.includes('--write')?'write':'check',
  full_master_bytes:Buffer.byteLength(JSON.stringify(full),'utf8'),
  runtime_master_bytes:Buffer.byteLength(encoded,'utf8'),
  inline_bytes_before:Buffer.byteLength(existing[2],'utf8'),
  runtime_keys:Object.keys(projected),
  requests:projected.requests.length,recipes:projected.cooking_recipes.length
},null,2));
