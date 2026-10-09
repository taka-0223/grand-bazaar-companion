#!/usr/bin/env node
// Static Bazaar decoration integrity test. Game facts are source-attributed, not game-play-tested.
import {readFileSync} from 'node:fs';
import {
  listDiscoveredDecor,evaluateKnownDecorLayout,planDiscoveredDecorPurchases
} from '../lib/bazaar-decor-read-model.mjs';

const load=p=>JSON.parse(readFileSync(p,'utf8'));
const decor=load('data/bazaar-decor.v1.json');
const crafting=load('data/bazaar-decor-crafting.v1.json');
const shops=load('data/bazaar-shops.v1.json');
const html=readFileSync('index.html','utf8');
const embedded=html.match(/<script\b[^>]*\bid=["']MASTER_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
if(!embedded)throw new Error('Embedded MASTER_DATA not found');
const master=JSON.parse(embedded[1]);
const errors=[],warnings=[];
const assert=(ok,msg)=>{if(!ok)errors.push(msg)};
const distinct=(rows,key,label)=>assert(rows.length===new Set(rows.map(x=>x[key])).size,label+' has duplicate '+key);
const itemById=new Map(decor.items.map(x=>[x.id,x]));
const itemByIndex=new Map(decor.items.map(x=>[x.index,x]));
const seriesById=new Map(decor.series.map(x=>[x.id,x]));
const types=new Map(decor.effect_types.map(x=>[x.id,x]));
const shopById=new Map(shops.shops.map(x=>[x.id,x]));
const reqById=new Map(master.requests.map(x=>[x.id,x]));
const domains=new Map(['windmill_items','resource_items'].map(k=>[k,new Map(master[k].map(x=>[x.id,x]))]));

assert(decor.schema_version===1 && crafting.schema_version===1,'Schema versions must be 1');
assert(decor.meta.target_game_version===master.meta.target_game_version,'Decor/embedded Master version mismatch');
assert(crafting.meta.target_game_version===master.meta.target_game_version,'Crafting/embedded Master version mismatch');
assert(decor.meta.item_count===159 && decor.items.length===159,'Expected 159 base-game decor records');
assert(decor.meta.series_count===9 && decor.series.length===9,'Expected nine decor series');
distinct(decor.items,'id','Decor IDs');
distinct(decor.items,'index','GameWith item indices');
distinct(decor.items,'name_ja','Japanese decor names');
distinct(decor.series,'id','Series IDs');
distinct(decor.effect_types,'id','Effect definitions');
for(let i=1;i<=159;i++)assert(itemByIndex.has(i),'Missing decor catalog index '+i);

const expectedSlot={tent:29,counter:29,small:46,large:55};
const actualSlot={tent:0,counter:0,small:0,large:0};
const expectedSeries=['farmer','florist','rancher','bug','forager','fish','chef','windmill','nature_sprite'];
const expectedAcquisition={
  windmill_craft:9,event_reward:3,shop_purchase:83,rank_auto:1,title_reward:30,
  request_reward:9,source_conflict:1,contest_reward:6,sprite_exchange:17
};
const acqCounts={},seriesCounts={},effectCounts={};
for(const x of decor.items){
  assert(typeof x.name_ja==='string' && x.name_ja.trim()!=='' ,'Missing Japanese name '+x.index);
  assert(x.id.startsWith('decor_'),'Invalid ID prefix '+x.index);
  assert(x.index>=1 && x.index<=159,'Out-of-range catalog index '+x.id);
  assert(Object.prototype.hasOwnProperty.call(actualSlot,x.slot),'Invalid slot type '+x.id);
  actualSlot[x.slot]=(actualSlot[x.slot]??0)+1;
  if(x.series_id!=null){
    assert(seriesById.has(x.series_id),'Unknown series '+x.id);
    seriesCounts[x.series_id]=(seriesCounts[x.series_id]??0)+1;
  } else seriesCounts.none=(seriesCounts.none??0)+1;
  if(x.effect){
    const e=types.get(x.effect.effect_id);
    assert(!!e,'Invalid effect ID '+x.id);
    assert(Number.isInteger(x.effect.level)&&x.effect.level>=1,'Invalid effect level '+x.id);
    if(e)assert(x.effect.level<=e.max_level,'Effect level above max '+x.id);
    effectCounts[x.effect.effect_id]=(effectCounts[x.effect.effect_id]??0)+1;
  }
  const ac=x.acquisition;
  assert(ac && typeof ac.method==='string','No acquisition '+x.id);
  if(!ac)continue;
  acqCounts[ac.method]=(acqCounts[ac.method]??0)+1;
  if(ac.shop_id)assert(shopById.has(ac.shop_id),'Unknown shop '+x.id+' -> '+ac.shop_id);
  if(ac.rank_min!=null)assert(Number.isInteger(ac.rank_min)&&ac.rank_min>=1,'Invalid rank '+x.id);
  if(ac.requires_purchased_item_id){
    const required=itemById.get(ac.requires_purchased_item_id);
    assert(!!required,'Unknown prerequisite purchase '+x.id);
    if(required)assert(required.acquisition?.method===ac.method,'Prerequisite acquisition type differs '+x.id);
  }
  if(ac.method==='shop_purchase'){
    assert(ac.currency==='G','Currency wrong for '+x.id);
    assert(Number.isInteger(ac.stock_limit_per_save)&&ac.stock_limit_per_save>=1,'Stock limit wrong '+x.id);
    if(ac.price_confidence==='source_conflict'){
      assert(ac.price_g===null && Array.isArray(ac.price_candidates_g)&&ac.price_candidates_g.length>=2,'Unresolved price guessed for '+x.id);
    } else assert(Number.isInteger(ac.price_g)&&ac.price_g>=0,'Missing/invalid purchase price '+x.id);
  }
  if(ac.method==='sprite_exchange'){
    assert(ac.currency==='happy_energy'&&Number.isInteger(ac.cost)&&ac.cost>0,'Invalid sprite exchange '+x.id);
    assert(ac.shop_id==='shop_sprite','Sprite item listed at wrong shop '+x.id);
  }
  if(ac.method==='request_reward'){
    const req=reqById.get(ac.request_id);
    assert(!!req,'Unknown unlock request '+x.id);
    if(req)assert(req.reward===x.name_ja,
      'Request reward mismatched for '+x.id+': '+req.reward+' != '+x.name_ja);
  }
  if(ac.method==='source_conflict')assert(Array.isArray(ac.request_candidates)&&ac.request_candidates.length>1,
    'Uncertain reward was silently inferred '+x.id);
  assert(Array.isArray(x.provenance?.sources)&&x.provenance.sources.length>0,'Missing provenance '+x.id);
}
for(const [slot,value] of Object.entries(expectedSlot))assert(actualSlot[slot]===value,'Slot count mismatch '+slot);
for(const id of expectedSeries){
  assert(seriesById.has(id),'Missing series '+id);
  assert(seriesCounts[id]===(id==='nature_sprite'?17:16),'Bad series member count '+id);
}
assert(seriesCounts.none===14,'Expected 14 decorations without series');
for(const [method,value] of Object.entries(expectedAcquisition))assert(acqCounts[method]===value,
  'Acquisition counts mismatched '+method+' '+acqCounts[method]);
assert(Object.values(acqCounts).reduce((n,x)=>n+x,0)===159,'Acquisition methods not exhaustive');
assert(decor.effect_types.length===9,'Expected nine individual effect types');
const cap=Object.fromEntries(decor.effect_types.map(x=>[x.id,x.max_level]));
assert(JSON.stringify(cap)===JSON.stringify({
  bulk_sale:9,price_up:9,quality_up:3,freshness_up:6,trend_effects_up:3,
  happy_energy_gain:6,cheer_gauge_gain:4,popularity_up:2,big_spenders_up:6
}),'Effect cap changed unexpectedly');
assert(JSON.stringify(decor.rules.category_slots)===JSON.stringify({tent:1,counter:3,small:4,large:3}),
  'Equipment slot limits changed');
assert(decor.rules.max_equipped_total===11,'Total equipment capacity should cap at 11');
assert(decor.rules.series_activation==='equipped_tent_series_only','Tent gate missing');
assert(JSON.stringify(decor.rules.series_thresholds)==='[3,5,7]','Series threshold counts changed');
for(const series of decor.series){
  assert(series.requires_equipped_tent_same_series===true,'Series lacking tent gate '+series.id);
  assert(JSON.stringify(series.bonus_tiers.map(t=>t.min_equipped))==='[3,5,7]',
    'Bonus levels incorrect '+series.id);
  const five=series.bonus_tiers.find(t=>t.min_equipped===5);
  assert(five?.bonus_pct===null&&five.confidence==='source_conflict'&&
    JSON.stringify(five.candidate_bonus_pct)==='[10,20]',
    'Disputed five-decor cheer percent must remain unresolved '+series.id);
  assert(series.bonus_tiers[0].bonus_pct===20 && series.bonus_tiers[2].bonus_pct===10,
    'Confirmed tiers changed '+series.id);
}
for(const n of [121,122,123]){
  const x=itemByIndex.get(n);
  assert(x.series_id==='forager' && x.provenance.confidence!=='confirmed',
    'Honey balloon series uncertainty lost '+n);
}
assert(itemByIndex.get(98).acquisition.method==='source_conflict' &&
  itemByIndex.get(98).provenance.confidence==='unresolved',
  'Disputed beetle-toy reward incorrectly auto-linked');
for(const n of [73,134,135,136]){
  const x=itemByIndex.get(n);
  assert(x.acquisition.price_g===null && x.acquisition.price_confidence==='source_conflict',
    'Unresolved shop price was hardcoded '+n);
}

// Separate nine Windmill recipes are not included in ordinary Windmill Master by design.
assert(crafting.recipes.length===9,'Expected nine decor windmill recipes');
distinct(crafting.recipes,'id','Decor crafting recipes');
distinct(crafting.recipes,'decor_id','Decor craft outputs');
for(const [index,r] of crafting.recipes.entries()){
  const target=itemByIndex.get(index+1);
  assert(r.decor_id===target?.id,'Crafting output/number mismatch '+r.id);
  assert(target?.acquisition.method==='windmill_craft','Craft output not a crafted decoration '+r.id);
  assert(r.output_quantity===1,'Craft output quantity not 1 '+r.id);
  assert(r.windmill===target.acquisition.windmill,'Craft windmill mismatch '+r.id);
  assert(['red','blue','yellow'].includes(r.windmill),'Unknown windmill '+r.id);
  assert(Number.isInteger(r.base_processing_minutes)&&r.base_processing_minutes>0,
    'Invalid baseline processing minutes '+r.id);
  assert(Array.isArray(r.materials)&&r.materials.length>0,'Craft input missing '+r.id);
  const seen=new Set();
  for(const input of r.materials||[]){
    const ref=input.ref||{};
    const registry=domains.get(ref.domain);
    const linked=registry?.get(ref.id);
    assert(linked?.name_ja===ref.name_ja,'Craft input reference/display mismatch '+r.id+' '+ref.name_ja);
    assert(Number.isInteger(input.quantity)&&input.quantity>0,'Bad craft input quantity '+r.id);
    assert(!seen.has(ref.domain+':'+ref.id),'Duplicate craft input '+r.id);
    seen.add(ref.domain+':'+ref.id);
  }
  if([1,6,9].includes(index+1))assert(r.material_confidence==='source_conflict',
    'Known craft material dispute lost for '+r.id);
}
assert(crafting.recipes.every(r=>r.needs_purple_wonderstone===false),
  'Normal Bazaar objects mistakenly require the purple wonderstone');

// Discovery / spoiler / effect-stacking integration checks:
const ids=[
  'decor_farmer_tent','decor_farmer_counter','decor_good_farmer_counter',
  'decor_excellent_farmer_counter','decor_vegetable_assortment',
  'decor_great_vegetable_assortment','decor_delicious_vegetable_assortment'
];
const own=Object.fromEntries(ids.map(x=>[x,1]));
assert(listDiscoveredDecor(decor).length===0,'Undiscovered item names leaked on listing');
assert(listDiscoveredDecor(decor,{discoveredDecorIds:ids}).length===7,
  'Discovered list missing records');
const unknown=evaluateKnownDecorLayout(decor,{
  discoveredDecorIds:ids.slice(0,2),equippedDecorIds:ids.slice(0,3),
  ownedDecorCounts:own
});
assert(unknown.status==='not_discovered'&&unknown.series_summary==null,
  'Undiscovered decor leaked through layout analysis');
const missingOwn=evaluateKnownDecorLayout(decor,{discoveredDecorIds:ids,equippedDecorIds:ids.slice(0,3)});
assert(missingOwn.status==='ownership_not_recorded','Lack of inventory was treated as owned');
const simple=evaluateKnownDecorLayout(decor,{
  discoveredDecorIds:ids,equippedDecorIds:[ids[0],ids[1],ids[4]],ownedDecorCounts:own
});
assert(simple.status==='ok'&&simple.series_summary.equipped_series_items===3,
  'Correct three-series layout not recognized');
assert(simple.series_summary.active_bonus_tiers.length===1 &&
  simple.series_summary.active_bonus_tiers[0].bonus_pct===20,
  'Series 3 threshold effect missing');
const all=evaluateKnownDecorLayout(decor,{
  discoveredDecorIds:ids,equippedDecorIds:ids,ownedDecorCounts:own
});
assert(all.status==='ok'&&all.series_summary.equipped_series_items===7,
  'Correct seven-piece series not recognized');
assert(JSON.stringify(all.series_summary.active_bonus_tiers.map(t=>t.min_equipped))==='[3,5,7]',
  'Series 3/5/7 thresholds failed');
assert(all.has_unresolved_series_bonus&&
  all.series_summary.active_bonus_tiers[1].bonus_pct===null,
  'Cheer bonus incorrectly determined as 10% or 20%');
assert(all.series_summary.active_bonus_tiers[2].bonus_pct===10,
  'Series sale bonus +10% not applied at seven');
const price=all.individual_effects.find(x=>x.effect_id==='price_up');
const bulk=all.individual_effects.find(x=>x.effect_id==='bulk_sale');
assert(price?.effective_level===6 && bulk?.effective_level===7,
  'Individual levels not aggregated correctly');
const twoTents=evaluateKnownDecorLayout(decor,{
  discoveredDecorIds:ids,equippedDecorIds:[ids[0],ids[0]],ownedDecorCounts:own
});
assert(twoTents.status==='slot_limit_exceeded' ||
  twoTents.status==='duplicate_exceeds_slot_limit',
  'Two tents permitted');
const noTent=evaluateKnownDecorLayout(decor,{
  discoveredDecorIds:ids,equippedDecorIds:[ids[1],ids[4]],ownedDecorCounts:own
});
assert(noTent.status==='tent_required','Tentless layout evaluated');
const unowned=evaluateKnownDecorLayout(decor,{
  discoveredDecorIds:ids,equippedDecorIds:[ids[0],ids[1],ids[4]],
  ownedDecorCounts:{[ids[0]]:1,[ids[1]]:1}
});
assert(unowned.status==='not_owned','Unowned decoration treated as installed');
const foragerTent='decor_forager_tent',honey='decor_honey_balloons';
const honeyLayout=evaluateKnownDecorLayout(decor,{
  equippedDecorIds:[foragerTent,honey],discoveredDecorIds:[foragerTent,honey],
  ownedDecorCounts:{[foragerTent]:1,[honey]:1}
});
assert(honeyLayout.series_summary?.status==='membership_source_conflict',
  'Disputed honey balloon series incorrectly counted');
const farmerSign='decor_farmer_signboard',floristSign='decor_florist_signboard';
const signLayout=evaluateKnownDecorLayout(decor,{
  equippedDecorIds:[ids[0],farmerSign,floristSign],
  discoveredDecorIds:[ids[0],farmerSign,floristSign],
  ownedDecorCounts:{[ids[0]]:1,[farmerSign]:1,[floristSign]:1}
});
assert(signLayout.individual_effects.filter(x=>x.effect_id==='popularity_up').length===2,
  'Category-targeted popularity effects collapsed into global levels');
const noPurchase=planDiscoveredDecorPurchases(decor,{targetDecorIds:[ids[0]]});
assert(noPurchase.status==='not_discovered'&&!('items' in noPurchase),
  'Undiscovered purchased decor leaked');
const knownPurchase=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[ids[0]],discoveredDecorIds:[ids[0]],discoveredShopIds:['shop_rebecca'],
  currentBazaarRank:2
});
assert(knownPurchase.status==='ok'&&knownPurchase.total_g===4200,
  'Known Farmer Tent price incorrect');
