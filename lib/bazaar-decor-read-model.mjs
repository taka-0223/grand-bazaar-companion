// Read-only Bazaar decoration data access.
// All public read functions require explicit discovered IDs. Never render raw Master arrays.
// Player progress and installation state must be supplied by the caller, not persisted here.

function catalogIndex(catalog) {
  if (!catalog || !Array.isArray(catalog.items) || !Array.isArray(catalog.series) ||
      !Array.isArray(catalog.effect_types)) throw new TypeError('Invalid decor master');
  return new Map(catalog.items.map(x=>[x.id,x]));
}
const stable=(a,b)=>String(a.id).localeCompare(String(b.id));

function publicItem(item) {
  // Exposes only items already discovered by the caller.
  return {
    id:item.id,name_ja:item.name_ja,slot:item.slot,series_id:item.series_id,
    effect:item.effect?{...item.effect}:null,
    acquisition:JSON.parse(JSON.stringify(item.acquisition)),
    confidence:item.provenance?.confidence??'unknown'
  };
}

export function listDiscoveredDecor(catalog,{discoveredDecorIds=[]}={}) {
  const byId=catalogIndex(catalog),known=new Set(discoveredDecorIds);
  return [...known].filter(id=>byId.has(id)).map(id=>publicItem(byId.get(id))).sort(stable);
}

export function evaluateKnownDecorLayout(catalog,{
  equippedDecorIds=[],
  discoveredDecorIds=[],
  ownedDecorCounts=null,
  simulationMode=false,
}={}) {
  const byId=catalogIndex(catalog),known=new Set(discoveredDecorIds);
  if(!Array.isArray(equippedDecorIds)) return {status:'invalid_layout'};
  if(equippedDecorIds.some(id=>!known.has(id)||!byId.has(id))) return {status:'not_discovered'};
  if(!simulationMode && (ownedDecorCounts==null||typeof ownedDecorCounts!=='object'))return {status:'ownership_not_recorded'};
  const countById=new Map(),counts={tent:0,counter:0,small:0,large:0};
  for(const id of equippedDecorIds){
    const x=byId.get(id);
    if(!x || !Object.prototype.hasOwnProperty.call(counts,x.slot))return {status:'invalid_layout'};
    const next=(countById.get(id)||0)+1;
    if(next>(x.slot==='counter'?3:1))return {status:'duplicate_exceeds_slot_limit'};
    countById.set(id,next);counts[x.slot]++;
  }
  const limits=catalog.rules?.category_slots||{};
  if(equippedDecorIds.length>catalog.rules.max_equipped_total ||
    Object.entries(counts).some(([slot,qty])=>qty>(limits[slot]||0)))return {status:'slot_limit_exceeded'};
  if(!simulationMode){
    for(const [id,qty] of countById){
      if(!Number.isInteger(ownedDecorCounts[id])||ownedDecorCounts[id]<qty) return {status:'not_owned'};
    }
  }
  if(counts.tent!==1)return {status:'tent_required'};
  const effects=new Map();
  for(const id of equippedDecorIds){
    const x=byId.get(id);
    if(!x.effect)continue;
    const effect=x.effect.effect_id;
    // Signboards are targeted; combining unrelated categories is not one global Lv. 2.
    const target=effect==='popularity_up'?(x.series_id||'none'):'all';
    const key=effect+':'+target;
    const o=effects.get(key)||{effect_id:effect,target,equipped_level:0,item_count:0};
    o.equipped_level+=x.effect.level;
    o.item_count++;
    effects.set(key,o);
  }
  const types=new Map(catalog.effect_types.map(x=>[x.id,x]));
  const individual_effects=[...effects.values()].map(o=>{
    const cap=types.get(o.effect_id);
    return {
      ...o,
      effective_level:Math.min(o.equipped_level,cap?.max_level??o.equipped_level),
      max_level:cap?.max_level??null,
      capped:!!cap && o.equipped_level>cap.max_level
    };
  }).sort((a,b)=>String(a.effect_id+':'+a.target).localeCompare(String(b.effect_id+':'+b.target)));
  const tent=byId.get(equippedDecorIds.find(id=>byId.get(id).slot==='tent'));
  const activeSeriesId=tent.series_id;
  let series_summary={status:'not_applicable',series_id:activeSeriesId||null};
  if(activeSeriesId){
    const memberIds=equippedDecorIds.filter(id=>byId.get(id).series_id===activeSeriesId);
    const conflict=equippedDecorIds.some(id=>{
      const it=byId.get(id);
      return [121,122,123].includes(it.index) &&
        (activeSeriesId==='bug'||activeSeriesId==='forager');
    });
    if(conflict) {
      series_summary={
        status:'membership_source_conflict',
        series_id:activeSeriesId,
        known_count_lower_bound:memberIds.filter(id=>![121,122,123].includes(byId.get(id).index)).length,
      };
    } else {
      const series=catalog.series.find(x=>x.id===activeSeriesId);
      series_summary={
        status:series?'ok':'unknown_series',
        series_id:activeSeriesId,
        equipped_series_items:memberIds.length,
        applicable_category:series?.applies_to??null,
        active_bonus_tiers:(series?.bonus_tiers||[])
          .filter(t=>memberIds.length>=t.min_equipped)
          .map(t=>({
            min_equipped:t.min_equipped,effect_id:t.effect_id,
            bonus_pct:t.bonus_pct,
            ...(t.bonus_pct==null?{candidate_bonus_pct:t.candidate_bonus_pct}:{}),
            confidence:t.confidence
          }))
      };
    }
  }
  return {
    status:'ok',
    total_equipped:equippedDecorIds.length,
    slot_counts:counts,
    individual_effects,
    series_summary,
    has_unresolved_series_bonus:
      series_summary.status==='membership_source_conflict' ||
      (series_summary.active_bonus_tiers||[]).some(x=>x.bonus_pct==null)
  };
}

