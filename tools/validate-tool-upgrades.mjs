#!/usr/bin/env node
// Static validation. Gameplay details remain sourced to the catalog's recorded references.
import {readFileSync} from 'node:fs';
import {planToolUpgrade,getDiscoveredUpgrade} from '../lib/tool-upgrade-plan.mjs';

const errors=[], warnings=[];
const assert=(condition,message)=>{if(!condition)errors.push(message)};
const loadJson=path=>JSON.parse(readFileSync(path,'utf8'));
const catalog=loadJson('data/tool-upgrades.v1.json');
const master=loadJson('data/board-master.full.v1.json');
const byTool=new Map(catalog.tools.map(x=>[x.id,x]));
const byUpgrade=new Map(catalog.upgrades.map(x=>[x.id,x]));
const domainMaps=new Map(['entities','resource_items','windmill_items'].map(k=>[k,new Map((master[k]||[]).map(x=>[x.id,x]))]));
const expectedCounts={red:14,blue:13,yellow:10};
const actualCounts={red:0,blue:0,yellow:0};
const namedTools=new Set();
const fullStageList=['copper','copper_plus','silver','silver_plus','gold','gold_plus','orichalcum','ultimate'];
const hatchetStageList=['copper','silver','gold','orichalcum','ultimate'];

assert(catalog.schema_version===1,'schema_version must be 1');
assert(catalog.meta?.target_game_version===master.meta?.target_game_version,'target game version mismatch');
assert(catalog.tools.length===5,'must list five upgradeable tools');
assert(byTool.size===5,'duplicate tool id');
assert(catalog.upgrades.length===37,'must contain 37 tool upgrade steps');
assert(byUpgrade.size===37,'duplicate upgrade id');
assert(catalog.tools.every(t=>domainMaps.get('entities').has(t.id)),'unknown base tool id');
for(const tool of catalog.tools){
  const expected=tool.id==='hatchet'?hatchetStageList:fullStageList;
  assert(JSON.stringify(tool.stages)===JSON.stringify(expected),`${tool.id}: invalid upgrade path`);
  assert(!namedTools.has(tool.name_ja),`${tool.id}: duplicate tool display name`);
  namedTools.add(tool.name_ja);
  assert(master.entities.some(e=>e.id===tool.id && e.kind==='tool' && e.attributes?.upgradable),`${tool.id}: missing legacy upgradable tool`);
  for (const [i,stage] of tool.stages.entries()){
    const id=`tool_upgrade_${tool.id}_${stage}`;
    const row=byUpgrade.get(id);
    if(!row){errors.push(`Missing upgrade ${id}`);continue}
    assert(row.stage===stage && row.tool_id===tool.id && row.order===i+1,`${id}: stage/order mismatch`);
    const prior=i===0?tool.id:`tool_upgrade_${tool.id}_${tool.stages[i-1]}`;
    const prevDomain=i===0?'entities':'tool_upgrades';
    assert(row.previous_tool_ref?.domain===prevDomain && row.previous_tool_ref?.id===prior,`${id}: previous tool link mismatch`);
    assert(row.previous_tool_ref?.name_ja===
      (i===0?tool.initial_name_ja:byUpgrade.get(prior)?.name_ja),`${id}: previous tool display name mismatch`);
    assert(row.name_ja && typeof row.name_ja==='string',`${id}: name missing`);
    assert(row.windmill===({copper:'red',copper_plus:'red',silver:'red',silver_plus:'blue',gold:'blue',gold_plus:'blue',orichalcum:'yellow',ultimate:'yellow'}[stage]),`${id}: windmill invalid`);
    actualCounts[row.windmill]=(actualCounts[row.windmill]??0)+1;
    assert(row.requires_purple_wonderstone === (stage==='ultimate'),`${id}: purple wonderstone mismatch`);
    assert(Number.isInteger(row.base_processing_minutes)&&row.base_processing_minutes>0,`${id}: invalid processing time`);
    assert(row.time_confidence===(stage==='ultimate'?'probable':'confirmed_primary'),`${id}: wrong time confidence`);
    assert(Array.isArray(row.materials)&&row.materials.length>0,`${id}: materials missing`);
    const seenMaterial=new Set();
    for(const material of row.materials||[]){
      const ref=material.ref||{}, k=`${ref.domain}:${ref.id}`;
      assert(!seenMaterial.has(k),`${id}: duplicate material ${k}`);seenMaterial.add(k);
      assert(Number.isInteger(material.quantity)&&material.quantity>0,`${id}: invalid material quantity`);
      const found=domainMaps.get(ref.domain)?.get(ref.id);
      assert(found?.name_ja===ref.name_ja,`${id}: material link/name mismatched ${k} [${ref.name_ja}]`);
    }
  }
}
for(const [windmill,count] of Object.entries(expectedCounts))assert(actualCounts[windmill]===count,`${windmill}: expected ${count}, got ${actualCounts[windmill]}`);
for(const row of catalog.upgrades)assert(byTool.has(row.tool_id),`${row.id}: unknown owner tool`);
const iron99=byUpgrade.get('tool_upgrade_hatchet_orichalcum')?.materials.find(x=>x.ref.id==='iron_ore');
assert(iron99?.quantity===99,'Orichalcum hatchet must require 99 iron ore, not unspecified ore');
const preview=planToolUpgrade(catalog,{toolId:'hatchet',fromStage:'silver',toStage:'gold',discoveredUpgradeIds:['tool_upgrade_hatchet_gold']});
assert(preview.status==='ok','discovered hatchet route should succeed');
assert(preview.stages?.length===1 && preview.total_base_processing_minutes===1200,'hatchet silver->gold route mismatch');
const matCount=new Map(preview.material_totals?.map(x=>[x.ref.name_ja,x.quantity]));
assert(matCount.get('金')===5 && matCount.get('鉄鉱石')===50 && matCount.get('頑丈な木材')===4,'silver->gold materials mismatch');
const spoiler=planToolUpgrade(catalog,{toolId:'hatchet',fromStage:'silver',toStage:'ultimate',discoveredUpgradeIds:[]});
assert(spoiler.status==='not_discovered' && !spoiler.stages && !spoiler.material_totals,'spoiler guard leaked unrevealed upgrade details');
assert(getDiscoveredUpgrade(catalog,{upgradeId:'tool_upgrade_hatchet_ultimate',discoveredUpgradeIds:[]})===null,'getDiscoveredUpgrade leaked unknown tier');
const bypass=planToolUpgrade(catalog,{toolId:'hatchet',fromStage:'silver',toStage:'ultimate',revealUnknown:true});
assert(bypass.status==='ok'&&bypass.stages?.length===3&&bypass.requires_purple_wonderstone,'admin analysis route mismatch');
const invalid=planToolUpgrade(catalog,{toolId:'hoe',fromStage:'banana',toStage:'copper'});
assert(invalid.status==='unknown_stage','unknown starting stage misread as base stage');

const result={ok:errors.length===0,tools:catalog.tools.length,upgrades:catalog.upgrades.length,by_windmill:actualCounts,confirmed_primary_times:catalog.upgrades.filter(x=>x.time_confidence==='confirmed_primary').length,probable_ultimate_times:catalog.upgrades.filter(x=>x.time_confidence==='probable').length,errors,warnings};
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=1;
