/**
 * Known Economy v0.4: spoiler-safe checklist for a selected, already-known item.
 * Returns UI input requirements; does not load player storage or run a search.
 */
import {prepareAppKnownEconomy} from './app-player-economy-bridge.mjs';
import {createMasterResolver} from './grand-bazaar-master-adapter.mjs';

const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
const productive=new Set(['process','cook','grow']);
const fields={
  base_price_scenario_acknowledgement_required:'confirm_baseline_only',
  cash_balance_not_confirmed:'cash_g',
  route_availability_not_confirmed:'available_route_ids',
  resource_capacity_not_confirmed:'resource_capacities',
  goal_allocations_need_review:'review_goal_allocations',
  request_materials_need_review:'review_request_materials',
  reservation_exceeds_confirmed_stock:'confirmed_reserved_rows',
  complete_inventory_claim_requires_explicit_rows:'confirmed_stock_rows'
};
const refFromKey=key=>{
  const n=key.indexOf(':');
  return n>0?{domain:key.slice(0,n),id:key.slice(n+1)}:null;
};
const closed=status=>({version:'v0.4',status,can_compare:false,
  scope:'discovered_known_only',focus:null,missing:[],route_choices:[],
  read_only:true});

/** Operate ONLY on already-disclosed routes, never scan the raw Master. */
function relevant(routes,focus){
  const work=routes.filter(r=>productive.has(r.kind));
  const reached=new Set([focus]);
  for(let i=0;i<4;i++){
    let changed=false;
    for(const r of work)if(r.inputs.some(x=>reached.has(x.item_id)))
      for(const x of r.outputs)if(!reached.has(x.item_id)){
        reached.add(x.item_id);changed=true;
      }
    if(!changed)break;
  }
  const selected=work.filter(r=>r.inputs.some(x=>reached.has(x.item_id)));
  const needed=new Set([focus,...selected.flatMap(r=>r.inputs.map(x=>x.item_id))]);
  const other=routes.filter(r=>
    (r.kind==='buy'&&r.outputs.some(x=>needed.has(x.item_id)))||
    (r.kind==='sell'&&r.inputs.some(x=>reached.has(x.item_id))));
  return [...selected,...other].sort((a,b)=>a.id.localeCompare(b.id));
}

export function inspectAppKnownEconomyInputs(master,appState,options={}){
  const verified=options.verified||{};
  const prepared=prepareAppKnownEconomy(master,appState,{
    scenario:options.scenario||{},verified
  });
  if(!prepared.adapted?.view||!prepared.player)return closed(prepared.status);
  const view=prepared.adapted.view;
  const names=new Map(view.items.map(x=>[x.id,x.name_ja]));
  const focus=options.focus_ref?
    createMasterResolver(master).canonical(options.focus_ref):null;
  if(options.focus_ref&&!names.has(focus))return closed('focus_not_discovered');
  if(!focus)return {...closed('focus_required'),
    known_item_choices:view.items.map(x=>({item_id:x.id,label_ja:x.name_ja}))};

  const missing=[],seen=new Set();
  function add(code,field=fields[code]||null,detail={}){
    const key=code+'|'+(detail.item_id||'');
    if(seen.has(key))return;
    seen.add(key);missing.push({code,field,...detail});
  }
  for(const code of prepared.missing||[])add(code);
  // Omission is not the same as a player-confirmed empty list.
  if(!Array.isArray(verified.known_facility_ids))
    add('facility_access_not_confirmed','known_facility_ids');
  if(!Array.isArray(verified.known_resource_ids))
    add('resource_access_not_confirmed','known_resource_ids');

  const routeChoices=relevant(view.routes,focus);
  const allRouteIds=new Set(view.routes.map(r=>r.id));
  const selected=Array.isArray(verified.available_route_ids)?
    verified.available_route_ids:[];
  if(selected.some(id=>!allRouteIds.has(id)))
    add('route_selection_needs_review','available_route_ids');
  const selectedIds=new Set(selected);
  const evaluated=relevant(view.routes.filter(r=>selectedIds.has(r.id)),focus);
  if(evaluated.some(r=>r.confidence!=='confirmed'))
    add('known_route_cost_time_or_availability_not_confirmed','scenario.assumptions');

  const itemIds=new Set([focus,...evaluated.flatMap(r=>
    [...r.inputs,...r.outputs].map(x=>x.item_id))]);
  const quoteIds=new Set(view.quotes.filter(q=>
    q.confidence==='confirmed'&&
    q.scenario_id===prepared.adapted.scenario.id&&
    Number.isFinite(q.unit_sell_g)&&q.unit_sell_g>=0).map(q=>q.item_id));
  for(const id of [...itemIds].sort()){
    if(!names.has(id))continue;
    const detail={item_id:id,ref:refFromKey(id),label_ja:names.get(id)};
    if(!own(prepared.player.inventory,id)&&
       (id===focus||prepared.player.inventory_is_complete!==true))
      add('known_stock_quantity_not_confirmed','confirmed_stock_rows',detail);
    if(!quoteIds.has(id))
      add('known_sale_price_not_confirmed','known_sale_quote_refs',detail);
  }
  return {version:'v0.4',status:missing.length?'needs_confirmation':'ready_for_bounded_comparison',
    can_compare:missing.length===0,scope:'discovered_known_only',
    focus:{item_id:focus,label_ja:names.get(focus)},
    route_choices:routeChoices.map(r=>({route_id:r.id,label_ja:r.name_ja,
      kind:r.kind,selected:selectedIds.has(r.id)})),
    missing,notices:prepared.notices||[],read_only:true,
    guarantee:'Bounded known-route comparison only, not global optimization.'};
}