const rankBlocked=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[ids[0]],discoveredDecorIds:[ids[0]],discoveredShopIds:['shop_rebecca'],
  currentBazaarRank:1
});
assert(rankBlocked.status==='rank_not_met','Rank lock ignored');
const eggId=itemByIndex.get(73).id;
const eggPrice=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[eggId],discoveredDecorIds:[eggId],discoveredShopIds:['shop_rebecca'],
  currentBazaarRank:2
});
assert(eggPrice.status==='price_unresolved'&&eggPrice.total_g==null,
  'Unresolved Egg Tower price was added to planning');
const leafId=itemByIndex.get(148).id,sproutingId=itemByIndex.get(149).id;
const leafBlocked=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[sproutingId],discoveredDecorIds:[sproutingId,leafId],
  discoveredShopIds:['shop_sprite'],currentBazaarRank:4
});
assert(leafBlocked.status==='prerequisite_not_purchased',
  'Unknown prior purchase incorrectly treated as complete');
const leafKnown=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[sproutingId],discoveredDecorIds:[sproutingId,leafId],
  purchasedDecorIds:[leafId],discoveredShopIds:['shop_sprite'],currentBazaarRank:4
});
assert(leafKnown.status==='ok'&&leafKnown.total_happy_energy===30000,
  'Nature Sprite prerequisite or currency incorrect');
const rosette=itemByIndex.get(143).id;
const rosBlocked=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[rosette],discoveredDecorIds:[rosette],
  discoveredShopIds:['shop_sprite'],currentBazaarRank:6
});
assert(rosBlocked.status==='additional_unlock_not_confirmed',
  'Max Sprite bond requirement silently bypassed');
const rosConfirmed=planDiscoveredDecorPurchases(decor,{
  targetDecorIds:[rosette],discoveredDecorIds:[rosette],
  discoveredShopIds:['shop_sprite'],confirmedAdditionalUnlockIds:[rosette],
  currentBazaarRank:6
});
assert(rosConfirmed.status==='ok'&&rosConfirmed.total_happy_energy===560000,
  'Known rosette price/currency wrong');

const result={
  ok:errors.length===0,decor_items:decor.items.length,series:decor.series.length,
  no_series:seriesCounts.none,slots:actualSlot,effect_count:effectCounts,
  acquisition:acqCounts,crafting_recipes:crafting.recipes.length,
  unconfirmed_sources:decor.items.filter(x=>x.provenance.confidence!=='confirmed').length,
  errors,warnings
};
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=1;
