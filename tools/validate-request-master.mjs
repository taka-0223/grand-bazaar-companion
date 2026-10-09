#!/usr/bin/env node
// Static Request Master regression test. Does not independently validate online gameplay facts.
// Run from repository root: node tools/validate-request-master.mjs
import {readFileSync} from 'node:fs';

function validateRequestMaster(master) {
  const errors = [], warnings = [];
  const req = master.requests || [];
  const meta = master.meta?.request_master || {};
  const ref = meta.reference_catalog || {};
  const wantedTypes = ['item_quantity','action_count','money_amount','check'];
  const ids = new Set(), indices = new Set(), pairs = new Set();
  const objTypes = Object.fromEntries(wantedTypes.map(x=>[x,0]));
  let altCount = 0, qualityCount = 0;
  const fail = message => errors.push(message);
  if(req.length !== 128) fail(`Expected 128 requests, got ${req.length}`);
  for (const r of req) {
    const loc=`#${r.index??'?'} ${r.id??'no-id'}`;
    if(!r.id || ids.has(r.id)) fail(`${loc}: missing or duplicate request ID`);
    if(!Number.isInteger(r.index) || indices.has(r.index)) fail(`${loc}: missing or duplicate numeric index`);
    if(!r.title || !r.requester || !r.reward || !r.objectiveText) fail(`${loc}: missing title/requester/reward/objectiveText`);
    ids.add(r.id); indices.add(r.index);
    const pair=`${r.requester}::${r.title}`;
    if(pairs.has(pair)) fail(`${loc}: duplicate title for same requester`);
    pairs.add(pair);
    if(r.detailStatus!=='audited_v2') fail(`${loc}: detailStatus not audited_v2`);
    if(r.provenance?.audit_version!==meta.audit_version) fail(`${loc}: provenance audit revision differs`);
    if(!['confirmed','probable'].includes(r.provenance?.confidence)) fail(`${loc}: confidence missing or unresolved`);
    if(!Array.isArray(r.objectives) || !r.objectives.length) fail(`${loc}: no objectives`);
    for(const [i,o] of (r.objectives || []).entries()){
      const at=`${loc}/objective[${i}]`;
      if(!wantedTypes.includes(o.type)) fail(`${at}: unexpected type ${o.type}`);
      else objTypes[o.type]++;
      if(!o.label || /指定された|指定の|特定の|必要な材料|詳細不明|未確定の/.test(o.label)) fail(`${at}: absent/abstract label`);
      if(!Number.isInteger(o.target)||o.target<1) fail(`${at}: invalid target`);
      if(o.current!==0) fail(`${at}: canonical current must be zero`);
      if(o.type==='check'&&o.target!==1) fail(`${at}: check requires target=1`);
      if(o.quality!==undefined){
        qualityCount++;
        if(![0.5,1,2,3,4,5].includes(o.quality)) fail(`${at}: invalid quality`);
      }
      if(o.alternatives!==undefined){
        altCount++;
        if(!Array.isArray(o.alternatives)||!o.alternatives.length) fail(`${at}: empty alternatives`);
        const names=(o.alternatives||[]).map(a=>a.label);
        if(names.some(x=>!x)||new Set(names).size!==names.length) fail(`${at}: unlabeled/duplicate alternatives`);
      }
      if(/（品質[0-9.]+）/.test(o.label||'') && o.quality===undefined && !(o.alternatives||[]).some(z=>z.quality!==undefined)) fail(`${at}: quality only in display label`);
    }
  }
  for(let i=1;i<=128;i++) if(!indices.has(i)) fail(`Missing request index ${i}`);
  if(new Set(req.map(x=>x.requester)).size!==38) fail('Requester count differs from 38');
  const expected={item_quantity:121, action_count:19, money_amount:3, check:12};
  for(const key of wantedTypes)if(objTypes[key]!==expected[key])fail(`Objective count ${key}: ${objTypes[key]}, expected ${expected[key]}`);
  const cat=new Map(Object.entries(ref.categories||{})), entity=new Map((ref.entities||[]).map(x=>[x.id,x]));
  if(entity.size!==(ref.entities||[]).length) fail('Duplicate reference entity IDs');
  const byId=new Map(req.map(x=>[x.id,x]));
  const bindings=ref.request_bindings||{};
  let nBound=0,nAltsBound=0;
  function checkId(id,where){
    if(!id || typeof id!=='string')return fail(`${where}: empty linked entity`);
    if(id.startsWith('reqref_')&&!entity.has(id))fail(`${where}: unknown internal reference entity ${id}`);
  }
  for(const [id,rows] of Object.entries(bindings)){
    const r=byId.get(id);
    if(!r){fail(`References for unknown request ${id}`);continue}
    const used=new Set();
    for(const b of rows){
      const where=`${id}/ref[${b.objectiveIndex}]`;
      if(used.has(b.objectiveIndex))fail(`${where}: duplicate binding`);
      used.add(b.objectiveIndex);
      const o=r.objectives?.[b.objectiveIndex];
      if(!o||o.type!=='item_quantity'){fail(`${where}: not an item objective`);continue}
      nBound++;
      if(b.entityId)checkId(b.entityId,where);
      if(b.category&&!cat.has(b.category))fail(`${where}: unknown category ${b.category}`);
      if(!b.entityId && !b.category && !(b.alternatives?.length))fail(`${where}: no resolvable item/category`);
      if(b.alternatives){
        if(b.alternatives.length!==(o.alternatives?.length||0))fail(`${where}: reference choices count differs`);
        const available=new Set((o.alternatives||[]).map(z=>z.label));
        for(const a of b.alternatives){
          nAltsBound++;
          checkId(a.entityId,where);
          if(!available.has(a.label))fail(`${where}: unknown alternative label ${a.label}`);
        }
      } else if(o.alternatives?.length)fail(`${where}: choices without reference choices`);
    }
  }
  for(const r of req)for(let i=0;i<r.objectives.length;i++)if(r.objectives[i].type==='item_quantity'&&!(bindings[r.id]||[]).some(b=>b.objectiveIndex===i))fail(`${r.id}: missing item binding ${i}`);
  for(const [name,c] of cat.entries())if(c.members){
    if(!c.members.length)fail(`Category ${name} has no members`);
    for(const id of c.members)checkId(id,`category ${name}`);
  }
  for(const [alias,canon] of Object.entries(ref.aliases||{}))if(![...entity.values()].some(e=>e.name_ja===canon))warnings.push(`Alias target outside local reference entities: ${alias}→${canon}`);
  if(nBound!==121)fail(`Expected 121 item bindings, got ${nBound}`);
  if(nAltsBound!==231)fail(`Expected 231 reference alternatives, got ${nAltsBound}`);
  if((ref.entities||[]).length!==184)fail('Reference entity count != 184');
  if(cat.size!==57)fail('Reference category count != 57');
  const mig=meta.player_state_migration||{};
  const cm=mig.counts||{};
  if(['unchanged_player_state','compatible_progress_preserve','special_migration','trigger_only'].reduce((sum,k)=>sum+(cm[k]||0),0)!==128)fail('Player-state migration coverage != 128');
  const miguel=byId.get('rqm_miguel_02');
  const required=['頑丈な石材（品質2）','頑丈な木材（品質2）','銀（品質2）'];
  if(JSON.stringify(miguel?.objectives?.map(o=>[o.label,o.target,o.quality]))!==JSON.stringify(required.map(t=>[t,1,2])))fail('Miguel repair materials regressed');
  if(mig.rules?.rqm_miguel_02?.strategy!=='binary_check_to_all_items')fail('Miguel player-state migration rule missing');
  if(mig.rules?.rqm_gw_125?.strategy!=='count_to_location_checks')fail('Lost chicken partial-progress migration rule missing');
  const copper=byId.get('rqm_felix_03')?.objectives?.[0];
  if(copper?.label!=='銅（品質3）'||copper.target!==10)fail('Felix copper quantity regressed');
  const iron=byId.get('rqm_gw_123')?.objectives?.[0];
  if(iron?.label!=='鉄鉱石（品質2）'||iron.target!==99)fail('Charles ore quantity regressed');
  const kevin=ref.request_bindings?.rqm_kevin_02?.[0]?.alternatives?.[0];
  if(kevin?.entityId!=='reqref_insect_c75ca848'||ref.aliases?.['ショウリュウバッタ']!=='ショウリョウバッタ')fail('Kevin bug name alias/reference regressed');
  const sherene=byId.get('rqm_gw_114');
  if(sherene?.provenance?.confidence!=='probable')warnings.push('Sherene #114 was reclassified; recheck conflicting evidence');
  return {ok:errors.length===0,summary:{requests:req.length,requesters:new Set(req.map(x=>x.requester)).size,objectives:Object.values(objTypes).reduce((a,b)=>a+b,0),objectiveTypes:objTypes,alternativesObjectives:altCount,topLevelQualityObjectives:qualityCount,alternativeOnlyQualityObjectives:req.flatMap(r=>r.objectives).filter(o=>o.quality===undefined&&(o.alternatives||[]).some(a=>a.quality!==undefined)).length,itemReferenceBindings:nBound,linkedAlternatives:nAltsBound,internalReferenceEntities:entity.size,referenceCategories:cat.size,confirmed:req.filter(x=>x.provenance?.confidence==='confirmed').length,probable:req.filter(x=>x.provenance?.confidence==='probable').length},errors,warnings};
}

const input=process.argv[2]||'index.html';
const html=readFileSync(input,'utf8');
const tag=html.match(/<script\b[^>]*\bid=["']MASTER_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
if(!tag)throw new Error('Embedded MASTER_DATA not found in '+input);
const report=validateRequestMaster(JSON.parse(tag[1]));
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exitCode=1;
