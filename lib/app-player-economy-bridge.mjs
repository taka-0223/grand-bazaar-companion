/**
 * Read-only bridge from the application's schemaVersion=7 Player State to the
 * explicit-discovery Known Economy v0.2 adapter.
 *
 * The current crop screen stores SEEDS/SEEDLINGS/SPORES in seedCount, not
 * harvested crops. Goals' have/need are progress, NOT warehoused inventory.
 * Neither cash nor acquired inventory of harvested goods is stored app-wide.
 *
 * This module never mutates Player State, queries storage, or reveals unknown
 * Master catalog records. All additional facts require caller confirmation.
 */
import {createMasterResolver,adaptKnownGrandBazaarMaster} from './grand-bazaar-master-adapter.mjs';
import {compareGeneratedKnownPlans} from './known-economy-candidate-generator.mjs';
import {LEGACY_ECONOMY_PROCESS_CROSSWALK} from './legacy-economy-process-crosswalk.mjs';

const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const idOk=x=>typeof x==='string'&&x.length>0;
const allowedDomains=['entities','resource_items','animal_products',
  'animal_processed_goods','mushrooms','mushroom_spores',
  'windmill_items','cooking_recipes','flowers'];
const refKey=ref=>(ref && idOk(ref.domain) && idOk(ref.id)) ? ref.domain+':'+ref.id : null;
const keyRef=k=>{const i=typeof k==='string'?k.indexOf(':'):-1;
  return i<1?null:{domain:k.slice(0,i),id:k.slice(i+1)};};
const unique=rows=>[...new Set(rows)];
const validList=x=>Array.isArray(x)?x:[];

function itemFromAppId(master,resolver,id) {
  if(!idOk(id))return null;
  const keys=unique(allowedDomains.filter(domain=>
    validList(master[domain]).some(x=>x?.id===id)).map(domain=>
      resolver.canonical({domain,id})).filter(Boolean));
  return keys.length===1?keyRef(keys[0]):null;
}

function sourceToStoredPlantRef(master,resolver,id) {
  const ent=validList(master.entities).find(x=>x?.id===id);
  if(!ent)return null;
  if(['seed','seedling','flower_seed'].includes(ent.kind))
    return {domain:'entities',id};
  if(['fruit','crop'].includes(ent.kind)) {
    const relation=ent.kind==='fruit'?'fruit_to_seedling':'crop_to_seed';
    const goals=unique(validList(master.facts).filter(f=>
      f.type==='process' && f.attributes?.relation===relation &&
      validList(f.inputs).length===1 && f.inputs[0].entity===id &&
      f.inputs[0].qty===1).map(f=>f.output));
    if(goals.length!==1)return null;
    const next=validList(master.entities).find(x=>x.id===goals[0]);
    if(!next || !['seed','seedling','flower_seed'].includes(next.kind))return null;
    return {domain:'entities',id:goals[0]};
  }
  // A mushroom screen's "菌の数" refers to mushroom spores, not harvested fungi.
  if(ent.kind==='mushroom') {
    const next=validList(master.mushrooms).find(x=>x.id===id);
    const spore=validList(master.mushroom_spores).find(x=>
      x.id===next?.spore_id && x.mushroom_id===id);
    return spore?{domain:'mushroom_spores',id:spore.id}:null;
  }
  return null;
}

function verifiedProcessLink(master,resolver,link) {
  if(!link || !idOk(link.recipe_id) || !link.output_ref)return null;
  const row=validList(master.windmill_recipes).find(x=>x.id===link.recipe_id);
  if(!row)return null;
  const canonical=resolver.canonical(link.output_ref);
  if(!canonical || canonical!==resolver.canonical({
    domain:'windmill_items',id:row.output_item_id
  }))return null;
  return link;
}

function knownWindmillRecipeIds(master,resolver,state) {
  const known=new Set(),cross=LEGACY_ECONOMY_PROCESS_CROSSWALK;
  // The app stores legacy output IDs, not Master recipe IDs.
  // A PINNED mapping prevents appending hidden Master recipes from changing
  // the visibility, ranking or number of already-discovered candidates.
  for(const id of validList(state.knownProcesses)){
    const link=verifiedProcessLink(master,resolver,cross.process_output_links[id]);
    if(link)known.add(link.recipe_id);
  }
  for(const id of validList(state.knownFacts)){
    if(!validList(master.facts).some(f=>f.id===id))continue;
    const link=verifiedProcessLink(master,resolver,cross.known_fact_links[id]);
    if(link)known.add(link.recipe_id);
  }
  return [...known].sort();
}