export function planDiscoveredDecorPurchases(catalog,{
  targetDecorIds=[],discoveredDecorIds=[],discoveredShopIds=[],currentBazaarRank=null
}={}) {
  const byId=catalogIndex(catalog),known=new Set(discoveredDecorIds),knownShops=new Set(discoveredShopIds);
  const ids=[...new Set(targetDecorIds)];
  if(ids.length===0)return {status:'empty_selection'};
  if(ids.some(id=>!known.has(id)||!byId.has(id)))return {status:'not_discovered'};
  const recs=ids.map(id=>byId.get(id));
  if(recs.some(x=>!['shop_purchase','sprite_exchange'].includes(x.acquisition.method)))return {status:'not_shop_purchase'};
  if(recs.some(x=>!knownShops.has(x.acquisition.shop_id)))return {status:'shop_not_discovered'};
  if(!Number.isInteger(currentBazaarRank)||currentBazaarRank<1)return {status:'rank_not_recorded'};
  if(recs.some(x=>(x.acquisition.rank_min||1)>currentBazaarRank))return {status:'rank_not_met'};
  if(recs.some(x=>x.acquisition.requires_purchased_item_id &&
      !known.has(x.acquisition.requires_purchased_item_id)))
    return {status:'prerequisite_not_discovered'};
  if(recs.some(x=>x.acquisition.price_confidence==='source_conflict' ||
      (x.acquisition.method==='shop_purchase' && !Number.isInteger(x.acquisition.price_g)))) {
    return {status:'price_unresolved',ids:recs.filter(x=>x.acquisition.price_confidence==='source_conflict'||
      (x.acquisition.method==='shop_purchase'&&!Number.isInteger(x.acquisition.price_g))).map(x=>x.id)};
  }
  let total_g=0,total_happy_energy=0;
  for(const x of recs){
    const a=x.acquisition;
    if(a.method==='shop_purchase')total_g+=a.price_g;
    else total_happy_energy+=a.cost;
  }
  return {
    status:'ok',item_count:recs.length,total_g,total_happy_energy,
    items:recs.map(x=>({
      id:x.id,name_ja:x.name_ja,currency:x.acquisition.currency,
      price:x.acquisition.method==='shop_purchase'?x.acquisition.price_g:x.acquisition.cost
    }))
  };
}
