#!/usr/bin/env node
// Read-only integration inventory, not a gameplay truth test.
// "No direct references" means no explicit MASTER.domain access in inline app JS.
// It does NOT mean there are no similar features or that dynamic access is impossible.
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const dataTag=html.match(/<script\b[^>]*\bid=["']MASTER_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
if(!dataTag)throw new Error('Could not find embedded MASTER_DATA');
const runtimeMaster=JSON.parse(dataTag[1]);
const master=JSON.parse(readFileSync('data/board-master.full.v1.json','utf8'));
const start=html.indexOf('const MASTER=JSON.parse');
if(start<0)throw new Error('Could not find application bootstrap');
const runtimeJs=html.slice(start);
const domains=Object.keys(master).filter(k=>Array.isArray(master[k])).sort();
const lines=domains.map(domain=>{
  const pattern=new RegExp('\\bMASTER\\.'+domain.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g');
  const occurrences=[...runtimeJs.matchAll(pattern)];
  return {
    domain,
    records:master[domain].length,
    direct_references:occurrences.length,
    explicit_app_access:occurrences.length>0,
  };
});
const direct=lines.filter(x=>x.explicit_app_access);
const disconnected=lines.filter(x=>!x.explicit_app_access);
const concreteIntegrationHints={
  legacy_cooking_recipe_source:'window.recipes -> RECIPE_ROWS (ingredients/recipe display)',
  legacy_processing_source:'window.processed_goods -> PROCESS_ROWS (processing/chain display)',
  cooking_effect_source:'MASTER.cooking_recipes.effect_id -> MASTER.cooking_effects',
  requests_source:'MASTER.requests (with player-state migration)',
  calendar_source:'CAL_BIRTHDAYS and festivalMap() are inline JavaScript, not standalone Master datasets',
  request_references:'MASTER.meta.request_master.reference_catalog is embedded; no runtime code reads it directly',
};
const result={
  audit_kind:'static_literal_access_only',
  master_meta_status:master.meta?.status??null,
  embedded_runtime_master_domains:Object.keys(runtimeMaster),
  full_master_source:'data/board-master.full.v1.json',
  master_domains:lines.length,
  directly_accessed_domains:direct.length,
  not_directly_accessed_domains:disconnected.length,
  total_records:lines.reduce((n,x)=>n+x.records,0),
  domain_details:lines,
  concrete_integration_hints:concreteIntegrationHints,
};
console.log(JSON.stringify(result,null,2));
