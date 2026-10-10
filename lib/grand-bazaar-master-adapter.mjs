/**
 * A conservative bridge from the Japanese Grand Bazaar Master to the v0.1 economy kernel.
 * No raw Master enumeration, names, or diagnostic counts escape without caller disclosure.
 *
 * This is a BASE-PRICE scenario adapter, NOT a quality/star/value prediction engine.
 * Input and output item IDs are explicit domain-qualified canonical Master refs.
 */
import {projectKnownEconomy} from './known-economy.mjs';

const int = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => Number.isSafeInteger(n) && n > 0;
const isId = x => typeof x === 'string' && x.length > 0;
const own = (x,k)=>Object.prototype.hasOwnProperty.call(x||{},k);
const keyOf = r => r && isId(r.domain) && isId(r.id) ? `${r.domain}:${r.id}` : null;
const idRef = key => {const i=String(key).indexOf(':');return i<1?null:{domain:String(key).slice(0,i),id:String(key).slice(i+1)};};
const deDupe = a=>[...new Set(a)].sort();
const wholeWindow = horizon => [{start:0,end:horizon}];
// Reviewed duplicate IDs in the old crop registry and the new mushroom Master.
// Only these fixed, matching records are equivalent; never join by name alone
// or auto-discover future mushrooms from newly added Master records.
const PINNED_MUSHROOM_ENTITY_ALIASES = new Set([
  'shiitake_mushroom','shimeji_mushroom','common_mushroom'
]);

/**
 * Resolve explicit canonical_ref edges plus three independently reviewed,
 * ID-validated old crop/mushroom duplicates. Never infer equivalence merely
 * by matching Japanese names or by scanning newly discovered products.
 */
export function createMasterResolver(master) {
  const nested=master?.meta?.request_master?.reference_catalog?.entities||[];
  const index=new Map();
  for(const [domain,rows] of Object.entries(master||{})) {
    if(!Array.isArray(rows))continue;
    // Duplicated IDs are not fatal until they touch an actually disclosed record.
    index.set(domain,new Map(rows.filter(x=>isId(x?.id)).map(x=>[x.id,x])));
  }
  index.set('request_reference_catalog',new Map(nested.map(x=>[x.id,x])));
  function row(ref){return index.get(ref?.domain)?.get(ref?.id)||null;}
  function canonical(ref) {
    if(!keyOf(ref))return null;
    const seen=new Set();let current={domain:ref.domain,id:ref.id};
    for(let i=0;i<5;i++) {
      const k=keyOf(current),r=row(current);
      if(seen.has(k))return null;
      seen.add(k);
      const mushroom=row({domain:'mushrooms',id:current.id});
      const reviewedAlias=current.domain==='entities' &&
        PINNED_MUSHROOM_ENTITY_ALIASES.has(current.id) &&
        r?.kind==='mushroom' && mushroom?.id===current.id &&
        typeof r.name_ja==='string' && r.name_ja===mushroom.name_ja;
      const c=r?.canonical_ref ||
        (reviewedAlias?{domain:'mushrooms',id:current.id}:null);
      if(!keyOf(c))break;
      // Do not redirect to external registries absent from this embedded Master.
      if(!row(c))break;
      current={domain:c.domain,id:c.id};
    }
    return keyOf(current);
  }
  return {row,canonical,record:(key)=>{const r=idRef(key);return r?row(r):null;}};
}

function priceFrom(row){
  if(!row)return null;
  const candidates=[row.base_sell_price,row.attributes?.base_price_star_0_5,row.attributes?.price,row.sell_price];
  const v=candidates.find(x=>Number.isFinite(x)&&x>=0);
  return v===undefined?null:v;
}
function estimateBaseSale(master,resolver,ref,disclosedAliases){
  const canonical=resolver.canonical(ref);if(!canonical)return null;
  const r=idRef(canonical);
  const prices=[];
  const original=resolver.row(ref),source=resolver.row(r);
  if(original&&priceFrom(original)!==null)prices.push(priceFrom(original));
  if(source&&priceFrom(source)!==null)prices.push(priceFrom(source));
  // Only declared, observed alias sources are eligible. A hidden row added to
  // the raw Master cannot affect pricing for an already known item.
  for(const alias of disclosedAliases||[]) {
    const row=resolver.row(alias);
    if(row && resolver.canonical(alias)===canonical && priceFrom(row)!==null)
      prices.push(priceFrom(row));
  }
  const unique=deDupe(prices);
  // Conflicting known baseline values should never silently be treated as the same quote.
  return unique.length===1?unique[0]:null;
}