function relatedGoalIsUnreviewed(master,resolver,state,inventoryKeys) {
  if(!inventoryKeys.size)return false;
  const active=validList(state.goals).filter(g=>
    !['done','someday','completed','archived'].includes(g?.status));
  const requirements=state.requirements||{};
  for(const goal of active){
    const rows=validList(requirements[goal.id]);
    for(const row of rows){
      if(!safeInt(row?.need))return true;
      if(row.need<=0)continue;
      if(row.targetType==='group'){
        const matches=validList(master.cooking_groups).filter(g=>
          g.id===row.targetId || g.source_group_id===row.targetId);
        // Unknown group memberships must not be optimistically declared unrelated.
        if(matches.length!==1 || !Array.isArray(matches[0].members))return true;
        for(const member of matches[0].members){
          const resolved=resolver.row(member) ? member :
            itemFromAppId(master,resolver,member.id);
          // Third-party group IDs must be bridged only by exact stable ID.
          // If an external member has no trustworthy local registry row,
          // never declare its possible inventory overlap impossible.
          if(!resolved)return true;
          if(inventoryKeys.has(resolver.canonical(resolved)))return true;
        }
      } else {
        const ref=itemFromAppId(master,resolver,row.targetId);
        if(!ref)return true;
        if(inventoryKeys.has(resolver.canonical(ref)))return true;
      }
    }
  }
  return false;
}

function activeRequestMaterialCommitments(state) {
  return validList(state.requests).some(r=>
    !['done','completed','archived'].includes(r?.status) &&
    validList(r?.objectives).some(o=>o.type==='item_quantity' &&
      (!safeInt(o.current)||o.current < o.target)));
}

function collectAutoStock(master,resolver,state,knownItemRefs) {
  const records=new Map();
  const encountered=new Set();
  const excluded=new Set();
  const explicitlyKnown=new Set(validList(state.knownEntities));
  for(const [appId,p] of Object.entries(state.playerState||{})){
    if(!explicitlyKnown.has(appId)||!p||!safeInt(p.seedCount))continue;
    // seedCount has no harvested-crop interpretation.
    const destination=sourceToStoredPlantRef(master,resolver,appId);
    const key=resolver.canonical(destination);
    if(!key){excluded.add('unmapped_seed_quantity');continue;}
    if(p.status==='processing'){
      excluded.add('processing_stock_excluded');continue;
    }
    if(p.status!=='stored' || p.location!=='warehouse'){
      excluded.add('storage_location_unconfirmed');continue;
    }
    // Duplicate aliases can describe the same batch. Never add them silently.
    if(encountered.has(key)){
      records.delete(key);
      excluded.add('duplicate_plant_stock_aliases');continue;
    }
    encountered.add(key);
    records.set(key,p.seedCount);
    knownItemRefs.push(destination);
    if(p.seedQuality!=null && p.seedQuality!==0.5)
      excluded.add('item_quality_not_reflected_in_baseline_prices');
  }
  return {records,excluded:[...excluded].sort()};
}

function applyExplicitQuantities(master,resolver,initial,rows) {
  const result=new Map(initial),assigned=new Set();
  for(const row of validList(rows)){
    const key=resolver.canonical(row?.ref);
    if(!key || !resolver.row(row.ref) || !resolver.record(key) ||
       !safeInt(row.quantity) || assigned.has(key))return null;
    assigned.add(key);
    // An explicit verified count overrides automatic seed-count mapping, not sum.
    result.set(key,row.quantity);
  }
  return result;
}

function knownItems(master,resolver,state,verified) {
  const refs=[];
  for(const id of validList(state.knownEntities)){
    const ref=itemFromAppId(master,resolver,id);
    if(ref)refs.push(ref);
  }
  for(const recipeId of validList(state.knownRecipes)){
    if(validList(master.cooking_recipes).some(r=>r.id===recipeId))
      refs.push({domain:'cooking_recipes',id:recipeId});
  }
  // Only outputs explicitly captured by the pinned legacy crosswalk may
  // become discovered. Never infer routes from all raw-Master outputs.
  for(const id of validList(state.knownProcesses)){
    const link=verifiedProcessLink(master,resolver,
      LEGACY_ECONOMY_PROCESS_CROSSWALK.process_output_links[id]);
    if(link)refs.push(link.output_ref);
  }
  for(const fId of validList(state.knownFacts)){
    const f=validList(master.facts).find(x=>x.id===fId);
    if(f?.output && f.type==='process' &&
      ['crop_to_seed','fruit_to_seedling'].includes(f.attributes?.relation)){
      const ent=validList(master.entities).find(x=>x.id===f.output);
      if(ent)refs.push({domain:'entities',id:ent.id});
    }
  }
  for(const ref of validList(verified.confirmed_discovered_item_refs))refs.push(ref);
  for(const x of validList(verified.confirmed_stock_rows))refs.push(x.ref);
  for(const x of validList(verified.confirmed_reserved_rows))refs.push(x.ref);
  for(const x of validList(verified.known_sale_quote_refs))refs.push(x);
  for(const x of validList(verified.observed_sale_quotes))refs.push(x.ref);
  for(const x of validList(verified.observed_shop_offers))refs.push(x.item_ref);
  for(const x of validList(verified.observed_growth_batches)){
    refs.push(x.seed_ref,x.produce_ref);
  }
  for(const x of validList(verified.observed_sale_sessions))refs.push(x.item_ref);
  return refs.filter(r=>resolver.canonical(r));
}

