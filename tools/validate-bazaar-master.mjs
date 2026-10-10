#!/usr/bin/env node
// Verifies static structure, Request Master references and spoiler-safe read models.
// Does not assert that every seasonal shop inventory is cataloged or experimentally tested.
import {readFileSync} from 'node:fs';
import {
  listKnownShops,listKnownShopOffers,planKnownFacilityPurchases
} from '../lib/bazaar-master-plan.mjs';

const load=path=>JSON.parse(readFileSync(path,'utf8'));
const shops=load('data/bazaar-shops.v1.json');
const facilities=load('data/bazaar-facilities.v1.json');
const offers=load('data/bazaar-offers.v1.json');
const master=load('data/board-master.full.v1.json');
const errors=[],warnings=[],assert=(ok,msg)=>{if(!ok)errors.push(msg)};
function unique(rows,key,label) {
  assert(rows.length===new Set(rows.map(x=>x[key])).size,label+': duplicate '+key);
}
function count(rows,key,value) {return rows.filter(x=>x[key]===value).length}
const shopById=new Map(shops.shops.map(x=>[x.id,x]));
const facById=new Map(facilities.facility_upgrades.map(x=>[x.id,x]));
const requestById=new Map(master.requests.map(x=>[x.id,x]));
const rankNames=new Map(shops.ranks.map(x=>[x.rank,x.name_ja]));
for (const c of [shops,facilities,offers]) {
  assert(c.schema_version===1,'Catalog schema_version mismatch');
  assert(c.meta?.target_game_version===master.meta.target_game_version,'Game version mismatch for '+c.meta?.id);
  assert(c.meta?.verified_on==='2026-10-09','Missing explicit audit date for '+c.meta?.id);
}
assert(shops.shops.length===23,'Expected 23 shops (21 bazaar and 2 town)');
assert(count(shops.shops,'location','town')===2,'Expected 2 town shops');
assert(count(shops.shops,'location','bazaar')===21,'Expected 21 bazaar shops');
assert(shops.shops.filter(x=>x.unlock.mode==='default'&&x.location==='bazaar').length===4,'Expected 4 initially open bazaar stalls');
assert(shops.shops.filter(x=>x.unlock.mode==='rank_auto').length===1,'Expected 1 automatically rank-unlocked stall');
assert(shops.shops.filter(x=>x.unlock.mode==='request_reward').length===16,'Expected 16 invitation stalls');
unique(shops.shops,'id','Shops');
const validModes=['default','rank_auto','request_reward'];
for(const shop of shops.shops){
  const unlock=shop.unlock||{};
  assert(shop.id && shop.name_ja && shop.owner_ja,'Shop fields missing '+shop.id);
  assert(['bazaar','town'].includes(shop.location),'Invalid shop location '+shop.id);
  assert(Array.isArray(shop.services)&&shop.services.length>0,'Missing services '+shop.id);
  assert(shop.hours?.start && shop.hours?.end && shop.hours?.days?.length,'Invalid hours '+shop.id);
  assert(validModes.includes(unlock.mode),'Unlock mode invalid '+shop.id);
  assert(Number.isInteger(unlock.rank_min)&&unlock.rank_min>=1,'Invalid required rank '+shop.id);
  assert(shop.inventory_coverage==='not_cataloged','Do not imply complete inventory for '+shop.id);
  if(shop.location==='bazaar'){
    assert(shop.hours.start==='10:00' && shop.hours.end==='18:59','Unexpected stall hours '+shop.id);
    assert(JSON.stringify(shop.hours.days)==='["土"]','Wrong default bazaar weekdays '+shop.id);
  }
  if(unlock.mode==='request_reward'){
    const req=requestById.get(unlock.request_id);
    assert(!!req,'Missing request '+shop.id+' → '+unlock.request_id);
    if(req){
      assert(req.reward==='出店：'+shop.name_ja,'Reward shop name mismatch '+shop.id+' → '+req.reward);
      assert(req.requester===shop.owner_ja,'Request owner mismatch '+shop.id);
      assert(req.trigger?.rank===rankNames.get(unlock.rank_min),'Rank/request trigger mismatch '+shop.id);
    }
  } else {
    assert(!unlock.request_id,'Non-request shop has request id '+shop.id);
  }
}
assert(shops.ranks.length===7,'Expected 7 story ranks');
unique(shops.ranks,'rank','Ranks');
const expectedRankSales=[0,1000,50000,200000,500000,1000000,2000000];
const expectedInvites=[0,0,2,5,8,12,16];
for(let i=0;i<7;i++){
  const r=shops.ranks[i];
  assert(r.rank===i+1,'Rank sequence problem at '+(i+1));
  assert(r.sales_goal_g===expectedRankSales[i],'Rank sale threshold mismatch at '+(i+1));
  assert(r.invited_shops_required===expectedInvites[i],'Invitation threshold mismatch at '+(i+1));
}
assert(shops.bazaars.trading_shifts?.length===2,'Expected two bazaar sessions');
assert(facilities.facility_upgrades.length===38,'Expected 38 facility upgrades');
assert(count(facilities.facility_upgrades,'shop_id','shop_wilbur')===20,'Wilbur facility count mismatch');
assert(count(facilities.facility_upgrades,'shop_id','shop_garon')===12,'Garon facility count mismatch');
assert(count(facilities.facility_upgrades,'shop_id','shop_arata')===6,'Arata facility count mismatch');
unique(facilities.facility_upgrades,'id','Facilities');
for(const fac of facilities.facility_upgrades){
  assert(shopById.has(fac.shop_id),'Facility references absent shop '+fac.id);
  assert(shopById.get(fac.shop_id)?.services.includes('facility_upgrades'),'Facility shop has no facility service '+fac.id);
  assert(fac.name_en && fac.label_ja,'Facility names missing '+fac.id);
  assert(fac.name_ja===null || typeof fac.name_ja==='string','Invalid name_ja '+fac.id);
  assert(Number.isInteger(fac.price_g)&&fac.price_g>0,'Invalid facility price '+fac.id);
  assert(Number.isInteger(fac.unlock?.rank_min)&&fac.unlock.rank_min>=shopById.get(fac.shop_id).unlock.rank_min,'Facility rank below shop rank '+fac.id);
  assert(Array.isArray(fac.unlock?.required_facility_ids),'Missing facility prereq list '+fac.id);
  for(const dep of fac.unlock?.required_facility_ids||[]){
    assert(dep!==fac.id&&facById.has(dep),'Invalid facility dependency '+fac.id+'→'+dep);
    if(facById.has(dep))assert(facById.get(dep).unlock.rank_min<=fac.unlock.rank_min,'Prereq rank exceeds target '+fac.id);
  }
  if(fac.kind==='cooking_utensil'){
    const ref=fac.result?.ref||{};
    const item=master.cooking_utensils.find(x=>x.id===ref.id);
    assert(ref.domain==='cooking_utensils'&&item,'Bad kitchen utensil reference '+fac.id);
    if(item)assert(item.buy_price===fac.price_g,'Utensil price deviates from Cooking Master '+fac.id);
  }
}
// DFS cycle test independent of the planning read model.
const visited=new Set(),path=new Set();
function checkCycle(id){
  if(path.has(id)){errors.push('Facility prerequisite cycle at '+id);return}
  if(visited.has(id))return;
  path.add(id);
  for(const dep of facById.get(id)?.unlock.required_facility_ids||[])if(facById.has(dep))checkCycle(dep);
  path.delete(id);visited.add(id);
}
for(const x of facById.keys())checkCycle(x);
assert(facById.get('fac_wilbur_field_3')?.unlock.rank_min===4,'Third field rank must be 4');
assert(facById.get('fac_garon_barn_2')?.unlock.rank_min===5,'Second animal barn rank must be 5');
assert(facById.get('fac_garon_barn_2')?.unlock.required_facility_ids.includes('fac_wilbur_pasture_2'),'Barn pasture dependency missing');
assert(facById.get('fac_arata_beekeeping_1')?.price_g===master.meta.resource_master?.beekeeping?.initial_construction_price || facById.get('fac_arata_beekeeping_1')?.price_g===10000,'Initial beekeeping field cost mismatched');
assert(facById.get('fac_arata_mushroom_1')?.price_g===master.meta.resource_master?.mushroom_cultivation?.initial_construction_price,'Initial mushroom-log cost mismatched');
assert(JSON.stringify([2,3].map(i=>facById.get('fac_arata_mushroom_'+i).price_g))===JSON.stringify(master.meta.resource_master?.mushroom_cultivation?.expansion_prices),'Mushroom expansion costs mismatched');
assert(offers.offers.length===8,'Expected 8 curated fixed offers');
unique(offers.offers,'id','Offers');
for(const offer of offers.offers){
  assert(shopById.has(offer.shop_id),'Offer shop missing '+offer.id);
  assert(Number.isInteger(offer.price)&&offer.price>0,'Offer price invalid '+offer.id);
  assert(['item','service'].includes(offer.offer_type),'Offer type invalid '+offer.id);
  assert(offer.meta!==true,'Do not mix offers with player state '+offer.id);
  if(offer.item_ref){
    const linked=master[offer.item_ref.domain]?.find(x=>x.id===offer.item_ref.id);
    assert(!!linked&&linked.name_ja===offer.name_ja,'Offer canonical item mismatch '+offer.id);
  }
}
const purple=offers.offers.find(x=>x.id==='offer_wonderstone_purple');
assert(purple?.price===140000,'Purple wonderstone price must be 140000G');
assert(purple?.shop_id==='shop_felipe','Purple wonderstone shop mismatch');
// Regression of discovery-only visibility.
const initiallyKnown=listKnownShops(shops);
assert(initiallyKnown.length===6,'Starting list should only show 2 town + 4 default bazaar shops');
assert(initiallyKnown.every(x=>shopById.get(x.id)?.unlock.mode==='default'),'Unknown shop exposed at startup');
assert(!initiallyKnown.some(x=>x.name_ja==='トレジャーランド'),'Future shop leaked');
const discovered=listKnownShops(shops,{discoveredShopIds:['shop_felipe']});
assert(discovered.length===7&&discovered.some(x=>x.id==='shop_felipe'),'Known shop absent');
assert(listKnownShopOffers(shops,offers).length===0,'Future offers leaked before discovery');
assert(listKnownShopOffers(shops,offers,{discoveredShopIds:['shop_felipe']}).length===0,'Shop discovery must not imply all offers were seen');
assert(listKnownShopOffers(shops,offers,{discoveredShopIds:['shop_felipe'],discoveredOfferIds:['offer_wonderstone_purple']}).length===1,'Known offer missing');
const undiscovered=planKnownFacilityPurchases(facilities,shops,{targetFacilityIds:['fac_garon_oven']});
assert(undiscovered.status==='not_discovered'&&!('steps' in undiscovered)&&!('total_price_g' in undiscovered),'Undiscovered facility leaked');
const oven=planKnownFacilityPurchases(facilities,shops,{targetFacilityIds:['fac_garon_oven'],discoveredShopIds:['shop_garon'],discoveredFacilityIds:['fac_garon_oven'],currentBazaarRank:3});
assert(oven.status==='ok'&&oven.total_price_g===50000&&oven.facility_count===1,'Known cooking oven cost incorrect');
const storage=planKnownFacilityPurchases(facilities,shops,{targetFacilityIds:['fac_wilbur_storage_2'],discoveredFacilityIds:['fac_wilbur_storage_1','fac_wilbur_storage_2'],currentBazaarRank:2});
assert(storage.status==='ok'&&storage.total_price_g===25000&&storage.facility_count===2,'Storage prerequisite summation failed');
const storageDone=planKnownFacilityPurchases(facilities,shops,{targetFacilityIds:['fac_wilbur_storage_2'],discoveredFacilityIds:['fac_wilbur_storage_1','fac_wilbur_storage_2'],completedFacilityIds:['fac_wilbur_storage_1'],currentBazaarRank:2});
assert(storageDone.status==='ok'&&storageDone.total_price_g===20000,'Completed upgrade double-counted');
const blindPrereq=planKnownFacilityPurchases(facilities,shops,{targetFacilityIds:['fac_garon_barn_2'],discoveredFacilityIds:['fac_garon_barn_2'],discoveredShopIds:['shop_garon'],currentBazaarRank:5});
assert(blindPrereq.status==='prerequisite_not_discovered'&&!('steps' in blindPrereq),'Prerequisite hidden spoiler leak');
const rankBlocked=planKnownFacilityPurchases(facilities,shops,{targetFacilityIds:['fac_garon_oven'],discoveredShopIds:['shop_garon'],discoveredFacilityIds:['fac_garon_oven'],currentBazaarRank:2});
assert(rankBlocked.status==='rank_requirement_not_met','Shop rank requirement bypassed');

console.log(JSON.stringify({
  ok:errors.length===0,
  shops:{town:2,bazaar:21,default_bazaar:4,rank_auto:1,request_reward:16},
  ranks:7,facilities:facilities.facility_upgrades.length,
  curated_offers:offers.offers.length,errors,warnings
},null,2));
if(errors.length)process.exitCode=1;
