// Read-only planning helpers for Bazaar catalogs. No browser or Player State access.
// Discovery boundary: only default shops and explicitly known shop/offer/facility IDs may be returned.

function requireCatalog(x,key) {
  if (!x || !Array.isArray(x[key])) throw new TypeError('Missing '+key+' catalog array');
}
const stable=(a,b)=>String(a.id).localeCompare(String(b.id));

export function listKnownShops(shopsCatalog,{discoveredShopIds=[]}={}) {
  requireCatalog(shopsCatalog,'shops');
  const discovered=new Set(discoveredShopIds);
  return shopsCatalog.shops.filter(s=>s.unlock.mode==='default'||discovered.has(s.id)).map(s=>({
    id:s.id,name_ja:s.name_ja,owner_ja:s.owner_ja,location:s.location,
    services:[...s.services],hours:{...s.hours},currency:s.currency
  })).sort(stable);
}

export function listKnownShopOffers(shopsCatalog,offersCatalog,{
  discoveredShopIds=[],discoveredOfferIds=[]
}={}) {
  requireCatalog(offersCatalog,'offers');
  const knownShops=new Set(listKnownShops(shopsCatalog,{discoveredShopIds}).map(s=>s.id));
  const knownOffers=new Set(discoveredOfferIds);
  return offersCatalog.offers.filter(o=>knownShops.has(o.shop_id)&&knownOffers.has(o.id)).map(o=>({
    id:o.id,shop_id:o.shop_id,name_ja:o.name_ja,offer_type:o.offer_type,
    currency:o.currency,price:o.price,effect:{...o.effect}
  })).sort(stable);
}

export function planKnownFacilityPurchases(facilityCatalog,shopCatalog,{
  targetFacilityIds=[],
  discoveredFacilityIds=[],
  discoveredShopIds=[],
  completedFacilityIds=[],
  currentBazaarRank=null,
  playerFlags=[]
}={}) {
  requireCatalog(facilityCatalog,'facility_upgrades');
  requireCatalog(shopCatalog,'shops');
  const all=new Map(facilityCatalog.facility_upgrades.map(r=>[r.id,r]));
  const known=new Set(discoveredFacilityIds);
  const completed=new Set(completedFacilityIds);
  const flags=new Set(playerFlags);
  const shops=new Set(listKnownShops(shopCatalog,{discoveredShopIds}).map(s=>s.id));
  const visited=new Set(),visiting=new Set(),route=[];
  // No item name, price or prerequisites are returned if the player has not discovered it.
  const targets=[...new Set(targetFacilityIds)];
  if(!targets.length)return {status:'empty_selection'};
  if(targets.some(id=>!known.has(id)||!all.has(id)))return {status:'not_discovered'};
  function visit(id) {
    if(completed.has(id))return null;
    if(!known.has(id))return 'prerequisite_not_discovered';
    const rec=all.get(id);
    if(!rec)return 'prerequisite_not_discovered';
    if(!shops.has(rec.shop_id))return 'shop_not_discovered';
    if(currentBazaarRank==null)return 'rank_not_recorded';
    if(!Number.isInteger(currentBazaarRank)||currentBazaarRank<1)return 'invalid_rank';
    if(currentBazaarRank<rec.unlock.rank_min)return 'rank_requirement_not_met';
    if((rec.unlock.required_player_flags||[]).some(f=>!flags.has(f)))return 'player_requirement_not_met';
    if(visited.has(id))return null;
    if(visiting.has(id))return 'master_dependency_cycle';
    visiting.add(id);
    for(const dep of rec.unlock.required_facility_ids||[]){
      const err=visit(dep);
      if(err)return err;
    }
    visiting.delete(id);
    visited.add(id);
    route.push({
      id:rec.id,name_ja:rec.name_ja||rec.label_ja,
      name_is_game_exact:!!rec.name_ja,shop_id:rec.shop_id,
      rank_min:rec.unlock.rank_min,price_g:rec.price_g,
      kind:rec.kind,result:structuredCloneResult(rec.result)
    });
    return null;
  }
  for(const id of targets){
    const err=visit(id);
    if(err)return {status:err};
  }
  const total=route.reduce((sum,row)=>sum+row.price_g,0);
  return {status:'ok',total_price_g:total,facility_count:route.length,steps:route};
}
function structuredCloneResult(x){return x==null?null:JSON.parse(JSON.stringify(x))}