function preparedResponse(status,missing,notices,adapted,player=null) {
  return {status,missing:[...new Set(missing)],notices:[...new Set(notices)],
    adapted,player,
    basis:'baseline_only_with_explicit_confirmations',
    explanation:'No source of harvested inventory, cash balance or purchasing permission is inferred from app seed and goal records.'};
}

/**
 * Read-only materialization of a known-only Master view plus confirmed holdings.
 *
 * Required explicit configuration:
 *   scenario: {horizon_minutes,assumptions?,scenario_id?}
 *   verified: {cash_g,confirmed_stock_rows?,confirmed_reserved_rows?,
 *     known_sale_quote_refs?,known_shop_ids?,known_facility_ids?,
 *     known_resource_ids?,known_fact_ids?,available_route_ids?,
 *     resource_capacities?,review_goal_allocations?,review_request_materials?,
 *     confirm_baseline_only?}
 *
 * A diagnostic result is not a recommendation. No live Player State is edited.
 */
export function prepareAppKnownEconomy(master,appState,{
  scenario={},verified={}
}={}) {
  if(!appState || appState.schemaVersion!==7 ||
     !Array.isArray(appState.knownEntities) ||
     !Array.isArray(appState.knownRecipes) ||
     !Array.isArray(appState.knownProcesses) ||
     !appState.playerState || typeof appState.playerState!=='object')
    return {status:'unsupported_player_schema',missing:[],notices:[]};
  if(!safeInt(scenario?.horizon_minutes)||scenario.horizon_minutes===0)
    return {status:'scenario_not_confirmed',missing:[],notices:[]};

  const resolver=createMasterResolver(master);
  const autoKnown=knownItems(master,resolver,appState,verified);
  const auto=collectAutoStock(master,resolver,appState,autoKnown);
  const expanded=unique(autoKnown.map(resolver.canonical).filter(Boolean));
  const discovery={
    known_item_refs:expanded.map(keyRef),
    known_windmill_recipe_ids:knownWindmillRecipeIds(master,resolver,appState),
    known_cooking_recipe_ids:validList(appState.knownRecipes)
      .filter(id=>validList(master.cooking_recipes).some(r=>r.id===id) &&
        (verified.include_archived_recipes===true ||
          appState.recipeMeta?.[id]?.archived!==true)),
    known_sale_quote_refs:validList(verified.known_sale_quote_refs),
    known_shop_ids:validList(verified.known_shop_ids),
    known_facility_ids:validList(verified.known_facility_ids),
    known_resource_ids:validList(verified.known_resource_ids),
    known_fact_ids:validList(verified.known_fact_ids),
    observed_sale_quotes:validList(verified.observed_sale_quotes),
    observed_shop_offers:validList(verified.observed_shop_offers),
    observed_growth_batches:validList(verified.observed_growth_batches),
    observed_sale_sessions:validList(verified.observed_sale_sessions)
  };
  let adapted=adaptKnownGrandBazaarMaster(master,discovery,scenario);
  const missing=[],notices=[...auto.excluded];
  const stock=applyExplicitQuantities(master,resolver,auto.records,verified.confirmed_stock_rows);
  if(!stock)return {status:'explicit_inventory_invalid',missing:[],notices:[]};
  const reserved=applyExplicitQuantities(master,resolver,new Map(),verified.confirmed_reserved_rows);
  if(!reserved)return {status:'explicit_reservations_invalid',missing:[],notices:[]};

  if(verified.confirm_baseline_only!==true)missing.push('base_price_scenario_acknowledgement_required');
  if(!safeInt(verified.cash_g))missing.push('cash_balance_not_confirmed');
  if(!Array.isArray(verified.available_route_ids))missing.push('route_availability_not_confirmed');
  if(relatedGoalIsUnreviewed(master,resolver,appState,new Set(
    [...stock.entries()].filter(([,qty])=>qty>0).map(([k])=>k)
  )) && verified.review_goal_allocations!==true)missing.push('goal_allocations_need_review');
  if(activeRequestMaterialCommitments(appState)&&verified.review_request_materials!==true)
    missing.push('request_materials_need_review');

  const capacity=verified.resource_capacities||{};
  const knownAvailable=new Set(adapted.view.routes.map(x=>x.id));
  const selected=validList(verified.available_route_ids).filter(id=>knownAvailable.has(id));
  const usedResources=new Set(adapted.view.routes.filter(r=>selected.includes(r.id))
    .flatMap(r=>r.resource_usage.map(x=>x.resource_id)));
  if([...usedResources].some(id=>!safeInt(capacity[id])))missing.push('resource_capacity_not_confirmed');

  const player={
    cash_g:safeInt(verified.cash_g)?verified.cash_g:null,
    inventory:Object.fromEntries([...stock].sort(([a],[b])=>a.localeCompare(b))),
    reserved:Object.fromEntries([...reserved].sort(([a],[b])=>a.localeCompare(b))),
    // Most harvested items are not tracked in schemaVersion 7.
    inventory_is_complete:verified.confirm_all_inventory_recorded===true,
    available_route_ids:selected,
    resource_capacities:Object.fromEntries(Object.entries(capacity)
      .filter(([id,n])=>idOk(id)&&safeInt(n)).sort(([a],[b])=>a.localeCompare(b)))
  };
  const stockSet=new Set(Object.keys(player.inventory));
  if([...reserved].some(([id,qty])=>qty>(stock.get(id)??-1)))
    missing.push('reservation_exceeds_confirmed_stock');
  if(verified.confirm_all_inventory_recorded===true && !Array.isArray(verified.confirmed_stock_rows))
    missing.push('complete_inventory_claim_requires_explicit_rows');
  if(!missing.length) return preparedResponse('ready',missing,notices,adapted,player);
  return preparedResponse('needs_confirmation',missing,notices,adapted,player);
}