function distributions(members,quantity,limit){
  if(!positive(quantity)||!members.length)return [];
  const out=[];
  const slots=new Array(members.length).fill(0);
  function walk(index,remaining){
    if(out.length>=limit)return;
    if(index===members.length-1){
      slots[index]=remaining;
      out.push(slots.map((quantity,i)=>({item_id:members[i],quantity})).filter(x=>x.quantity));
      return;
    }
    for(let n=remaining;n>=0;n--){slots[index]=n;walk(index+1,remaining-n);if(out.length>=limit)break;}
  }
  walk(0,quantity);
  return out;
}
function fold(inputs) {
  const map=new Map();
  for(const a of inputs)map.set(a.item_id,(map.get(a.item_id)||0)+a.quantity);
  return [...map].map(([item_id,quantity])=>({item_id,quantity})).sort((a,b)=>a.item_id.localeCompare(b.item_id));
}
function combinations(choices,max){
  const output=[];
  function walk(i,selected){
    if(output.length>=max)return;
    if(i===choices.length){output.push(fold(selected));return;}
    for(const option of choices[i]){
      walk(i+1,[...selected,...option]);
      if(output.length>=max)return;
    }
  }
  walk(0,[]);
  return output;
}
function variantKey(inputs){
  // Stable across discovery changes: based on the explicit chosen canonical item IDs.
  return inputs.map(x=>`${encodeURIComponent(x.item_id)}~${x.quantity}`).join('+')||'empty';
}

/**
 * Discovery is explicit and independent by entity, recipe, item quote, shop and equipment.
 * - known_item_refs: [{domain,id}]
 * - known_windmill_recipe_ids, known_cooking_recipe_ids: real discoveries, not implicit.
 * - known_sale_quote_refs: items whose baseline sale prices the player has seen.
 * - observed_sale_quotes: [{ref,unit_sell_g}] override for seen lot-specific prices.
 * - observed_shop_offers: [{id,shop_id,item_ref,quantity,price_g,max_uses}], verified by player.
 * - observed_growth_batches: [{id,seed_ref,produce_ref,seed_quantity,produce_quantity,
 *     duration_minutes,field_units,effort_actions,availability_windows}].
 * - observed_sale_sessions: [{id,shop_id,item_ref,quantity,unit_sell_g,availability_windows}].
 * - known_shop_ids / known_facility_ids / known_resource_ids / known_fact_ids.
 *
 * assumptions are OPT-IN: baseline wind time, windmill no-G-fee, cooking instant/no fee/output1.
 */
