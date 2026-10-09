/**
 * Deterministic BOUNDED sequential candidate search for explicitly known recipes.
 * Does not claim global optimality or optimal parallel scheduling.
 */
import {evaluateKnownPlan,compareKnownPlans} from './known-economy.mjs';

const compare=(a,b)=>a<b?-1:a>b?1:0;
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const gid=x=>typeof x==='string'&&x.length>0;

function touched(r){return new Set([...r.inputs,...r.outputs].map(x=>x.item_id));}
function relevantRoutes(view,focusItemId){
  const related=new Set([focusItemId]);
  // Discover potential outputs only from already disclosed recipes; no raw Master access.
  for(let pass=0;pass<4;pass++){
    let changed=false;
    for(const r of view.routes.filter(x=>x.kind==='process'||x.kind==='cook'||x.kind==='grow')){
      if(r.inputs.some(x=>related.has(x.item_id))){
        for(const x of r.outputs)if(!related.has(x.item_id)){related.add(x.item_id);changed=true;}
      }
    }
    if(!changed)break;
  }
  const linked=view.routes.filter(r=>['process','cook','grow','sell'].includes(r.kind)&&
    r.inputs.some(x=>related.has(x.item_id)));
  // Buying an input to a focus-relevant recipe is allowed, but buying an unrelated
  // product must not dominate a recommendation about the focus item.
  const needed=new Set(linked.flatMap(r=>r.inputs.map(x=>x.item_id)));
  const buys=view.routes.filter(r=>r.kind==='buy'&&r.outputs.some(x=>needed.has(x.item_id)));
  return [...linked,...buys].sort((a,b)=>compare(a.id,b.id));
}

/**
 * Caller must pass already projected `known` view (never the raw catalog).
 * Candidate search enumerates sequential actions; step t+1 starts at completion of t.
 * max_nodes bounds runtime. If it truncates, no full-coverage claim is made.
 */
export function generateKnownSequentialCandidates(view,player,scenario,{
  focus_item_id,
  max_depth=3,
  max_nodes=240,
  max_uses_per_route=2,
}={}){
  if(!view||view.scope!=='known_facts_only'||!Array.isArray(view.routes))
    return {status:'known_view_required'};
  if(!view.items.some(x=>x.id===focus_item_id))return {status:'not_available_in_known_scope'};
  if(!player?.inventory || !Object.prototype.hasOwnProperty.call(player.inventory,focus_item_id))
    return {status:'focus_quantity_not_recorded'};
  if(!valid(player.inventory[focus_item_id])||player.inventory[focus_item_id]<1)
    return {status:'no_usable_focus_stock'};
  if(!valid(max_depth)||max_depth>5||!valid(max_nodes)||max_nodes===0||
     !valid(max_uses_per_route)||max_uses_per_route===0)
    return {status:'invalid_search_budget'};
  const knownAvailable=new Set(player.available_route_ids||[]);
  const routes=relevantRoutes(view,focus_item_id).filter(x=>knownAvailable.has(x.id));
  const base={id:'candidate:baseline',actions:[]};
  let frontier=[{actions:[],clock:0}],checked=0,truncated=false;
  const plans=[base];
  const seen=new Set(['']);
  outer:for(let depth=1;depth<=max_depth;depth++){
    const next=[];
    for(const node of frontier){
      for(const route of routes){
        if(checked>=max_nodes){truncated=true;break outer;}
        const count=node.actions.filter(x=>x.route_id===route.id).length;
        if(count>=max_uses_per_route)continue;
        const actions=[...node.actions,{route_id:route.id,start_minute:node.clock}];
        const key=actions.map(a=>a.route_id).join('|');
        if(seen.has(key))continue;
        seen.add(key);checked++;
        const result=evaluateKnownPlan(view,player,{id:'candidate:'+key,actions},scenario);
        if(!['ok','valuation_incomplete'].includes(result.status))continue;
        const newClock=node.clock+route.duration_minutes;
        if(!valid(newClock)||newClock>scenario.horizon_minutes)continue;
        const record={actions,clock:newClock};
        next.push(record);
        plans.push({id:'candidate:'+key,actions});
      }
    }
    frontier=next;
    if(!frontier.length)break;
  }
  return {status:'ok',scope:'bounded_known_sequential_candidates',
    coverage:truncated?'truncated_known_search':'depth_bounded_not_global',
    generated_known_candidates:plans.length,
    plans};
}

export function compareGeneratedKnownPlans(adapted,player,opts={}){
  if(!adapted?.catalog||!adapted.knowledge||!adapted.view||!adapted.scenario)
    return {status:'adapted_catalog_required'};
  const candidates=generateKnownSequentialCandidates(adapted.view,player,adapted.scenario,opts);
  if(candidates.status!=='ok')return {status:candidates.status};
  const compared=compareKnownPlans(adapted.catalog,adapted.knowledge,
    player,candidates.plans,adapted.scenario);
  return {...compared,search_scope:candidates.scope,
    coverage:candidates.coverage,generated_known_candidates:candidates.generated_known_candidates,
    optimum_guarantee:'none; sequential search is limited to disclosed candidates and search budget'};
}