/** Focus is an explicitly disclosed item ref. Never search raw Master titles. */
export function compareAppKnownEconomy(master,appState,options={}) {
  const prepared=prepareAppKnownEconomy(master,appState,options);
  if(prepared.status!=='ready')return {
    status:prepared.status,missing:prepared.missing,notices:prepared.notices||[]
  };
  const resolver=createMasterResolver(master);
  const focus=resolver.canonical(options?.focus_ref);
  if(!focus || !prepared.adapted.view.items.some(i=>i.id===focus))
    return {status:'focus_not_discovered'};
  if(!Object.prototype.hasOwnProperty.call(prepared.player.inventory,focus))
    return {status:'focus_quantity_not_recorded'};
  // The bounded search prunes infeasible candidates. Check known, reachable
  // production routes BEFORE searching, or missing inventory could make the
  // do-nothing baseline appear to be a best recommendation.
  if(prepared.player.inventory_is_complete!==true){
    const available=new Set(prepared.player.available_route_ids);
    const production=prepared.adapted.view.routes.filter(r=>
      available.has(r.id) && ['process','cook','grow'].includes(r.kind));
    const reachable=new Set([focus]),related=new Set();
    for(let depth=0;depth<4;depth++){
      let extended=false;
      for(const r of production)if(r.inputs.some(x=>reachable.has(x.item_id))){
        related.add(r.id);
        for(const out of r.outputs)if(!reachable.has(out.item_id)){
          reachable.add(out.item_id);extended=true;
        }
      }
      if(!extended)break;
    }
    const unknown=production.filter(r=>related.has(r.id)).some(r=>
      [...r.inputs,...r.outputs].some(x=>
        !Object.prototype.hasOwnProperty.call(prepared.player.inventory,x.item_id)));
    if(unknown)return {
      status:'known_inventory_incomplete',
      missing:['inventory_quantities_for_known_routes_not_confirmed'],
      scope:'evaluated_known_candidates_only',basis:prepared.basis,
      notices:prepared.notices
    };
  }
  const result=compareGeneratedKnownPlans(prepared.adapted,prepared.player,{
    focus_item_id:focus,
    max_depth:options.max_depth||3,
    max_nodes:options.max_nodes||240,
    max_uses_per_route:options.max_uses_per_route||2
  });
  // A baseline-only winner must not become a misleading recommendation when
  // other DISCOVERED plans could not be compared because stock is unrecorded.
  if(result.status==='ok' && result.unranked?.some(x=>
      x.status==='inventory_quantity_not_recorded')) {
    return {status:'known_inventory_incomplete',
      missing:['inventory_quantities_for_known_routes_not_confirmed'],
      scope:'evaluated_known_candidates_only',basis:prepared.basis,
      notices:prepared.notices};
  }
  return {...result,basis:prepared.basis,notices:prepared.notices};
}