export function adaptKnownGrandBazaarMaster(master, discovery={}, config={}) {
  if(!master||!Array.isArray(master.windmill_items)||!Array.isArray(master.windmill_recipes)||
     !Array.isArray(master.cooking_recipes)||!Array.isArray(master.cooking_groups))
     throw new TypeError('Grand Bazaar Master domains not available');
  const horizon=config.horizon_minutes;
  if(!int(horizon)||horizon===0)throw new TypeError('Positive integer horizon_minutes required');
  const resolver=createMasterResolver(master);
  const knownCanonical=new Set((discovery.known_item_refs||[]).map(resolver.canonical).filter(Boolean));
  const knownShopIds=new Set(discovery.known_shop_ids||[]);
  const knownFacilityIds=new Set(discovery.known_facility_ids||[]);
  const knownResourceIds=new Set(discovery.known_resource_ids||[]);
  const knownFacts=new Set(discovery.known_fact_ids||[]);
  const assets=[];
  for(const id of [...knownCanonical].sort()) {
    const rec=resolver.record(id);
    if(rec)assets.push({id,name_ja:String(rec.name_ja||id)});
  }
  const known=new Set(assets.map(x=>x.id));
  const quotes=[];
  const scenarioId=String(config.scenario_id||'base_master_same_sale_context');
  const observed=new Map();
  for(const record of discovery.observed_sale_quotes||[]) {
    const id=resolver.canonical(record.ref);
    if(id&&known.has(id)&&Number.isFinite(record.unit_sell_g)&&record.unit_sell_g>=0)
      observed.set(id,record.unit_sell_g);
  }
  const knownQuoteRefs=discovery.known_sale_quote_refs||[];
  const knownQuoteKeys=new Set(knownQuoteRefs.map(resolver.canonical).filter(Boolean));
  for(const id of deDupe([...knownQuoteKeys,...observed.keys()])){
    if(!known.has(id))continue;
    const ref=idRef(id),price=observed.has(id)?observed.get(id):estimateBaseSale(master,resolver,ref,knownQuoteRefs.filter(x=>resolver.canonical(x)===id));
    quotes.push({id:`quote:${id}`,item_id:id,scenario_id:scenarioId,unit_sell_g:price,
      requires_fact_ids:[],confidence:price===null?'unconfirmed':'confirmed'});
  }
  const recipes=new Map(master.windmill_recipes.map(x=>[x.id,x]));
  const windmillById=new Map(master.windmill_items.map(x=>[x.id,x]));
  const windGroups=new Map((master.windmill_groups||[]).map(x=>[x.id,x]));
  const cookRecipes=new Map(master.cooking_recipes.map(x=>[x.id,x]));
  const cookGroups=new Map(master.cooking_groups.map(x=>[x.id,x]));
  const knownRoutes=[];
  const warnings=[];
  const settings=config.assumptions||{};
  const maxVariants=positive(config.max_variants_per_recipe)?Math.min(config.max_variants_per_recipe,96):24;
  const processReady=settings.baseline_wind_time_confirmed===true && settings.no_windmill_fee_confirmed===true;
  const cookReady=int(settings.cooking_duration_minutes)&&
      settings.no_cooking_fee_confirmed===true && settings.cooking_output_is_one===true;
  // A legacy cooking-group member can refer to the already-discovered
  // porcini by an external registry ID. Only this fixed, reviewed pair is
  // bridged; newly added same-name items may not become discovered.
  function reviewedGroupIngredient(ref){
    if(ref?.domain!=='rickychiki.ingredients'||
       ref.id!=='porcini_mushroom'||ref.name_ja!=='ポルチーニ')return ref;
    const mushroom=resolver.row({domain:'mushrooms',id:'porcini_mushroom'});
    if(mushroom?.name_ja!==ref.name_ja)return ref;
    return {domain:'mushrooms',id:'porcini_mushroom'};
  }
  const isKnown=(ref)=>{
    const checked=reviewedGroupIngredient(ref);
    const key=resolver.canonical(checked);
    // A valid internal record AND an explicit player discovery are both needed.
    return resolver.row(checked)&&key&&known.has(key)?key:null;
  };
  function choiceSlot(slot,groupRows){
    const n=slot.quantity;
    if(!positive(n))return null;
    if(slot.type==='item'){
      const id=isKnown(slot.ref);
      return id?[[{item_id:id,quantity:n}]]:null;
    }
    if(slot.type==='group'){
      const g=groupRows.get(slot.group_id);
      if(!g||!Array.isArray(g.members))return null;
      const members=deDupe(g.members.map(v=> {
        if(typeof v==='string')return isKnown({domain:'windmill_items',id:v});
        return isKnown(v);
      }).filter(Boolean));
      return members.length?distributions(members,n,maxVariants):null;
    }
    return null;
  }
  function addRoute(route,meta){
    if(!known.has(route.outputs[0]?.item_id)||!route.inputs.every(x=>known.has(x.item_id)))return;
    route.meta=meta;
    knownRoutes.push(route);
  }
  for(const recipeId of deDupe(discovery.known_windmill_recipe_ids||[])) {
    const r=recipes.get(recipeId);if(!r)continue; // No hidden error messages.
    const fac=`windmill:${r.windmill}`;
    if(!knownFacilityIds.has(fac)||!knownResourceIds.has(fac))continue;
    if(r.requires_purple_wonderstone&&!knownFacts.has('capability:purple_wonderstone'))continue;
    const out=isKnown({domain:'windmill_items',id:r.output_item_id});
    if(!out||!positive(r.output_quantity))continue;
    const slots=(r.inputs||[]).map(v=>v.type==='item'?
       choiceSlot({type:'item',ref:{domain:'windmill_items',id:v.item_id},quantity:v.quantity},windGroups):
       choiceSlot(v,windGroups));
    if(slots.some(x=>!x?.length))continue;
    const vars=combinations(slots,maxVariants);
    for(const inputs of vars){
      const dur=r.base_processing_minutes;
      const route={id:`windmill:${recipeId}:${variantKey(inputs)}`,
        name_ja:`${windmillById.get(r.output_item_id)?.name_ja||'加工'}を作る`,kind:'process',
        inputs,outputs:[{item_id:out,quantity:r.output_quantity}],
        cash_cost_g:settings.no_windmill_fee_confirmed?0:null,cash_receipts_g:0,
        duration_minutes:dur,effort_actions:1,max_uses:null,
        availability_windows:wholeWindow(horizon),resource_usage:[{
          resource_id:fac,units:1,duration_minutes:dur}],facility_id:fac,requires_fact_ids:[],
        confidence:processReady&&r.provenance?.confidence==='confirmed'&&positive(dur)?'confirmed':'unconfirmed'};
      if(!processReady)warnings.push({code:'windmill_assumption_required',recipe_id:recipeId});
      addRoute(route,{master_domain:'windmill_recipes',master_id:r.id});
    }
  }
  for(const recipeId of deDupe(discovery.known_cooking_recipe_ids||[])) {
    const r=cookRecipes.get(recipeId);if(!r)continue;
    const fac=r.required_utensil==='none'?'kitchen':'kitchen:'+r.required_utensil;
    if(!knownFacilityIds.has(fac))continue;
    const out=isKnown({domain:'cooking_recipes',id:recipeId});
    if(!out)continue;
    const slots=(r.required_slots||[]).map(s=>choiceSlot(s,cookGroups));
    if(slots.some(s=>!s?.length))continue;
    const vars=combinations(slots,maxVariants);
    for(const inputs of vars){
      const duration=int(settings.cooking_duration_minutes)?settings.cooking_duration_minutes:null;
      const route={id:`cook:${recipeId}:${variantKey(inputs)}`,name_ja:`${r.name_ja}を料理する`,
        kind:'cook',inputs,outputs:[{item_id:out,quantity:1}],
        cash_cost_g:settings.no_cooking_fee_confirmed?0:null,cash_receipts_g:0,
        duration_minutes:duration,effort_actions:1,max_uses:null,
        availability_windows:wholeWindow(horizon),resource_usage:[],facility_id:fac,
        requires_fact_ids:[],confidence:cookReady&&r.provenance?.confidence==='confirmed'?'confirmed':'unconfirmed'};
      if(!cookReady)warnings.push({code:'cooking_assumption_required',recipe_id:recipeId});
      addRoute(route,{master_domain:'cooking_recipes',master_id:r.id});
    }
  }
  for(const offer of discovery.observed_shop_offers||[]) {
    if(!isId(offer?.id)||!isId(offer.shop_id)||!knownShopIds.has(offer.shop_id))continue;
    const item=isKnown(offer.item_ref);
    if(!item || !positive(offer.quantity))continue;
    const cost=Number.isFinite(offer.price_g)&&offer.price_g>=0?offer.price_g:null;
    const route={id:`buy:${offer.id}`,name_ja:'確認済みの商品を購入',kind:'buy',
      inputs:[],outputs:[{item_id:item,quantity:offer.quantity}],
      cash_cost_g:cost,cash_receipts_g:0,duration_minutes:0,effort_actions:1,
      max_uses:int(offer.max_uses)?offer.max_uses:null,shop_id:offer.shop_id,
      availability_windows:wholeWindow(horizon),resource_usage:[],requires_fact_ids:[],
      confidence:cost===null?'unconfirmed':'confirmed'};
    addRoute(route,{master_domain:'observed_shop_offer',master_id:offer.id});
  }
  for(const grow of discovery.observed_growth_batches||[]) {
    if(!isId(grow?.id)||!knownFacilityIds.has('field')||!knownResourceIds.has('field'))continue;
    const seed=isKnown(grow.seed_ref),produce=isKnown(grow.produce_ref);
    if(!seed||!produce||!positive(grow.seed_quantity)||!positive(grow.produce_quantity))continue;
    const dur=grow.duration_minutes;
    const windows=grow.availability_windows;
    if(!positive(dur)||!Array.isArray(windows)||!windows.length||
       !windows.every(w=>int(w.start)&&int(w.end)&&w.end>=w.start))continue;
    const rec={id:`grow:${grow.id}`,name_ja:'記録済みの栽培バッチ',kind:'grow',
      inputs:[{item_id:seed,quantity:grow.seed_quantity}],
      outputs:[{item_id:produce,quantity:grow.produce_quantity}],
      cash_cost_g:0,cash_receipts_g:0,duration_minutes:dur,
      effort_actions:int(grow.effort_actions)?grow.effort_actions:null,
      max_uses:int(grow.max_uses)?grow.max_uses:null,
      availability_windows:windows.map(x=>({start:x.start,end:x.end})),
      resource_usage:[{resource_id:'field',units:positive(grow.field_units)?grow.field_units:1,
        duration_minutes:dur}],facility_id:'field',requires_fact_ids:[],
      confidence:grow.observed_and_confirmed===true&&int(grow.effort_actions)?'confirmed':'unconfirmed'};
    addRoute(rec,{master_domain:'observed_growth_batch',master_id:grow.id});
  }
  for(const sale of discovery.observed_sale_sessions||[]) {
    if(!isId(sale?.id)||!isId(sale.shop_id)||!knownShopIds.has(sale.shop_id))continue;
    const item=isKnown(sale.item_ref);
    if(!item||!positive(sale.quantity))continue;
    const price=sale.unit_sell_g,windows=sale.availability_windows;
    const route={id:`sell:${sale.id}`,name_ja:'確認済みの売却',kind:'sell',
      inputs:[{item_id:item,quantity:sale.quantity}],outputs:[],
      cash_cost_g:0,cash_receipts_g:Number.isFinite(price)&&price>=0?price*sale.quantity:null,
      duration_minutes:0,effort_actions:1,
      max_uses:int(sale.max_uses)?sale.max_uses:null,shop_id:sale.shop_id,
      availability_windows:Array.isArray(windows)?windows.map(x=>({start:x.start,end:x.end})):null,
      resource_usage:[],requires_fact_ids:[],
      confidence:Number.isFinite(price)&&price>=0&&Array.isArray(windows)&&windows.length>0&&
        sale.observed_and_confirmed===true?'confirmed':'unconfirmed'};
    // Sell routes have no output, unlike buy/process/cook. Do not use addRoute.
    if(known.has(item))knownRoutes.push({...route,meta:{master_domain:'observed_sale_session',master_id:sale.id}});
  }
  const uniqueRoutes=new Map(knownRoutes.map(x=>[x.id,x]));
  // Deterministic sanitized projection. Filtering by discovered IDs happens BEFORE comparison.
  const routeRows=[...uniqueRoutes.values()].map(({meta,...r})=>r);
  const catalog={items:assets,quotes,routes:routeRows};
  const knowledge={item_ids:assets.map(x=>x.id),route_ids:routeRows.map(x=>x.id),
    quote_ids:quotes.map(x=>x.id),shop_ids:[...knownShopIds],
    facility_ids:[...knownFacilityIds],resource_ids:[...knownResourceIds],fact_ids:[...knownFacts]};
  const view=projectKnownEconomy(catalog,knowledge);
  // Visible diagnostic codes are free of undiscovered counts/labels.
  return {catalog,knowledge,view,scenario:{id:scenarioId,horizon_minutes:horizon,
      terminal_valuation:'full_sale_at_known_quotes'},
    basis:observed.size?'observed_and_base_prices':'master_base_prices_only',
    disclaimer:'Confirmed baseline input/output assumptions, not a quality- or weather-adjusted profit guarantee.'};
}

/** Explicit inventory bridge for tests/early integration only; do not infer Player State discovery. */
export function adaptExplicitInventory(master,stockRows=[],reservedRows=[],resolver=createMasterResolver(master)){
  const inventory={},reserved={};
  for(const [target,rows] of [[inventory,stockRows],[reserved,reservedRows]]){
    for(const x of rows){
      const key=resolver.canonical(x.ref);
      if(!key || !int(x.quantity))throw new TypeError('Invalid inventory ref/quantity');
      target[key]=(target[key]||0)+x.quantity;
    }
  }
  return {inventory,reserved};
}